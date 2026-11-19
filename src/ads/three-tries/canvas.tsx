import type { CSSProperties, ReactNode } from "react";
import { Fragment } from "react";
import type { Ratio } from "../../engine";
import { FrameContext } from "../../engine/timing";
import { useFrame } from "../../engine";
import { Rough } from "../../parts/Rough";
import { clamp, easings, lerp, prog, type Span } from "../../parts/time";
import { SIM_H, SIM_W, SimPage, QUESTION, type Params, type SimState, DURATION_MS } from "./sim";
import { BAR_H, BAR_W, SelectionBar, Selection } from "./ui";
import { INK, Ink, PRIMARY, handBox, s, span } from "./world";

/**
 * The teacher's canvas, in world pixels (the app's canvas units at 100%). Everything is a function of the ad's global
 * frame. Two arrangements: "tall" (9:16 and 1:1) stacks the three attempts down the page; "wide" (16:9) puts them in a
 * row. Either way the values sit above the first attempt, and the simulation is placed in free space beside them.
 */

/** Times, in seconds of the ad. */
export const T = {
  arrowA: [0.0, 1.15],
  strikeA: [1.35, 1.95],
  axesB: [2.55, 3.0],
  waveB: [3.0, 3.85],
  qB: [3.9, 4.25],
  arrowB: [4.25, 4.45],
  backB: [4.45, 4.85],
  strikeB: [4.95, 5.35],
  circuitC: [5.45, 5.95],
  signsC: [5.95, 6.15],
  arrowsC: [6.15, 7.0],
  lastC: [7.0, 7.3],
  lassoDrag: [7.85, 8.3],
  bar: 8.35,
  click: 8.85,
  simLand: 9.0,
  simRun: 9.15,
  activate: 14.9,
  drag: [15.3, 16.9],
  rerun: 17.0,
  note: [19.6, 21.3],
  card: 22.1,
  lines: [22.7, 23.5, 24.4, 25.4],
} as const;

/** Circuit time per second on screen: the sim plays slowed so the swing can be seen. */
const MS_PER_S = 2.6;

type P = { x: number; y: number };
export type Lay = { vals: P; A: P; B: P; C: P; sim: P; note: { right: number; base: number }; card: P & { w: number } };

export const LAYOUT: Record<"tall" | "wide", Lay> = {
  tall: { vals: { x: 120, y: 110 }, A: { x: 120, y: 480 }, B: { x: 120, y: 960 }, C: { x: 120, y: 1460 }, sim: { x: 700, y: 110 }, note: { right: 1580, base: 806 }, card: { x: 700, y: 940, w: 960 } },
  wide: { vals: { x: 120, y: 110 }, A: { x: 120, y: 480 }, B: { x: 700, y: 480 }, C: { x: 1280, y: 480 }, sim: { x: 1880, y: 110 }, note: { right: 2760, base: 806 }, card: { x: 1880, y: 940, w: 960 } },
};
export const layFor = (ratio: Ratio): Lay => LAYOUT[ratio === "16x9" ? "wide" : "tall"];

// ── the values (already written when the ad starts) ──────────────────────────

const VAL_SIZE = 56;
const DONE: Span = [-3, -2];
const valRows = (v: P) => ({ l: v.y + 60, c: v.y + 134, vv: v.y + 208, w: v.y + 300 });

/** The selection round the values and the formula, in world pixels. */
export function selectionFor(lay: Lay) {
  const r = valRows(lay.vals);
  const x = lay.vals.x;
  const top = handBox("val-l", x, r.l, VAL_SIZE).top;
  const right = Math.max(handBox("val-l", x, r.l, VAL_SIZE).right, handBox("val-c", x, r.c, VAL_SIZE).right, handBox("val-v", x, r.vv, VAL_SIZE).right, formulaRight(lay));
  return { x: x - 26, y: top - 24, w: right - x + 52, h: r.w + 30 - (top - 24) };
}

function formulaParts(lay: Lay) {
  const r = valRows(lay.vals);
  const eq = handBox("w-eq", lay.vals.x, r.w, VAL_SIZE);
  const rx = eq.right + 10;
  const lc = handBox("lc", rx + 34, r.w, VAL_SIZE);
  return { base: r.w, rx, lcX: rx + 34, lcRight: lc.right };
}
const formulaRight = (lay: Lay) => formulaParts(lay).lcRight + 10;

function Values({ lay }: { lay: Lay }) {
  const r = valRows(lay.vals);
  const x = lay.vals.x;
  const fp = formulaParts(lay);
  const top = fp.base - VAL_SIZE * 1.05;
  return (
    <>
      <Ink id="val-l" x={x} base={r.l} size={VAL_SIZE} write={DONE} />
      <Ink id="val-c" x={x} base={r.c} size={VAL_SIZE} write={DONE} />
      <Ink id="val-v" x={x} base={r.vv} size={VAL_SIZE} write={DONE} />
      <Ink id="w-eq" x={x} base={fp.base} size={VAL_SIZE} write={DONE} />
      <Rough shape={{ kind: "path", d: `M${fp.rx} ${fp.base - 22}L${fp.rx + 12} ${fp.base - 28}L${fp.rx + 22} ${fp.base + 4}L${fp.rx + 32} ${top}H${fp.lcRight + 10}` }} seed={7} stroke={INK} strokeWidth={4} options={{ roughness: 0.6, bowing: 0.4, disableMultiStroke: true }} />
      <Ink id="lc" x={fp.lcX} base={fp.base} size={VAL_SIZE} write={DONE} />
    </>
  );
}

// ── the attempts ─────────────────────────────────────────────────────────────

const sk = { roughness: 0.9, bowing: 0.7 } as const;
const one = { ...sk, disableMultiStroke: true } as const;

/** A circuit sketch: capacitor on the left wire, a switch on top, the coil on the right. `draw` leaves it finished. */
function CircuitSketch({ o, draw, seed }: { o: P; draw?: Span; seed: number }) {
  const l = o.x + 90, r = o.x + 400, t = o.y + 60, b = o.y + 360;
  const pt = o.y + 190, pb = o.y + 232;
  const sw0 = o.x + 200, sw1 = o.x + 262;
  const ct = o.y + 118, cb = o.y + 300;
  const n = 5;
  const lh = (cb - ct) / n;
  const bumps = Array.from({ length: n }, () => `a${lh / 2 + 2} ${lh / 2} 0 0 1 0 ${lh}`).join("");
  const d = `M${l} ${pt}V${t}H${sw0}M${sw1} ${t}H${r}V${ct}${bumps}V${b}H${l}V${pb}`;
  const [a, z] = draw ?? DONE;
  const m = lerp(a, z, 0.7);
  return (
    <>
      <Rough shape={{ kind: "path", d }} draw={[a, m]} seed={seed} stroke={INK} strokeWidth={4} options={sk} />
      <Rough shape={{ kind: "path", d: `M${l - 52} ${pt}H${l + 52}M${l - 52} ${pb}H${l + 52}` }} draw={[m, lerp(a, z, 0.85)]} seed={seed + 1} stroke={INK} strokeWidth={5} options={sk} />
      <Rough shape={{ kind: "path", d: `M${sw0} ${t}L${sw1 - 6} ${t - 34}` }} draw={[lerp(a, z, 0.85), z]} seed={seed + 2} stroke={INK} strokeWidth={4} options={one} />
      <Rough shape={{ kind: "ellipse", cx: sw0, cy: t, w: 11, h: 11 }} draw={[lerp(a, z, 0.85), z]} seed={seed + 3} stroke={INK} strokeWidth={3} options={one} />
      <Rough shape={{ kind: "ellipse", cx: sw1, cy: t, w: 11, h: 11 }} draw={[lerp(a, z, 0.9), z]} seed={seed + 4} stroke={INK} strokeWidth={3} options={one} />
    </>
  );
}

export const circuitPoints = (o: P) => ({ l: o.x + 90, r: o.x + 400, t: o.y + 60, b: o.y + 360, pt: o.y + 190, pb: o.y + 232 });

/** Attempt one: the circuit, an arrow for "the energy goes from C to L", and the arrow struck out. */
function AttemptA({ o }: { o: P }) {
  const c = circuitPoints(o);
  return (
    <>
      <CircuitSketch o={o} seed={11} />
      <Ink id="lbl-c" x={c.l - 104} base={c.pb + 6} size={50} write={DONE} />
      <Ink id="lbl-l" x={c.r + 46} base={o.y + 228} size={50} write={DONE} />
      <Rough shape={{ kind: "arrow", from: [c.l + 50, o.y + 168], to: [c.r - 46, o.y + 186], bend: -64, head: 24 }} draw={span(...T.arrowA)} seed={21} stroke={INK} strokeWidth={4} options={one} />
      <Rough shape={{ kind: "path", d: `M${c.l + 30} ${o.y + 150}l34 52l30 -60l32 62l30 -62l32 62l30 -60l32 58l30 -54` }} draw={span(...T.strikeA)} seed={22} stroke={INK} strokeWidth={6} options={one} />
    </>
  );
}

/** Attempt two: a graph of the charge, "the charge → and then back", struck through. */
function AttemptB({ o }: { o: P }) {
  const x0 = o.x + 60, x1 = o.x + 470, mid = o.y + 180;
  const pts: string[] = [];
  for (let k = 0; k <= 40; k++) {
    const u = k / 40;
    const x = x0 + u * (x1 - 40 - x0);
    const y = mid - Math.cos(u * Math.PI * 3) * 112 * (1 - 0.12 * u);
    pts.push(`${k ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const base = o.y + 420;
  const q = handBox("he-q", 0, base, 58);
  const qRight = x1;
  const qLeft = qRight - q.width;
  const back = handBox("he-back", 0, base, 58);
  const arrowFrom = qLeft - 18;
  const arrowTo = arrowFrom - 80;
  const backRight = arrowTo - 18;
  return (
    <>
      <Rough shape={{ kind: "path", d: `M${x0} ${o.y + 20}V${o.y + 340}M${x0} ${mid}H${x1}` }} draw={span(...T.axesB)} seed={31} stroke={INK} strokeWidth={4} options={sk} />
      <Ink id="ax-q" x={x0 - 48} base={o.y + 66} size={50} write={span(T.axesB[1] - 0.12, T.axesB[1])} />
      <Ink id="ax-t" x={x1 + 12} base={mid + 18} size={50} write={span(T.axesB[1] - 0.12, T.axesB[1])} />
      <Rough shape={{ kind: "path", d: pts.join("") }} draw={span(...T.waveB)} seed={32} stroke={INK} strokeWidth={4} options={{ roughness: 1.4, bowing: 1.2, disableMultiStroke: true }} />
      <Ink id="he-q" x={qRight} right base={base} size={58} write={span(...T.qB)} />
      <Rough shape={{ kind: "arrow", from: [arrowFrom, base - 18], to: [arrowTo, base - 18], head: 16 }} draw={span(...T.arrowB)} seed={33} stroke={INK} strokeWidth={4} options={one} />
      <Ink id="he-back" x={backRight} right base={base} size={58} write={span(...T.backB)} />
      <Rough shape={{ kind: "line", from: [Math.min(backRight - back.width, x0) - 10, base + 16], to: [x1 + 30, o.y + 10] }} draw={span(...T.strikeB)} seed={34} stroke={INK} strokeWidth={6} options={one} />
    </>
  );
}

/** Attempt three: the circuit again, the four phases as numbered arrows, and a fifth arrow the pen gives up on. */
function AttemptC({ o }: { o: P }) {
  const c = circuitPoints(o);
  const [a0, a1] = T.arrowsC;
  const per = (a1 - a0) / 4;
  const arrows: { from: [number, number]; to: [number, number]; n: string; nx: number; nb: number }[] = [
    { from: [c.l - 34, c.pt - 30], to: [c.l - 34, c.t + 20], n: "n1", nx: c.l - 86, nb: c.t + 92 },
    { from: [c.l + 130, c.t + 34], to: [c.r - 60, c.t + 34], n: "n2", nx: c.l + 186, nb: c.t + 100 },
    { from: [c.r + 40, c.t + 70], to: [c.r + 40, c.b - 60], n: "n3", nx: c.r + 62, nb: c.t + 210 },
    { from: [c.r - 60, c.b + 34], to: [c.l + 60, c.b + 34], n: "n4", nx: c.l + 150, nb: c.b + 100 },
  ];
  return (
    <>
      <CircuitSketch o={o} draw={span(...T.circuitC)} seed={41} />
      <Ink id="plus" x={c.l + 64} base={c.pt - 12} size={46} write={span(T.signsC[0], T.signsC[0] + 0.1)} />
      <Ink id="minus" x={c.l + 64} base={c.pb + 44} size={46} write={span(T.signsC[0] + 0.1, T.signsC[1])} />
      {arrows.map((ar, k) => (
        <Fragment key={k}>
          <Rough shape={{ kind: "arrow", from: ar.from, to: ar.to, head: 16, bend: 8 }} draw={span(a0 + per * k, a0 + per * k + per * 0.7)} seed={50 + k} stroke={INK} strokeWidth={3.5} options={one} />
          <Ink id={ar.n} x={ar.nx} base={ar.nb} size={46} write={span(a0 + per * k + per * 0.65, a0 + per * (k + 1))} />
        </Fragment>
      ))}
      <LastArrow o={o} />
    </>
  );
}

/** The fifth arrow: drawn more than half way, then the pen stops. */
function LastArrow({ o }: { o: P }) {
  const c = circuitPoints(o);
  const [a, b] = T.lastC;
  const full = b + (b - a) * 0.8; // the arrow would have finished here
  return <Rough shape={{ kind: "arrow", from: [c.l + 60, c.b - 60], to: [c.r - 70, c.pt - 50], bend: -40, head: 18 }} draw={[s(a), s(full)]} seed={58} stroke={INK} strokeWidth={3.5} options={one} />;
}

/** Freezes a child's clock at frame `at`: the last arrow stays half drawn after the pen stops. */
function FreezeAfter({ at, children }: { at: number; children: ReactNode }) {
  const g = useFrame();
  return <FrameContext.Provider value={Math.min(g, at)}>{children}</FrameContext.Provider>;
}

// ── the simulation's state ───────────────────────────────────────────────────

export function simAt(g: number): SimState {
  const k = easings.inOutSine(prog(g, span(...T.drag), easings.linear));
  const C = g < s(T.drag[0]) ? QUESTION.C : Math.round(lerp(QUESTION.C, 400, k) / 10) * 10;
  const p: Params = { ...QUESTION, C };
  const run = (from: number) => clamp(((g - s(from)) / 30) * MS_PER_S, 0, DURATION_MS);
  const t = g < s(T.drag[0]) ? run(T.simRun) : g < s(T.rerun) ? 0 : run(T.rerun);
  const land = easings.outCubic(prog(g, [s(T.simLand), s(T.simLand) + 7], easings.linear));
  return { p, t, playing: t < DURATION_MS, active: g >= s(T.activate), land, hover: g >= s(T.activate) - 4 && g < s(T.rerun) + 6 ? "C" : undefined };
}

// ── the pilot card ───────────────────────────────────────────────────────────

const rubik = '"Rubik", sans-serif';

function Line({ at, children, style }: { at: number; children: ReactNode; style?: CSSProperties }) {
  const g = useFrame();
  const k = easings.outCubic(prog(g, [s(at), s(at) + 10], easings.linear));
  return <div style={{ opacity: k, transform: `translateY(${(1 - k) * 14}px)`, ...style }}>{children}</div>;
}

/** The pilot page's card (PilotPage.tsx, pilot.css): dashed frame, the hand-lettered tag, the card, in Hebrew. */
function PilotCard({ c }: { c: Lay["card"] }) {
  const g = useFrame();
  if (g < s(T.card)) return null;
  const k = easings.outCubic(prog(g, [s(T.card), s(T.card) + 12], easings.linear));
  const L = T.lines;
  return (
    <div style={{ position: "absolute", left: c.x, top: c.y, width: c.w, opacity: k, transform: `translateY(${(1 - k) * 40}px) scale(${0.97 + 0.03 * k})`, transformOrigin: "50% 0" }}>
      <div style={{ position: "relative", borderRadius: 30, padding: 22, outline: "3px dashed rgba(111,108,246,.55)", outlineOffset: 8 }}>
        <div dir="ltr" style={{ position: "absolute", top: -22, left: 40, zIndex: 1, padding: "8px 20px", borderRadius: 14, background: "#ecebff", border: "1.5px solid rgba(111,108,246,.3)", fontFamily: '"Virgil", sans-serif', fontSize: 38, color: "rgba(11,15,58,.9)", boxShadow: "0 10px 24px rgba(0,0,0,.06)", transform: "rotate(-1.5deg)", whiteSpace: "nowrap" }}>
          Premium · 14 days
        </div>
        <div dir="rtl" style={{ background: "rgba(255,255,255,.94)", border: "1.5px solid rgba(11,15,58,.1)", borderRadius: 26, padding: "62px 56px 50px", boxShadow: "0 24px 70px rgba(12,18,60,.10)", fontFamily: rubik, color: "#0b0f3a", textAlign: "right" }}>
          <Line at={L[0]}>
            <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              <span style={{ position: "relative", display: "inline-block", padding: "0 12px 6px" }}>
                <span style={{ position: "absolute", left: -2, right: -2, top: "54%", height: "0.95em", transform: "translateY(-50%) rotate(-1deg)", background: "rgba(111,108,246,.18)", borderRadius: 8 }} />
                <span style={{ position: "relative" }}>פיילוט</span>
              </span>{" "}
              <bdi dir="ltr" style={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800 }}>MathbookLM</bdi>
            </div>
          </Line>
          <Line at={L[1]} style={{ marginTop: 26 }}>
            <div style={{ fontSize: 46, fontWeight: 600, lineHeight: 1.3, whiteSpace: "nowrap" }}>
              שבועיים של <bdi dir="ltr">Premium</bdi> לשיעורים שלכם.
            </div>
          </Line>
          <Line at={L[2]} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 40, fontWeight: 500, lineHeight: 1.4, color: "rgba(11,15,58,.68)" }}>
              <div>בהזמנה אישית.</div>
              <div>בלי כרטיס אשראי, בלי מנוי.</div>
            </div>
          </Line>
          <Line at={L[3]} style={{ marginTop: 34, paddingTop: 30, borderTop: "1.5px solid rgba(11,15,58,.1)" }}>
            <div style={{ fontSize: 42, fontWeight: 600, color: "rgba(11,15,58,.68)" }}>להצטרפות:</div>
            <div dir="ltr" style={{ marginTop: 6, fontFamily: '"Nunito", sans-serif', fontWeight: 800, fontSize: 64, color: PRIMARY, letterSpacing: "-0.01em", textAlign: "right" }}>
              contact@mathbooklm.com
            </div>
          </Line>
        </div>
      </div>
    </div>
  );
}

/** The card's height in world pixels, for the camera. */
export const CARD_H = 680;

// ── the canvas ───────────────────────────────────────────────────────────────

export function Canvas({ lay, showBar = true }: { lay: Lay; showBar?: boolean }) {
  const g = useFrame();
  const sel = selectionFor(lay);
  const sim = simAt(g);
  const barLeft = Math.max(20, sel.x + sel.w / 2 - BAR_W / 2);
  const showSim = g >= s(T.simLand);
  return (
    <>
      <Values lay={lay} />
      <AttemptA o={lay.A} />
      <AttemptB o={lay.B} />
      <FreezeAfter at={s(T.lastC[1])}>
        <AttemptC o={lay.C} />
      </FreezeAfter>
      {!showSim && <Selection x={sel.x} y={sel.y} w={sel.w} h={sel.h} drag={span(...T.lassoDrag)} until={s(T.simLand)} />}
      {showBar && <SelectionBar left={barLeft} top={sel.y - BAR_H - 12} appear={s(T.bar)} until={s(T.simLand)} hot={s(T.click) - 3} />}
      {showSim && (
        <div style={{ position: "absolute", left: lay.sim.x, top: lay.sim.y, width: SIM_W, height: SIM_H, opacity: sim.land, transform: `scale(${0.985 + 0.015 * sim.land})`, transformOrigin: "0 0" }}>
          <SimPage st={sim} />
        </div>
      )}
      <Ink id="note" x={lay.note.right} right base={lay.note.base} size={78} write={span(...T.note)} />
      <PilotCard c={lay.card} />
    </>
  );
}

/** Where things are, for the camera and the pointer. */
export function points(lay: Lay) {
  const sel = selectionFor(lay);
  const barLeft = Math.max(20, sel.x + sel.w / 2 - BAR_W / 2);
  return { sel, barLeft, barTop: sel.y - BAR_H - 12 };
}
