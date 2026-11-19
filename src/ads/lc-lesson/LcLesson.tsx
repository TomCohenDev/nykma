import type { CSSProperties, ReactNode } from "react";
import { asset, useFrame, useVideo, type AdProps, type Cue, type Ratio, type Scene } from "../../engine";
import { Cursor, type CursorKey } from "../../parts/Cursor";
import { clamp, easings, lerp, prog } from "../../parts/time";
import { CARD, CARD_POINTS, HW, Lesson, SEL_EXPLAIN, SEL_SOLVE, SIMBOX, SIM_ON_CANVAS, SOLVE, T } from "./canvas";
import { LcPage, QUESTION, QUESTION_BTN, SIM_H, SIM_W, WINDOW, fieldAt, thumbAt, type SimState } from "./sim";
import { BAR_H, BAR_W, ChatPanel, Chrome, PANEL_W, SelectionBar, Selection, TargetMenu, WritePill, panelPoints, segAt, type BarState } from "./ui";
import { AT, Chip, Global, Grid, PRIMARY, SLUG, Shell, Subtitle, TEXT, UI, World, Wordmark, camAt, onScreen, s, type Cam, type Frame, type L } from "./world";

/**
 * "The LC lesson". The ad is one physics lesson in four parts, each taught with MathbookLM: a circuit on a bench rings
 * with no battery, the classroom's projector shows the lesson plan, and then the canvas carries it: the capacitor and
 * the coil in the teacher's ink, Solve on canvas for the frequency, Explain on canvas for why it rings, and a
 * simulation from the chat that the class turns: 4× C drops the ring an octave, R fades it, 20 Ω stops it.
 * Narration: Alice (ElevenLabs), at the times in spec.json; every time below is a second of gen/timeline.json.
 * The bench and classroom are generated (public/ads/lc-lesson/gen.json): their green screens get the scope trace and
 * the canvas in code. The app's UI is rebuilt from mathbooklm-website/src (see canvas.tsx, ui.tsx, sim.tsx).
 */
export const cues: Cue[] = [{ src: `ads/${SLUG}/gen/mix.wav` }];

// ── generated shots ──────────────────────────────────────────────────────────

type Plate = { file: string; w: number; h: number; quad: [number, number, number, number] };
/** The stills and their green screens (x0, y0, x1, y1 in still pixels, measured from the green, 3 px wider). */
const STILLS: Record<string, Plate> = {
  bench: { file: "generated/bench-still.png", w: 1672, h: 941, quad: [522, 74, 1071, 389] },
  benchTall: { file: "generated/bench-tall-still.png", w: 941, h: 1672, quad: [125, 363, 632, 682] },
  room: { file: "generated/room-still.png", w: 1672, h: 941, quad: [504, 142, 1143, 487] },
  roomTall: { file: "generated/room-tall-still.png", w: 941, h: 1672, quad: [93, 273, 840, 750] },
};

/** A still, covering the frame, filmed by a push-in: (cx, cy) in still pixels stays centred, z on top of cover. */
function Still({ p, cx, cy, z, children, filter }: { p: Plate; cx: number; cy: number; z: number; children?: ReactNode; filter?: string }) {
  const { width: W, height: H } = useVideo();
  const k = Math.max(W / p.w, H / p.h) * z;
  const x = clamp(W / 2 - cx * k, W - p.w * k, 0);
  const y = clamp(H / 2 - cy * k, H - p.h * k, 0);
  const [x0, y0, x1, y1] = p.quad;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: p.w, height: p.h, transformOrigin: "0 0", transform: `translate(${x}px, ${y}px) scale(${k})` }}>
      <img src={asset(`ads/${SLUG}/${p.file}`)} alt="" style={{ position: "absolute", left: 0, top: 0, width: p.w, height: p.h, filter }} />
      <div style={{ position: "absolute", left: x0, top: y0, width: x1 - x0, height: y1 - y0, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

// ── 1. The bench: no battery, and it rings ───────────────────────────────────

/** The scope: a steady 159 Hz ring at 2 ms a division, its trace sweeping on. */
function Scope({ w, h }: { w: number; h: number }) {
  const g = useFrame();
  const sweep = ((g % 45) / 45) * 1.15;
  const f = 159.15;
  const msPerDiv = 2;
  const divs = 10;
  let d = "";
  const n = 360;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    if (u > sweep) break;
    const t = (u * divs * msPerDiv) / 1000;
    const y = h / 2 - Math.cos(2 * Math.PI * f * t) * h * 0.34;
    d += `${i ? "L" : "M"}${(u * w).toFixed(1)} ${y.toFixed(1)}`;
  }
  return (
    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 45%, #0f2a1c, #06120c 75%)" }}>
      <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
        {Array.from({ length: 11 }, (_, i) => <path key={`v${i}`} d={`M${(i * w) / 10} 0V${h}`} stroke="rgba(150,255,190,.13)" strokeWidth={1} />)}
        {Array.from({ length: 9 }, (_, i) => <path key={`h${i}`} d={`M0 ${(i * h) / 8}H${w}`} stroke="rgba(150,255,190,.13)" strokeWidth={1} />)}
        <path d={d} fill="none" stroke="#ffe066" strokeWidth={3.2} style={{ filter: "drop-shadow(0 0 4px rgba(255,224,102,.9))" }} />
      </svg>
      <div style={{ position: "absolute", left: 10, top: 6, right: 10, display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: h * 0.06, color: "#9dfcc0" }}>
        <span>CH1 2 V/div</span>
        <span>2 ms/div</span>
        <span>f = 159.2 Hz</span>
      </div>
    </div>
  );
}

function Bench({ ratio }: AdProps) {
  const g = useFrame();
  const tall = ratio === "9x16";
  const p = tall ? STILLS.benchTall : STILLS.bench;
  const z = 1.02 + 0.14 * easings.inOutSine(prog(g, [0, s(7)], easings.linear));
  const focus = tall ? { cx: 470, cy: 900 } : ratio === "1x1" ? { cx: 820, cy: 470 } : { cx: 820, cy: 470 };
  const [x0, y0, x1, y1] = p.quad;
  return (
    <Shell bg="#2b1d14">
      <Still p={p} cx={focus.cx} cy={focus.cy} z={z}>
        <Scope w={x1 - x0} h={y1 - y0} />
      </Still>
      <Chip text="Lesson 7 · The LC circuit" from={s(0.3)} until={s(6.9)} ratio={ratio} pos={tall ? { left: 70, top: 860 } : undefined} />
      <Subs ratio={ratio} />
    </Shell>
  );
}

// ── 2. The classroom: today's lesson on the projector ────────────────────────

/** The projector's view of the canvas: the plan, and room for the parts. */
const PROJ: Frame = { t: 0, cx: 800, cy: 450, fw: 1720, fh: 960 };

/** The lesson canvas through a fixed camera in a w × h box (the projector, or the screen at the cut). */
function CanvasView({ w, h, cam, children }: { w: number; h: number; cam: Cam; children?: ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Grid cam={cam} w={w} h={h} />
      <World cam={cam} w={w} h={h}>
        <Lesson />
      </World>
      {children}
    </div>
  );
}

function Room({ ratio }: AdProps) {
  const f = useFrame();
  const g = AT.room + f;
  const { width: W, height: H } = useVideo();
  const tall = ratio === "9x16";
  const p = tall ? STILLS.roomTall : STILLS.room;
  const [x0, y0, x1, y1] = p.quad;
  const qw = x1 - x0;
  const qh = y1 - y0;
  // The push: a slow drift, then into the screen until it covers the frame.
  const cover = Math.max(W / qw, H / qh) / Math.max(W / p.w, H / p.h);
  const k = easings.inCubic(prog(g, [s(9.5), s(11)], easings.linear));
  const z = Math.exp(lerp(Math.log(1.03 + 0.05 * prog(g, [s(7), s(9.5)], easings.linear)), Math.log(cover * 1.02), k));
  const base = tall ? { cx: 470, cy: 760 } : { cx: 836, cy: 470 };
  const cx = lerp(base.cx, (x0 + x1) / 2, k);
  const cy = lerp(base.cy, (y0 + y1) / 2, k);
  const cam = camAt(g, [PROJ], qw * 2, qh * 2);
  return (
    <Shell bg="#2a2a2a">
      <Global start={AT.room}>
        <Still p={p} cx={cx} cy={cy} z={z}>
          <div style={{ position: "absolute", left: 0, top: 0, width: qw * 2, height: qh * 2, transform: "scale(0.5)", transformOrigin: "0 0", filter: `brightness(${1.02 - 0.06 * (1 - k)}) contrast(${0.9 + 0.1 * k}) saturate(${0.88 + 0.12 * k})` }}>
            <CanvasView w={qw * 2} h={qh * 2} cam={cam} />
          </div>
        </Still>
        <Subs ratio={ratio} />
      </Global>
    </Shell>
  );
}

// ── 3. The lesson, on the canvas ─────────────────────────────────────────────

/** The camera through the lesson: framings in world pixels, keyed in seconds. */
/** Space the chip and callouts take at the top, and the subtitles at the bottom, per shape (video pixels). */
const BAND: L<{ top: number; bottom: number }> = { "16x9": { top: 200, bottom: 150 }, "1x1": { top: 200, bottom: 170 }, "9x16": { top: 360, bottom: 470 } };

function lessonKeys(ratio: Ratio, W: number, H: number): Frame[] {
  const tall = ratio === "9x16";
  const sq = ratio === "1x1";
  // How much of the world a shot shows: wide shapes show more across, tall ones more down.
  const F = (t: number, cx: number, cy: number, fw: number, fh: number, ease?: Frame["ease"], whole = false): Frame => ({ t, cx, fw: whole ? fw : tall ? fw * 0.76 : sq ? fw * 0.85 : fw, fh: tall ? fh * 1.25 : fh, ease, cy: cy - (tall ? fh * 1.25 : fh) * 0.06 });
  // The sim on the canvas: as big as fits between the top band and the subtitles.
  const b = BAND[ratio];
  const z = Math.min((W - 120) / SIM_ON_CANVAS.w, (H - b.top - b.bottom) / SIM_ON_CANVAS.h);
  const simCy = SIM_ON_CANVAS.y + SIM_ON_CANVAS.h / 2 - ((b.top + H - b.bottom) / 2 - H / 2) / z;
  const S = (t: number, ease?: Frame["ease"]): Frame => ({ t, cx: SIM_ON_CANVAS.x + SIM_ON_CANVAS.w / 2, cy: simCy, fw: W / z, fh: H / z, ease });
  const solveRight = SOLVE.x + 1000;
  return [
    { ...PROJ, t: 11.0 },
    { ...PROJ, t: 11.3 },
    F(12.6, 420, 560, 1000, 640),
    F(19.8, 470, 590, 1040, 660, easings.linear),
    F(21.2, 1180, 560, 1050, 640),
    F(27.0, 1150, 580, 1100, 680, easings.linear),
    F(29.0, 820, 600, 1700, 760),
    F(30.4, 820, 600, 1720, 780, easings.linear),
    F(31.6, 640, 1170, 1350, 640),
    F(35.3, 700, 1180, 1300, 620, easings.linear),
    F(37.4, (SEL_SOLVE.x + solveRight) / 2 - 80, 1250, solveRight - SEL_SOLVE.x + 220, 760),
    F(41.0, SOLVE.x + 420, 1330, 1250, 760),
    F(44.6, SOLVE.x + 380, 1450, 1150, 760),
    F(47.2, SOLVE.x + 380, 1440, 1180, 780, easings.linear),
    F(48.8, 830, 720, 1700, 660),
    F(51.4, 840, 730, 1700, 660, easings.linear),
    F(53.4, 1700, 650, 2700, 1000),
    F(54.6, CARD.x + CARD.w / 2, CARD_POINTS.steps[0] - 80, 1250, 760, undefined, true),
    F(56.9, CARD.x + CARD.w / 2, CARD_POINTS.steps[1] - 40, 1250, 760, undefined, true),
    F(58.8, CARD.x + CARD.w / 2, CARD_POINTS.steps[2] - 10, 1250, 760, undefined, true),
    F(60.5, CARD.x + CARD.w / 2, CARD_POINTS.steps[3] + 20, 1250, 760, undefined, true),
    F(62.0, CARD.x + CARD.w / 2, CARD_POINTS.answerY + 40, 1250, 760, undefined, true),
    F(63.4, CARD.x + CARD.w / 2, (CARD.y + CARD_POINTS.bottom) / 2, 1300, 1520),
    // the lab: the chat opens on the right, so the canvas's free space sits left of centre
    F(65.4, SIM_ON_CANVAS.x + SIM_ON_CANVAS.w / 2 + (tall ? 0 : 420), SIM_ON_CANVAS.y + 300, 2100, 1200),
    F(71.6, SIM_ON_CANVAS.x + SIM_ON_CANVAS.w / 2 + (tall ? 0 : 420), SIM_ON_CANVAS.y + 300, 2100, 1200, easings.linear),
    S(73.4),
    S(94.6, easings.linear),
    F(96.0, SIM_ON_CANVAS.x + SIM_ON_CANVAS.w / 2, HW.b1 - 160, 1400, 900),
    F(101.2, SIM_ON_CANVAS.x + SIM_ON_CANVAS.w / 2 + 40, HW.b1 - 140, 1460, 940, easings.linear),
    F(104.4, 1830, 1250, 3700, 2560),
  ];
}

/** The sim's state at global frame g: when its run (re)started, and each value. */
function simAt(g: number): SimState {
  const sec = g / 30;
  const run = (from: number) => {
    const u = (sec - from) * 0.01; // 0.01×: the 20 ms window plays in 2 s
    const loop = WINDOW + 0.008;
    return Math.min(((u % loop) + loop) % loop, WINDOW);
  };
  const st: SimState = { ...QUESTION, t: run(68.4), changed: false };
  // C 100 → 400 μF (75.0-75.6), then the run plays from 75.6
  if (sec >= 75.0) {
    const k = easings.inOutCubic(prog(sec, [75.0, 75.6], easings.linear));
    st.C = (100 + 300 * k) * 1e-6;
    st.hot = sec < 76.2 ? "C" : undefined;
    st.t = sec < 75.6 ? 0 : run(75.6);
    st.changed = true;
  }
  // "Question values" (80.7): back to the question
  if (sec >= 80.7) {
    st.C = QUESTION.C;
    st.hot = undefined;
    st.t = run(80.7);
    st.changed = false;
  }
  // R 0 → 5 Ω (81.9-82.5)
  if (sec >= 81.9) {
    const k = easings.inOutCubic(prog(sec, [81.9, 82.5], easings.linear));
    st.R = 5 * k;
    st.hot = sec < 83.0 ? "R" : undefined;
    st.t = sec < 82.5 ? 0 : run(82.5);
    st.changed = true;
  }
  // the R field: click (86.9), type 20 (87.4-87.75), Enter (88.0)
  if (sec >= 86.9 && sec < 88.0) {
    st.hot = "R";
    st.field = sec < 87.4 ? "5.0" : sec < 87.6 ? "2" : "20";
  }
  if (sec >= 88.0) {
    st.R = 20;
    st.hot = undefined;
    st.field = undefined;
    st.t = run(88.0);
  }
  return st;
}

/** A sim point (in its 560×350 pixels) on screen, once it's on the canvas. */
const simOnScreen = (cam: Cam, W: number, H: number, p: { x: number; y: number }) => onScreen(cam, W, H, SIMBOX.x + p.x * SIMBOX.s, SIMBOX.y + p.y * SIMBOX.s);

/** Where the toolbar and the pill sit, per shape. */
const TOP: L<number> = { "16x9": 22, "1x1": 22, "9x16": 120 };

function LessonView({ ratio }: { ratio: Ratio }) {
  const g = useFrame();
  const sec = g / 30;
  const { width: W, height: H } = useVideo();
  const ui = UI[ratio];
  const keys = lessonKeys(ratio, W, H);
  const cam = camAt(g, keys, W, H);
  const camOf = (t: number) => camAt(s(t), keys, W, H);
  const barUi = ratio === "9x16" ? 1.5 : ui;

  // selections, in screen pixels at the moment they're drawn
  const scr = (c: Cam, r: { x: number; y: number; w: number; h: number }) => {
    const a = onScreen(c, W, H, r.x, r.y);
    return { x: a.x, y: a.y, w: r.w * c.z, h: r.h * c.z };
  };
  const solveSel = scr(cam, SEL_SOLVE);
  const explainSel = scr(cam, SEL_EXPLAIN);
  const barLeft = (sel: { x: number; w: number }) => clamp(sel.x + sel.w / 2 - (BAR_W * barUi) / 2, 24, W - BAR_W * barUi - 24);
  const barTop = (sel: { y: number }) => sel.y - 10 * barUi - BAR_H * barUi;

  // the sim
  const sim = simAt(g);
  const landK = easings.outCubic(prog(sec, [72.2, 72.7], easings.linear));
  const onCanvas = sec >= 72.2;

  // the chat panel
  const pw = Math.min(PANEL_W * ui, W * 0.86);
  const pui = pw / PANEL_W;
  const panelIn = easings.outCubic(prog(sec, [64.5, 65.1], easings.linear)) * (1 - easings.inCubic(prog(sec, [72.5, 73.0], easings.linear)));
  const px = W - pw * panelIn;
  const pp = panelPoints(W - pw, pui);

  // the cursor, keyed in screen pixels from where things are at each moment
  const cur: CursorKey[] = (() => {
    const k: CursorKey[] = [];
    const add = (t: number, x: number, y: number, click?: boolean) => k.push({ f: s(t), x, y, click });
    const ss = scr(camOf(33.45), SEL_SOLVE);
    add(32.9, ss.x - 60, ss.y - 40);
    add(33.45, ss.x, ss.y);
    add(34.0, ss.x + ss.w, ss.y + ss.h);
    const s1 = scr(camOf(34.5), SEL_SOLVE);
    const b1 = { left: barLeft(s1), top: barTop(s1) };
    const more = segAt("Solve").more;
    add(34.5, b1.left + ((more[0] + more[1]) / 2) * barUi, b1.top + (BAR_H / 2) * barUi, true);
    add(35.2, b1.left + 70 * barUi, b1.top + (BAR_H + 10 + 4 + 16) * barUi, true);
    add(36.2, b1.left + 120 * barUi, b1.top + (BAR_H + 70) * barUi);
    add(47.0, W * 0.62, H * 0.7);
    const se = scr(camOf(49.3), SEL_EXPLAIN);
    add(49.3, se.x, se.y);
    add(49.9, se.x + se.w, se.y + se.h);
    const s2 = scr(camOf(51.2), SEL_EXPLAIN);
    const b2 = { left: barLeft(s2), top: barTop(s2) };
    const ex = segAt("Explain").main;
    add(50.6, b2.left + ((ex[0] + ex[1]) / 2) * barUi + 20, b2.top + (BAR_H / 2) * barUi + 30);
    add(51.2, b2.left + ((ex[0] + ex[1]) / 2) * barUi, b2.top + (BAR_H / 2) * barUi, true);
    add(52.4, b2.left + ((ex[0] + ex[1]) / 2) * barUi + 60, b2.top + 140);
    add(64.6, W - pw * 0.5, H * 0.62);
    add(65.2, W - pw * 0.5, H - 70 * pui);
    add(67.3, pp.send.x, H - (14 + 10 + 14) * pui, true);
    add(70.6, pp.add.x - 40, pp.add.y + 90);
    add(71.6, pp.add.x, pp.add.y, true);
    const cC = simOnScreen(camOf(75.0), W, H, thumbAt("C", 100));
    add(73.6, cC.x + 120, cC.y + 140);
    add(74.7, cC.x, cC.y);
    add(75.0, cC.x, cC.y, true);
    const cC2 = simOnScreen(camOf(75.6), W, H, thumbAt("C", 400));
    add(75.6, cC2.x, cC2.y);
    add(76.4, cC2.x + 30, cC2.y + 50);
    const qb = simOnScreen(camOf(80.7), W, H, { x: QUESTION_BTN.x + QUESTION_BTN.w / 2, y: QUESTION_BTN.y + QUESTION_BTN.h / 2 });
    add(80.3, qb.x, qb.y);
    add(80.7, qb.x, qb.y, true);
    const r0 = simOnScreen(camOf(81.9), W, H, thumbAt("R", 0));
    add(81.5, r0.x, r0.y);
    add(81.9, r0.x, r0.y, true);
    const r5 = simOnScreen(camOf(82.5), W, H, thumbAt("R", 5));
    add(82.5, r5.x, r5.y);
    add(83.4, r5.x + 30, r5.y + 60);
    const rf = simOnScreen(camOf(86.9), W, H, fieldAt("R"));
    add(86.5, rf.x, rf.y);
    add(86.9, rf.x, rf.y, true);
    add(88.6, rf.x + 40, rf.y + 70);
    add(94.0, rf.x + 60, rf.y + 120);
    return k;
  })();
  const showCursor = (sec > 32.9 && sec < 36.6) || (sec > 47.0 && sec < 52.8) || (sec > 64.6 && sec < 94.2);

  // the bars and menu
  const s1 = solveSel;
  const solveBar: BarState = { loading: "Solve", loadingFrom: s(T.solveClick), hot: sec >= 34.4 && sec < 35.3 ? "SolveMore" : undefined };
  const s2 = explainSel;
  const explainBar: BarState = { loading: "Explain", loadingFrom: s(T.explainClick), hot: sec >= 50.9 && sec < 51.3 ? "Explain" : undefined };

  // the sim flying from the chat to the canvas
  const fly = prog(sec, [71.7, 72.4], easings.inOutCubic);
  const target = (() => {
    const a = onScreen(camOf(72.4), W, H, SIM_ON_CANVAS.x, SIM_ON_CANVAS.y);
    return { x: a.x, y: a.y, w: SIM_ON_CANVAS.w * camOf(72.4).z };
  })();

  return (
    <>
      <Grid cam={cam} w={W} h={H} />
      <World cam={cam} w={W} h={H}>
        <Lesson sim={{ s: sim, active: onCanvas && sec < 95, land: onCanvas ? landK : 0 }} />
      </World>
      <Chrome ui={ui} w={W} top={TOP[ratio]} zoomBottom={ratio === "9x16" ? undefined : 22 * ui} />
      {/* part 3: select the maths, the Solve menu, Solve on canvas */}
      <Selection x={s1.x} y={s1.y} w={s1.w} h={s1.h} ui={ui} drag={[s(T.dragSolve[0]), s(T.dragSolve[1])]} until={s(T.pillSolve[1])} />
      {sec >= T.bar && sec < T.pillSolve[1] && <SelectionBar left={barLeft(s1)} top={barTop(s1)} ui={barUi} appear={s(T.bar)} st={solveBar} />}
      {sec >= T.menu[0] && sec < T.menu[1] && <TargetMenu left={barLeft(s1) + segAt("Solve").main[0] * barUi} top={barTop(s1) + (BAR_H + 10) * barUi} ui={barUi} appear={s(T.menu[0])} hover={sec > 34.95 ? 0 : undefined} />}
      <WritePill text="Writing the solution on the canvas…" from={s(T.pillSolve[0])} until={s(T.pillSolve[1])} ui={ui} top={TOP[ratio] + 72 * ui} w={W} />
      {/* explain */}
      <Selection x={s2.x} y={s2.y} w={s2.w} h={s2.h} ui={ui} drag={[s(T.dragExplain[0]), s(T.dragExplain[1])]} until={s(T.pillExplain[1])} />
      {sec >= T.barExplain && sec < T.pillExplain[1] && <SelectionBar left={barLeft(s2)} top={barTop(s2)} ui={barUi} appear={s(T.barExplain)} st={explainBar} />}
      <WritePill text="Writing the explanation on the canvas…" from={s(T.pillExplain[0])} until={s(T.pillExplain[1])} ui={ui} top={TOP[ratio] + 72 * ui} w={W} />
      {/* the lab: the chat, then the sim onto the canvas */}
      {panelIn > 0 && (
        <ChatPanel
          x={px}
          h={H}
          ui={pui}
          st={{ typed: prog(sec, [65.3, 67.15], easings.linear), sent: s(67.3), thinkingFrom: s(67.5), answer: s(68.4), addHot: sec > 71.3, sim: sec < 71.7 ? sim : { ...sim, t: 0 }, left: sec < 67.3 ? 8 : 7 }}
        />
      )}
      {fly > 0 && fly < 1 && (
        <div style={{ position: "absolute", left: lerp(pp.sim.x, target.x, fly), top: lerp(pp.sim.y, target.y, fly), width: SIM_W, height: SIM_H, transformOrigin: "0 0", transform: `scale(${lerp(pp.sim.w, target.w, fly) / SIM_W})`, background: "rgba(255,255,255,.9)", boxShadow: "0 12px 40px rgba(30,30,80,.18)", borderRadius: 8, overflow: "hidden" }}>
          <SimFlying s={sim} />
        </div>
      )}
      <Callout text="4× C  →  ½ f: one octave lower" from={s(76.3)} until={s(80.5)} ratio={ratio} />
      <Callout text="R = 20 Ω: critical damping" from={s(89.8)} until={s(94.8)} ratio={ratio} />
      {showCursor && <Cursor keys={cur} size={30 * ui} rippleColor={PRIMARY} rippleSize={70 * ui} />}
    </>
  );
}

function SimFlying({ s: st }: { s: SimState }) {
  return <LcPage s={st} />;
}

/** A one-line label that lands near the top of the frame while the sim shows something. */
function Callout({ text, from, until, ratio }: { text: string; from: number; until: number; ratio: Ratio }) {
  const g = useFrame();
  if (g < from || g > until) return null;
  const k = easings.outBack(prog(g, [from, from + 10], easings.linear));
  const out = prog(g, [until - 8, until], easings.linear);
  const size = { "16x9": 46, "1x1": 42, "9x16": 50 }[ratio];
  const pos: CSSProperties = { "16x9": { right: 96, top: 118 }, "1x1": { right: 60, top: 118 }, "9x16": { left: 70, right: 130, top: 330, textAlign: "center" } }[ratio] as CSSProperties;
  return (
    <div style={{ position: "absolute", ...pos, opacity: (1 - out) * clamp(k * 2), transform: `scale(${0.85 + 0.15 * k})`, transformOrigin: "center" }}>
      <span style={{ display: "inline-block", fontFamily: '"Nunito", sans-serif', fontWeight: 800, fontSize: size, color: "#fff", background: PRIMARY, padding: `${size * 0.22}px ${size * 0.5}px`, borderRadius: size * 0.4, boxShadow: "0 10px 30px rgba(81,79,187,.35)" }}>{text}</span>
    </div>
  );
}

function Chips({ ratio }: { ratio: Ratio }) {
  return (
    <>
      <Chip n="1" text="The capacitor" from={s(11.2)} until={s(15.0)} ratio={ratio} />
      <Chip n="2" text="The coil" from={s(21.0)} until={s(24.6)} ratio={ratio} />
      <Chip n="3" text="Together" from={s(31.0)} until={s(33.4)} ratio={ratio} />
      <Chip n="4" text="The lab" from={s(64.0)} until={s(67.6)} ratio={ratio} />
      <Chip n="✎" text="Homework" from={s(95.6)} until={s(99.4)} ratio={ratio} />
    </>
  );
}

/** The voice's lines as subtitles, phrase by phrase, on the ad's global clock. */
const SUBS: [number, number, string][] = [
  [0.4, 6.6, "No battery. Yet this circuit rings, 159 times a second."],
  [7.0, 10.0, "Today: where does the ring come from?"],
  [11.2, 13.7, "Part one: the capacitor."],
  [13.84, 18.4, "Charge it to 9 volts, and it stores energy in its electric field."],
  [21.0, 23.4, "Part two: the coil."],
  [23.48, 28.5, "It resists any change in current, and stores energy in its magnetic field."],
  [31.0, 33.3, "Part three: join them."],
  [33.48, 35.7, "Select the maths, and press Solve."],
  [37.0, 43.8, "MathbookLM writes the working right on the board, step by step, with the numbers computed by SymPy."],
  [44.04, 46.4, "About 159 hertz."],
  [48.0, 50.45, "Students need more than the answer."],
  [50.56, 52.2, "They need the why."],
  [54.4, 57.15, "The capacitor empties into the coil."],
  [57.28, 60.85, "The coil keeps the current going, and charges it back."],
  [60.96, 63.2, "Energy, back and forth."],
  [64.0, 66.3, "Part four: the lab."],
  [66.48, 70.2, "Ask for a simulation, and the circuit comes alive."],
  [75.0, 77.2, "Four times the capacitance:"],
  [77.28, 79.4, "the ring drops an octave."],
  [81.8, 84.4, "Add resistance, and it fades."],
  [87.8, 90.45, "At 20 ohms, the ring is gone."],
  [90.52, 94.6, "Critical damping, and the whole class just watched it happen."],
  [95.6, 98.0, "Homework: double the coil."],
  [98.12, 100.8, "Predict the frequency, then simulate."],
  [101.6, 104.0, "The whole lesson, on one board."],
];

function Subs({ ratio }: { ratio: Ratio }) {
  return (
    <>
      {SUBS.map(([a, b, text]) => (
        <Subtitle key={a} text={text} from={s(a)} until={s(b)} ratio={ratio} />
      ))}
    </>
  );
}

function LessonScene({ ratio, start }: { ratio: Ratio; start: number }) {
  return (
    <Shell>
      <Global start={start}>
        <LessonView ratio={ratio} />
        <Chips ratio={ratio} />
        <Subs ratio={ratio} />
      </Global>
    </Shell>
  );
}

const Parts12 = ({ ratio }: AdProps) => <LessonScene ratio={ratio} start={AT.lesson} />;
const Solve = ({ ratio }: AdProps) => <LessonScene ratio={ratio} start={AT.solve} />;
const Explain = ({ ratio }: AdProps) => <LessonScene ratio={ratio} start={AT.explain} />;
const Lab = ({ ratio }: AdProps) => <LessonScene ratio={ratio} start={AT.lab} />;

// ── the end ──────────────────────────────────────────────────────────────────

function End({ ratio }: AdProps) {
  const f = useFrame();
  const g = AT.end + f;
  const k = easings.outCubic(prog(g, [s(102.3), s(103.0)], easings.linear));
  const veil = prog(g, [s(102.0), s(103.0)], easings.linear);
  const size = { "16x9": 1, "1x1": 0.92, "9x16": 1.05 }[ratio];
  return (
    <Shell>
      <Global start={AT.end}>
        <LessonView ratio={ratio} />
        <div style={{ position: "absolute", inset: 0, background: `rgba(255,255,255,${0.72 * veil})` }} />
        <Subs ratio={ratio} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: ratio === "9x16" ? 120 : 0 }}>
          <div style={{ opacity: k, transform: `translateY(${(1 - k) * 30}px) scale(${size})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 26, padding: "54px 80px", background: "#fff", borderRadius: 40, boxShadow: "0 20px 80px rgba(40,40,100,.18)", border: "1px solid rgba(81,79,187,.15)" }}>
            <Wordmark size={92} />
            <div style={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, fontSize: 64, color: TEXT, letterSpacing: "-0.02em" }}>Write math Naturally</div>
            <div style={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, fontSize: 48, color: PRIMARY }}>mathbooklm.com</div>
            <div style={{ fontFamily: '"Nunito", sans-serif', fontWeight: 600, fontSize: 34, color: "#464553" }}>Free forever · Premium 7-day free trial</div>
          </div>
        </div>
      </Global>
    </Shell>
  );
}

export const scenes: Scene[] = [
  { id: "bench", name: "No battery, and it rings", component: Bench, frames: AT.room - AT.bench },
  { id: "room", name: "Today's lesson", component: Room, frames: AT.lesson - AT.room },
  { id: "parts", name: "Parts 1 and 2: capacitor and coil", component: Parts12, frames: AT.solve - AT.lesson },
  { id: "solve", name: "Part 3: Solve on canvas", component: Solve, frames: AT.explain - AT.solve },
  { id: "explain", name: "Explain on canvas", component: Explain, frames: AT.lab - AT.explain },
  { id: "lab", name: "Part 4: the simulation", component: Lab, frames: AT.end - AT.lab },
  { id: "end", name: "End card", component: End, frames: AT.stop - AT.end },
];

