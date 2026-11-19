import type { CSSProperties, ReactNode } from "react";
import { asset, random, useFrame, useVideo, type Ratio } from "../../engine";
import { HandText, handEntry } from "../../parts/hand";
import { Rough } from "../../parts/Rough";
import { clamp, easings, prog, type Span } from "../../parts/time";
import type { Cam } from "../../parts/camera";

export const SLUG = "under-pressure";
export const FPS = 30;
export const INK = "#1e1e1e";
export const PRIMARY = "#514fbb";
export const RESULT = "#5f3dc4";
export const TEXT = "#1a1c1c";
export const MUTED = "#464553";
export const CHALK = "#eef3ec";
export const BOARD = "#26342e";

/** Scene starts, in frames of the whole ad. They follow the storyboard rows and the voice in gen/timeline.json. */
export const AT = { board: 0, wipe: 195, press: 255, engine: 465, explain: 555, sim: 660, end: 825, stop: 900 } as const;
/** A moment of the ad, in seconds, as a frame of the scene that starts at `from`. */
export const at = (seconds: number, from: number) => Math.round(seconds * FPS) - from;

export const FONTS = `
@font-face{font-family:"Nunito";font-weight:200 1000;src:url("${asset(`ads/${SLUG}/Nunito-wght.ttf`)}")}
@font-face{font-family:"Arimo";font-weight:400 700;src:url("${asset(`ads/${SLUG}/Arimo-wght.ttf`)}")}
@font-face{font-family:"KaTeX_Math";font-style:italic;src:url("${asset(`ads/${SLUG}/KaTeX_Math-Italic.woff2`)}")}
@font-face{font-family:"Virgil";src:url("${asset(`ads/${SLUG}/Virgil-Regular.woff2`)}")}`;

export function Fonts() {
  return <style>{FONTS}</style>;
}

// ── handwriting placement ────────────────────────────────────────────────────

export type Place = { x: number; base: number; size: number };

/** Where a traced text's box sits when its baseline is at `base`. */
export function boxOf(id: string, p: Place) {
  const e = handEntry(SLUG, id);
  const k = p.size / e.size!;
  return { left: p.x, top: p.base - (e.y! - e.viewBox[1]) * k, width: e.viewBox[2] * k, height: e.viewBox[3] * k };
}

export function Hand({ id, p, write, color = INK, mode = "mask", pen = false, style }: { id: string; p: Place; write: Span; color?: string; mode?: "mask" | "ink"; pen?: boolean | ((tip: { x: number; y: number; air: number }) => ReactNode); style?: CSSProperties }) {
  const b = boxOf(id, p);
  return <HandText id={id} write={write} size={p.size} color={color} mode={mode} pen={pen} style={{ position: "absolute", left: b.left, top: b.top, ...style }} />;
}

/** η: a traced path, sized to sit on the same baseline as text of `size`. Returns its width too. */
const ETA = { vb: handEntry(SLUG, "etaSym").viewBox, base: 78 };
export const etaWidth = (size: number) => ETA.vb[2] * (size / 110) * 0.95;
export function Eta({ x, base, size, write, color = INK }: { x: number; base: number; size: number; write: Span; color?: string }) {
  const k = (size / 110) * 0.95;
  return <HandText id="etaSym" write={write} width={ETA.vb[2] * k} color={color} style={{ position: "absolute", left: x, top: base - (ETA.base - ETA.vb[1]) * k }} />;
}

/** "η = …": the η path, then the traced rest of the line. */
export function EtaLine({ id, p, write, color = INK }: { id: string; p: Place; write: Span; color?: string }) {
  const split = write[0] + Math.max(3, Math.round((write[1] - write[0]) * 0.18));
  return (
    <>
      <Eta x={p.x} base={p.base} size={p.size} write={[write[0], split]} color={color} />
      <Hand id={id} p={{ ...p, x: p.x + etaWidth(p.size) + p.size * 0.12 }} write={[split + 1, write[1]]} color={color} />
    </>
  );
}
export const etaLineBox = (id: string, p: Place) => {
  const rest = boxOf(id, { ...p, x: p.x + etaWidth(p.size) + p.size * 0.12 });
  return { left: p.x, top: rest.top, width: rest.left + rest.width - p.x, height: rest.height };
};

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

// ── the press ────────────────────────────────────────────────────────────────

const OUTER = "M160 360 L160 820 L1260 820 L1260 230";
const INNER = "M300 360 L300 700 L760 700 L760 230";

/** Where the press's writing goes, per ratio: to its right in landscape, under it otherwise. */
export const PRESS: Record<Ratio, { law: Place; nums: Place; res: Place }> = {
  "16x9": { law: { x: 1420, base: 300, size: 110 }, nums: { x: 1420, base: 520, size: 100 }, res: { x: 1420, base: 700, size: 100 } },
  "1x1": { law: { x: 120, base: 150, size: 116 }, nums: { x: 180, base: 1110, size: 110 }, res: { x: 180, base: 1300, size: 110 } },
  "9x16": { law: { x: 120, base: 150, size: 116 }, nums: { x: 180, base: 1110, size: 110 }, res: { x: 180, base: 1300, size: 110 } },
};

/** How fast the press is drawn: its spans below are written at pace 1 and shrink by this. */
const PACE = 0.84;
/** A drawn span, or finished when `from` is undefined. */
const span = (from: number | undefined, a: number, b: number): Span | undefined => (from === undefined ? undefined : [from + a * PACE, from + b * PACE]);
const done = (from: number | undefined, a: number, b: number): Span => (from === undefined ? [-3, -2] : [from + a * PACE, from + b * PACE]);

function Moving({ y, children }: { y: number; children: ReactNode }) {
  return <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, transform: `translateY(${y}px)` }}>{children}</div>;
}

/** The hydraulic press in ink. `drawFrom` draws it from that frame on; leave it out to show it drawn. `lift` raises the ram. */
export function Press({ ratio, drawFrom, lift, resultAt }: { ratio: Ratio; drawFrom?: number; lift: number; resultAt?: Span }) {
  const frame = useFrame();
  const fl = Math.min(lift, 60);
  const sink = Math.min(lift, 60) * 2.2;
  const fluid = drawFrom === undefined ? 1 : prog(frame, [drawFrom + 30 * PACE, drawFrom + 46 * PACE]);
  const p = PRESS[ratio];
  const sw = 7;
  return (
    <>
      <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <path d={`M163 ${454 + sink} L297 ${454 + sink} L297 697 L763 697 L763 ${382 - fl} L1257 ${382 - fl} L1257 817 L163 817 Z`} fill="#e2dfff" opacity={0.9 * fluid} />
      </svg>
      <Rough shape={{ kind: "path", d: OUTER }} draw={span(drawFrom, 0, 24)} seed={3} strokeWidth={sw} stroke={INK} />
      <Rough shape={{ kind: "path", d: INNER }} draw={span(drawFrom, 8, 30)} seed={5} strokeWidth={sw} stroke={INK} />
      <Moving y={sink}>
        <Rough shape={{ kind: "rect", x: 168, y: 418, w: 124, h: 36 }} draw={span(drawFrom, 26, 34)} seed={7} strokeWidth={sw} stroke={INK} fill="#fff" fillStyle="solid" />
        <Rough shape={{ kind: "arrow", from: [230, 190], to: [230, 408], head: 34 }} draw={span(drawFrom, 34, 44)} seed={9} strokeWidth={sw} stroke={PRIMARY} />
        <Hand id="n200" p={{ x: 268, base: 290, size: 64 }} write={done(drawFrom, 40, 52)} color={PRIMARY} />
      </Moving>
      <Moving y={-lift}>
        <Rough shape={{ kind: "rect", x: 768, y: 342, w: 484, h: 38 }} draw={span(drawFrom, 28, 38)} seed={11} strokeWidth={sw} stroke={INK} fill="#fff" fillStyle="solid" />
        <Rough shape={{ kind: "rect", x: 840, y: 214, w: 250, h: 128 }} draw={span(drawFrom, 36, 46)} seed={13} strokeWidth={sw} stroke={INK} fill="#c9c6f2" fillStyle="hachure" options={{ hachureGap: 16, fillWeight: 3 }} />
        <Rough shape={{ kind: "arrow", from: [1170, 330], to: [1170, 186], head: 34 }} draw={span(drawFrom, 44, 52)} seed={15} strokeWidth={sw} stroke={PRIMARY} />
        <Hand id="fq" p={{ x: 1194, base: 270, size: 72 }} write={done(drawFrom, 50, 54)} color={PRIMARY} />
      </Moving>
      <Hand id="a4" p={{ x: 120, base: 920, size: 60 }} write={done(drawFrom, 52, 60)} color={PRIMARY} />
      <Hand id="sq" p={{ x: 120 + boxOf("a4", { x: 0, base: 0, size: 60 }).width + 2, base: 892, size: 34 }} write={done(drawFrom, 60, 62)} color={PRIMARY} />
      <Hand id="a100" p={{ x: 850, base: 920, size: 60 }} write={done(drawFrom, 60, 70)} color={PRIMARY} />
      <Hand id="sq" p={{ x: 850 + boxOf("a100", { x: 0, base: 0, size: 60 }).width + 2, base: 892, size: 34 }} write={done(drawFrom, 70, 72)} color={PRIMARY} />
      <Hand id="law" p={p.law} write={done(drawFrom, 72, 92)} pen={drawFrom !== undefined} />
      <Hand id="nums" p={p.nums} write={done(drawFrom, 94, 128)} pen={drawFrom !== undefined} />
      {resultAt && <Hand id="res" p={p.res} write={resultAt} color={RESULT} />}
    </>
  );
}

// ── the heat engine ──────────────────────────────────────────────────────────

/** Where the engine's line goes, per ratio. */
export const ENGINE: Record<Ratio, { eta: Place; res: Place }> = {
  "16x9": { eta: { x: 960, base: 1930, size: 100 }, res: { x: 960, base: 2130, size: 100 } },
  "1x1": { eta: { x: 150, base: 2580, size: 96 }, res: { x: 150, base: 2770, size: 96 } },
  "9x16": { eta: { x: 150, base: 2580, size: 96 }, res: { x: 150, base: 2770, size: 96 } },
};

const wave = (x: number, y0: number, y1: number) => {
  let d = `M${x} ${y0}`;
  const n = 4;
  for (let i = 1; i <= n; i++) d += ` Q${x + (i % 2 ? 16 : -16)} ${y0 + ((i - 0.5) / n) * (y1 - y0)} ${x} ${y0 + (i / n) * (y1 - y0)}`;
  return d;
};

/** A gas piston between a hot block and a cold one. The piston breathes; gas dots drift with it. */
export function Engine({ ratio, eqWrite, resWrite }: { ratio: Ratio; eqWrite?: Span; resWrite?: Span }) {
  const frame = useFrame();
  const px = 560 + 46 * Math.sin(frame * 0.16);
  const e = ENGINE[ratio];
  const dots = Array.from({ length: 26 }, (_, i) => {
    const fx = random(`gas-x-${i}`), fy = random(`gas-y-${i}`);
    const jx = 10 * Math.sin(frame * 0.4 + i * 1.7), jy = 10 * Math.cos(frame * 0.33 + i * 2.3);
    return { x: 280 + fx * (px - 300) + jx, y: 1800 + fy * 240 + jy };
  });
  return (
    <>
      <Rough shape={{ kind: "rect", x: 200, y: 1500, w: 560, h: 160 }} seed={21} strokeWidth={7} stroke={INK} fill="#ffd8cc" fillStyle="solid" />
      <Hand id="hot" p={{ x: 330, base: 1612, size: 84 }} write={[-3, -2]} />
      {[340, 480, 620].map((x, i) => (
        <Rough key={`in${x}`} shape={{ kind: "path", d: wave(x, 1676, 1764) }} seed={23 + i} strokeWidth={6} stroke="#d9480f" />
      ))}
      <Rough shape={{ kind: "path", d: "M720 1780 L260 1780 L260 2060 L720 2060" }} seed={27} strokeWidth={7} stroke={INK} />
      <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={9} fill={PRIMARY} opacity={0.55} />
        ))}
      </svg>
      <div style={{ position: "absolute", left: 0, top: 0, transform: `translateX(${px - 560}px)` }}>
        <Rough shape={{ kind: "rect", x: 560, y: 1786, w: 40, h: 268 }} seed={29} strokeWidth={7} stroke={INK} fill="#fff" fillStyle="solid" />
        <Rough shape={{ kind: "line", from: [600, 1920], to: [860, 1920] }} seed={31} strokeWidth={9} stroke={INK} />
      </div>
      {[340, 480, 620].map((x, i) => (
        <Rough key={`out${x}`} shape={{ kind: "path", d: wave(x, 2076, 2204) }} seed={33 + i} strokeWidth={6} stroke="#1971c2" />
      ))}
      <Rough shape={{ kind: "rect", x: 200, y: 2220, w: 560, h: 160 }} seed={37} strokeWidth={7} stroke={INK} fill="#d3e4fb" fillStyle="solid" />
      <Hand id="cold" p={{ x: 330, base: 2332, size: 84 }} write={[-3, -2]} />
      <EtaLine id="eta" p={e.eta} write={eqWrite ?? [-3, -2]} />
      {resWrite && <EtaLine id="etaRes" p={e.res} write={resWrite} color={RESULT} />}
    </>
  );
}

// ── words on screen ──────────────────────────────────────────────────────────

/** A headline: its words rise in one after another, and it fades out at `until`. */
export function Head({ text, from, until, size, color = TEXT, style, slam = false, weight = 900, stagger = 3, plate = false }: { text: string; from: number; until?: number; size: number; color?: string; style: CSSProperties; slam?: boolean; weight?: number; stagger?: number; plate?: boolean }) {
  const frame = useFrame();
  const out = until === undefined ? 1 : 1 - prog(frame, [until - 6, until]);
  if (frame < from - 1 || out <= 0) return null;
  const words = text.split(" ");
  // `plate`: a soft white card behind the words, for when they sit over the drawing.
  const card: CSSProperties = plate ? { background: "rgba(255,255,255,.93)", padding: `${size * 0.18}px ${size * 0.3}px`, borderRadius: size * 0.25, boxShadow: "0 4px 24px rgba(0,0,0,.06)", opacity: out * prog(frame, [from - 1, from + 4]) } : {};
  return (
    <div style={{ position: "absolute", fontFamily: '"Nunito", sans-serif', fontWeight: weight, fontSize: size, lineHeight: 1.04, letterSpacing: "-0.025em", color, opacity: out, ...style, ...card }}>
      {words.map((w, i) => {
        if (w === "|") return <br key={i} />; // A forced line break.
        const t0 = from + i * stagger;
        const k = slam ? easings.outBack(prog(frame, [t0, t0 + 7], easings.linear)) : easings.outCubic(prog(frame, [t0, t0 + 9], easings.linear));
        const a = prog(frame, [t0, t0 + 3], easings.linear);
        const tf = slam ? `scale(${1.6 - 0.6 * k})` : `translateY(${(1 - k) * size * 0.45}px)`;
        return (
          <span key={i} style={{ display: "inline-block", opacity: a, transform: tf, transformOrigin: "50% 80%", marginRight: i < words.length - 1 ? "0.24em" : 0 }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}

// ── app chrome ───────────────────────────────────────────────────────────────

/** The real toolbar and zoom control, from the live canvas. */
export function Chrome({ ratio, opacity = 1, toolbar = true }: { ratio: Ratio; opacity?: number; toolbar?: boolean }) {
  const { width } = useVideo();
  const ui = ratio === "16x9" ? 1.25 : 1.15;
  const tw = 313 * ui;
  return (
    <div style={{ position: "absolute", inset: 0, opacity, pointerEvents: "none" }}>
      {toolbar && <img src={asset(`ads/${SLUG}/toolbar.png`)} alt="" style={{ position: "absolute", left: width / 2 - tw / 2, top: 22, width: tw, borderRadius: 12 * ui, boxShadow: "0 2px 12px rgba(0,0,0,.1)" }} />}
      <img src={asset(`ads/${SLUG}/zoom.png`)} alt="" style={{ position: "absolute", left: 28, bottom: 28, width: 253 * ui * 0.8, borderRadius: 8 * ui }} />
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
/** The centre of a bar item, measured from the bar's left edge. */
export const itemCentre = (index: number, ui: number) => (ITEMS.slice(0, index).reduce((s, [, w]) => s + w, 0) + ITEMS[index][1] / 2) * ui;

export function SelectionBar({ left, bottom, ui, appear, loading, loadingFrom, loadingUntil = Infinity, caretAt }: { left: number; bottom: number; ui: number; appear: number; loading?: number; loadingFrom: number; loadingUntil?: number; caretAt: number }) {
  const frame = useFrame();
  const pop = easings.outBack(prog(frame, [appear, appear + 6], easings.linear));
  return (
    <div dir="ltr" style={{ position: "absolute", left, top: bottom - 33 * ui, height: 33 * ui, opacity: prog(frame, [appear, appear + 3], easings.linear), transform: `translateY(${(1 - pop) * 10}px)`, filter: "drop-shadow(0 3px 10px rgba(0,0,0,.14))" }}>
      <div style={{ display: "flex", height: "100%", background: "#fff", border: `${ui}px solid rgba(0,0,0,.08)`, borderRadius: 10 * ui, overflow: "hidden", fontFamily: '"Arimo", sans-serif', fontSize: 13.33 * ui, color: "#1a1a1a", boxSizing: "border-box" }}>
        {ITEMS.map(([label, width], i) => (
          <div key={label} style={{ position: "relative", width: width * ui, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 * ui, flex: "none" }}>
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
