import type { CSSProperties } from "react";
import { Sequence, asset, useFrame, useVideo, type AdProps, type Cue, type Ratio, type Scene } from "../../engine";
import { Cursor, type CursorKey } from "../../parts/Cursor";
import { easings, prog } from "../../parts/time";
import { Canvas, layFor, points, simAt, T, type Lay } from "./canvas";
import { thumbAt } from "./sim";
import { SIMULATE_X } from "./ui";
import { AT, Global, Grid, PRIMARY, SLUG, Shell, TEXT, World, camAt, s, type Frame, type L } from "./world";

/**
 * "Three tries". A teacher tries three times to draw something that moves (the energy swinging between a capacitor
 * and a coil in an LC circuit) and strikes each drawing out. Then they lasso the values and press Simulate, and the
 * circuit moves beside the failed sketches; dragging C from 100 to 400 µF slows it (f ≈ 159 → 79.6 Hz). Then the
 * pilot card, and the end card. Hebrew on screen, no voice: the pen, then music from the simulation's first motion.
 * The app's UI is rebuilt from mathbooklm-website/src (ui.tsx, sim.tsx).
 */

// ── sound ────────────────────────────────────────────────────────────────────

/**
 * No pen or writing sounds (the user's note): music only, plus the bar's pop. The track (25 s, calm, 96 bpm, a
 * downbeat every 2.5 s, an opening bed then a gentle lift from 8 s, ending by itself near 23 s) is used twice, on its
 * beat grid. A from the first frame, 0.41 s into the track, so its first lift downbeat (track 9.41 s) lands at 9.0 s
 * on the simulation's first motion. B from 21.5 s (a downbeat of A), 1.91 s into the track: the quiet bed under the
 * pilot card, and the same gentle lift on the end card at 29.0 s, fading over the last 1.2 s.
 */
const MUSIC = `ads/${SLUG}/gen/music.mp3`;
export const cues: Cue[] = [
  { src: MUSIC, at: 0, trim: Math.round(0.41 * 30), volume: 0.9 },
  { src: MUSIC, at: s(21.5), trim: Math.round(1.91 * 30), volume: 0.9, fade: [15, 36] },
  { src: `ads/${SLUG}/gen/sfx.pop.mp3`, at: s(T.bar), volume: 0.55 },
];

// ── the camera, per shape ────────────────────────────────────────────────────

/** Before the cut (the attempts and the lasso) and after it (the simulation, the pull-back and the card). */
const CAM: L<{ before: Frame[]; after: Frame[] }> = {
  "9x16": {
    before: [
      { t: 0, cx: 370, cy: 380, fw: 705, fh: 1255 },
      { t: 2.2, cx: 370, cy: 425, fw: 705, fh: 1255 },
      { t: 3.1, cx: 380, cy: 1180, fw: 640, fh: 1138 },
      { t: 4.9, cx: 380, cy: 1225, fw: 640, fh: 1138 },
      { t: 5.7, cx: 380, cy: 1700, fw: 660, fh: 1173 },
      { t: 7.3, cx: 380, cy: 1712, fw: 660, fh: 1173 },
      { t: 7.9, cx: 365, cy: 300, fw: 760, fh: 1351 },
      { t: 9, cx: 365, cy: 285, fw: 740, fh: 1316 },
    ],
    after: [
      { t: 9, cx: 1140, cy: 385, fw: 940, fh: 1671 },
      { t: 10.3, cx: 1140, cy: 390, fw: 930, fh: 1653 },
      { t: 11.7, cx: 1004, cy: 350, fw: 620, fh: 1102 },
      { t: 12.7, cx: 1012, cy: 352, fw: 610, fh: 1084 },
      { t: 13.7, cx: 1452, cy: 380, fw: 340, fh: 604 },
      { t: 17.0, cx: 1452, cy: 382, fw: 340, fh: 604 },
      { t: 17.8, cx: 1004, cy: 350, fw: 620, fh: 1102 },
      { t: 19.0, cx: 1010, cy: 352, fw: 615, fh: 1093 },
      { t: 20.2, cx: 890, cy: 1010, fw: 1776, fh: 3157 },
      { t: 21.6, cx: 890, cy: 1000, fw: 1760, fh: 3129 },
      { t: 22.8, cx: 1180, cy: 1005, fw: 1080, fh: 1920 },
      { t: 29.5, cx: 1180, cy: 975, fw: 1040, fh: 1849 },
    ],
  },
  "1x1": {
    before: [
      { t: 0, cx: 370, cy: 421, fw: 990, fh: 990 },
      { t: 2.2, cx: 370, cy: 460, fw: 960, fh: 960 },
      { t: 3.1, cx: 380, cy: 1180, fw: 640, fh: 640 },
      { t: 4.9, cx: 380, cy: 1205, fw: 630, fh: 630 },
      { t: 5.7, cx: 380, cy: 1700, fw: 660, fh: 660 },
      { t: 7.3, cx: 380, cy: 1710, fw: 650, fh: 650 },
      { t: 7.9, cx: 365, cy: 250, fw: 780, fh: 780 },
      { t: 9, cx: 365, cy: 245, fw: 760, fh: 760 },
    ],
    after: [
      { t: 9, cx: 1140, cy: 385, fw: 980, fh: 980 },
      { t: 10.3, cx: 1140, cy: 386, fw: 970, fh: 970 },
      { t: 11.7, cx: 1004, cy: 350, fw: 620, fh: 620 },
      { t: 12.7, cx: 1010, cy: 352, fw: 610, fh: 610 },
      { t: 13.7, cx: 1140, cy: 385, fw: 980, fh: 980 },
      { t: 19.0, cx: 1140, cy: 386, fw: 970, fh: 970 },
      { t: 20.2, cx: 850, cy: 1015, fw: 1990, fh: 1990 },
      { t: 21.6, cx: 850, cy: 1010, fw: 1960, fh: 1960 },
      { t: 22.8, cx: 1195, cy: 1234, fw: 1100, fh: 1100 },
      { t: 29.5, cx: 1195, cy: 1219, fw: 1070, fh: 1070 },
    ],
  },
  "16x9": {
    before: [
      { t: 0, cx: 149, cy: 485, fw: 1561, fh: 878 },
      { t: 2.2, cx: 180, cy: 495, fw: 1540, fh: 866 },
      { t: 3.1, cx: 970, cy: 700, fw: 1130, fh: 636 },
      { t: 4.9, cx: 985, cy: 705, fw: 1110, fh: 624 },
      { t: 5.7, cx: 1550, cy: 720, fw: 1130, fh: 636 },
      { t: 7.3, cx: 1560, cy: 722, fw: 1115, fh: 627 },
      { t: 7.9, cx: 380, cy: 260, fw: 1100, fh: 619 },
      { t: 9, cx: 380, cy: 258, fw: 1080, fh: 608 },
    ],
    after: [
      { t: 9, cx: 2320, cy: 385, fw: 1100, fh: 630 },
      { t: 10.3, cx: 2320, cy: 386, fw: 1090, fh: 625 },
      { t: 11.7, cx: 2184, cy: 350, fw: 700, fh: 420 },
      { t: 12.7, cx: 2190, cy: 352, fw: 690, fh: 414 },
      { t: 13.7, cx: 2320, cy: 385, fw: 1100, fh: 630 },
      { t: 19.0, cx: 2320, cy: 386, fw: 1090, fh: 625 },
      { t: 20.2, cx: 1440, cy: 530, fw: 2840, fh: 1000 },
      { t: 21.6, cx: 1440, cy: 525, fw: 2800, fh: 990 },
      { t: 22.8, cx: 2360, cy: 1196, fw: 1820, fh: 1024 },
      { t: 29.5, cx: 2360, cy: 1185, fw: 1780, fh: 1001 },
    ],
  },
};

function useCam(ratio: Ratio) {
  const g = useFrame();
  const { width: W, height: H } = useVideo();
  const c = CAM[ratio];
  return { cam: camAt(g, g < s(T.simLand) ? c.before : c.after, W, H), W, H, g };
}

// ── the pointer ──────────────────────────────────────────────────────────────

function pointerKeys(lay: Lay): { lasso: CursorKey[]; slider: CursorKey[] } {
  const { sel, barLeft, barTop } = points(lay);
  const simX = barLeft + (SIMULATE_X[0] + SIMULATE_X[1]) / 2;
  const lasso: CursorKey[] = [
    { f: s(7.45), x: sel.x - 60, y: sel.y - 30 },
    { f: s(T.lassoDrag[0]), x: sel.x, y: sel.y, ease: easings.outCubic },
    { f: s(T.lassoDrag[1]), x: sel.x + sel.w, y: sel.y + sel.h, ease: easings.inOutQuad },
    { f: s(8.45), x: sel.x + sel.w - 10, y: sel.y + sel.h - 10 },
    { f: s(T.click), x: simX, y: barTop + 18, click: true, ease: easings.inOutCubic },
    { f: s(9.1), x: simX + 4, y: barTop + 20 },
  ];
  const at = (C: number) => {
    const p = thumbAt("C", C);
    return { x: lay.sim.x + p.x, y: lay.sim.y + p.y + 2 };
  };
  const start = at(100);
  const slider: CursorKey[] = [
    { f: s(14.3), x: start.x + 120, y: start.y + 160 },
    { f: s(T.activate), x: start.x, y: start.y, click: true, ease: easings.outCubic },
    { f: s(T.drag[0]), x: start.x, y: start.y, click: true },
  ];
  for (let f = s(T.drag[0]) + 3; f <= s(T.drag[1]); f += 3) slider.push({ f, ...at(simAt(f).p.C), ease: easings.linear });
  const end = at(400);
  slider.push({ f: s(T.drag[1]) + 3, ...end }, { f: s(17.8), x: end.x + 70, y: end.y + 140, ease: easings.inOutCubic });
  return { lasso, slider };
}

function Pointer({ lay, z }: { lay: Lay; z: number }) {
  const g = useFrame();
  const { lasso, slider } = pointerKeys(lay);
  const keys = g < s(T.simLand) ? lasso : slider;
  const show = (g >= s(7.45) && g < s(T.simLand)) || (g >= s(14.3) && g < s(18.2));
  if (!show) return null;
  const fadeIn = g < s(T.simLand) ? prog(g, [s(7.45), s(7.6)], easings.linear) : prog(g, [s(14.3), s(14.45)], easings.linear);
  const fadeOut = 1 - prog(g, [s(17.8), s(18.2)], easings.linear);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, opacity: Math.min(fadeIn, fadeOut) }}>
      <Cursor keys={keys} size={34 / z} rippleSize={70 / z} rippleColor="#6d4aff" />
    </div>
  );
}

// ── words on screen ──────────────────────────────────────────────────────────

const QUESTION_TEXT = "איך מציירים משהו שזז?";
const Q_POS: L<CSSProperties> = {
  "9x16": { left: 170, right: 230, top: 214, fontSize: 96, textAlign: "center" },
  "1x1": { left: 70, right: 70, top: 64, fontSize: 82, textAlign: "center" },
  "16x9": { left: 96, width: 760, top: 300, fontSize: 112, textAlign: "right" },
};

function Question({ ratio }: { ratio: Ratio }) {
  const g = useFrame();
  if (g > s(3.2)) return null;
  const k = 1;
  const out = prog(g, [s(2.75), s(3.2)], easings.inCubic);
  return (
    <div dir="rtl" style={{ position: "absolute", ...Q_POS[ratio], fontFamily: '"Rubik", sans-serif', fontWeight: 800, color: TEXT, lineHeight: 1.08, letterSpacing: "-0.01em", opacity: (0.35 + 0.65 * k) * (1 - out), transform: `translateY(${(1 - k) * 18 - out * 20}px)` }}>
      <span style={{ background: "rgba(255,255,255,.88)", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", padding: "0 0.15em", borderRadius: 12 }}>{QUESTION_TEXT}</span>
    </div>
  );
}

// ── the view: the canvas through the camera ──────────────────────────────────

function View({ ratio }: { ratio: Ratio }) {
  const { cam, W, H, g } = useCam(ratio);
  const lay = layFor(ratio);
  const gone = easings.inOutSine(prog(g, [s(29), s(29.6)], easings.linear));
  return (
    <>
      <Grid cam={cam} w={W} h={H} />
      <div style={{ position: "absolute", inset: 0, opacity: 1 - gone }}>
        <World cam={cam} w={W} h={H}>
          <Canvas lay={lay} />
          <Pointer lay={lay} z={cam.z} />
        </World>
      </div>
      <Question ratio={ratio} />
    </>
  );
}

// ── the end card ─────────────────────────────────────────────────────────────

const END: L<{ mark: number; line: number; mail: number; gap: number; lift: number }> = {
  "9x16": { mark: 112, line: 80, mail: 54, gap: 46, lift: 120 },
  "1x1": { mark: 112, line: 74, mail: 50, gap: 36, lift: 0 },
  "16x9": { mark: 120, line: 80, mail: 52, gap: 36, lift: 0 },
};

function EndCard({ ratio }: { ratio: Ratio }) {
  const g = useFrame();
  if (g < s(29)) return null;
  const e = END[ratio];
  const veil = easings.inOutSine(prog(g, [s(29), s(29.6)], easings.linear));
  const m = easings.inOutSine(prog(g, [s(29.35), s(30.05)], easings.linear));
  const word = easings.outCubic(prog(g, [s(29.95), s(30.45)], easings.linear));
  const line = easings.outCubic(prog(g, [s(30.4), s(30.9)], easings.linear));
  const mail = easings.outCubic(prog(g, [s(30.9), s(31.4)], easings.linear));
  const icon = e.mark * 1.2;
  return (
    <div style={{ position: "absolute", inset: 0, background: `rgba(255,255,255,${0.55 * veil})` }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: e.gap, paddingBottom: e.lift }}>
        <div dir="ltr" aria-label="logo" style={{ display: "inline-flex", alignItems: "center", fontSize: e.mark, fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: TEXT, lineHeight: 1 }}>
          {/* The purple M, brushed on from its first stroke (bottom left) to its last. */}
          <img src={asset(`ads/${SLUG}/icon.png`)} alt="logo" style={{ width: icon, height: icon, marginBottom: "0.2em", display: "block", clipPath: `polygon(0 100%, 0 ${100 - 160 * m}%, ${140 * m}% ${100 - 160 * m}%, ${140 * m}% 100%)` }} />
          <span style={{ opacity: word, transform: `translateX(${(1 - word) * -24}px)`, display: "inline-block" }}>
            athbook
            <span style={{ fontFamily: '"KaTeX_Math", serif', fontStyle: "italic", fontWeight: 400 }}>LM</span>
          </span>
        </div>
        <div dir="ltr" style={{ opacity: line, transform: `translateY(${(1 - line) * 20}px)`, fontFamily: '"Nunito", sans-serif', fontWeight: 800, fontSize: e.line, color: TEXT, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
          Write math <span style={{ background: "linear-gradient(90deg, #514fbb, #6a69d6 60%, #9d9bf0)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Naturally</span>
        </div>
        <div dir="ltr" style={{ opacity: mail, transform: `translateY(${(1 - mail) * 16}px)`, fontFamily: '"Nunito", sans-serif', fontWeight: 800, fontSize: e.mail, color: PRIMARY }}>
          contact@mathbooklm.com
        </div>
      </div>
    </div>
  );
}

// ── scenes ───────────────────────────────────────────────────────────────────

function Part({ ratio, start }: { ratio: Ratio; start: number }) {
  return (
    <Shell>
      <Global start={start}>
        <View ratio={ratio} />
        <EndCard ratio={ratio} />
      </Global>
    </Shell>
  );
}

const Tries = ({ ratio }: AdProps) => <Part ratio={ratio} start={AT.tries} />;
const Moves = ({ ratio }: AdProps) => <Part ratio={ratio} start={AT.sim} />;
const Pilot = ({ ratio }: AdProps) => <Part ratio={ratio} start={AT.pilot} />;
const End = ({ ratio }: AdProps) => <Part ratio={ratio} start={AT.end} />;

export const scenes: Scene[] = [
  { id: "tries", name: "Three tries", component: Tries, frames: AT.sim - AT.tries },
  { id: "moves", name: "Simulate: it moves", component: Moves, frames: AT.pilot - AT.sim },
  { id: "pilot", name: "The pilot", component: Pilot, frames: AT.end - AT.pilot },
  { id: "end", name: "End card", component: End, frames: AT.stop - AT.end },
];

// ── the cover ────────────────────────────────────────────────────────────────

const THUMB: L<{ at: number; text: CSSProperties }> = {
  "9x16": { at: s(12.6), text: { left: 70, right: 130, top: 330, fontSize: 128, textAlign: "center" } },
  "1x1": { at: s(12.6), text: { left: 60, right: 60, top: 64, fontSize: 96, textAlign: "center" } },
  "16x9": { at: s(21.4), text: { left: 90, right: 90, top: 70, fontSize: 116, textAlign: "center" } },
};

export function Thumb({ ratio }: AdProps) {
  const t = THUMB[ratio];
  return (
    <Shell>
      <Sequence from={-t.at}>
        <Global start={0}>
          <View ratio={ratio} />
        </Global>
      </Sequence>
      <div dir="rtl" style={{ position: "absolute", ...t.text, fontFamily: '"Rubik", sans-serif', fontWeight: 800, color: TEXT, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
        <span style={{ background: "rgba(255,255,255,.92)", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", padding: "0 0.18em", borderRadius: 16 }}>{QUESTION_TEXT}</span>
      </div>
      <img src={asset(`ads/${SLUG}/icon.png`)} alt="logo" style={{ position: "absolute", right: ratio === "9x16" ? 150 : 60, ...(ratio === "1x1" ? { top: 760 } : { bottom: ratio === "9x16" ? 360 : 54 }), width: ratio === "16x9" ? 96 : 104 }} />
    </Shell>
  );
}
