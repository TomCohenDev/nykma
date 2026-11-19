import type { CSSProperties, ReactNode } from "react";
import { asset, quadMatrix, ScreenInsert, useFrame, useVideo, type AdProps, type Cue, type Ratio, type Scene, type ScreenTrack } from "../../engine";
import { CameraView, camAt, type Cam, type CamKey } from "../../parts/camera";
import { Cursor, type CursorKey } from "../../parts/Cursor";
import { clamp, easings, lerp, prog } from "../../parts/time";
import { ANSWER, APP, AppWorld, BOX, LAYOUT, PANEL, T, addAt, answerAddAt, blockTop, boxY, chatY, simThumb, type AppState } from "./app";
import { SimTile, type Kind } from "./gallery";
import type { SimState } from "./sim";
import { AT, Grid, He, MUTED, PRIMARY, SLUG, Shell, TEXT, Wordmark, shot } from "./world";

/**
 * "Spring moves", in Hebrew (v3). A whole lesson goes on writing one solution on the board, and the class didn't
 * follow. "דרך חדשה ללמד": the same board as a projection, the spring written in MathbookLM, the answer step by step,
 * and then the spring itself: the sim, with three "what ifs" dragged on its sliders (k stiffer, m heavier, x₀ further).
 * Almost no words on screen: "דרך חדשה ללמד." and the end card. The people and the first board are generated
 * (public/ads/spring-moves/gen.json, the board copied from a correct derivation built in code); the projection, the
 * app and every number are built here. Narration: Tom Cohen (ElevenLabs, Hebrew), at the times in spec.json.
 */
export const cues: Cue[] = [{ src: `ads/${SLUG}/gen/mix.wav` }];

// ── generated shots: the video when it's made, its approved still until then ─

type Made = Record<string, { file?: string; footage?: { src: string; fps: number; frames: number } }>;
const records = import.meta.glob<Made>("../../../public/ads/spring-moves/generated/generated.json", { eager: true, import: "default" });
const MADE: Made = Object.values(records)[0] ?? {};
// `bun run screen spring-moves desk-b` writes the projection's track once the video is made. Looked up by glob, so a
// missing one never breaks the ad.
const tracks = import.meta.glob<ScreenTrack>("./*.screen.json", { eager: true, import: "default" });
const TRACK_DESK = smoothTrack(tracks["./desk-b.screen.json"]);

/** One corner coordinate over the clip, smoothed locally: a median of 5 frames drops a one-frame blip, then a mean
 * of 7 takes out the sub-pixel noise. Local, so it follows the board as it holds still and then starts to move. */
function smoothSeries(ys: number[]): number[] {
  const at = (arr: number[], i: number) => arr[clamp(i, 0, arr.length - 1)];
  const med = ys.map((_, i) => [-2, -1, 0, 1, 2].map((d) => at(ys, i + d)).sort((p, q) => p - q)[2]);
  return med.map((_, i) => [-3, -2, -1, 0, 1, 2, 3].reduce((sum, d) => sum + at(med, i + d), 0) / 7);
}

/** The tracker finds the screen frame by frame. Its top-left, top-right and bottom-right corners are clean (nothing
 * crosses them) and are smoothed in place. The bottom-left is the one his head crosses, so it's never read: the screen
 * is a parallelogram to within half a pixel, so it's top-left + bottom-right − top-right. The cut-out in front of the
 * screen still comes from the key, frame by frame. */
function smoothTrack(t: ScreenTrack | undefined): ScreenTrack | undefined {
  if (!t) return t;
  const s = [0, 1, 2].map((q) => [0, 1].map((d) => smoothSeries(t.corners.map((f) => f[q][d]))));
  const corners = t.corners.map((_, i) => {
    const p = (q: number): [number, number] => [s[q][0][i], s[q][1][i]];
    const [tl, tr, br] = [p(0), p(1), p(2)];
    return [tl, tr, br, [tl[0] + br[0] - tr[0], tl[1] + br[1] - tr[1]]];
  });
  return { ...t, corners: corners as ScreenTrack["corners"] };
}

/** The clips and stills are upright, laid out here in 1080×1920 clip pixels. */
const CLIP = { w: 1080, h: 1920 };
/** A still is 941×1672; covering the clip box scales it by this. */
const STILL_K = CLIP.h / 1672;
const STILL_X = (CLIP.w - 941 * STILL_K) / 2;
/** The green projection in desk-b-still, in clip pixels (found from the still's green), 4 px wider all round so no green edge shows. */
const DESK_QUAD: [number, number][] = [
  [168, 492],
  [907, 492],
  [908, 880],
  [167, 880],
].map(([x, y]) => [STILL_X + x * STILL_K, y * STILL_K] as [number, number]);

/** Clip pixels, filmed by a camera in clip pixels: `z` is on top of the scale that covers the frame. */
function Shot({ id, still, t, cam, filter, children }: { id: string; still: string; t: number; cam: Cam; filter?: string; children?: ReactNode }) {
  const { width: W, height: H } = useVideo();
  const f = MADE[id]?.footage;
  const file = f
    ? f.src.replace(/#+/, (run) => String(clamp(Math.floor(t * f.fps + 1e-6), 0, f.frames - 1) + 1).padStart(run.length, "0"))
    : `ads/${SLUG}/${MADE[still]?.file ?? `generated/${still}.png`}`;
  const s = Math.max(W / CLIP.w, H / CLIP.h) * cam.z;
  const x = clamp(W / 2 - cam.cx * s, W - CLIP.w * s, 0);
  const y = clamp(H / 2 - cam.cy * s, H - CLIP.h * s, 0);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: CLIP.w, height: CLIP.h, transform: `translate(${x}px, ${y}px) scale(${s})`, transformOrigin: "0 0" }}>
        <img src={asset(file)} alt="" style={{ position: "absolute", left: 0, top: 0, width: CLIP.w, height: CLIP.h, objectFit: "cover", filter }} />
        {children}
      </div>
    </div>
  );
}
const hasVideo = (id: string) => Boolean(MADE[id]?.footage);

/** A headline's place and size, per shape. */
type Spot = Record<Ratio, { s: CSSProperties; size: number }>;

// ── 1. A whole lesson, just to write it on the board ─────────────────────────

/** board-a's framing: the whole board and the teacher. Clip pixels. */
const BOARD_CAM: Record<Ratio, Cam> = { "16x9": { cx: 540, cy: 911, z: 1 }, "1x1": { cx: 540, cy: 905, z: 1 }, "9x16": { cx: 540, cy: 960, z: 1 } };
/** The 6 s clip over the 5 s shot, so it ends on him rubbing his neck: the frame the projector scene starts from. */
const boardT = (g: number) => (g / 30) * 1.18;

/** One shot, no words on it: the whole board, pushed in slowly while he finishes the corner and walks away from it. */
function Board({ ratio }: AdProps) {
  const frame = useFrame();
  const a = BOARD_CAM[ratio];
  const cam = { ...a, z: a.z * (1 + 0.12 * easings.inOutSine(prog(frame, [0, 150], easings.linear))) };
  return (
    <Shell bg="#c9c4ba">
      <Shot id="board-a" still="board-a2-still" t={boardT(AT.board + frame)} cam={cam} />
    </Shell>
  );
}

// ── 2. The class understood nothing ──────────────────────────────────────────

function ClassA({ ratio }: AdProps) {
  const frame = useFrame();
  const c: Record<Ratio, Cam> = { "16x9": { cx: 470, cy: 1000, z: 1 }, "1x1": { cx: 470, cy: 1010, z: 1 }, "9x16": { cx: 540, cy: 960, z: 1 } };
  const cam = { ...c[ratio], z: c[ratio].z * (1.02 + 0.05 * prog(frame, [0, 78], easings.linear)) };
  return (
    <Shell bg="#2a2f33">
      <Shot id="class-a" still="class-a-still" t={(frame / 30) * 0.9} cam={cam} filter="saturate(0.82) contrast(1.03)" />
    </Shell>
  );
}

// ── 3. A new way to teach: the projector comes on ────────────────────────────

/** The whiteboard in board-a2-still, in clip pixels. */
const BOARD_BOX = { x: 14, y: 585, w: 1050, h: 652 };
/** The ad's one line before the end card, in the board's new white. */
const NEW_WAY: Spot = {
  "16x9": { s: { left: 0, right: 0, top: 440, textAlign: "center" }, size: 124 },
  "1x1": { s: { left: 0, right: 0, top: 420, textAlign: "center" }, size: 120 },
  "9x16": { s: { left: 0, right: 0, top: 820, textAlign: "center" }, size: 150 },
};

function Beam({ ratio }: AdProps) {
  const frame = useFrame();
  const on = prog(frame, [5, 9], easings.linear);
  const wash = easings.inOutCubic(prog(frame, [8, 30], easings.linear));
  const out = easings.inCubic(prog(frame, [56, 72], easings.linear));
  return (
    <Shell bg="#fff">
      <Shot id="board-a" still="board-a2-still" t={5.9} cam={BOARD_CAM[ratio]}>
        {/* the beam from the projector to the board, then its light over the board */}
        <svg width={CLIP.w} height={CLIP.h} style={{ position: "absolute", left: 0, top: 0, opacity: on * (1 - out) }}>
          <defs>
            <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity={0.55} />
              <stop offset="1" stopColor="#fff" stopOpacity={0.08} />
            </linearGradient>
          </defs>
          <path d={`M770 270L${BOARD_BOX.x} ${BOARD_BOX.y}L${BOARD_BOX.x + BOARD_BOX.w} ${BOARD_BOX.y}Z`} fill="url(#beam)" />
        </svg>
        <div style={{ position: "absolute", left: BOARD_BOX.x - 20, top: BOARD_BOX.y - 20, width: BOARD_BOX.w + 40, height: BOARD_BOX.h + 40, background: "#fdfdfc", opacity: wash * 0.96, filter: "blur(14px)" }} />
      </Shot>
      <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: out }} />
      <He text="דרך חדשה | ללמד." from={19} size={NEW_WAY[ratio].size} color={TEXT} style={NEW_WAY[ratio].s} weight={900} stagger={5} />
    </Shell>
  );
}

// ── 4. Written easily, on MathbookLM ─────────────────────────────────────────

/** desk-b's framing: the projection and the teacher at his desk. Clip pixels. */
const DESK_CAM: Record<Ratio, Cam> = { "16x9": { cx: 540, cy: 860, z: 1 }, "1x1": { cx: 540, cy: 880, z: 1 }, "9x16": { cx: 540, cy: 960, z: 1 } };
const PUSH = [80, 108] as const;
/** The projection where the push ends, and the clip it's in: the tracked video's when it's there (the video drifts in,
 * so its screen is wider than the still's), the still's otherwise. Clip pixels. */
const DESK_USE_TRACK = Boolean(TRACK_DESK && hasVideo("desk-b"));
const END_QUAD: [number, number][] = DESK_USE_TRACK
  ? TRACK_DESK!.corners[clamp(Math.floor((PUSH[1] / 30) * TRACK_DESK!.fps + 1e-6), 0, TRACK_DESK!.frames - 1)]
  : DESK_QUAD;
const DESK_CLIP = DESK_USE_TRACK ? { w: TRACK_DESK!.width, h: TRACK_DESK!.height } : CLIP;
/** Where the push into the projection aims: the app's x 1446, near its top third. Clip pixels. */
const PUSH_AT = { x: END_QUAD[0][0] + (1446 / APP.w) * (END_QUAD[1][0] - END_QUAD[0][0]), y: END_QUAD[0][1] + 0.43 * (END_QUAD[3][1] - END_QUAD[0][1]) };
/** A camera as <ScreenInsert>'s focus: the same crop Shot makes, as a fraction of the clip's overhang. */
const camFocus = (cam: Cam, W: number, H: number, c: { w: number; h: number }): [number, number] => {
  const s = Math.max(W / c.w, H / c.h) * cam.z;
  const fx = W - c.w * s;
  const fy = H - c.h * s;
  return [fx < 0 ? clamp(W / 2 - cam.cx * s, fx, 0) / fx : 0.5, fy < 0 ? clamp(H / 2 - cam.cy * s, fy, 0) / fy : 0.5];
};
const pushCam = (ratio: Ratio, f: number): Cam => {
  const k = easings.inCubic(prog(f, PUSH, easings.linear));
  const a = DESK_CAM[ratio];
  return { cx: lerp(a.cx, PUSH_AT.x, k), cy: lerp(a.cy, PUSH_AT.y, k), z: Math.exp(lerp(0, Math.log(2.7), k)) * a.z };
};
/** The sim as the app made it: the question's values. */
const SIM0 = { m: 2, k: 200, x0: 0.1 };
const simIdle: SimState = { ...SIM0, t: 0, changed: false };
const projectorLook: CSSProperties = { filter: "brightness(1.03) contrast(0.9) saturate(0.88)" };

function Projection({ t }: { t: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, ...projectorLook }}>
      <AppWorld t={t} scroll={0} focus={0} dim={0} sim={simIdle} simActive={false} addHot={false} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 55% at 52% 46%, rgba(255,255,255,.1), rgba(0,0,0,0) 60%, rgba(0,0,0,.06))" }} />
    </div>
  );
}

/**
 * desk-b glitches for four frames (clip frames 23-26, indexes 22-25): the bottom edge of the green jumps up with a dark
 * line along it, which the key keeps as foreground, so it flashed over the app. Those frames are skipped: 22-23 hold 21
 * and 24-25 hold 26. He barely moves in that sixth of a second, so the hold doesn't show and the edge stays put.
 */
const deskClipTime = (frame: number) => {
  const fps = TRACK_DESK?.fps ?? 24;
  const t = frame / 30;
  const i = Math.floor(t * fps + 1e-6);
  return i === 22 || i === 23 ? 21.5 / fps : i === 24 || i === 25 ? 26.5 / fps : t;
};

function Desk({ ratio }: AdProps) {
  const frame = useFrame();
  const { width: W, height: H } = useVideo();
  const cam = pushCam(ratio, frame);
  const focus = camFocus(cam, W, H, DESK_CLIP);
  // A projector's softness, so the app's 1 px grid lines don't shimmer as the board drifts by fractions of a pixel.
  const screenStyle: CSSProperties = { filter: `${projectorLook.filter} blur(0.8px)` };
  return (
    <Shell bg="#3a2f25">
      {DESK_USE_TRACK ? (
        // The tracked projection: the app laid on the green, frame by frame, with him in front of it.
        <ScreenInsert track={TRACK_DESK!} size={[APP.w, APP.h]} at={deskClipTime} focus={focus} zoom={cam.z} screenStyle={screenStyle} bleed={4}>
          <Projection t={frame} />
        </ScreenInsert>
      ) : (
        <Shot id="desk-b" still="desk-b-still" t={frame / 30} cam={cam}>
          <div style={{ position: "absolute", left: 0, top: 0, width: APP.w, height: APP.h, transformOrigin: "0 0", transform: quadMatrix(DESK_QUAD, [APP.w, APP.h]) }}>
            <Projection t={frame} />
          </div>
        </Shot>
      )}
    </Shell>
  );
}

// ── 5. Step by step ──────────────────────────────────────────────────────────

/** The camera over the app, in app pixels. `panel` frames the chat with a strip of canvas on its left. */
const PANEL_Z = 2.2;
const panelCam = (W: number, H: number): Cam => ({ cx: APP.w - W / (2 * PANEL_Z), cy: H > W ? 500 : 470, z: PANEL_Z });
/** Where the desk scene's push into the projection ends, as a camera over the app: so the cut lines up. */
const startCam = (W: number, H: number): Cam => ({ cx: 1446, cy: 0.43 * APP.h, z: 2.7 * Math.max(W / DESK_CLIP.w, H / DESK_CLIP.h) * ((END_QUAD[1][0] - END_QUAD[0][0]) / APP.w) });

/** The scroll that puts chat content y `y` near the top of the frame, for a camera. */
const scrollFor = (y: number, cam: Cam, H: number) => Math.max(0, chatY(y, 0) - (cam.cy - H / (2 * cam.z) + 50 / cam.z));

/**
 * The steps scene, in its own frames. The answer arrives in the chat, the chat runs down to its Copy · Redo · Add to
 * canvas, the cursor clicks Add to canvas, and the answer lands on the canvas as a box. Then the camera goes to the box
 * and down its steps, each lit as the camera reaches it, under "שלב אחרי שלב".
 */
const STEP_AT = [
  { n: 1, at: 56 },
  { n: 2, at: 66 },
  { n: 3, at: 80 },
  { n: 4, at: 92 },
] as const;
const END_AT = 104;
const CLICK = T.answerAdd - (AT.steps - AT.desk);
const BOX_H = (BOX.pad[0] * 2 + ANSWER.reduce((a, b) => a + b.h, 0)) * BOX.s;

/** The chat scrolled so content y `y` sits at `frac` of the frame's height, for a camera. */
const scrollAt = (y: number, frac: number, cam: Cam, H: number) => Math.max(0, chatY(y, 0) - (cam.cy + (frac - 0.5) * (H / cam.z)));

/** Over the answer's box: its width fills nine tenths of the frame, and block `id` sits near the top. App pixels. */
const boxCam = (W: number, H: number, id: string): Cam => {
  const z = (W * 0.9) / (BOX.w * BOX.s);
  const half = H / (2 * z);
  const lo = BOX.y - 30 / z + half;
  const hi = BOX.y + BOX_H + 30 / z - half;
  return { cx: BOX.x + (BOX.w * BOX.s) / 2, cy: hi < lo ? (BOX.y + BOX.y + BOX_H) / 2 : clamp(boxY(id) - 60 / z + half, lo, hi), z };
};

function stepsCam(f: number, W: number, H: number): Cam {
  const pc = panelCam(W, H);
  const start = startCam(W, H);
  if (f < 30) {
    const k = easings.inOutCubic(prog(f, [0, 18], easings.linear));
    return { cx: lerp(start.cx, pc.cx, k), cy: lerp(start.cy, pc.cy, k), z: Math.exp(lerp(Math.log(start.z), Math.log(pc.z), k)) };
  }
  return camAt(f, [
    { f: 30, ...pc },
    { f: 50, ...boxCam(W, H, "lead"), ease: easings.inOutCubic },
    { f: 58, ...boxCam(W, H, "s1"), ease: easings.inOutCubic },
    { f: 68, ...boxCam(W, H, "s2"), ease: easings.inOutCubic },
    { f: 82, ...boxCam(W, H, "s3"), ease: easings.inOutCubic },
    { f: 94, ...boxCam(W, H, "s4"), ease: easings.inOutCubic },
    { f: 108, ...boxCam(W, H, "end"), ease: easings.inOutCubic },
  ]);
}
/** Where the steps scene leaves the camera, for the sim scene to start from. */
const stepsEndCam = (W: number, H: number) => stepsCam(AT.sim - AT.steps, W, H);

function Steps() {
  const frame = useFrame();
  const { width: W, height: H } = useVideo();
  const t = AT.steps - AT.desk + frame;
  const cam = stepsCam(frame, W, H);
  const pc = panelCam(W, H);
  // The chat runs down the answer to its actions row, three quarters of the way down the frame.
  const sEnd = scrollAt(LAYOUT.ai1End, 0.75, pc, H);
  const scroll = lerp(0, sEnd, easings.inOutCubic(prog(frame, [10, 22], easings.linear)));
  const focus = frame >= END_AT ? 5 : [...STEP_AT].reverse().find((s) => frame >= s.at)?.n ?? 0;
  const dim = focus ? prog(frame, [STEP_AT[0].at, STEP_AT[0].at + 6], easings.linear) : 0;
  const on = (f: number, p: { x: number; y: number }) => shot(stepsCam(f, W, H), W, H, p.x, p.y);
  const cursor: CursorKey[] = [
    { f: 6, x: W * 1.05, y: H * 0.95 },
    { f: CLICK - 2, ...on(CLICK, answerAddAt(sEnd)), ease: easings.inOutCubic },
    { f: CLICK, ...on(CLICK, answerAddAt(sEnd)), click: true },
    { f: CLICK + 4, ...on(CLICK, answerAddAt(sEnd)) },
    { f: CLICK + 20, x: W * 1.08, y: H * 1.1, ease: easings.inCubic },
  ];
  const state: AppState = { t, scroll, focus, dim, sim: simIdle, simActive: false, addHot: false };
  return (
    <Shell>
      <Backdrop cam={cam} />
      <CameraView cam={cam}>
        <AppWorld {...state} />
      </CameraView>
      <Cursor keys={cursor} size={30} color="#fff" outline="#111" rippleColor="#6965db" rippleSize={100} />
    </Shell>
  );
}

// ── 6. The spring itself: it moves, and every "what if" is a slider ──────────

const ease = (t: number, span: readonly [number, number]) => easings.inOutCubic(prog(t, span, easings.linear));
/** The sim at app time `t`. Like the app's runtime, the run holds while a slider is dragged and restarts from 0 when
 * it's let go. */
export function simAt(t: number): SimState {
  const m = SIM0.m + 3 * ease(t, T.dragM);
  const k = SIM0.k + 600 * ease(t, T.dragK);
  const x0 = SIM0.x0 + 0.1 * ease(t, T.dragX);
  let start: number = T.answer2;
  for (const d of [T.dragK, T.dragM, T.dragX]) if (t >= d[0]) start = Math.min(t, d[1]);
  return { m, k, x0, t: Math.max(0, t - start) / 30, changed: t >= T.dragK[0] };
}

/** Tight on the stage and the sliders: the spring, its graph, and the three knobs being dragged. App pixels. Upright,
 * the frame is as wide as the sim, with the handwriting whole above it: the tight crop would cut the equation off. */
const SIM_TIGHT = (W: number, H: number): Cam => (H > W * 1.2 ? { cx: 690, cy: 640, z: W / 904 } : { cx: 818, cy: 652, z: Math.min(W / 560, H / 440) });
const WIDE_CAM = (W: number, H: number): Cam => (H > W ? { cx: 700, cy: 560, z: 1.02 } : { cx: APP.w - W / (2 * 0.62), cy: 520, z: 0.62 });
/** The drags, in frames of the sim scene. */
const SCENE0 = T.type2[0];
const D = { k: [T.dragK[0] - SCENE0, T.dragK[1] - SCENE0], m: [T.dragM[0] - SCENE0, T.dragM[1] - SCENE0], x: [T.dragX[0] - SCENE0, T.dragX[1] - SCENE0] } as const;
/** Back to the whole canvas on "והכול נשאר מסודר": the writing, the solution and the sim side by side. */
const PULL_BACK = [183, 216] as const;

/** The canvas's grid past the app's 1000 px, left of the chat panel, so a tall frame doesn't end in flat white. */
function Backdrop({ cam }: { cam: Cam }) {
  const { width: W, height: H } = useVideo();
  const right = shot(cam, W, H, PANEL.x, 0).x;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: clamp(right, 0, W), height: H, overflow: "hidden" }}>
      <Grid cam={cam} />
    </div>
  );
}

function SimScene() {
  const frame = useFrame();
  const { width: W, height: H } = useVideo();
  const t = AT.sim - AT.desk + frame;
  const pc = panelCam(W, H);
  // The chat: down to the new message, then to the card.
  const s0 = scrollFor(LAYOUT.ai1Text + blockTop(ANSWER, "end") - 40, pc, H);
  const s1 = scrollFor(LAYOUT.user2 - 20, pc, H);
  const s2 = scrollFor(LAYOUT.card - 60, pc, H);
  const scroll = frame < 18 ? s0 : frame < 44 ? lerp(s0, s1, easings.inOutCubic(prog(frame, [18, 30], easings.linear))) : lerp(s1, s2, easings.inOutCubic(prog(frame, [44, 52], easings.linear)));
  const tight = SIM_TIGHT(W, H);
  const keys: CamKey[] = [
    { f: 0, ...stepsEndCam(W, H) },
    { f: 16, ...pc, ease: easings.inOutCubic },
    { f: 56, ...pc },
    { f: 86, ...tight, ease: easings.inOutCubic },
    { f: PULL_BACK[0], ...tight },
    { f: PULL_BACK[1], ...WIDE_CAM(W, H), ease: easings.inOutCubic },
  ];
  const cam = camAt(frame, keys);
  const sim = simAt(t);
  const on = (f: number, p: { x: number; y: number }) => shot(camAt(f, keys), W, H, p.x, p.y);
  const add = addAt(s2);
  const cursor: CursorKey[] = [
    { f: 30, x: W * 1.05, y: H * 0.95 },
    { f: 50, ...on(50, { x: add.x + 30, y: add.y + 40 }), ease: easings.inOutCubic },
    { f: T.add - SCENE0, ...on(52, add), click: true, ease: easings.inOutCubic },
    { f: 86, ...on(86, simThumb("k", SIM0.k)), ease: easings.inOutCubic },
    { f: D.k[0], ...on(D.k[0], simThumb("k", SIM0.k)) },
    { f: D.k[1], ...on(D.k[1], simThumb("k", 800)), ease: easings.inOutCubic },
    { f: D.k[1] + 1, ...on(D.k[1], simThumb("k", 800)) },
    { f: D.m[0] - 1, ...on(D.m[0], simThumb("m", SIM0.m)), ease: easings.inOutCubic },
    { f: D.m[0], ...on(D.m[0], simThumb("m", SIM0.m)) },
    { f: D.m[1], ...on(D.m[1], simThumb("m", 5)), ease: easings.inOutCubic },
    { f: D.m[1] + 1, ...on(D.m[1], simThumb("m", 5)) },
    { f: D.x[0] - 1, ...on(D.x[0], simThumb("x0", SIM0.x0)), ease: easings.inOutCubic },
    { f: D.x[0], ...on(D.x[0], simThumb("x0", SIM0.x0)) },
    { f: D.x[1], ...on(D.x[1], simThumb("x0", 0.2)), ease: easings.inOutCubic },
    { f: D.x[1] + 6, ...on(D.x[1], simThumb("x0", 0.2)) },
    { f: D.x[1] + 26, x: W * 1.06, y: H * 1.08, ease: easings.inCubic },
  ];
  const state: AppState = { t, scroll, focus: 0, dim: 0, sim, simActive: frame >= 58 && frame < PULL_BACK[0], addHot: frame >= 46 && frame < 60 };
  return (
    <Shell>
      <Backdrop cam={cam} />
      <CameraView cam={cam}>
        <AppWorld {...state} />
      </CameraView>
      <Cursor keys={cursor} size={30} color="#fff" outline="#111" rippleColor="#6965db" rippleSize={100} />
    </Shell>
  );
}

// ── 7. Much clearer ──────────────────────────────────────────────────────────

function ClassB({ ratio }: AdProps) {
  const frame = useFrame();
  const c: Record<Ratio, Cam> = { "16x9": { cx: 600, cy: 960, z: 1 }, "1x1": { cx: 600, cy: 980, z: 1 }, "9x16": { cx: 540, cy: 960, z: 1 } };
  const cam = { ...c[ratio], z: c[ratio].z * (1.02 + 0.06 * prog(frame, [0, 81], easings.linear)) };
  return (
    <Shell bg="#3a2f25">
      <Shot id="class-b" still="class-b-still" t={frame / 30} cam={cam} />
    </Shell>
  );
}

// ── 8. End card ──────────────────────────────────────────────────────────────

/** The end card's cards, in the order they rise in: the spring first, then the other simulations. */
const KINDS: Kind[] = ["spring", "pendulum", "projectile", "orbit", "capacitor", "refraction"];

function End({ ratio }: AdProps) {
  const frame = useFrame();
  const t = AT.end - AT.desk + frame;
  const size: Record<Ratio, { mark: number; tag: number; btn: number; url: number; gap: number }> = {
    "16x9": { mark: 110, tag: 56, btn: 42, url: 34, gap: 24 },
    "1x1": { mark: 100, tag: 54, btn: 40, url: 32, gap: 22 },
    "9x16": { mark: 120, tag: 70, btn: 50, url: 40, gap: 34 },
  };
  const s = size[ratio];
  const rise = (f: number): CSSProperties => {
    const k = easings.outCubic(prog(frame, [f, f + 12], easings.linear));
    return { opacity: k, transform: `translateY(${(1 - k) * 24}px)` };
  };
  // Where each card sits, and how wide: three over and three under the words when square, a grid of two under them upright.
  const tiles: Record<Ratio, { w: number; at: [number, number][] }> = {
    "1x1": { w: 330, at: [[22, 22], [375, 22], [728, 22], [22, 816], [375, 816], [728, 816]] },
    "9x16": { w: 500, at: [[27, 712], [553, 712], [27, 1088], [553, 1088], [27, 1464], [553, 1464]] },
    "16x9": { w: 400, at: [[40, 40], [760, 40], [1480, 40], [40, 680], [760, 680], [1480, 680]] },
  };
  const tile = tiles[ratio];
  const words: Record<Ratio, number> = { "1x1": 318, "9x16": 110, "16x9": 330 };
  const line = (n: number) => `linear-gradient(to ${n ? "right" : "bottom"}, #e5e5e5 1px, transparent 1px)`;
  return (
    <Shell>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `${line(0)}, ${line(1)}`, backgroundSize: "100px 100px", opacity: 0.6 }} />
      {KINDS.map((kind, i) => {
        const f0 = 2 + i * 5;
        const k = easings.outBack(prog(frame, [f0, f0 + 14], easings.linear));
        const [x, y] = tile.at[i];
        return (
          <div key={kind} style={{ position: "absolute", left: x, top: y, opacity: prog(frame, [f0, f0 + 5], easings.linear), transform: `translateY(${(1 - k) * 40}px) scale(${0.9 + 0.1 * k})`, transformOrigin: "50% 50%" }}>
            <SimTile kind={kind} t={(frame + i * 23) / 30} width={tile.w} spring={simAt(t)} />
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: words[ratio], display: "flex", flexDirection: "column", alignItems: "center", gap: s.gap }}>
        <div style={rise(-4)}>
          <Wordmark size={s.mark} />
        </div>
        {/* on "כלי הוראה משולב AI" in the voice, at 31.2 s */}
        <div dir="rtl" style={{ ...rise(36), fontFamily: '"Rubik", sans-serif', fontWeight: 800, fontSize: s.tag, color: TEXT, textAlign: "center", lineHeight: 1.15 }}>
          כלי הוראה משולב <bdi dir="ltr" style={{ color: PRIMARY }}>AI</bdi>
        </div>
        {/* on "נסו בחינם", at 33.2 s */}
        <div dir="rtl" style={{ ...rise(92), fontFamily: '"Rubik", sans-serif', fontWeight: 700, fontSize: s.btn, color: "#fff", background: PRIMARY, padding: `${s.btn * 0.32}px ${s.btn * 0.9}px`, borderRadius: s.btn }}>מתחילים בחינם</div>
        <div style={{ ...rise(100), fontFamily: '"Nunito", sans-serif', fontWeight: 700, fontSize: s.url, color: MUTED }}>mathbooklm.com</div>
      </div>
    </Shell>
  );
}

export const scenes: Scene[] = [
  { id: "board", name: "A whole lesson on the board", component: Board, frames: AT.classA - AT.board },
  { id: "class-a", name: "The class understood nothing", component: ClassA, frames: AT.beam - AT.classA },
  { id: "beam", name: "A new way to teach", component: Beam, frames: AT.desk - AT.beam },
  { id: "desk", name: "Written easily", component: Desk, frames: AT.steps - AT.desk },
  { id: "steps", name: "Step by step", component: Steps, frames: AT.sim - AT.steps },
  { id: "sim", name: "What if…", component: SimScene, frames: AT.classB - AT.sim },
  { id: "class-b", name: "Much clearer", component: ClassB, frames: AT.end - AT.classB },
  { id: "end", name: "End card", component: End, frames: AT.stop - AT.end },
];
