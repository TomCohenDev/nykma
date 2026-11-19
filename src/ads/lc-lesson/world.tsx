import type { CSSProperties, ReactNode } from "react";
import { asset, useFrame, useVideo, type Ratio } from "../../engine";
import { FrameContext } from "../../engine/timing";
import { handEntry } from "../../parts/hand";
import { HandText } from "../../parts/hand";
import { between, clamp, easings, lerp, prog, type Ease, type Span } from "../../parts/time";

export const SLUG = "lc-lesson";
export const FPS = 30;
/** Seconds to frames. Every time in this ad is a second of the voice-over (gen/timeline.json), written as s(…). */
export const s = (sec: number) => Math.round(sec * FPS);
export const span = (a: number, b: number): Span => [s(a), s(b)];

/** Scene starts, in frames of the whole ad. */
export const AT = { bench: 0, room: s(7), lesson: s(11), solve: s(30.8), explain: s(47.4), lab: s(63.8), end: s(101.2), stop: s(107) } as const;

export const INK = "#1e1e1e";
export const MUTED = "#868e96";
export const RULE = "#ced4da";
export const PRIMARY = "#514fbb";
export const ACCENT = "#6965db";
export const TEXT = "#1a1c1c";
export const BLUE = "#1971c2";
export const ORANGE = "#e8590c";
export const GREEN = "#2f9e44";

const FONTS = `
@font-face{font-family:"Nunito";font-weight:200 1000;src:url("${asset(`ads/${SLUG}/Nunito-wght.ttf`)}")}
@font-face{font-family:"Arimo";font-weight:400 700;src:url("${asset(`ads/${SLUG}/Arimo-wght.ttf`)}")}
@font-face{font-family:"KaTeX_Math";font-style:italic;src:url("${asset(`ads/${SLUG}/KaTeX_Math-Italic.woff2`)}")}
@font-face{font-family:"Virgil";src:url("${asset(`ads/${SLUG}/Virgil-Regular.woff2`)}")}
.hd .katex,.hd .katex *{font-family:"Virgil","Nunito",sans-serif!important;font-style:normal!important;font-weight:400!important}
.hd .katex .mfrac .frac-line{border-bottom-width:0.05em!important}
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

/** The app's default canvas: white, fine lines every 20 px and solid ones every 100 px, filmed through `cam`. */
export function Grid({ cam, w, h }: { cam: Cam; w: number; h: number }) {
  const major = 100 * cam.z;
  const fine = 20 * cam.z;
  const ox = w / 2 - cam.cx * cam.z;
  const oy = h / 2 - cam.cy * cam.z;
  const fineAlpha = clamp((fine - 5) / 6);
  const line = (c: string, dir: "right" | "bottom") => `linear-gradient(to ${dir}, ${c} 1px, transparent 1px)`;
  const fineC = `rgba(0,0,0,${0.045 * fineAlpha})`;
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

/** Writing that draws itself on along its strokes. No pen, no hand: the ink just arrives. */
export function Ink({ id, x, base, size, write, color = INK }: { id: string; x: number; base: number; size: number; write: Span; color?: string }) {
  const b = handBox(id, x, base, size);
  return <HandText id={id} write={write} size={size} color={color} mode="mask" pen={false} style={{ position: "absolute", left: b.left, top: b.top }} />;
}

/** A line written in pieces, with a real raised "2" for a square: [["e-cap"], ["sup2", "sup"], ["half"]]. */
export function InkRow({ x, base, size, pieces, write, color }: { x: number; base: number; size: number; pieces: [string, "sup"?][]; write: Span; color?: string }) {
  let cx = x;
  const widths = pieces.map(([id, sup]) => handBox(id, 0, 0, sup ? size * 0.55 : size).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let t = write[0];
  return (
    <>
      {pieces.map(([id, sup], i) => {
        const sz = sup ? size * 0.55 : size;
        const gap = sup ? size * 0.04 : i > 0 ? size * 0.12 : 0;
        const px = cx + gap;
        cx = px + widths[i];
        const dur = ((write[1] - write[0]) * widths[i]) / total;
        const w: Span = [t, t + dur];
        t += dur;
        return <Ink key={id + i} id={id} x={px} base={sup ? base - size * 0.42 : base} size={sz} write={w} color={color} />;
      })}
    </>
  );
}

/** The right edge of an InkRow, for layout. */
export function inkRowRight(x: number, size: number, pieces: [string, "sup"?][]) {
  let cx = x;
  pieces.forEach(([id, sup], i) => {
    cx += (sup ? size * 0.04 : i > 0 ? size * 0.12 : 0) + handBox(id, 0, 0, sup ? size * 0.55 : size).width;
  });
  return cx;
}

// ── words on screen ──────────────────────────────────────────────────────────

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

/** The UI's scale on screen per shape: the app's pixels to video pixels. */
export const UI: L<number> = { "16x9": 1.45, "1x1": 1.3, "9x16": 1.75 };

/** The lesson's chapter chip: a numbered tag that slides in with each part. */
export function Chip({ n, text, from, until, ratio, pos: at }: { n?: string; text: string; from: number; until: number; ratio: Ratio; pos?: CSSProperties }) {
  const g = useFrame();
  if (g < from || g > until) return null;
  const inK = easings.outCubic(prog(g, [from, from + 12], easings.linear));
  const out = prog(g, [until - 8, until], easings.inCubic);
  const size = { "16x9": 46, "1x1": 44, "9x16": 52 }[ratio];
  const pos: CSSProperties = {
    "16x9": { left: 96, top: 128 },
    "1x1": { left: 64, top: 128 },
    "9x16": { left: 70, top: 230 },
  }[ratio];
  return (
    <div style={{ position: "absolute", ...(at ?? pos), opacity: inK * (1 - out), transform: `translateX(${(1 - inK) * -40}px)`, display: "flex", alignItems: "center", gap: size * 0.35, padding: `${size * 0.22}px ${size * 0.42}px ${size * 0.22}px ${size * 0.24}px`, background: "#fff", borderRadius: size * 0.5, boxShadow: "0 6px 30px rgba(20,20,60,.16)", border: "1px solid rgba(81,79,187,.18)", fontFamily: '"Nunito", sans-serif', fontWeight: 800, fontSize: size, color: TEXT, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
      {n && <span style={{ display: "grid", placeItems: "center", minWidth: size * 1.25, height: size * 1.25, borderRadius: size, background: PRIMARY, color: "#fff", fontSize: size * 0.72, padding: `0 ${size * 0.2}px`, boxSizing: "border-box" }}>{n}</span>}
      <span>{text}</span>
    </div>
  );
}

/** One subtitle line: the voice's words, for the many who watch muted. */
export function Subtitle({ text, from, until, ratio }: { text: string; from: number; until: number; ratio: Ratio }) {
  const g = useFrame();
  if (g < from - 2 || g > until) return null;
  const a = prog(g, [from - 2, from + 4], easings.linear) * (1 - prog(g, [until - 5, until], easings.linear));
  const size = { "16x9": 44, "1x1": 42, "9x16": 50 }[ratio];
  const pos: CSSProperties = {
    "16x9": { left: 160, right: 160, bottom: 70 },
    "1x1": { left: 70, right: 70, bottom: 70 },
    "9x16": { left: 70, right: 130, bottom: 350 },
  }[ratio];
  return (
    <div style={{ position: "absolute", ...pos, display: "flex", justifyContent: "center", opacity: a, pointerEvents: "none" }}>
      <span style={{ background: "rgba(22,22,40,.82)", color: "#fff", fontFamily: '"Nunito", sans-serif', fontWeight: 700, fontSize: size, lineHeight: 1.22, padding: `${size * 0.2}px ${size * 0.45}px`, borderRadius: size * 0.32, textAlign: "center", maxWidth: "100%", boxSizing: "border-box" }}>{text}</span>
    </div>
  );
}
