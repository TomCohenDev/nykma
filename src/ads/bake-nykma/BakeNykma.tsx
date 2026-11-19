import type { CSSProperties } from "react";
import { useFrame, useVideo, type AdProps, type Ratio, type Scene } from "../../engine";
import { CameraView, type Cam } from "../../parts/camera";
import { Cursor, type CursorKey } from "../../parts/Cursor";
import { Rough } from "../../parts/Rough";
import { handCues } from "../../parts/hand";
import { ANSWERS } from "./hand";
import { easings, lerp, prog, type Span } from "../../parts/time";
import {
  ANS_X, BEAT, COL, Chrome, Column, EQ_X, Grid, Hand, Head, INK, LEN, MUTED, PANEL_W, PRIMARY, Panel, QM_X, RESULT, RES_BASE, SIZE, SLUG, Selection,
  SelectionBar, Shell, Stylus, TEXT, UI, Wordmark, barWidth, baseOf, boxOf, canvasWidth, itemCentre, rowY, shot,
} from "./world";

/**
 * "The one you're stuck on". Homework problems 1 to 13 go by on the beat, an answer inked on every kick, until #14
 * (x² − 8x + 15 = 0) stops the pen and the music. Select it, Solve, and x = 3, 5 is written back under it. Then the
 * camera pulls back to the whole column, #14 circled: 3 free AI actions a day, for the one you're stuck on.
 * One world (the canvas, in world pixels), filmed per ratio. Sound is made in code: scripts/audio/bake-nykma-track.mjs.
 */

const mix = (p: Cam, q: Cam, k: number): Cam => ({ cx: lerp(p.cx, q.cx, k), cy: lerp(p.cy, q.cy, k), z: Math.exp(lerp(Math.log(p.z), Math.log(q.z), k)) });

const COL_CX = (COL.left + COL.right) / 2;
const COL_CY = (COL.top + COL.bottom) / 2;

/** How each ratio films the column: zoom, and where the active row sits on screen (0..1 of the height). */
const FRAMING: Record<Ratio, { z: number; at: number; zf: number; atf: number }> = {
  "16x9": { z: 0.86, at: 0.38, zf: 0.95, atf: 0.36 },
  "1x1": { z: 0.68, at: 0.36, zf: 0.73, atf: 0.34 },
  "9x16": { z: 0.68, at: 0.42, zf: 0.73, atf: 0.4 },
};

/** The camera on row `row` (fractional between rows). */
const rowCam = (ratio: Ratio, H: number, row: number): Cam => {
  const { z, at } = FRAMING[ratio];
  const y = lerp(rowY(Math.floor(row)), rowY(Math.floor(row) + 1), row - Math.floor(row));
  return { cx: COL_CX, cy: y + (0.5 - at) * (H / z), z };
};

/** Close on #14: the equation, the answer column and room under it for the result. */
const FOCUS_X = COL_CX;
const focusCam = (ratio: Ratio, H: number): Cam => {
  const { zf, atf } = FRAMING[ratio];
  const y = (rowY(14) + RES_BASE - 30) / 2;
  return { cx: FOCUS_X, cy: y + (0.5 - atf) * (H / zf), z: zf };
};

// ── 1. the rush ──────────────────────────────────────────────────────────────

/** Rows 6 to 13 are answered on the beats of the rush; 1 to 5 already are. Row r's beat is frame BEAT * (r - 6). */
const RUSH_FIRST = 6;
const rushWrite = (row: number): Span | undefined => (row < RUSH_FIRST ? [-3, -2] : [BEAT * (row - RUSH_FIRST) + 1, BEAT * (row - RUSH_FIRST) + 10]);
/** Which row the camera is on: it steps to the next row in the 5 frames before each beat. */
const rushRow = (f: number) => {
  let r = RUSH_FIRST;
  for (let k = 1; k <= 8; k++) r += easings.inOutCubic(prog(f, [BEAT * k - 5, BEAT * k], easings.linear));
  return r;
};

/** The headlines that sit over the canvas, per ratio. */
const HEADS: Record<Ratio, { style: CSSProperties; size: number; sub: CSSProperties; subSize: number }> = {
  "16x9": { style: { left: 56, bottom: 176 }, size: 96, sub: { left: 64, bottom: 108, width: 1300 }, subSize: 40 },
  "1x1": { style: { left: 48, top: 790 }, size: 84, sub: { left: 48, top: 916, width: 980 }, subSize: 32 },
  "9x16": { style: { left: 64, top: 1290 }, size: 104, sub: { left: 64, top: 1450, width: 900 }, subSize: 44 },
};

function CanvasFrame({ ratio, cam, children, chrome = 1 }: { ratio: Ratio; cam: Cam; children: React.ReactNode; chrome?: number }) {
  const { width: W, height: H } = useVideo();
  const cw = canvasWidth(ratio, W);
  return (
    <>
      <Grid cam={cam} width={W} height={H} />
      <CameraView cam={cam} width={cw} height={H}>
        {children}
      </CameraView>
      <Chrome ratio={ratio} width={cw} opacity={chrome} />
    </>
  );
}

function Rush({ ratio }: AdProps) {
  const frame = useFrame();
  const { height: H } = useVideo();
  const cam = rowCam(ratio, H, rushRow(frame));
  const hd = HEADS[ratio];
  return (
    <Shell>
      <CanvasFrame ratio={ratio} cam={cam}>
        <Column answerWrite={rushWrite} />
      </CanvasFrame>
      {ratio === "16x9" && <Panel left={canvasWidth(ratio, 1920)} k={PANEL_W / 360} used={false} flash={0} />}
      <Head text="1 to 13? Easy." from={4} size={hd.size} style={hd.style} plate stagger={4} late={{ index: 3, from: 44, color: PRIMARY }} />
    </Shell>
  );
}

// ── 2. stuck on 14 ───────────────────────────────────────────────────────────

const ROW14 = baseOf(14);
const TAPS = [28, 35, 42];
const X_EQ: Span = [8, 18];
const QM: Span = [52, 66];

/** The pen over the "?": in the air after "x =", three taps, then the question mark. */
function Hover() {
  const frame = useFrame();
  if (frame < X_EQ[1] - 1 || frame >= QM[0]) return null;
  const tap = Math.min(...TAPS.map((t) => Math.abs(frame - t) / 3), 1);
  const lift = prog(frame, [X_EQ[1], X_EQ[1] + 6]);
  const drift = 6 * Math.sin(frame * 0.21);
  return (
    <div style={{ position: "absolute", left: QM_X + 18 + drift, top: ROW14 - 30, width: 0, height: 0 }}>
      <Stylus size={SIZE} air={Math.min(lift, 0.35 + 0.65 * tap) * 2.2} />
    </div>
  );
}

function TapDots({ all = false }: { all?: boolean }) {
  const frame = useFrame();
  return (
    <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {TAPS.map((t, i) => (all || frame >= t ? <circle key={t} cx={QM_X + 70 + i * 16 + 6 * Math.sin(t * 0.21)} cy={ROW14 - 30 + (i % 2) * 6} r={3.2} fill={INK} /> : null))}
    </svg>
  );
}

function Row14({ q = "done", res }: { q?: "write" | "done"; res?: Span }) {
  const xq = q === "write" ? X_EQ : ([-3, -2] as Span);
  const qm = q === "write" ? QM : ([-3, -2] as Span);
  return (
    <>
      <Hand id="xeq" p={{ x: ANS_X, base: ROW14, size: SIZE }} write={xq} pen={q === "write"} />
      <Hand id="qm" p={{ x: QM_X, base: ROW14, size: SIZE }} write={qm} pen={q === "write"} />
      {q === "write" && <Hover />}
      <TapDots all={q !== "write"} />
      {res && <Hand id="res" p={{ x: EQ_X, base: RES_BASE, size: SIZE }} write={res} color={RESULT} />}
    </>
  );
}

function Stuck({ ratio }: AdProps) {
  const frame = useFrame();
  const { height: H } = useVideo();
  const cam = mix(rowCam(ratio, H, 14), focusCam(ratio, H), easings.inOutSine(prog(frame, [0, 70], easings.linear)));
  const hd = HEADS[ratio];
  return (
    <Shell>
      <CanvasFrame ratio={ratio} cam={cam}>
        <Column answerWrite={() => [-3, -2]} />
        <Row14 q="write" />
      </CanvasFrame>
      {ratio === "16x9" && <Panel left={1920 - PANEL_W} k={PANEL_W / 360} used={false} flash={0} />}
      <Head text="Then there's 14." from={10} size={hd.size} style={hd.style} plate stagger={5} />
    </Shell>
  );
}

// ── 3. select, Solve ─────────────────────────────────────────────────────────

const SV = { drag: [14, 30] as Span, bar: 32, click: 44, done: 56, res: [57, 80] as Span, sub: 68 };

function Solve({ ratio }: AdProps) {
  const frame = useFrame();
  const { width: W, height: H } = useVideo();
  const cw = canvasWidth(ratio, W);
  const f0 = focusCam(ratio, H);
  const cam = (f: number): Cam => ({ ...f0, z: f0.z * (1 + 0.04 * prog(f, [0, LEN.solve], easings.linear)) });
  const c = cam(frame);
  const ui = UI[ratio];
  const eq = boxOf("e14", { x: EQ_X, base: ROW14, size: SIZE });
  // The selection is in screen pixels, at the camera of the moment the drag ends.
  const cs = cam(SV.drag[1]);
  const pad = 16;
  const a = shot(cs, cw, H, eq.left - pad, eq.top - pad);
  const b = shot(cs, cw, H, eq.left + eq.width + pad, eq.top + eq.height + pad);
  const bw = barWidth(ui);
  // The bar is centred over the selection, as on the live canvas.
  const barLeft = Math.min(Math.max((a.x + b.x) / 2 - bw / 2, 20), cw - bw - 20);
  const barBottom = a.y - 10 * ui;
  const solveAt = { x: barLeft + itemCentre(0, ui), y: barBottom - 16 * ui };
  const keys: CursorKey[] = [
    { f: 0, x: cw * 0.86, y: H * 0.9 },
    { f: SV.drag[0], x: a.x, y: a.y, ease: easings.inOutCubic },
    { f: SV.drag[1], x: b.x, y: b.y, ease: easings.inOutQuad },
    { f: SV.bar + 2, x: b.x - 30, y: b.y - 20, ease: easings.outCubic },
    { f: SV.click, x: solveAt.x, y: solveAt.y, click: true, ease: easings.inOutCubic },
    { f: SV.click + 14, x: solveAt.x + 10, y: solveAt.y + 6 },
    { f: SV.click + 40, x: cw * 1.1, y: H * 1.05, ease: easings.inCubic },
  ];
  const hd = HEADS[ratio];
  const flash = prog(frame, [SV.done, SV.done + 4]) * (1 - prog(frame, [SV.done + 30, SV.done + 50]));
  return (
    <Shell>
      <CanvasFrame ratio={ratio} cam={c}>
        <Column answerWrite={() => [-3, -2]} />
        <Row14 res={SV.res} />
      </CanvasFrame>
      <Selection a={a} b={b} ui={ui} drag={SV.drag} until={SV.done} />
      <SelectionBar left={barLeft} bottom={barBottom} ui={ui} appear={SV.bar} loadingFrom={SV.click} loadingUntil={SV.done} caretAt={Math.min(Math.max((a.x + b.x) / 2 - barLeft, 20), bw - 20)} until={SV.done} />
      {ratio === "16x9" && <Panel left={1920 - PANEL_W} k={PANEL_W / 360} used={frame >= SV.done} flash={flash} />}
      <Head text="Select it. Solve." from={2} size={hd.size} style={hd.style} plate stagger={4} />
      <Head text="Worked out by a real algebra engine, right on your canvas." from={SV.sub} size={hd.subSize} weight={700} color={MUTED} style={hd.sub} stagger={1} plate />
      <Cursor keys={keys} size={24 * ui} color="#fff" outline="#111" rippleColor="#6965db" rippleSize={80 * ui} />
    </Shell>
  );
}

// ── 4. the whole column, and the end card ────────────────────────────────────

type EndLayout = { z: number; sx: number; sy: number; copy: CSSProperties; head: number; line: number; mark: number; url: number; align: "left" | "center" };
const END: Record<Ratio, EndLayout> = {
  "16x9": { z: 0.37, sx: 400, sy: 540, copy: { left: 820, top: 0, bottom: 0, width: 1040 }, head: 104, line: 46, mark: 66, url: 44, align: "left" },
  "1x1": { z: 0.3, sx: 262, sy: 540, copy: { left: 500, top: 0, bottom: 0, width: 560 }, head: 62, line: 32, mark: 44, url: 29, align: "left" },
  "9x16": { z: 0.38, sx: 540, sy: 520, copy: { left: 60, right: 60, top: 1080, height: 540 }, head: 92, line: 44, mark: 64, url: 42, align: "center" },
};

function EndScene({ ratio }: AdProps) {
  const frame = useFrame();
  const { width: W, height: H } = useVideo();
  const L = END[ratio];
  const f0 = focusCam(ratio, H);
  // The solve scene filmed a view the canvas's width; this one is the whole frame, so start where that one left off.
  const start: Cam = { ...f0, z: f0.z * 1.04, cx: f0.cx + (W - canvasWidth(ratio, W)) / 2 / (f0.z * 1.04) };
  const wide: Cam = { cx: COL_CX + (W / 2 - L.sx) / L.z, cy: COL_CY + (H / 2 - L.sy) / L.z, z: L.z };
  const pull = easings.inOutCubic(prog(frame, [0, 34], easings.linear));
  const cam = mix(start, wide, pull);
  const dim = prog(frame, [12, 34]);
  const rise = (f: number): CSSProperties => {
    const k = easings.outCubic(prog(frame, [f, f + 12], easings.linear));
    return { opacity: k, transform: `translateY(${(1 - k) * 24}px)` };
  };
  const panelOut = easings.inCubic(prog(frame, [0, 16], easings.linear));
  // "The one": a purple box drawn round #14 and its answer, once the column is in view.
  return (
    <Shell>
      <Grid cam={cam} width={W} height={H} />
      <CameraView cam={cam}>
        <Column answerWrite={() => [-3, -2]} dim={dim} />
        <Row14 res={[-3, -2]} />
        <Rough shape={{ kind: "rect", x: 20, y: baseOf(13) + 52, w: QM_X + 150, h: RES_BASE + 50 - (baseOf(13) + 52) }} draw={[30, 46]} seed={14} strokeWidth={14} stroke={PRIMARY} />
      </CameraView>
      <Chrome ratio={ratio} width={canvasWidth(ratio, W)} opacity={1 - prog(frame, [0, 10])} />
      {ratio === "16x9" && panelOut < 1 && <Panel left={W - PANEL_W + PANEL_W * panelOut} k={PANEL_W / 360} used flash={0} />}
      <div style={{ position: "absolute", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: L.align === "center" ? "center" : "flex-start", textAlign: L.align, gap: L.head * 0.32, fontFamily: '"Nunito", sans-serif', ...L.copy }}>
        <div style={{ ...rise(22), fontSize: L.head, fontWeight: 900, lineHeight: 1.04, letterSpacing: "-0.03em", color: TEXT }}>
          For the one <br />
          you're <span style={{ color: PRIMARY }}>stuck on.</span>
        </div>
        <div style={{ ...rise(42), fontSize: L.line, fontWeight: 700, lineHeight: 1.3, color: MUTED }}>
          3 free AI actions a day. <br />
          Free forever.
        </div>
        <div style={{ ...rise(58), display: "flex", flexDirection: "column", alignItems: L.align === "center" ? "center" : "flex-start", gap: L.url * 0.7, marginTop: L.head * 0.12 }}>
          <Wordmark size={L.mark} />
          <div style={{ fontSize: L.url, fontWeight: 800, color: "#fff", background: PRIMARY, padding: `${L.url * 0.32}px ${L.url * 0.8}px`, borderRadius: L.url, whiteSpace: "nowrap" }}>Try it free · mathbooklm.com</div>
        </div>
      </div>
    </Shell>
  );
}

// ── scenes and sound ─────────────────────────────────────────────────────────

const music = (id: string) => ({ src: `ads/${SLUG}/gen/${id}.wav` });

export const scenes: Scene[] = [
  {
    id: "rush",
    name: "1 to 13, on the beat",
    component: Rush,
    frames: LEN.rush,
    cues: ({ fps }) => [music("rush"), ...handCues(SLUG, Array.from({ length: 8 }, (_, k) => ({ id: `a${ANSWERS[k + RUSH_FIRST - 1]}`, write: rushWrite(k + RUSH_FIRST)! })), { fps, volume: 0.35 })],
  },
  {
    id: "stuck",
    name: "Then there's 14",
    component: Stuck,
    frames: LEN.stuck,
    cues: ({ fps }) => [music("stuck"), ...handCues(SLUG, [{ id: "xeq", write: X_EQ }, { id: "qm", write: QM }], { fps, volume: 0.5 })],
  },
  {
    id: "solve",
    name: "Select it. Solve.",
    component: Solve,
    frames: LEN.solve,
    cues: ({ fps }) => [music("solve"), ...handCues(SLUG, [{ id: "res", write: SV.res }], { fps, volume: 0.3 })],
  },
  { id: "end", name: "For the one you're stuck on", component: EndScene, frames: LEN.end, cues: [{ ...music("end"), fade: 8 }] },
];

/** Frames the sound script needs, in seconds of each scene. */
export const SOUND = { taps: TAPS, click: SV.click, done: SV.done, bar: SV.bar, ring: 30 };
