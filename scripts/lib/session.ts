import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type CDPSession, type Page } from "playwright";
import { build, preview } from "vite";
import type { TextItem, Video } from "../../src/engine/index.ts";
import { ROOT } from "./videos.ts";

export type Session = {
  browser: Browser;
  url: string;
  /** A capture page for one video, at its exact size, ready to seek. `thumbnail` shows its cover image. Close it when done. */
  open(video: Video, options?: { thumbnail?: boolean }): Promise<Page>;
  close(): Promise<void>;
};

type PageState = { cdp: CDPSession; video: Video; errors: Error[] };
const pages = new WeakMap<Page, PageState>();

/** Builds the site once, serves it, and starts Chromium. Each call gets its own build, so scripts can run side by side. */
export async function openSession(): Promise<Session> {
  const outDir = join(ROOT, "out", ".build", String(process.pid));
  await build({ root: ROOT, logLevel: "warn", build: { outDir, emptyOutDir: true } });
  const server = await preview({ root: ROOT, logLevel: "warn", build: { outDir }, preview: { port: 0, open: false } });
  const url = server.resolvedUrls!.local[0];
  const browser = await chromium.launch({
    // --disable-partial-raster: far fewer anti-aliased pixels depend on the seek order, though not none (validate.ts).
    args: [
      "--force-color-profile=srgb",
      "--font-render-hinting=none",
      "--disable-lcd-text",
      "--disable-partial-raster",
    ],
  });

  return {
    browser,
    url,
    async open(video, { thumbnail = false } = {}) {
      const page = await browser.newPage({ viewport: { width: video.width, height: video.height }, deviceScaleFactor: 1 });
      const state: PageState = { cdp: await page.context().newCDPSession(page), video, errors: [] };
      pages.set(page, state);
      page.on("pageerror", (error) => state.errors.push(error));
      await page.goto(`${url}capture.html?id=${encodeURIComponent(video.id)}${thumbnail ? "&thumbnail" : ""}`);
      await Promise.race([
        page.waitForFunction(() => window.nykma !== undefined),
        new Promise((_, reject) => {
          page.once("pageerror", (error) => reject(new Error(`${video.id} failed to mount: ${error.message}`)));
        }),
      ]);
      return page;
    },
    async close() {
      await browser.close();
      await new Promise((done) => server.httpServer.close(done));
      rmSync(outDir, { recursive: true, force: true });
    },
  };
}

function stateOf(page: Page) {
  const state = pages.get(page);
  if (!state) throw new Error("that page didn't come from session.open(video)");
  return state;
}

export async function seek(page: Page, frame: number) {
  const { errors, video } = stateOf(page);
  await page.evaluate((f) => window.nykma.seek(f), frame).catch((error) => {
    if (!errors.length) throw error; // Otherwise the ad's own error, below, says more.
  });
  if (errors.length) throw new Error(`${video.id} frame ${frame}: ${errors[0].message}`);
}

/** Seeks and screenshots. `scale` shrinks the picture (the reviewer's low-res pass, contact sheets). */
export async function captureFrame(page: Page, frame: number, { path, scale = 1 }: { path?: string; scale?: number } = {}) {
  await seek(page, frame);
  const { cdp, video } = stateOf(page);
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    optimizeForSpeed: true,
    clip: { x: 0, y: 0, width: video.width, height: video.height, scale },
  });
  const png = Buffer.from(data, "base64");
  if (path) writeFileSync(path, png);
  return png;
}

/** The visible text on a frame, with `rendered` filled in from what Chromium really drew it with. */
export async function inspectFrame(page: Page, frame: number): Promise<TextItem[]> {
  await seek(page, frame);
  const { cdp } = stateOf(page);
  const items = await page.evaluate(() => window.nykma.inspect());
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  await cdp.send("DOM.getDocument");
  for (const [i, item] of items.entries()) {
    const { result } = await cdp.send("Runtime.evaluate", { expression: `window.nykma.inspected[${i}]` });
    const { nodeId } = await cdp.send("DOM.requestNode", { objectId: result.objectId! });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    item.rendered = fonts.map((font) => ({ family: font.familyName, glyphs: font.glyphCount, custom: font.isCustomFont }));
  }
  return items;
}
