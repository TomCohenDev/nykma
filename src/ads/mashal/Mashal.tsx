import type { CSSProperties, ReactNode } from "react";
import { asset, random, useFrame, type AdProps, type CueInput, type Cue, type Ratio } from "../../engine";
import { CameraView, camAt, type Cam } from "../../parts/camera";
import { Cursor, type CursorKey } from "../../parts/Cursor";
import { isolate } from "../../parts/bidi";
import { HandText, handCues, handEntry, handGen, penAt, penProgress, type HandWrite } from "../../parts/hand";
import { clamp, easings, lerp, prog } from "../../parts/time";
import { FRAMES, HE_WRITES, L, MATH_WRITES, T, plan, splitWrite, widthAt, type Place } from "./layout";

export { FRAMES };

/**
 * A proof in an Israeli squared notebook: Hebrew comes from the right, the equation from the left, and they crash in the
 * middle of the line. Then the notebook loses its edges and turns out to be the app's own canvas, whose default look is
 * this same square grid. No voice and no titles: the handwriting is the script.
 */
const BLUE = "#1f3fa8";
const RED = "#d3302a";
const INK = "#1e1e1e"; // The app's stroke colour.
const DESK = "#514fbb"; // The app's primary.
const LATTICE = 40; // One notebook square, and one fine step of the canvas grid.

const FONTS = `
@font-face{font-family:"Rubik";font-weight:300 900;src:url("${asset("ads/mashal/Rubik-wght.ttf")}")}
@font-face{font-family:"Nunito";font-weight:200 1000;src:url("${asset("ads/mashal/Nunito-wght.ttf")}")}
@font-face{font-family:"Arimo";font-weight:400 700;src:url("${asset("ads/mashal/Arimo-wght.ttf")}")}
@font-face{font-family:"KaTeX_Math";font-style:italic;src:url("${asset("ads/mashal/KaTeX_Math-Italic.woff2")}")}`;

type Mark = HandWrite & { place: Place; color: string; width?: number };

const baseOf = (id: string, scale: number, base: number) => {
  const e = handEntry("mashal", id);
  return base - (e.y! - e.viewBox[1]) * scale;
};

/** Where a mark's box sits, in world pixels. */
function boxOf(mark: Mark) {
  const e = handEntry("mashal", mark.id);
  const scale = mark.width ? mark.width / e.viewBox[2] : mark.place.size / e.size!;
  const top = mark.width ? mark.place.base : baseOf(mark.id, scale, mark.place.base);
  return { left: mark.place.x, top, scale, e };
}

function Ink({ mark, opacity = 1 }: { mark: Mark; opacity?: number }) {
  const { left, top } = boxOf(mark);
  return (
    <HandText
      id={mark.id}
      write={mark.write}
      erase={mark.erase}
      {...(mark.width ? { width: mark.width } : { size: mark.place.size })}
      color={mark.color}
      style={{ position: "absolute", left, top, opacity }}
    />
  );
}

/** The tip of a mark's pen, in world pixels. */
function tipOf(mark: Mark, frame: number) {
  const { left, top, scale, e } = boxOf(mark);
  const tip = penAt(e, penProgress(e, frame, { write: mark.write }));
  return { x: left + (tip.x - e.viewBox[0]) * scale, y: top + (tip.y - e.viewBox[1]) * scale, air: tip.air };
}

/** One pen across a list of marks: on the page while it writes, in the air between marks. */
function penOn(marks: Mark[], frame: number, enter: { x: number; y: number }, leave: { x: number; y: number }, wait = 14) {
  const first = marks[0];
  const last = marks[marks.length - 1];
  if (frame < first.write[0] - wait || frame > last.write[1] + wait) return null;
  if (frame < first.write[0]) {
    const to = tipOf(first, first.write[0]);
    const k = easings.outCubic(prog(frame, [first.write[0] - wait, first.write[0]]));
    return { x: lerp(to.x + enter.x, to.x, k), y: lerp(to.y + enter.y, to.y, k), air: 1 - k };
  }
  if (frame > last.write[1]) {
    const from = tipOf(last, last.write[1]);
    const k = easings.inCubic(prog(frame, [last.write[1], last.write[1] + wait]));
    return { x: lerp(from.x, from.x + leave.x, k), y: lerp(from.y, from.y + leave.y, k), air: k };
  }
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    if (frame <= mark.write[1]) {
      if (frame >= mark.write[0]) return tipOf(mark, frame);
      const before = marks[i - 1];
      const [a, b] = [tipOf(before, before.write[1]), tipOf(mark, mark.write[0])];
      const k = easings.inOutSine(prog(frame, [before.write[1], mark.write[0]]));
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), air: Math.sin(Math.PI * k) };
    }
  }
  return null;
}

/** A clear ballpoint held at a slant. Drawn with the tip at (0, 0). */
function Ballpoint({ x, y, air, length, color, left = false }: { x: number; y: number; air: number; length: number; color: string; left?: boolean }) {
  const w = length * 0.075;
  const lift = air * length * 0.05;
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible", width: 1, height: 1, pointerEvents: "none" }}>
      <g transform={`translate(${x + (left ? -1 : 1) * (w * 0.5 + lift * 0.9)} ${y + w * 0.5 + lift * 1.1}) rotate(${left ? 38 : -38})`} opacity={0.14}>
        <rect x={-w / 2} y={0} width={w} height={length} rx={w / 2} fill="#10122e" />
      </g>
      <g transform={`translate(${x} ${y - lift}) rotate(${left ? 34 : -34})`}>
        <path d={`M0 0L${-w * 0.14} ${w * 0.55}L${-w * 0.42} ${w * 1.9}L${w * 0.42} ${w * 1.9}L${w * 0.14} ${w * 0.55}Z`} fill="#aeb4c0" />
        <path d={`M${-w * 0.5} ${w * 1.9}L${w * 0.5} ${w * 1.9}L${w * 0.5} ${length - w}L${-w * 0.5} ${length - w}Z`} fill="#f4f6fb" opacity={0.92} stroke="#c6ccda" strokeWidth={w * 0.05} />
        <rect x={-w * 0.13} y={w * 1.9} width={w * 0.26} height={length * 0.68} fill={color} />
        <rect x={-w * 0.36} y={w * 1.9} width={w * 0.12} height={length - w * 2.9} fill="#fff" opacity={0.8} />
        <rect x={-w * 0.52} y={length - w} width={w * 1.04} height={w * 1.1} rx={w * 0.26} fill={color} />
      </g>
    </svg>
  );
}

/** The paper, the lattice, and the desk. As the desk goes, the notebook's squares become the canvas grid. */
function Paper({ frame, ratio }: { frame: number; ratio: Ratio }) {
  const g = L[ratio];
  const gone = easings.inOutCubic(prog(frame, [T.open, T.openDone]));
  const app = prog(frame, [T.open + 10, T.openDone]);
  const left = lerp(g.page[0], -3600, gone);
  const right = lerp(g.page[1], 5200, gone);
  const box = { x: -6000, y: -5000, width: 14000, height: 12000 };
  const rings = Array.from({ length: 34 }, (_, i) => -600 + i * 2 * LATTICE);
  return (
    <>
      <div style={{ position: "absolute", left: -7000, top: -7000, width: 16000, height: 16000, background: DESK }} />
      <div style={{ position: "absolute", left, top: -5000, width: right - left, height: 12000, background: `rgb(${lerp(255, 255, app)} ${lerp(254, 255, app)} ${lerp(250, 255, app)})`, boxShadow: "0 0 90px rgba(12,10,60,.55)" }} />
      <svg style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible" }}>
        <defs>
          <clipPath id="mashal-page">
            <rect x={left} y={-5000} width={right - left} height={12000} />
          </clipPath>
          <pattern id="mashal-squares" width={LATTICE} height={LATTICE} patternUnits="userSpaceOnUse">
            <path d={`M${LATTICE} 0H0V${LATTICE}`} fill="none" stroke="#bccee6" strokeWidth={1.6} />
          </pattern>
          <pattern id="mashal-fine" width={LATTICE} height={LATTICE} patternUnits="userSpaceOnUse">
            <path d={`M${LATTICE} 0H0V${LATTICE}`} fill="none" stroke="#e5e5e5" strokeWidth={2} strokeDasharray="4.5 4.5" />
          </pattern>
          <pattern id="mashal-major" width={LATTICE * 5} height={LATTICE * 5} patternUnits="userSpaceOnUse">
            <path d={`M${LATTICE * 5} 0H0V${LATTICE * 5}`} fill="none" stroke="#e5e5e5" strokeWidth={2.4} />
          </pattern>
        </defs>
        <g clipPath="url(#mashal-page)">
          <rect {...box} fill="url(#mashal-squares)" opacity={1 - app} />
          <rect {...box} fill="url(#mashal-fine)" opacity={app * (1 - prog(frame, [T.away, T.away + 14]))} />
          <rect {...box} fill="url(#mashal-major)" opacity={app} />
          <path d={`M${g.margin} -5000V7000`} stroke={RED} strokeWidth={3} opacity={0.72 * (1 - prog(frame, [T.open, T.open + 16]))} />
        </g>
        {frame < T.openDone &&
          rings.map((y) => (
            <g key={y} transform={`translate(${right - 26} ${y})`}>
              <circle r={9} fill="#3b3a8a" />
              <path d="M0 0C14 -14 40 -14 54 -6" fill="none" stroke="#c9cdd8" strokeWidth={6} strokeLinecap="round" />
            </g>
          ))}
      </svg>
    </>
  );
}

/** The spot where the two inks met: a blot with drops, grown over a few frames, gone when the line relaxes. */
function Blot({ x, y, size, frame }: { x: number; y: number; size: number; frame: number }) {
  if (frame < T.crash) return null;
  const grow = easings.outExpo(prog(frame, [T.crash, T.crash + 7]));
  const shrink = 1 - easings.inOutCubic(prog(frame, [T.open + 6, T.open + 40]));
  if (shrink <= 0) return null;
  const points = 26;
  const outline = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    const r = size * (0.32 + 0.34 * random(`blot-${i}`) ** 2 + (i % 5 === 0 ? 0.3 * random(`spike-${i}`) : 0));
    return [Math.cos(a) * r * 1.5, Math.sin(a) * r] as const;
  });
  const smooth = outline.map(([px, py], i) => {
    const [nx, ny] = outline[(i + 1) % points];
    return `${i ? "" : `M${(px + nx) / 2} ${(py + ny) / 2}`}Q${nx} ${ny} ${(nx + outline[(i + 2) % points][0]) / 2} ${(ny + outline[(i + 2) % points][1]) / 2}`;
  });
  const drops = Array.from({ length: 22 }, (_, i) => {
    const a = random(`drop-a-${i}`) * Math.PI * 2;
    const d = size * (0.8 + 1.4 * random(`drop-d-${i}`)) * grow;
    return <circle key={i} cx={Math.cos(a) * d * 1.5} cy={Math.sin(a) * d * 0.8} r={size * (0.015 + 0.05 * random(`drop-r-${i}`) ** 2)} fill="#16246b" />;
  });
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible" }}>
      <g transform={`translate(${x} ${y}) scale(${grow * shrink})`}>
        {drops}
        <path d={`${smooth.join("")}Z`} fill="#16246b" />
      </g>
    </svg>
  );
}

/** The app's selection bar, rebuilt from SelectionActionBar.tsx and styles.css, at the widths measured on the live canvas. */
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

function SelectionBar({ left, bottom, ui, count, loading, frame, caretAt, bleed }: { left: number; bottom: number; ui: number; count: number; loading: boolean; frame: number; caretAt: number; bleed: boolean }) {
  const pop = easings.outBack(prog(frame, [T.bar, T.bar + 6]));
  return (
    <div dir="ltr" style={{ position: "absolute", left, top: bottom - 33 * ui, height: 33 * ui, opacity: prog(frame, [T.bar, T.bar + 3]), transform: `translateY(${(1 - pop) * 10}px)`, filter: "drop-shadow(0 3px 10px rgba(0,0,0,.14))" }}>
      <div style={{ display: "flex", height: "100%", background: "#fff", border: `${ui}px solid rgba(0,0,0,.08)`, borderRadius: 10 * ui, overflow: "hidden", fontFamily: '"Arimo", sans-serif', fontSize: 13.33 * ui, color: "#1a1a1a", boxSizing: "border-box", ...(bleed ? { width: 1400, borderRight: "none" } : {}) }}>
        {ITEMS.slice(0, count).map(([label, width], i) => (
          <div key={label} style={{ position: "relative", width: width * ui, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 * ui, flex: "none" }}>
            {i > 0 && <span style={{ position: "absolute", left: 0, top: 6 * ui, bottom: 6 * ui, width: ui, background: "rgba(0,0,0,.1)" }} />}
            {i === 0 && loading && (
              <span style={{ width: 10 * ui, height: 10 * ui, flex: "none", borderRadius: "50%", border: `${1.5 * ui}px solid rgba(0,0,0,.15)`, borderTopColor: "#514fbb", boxSizing: "border-box", transform: `rotate(${(frame - T.click) * 26}deg)` }} />
            )}
            {label}
          </div>
        ))}
      </div>
      <span style={{ position: "absolute", left: caretAt, bottom: -5 * ui, width: 10 * ui, height: 10 * ui, marginLeft: -5 * ui, background: "#fff", transform: "rotate(45deg)", borderRight: `${ui}px solid rgba(0,0,0,.08)`, borderBottom: `${ui}px solid rgba(0,0,0,.08)` }} />
    </div>
  );
}

const shot = (cam: Cam, width: number, height: number, x: number, y: number) => ({ x: width / 2 + (x - cam.cx) * cam.z, y: height / 2 + (y - cam.cy) * cam.z });

/** Real pixels from the live canvas, and the rebuilt selection on top, in screen space so they don't scale with the camera. */
function AppLayer({ frame, ratio, cam, width, height }: { frame: number; ratio: Ratio; cam: Cam; width: number; height: number }) {
  const g = L[ratio];
  const { source, mathRelax } = plan(ratio);
  const show = prog(frame, [T.chrome, T.chrome + 10]) * (1 - prog(frame, [T.away, T.away + 8]));
  if (show <= 0) return null;
  const ui = g.ui;
  const a = shot(cam, width, height, source.left, source.top);
  const b = shot(cam, width, height, source.right, source.bottom);
  const drag = easings.inOutQuad(prog(frame, [T.drag[0], T.drag[1]]));
  const dragging = frame >= T.drag[0] && frame < T.drag[1];
  const selected = frame >= T.drag[1] && frame < T.answer[0] + 2;
  const safeCentre = width / 2;
  const toolbar = 313 * (g.toolbarUi ?? ui);
  const safe = ratio === "16x9" ? 96 : 54;
  const barWidth = ITEMS.slice(0, g.barItems).reduce((sum, [, w]) => sum + w, 0) * ui;
  const barLeft = g.barLeft ?? clamp((a.x + b.x) / 2 - barWidth / 2, safe - 12, width - barWidth - safe + 12);
  const barBottom = a.y - 10 * ui;
  const solveAt = { x: barLeft + 50 * ui, y: barBottom - 15 * ui };
  const keys: CursorKey[] = [
    { f: T.chrome, x: a.x - 90, y: a.y - 70 },
    { f: T.drag[0], x: a.x, y: a.y },
    { f: T.drag[1], x: b.x, y: b.y, ease: easings.inOutQuad },
    { f: T.bar + 4, x: b.x, y: b.y },
    { f: T.click, x: solveAt.x, y: solveAt.y, click: true },
    { f: T.answer[0] + 8, x: solveAt.x, y: solveAt.y },
    { f: T.answer[1] + 12, x: b.x + 60, y: b.y + 280 },
  ];
  const handle = 11 * ui;
  const dashed = (x: number, y: number, w: number, h: number): CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h, boxSizing: "border-box" });
  return (
    <div style={{ position: "absolute", inset: 0, opacity: show, pointerEvents: "none" }}>
      <img src={asset("ads/mashal/toolbar.png")} alt="" style={{ position: "absolute", left: safeCentre - toolbar / 2, top: g.toolbarTop, width: toolbar, borderRadius: 12 * (g.toolbarUi ?? ui), boxShadow: "0 2px 12px rgba(0,0,0,.1)" }} />
      {g.zoomBottom > 0 && <img src={asset("ads/mashal/zoom.png")} alt="" style={{ position: "absolute", left: 40, bottom: g.zoomBottom, width: 253 * ui * 0.8, borderRadius: 8 * ui }} />}
      {dragging && (
        <div style={{ ...dashed(a.x, a.y, (b.x - a.x) * drag, (b.y - a.y) * drag), border: `${1.2 * ui}px solid #6965db`, background: "rgba(105,101,219,.1)" }} />
      )}
      {selected && (
        <>
          <div style={{ ...dashed(a.x, a.y, b.x - a.x, b.y - a.y), border: `${ui}px dashed #6965db` }} />
          {[[a.x, a.y], [b.x, a.y], [a.x, b.y], [b.x, b.y]].map(([x, y], i) => (
            <div key={i} style={{ ...dashed(x - handle / 2, y - handle / 2, handle, handle), background: "#fff", border: `${ui}px solid #6965db`, borderRadius: 3 * ui }} />
          ))}
          {mathRelax.map((_, i) => {
            const id = MATH_WRITES[i].id;
            if (id === "m1s") return null; // Grouped with its x.
            const p = mathRelax[i];
            const next = id === "m1" ? mathRelax[i + 1] : undefined;
            const from = shot(cam, width, height, p.x, source.top + 8);
            const to = shot(cam, width, height, next ? next.x + widthAt("m1s", next.size) : p.x + widthAt(id, p.size), source.bottom - 8);
            return <div key={id} style={{ ...dashed(from.x, from.y, to.x - from.x, to.y - from.y), border: `${0.7 * ui}px solid rgba(105,101,219,.55)` }} />;
          })}
          <SelectionBar left={barLeft} bottom={barBottom} ui={ui} count={g.barItems} loading={frame >= T.click} frame={frame} caretAt={(a.x + b.x) / 2 - barLeft} bleed={!!g.barLeft} />
        </>
      )}
      <Cursor keys={keys} size={24 * ui} color="#fff" outline="#111" rippleColor="#6965db" rippleSize={90 * ui} />
    </div>
  );
}

/** The whole proof for a ratio: what's written, by which pen, when. */
function marksFor(ratio: Ratio) {
  const g = L[ratio];
  const p = plan(ratio);
  const he = (rows: ReturnType<typeof splitWrite>, size: number): Mark[] => rows.map(({ id, base, write }) => ({ id, write, color: BLUE, place: { x: g.right - widthAt(id, size), base, size } }));
  const g1 = he(splitWrite(g.g1, T.g1), g.he);
  const g2 = he(splitWrite(g.g2, T.g2), g.he);
  const q = he(splitWrite(g.q, T.q), g.he);
  const c = he(splitWrite(g.c, T.c), g.he);
  const arrow1: Mark = { id: "arrowLeft", write: T.arrow1, color: BLUE, width: g.arrowWidth, place: { x: g.right - g.arrowWidth, base: g.arrow1, size: 0 } };
  const arrow2: Mark = { id: "arrowRight", write: T.arrow2, color: BLUE, width: g.arrowWidth, place: { x: g.right - g.arrowWidth, base: g.arrow2, size: 0 } };
  const proof: Mark = { id: "proof", write: T.proof, color: BLUE, place: p.proof };
  const circleX = p.wreck.x - g.circleWidth / 2;
  const circleHeight = g.circleWidth * 0.36;
  const circle: Mark = { id: "circle", write: T.circle, erase: [T.open + 4, T.open + 26], color: RED, width: g.circleWidth, place: { x: circleX, base: p.wreck.y - circleHeight / 2 + g.he * 0.22, size: 0 } };
  const r1Width = widthAt("r1", g.red);
  const red1: Mark = { id: "r1", write: T.red1, color: RED, place: { x: g.redRight - r1Width, base: g.redBase, size: g.red } };
  const red2: Mark = { id: "r2", write: T.red2, color: RED, place: { x: g.redRight - r1Width - g.red * 0.3 - widthAt("r2", g.red), base: g.redBase, size: g.red } };
  const strikeWidth = r1Width * 1.2;
  const strike: Mark = { id: "strike", write: T.strike, color: RED, width: strikeWidth, place: { x: red1.place.x - r1Width * 0.1, base: g.redBase - g.red * 0.62, size: 0 } };
  const open: Mark = { id: "open", write: T.words, color: BLUE, place: { x: g.open.right - widthAt("open", g.open.size), base: g.open.base, size: g.open.size } };
  const tag: Mark = { id: "tag", write: T.tag, color: BLUE, place: { x: g.tag.right - widthAt("tag", g.tag.size), base: g.tag.base, size: g.tag.size } };
  const answer: Mark = { id: "answer", write: T.answer, color: INK, place: { x: p.source.left + 8, base: g.answer.base, size: g.answer.size } };
  return { g1, g2, q, c, arrow1, arrow2, proof, circle, red1, red2, strike, open, tag, answer };
}

/** A word or term of the crash line, sliding from where it crashed to where it fits. */
const relaxed = (from: Place, to: Place, k: number): Place => ({ x: lerp(from.x, to.x, k), base: lerp(from.base, to.base, k), size: lerp(from.size, to.size, k) });

function Wordmark({ size }: { size: number }) {
  return (
    <div dir="ltr" aria-label="logo" style={{ display: "inline-flex", alignItems: "center", fontSize: size, fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: "#1a1c1c", lineHeight: 1 }}>
      <img src={asset("ads/mashal/icon.png")} alt="logo" style={{ width: "1.2em", height: "1.2em", marginBottom: "0.2em", display: "block" }} />
      <span>
        athbook
        <span style={{ fontFamily: '"KaTeX_Math", serif', fontStyle: "italic", fontWeight: 400 }}>LM</span>
      </span>
    </div>
  );
}

function EndPanel({ frame, ratio, width }: { frame: number; ratio: Ratio; width: number }) {
  const g = L[ratio];
  const veil = prog(frame, T.veil);
  if (veil <= 0) return null;
  const e = g.end;
  const rise = (at: number) => {
    const k = easings.outCubic(prog(frame, [at, at + 12]));
    return { opacity: k, transform: `translateY(${(1 - k) * 18}px)` } as CSSProperties;
  };
  const tagScale = widthAt("tag", e.tag);
  const qedMark: Mark = { id: "qed", write: T.qed, color: RED, place: { x: e.qed.left, base: e.qed.base, size: e.qed.size } };
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", left: 0, top: e.top, width, display: "flex", flexDirection: "column", alignItems: "center", gap: e.gap }}>
        <div style={rise(T.card - 8)}>
          <Wordmark size={e.mark} />
        </div>
        <div style={{ ...rise(T.card - 2), width: tagScale, height: e.tag * 1.3, position: "relative" }}>
          <HandText id="tag" write={[T.card - 2, T.card - 1]} size={e.tag} color={BLUE} style={{ position: "absolute", left: 0, top: 0 }} />
        </div>
        <bdi dir="ltr" style={{ ...rise(T.card + 4), display: "block", fontFamily: '"Nunito", sans-serif', fontWeight: 800, fontSize: e.url, color: "#fff", background: DESK, padding: `${e.url * 0.3}px ${e.url * 0.8}px`, borderRadius: e.url * 0.5 }}>
          mathbooklm.com
        </bdi>
        <div style={{ ...rise(T.card + 10), fontFamily: '"Rubik", sans-serif', fontWeight: 500, fontSize: e.price, color: "#1a1c1c" }}>{isolate("חינם להתחלה · Premium ‏₪34.99 לחודש", "rtl")}</div>
      </div>
      <Ink mark={qedMark} />
      <Pens marks={[qedMark]} frame={frame} length={e.qed.size * 4.4} color={RED} from={{ x: 280, y: 200 }} to={{ x: 340, y: 260 }} />
    </div>
  );
}

function Pens({ marks, frame, length, color, left, from, to, wait }: { marks: Mark[]; frame: number; length: number; color: string; left?: boolean; from: { x: number; y: number }; to: { x: number; y: number }; wait?: number }) {
  const tip = penOn(marks, frame, from, to, wait);
  return tip ? <Ballpoint {...tip} length={length} color={color} left={left} /> : null;
}

export function Mashal({ ratio }: AdProps) {
  const frame = useFrame();
  const g = L[ratio];
  const { width, height } = { "16x9": { width: 1920, height: 1080 }, "1x1": { width: 1080, height: 1080 }, "9x16": { width: 1080, height: 1920 } }[ratio];
  const p = plan(ratio);
  const m = marksFor(ratio);

  const base = camAt(frame, g.cam);
  const after = frame - T.crash;
  const shake = after >= 0 && after < 20 ? Math.exp(-after / 6) * 18 : 0;
  const cam = { cx: base.cx + shake * Math.sin(after * 2.3), cy: base.cy + shake * Math.cos(after * 3.1), z: base.z };

  const heMarks: Mark[] = HE_WRITES.map(({ id, write }, i) => {
    const k = easings.inOutCubic(prog(frame, [T.open + 12 + i * 3, T.openDone + i * 3]));
    return { id, write, color: BLUE, place: relaxed(p.heCrash[i], p.heRelax[i], k) };
  });
  const mathMarks: Mark[] = MATH_WRITES.map(({ id, write }, i) => {
    const k = easings.inOutCubic(prog(frame, [T.open + 8 + (6 - i) * 2, T.openDone + (6 - i) * 2]));
    return { id, write, color: INK, place: relaxed(p.mathCrash[i], p.mathRelax[i], k) };
  });

  const blue = [...m.g1, m.arrow1, ...m.g2, m.arrow2, ...m.q, m.proof, ...heMarks];
  const penLength = g.he * 4.2;
  const red = [m.circle, m.red1, m.red2];
  const hit = frame >= T.crash;

  return (
    <div style={{ position: "absolute", inset: 0, background: DESK }}>
      <style href="mashal-fonts" precedence="mashal">
        {FONTS}
      </style>
      <CameraView cam={cam}>
        <Paper frame={frame} ratio={ratio} />
        <div style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, opacity: 1 - prog(frame, T.veil) }}>
          {[...m.g1, m.arrow1, ...m.g2, m.arrow2, ...m.q, m.proof, ...mathMarks, ...heMarks, ...m.c, m.circle, m.red1, m.red2, m.strike, m.open, m.answer, m.tag].map((mark) => (
            <Ink key={mark.id} mark={mark} />
          ))}
        </div>
        <Blot x={p.wreck.x} y={p.wreck.y} size={g.he * 1.3} frame={frame} />
        <Pens marks={blue} frame={frame} length={penLength} color={BLUE} from={{ x: 240, y: 160 }} to={hit ? { x: 500, y: 460 } : { x: 300, y: 200 }} wait={hit ? 8 : 14} />
        <Pens marks={mathMarks} frame={frame} length={penLength} color={INK} left from={{ x: -340, y: 220 }} to={{ x: -520, y: 480 }} wait={8} />
        <Pens marks={red} frame={frame} length={penLength} color={RED} from={{ x: 340, y: 260 }} to={{ x: 340, y: 260 }} />
        <Pens marks={m.c} frame={frame} length={penLength} color={BLUE} from={{ x: 340, y: 260 }} to={{ x: 380, y: 300 }} />
        <Pens marks={[m.open]} frame={frame} length={penLength} color={BLUE} from={{ x: 340, y: 260 }} to={{ x: 380, y: 300 }} />
        <Pens marks={[m.tag]} frame={frame} length={penLength} color={BLUE} from={{ x: 340, y: 260 }} to={{ x: 380, y: 300 }} />
        <Pens marks={[m.strike]} frame={frame} length={penLength} color={RED} from={{ x: 340, y: 260 }} to={{ x: 340, y: 260 }} />
      </CameraView>
      <AppLayer frame={frame} ratio={ratio} cam={cam} width={width} height={height} />
      <EndPanel frame={frame} ratio={ratio} width={width} />
    </div>
  );
}

export const cues = ({ fps, ratio }: CueInput): Cue[] => {
  if (!handGen("mashal")) return [];
  const m = marksFor(ratio);
  const writes: HandWrite[] = [...m.g1, m.arrow1, ...m.g2, m.arrow2, ...m.q, m.proof, ...HE_WRITES, ...MATH_WRITES, ...m.c, m.circle, m.red1, m.red2, m.strike, m.open, m.tag, { id: "qed", write: T.qed }].map(({ id, write }) => ({ id, write }));
  return [
    { src: "ads/mashal/track.wav", volume: 1, fade: [0, 18] },
    ...handCues("mashal", writes, { fps, volume: 0.26 }),
    { src: "ads/mashal/crash.wav", at: T.crash, volume: 0.8 },
    { src: "ads/mashal/open.wav", at: T.open - 8, volume: 0.5 },
    { src: "ads/mashal/tick.wav", at: T.click, volume: 0.6 },
    { src: "ads/mashal/tick.wav", at: T.drag[0], volume: 0.25 },
  ];
};
