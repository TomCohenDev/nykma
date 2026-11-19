import { spawn } from "node:child_process";
import type { Video } from "../../src/engine/index.ts";
import type { Session } from "./session.ts";

/** Runs a program. Rejects with its output on failure, resolves to stderr + stdout (ffmpeg reports on stderr). */
export function run(command: string, args: string[]): Promise<string> {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? done(output) : fail(new Error(`${command} failed (${code}):\n${output.slice(-2000)}`))));
  });
}

export async function probeSeconds(file: string) {
  return Number(await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]));
}

export const evenFrames = (video: Video, count: number) => {
  const last = video.frames - 1;
  const frames = Array.from({ length: Math.min(count, video.frames) }, (_, i) => Math.round((last * i) / Math.max(count - 1, 1)));
  return [...new Set(frames)];
};

/** Lays out labelled PNGs on one sheet. It's a Chromium page, so no image library is needed. */
export async function contactSheet(session: Session, tiles: { label: string; png: Buffer }[], path: string, { columns = 4 } = {}) {
  const html = tiles
    .map(({ label, png }) => `<figure><img src="data:image/png;base64,${png.toString("base64")}"><figcaption>${label}</figcaption></figure>`)
    .join("");
  const page = await session.browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.setContent(`<!doctype html><style>
    body { margin: 0; padding: 12px; width: max-content; background: #111; color: #ddd; font: 16px system-ui; display: grid; gap: 12px; grid-template-columns: repeat(${columns}, auto); }
    figure { margin: 0; } img { display: block; } figcaption { padding-top: 4px; }
  </style>${html}`);
  await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
  await page.screenshot({ path, fullPage: true });
  await page.close();
}
