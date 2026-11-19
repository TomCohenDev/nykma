import type { CSSProperties, ReactNode } from "react";
import { Footage, ScreenInsert, asset, quadMatrix, useFrame, useVideo, type AdProps, type ScreenTrack, type Cue, type Ratio, type Scene } from "../../engine";
import { Cursor, type CursorKey } from "../../parts/Cursor";
import { clamp, easings, lerp, prog } from "../../parts/time";
import { CARD, CARD_POINTS, GIVEN, HW, Lesson, SEL_EXPLAIN, SEL_SOLVE, SIM_ON_CANVAS, SIMBOX, SOLVE, T } from "./canvas";
import { BoxPage, QUESTION, SIM_H, SIM_W, WINDOW, fieldAt, thumbAt, type SimState } from "./sim";
import { BAR_H, BAR_W, ChatPanel, Chrome, PANEL_W, SelectionBar, Selection, WritePill, panelPoints, segAt, type BarState } from "./ui";
import frontTrack from "./front.screen.json";
import frontTallTrack from "./front-tall.screen.json";
import { AT, Chip, Global, Grid, PRIMARY, SLUG, Shell, Subtitle, TEXT, UI, World, Wordmark, camAt, onScreen, s, type Cam, type Frame, type L } from "./world";

/**
 * "Newton's laws" (lesson 4). A teacher pushes a heavy crate: nothing, then it slides. The lesson on the canvas says
 * why: the forces drawn in ink, Solve on canvas for a = 4 m/s², Explain on canvas for static against kinetic friction
 * (with the third-law "Watch out"), and a simulation where 12 N moves nothing and 16 N breaks it free, shown again on
 * the classroom projector. Narration: Alice (ElevenLabs), at the times in spec.json. The teacher, the students and the
 * classroom are generated (public/ads/newton-lesson/gen.json); the projector's green screen gets the real canvas in
 * code. The app's UI is rebuilt from mathbooklm-website/src, as in lc-lesson.
 */
export const cues: Cue[] = [{ src: `ads/${SLUG}/gen/mix.wav` }];

// ── generated shots ──────────────────────────────────────────────────────────

type Plate = { file: string; w: number; h: number; quad?: [number, number][] };
/** The stills, and the projector's green screen as corners (tl, tr, br, bl) in still pixels, 3 px wider. */
const STILLS: Record<string, Plate> = {
  push: { file: "generated/push-still.png", w: 1672, h: 941 },
  pushTall: { file: "generated/push-tall-still.png", w: 941, h: 1672 },
  front: { file: "generated/front-still.png", w: 1672, h: 941, quad: [[683, 63], [1608, 53], [1608, 585], [684, 583]] },
  frontTall: { file: "generated/front-tall-still.png", w: 941, h: 1672, quad: [[66, 190], [884, 172], [888, 749], [62, 751]] },
};

/** A still, covering the frame, filmed by a push-in: (cx, cy) in still pixels stays centred, z on top of cover. */
function Still({ p, cx, cy, z, screen, screenSize }: { p: Plate; cx: number; cy: number; z: number; screen?: ReactNode; screenSize?: [number, number] }) {
  const { width: W, height: H } = useVideo();
  const k = Math.max(W / p.w, H / p.h) * z;
  const x = clamp(W / 2 - cx * k, W - p.w * k, 0);
  const y = clamp(H / 2 - cy * k, H - p.h * k, 0);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: p.w, height: p.h, transformOrigin: "0 0", transform: `translate(${x}px, ${y}px) scale(${k})` }}>
      <img src={asset(`ads/${SLUG}/${p.file}`)} alt="" style={{ position: "absolute", left: 0, top: 0, width: p.w, height: p.h }} />
      {screen && p.quad && screenSize && (
        <div style={{ position: "absolute", left: 0, top: 0, width: screenSize[0], height: screenSize[1], transformOrigin: "0 0", transform: quadMatrix(p.quad, screenSize), overflow: "hidden" }}>{screen}</div>
      )}
    </div>
  );
}

/** The screen's size for its content: 1920 wide, its own shape. */
const screenSize = (p: Plate): [number, number] => {
  const q = p.quad!;
  const w = q[1][0] - q[0][0];
  const h = q[3][1] - q[0][1];
  return [1920, Math.round((1920 * h) / w)];
};

// ── 1. The push ──────────────────────────────────────────────────────────────

/** The clips made on this PC from those stills (gen.json), unpacked by bun run gen. A shot without one uses its still. */
type Clip = { src: string; fps: number; frames: number; w: number; h: number; clipEnd?: number };
const clip = (id: string, frames: number, w = 1280, h = 704): Clip => ({ src: `ads/${SLUG}/gen/footage/${id}/#####.jpg`, fps: 24, frames, w, h });
const CLIPS: Partial<Record<string, Clip>> = {
  // she strains against the crate; after 4 s the camera crops her head, and at 5 s she walks out of frame, so only that part is used, slowed
  push: clip("push", 145),
  // the crate tips over after 4.6 s, so it stops at 4.4
  "push-tall": { ...clip("push-tall", 145, 704, 1280), clipEnd: 4.4 },
};

/** The projector clips' screens, found by bun run screen. A shape without one uses its still. */
const TRACKS: Partial<Record<"front" | "frontTall", ScreenTrack>> = { front: frontTrack as ScreenTrack, frontTall: frontTallTrack as ScreenTrack };

/** The screen's content size for a track: 1920 wide, the screen's own shape in its first frame. */
const trackSize = (t: ScreenTrack): [number, number] => {
  const [c0, c1, , c3] = t.corners[0];
  return [1920, Math.round((1920 * Math.hypot(c3[0] - c0[0], c3[1] - c0[1])) / Math.hypot(c1[0] - c0[0], c1[1] - c0[1]))];
};

/** <Footage> focus that keeps clip point (cx, cy) in the middle of the frame at this zoom, as far as the clip allows. */
function centre(W: number, H: number, c: { w: number; h: number }, cx: number, cy: number, zoom: number): [number, number] {
  const k = Math.max(W / c.w, H / c.h) * zoom;
  const fx = W - c.w * k, fy = H - c.h * k;
  return [Math.abs(fx) < 0.5 ? 0.5 : clamp((W / 2 - cx * k) / fx, 0, 1), Math.abs(fy) < 0.5 ? 0.5 : clamp((H / 2 - cy * k) / fy, 0, 1)];
}

/** The push clip, slowed to the opening's 7 s: framed on her hands, which drift left as the clip's camera pushes in. */
function PushClip({ c, g, W, H, tall }: { c: Clip; g: number; W: number; H: number; tall: boolean }) {
  const end = c.clipEnd ?? 4.0;
  const t = Math.min(end, (g / 30) * 0.6);
  const k = easings.inOutSine(t / end);
  const zoom = 1 + 0.04 * k;
  const [cx, cy] = tall ? [lerp(c.w * 0.45, c.w * 0.42, k), lerp(c.h * 0.52, c.h * 0.5, k)] : [lerp(640, 470, k), lerp(330, 300, k)];
  return <Footage src={c.src} fps={c.fps} frames={c.frames} at={() => t} focus={centre(W, H, c, cx, cy, zoom)} zoom={zoom} />;
}

function Push({ ratio }: AdProps) {
  const g = useFrame();
  const { width: W, height: H } = useVideo();
  const tall = ratio === "9x16";
  const p = tall ? STILLS.pushTall : STILLS.push;
  const c = CLIPS[tall ? "push-tall" : "push"];
  // A slow push that strains, then gives a little as the voice says "slides".
  const z = 1.02 + 0.06 * easings.inOutSine(prog(g, [0, s(4.3)], easings.linear)) + 0.06 * easings.outCubic(prog(g, [s(4.4), s(5.2)], easings.linear));
  const focus = tall ? { cx: 470, cy: 980 } : ratio === "1x1" ? { cx: 900, cy: 520 } : { cx: 836, cy: 470 };
  const shake = c ? 0 : g < s(4.3) ? Math.sin(g * 2.1) * 1.2 : 0;
  return (
    <Shell bg="#c9c4ba">
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${shake}px)` }}>
        {c ? (
          <PushClip c={c} g={g} W={W} H={H} tall={tall} />
        ) : (
          <Still p={p} cx={focus.cx} cy={focus.cy} z={z} />
        )}
      </div>
      <Chip text="Lesson 4 · Newton's laws" from={s(0.3)} until={s(6.9)} ratio={ratio} pos={tall ? { left: 70, top: 230 } : undefined} />
      <Subs ratio={ratio} />
    </Shell>
  );
}

// ── 2. The teacher at the projector ──────────────────────────────────────────

/** The projector's view of the canvas at the start: the plan, and room for part 1. */
const PROJ: Frame = { t: 0, cx: 800, cy: 450, fw: 1720, fh: 960 };
/** In 1:1 the clip's crop shows the teacher and the screen's left half, so the plan is drawn smaller, in its left half. */
const PROJ_SQ: Frame = { t: 0, cx: 1390, cy: 780, fw: 2900, fh: 1620 };

function CanvasView({ w, h, cam, sim }: { w: number; h: number; cam: Cam; sim?: SimState }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Grid cam={cam} w={w} h={h} />
      <World cam={cam} w={w} h={h}>
        <Lesson sim={sim ? { s: sim, active: false, land: 1 } : undefined} />
      </World>
    </div>
  );
}

const projectorLook = (k: number): CSSProperties => ({ position: "absolute", inset: 0, filter: `brightness(${1.04 - 0.06 * (1 - k)}) contrast(${0.88 + 0.12 * k}) saturate(${0.86 + 0.14 * k})` });

function Front({ ratio }: AdProps) {
  const f = useFrame();
  const g = AT.front + f;
  const { width: W, height: H } = useVideo();
  const tall = ratio === "9x16";
  const track = TRACKS[tall ? "frontTall" : "front"];
  if (track) return <FrontClip ratio={ratio} track={track} g={g} W={W} H={H} />;
  const p = tall ? STILLS.frontTall : STILLS.front;
  const q = p.quad!;
  const [sw, sh] = screenSize(p);
  // into the screen: until it covers the frame
  const qw = q[1][0] - q[0][0];
  const qh = q[3][1] - q[0][1];
  const cover = Math.max(W / qw, H / qh) / Math.max(W / p.w, H / p.h);
  const k = easings.inCubic(prog(g, [s(10.4), s(12)], easings.linear));
  const z = Math.exp(lerp(Math.log(1.02 + 0.04 * prog(g, [s(7), s(10.4)], easings.linear)), Math.log(cover * 1.03), k));
  const base = tall ? { cx: 470, cy: 900 } : ratio === "1x1" ? { cx: 720, cy: 470 } : { cx: 836, cy: 470 };
  const cx = lerp(base.cx, (q[0][0] + q[1][0]) / 2, k);
  const cy = lerp(base.cy, (q[0][1] + q[3][1]) / 2, k);
  const cam = camAt(g, [PROJ], sw, sh);
  return (
    <Shell bg="#2a2a2a">
      <Global start={AT.front}>
        <Still p={p} cx={cx} cy={cy} z={z} screenSize={[sw, sh]} screen={<div style={projectorLook(k)}><CanvasView w={sw} h={sh} cam={cam} /></div>} />
        <Subs ratio={ratio} />
      </Global>
    </Shell>
  );
}

/** Where a clip's screen sits in a frame: its middle and size, in clip pixels. */
function screenBox(t: ScreenTrack, i: number) {
  const q = t.corners[Math.min(Math.max(i, 0), t.frames - 1)];
  const xs = q.map(([x]) => x), ys = q.map(([, y]) => y);
  return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** The teacher at the projector, the clip: the canvas on its screen, then a push into the screen until it fills the frame. */
function FrontClip({ ratio, track, g, W, H }: { ratio: Ratio; track: ScreenTrack; g: number; W: number; H: number }) {
  const tall = ratio === "9x16";
  const [sw, sh] = trackSize(track);
  const t = (g - AT.front) / 30;
  const box = screenBox(track, Math.floor(t * track.fps));
  // into the screen until it fills the frame; in 9:16 until it fills the width, since filling the height would crop the plan
  const cover = (tall ? W / box.w : Math.max(W / box.w, H / box.h)) / Math.max(W / track.width, H / track.height);
  const k = easings.inCubic(prog(g, [s(10.4), s(12)], easings.linear));
  const zoom = Math.exp(lerp(Math.log(1.02 + 0.03 * prog(g, [s(7), s(10.4)], easings.linear)), Math.log(cover * 1.03), k));
  const square = ratio === "1x1";
  const base = tall ? { cx: track.width / 2, cy: track.height * 0.5 } : square ? { cx: track.width * 0.42, cy: track.height * 0.5 } : { cx: track.width / 2, cy: track.height / 2 };
  // in 1:1 the push ends on the screen's left part, where the plan is
  const end = square ? box.cx - box.w * 0.225 : box.cx;
  const focus = centre(W, H, { w: track.width, h: track.height }, lerp(base.cx, end, k), lerp(base.cy, box.cy, k), zoom);
  const cam = camAt(g, [square ? PROJ_SQ : PROJ], sw, sh);
  return (
    <Shell bg="#2a2a2a">
      <Global start={AT.front}>
        <ScreenInsert track={track} size={[sw, sh]} at={() => t} focus={focus} zoom={zoom}>
          <div style={projectorLook(k)}><CanvasView w={sw} h={sh} cam={cam} /></div>
        </ScreenInsert>
        <Subs ratio={ratio} />
      </Global>
    </Shell>
  );
}

/** Back in the classroom: the sim on the projector, the teacher pointing at it. */
function Classroom({ ratio }: AdProps) {
  const f = useFrame();
  const g = AT.classroom + f;
  const { width: W, height: H } = useVideo();
  const tall = ratio === "9x16";
  const track = TRACKS[tall ? "frontTall" : "front"];
  const p = tall ? STILLS.frontTall : STILLS.front;
  const [sw, sh] = track ? trackSize(track) : screenSize(p);
  const z = 1.03 + 0.07 * easings.inOutSine(prog(g, [AT.classroom, AT.homework], easings.linear));
  const focus = tall ? { cx: 470, cy: 800 } : ratio === "1x1" ? { cx: 760, cy: 440 } : { cx: 900, cy: 430 };
  const cam = { cx: SIM_ON_CANVAS.x + SIM_ON_CANVAS.w / 2, cy: SIM_ON_CANVAS.y + SIM_ON_CANVAS.h / 2, z: Math.min(sw / (SIM_ON_CANVAS.w + 140), sh / (SIM_ON_CANVAS.h + 120)) };
  const screen = <div style={projectorLook(0.4)}><CanvasView w={sw} h={sh} cam={cam} sim={simAt(g)} /></div>;
  // the clip from its start (she points at the screen), slowed a little to fill the 6.6 s
  const t = Math.min((track?.frames ?? 1) / 24 - 0.05, (f / 30) * 0.88);
  return (
    <Shell bg="#2a2a2a">
      <Global start={AT.classroom}>
        {track ? (
          <ScreenInsert track={track} size={[sw, sh]} at={() => t} zoom={ratio === "1x1" ? 1 + (z - 1) * 0.4 : z} focus={ratio === "1x1" ? centre(W, H, { w: track.width, h: track.height }, screenBox(track, 0).cx, track.height / 2, 1 + (z - 1) * 0.4) : centre(W, H, { w: track.width, h: track.height }, (focus.cx * track.width) / p.w, (focus.cy * track.height) / p.h, z)}>
            {screen}
          </ScreenInsert>
        ) : (
          <Still p={p} cx={focus.cx} cy={focus.cy} z={z} screenSize={[sw, sh]} screen={screen} />
        )}
        <Subs ratio={ratio} />
      </Global>
    </Shell>
  );
}

// ── 3. The lesson, on the canvas ─────────────────────────────────────────────

/** Space the chip and callouts take at the top, and the subtitles at the bottom, per shape (video pixels). */
const BAND: L<{ top: number; bottom: number }> = { "16x9": { top: 200, bottom: 150 }, "1x1": { top: 200, bottom: 170 }, "9x16": { top: 360, bottom: 470 } };

function lessonKeys(ratio: Ratio, W: number, H: number): Frame[] {
  const tall = ratio === "9x16";
  const sq = ratio === "1x1";
  const F = (t: number, cx: number, cy: number, fw: number, fh: number, ease?: Frame["ease"], whole = false): Frame => ({ t, cx, fw: whole ? fw : tall ? fw * 0.76 : sq ? fw * 0.85 : fw, fh: tall ? fh * 1.25 : fh, ease, cy: cy - (tall ? fh * 1.25 : fh) * 0.06 });
  const b = BAND[ratio];
  const z = Math.min((W - 120) / SIM_ON_CANVAS.w, (H - b.top - b.bottom) / SIM_ON_CANVAS.h);
  const simCy = SIM_ON_CANVAS.y + SIM_ON_CANVAS.h / 2 - ((b.top + H - b.bottom) / 2 - H / 2) / z;
  const S = (t: number, ease?: Frame["ease"]): Frame => ({ t, cx: SIM_ON_CANVAS.x + SIM_ON_CANVAS.w / 2, cy: simCy, fw: W / z, fh: H / z, ease });
  const solveRight = SOLVE.x + 900;
  const ccx = CARD.x + CARD.w / 2;
  const simCx = SIM_ON_CANVAS.x + SIM_ON_CANVAS.w / 2;
  return [
    { ...PROJ, t: 12.0 },
    { ...PROJ, t: 12.3 },
    F(13.4, 500, 600, 1100, 800),
    F(18.6, 520, 610, 1140, 820, easings.linear),
    F(19.8, 860, 680, 1460, 740),
    F(24.4, 880, 690, 1500, 760, easings.linear),
    F(25.6, GIVEN.x + 170, 700, 900, 720),
    F(29.6, GIVEN.x + 170, 700, 920, 740, easings.linear),
    F(31.4, (SEL_SOLVE.x + solveRight) / 2, 720, solveRight - SEL_SOLVE.x + 160, 800),
    F(36.6, SOLVE.x + 400, 760, 1200, 780),
    F(40.6, SOLVE.x + 400, 760, 1240, 800, easings.linear),
    F(41.6, 560, 850, 1300, 760),
    F(44.4, 560, 880, 1320, 780, easings.linear),
    F(46.6, ccx, CARD.y + 80, 1700, 1000),
    F(47.8, ccx, CARD_POINTS.steps[1] - 40, 1250, 760, undefined, true),
    F(49.4, ccx, CARD_POINTS.steps[2] - 10, 1250, 760, undefined, true),
    F(51.6, ccx, CARD_POINTS.steps[3] + 20, 1250, 760, undefined, true),
    F(53.6, ccx, CARD_POINTS.answerY + 40, 1250, 760, undefined, true),
    F(55.2, ccx, CARD_POINTS.answerY + 120, 1250, 760, easings.linear, true),
    F(56.6, ccx, (CARD.y + CARD_POINTS.bottom) / 2, 1300, 1520),
    F(58.2, simCx + (tall ? 0 : 420), SIM_ON_CANVAS.y + 300, 2100, 1200),
    F(63.6, simCx + (tall ? 0 : 420), SIM_ON_CANVAS.y + 300, 2100, 1200, easings.linear),
    S(65.4),
    S(84.4, easings.linear),
    F(91.6, HW.x + 540, HW.b1 - 170, 1600, 920),
    F(97.4, HW.x + 560, HW.b1 - 150, 1660, 960, easings.linear),
    F(100.4, 1300, 1380, 2700, 2800),
  ];
}

/** The sim's state at global frame g. */
function simAt(g: number): SimState {
  const sec = g / 30;
  const run = (from: number) => {
    const loop = WINDOW + 1.0;
    const u = sec - from;
    return Math.min(((u % loop) + loop) % loop, WINDOW);
  };
  const st: SimState = { ...QUESTION, t: run(61.0), changed: false };
  // F 30 → 12 N (68.4-69.5)
  if (sec >= 68.4) {
    const k = easings.inOutCubic(prog(sec, [68.4, 69.5], easings.linear));
    st.F = 30 - 18 * k;
    st.hot = sec < 70.0 ? "F" : undefined;
    st.t = sec < 69.5 ? 0 : run(69.5);
    st.changed = true;
  }
  // the F field: click (77.6), type 16 (78.2-78.5), Enter (79.0)
  if (sec >= 77.6 && sec < 79.0) {
    st.hot = "F";
    st.field = sec < 78.2 ? "12.0" : sec < 78.5 ? "1" : "16";
  }
  if (sec >= 79.0) {
    st.F = 16;
    st.hot = undefined;
    st.field = undefined;
    st.t = run(79.0);
  }
  return st;
}

const simOnScreen = (cam: Cam, W: number, H: number, p: { x: number; y: number }) => onScreen(cam, W, H, SIMBOX.x + p.x * SIMBOX.s, SIMBOX.y + p.y * SIMBOX.s);

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

  const scr = (c: Cam, r: { x: number; y: number; w: number; h: number }) => {
    const a = onScreen(c, W, H, r.x, r.y);
    return { x: a.x, y: a.y, w: r.w * c.z, h: r.h * c.z };
  };
  const solveSel = scr(cam, SEL_SOLVE);
  const explainSel = scr(cam, SEL_EXPLAIN);
  const barLeft = (sel: { x: number; w: number }) => clamp(sel.x + sel.w / 2 - (BAR_W * barUi) / 2, 24, W - BAR_W * barUi - 24);
  const barTop = (sel: { y: number }) => sel.y - 10 * barUi - BAR_H * barUi;

  const sim = simAt(g);
  const landK = easings.outCubic(prog(sec, [64.2, 64.7], easings.linear));
  const onCanvas = sec >= 64.2;

  const pw = Math.min(PANEL_W * ui, W * 0.86);
  const pui = pw / PANEL_W;
  const panelIn = easings.outCubic(prog(sec, [57.9, 58.4], easings.linear)) * (1 - easings.inCubic(prog(sec, [64.5, 65.0], easings.linear)));
  const px = W - pw * panelIn;
  const pp = panelPoints(W - pw, pui);

  const cur: CursorKey[] = (() => {
    const k: CursorKey[] = [];
    const add = (t: number, x: number, y: number, click?: boolean) => k.push({ f: s(t), x, y, click });
    const ss = scr(camOf(27.75), SEL_SOLVE);
    add(27.2, ss.x - 60, ss.y - 40);
    add(27.75, ss.x, ss.y);
    add(28.35, ss.x + ss.w, ss.y + ss.h);
    const s1 = scr(camOf(29.56), SEL_SOLVE);
    const sv = segAt("Solve").main;
    add(29.0, barLeft(s1) + ((sv[0] + sv[1]) / 2) * barUi + 30, barTop(s1) + 60);
    add(29.56, barLeft(s1) + ((sv[0] + sv[1]) / 2) * barUi, barTop(s1) + (BAR_H / 2) * barUi, true);
    add(30.6, barLeft(s1) + ((sv[0] + sv[1]) / 2) * barUi + 80, barTop(s1) + 160);
    add(41.6, W * 0.6, H * 0.6);
    const se = scr(camOf(42.75), SEL_EXPLAIN);
    add(42.75, se.x, se.y);
    add(43.3, se.x + se.w, se.y + se.h);
    const s2 = scr(camOf(44.3), SEL_EXPLAIN);
    const ex = segAt("Explain").main;
    add(43.8, barLeft(s2) + ((ex[0] + ex[1]) / 2) * barUi + 20, barTop(s2) + (BAR_H / 2) * barUi + 30);
    add(44.3, barLeft(s2) + ((ex[0] + ex[1]) / 2) * barUi, barTop(s2) + (BAR_H / 2) * barUi, true);
    add(45.4, barLeft(s2) + ((ex[0] + ex[1]) / 2) * barUi + 60, barTop(s2) + 140);
    add(57.9, W - pw * 0.5, H * 0.62);
    add(58.5, W - pw * 0.5, H - 70 * pui);
    add(59.95, pp.send.x, H - (14 + 10 + 14) * pui, true);
    add(62.6, pp.add.x - 40, pp.add.y + 90);
    add(63.6, pp.add.x, pp.add.y, true);
    const f30 = simOnScreen(camOf(68.4), W, H, thumbAt("F", 30));
    add(66.4, f30.x + 120, f30.y + 140);
    add(68.1, f30.x, f30.y);
    add(68.4, f30.x, f30.y, true);
    const f12 = simOnScreen(camOf(69.5), W, H, thumbAt("F", 12));
    add(69.5, f12.x, f12.y);
    add(70.6, f12.x + 30, f12.y + 60);
    const ff = simOnScreen(camOf(77.6), W, H, fieldAt("F"));
    add(77.2, ff.x, ff.y);
    add(77.6, ff.x, ff.y, true);
    add(79.4, ff.x + 40, ff.y + 70);
    add(84.0, ff.x + 60, ff.y + 120);
    return k;
  })();
  const showCursor = (sec > 27.2 && sec < 30.8) || (sec > 41.6 && sec < 45.6) || (sec > 57.9 && sec < 84.2);

  const solveBar: BarState = { loading: "Solve", loadingFrom: s(T.solveClick), hot: sec >= 29.3 && sec < 29.7 ? "Solve" : undefined };
  const explainBar: BarState = { loading: "Explain", loadingFrom: s(T.explainClick), hot: sec >= 44.0 && sec < 44.4 ? "Explain" : undefined };

  const fly = prog(sec, [63.7, 64.4], easings.inOutCubic);
  const target = (() => {
    const c = camOf(64.4);
    const a = onScreen(c, W, H, SIM_ON_CANVAS.x, SIM_ON_CANVAS.y);
    return { x: a.x, y: a.y, w: SIM_ON_CANVAS.w * c.z };
  })();

  return (
    <>
      <Grid cam={cam} w={W} h={H} />
      <World cam={cam} w={W} h={H}>
        <Lesson sim={{ s: sim, active: onCanvas && sec < 84.4, land: onCanvas ? landK : 0 }} />
      </World>
      <Chrome ui={ui} w={W} top={TOP[ratio]} zoomBottom={ratio === "9x16" ? undefined : 22 * ui} />
      <Selection x={solveSel.x} y={solveSel.y} w={solveSel.w} h={solveSel.h} ui={ui} drag={[s(T.dragSolve[0]), s(T.dragSolve[1])]} until={s(T.pillSolve[1])} />
      {sec >= T.bar && sec < T.pillSolve[1] && <SelectionBar left={barLeft(solveSel)} top={barTop(solveSel)} ui={barUi} appear={s(T.bar)} st={solveBar} />}
      <WritePill text="Writing the solution on the canvas…" from={s(T.pillSolve[0])} until={s(T.pillSolve[1])} ui={ui} top={TOP[ratio] + 72 * ui} w={W} />
      <Selection x={explainSel.x} y={explainSel.y} w={explainSel.w} h={explainSel.h} ui={ui} drag={[s(T.dragExplain[0]), s(T.dragExplain[1])]} until={s(T.pillExplain[1])} />
      {sec >= T.barExplain && sec < T.pillExplain[1] && <SelectionBar left={barLeft(explainSel)} top={barTop(explainSel)} ui={barUi} appear={s(T.barExplain)} st={explainBar} />}
      <WritePill text="Writing the explanation on the canvas…" from={s(T.pillExplain[0])} until={s(T.pillExplain[1])} ui={ui} top={TOP[ratio] + 72 * ui} w={W} />
      {panelIn > 0 && (
        <ChatPanel x={px} h={H} ui={pui} st={{ typed: prog(sec, [58.6, 59.85], easings.linear), sent: s(60.0), thinkingFrom: s(60.15), answer: s(61.0), addHot: sec > 63.3, sim: sec < 63.7 ? sim : { ...sim, t: 0 }, left: sec < 60.0 ? 8 : 7 }} />
      )}
      {fly > 0 && fly < 1 && (
        <div style={{ position: "absolute", left: lerp(pp.sim.x, target.x, fly), top: lerp(pp.sim.y, target.y, fly), width: SIM_W, height: SIM_H, transformOrigin: "0 0", transform: `scale(${lerp(pp.sim.w, target.w, fly) / SIM_W})`, background: "rgba(255,255,255,.9)", boxShadow: "0 12px 40px rgba(30,30,80,.18)", borderRadius: 8, overflow: "hidden" }}>
          <BoxPage s={sim} />
        </div>
      )}
      <Callout text="12 N: friction matches it, F_net = 0" from={s(71.0)} until={s(77.2)} ratio={ratio} />
      <Callout text="16 N > 15 N: it breaks free" from={s(80.0)} until={s(84.2)} ratio={ratio} />
      {showCursor && <Cursor keys={cur} size={30 * ui} rippleColor={PRIMARY} rippleSize={70 * ui} />}
    </>
  );
}

function Callout({ text, from, until, ratio }: { text: string; from: number; until: number; ratio: Ratio }) {
  const g = useFrame();
  if (g < from || g > until) return null;
  const k = easings.outBack(prog(g, [from, from + 10], easings.linear));
  const out = prog(g, [until - 8, until], easings.linear);
  const size = { "16x9": 46, "1x1": 42, "9x16": 50 }[ratio];
  const pos: CSSProperties = ({ "16x9": { right: 96, top: 118 }, "1x1": { right: 60, top: 118 }, "9x16": { left: 70, right: 130, top: 330, textAlign: "center" } } as const)[ratio];
  return (
    <div style={{ position: "absolute", ...pos, opacity: (1 - out) * clamp(k * 2), transform: `scale(${0.85 + 0.15 * k})`, transformOrigin: "center" }}>
      <span style={{ display: "inline-block", fontFamily: '"Nunito", sans-serif', fontWeight: 800, fontSize: size, color: "#fff", background: PRIMARY, padding: `${size * 0.22}px ${size * 0.5}px`, borderRadius: size * 0.4, boxShadow: "0 10px 30px rgba(81,79,187,.35)" }}>{text}</span>
    </div>
  );
}

function Chips({ ratio }: { ratio: Ratio }) {
  return (
    <>
      <Chip n="1" text="The forces" from={s(12.0)} until={s(15.6)} ratio={ratio} />
      <Chip n="2" text="The second law" from={s(25.0)} until={s(27.6)} ratio={ratio} />
      <Chip n="3" text="Why it sticks" from={s(41.4)} until={s(44.8)} ratio={ratio} />
      <Chip n="4" text="The lab" from={s(57.0)} until={s(60.6)} ratio={ratio} />
      <Chip n="✎" text="Homework" from={s(91.6)} until={s(95.2)} ratio={ratio} />
    </>
  );
}

const SUBS: [number, number, string][] = [
  [0.4, 5.4, "Push a heavy box. Nothing. Push harder, and it slides."],
  [7.2, 11.7, "Today: Newton's laws, and why the box sticks."],
  [12.0, 14.4, "Part one: the forces."],
  [14.56, 19.2, "The pull, friction, the weight, and the floor pushing back."],
  [19.6, 24.2, "Five kilograms, 30 newtons, two kinds of friction."],
  [25.0, 27.6, "Part two: the second law."],
  [27.72, 30.4, "Select the question, press Solve."],
  [31.4, 36.2, "The normal force, the friction, the net force, and the acceleration:"],
  [36.28, 40.0, "4 metres per second squared, computed by SymPy."],
  [41.4, 44.2, "But why did the box stick at first?"],
  [44.28, 46.36, "Explain draws it out."],
  [46.4, 50.9, "Static friction matches your push, up to 15 newtons."],
  [51.04, 55.7, "Past that, the box slides, and the smaller kinetic friction takes over."],
  [57.0, 59.3, "Part four: the lab."],
  [59.4, 63.1, "Ask for a simulation, and the box is yours to push."],
  [68.4, 70.7, "Drop the pull to 12 newtons."],
  [70.8, 75.1, "Friction matches it, the net force is zero, and nothing moves."],
  [75.2, 76.7, "That's the first law."],
  [79.0, 82.2, "16 newtons, and it breaks free."],
  [84.8, 90.1, "Same box, same numbers, and the whole class sees the moment it lets go."],
  [91.8, 94.2, "Homework: double the mass."],
  [94.28, 96.6, "Does 30 newtons still move it?"],
  [98.4, 100.9, "Newton's laws, on one board."],
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

const Forces = ({ ratio }: AdProps) => <LessonScene ratio={ratio} start={AT.lesson} />;
const Solve = ({ ratio }: AdProps) => <LessonScene ratio={ratio} start={AT.solve} />;
const Explain = ({ ratio }: AdProps) => <LessonScene ratio={ratio} start={AT.explain} />;
const Lab = ({ ratio }: AdProps) => <LessonScene ratio={ratio} start={AT.lab} />;
const Homework = ({ ratio }: AdProps) => <LessonScene ratio={ratio} start={AT.homework} />;

function End({ ratio }: AdProps) {
  const f = useFrame();
  const g = AT.end + f;
  const k = easings.outCubic(prog(g, [s(98.9), s(99.6)], easings.linear));
  const veil = prog(g, [s(98.6), s(99.6)], easings.linear);
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
  { id: "push", name: "The push that fails", component: Push, frames: AT.front - AT.push },
  { id: "front", name: "The teacher at the projector", component: Front, frames: AT.lesson - AT.front },
  { id: "forces", name: "Part 1: the forces", component: Forces, frames: AT.solve - AT.lesson },
  { id: "solve", name: "Part 2: Solve on canvas", component: Solve, frames: AT.explain - AT.solve },
  { id: "explain", name: "Part 3: Explain on canvas", component: Explain, frames: AT.lab - AT.explain },
  { id: "lab", name: "Part 4: the simulation", component: Lab, frames: AT.classroom - AT.lab },
  { id: "classroom", name: "The class sees it", component: Classroom, frames: AT.homework - AT.classroom },
  { id: "homework", name: "Homework", component: Homework, frames: AT.end - AT.homework },
  { id: "end", name: "End card", component: End, frames: AT.stop - AT.end },
];
