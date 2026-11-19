import katex from "katex";
import "katex/dist/katex.min.css";
import type { CSSProperties, ReactNode } from "react";
import { useFrame } from "../../engine";
import { Rough } from "../../parts/Rough";
import { clamp, easings, prog } from "../../parts/time";
import { SIM_H, SIM_W, SimBox, type SimState } from "./sim";
import { BLUE, GREEN, INK, Ink, InkRow, MUTED, ORANGE, RULE, handBox, inkRowRight, s, span } from "./world";

/**
 * The Newton's-laws lesson as one canvas, in world pixels (the app's canvas units at 100%), as a function of the ad's
 * global frame. The teacher's ink is Virgil; the sketches are rough.js; what MathbookLM writes follows the app's
 * layout code (mathbooklm-website/src/canvas/canvasLayout/buildLayout.ts, palette.ts) at a zoom scale u = 1.5, with
 * its maths set by KaTeX in the hand font. The wording is this ad's, written to brand.md's "Worked box with friction".
 */

/** Times, in seconds of the voice-over. */
export const T = {
  plan: [7.4, 10.2],
  h1: [12.0, 12.6],
  floor: [12.7, 13.2],
  box: [13.2, 13.9],
  pull: [14.6, 15.1],
  friction: [15.4, 15.9],
  weight: [16.4, 16.9],
  normal: [17.5, 18.1],
  gM: [19.6, 20.3],
  gF: [21.1, 21.8],
  gMuk: [22.6, 23.1],
  gMus: [23.1, 23.6],
  gG: [23.7, 24.4],
  gA: [26.2, 26.9],
  dragSolve: [27.75, 28.35],
  bar: 28.45,
  solveClick: 29.56,
  pillSolve: [29.7, 31.35],
  rows: [31.62, 32.84, 33.8, 35.08],
  final: 36.3,
  frLine: [41.55, 42.55],
  dragExplain: [42.75, 43.3],
  barExplain: 43.4,
  explainClick: 44.3,
  pillExplain: [44.45, 46.3],
  card: 46.35,
  steps: [46.45, 47.4, 48.9, 51.04],
  answer: 53.2,
  check: 54.2,
  tip: 54.9,
  hw: [[91.8, 93.8], [94.2, 96.4]],
} as const;

// ── places ───────────────────────────────────────────────────────────────────

export const PLAN = { x: 80, base: 140, size: 72, itemBase: 228, itemSize: 48 };
const PLAN_ITEMS = ["plan-1", "plan-2", "plan-3", "plan-4"];

const FLOOR = 780;
const BOX = { x: 340, y: 620, w: 200, h: 160 };
export const GIVEN = { x: 1000, size: 50, m: 480, F: 560, muk: 640, mus: 720, g: 800, a: 900 };
const MUK: [string, ("sup" | "sub")?][] = [["mu"], ["sub-k", "sub"], ["g-muk"]];
const MUS: [string, ("sup" | "sub")?][] = [["mu"], ["sub-s", "sub"], ["g-mus"]];
const GG: [string, ("sup" | "sub")?][] = [["g-g"], ["sup2", "sup"]];
export const FR = { x: 140, base: 1010, size: 56, pieces: [["fr-1"], ["mu"], ["sub-s", "sub"], ["fr-2"]] as [string, ("sup" | "sub")?][] };

const pad = 22;
/** The selection around the written givens and "a = ?". */
export const SEL_SOLVE = (() => {
  const top = handBox("g-m", GIVEN.x, GIVEN.m, GIVEN.size).top;
  const a = handBox("g-a", GIVEN.x, GIVEN.a, GIVEN.size * 1.15);
  const right = Math.max(inkRowRight(GIVEN.x, GIVEN.size, GG), handBox("g-f", GIVEN.x, GIVEN.F, GIVEN.size).right, inkRowRight(GIVEN.x, GIVEN.size, MUK));
  return { x: GIVEN.x - pad, y: top - pad, w: right - GIVEN.x + pad * 2, h: a.top + a.height - top + pad * 2 };
})();
/** The selection around "f ≤ μs N". */
export const SEL_EXPLAIN = (() => {
  const a = handBox("fr-1", FR.x, FR.base, FR.size);
  const right = inkRowRight(FR.x, FR.size, FR.pieces);
  return { x: FR.x - pad, y: a.top - pad, w: right - FR.x + pad * 2, h: a.height + FR.size * 0.25 + pad * 2 };
})();

const U = 1.5;
export const SOLVE = { x: SEL_SOLVE.x + SEL_SOLVE.w + 72 * U, y: SEL_SOLVE.y };
/** Explain on canvas finds free space below the handwriting. */
export const CARD = { x: 100, y: SEL_EXPLAIN.y + SEL_EXPLAIN.h + 72 * U - pad, w: 1134 };
export const SIMBOX = { x: 1380, y: 1170, s: 2 };
export const SIM_ON_CANVAS = { x: SIMBOX.x, y: SIMBOX.y, w: SIM_W * SIMBOX.s, h: SIM_H * SIMBOX.s };
export const HW = { x: 1400, b1: 1990, b2: 2075, size: 58 };

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
  const split = 8.7;
  const per = (T.plan[1] - split) / 4;
  return (
    <>
      <Ink id="plan-title" x={PLAN.x} base={PLAN.base} size={PLAN.size} write={span(T.plan[0], split)} color="#3b3a8f" />
      {PLAN_ITEMS.map((id, i) => {
        const b = handBox(id, x, PLAN.itemBase, PLAN.itemSize);
        const el = <Ink key={id} id={id} x={x} base={PLAN.itemBase} size={PLAN.itemSize} write={span(split + per * i, split + per * (i + 1))} color={MUTED} />;
        x = b.right + 56;
        return el;
      })}
    </>
  );
}

const sk = { roughness: 0.9, bowing: 0.6 } as const;
const PUSH = "#9c36b5";

function PartOne() {
  const cx = BOX.x + BOX.w / 2;
  const cy = BOX.y + BOX.h / 2;
  const arrow = (from: [number, number], to: [number, number], t: readonly [number, number], color: string, seed: number) => (
    <Rough shape={{ kind: "arrow", from, to, head: 22 }} draw={span(t[0], t[1])} seed={seed} stroke={color} strokeWidth={5} options={{ ...sk, disableMultiStroke: true }} />
  );
  const hatches = Array.from({ length: 26 }, (_, i) => `M${120 + i * 30} ${FLOOR + 2}l-16 18`).join("");
  return (
    <>
      <Ink id="h1" x={80} base={400} size={58} write={span(...T.h1)} color="#3b3a8f" />
      <Rough shape={{ kind: "path", d: `M100 ${FLOOR}H900${hatches}` }} draw={span(...T.floor)} seed={61} stroke={INK} strokeWidth={3.5} options={sk} />
      <Rough shape={{ kind: "rect", x: BOX.x, y: BOX.y, w: BOX.w, h: BOX.h }} draw={span(...T.box)} seed={62} stroke={INK} strokeWidth={4} options={sk} />
      {arrow([BOX.x + BOX.w, cy], [BOX.x + BOX.w + 220, cy], T.pull, PUSH, 63)}
      <Ink id="lbl-f" x={BOX.x + BOX.w + 232} base={cy + 18} size={50} write={span(T.pull[1] - 0.1, T.pull[1] + 0.15)} color={PUSH} />
      {arrow([BOX.x, FLOOR - 16], [BOX.x - 170, FLOOR - 16], T.friction, ORANGE, 64)}
      <Ink id="lbl-fr" x={BOX.x - 150} base={FLOOR - 40} size={50} write={span(T.friction[1] - 0.1, T.friction[1] + 0.15)} color={ORANGE} />
      {arrow([cx + 20, cy], [cx + 20, cy + 200], T.weight, BLUE, 65)}
      <Ink id="lbl-mg" x={cx + 40} base={cy + 205} size={46} write={span(T.weight[1] - 0.1, T.weight[1] + 0.2)} color={BLUE} />
      {arrow([cx - 20, BOX.y], [cx - 20, BOX.y - 150], T.normal, BLUE, 66)}
      <Ink id="lbl-n" x={cx} base={BOX.y - 115} size={46} write={span(T.normal[1] - 0.1, T.normal[1] + 0.15)} color={BLUE} />
      <Ink id="g-m" x={GIVEN.x} base={GIVEN.m} size={GIVEN.size} write={span(...T.gM)} />
      <Ink id="g-f" x={GIVEN.x} base={GIVEN.F} size={GIVEN.size} write={span(...T.gF)} />
      <InkRow x={GIVEN.x} base={GIVEN.muk} size={GIVEN.size} pieces={MUK} write={span(...T.gMuk)} />
      <InkRow x={GIVEN.x} base={GIVEN.mus} size={GIVEN.size} pieces={MUS} write={span(...T.gMus)} />
      <InkRow x={GIVEN.x} base={GIVEN.g} size={GIVEN.size} pieces={GG} write={span(...T.gG)} />
      <Ink id="g-a" x={GIVEN.x} base={GIVEN.a} size={GIVEN.size * 1.15} write={span(...T.gA)} />
      <InkRow x={FR.x} base={FR.base} size={FR.size} pieces={FR.pieces} write={span(...T.frLine)} />
    </>
  );
}

// ── Solve on canvas ──────────────────────────────────────────────────────────

const ROWS = [
  { lhs: "N", rhs: "mg = 50\\ \\text{N}", note: "the floor balances the weight" },
  { lhs: "f_k", rhs: "\\mu_k N = 10\\ \\text{N}", note: "kinetic friction, against the motion" },
  { lhs: "F_{net}", rhs: "F - f_k = 20\\ \\text{N}" },
  { lhs: "a", rhs: "\\frac{F_{net}}{m} = \\frac{20}{5}", note: "Newton's second law" },
];
export const rowAt = (i: number) => s(T.rows[i]);

function SolveOnCanvas() {
  const fs = 34 * U;
  return (
    <div style={{ position: "absolute", left: SOLVE.x, top: SOLVE.y, width: "max-content", display: "grid", gridTemplateColumns: "auto auto auto auto", columnGap: 0.28 * fs, rowGap: 18 * U, alignItems: "center" }}>
      {ROWS.map((r, i) => (
        <Row key={i} at={rowAt(i)} r={r} fs={fs} />
      ))}
      <div style={{ gridColumn: "1 / 5", height: 10 * U }} />
      <div style={{ gridColumn: "1 / 5" }}>
        <Land at={s(T.final) - 4}>
          <div style={{ fontFamily: '"Nunito", sans-serif', fontSize: 17 * U, color: GREEN, marginBottom: 8 * U }}>Acceleration</div>
        </Land>
        <Land at={s(T.final)}>
          <AnswerBox tex="a = 4\ \text{m/s}^2" size={38 * U} />
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
      <Land at={at + 8} style={{ paddingLeft: 36 * U - 0.28 * fs }}>
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

const FP = "\\textcolor{#9c36b5}{F}";
const FO = "\\textcolor{#e8590c}{f}";
const STEPS = [
  { title: "On a level floor, N balances the weight", tex: "N = mg = 50\\ \\text{N}", reason: "The floor pushes up exactly as hard as gravity pulls down." },
  { title: "Static friction matches the push", tex: `${FO}_s = ${FP}`, reason: "Push with 12 N and friction pushes back with 12 N: no net force." },
  { title: "But only up to a limit", tex: `${FO}_s \\le \\mu_s N = 15\\ \\text{N}`, reason: "That's the most grip the floor can give.", key: true },
  { title: "Past 15 N, the box slides", tex: `${FO}_k = \\mu_k N = 10\\ \\text{N}`, reason: "Sliding friction is smaller, so the box speeds up." },
];

const X = { pad: 28 * U, math: 30 * U, badge: 32 * U, indent: 32 * U + 14 * U, boxPad: 10 * U, reasonW: 290 * U, arrowGap: 64 * U, label: 18 * U, note: 16 * U };
const MATH_COL = 300 * U;
const nunito = '"Nunito", sans-serif';

export const stepAt = (i: number) => s(T.steps[i]);

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

/** Approximate places on the card, in world pixels, for the camera. */
export const CARD_POINTS = { problemY: CARD.y + 250, steps: [CARD.y + 430, CARD.y + 610, CARD.y + 790, CARD.y + 970], answerY: CARD.y + 1190, bottom: CARD.y + 1430 };

function ExplainCard() {
  const g = useFrame();
  const at = s(T.card);
  if (g < at) return null;
  const k = easings.outCubic(prog(g, [at, at + 10], easings.linear));
  const chip = (tex: string, meaning: string, color: string, fill: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 * U, background: fill, padding: `${3 * U}px ${6 * U}px`, borderRadius: 4 * U }}>
      <Tex tex={tex} size={22 * U} />
      <span style={{ fontFamily: nunito, fontSize: X.note, color }}>: {meaning}</span>
    </span>
  );
  return (
    <div style={{ position: "absolute", left: CARD.x, top: CARD.y, width: CARD.w, padding: X.pad, boxSizing: "border-box", background: "#fff", border: `${U}px solid ${RULE}`, borderRadius: 12 * U, opacity: k }}>
      <Land at={at + 2}>
        <div style={{ fontFamily: nunito, fontSize: 26 * U, color: INK, marginBottom: 12 * U }}>Why the box sticks, then slides</div>
      </Land>
      <Land at={at + 6} style={{ display: "flex", gap: 26 * U, marginBottom: 18 * U }}>
        {chip(FP, "your push", PUSH, "#f3d9fa")}
        {chip(FO, "friction", ORANGE, "#fff3bf")}
      </Land>
      <Land at={at + 10}>
        <div style={{ fontFamily: nunito, fontSize: 14 * U, color: MUTED, marginBottom: 4 * U }}>Problem</div>
        <div style={{ display: "inline-block", padding: 12 * U, border: `${U}px solid ${RULE}`, background: "#f8f9fa", borderRadius: 6 * U, marginBottom: 14 * U }}>
          <Tex tex={`${FO} \\le \\mu_s N`} size={X.math} />
        </div>
      </Land>
      <div style={{ height: U, background: RULE, margin: `0 0 ${20 * U}px` }} />
      {STEPS.map((_, i) => (
        <Step key={i} i={i} />
      ))}
      <Land at={s(T.answer)}>
        <div style={{ fontFamily: nunito, fontSize: X.label, color: GREEN, margin: `${4 * U}px 0 ${8 * U}px` }}>Answer: it sticks until F is more than 15 N, then</div>
        <AnswerBox tex={`a = \\frac{${FP} - \\mu_k mg}{m}`} size={34 * U} />
      </Land>
      <Land at={s(T.check)}>
        <div style={{ fontFamily: nunito, fontSize: X.note, color: GREEN, margin: `${14 * U}px 0 ${10 * U}px` }}>✓ At F = 30 N: a = (30 − 10) / 5 = 4 m/s², the same as Solve</div>
      </Land>
      <Land at={s(T.tip)}>
        <div style={{ fontFamily: nunito, fontSize: X.note, color: ORANGE, background: "#fff4e6", border: `${1.5 * U}px solid ${ORANGE}`, borderRadius: 6 * U, padding: `${8 * U}px ${12 * U}px` }}>⚠ Watch out: N and mg are not a third-law pair. The partner of mg is the box pulling the Earth up.</div>
      </Land>
    </div>
  );
}

/** The dashed box round the student's handwriting, and its arrow down into the card (canvasLayout/index.ts, "below"). */
function WorkLink() {
  const g = useFrame();
  const at = s(T.card);
  if (g < at) return null;
  const p = 12 * U;
  const box = { x: SEL_EXPLAIN.x - p + pad, y: SEL_EXPLAIN.y - p + pad, w: SEL_EXPLAIN.w + 2 * p - pad * 2, h: SEL_EXPLAIN.h + 2 * p - pad * 2 };
  const cx = box.x + box.w / 2;
  const from = { x: cx, y: box.y + box.h + 4 };
  const to = { x: Math.min(CARD.x + CARD.w - 20, Math.max(CARD.x + 20, cx)), y: CARD.y - 4 };
  const k = easings.inOutSine(prog(g, [at, at + 10], easings.linear));
  const c = "#9c36b5";
  return (
    <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={12} fill="none" stroke={c} strokeWidth={2 * U} strokeDasharray={`${12 * U} ${8 * U}`} opacity={clamp(k * 3)} />
      <path d={`M${from.x} ${from.y}L${from.x + (to.x - from.x) * k} ${from.y + (to.y - from.y) * k}`} stroke={c} strokeWidth={2 * U} fill="none" />
      {k > 0.98 && <path d={`M${to.x} ${to.y}l-9 -14M${to.x} ${to.y}l9 -14`} stroke={c} strokeWidth={2 * U} strokeLinecap="round" />}
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
      <SolveOnCanvas />
      <WorkLink />
      <ExplainCard />
      {sim && sim.land > 0 && (
        <div style={{ position: "absolute", left: SIMBOX.x, top: SIMBOX.y, transformOrigin: "0 0", transform: `scale(${SIMBOX.s * (0.9 + 0.1 * sim.land)})`, opacity: clamp(sim.land * 2) }}>
          <SimBox s={sim.s} active={sim.active} />
        </div>
      )}
      <Ink id="hw-1" x={HW.x} base={HW.b1} size={HW.size} write={span(...T.hw[0])} color="#3b3a8f" />
      <Ink id="hw-2" x={HW.x} base={HW.b2} size={HW.size} write={span(...T.hw[1])} />
    </>
  );
}
