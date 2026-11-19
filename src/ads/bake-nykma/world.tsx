import type { CSSProperties, ReactNode } from "react";
import { asset, useFrame, useVideo, type Ratio } from "../../engine";
import { HandText, handEntry } from "../../parts/hand";
import { clamp, easings, prog, type Span } from "../../parts/time";
import type { Cam } from "../../parts/camera";
import { ANSWERS, EQUATIONS } from "./hand";

export const SLUG = "bake-nykma";
export const INK = "#1e1e1e";
export const PRIMARY = "#514fbb";
export const RESULT = "#5f3dc4";
export const TEXT = "#1a1c1c";
export const MUTED = "#464553";

/** Scene lengths in frames at 30 fps. 120 bpm: a beat every 15 frames. */
export const LEN = { rush: 120, stuck: 75, solve: 120, end: 135 } as const;
export const BEAT = 15;

const FONTS = `
@font-face{font-family:"Nunito";font-weight:200 1000;src:url("${asset(`ads/${SLUG}/Nunito-wght.ttf`)}")}
@font-face{font-family:"Arimo";font-weight:400 700;src:url("${asset(`ads/${SLUG}/Arimo-wght.ttf`)}")}
@font-face{font-family:"KaTeX_Math";font-style:italic;src:url("${asset(`ads/${SLUG}/KaTeX_Math-Italic.woff2`)}")}
@font-face{font-family:"Virgil";src:url("${asset(`ads/${SLUG}/Virgil-Regular.woff2`)}")}`;

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#fff", overflow: "hidden" }}>
      <style>{FONTS}</style>
      {children}
    </div>
  );
}

// ── the homework column, in world pixels ─────────────────────────────────────

export const SIZE = 90;
export const ROW = 170;
export const NUM_RIGHT = 190;
export const EQ_X = 230;
export const baseOf = (row: number) => 200 + (row - 1) * ROW;
/** Rows are centred a little above their baseline. */
export const rowY = (row: number) => baseOf(row) - 32;
export const RES_BASE = baseOf(14) + 150;

type Place = { x: number; base: number; size: number };

export function boxOf(id: string, p: Place) {
  const e = handEntry(SLUG, id);
  const k = p.size / e.size!;
  return { left: p.x, top: p.base - (e.y! - e.viewBox[1]) * k, width: e.viewBox[2] * k, height: e.viewBox[3] * k };
}

const widest = Math.max(...EQUATIONS.map((_, i) => boxOf(`e${i + 1}`, { x: 0, base: 0, size: SIZE }).width));
export const ANS_X = EQ_X + widest + 100;
/** Where the "?" of "x = ?" sits: as far along as it is in the traced "x = ?". */
export const QM_X = ANS_X + boxOf("q", { x: 0, base: 0, size: SIZE }).width - boxOf("qm", { x: 0, base: 0, size: SIZE }).width;
export const COL = { left: 60, right: ANS_X + 330, top: baseOf(1) - 110, bottom: RES_BASE + 40 };

export function Hand({ id, p, write, color = INK, pen = false, style }: { id: string; p: Place; write: Span; color?: string; pen?: boolean; style?: CSSProperties }) {
  const b = boxOf(id, p);
  return <HandText id={id} write={write} size={p.size} color={color} pen={pen} style={{ position: "absolute", left: b.left, top: b.top, ...style }} />;
}

const DONE: Span = [-3, -2];

/**
 * The column. `answerWrite(row)` says when a row's answer is written (undefined: not yet). Row 14 is drawn by its scene.
 * `dim` fades every row but 14.
 */
export function Column({ answerWrite, dim = 0, pen = true }: { answerWrite: (row: number) => Span | undefined; dim?: number; pen?: boolean }) {
  const frame = useFrame();
  return (
    <>
      {EQUATIONS.map((_, i) => {
        const row = i + 1;
        const base = baseOf(row);
        const n = boxOf(`n${row}`, { x: 0, base, size: SIZE });
        const w = row < 14 ? answerWrite(row) : undefined;
        return (
          <div key={row} style={{ position: "absolute", left: 0, top: 0, opacity: row < 14 ? 1 - 0.72 * dim : 1 }}>
            <Hand id={`n${row}`} p={{ x: NUM_RIGHT - n.width, base, size: SIZE }} write={DONE} color={MUTED} />
            <Hand id={`e${row}`} p={{ x: EQ_X, base, size: SIZE }} write={DONE} />
            {w && frame >= w[0] - 6 && <Hand id={`a${ANSWERS[i]}`} p={{ x: ANS_X, base, size: SIZE }} write={w} pen={pen && w[1] > 0} />}
          </div>
        );
      })}
    </>
  );
}

// ── the canvas ───────────────────────────────────────────────────────────────

/** The app's default canvas: white, fine dashed lines every 20 px and solid ones every 100 px, filmed through `cam`. */
export function Grid({ cam, width, height }: { cam: Cam; width: number; height: number }) {
  const major = 100 * cam.z;
  const fine = 20 * cam.z;
  const ox = width / 2 - cam.cx * cam.z;
  const oy = height / 2 - cam.cy * cam.z;
  const fineC = `rgba(0,0,0,${0.05 * clamp((fine - 5) / 6)})`;
  const line = (c: string, dir: "right" | "bottom") => `linear-gradient(to ${dir}, ${c} 1px, transparent 1px)`;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        height,
        background: "#fff",
        backgroundImage: [line("#e5e5e5", "right"), line("#e5e5e5", "bottom"), line(fineC, "right"), line(fineC, "bottom")].join(","),
        backgroundSize: [`${major}px ${major}px`, `${major}px ${major}px`, `${fine}px ${fine}px`, `${fine}px ${fine}px`].join(","),
        backgroundPosition: Array(4).fill(`${ox}px ${oy}px`).join(","),
      }}
    />
  );
}

/** A world point on screen, for a view `w` by `h`. */
export const shot = (cam: Cam, w: number, h: number, x: number, y: number) => ({ x: w / 2 + (x - cam.cx) * cam.z, y: h / 2 + (y - cam.cy) * cam.z });

// ── app chrome, from the live canvas (brands/mathbooklm/assets/live-canvas.png) ─

/** UI scale per ratio. */
export const UI: Record<Ratio, number> = { "16x9": 1.3, "1x1": 1.2, "9x16": 1.5 };
/** The side panel only exists in landscape: the app is a desktop app. */
export const PANEL_W = 480;
export const canvasWidth = (ratio: Ratio, W: number) => (ratio === "16x9" ? W - PANEL_W : W);

export function Chrome({ ratio, opacity = 1, width }: { ratio: Ratio; opacity?: number; width: number }) {
  const { height } = useVideo();
  const ui = UI[ratio];
  const tw = 313 * ui;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, opacity, pointerEvents: "none" }}>
      <img src={asset(`ads/${SLUG}/toolbar.png`)} alt="" style={{ position: "absolute", left: width / 2 - tw / 2, top: 18 * ui, width: tw, borderRadius: 12 * ui, boxShadow: "0 2px 12px rgba(0,0,0,.1)" }} />
      <img src={asset(`ads/${SLUG}/zoom.png`)} alt="" style={{ position: "absolute", left: 16 * ui, bottom: 16 * ui, width: 253 * ui }} />
      {ratio === "16x9" && <img src={asset(`ads/${SLUG}/watermark.png`)} alt="" style={{ position: "absolute", right: 20 * ui, bottom: 14 * ui, width: 145 * ui }} />}
    </div>
  );
}

/** The side panel's empty state, as on the live canvas: header, the prompt, and the composer with the day's AI actions. */
export function Panel({ left, k, used, flash }: { left: number; k: number; used: boolean; flash: number }) {
  const { height } = useVideo();
  const w = PANEL_W / k;
  const h = height / k;
  return (
    <div style={{ position: "absolute", left, top: 0, width: w, height: h, transform: `scale(${k})`, transformOrigin: "0 0", background: "#fff", borderLeft: "1px solid #e5e7eb", fontFamily: '"Nunito", sans-serif', boxShadow: "-8px 0 30px rgba(0,0,0,.05)" }}>
      <div style={{ height: 56, borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px" }}>
        <Wordmark size={19} />
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth={1.6}>
          <rect x={3} y={3} width={18} height={18} rx={2} />
          <path d="M12 3v18M3 12h18M6 7.5h3M16.5 6v3M15 7.5h3M6 16.5h3M15 15.5l3 2M18 15.5l-3 2" />
        </svg>
      </div>
      <div style={{ position: "absolute", left: 28, right: 28, top: h * 0.42, textAlign: "center", fontSize: 14, lineHeight: 1.6, color: "#8b8a99" }}>
        Ask me anything about the math on your canvas — I can solve expressions, explain steps, or write results back for you.
      </div>
      <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, height: 80, borderRadius: 18, border: "1px solid #e5e7eb", boxSizing: "border-box", padding: "12px 16px", background: "#fff" }}>
        <div style={{ fontSize: 14, color: "#9ca3af" }}>Chat with MathbookLM...</div>
        <div style={{ position: "absolute", left: 16, bottom: 14, fontSize: 12, color: "#6b7280", background: `rgba(106,105,214,${0.22 * flash})`, borderRadius: 6, padding: "1px 5px", marginLeft: -5 }}>
          {used ? "2" : "3"} of 3 AI actions left today
        </div>
        <div style={{ position: "absolute", right: 14, bottom: 12, width: 28, height: 28, borderRadius: "50%", background: "#f3f4f6", display: "grid", placeItems: "center", color: "#9ca3af", fontSize: 14 }}>↑</div>
      </div>
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
export const itemCentre = (index: number, ui: number) => (ITEMS.slice(0, index).reduce((s, [, w]) => s + w, 0) + ITEMS[index][1] / 2) * ui;

export function SelectionBar({ left, bottom, ui, appear, loadingFrom, loadingUntil, caretAt, until }: { left: number; bottom: number; ui: number; appear: number; loadingFrom: number; loadingUntil: number; caretAt: number; until: number }) {
  const frame = useFrame();
  if (frame < appear || frame >= until + 6) return null;
  const pop = easings.outBack(prog(frame, [appear, appear + 6], easings.linear));
  const out = 1 - prog(frame, [until, until + 6], easings.linear);
  return (
    <div dir="ltr" style={{ position: "absolute", left, top: bottom - 33 * ui, height: 33 * ui, opacity: prog(frame, [appear, appear + 3], easings.linear) * out, transform: `translateY(${(1 - pop) * 10}px)`, filter: "drop-shadow(0 3px 10px rgba(0,0,0,.14))" }}>
      <div style={{ display: "flex", height: "100%", background: "#fff", border: `${ui}px solid rgba(0,0,0,.08)`, borderRadius: 10 * ui, overflow: "hidden", fontFamily: '"Arimo", sans-serif', fontSize: 13.33 * ui, color: "#1a1a1a", boxSizing: "border-box" }}>
        {ITEMS.map(([label, width], i) => (
          <div key={label} style={{ position: "relative", width: width * ui, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 * ui, flex: "none", background: i === 0 && frame >= loadingFrom - 8 && frame < loadingUntil ? "rgba(106,105,214,.08)" : undefined }}>
            {i > 0 && <span style={{ position: "absolute", left: 0, top: 6 * ui, bottom: 6 * ui, width: ui, background: "rgba(0,0,0,.1)" }} />}
            {i === 0 && frame >= loadingFrom && frame < loadingUntil && (
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
  const hs = 9 * ui;
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

/** A headline whose words land one after another. `plate` puts a soft white card behind it, for over the canvas. */
export function Head({ text, from, until, size, color = TEXT, style, weight = 900, stagger = 3, plate = false, slam = false, late }: { late?: { index: number; from: number; color: string }; text: string; from: number; until?: number; size: number; color?: string; style: CSSProperties; weight?: number; stagger?: number; plate?: boolean; slam?: boolean }) {
  const frame = useFrame();
  const out = until === undefined ? 1 : 1 - prog(frame, [until - 5, until]);
  if (frame < from - 1 || out <= 0) return null;
  const words = text.split(" ");
  const card: CSSProperties = plate ? { background: "#fff", padding: `${size * 0.16}px ${size * 0.3}px`, borderRadius: size * 0.25, boxShadow: "0 6px 30px rgba(30,30,60,.08)" } : {};
  return (
    <div style={{ position: "absolute", fontFamily: '"Nunito", sans-serif', fontWeight: weight, fontSize: size, lineHeight: 1.06, letterSpacing: "-0.025em", color, opacity: out * (plate ? prog(frame, [from - 1, from + 4]) : 1), ...style, ...card }}>
      {words.map((w, i) => {
        if (w === "|") return <br key={i} />;
        const isLate = late !== undefined && i >= late.index;
        const t0 = isLate ? late.from + (i - late.index) * stagger : from + i * stagger;
        const k = slam || isLate ? easings.outBack(prog(frame, [t0, t0 + 7], easings.linear)) : easings.outCubic(prog(frame, [t0, t0 + 9], easings.linear));
        const a = prog(frame, [t0, t0 + 3], easings.linear);
        const tf = slam || isLate ? `scale(${1.5 - 0.5 * k})` : `translateY(${(1 - k) * size * 0.4}px)`;
        return (
          <span key={i} style={{ display: "inline-block", opacity: a, color: isLate ? late.color : undefined, transform: tf, transformOrigin: "50% 80%", marginRight: i < words.length - 1 ? "0.24em" : 0 }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}

/** A fineliner, nib at (0, 0), for when the pen isn't writing: hovering over #14 and tapping. */
export function Stylus({ size, air }: { size: number; air: number }) {
  const w = size * 0.1;
  const l = size * 1.7;
  return (
    <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <g transform={`translate(0 ${-air * size * 0.12}) rotate(32)`}>
        <path d={`M0 0L${-w * 0.16} ${-w * 0.5}L${-w / 2} ${-w * 1.7}L${w / 2} ${-w * 1.7}L${w * 0.16} ${-w * 0.5}Z`} fill="#20242c" />
        <rect x={-w * 0.58} y={-w * 2.5} width={w * 1.16} height={w * 0.9} rx={w * 0.12} fill="#8d95a3" />
        <rect x={-w / 2} y={-l} width={w} height={l - w * 2.5} rx={w * 0.22} fill="#1c3f8f" />
        <rect x={-w * 0.17} y={-l} width={w * 0.34} height={l - w * 2.5} fill="#fff" opacity={0.18} />
      </g>
    </svg>
  );
}
