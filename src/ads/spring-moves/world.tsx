import type { CSSProperties, ReactNode } from "react";
import { asset, useFrame, useVideo } from "../../engine";
import { HandText, handEntry } from "../../parts/hand";
import { clamp, easings, prog, type Span } from "../../parts/time";
import type { Cam } from "../../parts/camera";

export const SLUG = "spring-moves";
export const FPS = 30;
export const INK = "#1e1e1e";
export const PRIMARY = "#514fbb";
export const RESULT = "#5f3dc4";
export const TEXT = "#1a1c1c";
export const MUTED = "#464553";

/**
 * Scene starts, in frames of the whole ad. Each scene starts a few frames before its line in spec.json, and the
 * lines' times come from gen/timeline.json: the steps line's words land on the steps in the chat.
 */
export const AT = { board: 0, classA: 150, beam: 228, desk: 300, steps: 408, sim: 522, classB: 810, end: 891, stop: 1029 } as const;

export const FONTS = `
@font-face{font-family:"Nunito";font-weight:200 1000;src:url("${asset(`ads/${SLUG}/Nunito-wght.ttf`)}")}
@font-face{font-family:"Arimo";font-weight:400 700;src:url("${asset(`ads/${SLUG}/Arimo-wght.ttf`)}")}
@font-face{font-family:"KaTeX_Math";font-style:italic;src:url("${asset(`ads/${SLUG}/KaTeX_Math-Italic.woff2`)}")}
@font-face{font-family:"Virgil";src:url("${asset(`ads/${SLUG}/Virgil-Regular.woff2`)}")}
@font-face{font-family:"Rubik";font-weight:300 900;src:url("${asset(`ads/${SLUG}/Rubik-wght.ttf`)}")}`;

export function Fonts() {
  return <style>{FONTS}</style>;
}

export function Shell({ bg = "#fff", children }: { bg?: string; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: bg, overflow: "hidden" }}>
      <Fonts />
      {children}
    </div>
  );
}

// ── handwriting ──────────────────────────────────────────────────────────────

export type Place = { x: number; base: number; size: number };

/** Where a traced text's box sits when its baseline is at `base`. */
export function boxOf(id: string, p: Place) {
  const e = handEntry(SLUG, id);
  const k = p.size / e.size!;
  return { left: p.x, top: p.base - (e.y! - e.viewBox[1]) * k, width: e.viewBox[2] * k, height: e.viewBox[3] * k };
}

/** Writing that draws itself on along its strokes. No pen, no hand: the ink just arrives. */
export function Hand({ id, p, write, color = INK, style }: { id: string; p: Place; write: Span; color?: string; style?: CSSProperties }) {
  const b = boxOf(id, p);
  return <HandText id={id} write={write} size={p.size} color={color} mode="mask" pen={false} style={{ position: "absolute", left: b.left, top: b.top, ...style }} />;
}

// ── the canvas ───────────────────────────────────────────────────────────────

/** The app's default canvas: white, fine lines every 20 px and solid ones every 100 px, filmed through `cam`. */
export function Grid({ cam, opacity = 1 }: { cam: Cam; opacity?: number }) {
  const { width: w, height: h } = useVideo();
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
        inset: 0,
        background: "#fff",
        opacity,
        backgroundImage: [line("#e5e5e5", "right"), line("#e5e5e5", "bottom"), line(fineC, "right"), line(fineC, "bottom")].join(","),
        backgroundSize: [`${major}px ${major}px`, `${major}px ${major}px`, `${fine}px ${fine}px`, `${fine}px ${fine}px`].join(","),
        backgroundPosition: [`${ox}px ${oy}px`, `${ox}px ${oy}px`, `${ox}px ${oy}px`, `${ox}px ${oy}px`].join(","),
      }}
    />
  );
}

/** A world point on screen. */
export const shot = (cam: Cam, w: number, h: number, x: number, y: number) => ({ x: w / 2 + (x - cam.cx) * cam.z, y: h / 2 + (y - cam.cy) * cam.z });

/** The real toolbar and zoom control, from the live canvas (brands/mathbooklm/assets/ui). */
export function Chrome({ ui, opacity = 1, toolbar = true, zoom = true }: { ui: number; opacity?: number; toolbar?: boolean; zoom?: boolean }) {
  const { width } = useVideo();
  const tw = 313 * ui;
  return (
    <div style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}>
      {toolbar && <img src={asset(`ads/${SLUG}/toolbar.png`)} alt="" style={{ position: "absolute", left: width / 2 - tw / 2, top: 18 * ui, width: tw, borderRadius: 12 * ui, boxShadow: "0 2px 12px rgba(0,0,0,.1)" }} />}
      {zoom && <img src={asset(`ads/${SLUG}/zoom.png`)} alt="" style={{ position: "absolute", left: 22 * ui, bottom: 22 * ui, width: 253 * ui * 0.8, borderRadius: 8 * ui }} />}
    </div>
  );
}

/** The app's selection bar, from SelectionActionBar.tsx, at the widths measured on the live canvas. */
const ITEMS = [
  ["Solve", 61],
  ["Explain", 72],
  ["Ask", 50],
  ["Pin", 47],
  ["Reference", 90],
  ["Calc", 55],
  ["Cut", 49],
  ["Copy", 59],
  ["More", 58],
] as const;
export const barWidth = (ui: number) => ITEMS.reduce((s, [, w]) => s + w, 0) * ui;

export function SelectionBar({ left, bottom, ui, appear, loading, loadingFrom, loadingUntil = Infinity, caretAt }: { left: number; bottom: number; ui: number; appear: number; loading?: number; loadingFrom: number; loadingUntil?: number; caretAt: number }) {
  const frame = useFrame();
  const pop = easings.outBack(prog(frame, [appear, appear + 6], easings.linear));
  return (
    <div dir="ltr" style={{ position: "absolute", left, top: bottom - 33 * ui, height: 33 * ui, opacity: prog(frame, [appear, appear + 3], easings.linear), transform: `translateY(${(1 - pop) * 10}px)`, filter: "drop-shadow(0 3px 10px rgba(0,0,0,.14))" }}>
      <div style={{ display: "flex", height: "100%", background: "#fff", border: `${ui}px solid rgba(0,0,0,.08)`, borderRadius: 10 * ui, overflow: "hidden", fontFamily: '"Arimo", sans-serif', fontSize: 13.33 * ui, color: "#1a1a1a", boxSizing: "border-box" }}>
        {ITEMS.map(([label, width], i) => (
          <div key={label} style={{ position: "relative", width: width * ui, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 * ui, flex: "none", background: i === loading && frame >= loadingFrom && frame < loadingFrom + 4 ? "rgba(105,101,219,.12)" : "transparent" }}>
            {i > 0 && <span style={{ position: "absolute", left: 0, top: 6 * ui, bottom: 6 * ui, width: ui, background: "rgba(0,0,0,.1)" }} />}
            {i === loading && frame >= loadingFrom && frame < loadingUntil && (
              <span style={{ width: 10 * ui, height: 10 * ui, flex: "none", borderRadius: "50%", border: `${1.5 * ui}px solid rgba(0,0,0,.15)`, borderTopColor: PRIMARY, boxSizing: "border-box", transform: `rotate(${(frame - loadingFrom) * 26}deg)` }} />
            )}
            {label}
          </div>
        ))}
      </div>
      <span style={{ position: "absolute", left: caretAt, bottom: -5 * ui, width: 10 * ui, height: 10 * ui, marginLeft: -5 * ui, background: "#fff", transform: "rotate(45deg)", borderRight: `${ui}px solid rgba(0,0,0,.08)`, borderBottom: `${ui}px solid rgba(0,0,0,.08)` }} />
    </div>
  );
}

/** A drag rectangle, then the dashed selection box with handles, in screen pixels. */
export function Selection({ a, b, ui, drag, until }: { a: { x: number; y: number }; b: { x: number; y: number }; ui: number; drag: Span; until: number }) {
  const frame = useFrame();
  if (frame < drag[0] || frame >= until) return null;
  const box = (x: number, y: number, w: number, h: number): CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h, boxSizing: "border-box" });
  if (frame < drag[1]) {
    const k = easings.inOutQuad(prog(frame, drag, easings.linear));
    return <div style={{ ...box(a.x, a.y, (b.x - a.x) * k, (b.y - a.y) * k), border: `${1.2 * ui}px solid #6965db`, background: "rgba(105,101,219,.1)" }} />;
  }
  const hs = 11 * ui;
  return (
    <>
      <div style={{ ...box(a.x, a.y, b.x - a.x, b.y - a.y), border: `${ui}px dashed #6965db` }} />
      {[[a.x, a.y], [b.x, a.y], [a.x, b.y], [b.x, b.y]].map(([x, y], i) => (
        <div key={i} style={{ ...box(x - hs / 2, y - hs / 2, hs, hs), background: "#fff", border: `${ui}px solid #6965db`, borderRadius: 3 * ui }} />
      ))}
    </>
  );
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

// ── words on screen ──────────────────────────────────────────────────────────

/** A headline: its words rise in one after another, and it fades out at `until`. */
export function Head({ text, from, until, size, color = TEXT, style, weight = 900, stagger = 3, plate = false, shadow = false }: { text: string; from: number; until?: number; size: number; color?: string; style: CSSProperties; weight?: number; stagger?: number; plate?: boolean; shadow?: boolean }) {
  const frame = useFrame();
  const out = until === undefined ? 1 : 1 - prog(frame, [until - 6, until]);
  if (frame < from - 1 || out <= 0) return null;
  const words = text.split(" ");
  const card: CSSProperties = plate ? { background: "rgba(255,255,255,.94)", padding: `${size * 0.18}px ${size * 0.3}px`, borderRadius: size * 0.25, boxShadow: "0 4px 24px rgba(0,0,0,.08)", opacity: out * prog(frame, [from - 1, from + 4]) } : {};
  return (
    <div style={{ position: "absolute", fontFamily: '"Nunito", sans-serif', fontWeight: weight, fontSize: size, lineHeight: 1.04, letterSpacing: "-0.025em", color, opacity: out, textShadow: shadow ? "0 3px 18px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.4)" : undefined, ...style, ...card }}>
      {words.map((w, i) => {
        if (w === "|") return <br key={i} />;
        const t0 = from + i * stagger;
        const k = easings.outCubic(prog(frame, [t0, t0 + 9], easings.linear));
        const a = prog(frame, [t0, t0 + 3], easings.linear);
        return (
          <span key={i} style={{ display: "inline-block", opacity: a, transform: `translateY(${(1 - k) * size * 0.45}px)`, marginRight: i < words.length - 1 ? "0.24em" : 0 }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}

/**
 * A Hebrew headline in Rubik (the brand kit's Hebrew face), right to left: its words rise in one after another,
 * starting from the right. English names and numbers inside it keep their order.
 */
export function He({ text, from, until, size, color = TEXT, style, weight = 800, stagger = 3, shadow = false, plate = false }: { text: string; from: number; until?: number; size: number; color?: string; style: CSSProperties; weight?: number; stagger?: number; shadow?: boolean; plate?: boolean }) {
  const frame = useFrame();
  const out = until === undefined ? 1 : 1 - prog(frame, [until - 6, until]);
  if (frame < from - 1 || out <= 0) return null;
  const lines = text.split(" | ");
  let i = 0;
  const card: CSSProperties = plate ? { background: "rgba(255,255,255,.95)", padding: `${size * 0.16}px ${size * 0.32}px`, borderRadius: size * 0.24, boxShadow: "0 6px 28px rgba(0,0,0,.1)" } : {};
  return (
    <div dir="rtl" style={{ position: "absolute", fontFamily: '"Rubik", sans-serif', fontWeight: weight, fontSize: size, lineHeight: 1.08, letterSpacing: "-0.01em", color, opacity: out * (plate ? prog(frame, [from - 1, from + 4]) : 1), textShadow: shadow ? "0 3px 22px rgba(0,0,0,.6), 0 1px 3px rgba(0,0,0,.45)" : undefined, ...style, ...card }}>
      {lines.map((line, l) => (
        <div key={l}>
          {line.split(" ").map((word, j, all) => {
            const t0 = from + i++ * stagger;
            const k = easings.outCubic(prog(frame, [t0, t0 + 9], easings.linear));
            const a = prog(frame, [t0, t0 + 3], easings.linear);
            const latin = /^[p{Script=Latin}p{Nd}×→.,:/=+-]+$/u.test(word);
            return (
              <span key={j} dir={latin ? "ltr" : undefined} style={{ display: "inline-block", opacity: a, transform: `translateY(${(1 - k) * size * 0.42}px)`, marginLeft: j < all.length - 1 ? "0.26em" : 0, unicodeBidi: "isolate" }}>
                {word}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
