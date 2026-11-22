import { frameSettled } from "./ready";
import type { Video } from "./ad";

/** One visible run of text on the current frame. Boxes and sizes are in output pixels. */
export type TextItem = {
  text: string;
  tag: string;
  box: { x: number; y: number; width: number; height: number };
  /** Part of the box is cut off by the stage edge or an `overflow` ancestor. */
  clipped: boolean;
  /** The CSS font stack. `inspectFrame` in scripts/lib adds which fonts really drew it. */
  font: string;
  /** On-screen size, so a zoomed camera counts. */
  size: number;
  weight: string;
  color: string;
  /** Opacity after all ancestors. */
  opacity: number;
  direction: "ltr" | "rtl";
  lang: string;
  rendered?: { family: string; glyphs: number; custom: boolean }[];
};

export type NykmaApi = {
  video: Pick<Video, "id" | "slug" | "take" | "ratio" | "width" | "height" | "fps" | "frames" | "lang" | "dir" | "cues">;
  /** Shows a frame. Resolves once React has committed, fonts are in and images have decoded. */
  seek(frame: number): Promise<void>;
  /** The visible text on the current frame. */
  inspect(): TextItem[];
  /** The text nodes behind the last `inspect()`, same order. For scripts/lib. */
  inspected: Text[];
};

declare global {
  interface Window {
    nykma: NykmaApi;
  }
}

const stage = () => document.querySelector<HTMLElement>("[data-nykma-stage]")!;

const nextPaint = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

const decoded = (image: HTMLImageElement, url: string) =>
  image.decode().catch(() => {
    throw new Error(`image failed to load: ${url}`);
  });

/** Every image on the stage: <img>, SVG <image>, and url() in inline styles. Backgrounds from CSS files aren't seen. */
async function imagesDecoded(root: HTMLElement) {
  const urls = new Set<string>();
  for (const el of root.querySelectorAll("image")) urls.add(new URL(el.href.baseVal, location.href).href);
  for (const el of root.querySelectorAll<HTMLElement>('[style*="url("]')) {
    // url(#id) is an SVG reference (a filter, a mask), not an image.
    for (const [, url] of el.style.cssText.matchAll(/url\("?([^")]+)"?\)/g)) if (!url.startsWith("#")) urls.add(new URL(url, location.href).href);
  }
  const elements = [...root.querySelectorAll("img")].filter((image) => image.src);
  await Promise.all([
    ...elements.map((image) => decoded(image, image.src)),
    ...[...urls].map((url) => {
      const image = new Image();
      image.src = url;
      return decoded(image, url);
    }),
  ]);
}

/** Wires up `window.nykma`. `commit` must render the frame synchronously (flushSync). */
export function installPageApi(video: Video, commit: (frame: number) => void) {
  const { id, slug, take, ratio, width, height, fps, frames, lang, dir, cues } = video;
  window.nykma = {
    video: { id, slug, take, ratio, width, height, fps, frames, lang, dir, cues },
    inspected: [],
    async seek(frame) {
      if (!Number.isInteger(frame) || frame < 0 || frame >= frames) {
        throw new RangeError(`${id}: frame ${frame} is outside 0..${frames - 1}`);
      }
      commit(frame);
      const root = stage();
      void root.offsetHeight; // Layout now, or a font first used on this frame hasn't started loading yet.
      await document.fonts.ready;
      await imagesDecoded(root);
      await frameSettled(); // Textures and models a part is still loading (ready.ts).
      await nextPaint();
    },
    inspect() {
      const items = readText(stage(), video);
      window.nykma.inspected = items.map((item) => item.node);
      return items.map(({ node, ...item }) => item);
    },
  };
}

/** Scale from an element's own coordinates to the stage's, and its opacity after all ancestors. */
function ancestry(el: Element, root: Element) {
  let scale = 1;
  let opacity = 1;
  for (let at: Element | null = el; at && at !== root; at = at.parentElement) {
    const style = getComputedStyle(at);
    opacity *= Number(style.opacity);
    // `data-fx` fades through filter: opacity() (fx.ts), so a hidden element reads as hidden.
    if (style.filter !== "none") for (const [, value, unit] of style.filter.matchAll(/opacity\(([\d.]+)(%?)\)/g)) opacity *= unit ? Number(value) / 100 : Number(value);
    if (style.transform !== "none") {
      const m = new DOMMatrix(style.transform);
      scale *= Math.hypot(m.a, m.b);
    }
    if (style.scale !== "none") scale *= Number(style.scale.split(" ")[0]);
  }
  return { scale, opacity };
}

/** What's left of a rect after the stage edge and every clipping ancestor. */
function visiblePart(rect: DOMRect, el: Element, root: Element) {
  let { left, top, right, bottom } = rect;
  for (let at: Element | null = el; at; at = at.parentElement) {
    if (at === root || getComputedStyle(at).overflow !== "visible") {
      const clip = at.getBoundingClientRect();
      left = Math.max(left, clip.left);
      top = Math.max(top, clip.top);
      right = Math.min(right, clip.right);
      bottom = Math.min(bottom, clip.bottom);
    }
    if (at === root) break;
  }
  return { width: right - left, height: bottom - top };
}

function readText(root: HTMLElement, video: Video) {
  const origin = root.getBoundingClientRect();
  const k = origin.width / video.width; // The preview shows the stage scaled down.
  const items: (TextItem & { node: Text })[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const el = node.parentElement!;
    const text = node.data.replace(/\s+/g, " ").trim();
    if (!text || el.closest("style, script, title, desc")) continue;

    const style = getComputedStyle(el);
    if (style.visibility !== "visible") continue;
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    const seen = visiblePart(rect, el, root);
    if (rect.width <= 0 || rect.height <= 0 || seen.width <= 0 || seen.height <= 0) continue;

    const { scale, opacity } = ancestry(el, root);
    if (opacity < 0.02) continue;

    // SVG text is also scaled by its viewBox. getScreenCTM covers that and every ancestor.
    const ctm = el instanceof SVGGraphicsElement ? el.getScreenCTM() : null;
    const onScreen = ctm ? Math.hypot(ctm.a, ctm.b) / k : scale;

    items.push({
      node,
      text,
      tag: el.tagName.toLowerCase(),
      box: {
        x: (rect.left - origin.left) / k,
        y: (rect.top - origin.top) / k,
        width: rect.width / k,
        height: rect.height / k,
      },
      clipped: seen.width < rect.width - 1 || seen.height < rect.height - 1,
      font: style.fontFamily,
      size: parseFloat(style.fontSize) * onScreen,
      weight: style.fontWeight,
      color: el instanceof SVGElement ? style.fill : style.color,
      opacity,
      direction: style.direction as "ltr" | "rtl",
      lang: el.closest<HTMLElement>("[lang]")?.lang ?? video.lang,
    });
  }
  return items;
}
