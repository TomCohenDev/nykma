import type { ReactNode } from "react";
import { asset, useFrame, type Ratio } from "../../engine";
import { FrameContext } from "../../engine/timing";
import { HandText, handEntry } from "../../parts/hand";
import { between, clamp, easings, lerp, type Ease, type Span } from "../../parts/time";

export const SLUG = "three-tries";
export const FPS = 30;
/** Seconds to frames. Every time in this ad is a second of the whole ad, written as s(…). */
export const s = (sec: number) => Math.round(sec * FPS);
export const span = (a: number, b: number): Span => [s(a), s(b)];

/** Scene starts, in frames of the whole ad. */
export const AT = { tries: 0, sim: s(9), pilot: s(22), end: s(29), stop: s(33) } as const;

export const INK = "#1e1e1e";
export const MUTED = "#868e96";
export const PRIMARY = "#514fbb";
export const ACCENT = "#6965db";
export const TEXT = "#1a1c1c";

const FONTS = `
@font-face{font-family:"Nunito";font-weight:200 1000;src:url("${asset(`ads/${SLUG}/Nunito-wght.ttf`)}")}
@font-face{font-family:"Arimo";font-weight:400 700;src:url("${asset(`ads/${SLUG}/Arimo-wght.ttf`)}")}
@font-face{font-family:"Rubik";font-weight:300 900;src:url("${asset(`ads/${SLUG}/Rubik-wght.ttf`)}")}
@font-face{font-family:"KaTeX_Math";font-style:italic;src:url("${asset(`ads/${SLUG}/KaTeX_Math-Italic.woff2`)}")}
@font-face{font-family:"Virgil";src:url("${asset(`ads/${SLUG}/Virgil-Regular.woff2`)}")}
@font-face{font-family:"Gveret Levin";src:url("${asset(`ads/${SLUG}/GveretLevin.ttf`)}")}
`;

export function Shell({ bg = "#fff", children }: { bg?: string; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: bg, overflow: "hidden" }}>
      <style>{FONTS}</style>
      {children}
    </div>
  );
}

/** Runs its children on the ad's own clock: `useFrame()` inside is the frame of the whole ad, not of the scene. */
export function Global({ start, children }: { start: number; children: ReactNode }) {
  const f = useFrame();
  return <FrameContext.Provider value={start + f}>{children}</FrameContext.Provider>;
}

// ── the camera ───────────────────────────────────────────────────────────────

/** A framing: world point (cx, cy) in the middle, zoomed so a box fw × fh of the world fits the frame. */
export type Frame = { t: number; cx: number; cy: number; fw: number; fh: number; ease?: Ease };
export type Cam = { cx: number; cy: number; z: number };

const zoomFor = (k: Frame, w: number, h: number) => Math.min(w / k.fw, h / k.fh);

/** The camera at global frame `g`, from framings keyed in seconds; zoom eases in log space. */
export function camAt(g: number, keys: readonly Frame[], w: number, h: number): Cam {
  const ks = keys.map((k) => ({ ...k, f: s(k.t), ease: k.ease ?? easings.inOutCubic }));
  const [a, b, k] = between(g, ks);
  return { cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), z: Math.exp(lerp(Math.log(zoomFor(a, w, h)), Math.log(zoomFor(b, w, h)), k)) };
}

/** A world point on screen. */
export const onScreen = (cam: Cam, w: number, h: number, x: number, y: number) => ({ x: w / 2 + (x - cam.cx) * cam.z, y: h / 2 + (y - cam.cy) * cam.z });

export function World({ cam, w, h, children }: { cam: Cam; w: number; h: number; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${w / 2}px, ${h / 2}px) scale(${cam.z}) translate(${-cam.cx}px, ${-cam.cy}px)` }}>{children}</div>
    </div>
  );
}

/** The app's default canvas: white, fine dashed lines every 20 px and solid ones every 100 px, filmed through `cam`. */
export function Grid({ cam, w, h }: { cam: Cam; w: number; h: number }) {
  const major = 100 * cam.z;
  const fine = 20 * cam.z;
  const ox = w / 2 - cam.cx * cam.z;
  const oy = h / 2 - cam.cy * cam.z;
  const fineAlpha = clamp((fine - 5) / 6);
  const line = (c: string, dir: "right" | "bottom") => `linear-gradient(to ${dir}, ${c} 1px, transparent 1px)`;
  const fineC = `rgba(0,0,0,${0.05 * fineAlpha})`;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: w,
        height: h,
        background: "#fff",
        backgroundImage: [line("#e5e5e5", "right"), line("#e5e5e5", "bottom"), line(fineC, "right"), line(fineC, "bottom")].join(","),
        backgroundSize: [`${major}px ${major}px`, `${major}px ${major}px`, `${fine}px ${fine}px`, `${fine}px ${fine}px`].join(","),
        backgroundPosition: [`${ox}px ${oy}px`, `${ox}px ${oy}px`, `${ox}px ${oy}px`, `${ox}px ${oy}px`].join(","),
      }}
    />
  );
}

// ── handwriting ──────────────────────────────────────────────────────────────

/** A traced line's box when its baseline is at `base` and its font size is `size`, in world pixels. */
export function handBox(id: string, x: number, base: number, size: number) {
  const e = handEntry(SLUG, id);
  const k = size / e.size!;
  return { left: x, top: base - (e.y! - e.viewBox[1]) * k, width: e.viewBox[2] * k, height: e.viewBox[3] * k, right: x + e.viewBox[2] * k };
}

/** Writing that draws itself on along its strokes. `right` anchors the line's right edge at x (for Hebrew). */
export function Ink({ id, x, base, size, write, color = INK, right }: { id: string; x: number; base: number; size: number; write: Span; color?: string; right?: boolean }) {
  const b0 = handBox(id, x, base, size);
  const left = right ? x - b0.width : x;
  return <HandText id={id} write={write} size={size} color={color} mode="mask" pen={false} style={{ position: "absolute", left, top: b0.top }} />;
}

/** The wordmark, as MathbookLMWordmark.tsx sets it: the icon is the M. */
export function Wordmark({ size }: { size: number }) {
  return (
    <div dir="ltr" aria-label="logo" style={{ display: "inline-flex", alignItems: "center", fontSize: size, fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: TEXT, lineHeight: 1 }}>
      <img src={asset(`ads/${SLUG}/icon.png`)} alt="logo" style={{ width: "1.2em", height: "1.2em", marginBottom: "0.2em", display: "block" }} />
      <span>
        athbook
        <span style={{ fontFamily: '"KaTeX_Math", serif', fontStyle: "italic", fontWeight: 400 }}>LM</span>
      </span>
    </div>
  );
}

/** Per-ratio numbers. */
export type L<T> = Record<Ratio, T>;

/** Something that comes in with a short fade and lift. */
export function useLand(at: number, len = 8) {
  const g = useFrame();
  const k = g < at ? 0 : easings.outCubic(clamp((g - at) / len));
  return k;
}
