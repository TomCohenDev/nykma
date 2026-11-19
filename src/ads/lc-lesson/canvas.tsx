import katex from "katex";
import "katex/dist/katex.min.css";
import type { CSSProperties, ReactNode } from "react";
import { useFrame } from "../../engine";
import { Rough } from "../../parts/Rough";
import { clamp, easings, prog, type Span } from "../../parts/time";
import { SIM_H, SIM_W, SimBox, type SimState } from "./sim";
import { BLUE, GREEN, INK, Ink, InkRow, MUTED, ORANGE, RULE, handBox, inkRowRight, s, span } from "./world";

/**
 * The lesson as one canvas, in world pixels (the app's canvas units at 100%). Everything here is a function of the
 * ad's global frame, so every scene that films the canvas shows the same moment. The teacher's ink is Virgil (the
 * app's hand font stand-in), the sketches are rough.js, and what MathbookLM writes follows the app's own layout code
 * (mathbooklm-website/src/canvas/canvasLayout/buildLayout.ts, palette.ts) at a zoom scale u = 1.5: Solve on canvas
 * is steps aligned on "=", muted notes and a green double box with no card; Explain on canvas is a white card with
 * a title, a colour key, the Problem row, numbered badges (amber for the key step), dashed "why" notes with arrows,
 * the answer box, a ✓ line and "Watch out:". Its maths is set by KaTeX in the hand font, as the app's hand-drawn
 * renderer sets it. The wording is this ad's, written to the numbers in brand.md's "Worked LC circuit".
 */

/** Times, in seconds of the voice-over. */
export const T = {
  plan: [7.3, 9.4],
  h1: [11.3, 11.9],
  cap: [12.0, 13.0],
  cLbl: [13.0, 13.25],
  cVal: [13.25, 14.0],
  vVal: [14.4, 15.1],
  signs: [15.1, 15.4],
  qLaw: [15.4, 16.0],
  eCap: [16.0, 16.9],
  field: [16.9, 17.8],
  h2: [21.0, 21.6],
  coil: [21.8, 23.0],
  lLbl: [23.0, 23.3],
  lVal: [23.0, 23.7],
  vCoil: [24.2, 25.4],
  eCoil: [26.0, 27.0],
  mag: [27.2, 28.3],
  h3: [31.0, 31.5],
  loop: [31.5, 32.7],
  given: [32.3, 33.35],
  dragSolve: [33.45, 34.0],
  bar: 34.05,
  menu: [34.55, 35.3],
  solveClick: 35.2,
  pillSolve: [35.35, 37.35],
  rows: [37.5, 43.6],
  final: 44.2,
  dragExplain: [49.3, 49.9],
  barExplain: 50.0,
  explainClick: 51.2,
  pillExplain: [51.35, 53.35],
  card: 53.4,
  steps: [54.4, 55.36, 57.28, 59.32],
  answer: 60.9,
  check: 61.9,
  tip: 62.4,
  hw: [95.8, 99.6],
} as const;

const tf = (t: number) => s(t);

// ── places ───────────────────────────────────────────────────────────────────

export const PLAN = { x: 80, base: 140, size: 72, itemBase: 228, itemSize: 48 };
const PLAN_ITEMS = ["plan-1", "plan-2", "plan-3", "plan-4"];

const E_CAP: [string, "sup"?][] = [["e-cap"], ["sup2", "sup"], ["half"]];
const E_COIL: [string, "sup"?][] = [["e-coil"], ["sup2", "sup"], ["half"]];
export const ENERGY = { y: 790, size: 60, capX: 110, coilX: 910 };

export const GIVEN = { x: 860, l: 1110, c: 1200, f: 1300, size: 54 };

const pad = 22;
/** The selection around the two energy lines, in world pixels. */
export const SEL_EXPLAIN = (() => {
  const a = handBox("e-cap", ENERGY.capX, ENERGY.y, ENERGY.size);
  const right = inkRowRight(ENERGY.coilX, ENERGY.size, E_COIL);
  return { x: ENERGY.capX - pad, y: a.top - ENERGY.size * 0.25 - pad, w: right - ENERGY.capX + pad * 2, h: a.height + ENERGY.size * 0.25 + pad * 2 };
})();
/** The selection around the written maths of part 3. */
export const SEL_SOLVE = (() => {
  const l = handBox("given-l", GIVEN.x, GIVEN.l, GIVEN.size);
  const c = handBox("given-c", GIVEN.x, GIVEN.c, GIVEN.size);
  const f = handBox("given-f", GIVEN.x, GIVEN.f, GIVEN.size * 1.1);
  const right = Math.max(l.right, c.right, f.right);
  return { x: GIVEN.x - pad, y: l.top - pad, w: right - GIVEN.x + pad * 2, h: f.top + f.height - l.top + pad * 2 };
})();

const U = 1.5;
/** Where Solve on canvas writes: free space right of the selection, 72 units over (placement.ts), top-aligned. */
export const SOLVE = { x: SEL_SOLVE.x + SEL_SOLVE.w + 72 * U, y: SEL_SOLVE.y };
/** Where Explain on canvas puts its card: the free space right of everything else. */
export const CARD = { x: 2440, y: 300, w: 1134 };
/** The sim on the canvas, 2 canvas pixels to one of the sim's. */
export const SIMBOX = { x: 100, y: 1560, s: 2 };
export const SIM_ON_CANVAS = { x: SIMBOX.x, y: SIMBOX.y, w: SIM_W * SIMBOX.s, h: SIM_H * SIMBOX.s };
export const HW = { x: 120, b1: 2380, b2: 2470, size: 58 };

// ── maths, set by KaTeX in the hand font ─────────────────────────────────────

export function Tex({ tex, size, color = INK, style }: { tex: string; size: number; color?: string; style?: CSSProperties }) {
  const html = katex.renderToString(tex, { throwOnError: false, output: "html" });
  return <span className="hd" style={{ display: "inline-block", fontSize: size / 1.21, color, lineHeight: 1.2, whiteSpace: "nowrap", ...style }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Something the app adds that comes in: a short fade and lift. The app inserts it at once; the ad lets it land. */
function Land({ at, children, style, wipe }: { at: number; children: ReactNode; style?: CSSProperties; wipe?: number }) {
  const g = useFrame();
  if (g < at) return null;
  const k = easings.outCubic(prog(g, [at, at + 8], easings.linear));
  const w = wipe ? easings.inOutSine(prog(g, [at, at + wipe], easings.linear)) : 1;
  return <div style={{ ...style, opacity: k, transform: `translateY(${(1 - k) * 10}px)`, clipPath: wipe ? `inset(-20% ${(1 - w) * 100}% -20% -2%)` : undefined }}>{children}</div>;
}

// ── the teacher's board ──────────────────────────────────────────────────────

function Plan() {
  let x = PLAN.x + 10;
  const per = (T.plan[1] - 8.3) / 4;
  return (
    <>
      <Ink id="plan-title" x={PLAN.x} base={PLAN.base} size={PLAN.size} write={span(T.plan[0], 8.3)} color="#3b3a8f" />
      {PLAN_ITEMS.map((id, i) => {
        const b = handBox(id, x, PLAN.itemBase, PLAN.itemSize);
        const el = <Ink key={id} id={id} x={x} base={PLAN.itemBase} size={PLAN.itemSize} write={span(8.3 + per * i, 8.3 + per * (i + 1))} color={MUTED} />;
        x = b.right + 56;
        return el;
      })}
    </>
  );
}

const sk = { roughness: 0.9, bowing: 0.6 } as const;

function PartOne() {
  const cx = 250;
  return (
    <>
      <Ink id="h1" x={80} base={400} size={58} write={span(...T.h1)} color="#3b3a8f" />
      <Rough shape={{ kind: "path", d: `M${cx} 440V520M${cx - 85} 520H${cx + 85}M${cx - 85} 590H${cx + 85}M${cx} 590V670` }} draw={span(...T.cap)} seed={11} stroke={INK} strokeWidth={4} options={sk} />
      <Ink id="lbl-c" x={cx + 108} base={572} size={46} write={span(...T.cLbl)} />
      <Ink id="plus" x={cx - 140} base={530} size={44} write={span(T.signs[0], T.signs[0] + 0.15)} color="#e03131" />
      <Ink id="minus" x={cx - 140} base={612} size={44} write={span(T.signs[0] + 0.15, T.signs[1])} color={BLUE} />
      {[-54, -18, 18, 54].map((dx, i) => (
        <Rough key={i} shape={{ kind: "arrow", from: [cx + dx, 528], to: [cx + dx, 582], head: 10 }} draw={span(T.field[0] + i * 0.18, T.field[0] + i * 0.18 + 0.35)} seed={20 + i} stroke={BLUE} strokeWidth={3} options={{ ...sk, disableMultiStroke: true }} />
      ))}
      <Ink id="c-val" x={450} base={490} size={48} write={span(...T.cVal)} />
      <Ink id="v-val" x={450} base={570} size={48} write={span(...T.vVal)} />
      <Ink id="q-law" x={450} base={650} size={48} write={span(...T.qLaw)} />
      <InkRow x={ENERGY.capX} base={ENERGY.y} size={ENERGY.size} pieces={E_CAP} write={span(...T.eCap)} />
    </>
  );
}

function PartTwo() {
  const y = 560;
  const bumps = Array.from({ length: 4 }, () => "a30 30 0 0 1 60 0").join(" ");
  return (
    <>
      <Ink id="h2" x={900} base={400} size={58} write={span(...T.h2)} color="#3b3a8f" />
      <Rough shape={{ kind: "path", d: `M900 ${y}H960${bumps}H1260` }} draw={span(...T.coil)} seed={31} stroke={INK} strokeWidth={4} options={sk} />
      <Ink id="lbl-l" x={1066} base={655} size={46} write={span(...T.lLbl)} />
      {[
        [380, 150],
        [470, 230],
      ].map(([w, h], i) => (
        <Rough key={i} shape={{ kind: "ellipse", cx: 1080, cy: y - 10, w, h }} draw={span(T.mag[0] + i * 0.35, T.mag[0] + i * 0.35 + 0.75)} seed={40 + i} stroke={ORANGE} strokeWidth={3} options={{ ...sk, disableMultiStroke: true, strokeLineDash: [14, 12] }} />
      ))}
      <Ink id="l-val" x={1340} base={500} size={48} write={span(...T.lVal)} />
      <Ink id="v-coil" x={1340} base={580} size={48} write={span(...T.vCoil)} />
      <InkRow x={ENERGY.coilX} base={ENERGY.y} size={ENERGY.size} pieces={E_COIL} write={span(...T.eCoil)} />
    </>
  );
}

function PartThree() {
  const bumps = Array.from({ length: 4 }, () => "a20 20 0 0 1 0 40").join(" ");
  const [a, b] = T.loop;
  const m = (a + b) / 2;
  return (
    <>
      <Ink id="h3" x={80} base={985} size={58} write={span(...T.h3)} color="#3b3a8f" />
      <Rough shape={{ kind: "path", d: `M160 1185V1060H392M478 1060H700V1140${bumps}V1360H160V1235` }} draw={span(a, m + 0.2)} seed={51} stroke={INK} strokeWidth={4} options={sk} />
      <Rough shape={{ kind: "path", d: "M108 1185H212M108 1235H212" }} draw={span(m + 0.2, m + 0.4)} seed={52} stroke={INK} strokeWidth={4.5} options={sk} />
      <Rough shape={{ kind: "path", d: "M398 1060L470 1050" }} draw={span(m + 0.4, b)} seed={53} stroke={INK} strokeWidth={4} options={sk} />
      <Rough shape={{ kind: "ellipse", cx: 398, cy: 1060, w: 12, h: 12 }} draw={span(m + 0.4, m + 0.5)} seed={54} stroke={INK} strokeWidth={3} options={sk} />
      <Rough shape={{ kind: "ellipse", cx: 476, cy: 1060, w: 12, h: 12 }} draw={span(m + 0.45, m + 0.55)} seed={55} stroke={INK} strokeWidth={3} options={sk} />
      <Ink id="lbl-c" x={60} base={1226} size={46} write={span(b - 0.2, b)} />
      <Ink id="lbl-l" x={746} base={1236} size={46} write={span(b - 0.2, b)} />
      <Ink id="given-l" x={GIVEN.x} base={GIVEN.l} size={GIVEN.size} write={span(T.given[0], T.given[0] + 0.35)} />
      <Ink id="given-c" x={GIVEN.x} base={GIVEN.c} size={GIVEN.size} write={span(T.given[0] + 0.35, T.given[0] + 0.7)} />
      <Ink id="given-f" x={GIVEN.x} base={GIVEN.f} size={GIVEN.size * 1.1} write={span(T.given[0] + 0.7, T.given[1])} />
    </>
  );
}

// ── Solve on canvas ──────────────────────────────────────────────────────────

const ROWS = [
  { lhs: "\\omega", rhs: "\\frac{1}{\\sqrt{LC}}", note: "natural frequency of the loop" },
  { lhs: "", rhs: "\\frac{1}{\\sqrt{0.01 \\cdot 0.0001}}", note: "L = 0.01 H, C = 0.0001 F" },
  { lhs: "", rhs: "1000\\ \\text{rad/s}" },
  { lhs: "f", rhs: "\\frac{\\omega}{2\\pi}", note: "one cycle is 2π radians" },
  { lhs: "", rhs: "159.15\\ \\text{Hz}" },
];
/** When each row lands, in frames. */
export const rowAt = (i: number) => tf(T.rows[0] + ((T.rows[1] - T.rows[0]) / (ROWS.length - 1)) * i);

function SolveOnCanvas() {
  const fs = 34 * U;
  return (
    <div style={{ position: "absolute", left: SOLVE.x, top: SOLVE.y, width: "max-content", display: "grid", gridTemplateColumns: "auto auto auto auto", columnGap: 0.28 * fs, rowGap: 18 * U, alignItems: "center" }}>
      {ROWS.map((r, i) => (
        <Row key={i} at={rowAt(i)} r={r} fs={fs} />
      ))}
      <div style={{ gridColumn: "1 / 5", height: 10 * U }} />
      <div style={{ gridColumn: "1 / 5" }}>
        <Land at={tf(T.final) - 4}>
          <div style={{ fontFamily: '"Nunito", sans-serif', fontSize: 17 * U, color: GREEN, marginBottom: 8 * U }}>Frequency</div>
        </Land>
        <Land at={tf(T.final)}>
          <AnswerBox tex="f \approx 159\ \text{Hz}" size={38 * U} />
        </Land>
      </div>
    </div>
  );
}

function Row({ at, r, fs }: { at: number; r: { lhs: string; rhs: string; note?: string }; fs: number }) {
  const wipe = 12;
  return (
    <>
      <Land at={at} wipe={wipe} style={{ justifySelf: "end" }}>{r.lhs ? <Tex tex={r.lhs} size={fs} /> : <span />}</Land>
      <Land at={at} wipe={wipe}>
        <Tex tex="=" size={fs} />
      </Land>
      <Land at={at + 2} wipe={wipe}>
        <Tex tex={r.rhs} size={fs} />
      </Land>
      <Land at={at + 8} style={{ paddingLeft: 36 * U - 0.28 * fs, maxWidth: 260 * U }}>
        {r.note ? <span style={{ fontFamily: '"Nunito", sans-serif', fontSize: 17 * U, color: MUTED, lineHeight: 1.25, display: "block", whiteSpace: "nowrap" }}>{r.note}</span> : <span />}
      </Land>
    </>
  );
}

/** The app's double-bordered answer box: outer #2f9e44 at 2.5, filled #ebfbee, a thin inner line 5 units in. */
function AnswerBox({ tex, size }: { tex: string; size: number }) {
  return (
    <div style={{ position: "relative", display: "inline-block", padding: 16 * U, border: `${2.5 * U}px solid ${GREEN}`, background: "#ebfbee", borderRadius: 10 * U }}>
      <div style={{ position: "absolute", inset: 5 * U - 2.5 * U, border: `${U}px solid ${GREEN}`, borderRadius: 7 * U, pointerEvents: "none" }} />
      <Tex tex={tex} size={size} />
    </div>
  );
}

// ── Explain on canvas ────────────────────────────────────────────────────────

const VB = "\\textcolor{#1971c2}{V}";
const IO = "\\textcolor{#e8590c}{I}";
const STEPS = [
  { title: "The capacitor is charged to 9 V", tex: `E = \\tfrac{1}{2}C${VB}^2 = 4.05\\ \\text{mJ}`, reason: "All the energy sits in the electric field between the plates." },
  { title: "C discharges through the coil", tex: `${VB} = L\\,\\frac{d${IO}}{dt}`, reason: "The coil resists the change, so the current builds up gradually." },
  { title: "C is empty, the current is at its peak", tex: `\\tfrac{1}{2}L${IO}^2 = \\tfrac{1}{2}C${VB}^2`, reason: "All the energy is now in the coil's magnetic field.", key: true },
  { title: "The coil charges C the other way", tex: `${VB} \\to -9\\ \\text{V}`, reason: "Then it all flows back again: one full cycle." },
];

const X = { pad: 28 * U, math: 30 * U, badge: 32 * U, indent: 32 * U + 14 * U, boxPad: 10 * U, reasonW: 290 * U, arrowGap: 64 * U, label: 18 * U, note: 16 * U };
const MATH_COL = 300 * U;
const nunito = '"Nunito", sans-serif';

export const stepAt = (i: number) => tf(T.steps[i]);

function Badge({ n, keyStep }: { n: number; keyStep?: boolean }) {
  const c = keyStep ? { stroke: "#f08c00", fill: "#fff3bf" } : { stroke: BLUE, fill: "#e7f5ff" };
  return <div style={{ width: X.badge, height: X.badge, borderRadius: "50%", border: `${1.5 * U}px solid ${c.stroke}`, background: c.fill, boxSizing: "border-box", display: "grid", placeItems: "center", fontFamily: nunito, fontSize: 17 * U, color: c.stroke, flex: "none" }}>{n}</div>;
}

function Step({ i }: { i: number }) {
  const st = STEPS[i];
  const at = stepAt(i);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: X.arrowGap, marginBottom: 22 * U }}>
      <div style={{ width: X.indent + MATH_COL, flex: "none" }}>
        <Land at={at}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 * U }}>
            <Badge n={i + 1} keyStep={st.key} />
            <span style={{ fontFamily: nunito, fontSize: X.label, color: INK }}>{st.title}</span>
          </div>
        </Land>
        <Land at={at + 4} wipe={14} style={{ marginTop: 8 * U, marginLeft: X.indent }}>
          <div style={{ display: "inline-block", padding: X.boxPad, border: st.key ? `${2 * U}px solid #f08c00` : `${2 * U}px solid transparent`, background: st.key ? "#fff3bf" : "transparent", borderRadius: 8 * U }}>
            <Tex tex={st.tex} size={X.math} />
          </div>
        </Land>
      </div>
      <Land at={at + 14} style={{ position: "relative", width: X.reasonW, flex: "none" }}>
        <svg width={X.arrowGap} height={20} style={{ position: "absolute", left: -X.arrowGap + 6, top: "50%", marginTop: -10, overflow: "visible" }}>
          <path d={`M0 10H${X.arrowGap - 18}`} stroke={MUTED} strokeWidth={1.5 * U} />
          <path d={`M${X.arrowGap - 18} 10l-11 -6v12z`} fill={MUTED} />
        </svg>
        <div style={{ border: `${U}px dashed ${MUTED}`, background: "#f8f9fa", borderRadius: 8 * U, padding: `${8 * U}px ${10 * U}px`, fontFamily: nunito, fontSize: X.note, color: INK, lineHeight: 1.3 }}>{st.reason}</div>
      </Land>
    </div>
  );
}

/** The explanation card; `ref` points are in world pixels for the camera. */
export const CARD_POINTS = { problemY: CARD.y + 250, steps: [CARD.y + 520, CARD.y + 760, CARD.y + 1010, CARD.y + 1260], answerY: CARD.y + 1490, bottom: CARD.y + 1760 };

function ExplainCard() {
  const g = useFrame();
  const at = tf(T.card);
  if (g < at) return null;
  const k = easings.outCubic(prog(g, [at, at + 10], easings.linear));
  const chip = (tex: string, meaning: string, color: string, fill: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 * U, background: fill, padding: `${3 * U}px ${6 * U}px`, borderRadius: 4 * U }}>
      <Tex tex={tex} size={22 * U} />
      <span style={{ fontFamily: nunito, fontSize: X.note, color }}>: {meaning}</span>
    </span>
  );
  return (
    <div style={{ position: "absolute", left: CARD.x, top: CARD.y, width: CARD.w, padding: X.pad, boxSizing: "border-box", background: "#fff", border: `${U}px solid ${RULE}`, borderRadius: 12 * U, opacity: k, boxShadow: "0 2px 0 rgba(0,0,0,.02)" }}>
      <Land at={at + 2}>
        <div style={{ fontFamily: nunito, fontSize: 26 * U, color: INK, marginBottom: 12 * U }}>Why an LC circuit rings</div>
      </Land>
      <Land at={at + 6} style={{ display: "flex", gap: 26 * U, marginBottom: 18 * U }}>
        {chip(VB, "voltage on C", BLUE, "#d0ebff")}
        {chip(IO, "current in the coil", ORANGE, "#fff3bf")}
      </Land>
      <Land at={at + 10}>
        <div style={{ fontFamily: nunito, fontSize: 14 * U, color: MUTED, marginBottom: 4 * U }}>Problem</div>
        <div style={{ display: "inline-block", padding: 12 * U, border: `${U}px solid ${RULE}`, background: "#f8f9fa", borderRadius: 6 * U, marginBottom: 14 * U }}>
          <Tex tex={`E = C${VB}^2/2 \\qquad E = L${IO}^2/2`} size={X.math} />
        </div>
      </Land>
      <div style={{ height: U, background: RULE, margin: `0 0 ${20 * U}px` }} />
      {STEPS.map((_, i) => (
        <Step key={i} i={i} />
      ))}
      <Land at={tf(T.answer)}>
        <div style={{ fontFamily: nunito, fontSize: X.label, color: GREEN, margin: `${4 * U}px 0 ${8 * U}px` }}>Answer: the energy swaps between C and L</div>
        <AnswerBox tex="f = \frac{1}{2\pi\sqrt{LC}} \approx 159\ \text{Hz}" size={34 * U} />
      </Land>
      <Land at={tf(T.check)}>
        <div style={{ fontFamily: nunito, fontSize: X.note, color: GREEN, margin: `${14 * U}px 0 ${10 * U}px` }}>✓ I = V·√(C/L) = 0.9 A, so the coil holds the same 4.05 mJ</div>
      </Land>
      <Land at={tf(T.tip)}>
        <div style={{ fontFamily: nunito, fontSize: X.note, color: ORANGE, background: "#fff4e6", border: `${1.5 * U}px solid ${ORANGE}`, borderRadius: 6 * U, padding: `${8 * U}px ${12 * U}px` }}>⚠ Watch out: real coils have resistance, so the ring slowly dies away.</div>
      </Land>
    </div>
  );
}

/** The dashed box round the student's handwriting, and its arrow into the card (canvasLayout/index.ts). */
function WorkLink() {
  const g = useFrame();
  const at = tf(T.card);
  if (g < at) return null;
  const p = 12 * U;
  const box = { x: SEL_EXPLAIN.x - p + pad, y: SEL_EXPLAIN.y - p + pad, w: SEL_EXPLAIN.w + 2 * p - pad * 2, h: SEL_EXPLAIN.h + 2 * p - pad * 2 };
  const from = { x: box.x + box.w + 4, y: box.y + box.h / 2 };
  const to = { x: CARD.x - 4, y: CARD_POINTS.problemY };
  const k = easings.inOutSine(prog(g, [at, at + 14], easings.linear));
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  const hx = from.x + (to.x - from.x) * k;
  const hy = from.y + (to.y - from.y) * k;
  const c = "#9c36b5";
  return (
    <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={12} fill="none" stroke={c} strokeWidth={2 * U} strokeDasharray={`${12 * U} ${8 * U}`} opacity={clamp(k * 3)} />
      <path d={`M${from.x} ${from.y}L${hx} ${hy}`} stroke={c} strokeWidth={2 * U} fill="none" />
      {k > 0.98 && <path d={`M${to.x} ${to.y}l${-16 * Math.cos(ang - 0.45)} ${-16 * Math.sin(ang - 0.45)}M${to.x} ${to.y}l${-16 * Math.cos(ang + 0.45)} ${-16 * Math.sin(ang + 0.45)}`} stroke={c} strokeWidth={2 * U} strokeLinecap="round" />}
      <title>{len}</title>
    </svg>
  );
}

// ── the canvas ───────────────────────────────────────────────────────────────

export type CanvasState = { sim?: { s: SimState; active: boolean; land: number } };

export function Lesson({ sim }: CanvasState) {
  return (
    <>
      <Plan />
      <PartOne />
      <PartTwo />
      <PartThree />
      <SolveOnCanvas />
      <WorkLink />
      <ExplainCard />
      {sim && sim.land > 0 && (
        <div style={{ position: "absolute", left: SIMBOX.x, top: SIMBOX.y, transformOrigin: "0 0", transform: `scale(${SIMBOX.s * (0.9 + 0.1 * sim.land)})`, opacity: clamp(sim.land * 2) }}>
          <SimBox s={sim.s} active={sim.active} />
        </div>
      )}
      <Ink id="hw-1" x={HW.x} base={HW.b1} size={HW.size} write={span(T.hw[0], 97.6)} color="#3b3a8f" />
      <Ink id="hw-2" x={HW.x} base={HW.b2} size={HW.size} write={span(97.7, T.hw[1])} />
    </>
  );
}

export type { Span };
