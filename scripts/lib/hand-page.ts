/**
 * What hand-trace.ts and hand-check.ts share: a bare Chromium page that sets text exactly as <HandText> does, and turns
 * what it drew into bitmaps. Launched like the capture session, so the letters are the same pixels. Not exported from
 * index.ts because no other script needs it.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";
import { chromium, type Browser, type Page } from "playwright";
import { resolveHandFont, textDirection } from "../../src/parts/hand/fonts.ts";
import type { HandEntry, HandGen, HandManifest, HandPathSpec, HandTextSpec } from "../../src/parts/hand/types.ts";
import { publicFile, ROOT } from "./videos.ts";

/** Change this when the trace changes, so `bun run hand` redoes every entry. */
export const TRACER = 7;
export const DEFAULT_SIZE = 240;
export const DEFAULT_WEIGHT = 500;
/** How bright a pixel must be to count as ink. The same for tracing and for checking. */
const INK = 110;

/** A one-bit picture: `data[y * w + x]` is 1 on ink. */
export type Mask = { w: number; h: number; data: Uint8Array };

export const adDir = (slug: string) => join(ROOT, "src", "ads", slug);
export const genPath = (slug: string) => join(adDir(slug), "hand.gen.json");

export async function loadManifest(slug: string): Promise<HandManifest> {
  const path = join(adDir(slug), "hand.ts");
  if (!existsSync(path)) throw new Error(`no ${path}. List the ad's texts there (see src/parts/hand/index.ts).`);
  return (await import(pathToFileURL(path).href)).default;
}

export function loadGen(slug: string): HandGen | null {
  const path = genPath(slug);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

const hash = (...parts: (string | number | Buffer)[]) => {
  const sum = createHash("sha256");
  for (const part of parts) sum.update(String(typeof part === "string" || typeof part === "number" ? part : part.toString("base64"))).update("\0");
  return sum.digest("hex").slice(0, 16);
};

/** The cache key: text + font file + weight + size + direction, and the tracer that made it. */
export function textKey(spec: HandTextSpec) {
  const font = resolveHandFont(spec.font);
  const file = publicFile(font.src);
  if (!existsSync(file)) throw new Error(`${spec.id}: no font file ${file}. A brand's font is copied from brands/<brand>/assets/ to public/ads/<slug>/ first.`);
  return hash(TRACER, spec.text, readFileSync(file), spec.weight ?? DEFAULT_WEIGHT, spec.size ?? DEFAULT_SIZE, spec.dir ?? textDirection(spec.text));
}

export const pathKey = (spec: HandPathSpec) => hash(TRACER, spec.ink, ...spec.paths);

/** One entry per grapheme, so a letter and its niqqud stay together. Spaces stay too: they're part of the shaping. */
export const graphemes = (text: string) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((part) => part.segment);

/** Reads the PNGs Chromium writes: 8-bit, RGB or RGBA, not interlaced. Returns the red channel. */
export function decodeRed(png: Buffer) {
  let at = 8;
  let w = 0, h = 0, channels = 0;
  const idat: Buffer[] = [];
  while (at < png.length) {
    const length = png.readUInt32BE(at);
    const type = png.toString("latin1", at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      [w, h] = [body.readUInt32BE(0), body.readUInt32BE(4)];
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
      if (body[8] !== 8 || !channels || body[12]) throw new Error("unexpected PNG format");
    }
    if (type === "IDAT") idat.push(body);
    at += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const row = w * channels;
  const out = new Uint8Array(row * h);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (row + 1)];
    const src = y * (row + 1) + 1;
    const dst = y * row;
    for (let i = 0; i < row; i++) {
      const value = raw[src + i];
      const a = i >= channels ? out[dst + i - channels] : 0;
      const b = y ? out[dst + i - row] : 0;
      const c = y && i >= channels ? out[dst + i - row - channels] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[dst + i] = (value + add) & 255;
    }
  }
  const red = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) red[i] = out[i * channels];
  return { w, h, red };
}

export function toMask(png: Buffer): Mask {
  const { w, h, red } = decodeRed(png);
  return { w, h, data: red.map((value) => (value > INK ? 1 : 0)) };
}

export type TextSetting = { text: string; family: string; weight: number; size: number; dir: "ltr" | "rtl"; x: number; y: number };

export type HandPage = {
  browser: Browser;
  page: Page;
  /** Length of a line of text, once its font is in. */
  measure(setting: Omit<TextSetting, "x" | "y">): Promise<number>;
  /** The whole text in white on black. */
  ink(setting: TextSetting, box: [number, number, number, number]): Promise<Mask>;
  /** One grapheme only, shaped with the rest of the line around it. `null` if it left no ink, like a space. */
  letter(setting: TextSetting, box: [number, number, number, number], index: number): Promise<Mask | null>;
  /** Any SVG markup in white on black. */
  shapes(markup: string, box: [number, number, number, number]): Promise<Mask>;
  close(): Promise<void>;
};

/** A bare page with these fonts loaded. */
export async function openHandPage(fonts: { family: string; src: string }[]): Promise<HandPage> {
  const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--font-render-hinting=none", "--disable-lcd-text"] });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const faces = [...new Map(fonts.map((font) => [font.family, font])).values()].map((font) => {
    const data = readFileSync(publicFile(font.src)).toString("base64");
    return `@font-face{font-family:"${font.family}";font-weight:1 1000;font-display:block;src:url(data:font/ttf;base64,${data})}`;
  });
  await page.setContent(`<!doctype html><html><head><style>${faces.join("")}html,body{margin:0;background:#000}svg{display:block}</style></head><body></body></html>`);

  const load = (s: Pick<TextSetting, "text" | "family" | "weight" | "size">) =>
    page.evaluate(({ text, family, weight, size }) => document.fonts.load(`${weight} ${size}px "${family}"`, text).then(() => {}), s);

  /** Sets the text. `only` leaves one grapheme filled and the rest unpainted, in tspans, so nothing is reshaped. */
  const set = async (s: TextSetting, box: number[], only?: number) => {
    await load(s);
    await page.evaluate(
      ({ s, box, parts, only }) => {
        const [bx, by, bw, bh] = box;
        document.body.innerHTML = `<svg id="s" xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}" viewBox="${bx} ${by} ${bw} ${bh}" style="background:#000"></svg>`;
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        for (const [k, v] of Object.entries({
          x: s.x, y: s.y, direction: s.dir, "text-anchor": "start", "font-family": s.family,
          "font-weight": s.weight, "font-size": s.size, "text-rendering": "geometricPrecision", fill: only === undefined ? "#fff" : "none",
        })) text.setAttribute(k, String(v));
        text.style.whiteSpace = "pre";
        if (only === undefined) text.textContent = s.text;
        else
          for (const [i, part] of parts.entries()) {
            const span = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
            span.setAttribute("fill", i === only ? "#fff" : "none");
            span.textContent = part;
            text.append(span);
          }
        document.querySelector("svg")!.append(text);
      },
      { s, box, parts: graphemes(s.text), only },
    );
  };

  const shot = async () => toMask(await page.locator("#s").screenshot());

  return {
    browser,
    page,
    async measure(s) {
      await load(s);
      await set({ ...s, x: 0, y: 0 }, [0, 0, 16, 16]);
      return page.evaluate(() => document.querySelector("text")!.getComputedTextLength());
    },
    async ink(s, box) {
      await set(s, box);
      return shot();
    },
    async letter(s, box, index) {
      await set(s, box, index);
      const mask = await shot();
      return mask.data.some(Boolean) ? mask : null;
    },
    async shapes(markup, [bx, by, bw, bh]) {
      await page.evaluate(
        ({ markup, bx, by, bw, bh }) => {
          document.body.innerHTML = `<svg id="s" xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}" viewBox="${bx} ${by} ${bw} ${bh}" style="background:#000">${markup}</svg>`;
        },
        { markup, bx, by, bw, bh },
      );
      return shot();
    },
    close: () => browser.close(),
  };
}

/** How an entry's text was set. */
export const settingOf = (entry: HandEntry): TextSetting => ({
  text: entry.text!,
  family: entry.font!.family,
  weight: entry.font!.weight,
  size: entry.size!,
  dir: entry.dir!,
  x: entry.x!,
  y: entry.y!,
});
