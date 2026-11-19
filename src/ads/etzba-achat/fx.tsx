import type { CSSProperties, ReactNode } from "react";
import { asset, random } from "../../engine";

/** The anime toolkit for etzba-achat: speed lines, katakana, balloons, narration boxes, name cards, aura, shake. */

export const SLUG = "etzba-achat";
export const FPS = 30;
export const cut = (name: string) => asset(`ads/${SLUG}/cut/${name}`);

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const p = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
export const out3 = (x: number) => 1 - (1 - x) ** 3;
export const out5 = (x: number) => 1 - (1 - x) ** 5;
export const in3 = (x: number) => x ** 3;
export const inOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
export const outBack = (x: number) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2;

export const FONT_CSS = `
@font-face{font-family:"Noto Sans";src:url("${asset(`ads/${SLUG}/NotoSans-wdth-wght.ttf`)}");font-weight:100 900;font-stretch:62.5% 100%}
@font-face{font-family:"Dela Gothic One";src:url("${asset(`ads/${SLUG}/DelaGothicOne-Regular.ttf`)}")}
.ea{position:absolute;inset:0;overflow:hidden;font-family:"Noto Sans",Arial,sans-serif;color:#171923}
.ea *{box-sizing:border-box}
.dock-small{width:46px;height:46px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;border:.5px solid rgba(101,94,228,.5)}
.dock-large{width:58px;height:58px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;border:1px solid rgba(23,25,35,.51);box-shadow:0 4px 15px rgba(0,0,0,.18);transform-origin:bottom center}
.gomlin-app{font-family:"Noto Sans",Arial,sans-serif;color:#171923;line-height:1.3}
.gomlin-app *{box-sizing:border-box}
`;

/** Camera shake: decaying jolts at the given times (seconds), deterministic per frame. */
export function shake(t: number, hits: number[], amp: number, decay = 0.18, seed = "shake") {
  let x = 0, y = 0, r = 0;
  for (const h of hits) {
    if (t < h || t > h + decay * 5) continue;
    const k = Math.exp(-(t - h) / decay);
    const step = Math.floor(t * FPS);
    x += (random(`${seed}-x-${h}-${step}`) * 2 - 1) * amp * k;
    y += (random(`${seed}-y-${h}-${step}`) * 2 - 1) * amp * k;
    r += (random(`${seed}-r-${h}-${step}`) * 2 - 1) * amp * 0.02 * k;
  }
  return { x, y, r };
}

/** Speed lines: radial (to a focus) or parallel (along an angle). Lines move every frame. */
export function SpeedLines({ w, h, t, mode = "radial", cx = w / 2, cy = h / 2, angle = -30, count = 90, color = "#fff", opacity = 0.5, inner = 0.35, seed = "sl", speed = 1 }: {
  w: number; h: number; t: number; mode?: "radial" | "parallel"; cx?: number; cy?: number; angle?: number; count?: number; color?: string; opacity?: number; inner?: number; seed?: string; speed?: number;
}) {
  const R = Math.hypot(w, h);
  const lines: ReactNode[] = [];
  const step = Math.floor(t * FPS * speed);
  for (let i = 0; i < count; i++) {
    const k = random(`${seed}-${i}-${step % 7}`);
    const width = 2 + random(`${seed}-w-${i}`) * 10;
    if (mode === "radial") {
      const a = (i / count) * Math.PI * 2 + random(`${seed}-a-${i}-${step % 5}`) * 0.05;
      const r0 = R * (inner + 0.25 * k);
      const x0 = cx + Math.cos(a) * r0, y0 = cy + Math.sin(a) * r0;
      const x1 = cx + Math.cos(a) * R, y1 = cy + Math.sin(a) * R;
      const nx = -Math.sin(a) * width, ny = Math.cos(a) * width;
      lines.push(<path key={i} d={`M${x0} ${y0} L${x1 + nx} ${y1 + ny} L${x1 - nx} ${y1 - ny} Z`} fill={color} />);
    } else {
      const a = (angle * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
      const off = (random(`${seed}-o-${i}`) * 2 - 1) * R;
      const len = R * (0.15 + 0.4 * random(`${seed}-l-${i}`));
      const along = ((random(`${seed}-s-${i}`) * 2 * R + t * 1800 * speed * (0.6 + random(`${seed}-v-${i}`))) % (2.4 * R)) - 1.2 * R;
      const px = w / 2 - dy * off + dx * along, py = h / 2 + dx * off + dy * along;
      lines.push(<path key={i} d={`M${px} ${py} L${px + dx * len} ${py + dy * len}`} stroke={color} strokeWidth={width * 0.5} strokeLinecap="round" />);
    }
  }
  return <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, opacity, pointerEvents: "none" }}>{lines}</svg>;
}

/**
 * Jagged manga katakana, hanging in the air: one word, set as one piece of text (vertical for a column), that
 * jitters every other frame. A soft halo behind it keeps the fill readable on a busy painting. `grow` scales it.
 */
export function Katakana({ text, x, y, size, t, color = "#171923", stroke = "#fff", rotate = -8, grow = 1, vertical = false, seed = "kk", opacity = 1, halo = "rgba(0,0,0,.6)" }: {
  text: string; x: number; y: number; size: number; t: number; color?: string; stroke?: string; rotate?: number; grow?: number; gap?: number; vertical?: boolean; seed?: string; opacity?: number; halo?: string;
}) {
  const step = Math.floor(t * FPS / 2);
  const jx = (random(`${seed}-x-${step}`) - 0.5) * size * 0.04;
  const jy = (random(`${seed}-y-${step}`) - 0.5) * size * 0.04;
  const jr = (random(`${seed}-r-${step}`) - 0.5) * 2.5;
  return (
    <div style={{ position: "absolute", left: x + jx, top: y + jy, transform: `rotate(${rotate + jr}deg) scale(${grow})`, transformOrigin: "0 0", opacity, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: `${-size * 0.35}px`, borderRadius: size * 0.6, background: `radial-gradient(closest-side, ${halo}, rgba(0,0,0,0))` }} />
      <span style={{
        position: "relative", display: "block", fontFamily: '"Dela Gothic One"', fontSize: size, lineHeight: 1.05, color, letterSpacing: "0.02em",
        writingMode: vertical ? "vertical-rl" : "horizontal-tb", WebkitTextStroke: `${size * 0.07}px ${stroke}`, paintOrder: "stroke fill",
        transform: "skewX(-8deg)", textShadow: `0 ${size * 0.04}px 0 rgba(0,0,0,.35)`, whiteSpace: "nowrap",
      }}>{text}</span>
    </div>
  );
}

/** A manga speech balloon: white, inked edge, a tail toward the speaker. `appear` 0..1 pops it in. */
export function Balloon({ text, x, y, w, size, tail, appear, shout = false, style }: {
  text: ReactNode; x: number; y: number; w: number; size: number; tail: [number, number]; appear: number; shout?: boolean; style?: CSSProperties;
}) {
  if (appear <= 0) return null;
  const s = appear < 1 ? 0.6 + 0.4 * outBack(appear) : 1;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, transform: `scale(${s})`, transformOrigin: `${tail[0] - x}px ${tail[1] - y}px`, opacity: clamp(appear * 3), zIndex: 50, ...style }}>
      <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }} width={1} height={1}>
        <path d={`M${w * 0.42} 30 L${tail[0] - x} ${tail[1] - y} L${w * 0.58} 30 Z`} fill="#fff" stroke="#111" strokeWidth={5} strokeLinejoin="round" />
      </svg>
      <div style={{
        position: "relative", background: "#fff", border: `${shout ? 6 : 5}px solid #111`, borderRadius: shout ? 26 : "50% / 42%",
        padding: `${size * 0.55}px ${size * 0.8}px`, textAlign: "center", fontWeight: 850, fontStretch: "75%", fontSize: size, lineHeight: 1.08,
        color: "#111", letterSpacing: "-0.01em", boxShadow: "0 10px 30px rgba(0,0,0,.35)",
      }}>{text}</div>
    </div>
  );
}

/** A manga narration box: a cream rectangle with an inked edge. */
export function Narration({ text, x, y, w, size, appear, style }: { text: ReactNode; x: number; y: number; w: number; size: number; appear: number; style?: CSSProperties }) {
  if (appear <= 0) return null;
  return (
    <div style={{
      position: "absolute", left: x, top: y, width: w, zIndex: 50, background: "#FFF6DC", border: "5px solid #111", padding: `${size * 0.42}px ${size * 0.6}px`,
      fontSize: size, fontWeight: 750, fontStyle: "italic", lineHeight: 1.12, color: "#111", boxShadow: "8px 8px 0 #111",
      transform: `translateX(${(1 - out5(clamp(appear))) * -60}px) skewX(-6deg)`, opacity: clamp(appear * 2.5), ...style,
    }}>{text}</div>
  );
}

/** A name card that slams in on a slant: a big title and a line of stats. */
export function NameCard({ title, stats, x, y, size, appear, accent, align = "left" }: {
  title: string; stats: string; x: number; y: number; size: number; appear: number; accent: string; align?: "left" | "right";
}) {
  if (appear <= 0) return null;
  const k = out5(clamp(appear));
  const from = align === "left" ? -1 : 1;
  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 45, transform: `translateX(${(1 - k) * from * 900}px) skewX(-12deg)`, textAlign: align }}>
      <div style={{ display: "inline-block", background: "#111", color: "#fff", padding: `${size * 0.12}px ${size * 0.4}px`, fontSize: size, fontWeight: 900, fontStretch: "70%", letterSpacing: "0.02em", lineHeight: 1, borderBottom: `${size * 0.14}px solid ${accent}` }}>{title}</div>
      <div style={{ marginTop: size * 0.22, display: "inline-block", background: accent, color: "#fff", padding: `${size * 0.1}px ${size * 0.35}px`, fontSize: size * 0.5, fontWeight: 850, fontStretch: "75%", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{stats}</div>
    </div>
  );
}

/** The hero's aura: a purple glow plus crackling static, redrawn every other frame. */
export function Aura({ cx, cy, rx, ry, t, power = 1, seed = "aura", bolts = 9 }: { cx: number; cy: number; rx: number; ry: number; t: number; power?: number; seed?: string; bolts?: number }) {
  if (power <= 0) return null;
  const step = Math.floor(t * FPS / 2);
  const paths: ReactNode[] = [];
  for (let b = 0; b < bolts; b++) {
    const a0 = random(`${seed}-a-${b}-${step}`) * Math.PI * 2;
    const len = 0.5 + random(`${seed}-l-${b}-${step}`) * 0.9;
    const segs = 9;
    let d = "";
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (len * i) / segs;
      const j = 1 + (random(`${seed}-j-${b}-${i}-${step}`) - 0.5) * 0.22;
      const x = cx + Math.cos(a) * rx * j, y = cy + Math.sin(a) * ry * j;
      d += `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    paths.push(<path key={b} d={d} fill="none" stroke="#E9E4FF" strokeWidth={3 + 3 * power} strokeLinejoin="bevel" />);
    paths.push(<path key={`g${b}`} d={d} fill="none" stroke="#8B7FF6" strokeWidth={12 + 10 * power} strokeOpacity={0.35} strokeLinejoin="bevel" />);
  }
  return (
    <>
      <div style={{ position: "absolute", left: cx - rx * 1.5, top: cy - ry * 1.5, width: rx * 3, height: ry * 3, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(139,127,246,.55), rgba(101,94,228,.25) 55%, rgba(101,94,228,0))", opacity: clamp(power), pointerEvents: "none" }} />
      <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", opacity: clamp(power), filter: "drop-shadow(0 0 8px #B9B0FF)" }} width={1} height={1}>{paths}</svg>
    </>
  );
}

/** An image placed by its centre and height (px), with optional extra transform and filter. */
export function Img({ src, cx, cy, h, flip = false, rotate = 0, scale = 1, filter, opacity = 1, style }: {
  src: string; cx: number; cy: number; h: number; flip?: boolean; rotate?: number; scale?: number; filter?: string; opacity?: number; style?: CSSProperties;
}) {
  return (
    <img src={src} alt="" style={{
      position: "absolute", left: cx, top: cy, height: h, width: "auto", transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${flip ? -scale : scale}, ${scale})`,
      filter, opacity, ...style,
    }} />
  );
}

/** CSS matrix3d that maps a w by h box onto four corners (TL, TR, BR, BL). */
export function quadMatrix(w: number, h: number, c: number[][]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = c;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det, hh = (dx1 * dy3 - dx3 * dy1) / det;
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, cc = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
  // unit square -> quad, then scale the box to the unit square
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, cc, f, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(",")})`;
}

/** Grows a quad from its centre by k (1.03 = 3% bigger), so the bezel hides any gap. */
export const growQuad = (c: number[][], k: number) => {
  const mx = c.reduce((s, q) => s + q[0], 0) / 4, my = c.reduce((s, q) => s + q[1], 0) / 4;
  return c.map(([x, y]) => [mx + (x - mx) * k, my + (y - my) * k]);
};
