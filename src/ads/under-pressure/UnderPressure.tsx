import type { CSSProperties, ReactNode } from "react";
import { random, useFrame, useVideo, type AdProps, type Cue, type Ratio, type Scene } from "../../engine";
import { CameraView, camAt, type Cam, type CamKey } from "../../parts/camera";
import { Cursor, type CursorKey } from "../../parts/Cursor";
import { Rough } from "../../parts/Rough";
import { clamp, easings, interpolate, lerp, prog } from "../../parts/time";
import { ChatPanelView, FOLLOW_TEXT, panelSpots } from "./panel";
import { SimBox, sliderAt } from "./sim";
import {
  AT, BOARD, CHALK, Chrome, ENGINE, Engine, Fonts, Hand, Head, MUTED, PRESS, PRIMARY, Press, SLUG, Selection, SelectionBar, TEXT, Wordmark,
  at, barWidth, boxOf, etaLineBox, itemCentre, shot, Grid,
} from "./world";

/**
 * "Under pressure". The physics of a lecture fits on one line and the arithmetic eats the hour. A crowded chalkboard
 * blurs past, the chalk snaps, and the dust settles into the MathbookLM canvas, where a hydraulic press and then a heat
 * engine are drawn in ink and solved where they're written. The press's ram rises out of frame and the camera whips down
 * to the engine's piston. Explain opens the real chat panel; the pull-back shows the whole lecture on one canvas.
 * Alice reads a calm, dry voice-over over an ElevenLabs bed (public/ads/under-pressure/spec.json). Scene lengths are
 * fixed to the storyboard, and the voice was placed at the same times, so cues here are frames of each scene.
 */
export const cues: Cue[] = [{ src: `ads/${SLUG}/gen/mix.wav` }];

const UI: Record<Ratio, number> = { "16x9": 1.3, "1x1": 1.15, "9x16": 1.3 };

function Shell({ bg = "#fff", children }: { bg?: string; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: bg, overflow: "hidden" }}>
      <Fonts />
      {children}
    </div>
  );
}

/** Motion blur for a fast camera move. (An SVG filter by url() would read as an image to the capture, so it's CSS blur.) */
const streak = (px: number): CSSProperties => (px > 0.5 ? { filter: `blur(${Math.min(px, 22).toFixed(2)}px)` } : {});

// ── 1. the board ─────────────────────────────────────────────────────────────

const LINES = [
  { id: "c1", x: 220, base: 330, size: 130, w: [-8, 22] as const }, // Already being written on frame 0.
  { id: "c2", x: 220, base: 560, size: 120, w: [32, 56] as const },
  { id: "c3", x: 300, base: 770, size: 120, w: [58, 74] as const },
  { id: "c4", x: 300, base: 980, size: 120, w: [76, 88] as const },
  { id: "c5", x: 300, base: 1190, size: 120, w: [90, 102] as const },
];
// The long way round, scattered down the board. [id, x, base, size, tilt]
const MESS: [string, number, number, number, number][] = [
  ["k8", 1700, 360, 120, -2],
  ["k9", 1760, 560, 130, 1],
  ["k2", 2250, 820, 150, -4],
  ["k4", 1650, 1100, 120, 2],
  ["k3", 2500, 1260, 110, -3],
  ["k1", 2700, 420, 170, 3],
  ["k5", 2950, 700, 120, -1],
  ["k6", 3200, 1050, 140, 2],
  ["k10", 3500, 340, 130, -2],
  ["k7", 3650, 880, 120, 1],
  ["k12", 4100, 560, 150, -3],
  ["k11", 4250, 1180, 130, 2],
  ["k1", 4700, 300, 120, -2],
  ["k8", 4800, 760, 120, 2],
  ["k2", 5150, 1100, 130, -1],
];
const CROSSED = new Set([0, 7, 13]); // The wrong ones: 200 / 4 = 40, = 500 ?

const BOARD_CAM: Record<Ratio, CamKey[]> = {
  "16x9": [
    { f: 0, cx: 1000, cy: 760, z: 0.84 },
    { f: 92, cx: 1150, cy: 760, z: 0.88 },
    { f: 195, cx: 5000, cy: 720, z: 1.08, ease: easings.inCubic },
  ],
  "1x1": [
    { f: 0, cx: 820, cy: 760, z: 0.74 },
    { f: 92, cx: 900, cy: 760, z: 0.78 },
    { f: 195, cx: 5000, cy: 720, z: 1.0, ease: easings.inCubic },
  ],
  "9x16": [
    { f: 0, cx: 800, cy: 760, z: 0.8 },
    { f: 92, cx: 880, cy: 760, z: 0.84 },
    { f: 195, cx: 5000, cy: 720, z: 1.1, ease: easings.inCubic },
  ],
};

function chalkPen({ air }: { x: number; y: number; air: number }) {
  return (
    <g transform={`translate(0 ${-air * 8}) rotate(32)`}>
      <rect x={-7} y={-74} width={14} height={74} rx={4} fill="#f4f6f1" />
      <rect x={-7} y={-74} width={5} height={74} rx={2} fill="#fff" opacity={0.6} />
    </g>
  );
}

function Board({ ratio }: AdProps) {
  const frame = useFrame();
  const { width: W, height: H } = useVideo();
  const cam = camAt(frame, BOARD_CAM[ratio]);
  const prev = camAt(frame - 1, BOARD_CAM[ratio]);
  const speed = Math.abs(cam.cx - prev.cx) * cam.z;
  const tilt = interpolate(frame, [0, 92, 150], [-3.2, -1.6, 0], { ease: easings.inOutSine });
  const smudges = Array.from({ length: 46 }, (_, i) => ({ x: random(`sm-x-${i}`) * 5800 - 200, y: random(`sm-y-${i}`) * 1700 - 100, w: 300 + random(`sm-w-${i}`) * 900, r: random(`sm-r-${i}`) * 40 - 20 }));
  const head: Record<Ratio, { one: React.CSSProperties; two: React.CSSProperties; s1: number; s2: number }> = {
    "16x9": { one: { right: 90, bottom: 84, textAlign: "right" }, two: { left: 90, bottom: 84 }, s1: 96, s2: 108 },
    "1x1": { one: { right: 64, bottom: 64, width: 900, textAlign: "right" }, two: { left: 64, bottom: 64, width: 940 }, s1: 92, s2: 100 },
    "9x16": { one: { right: 70, bottom: 250, width: 900, textAlign: "right" }, two: { left: 70, bottom: 250, width: 940 }, s1: 116, s2: 124 },
  };
  const h = head[ratio];
  return (
    <Shell bg={BOARD}>
      <div style={{ position: "absolute", inset: 0, transform: `rotate(${tilt}deg) scale(${1 + Math.abs(tilt) * 0.03 + Math.min(0.12, speed * 0.0012)}, ${1 + Math.abs(tilt) * 0.03})`, ...streak(speed * 0.12) }}>
        <CameraView cam={cam}>
          {smudges.map((s, i) => (
            <div key={i} style={{ position: "absolute", left: s.x, top: s.y, width: s.w, height: s.w * 0.28, borderRadius: "50%", background: "rgba(255,255,255,.05)", transform: `rotate(${s.r}deg)`, filter: "blur(28px)" }} />
          ))}
          {LINES.map((l) => (
            <Hand key={l.id} id={l.id} p={l} write={[l.w[0], l.w[1]]} color={CHALK} mode="ink" pen={chalkPen} />
          ))}
          <Rough shape={{ kind: "lasso", cx: 300 + boxOf("c5", { x: 0, base: 0, size: 120 }).width / 2, cy: 1150, w: boxOf("c5", { x: 0, base: 0, size: 120 }).width + 120, h: 210, loops: 1.15 }} draw={[104, 118]} seed={41} strokeWidth={6} stroke={CHALK} />
          {MESS.map(([id, x, base, size, r], i) => {
            const b = boxOf(id, { x, base, size });
            return (
              <div key={i} style={{ position: "absolute", left: 0, top: 0, transform: `rotate(${r}deg)`, transformOrigin: `${x}px ${base}px` }}>
                <Hand id={id} p={{ x, base, size }} write={[-3, -2]} color={CHALK} mode="ink" />
                {CROSSED.has(i) && <Rough shape={{ kind: "line", from: [b.left - 20, b.top + b.height * 0.62], to: [b.left + b.width + 20, b.top + b.height * 0.38] }} seed={50 + i} strokeWidth={8} stroke="#f2b8b0" />}
              </div>
            );
          })}
        </CameraView>
      </div>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(10,18,14,.75), rgba(10,18,14,0) 45%)" }} />
      <Head text="The physics takes one line." from={10} until={92} size={h.s1} color="#fff" style={h.one} />
      <Head text="The arithmetic takes the lecture." from={98} size={h.s2} color="#fff" style={h.two} slam stagger={4} />
    </Shell>
  );
}

// ── 2. the wipe ──────────────────────────────────────────────────────────────

/** The board eraser's path: back and forth across the frame, turning off screen, wide enough to clear it all. */
function wipePath(W: number, H: number) {
  const sw = 0.52 * Math.min(W, H);
  const n = Math.ceil(H / (0.8 * sw));
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const y = (H * (i + 0.5)) / n;
    const [x0, x1] = i % 2 ? [1.18 * W, -0.18 * W] : [-0.18 * W, 1.18 * W];
    pts.push([x0, y], [x1, y]);
  }
  const lens = pts.slice(1).map(([x, y], i) => Math.hypot(x - pts[i][0], y - pts[i][1]));
  const total = lens.reduce((s, l) => s + l, 0);
  /** The point `d` along the path, and which way it's heading. */
  const at = (d: number) => {
    let left = clamp(d, 0, total);
    for (let i = 0; i < lens.length; i++) {
      if (left <= lens[i] || i === lens.length - 1) {
        const k = lens[i] ? left / lens[i] : 0;
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k, dir: Math.sign(bx - ax) || 1 };
      }
      left -= lens[i];
    }
    return { x: pts[0][0], y: pts[0][1], dir: 1 };
  };
  return { d: "M" + pts.map((p) => p.join(" ")).join(" L"), sw, total, at };
}

// What's left on the board when the eraser arrives: the long way round, half rubbed already.
const GHOSTS: [string, number, number, number, number][] = [
  ["= 20000 / 4", 0.08, 0.2, 0.11, -3],
  ["× 100", 0.62, 0.16, 0.13, 2],
  ["50 · 100 = ?", 0.42, 0.42, 0.1, -1],
  ["÷ 4", 0.12, 0.6, 0.14, 3],
  ["= 500 ?", 0.6, 0.7, 0.11, -2],
  ["carry 1", 0.3, 0.86, 0.09, 1],
  ["F2 = ?", 0.78, 0.48, 0.1, -3],
];

function Wipe({ ratio }: AdProps) {
  const frame = useFrame();
  const { width: W, height: H } = useVideo();
  const w = wipePath(W, H);
  const k = easings.inOutSine(prog(frame, [1, 25], easings.linear));
  const tip = w.at(w.total * k);
  const wiping = frame >= 1 && frame <= 26;
  const unit = Math.min(W, H);
  const size: Record<Ratio, number> = { "16x9": 230, "1x1": 190, "9x16": 220 };
  const words = [
    { w: "Teach", f: at(7.4, AT.wipe), c: TEXT },
    { w: "the", f: at(7.82, AT.wipe), c: TEXT },
    { w: "line.", f: at(8.0, AT.wipe), c: PRIMARY },
  ];
  const dust = Array.from({ length: 70 }, (_, i) => {
    const back = random(`wd-b-${i}`) * w.sw * 1.4;
    const p = w.at(w.total * k - back);
    const side = (random(`wd-s-${i}`) - 0.5) * w.sw * 0.9;
    return { x: p.x, y: p.y + side, r: 1.5 + random(`wd-r-${i}`) * 4, a: (1 - back / (w.sw * 1.4)) * 0.55 };
  });
  return (
    <Shell>
      <Grid cam={{ cx: 0, cy: 0, z: 1.4 }} />
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <mask id="wipe-mask" maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
            <rect width={W} height={H} fill="#fff" />
            <path d={w.d} fill="none" stroke="#000" strokeWidth={w.sw} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${w.total} ${w.total}`} strokeDashoffset={w.total * (1 - k)} />
          </mask>
        </defs>
        <g mask="url(#wipe-mask)">
          <rect width={W} height={H} fill={BOARD} />
          {GHOSTS.map(([t, x, y, s, r], i) => (
            <text key={i} x={x * W} y={y * H} fontFamily="Virgil" fontSize={s * unit * 1.4} fill={CHALK} opacity={0.55} transform={`rotate(${r} ${x * W} ${y * H})`}>
              {t}
            </text>
          ))}
        </g>
        {wiping && dust.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#cfd5cf" opacity={d.a} />)}
        {wiping && (
          <g transform={`translate(${tip.x} ${tip.y}) rotate(${tip.dir * 5})`}>
            <rect x={-w.sw * 0.13 - 6} y={-w.sw * 0.47 + 8} width={w.sw * 0.26} height={w.sw * 0.94} rx={w.sw * 0.05} fill="rgba(0,0,0,.18)" />
            <rect x={-w.sw * 0.13} y={-w.sw * 0.47} width={w.sw * 0.26} height={w.sw * 0.94} rx={w.sw * 0.05} fill="#c48a52" />
            <rect x={tip.dir > 0 ? -w.sw * 0.13 : w.sw * 0.07} y={-w.sw * 0.47} width={w.sw * 0.06} height={w.sw * 0.94} rx={w.sw * 0.03} fill="#5c5f63" />
            <rect x={-w.sw * 0.05} y={-w.sw * 0.3} width={w.sw * 0.1} height={w.sw * 0.6} rx={w.sw * 0.05} fill="#a8723f" />
          </g>
        )}
      </svg>
      <div style={{ position: "absolute", left: 60, right: 60, top: 0, bottom: 0, display: "flex", flexWrap: "wrap", alignContent: "center", justifyContent: "center", columnGap: "0.24em", fontFamily: '"Nunito", sans-serif', fontWeight: 900, fontSize: size[ratio], letterSpacing: "-0.03em", lineHeight: 1 }}>
        {words.map(({ w: word, f, c }) => {
          const kk = easings.outBack(prog(frame, [f, f + 7], easings.linear));
          return (
            <span key={word} style={{ position: "relative", color: c, opacity: prog(frame, [f, f + 2], easings.linear), transform: `scale(${0.7 + 0.3 * kk})`, display: "inline-block" }}>
              {word}
              {word === "line." && (
                <svg width={1} height={1} style={{ position: "absolute", left: 0, top: "100%", overflow: "visible" }}>
                  <Rough shape={{ kind: "path", d: `M0 10 C ${size[ratio] * 0.9} 0, ${size[ratio] * 1.8} 22, ${size[ratio] * 2.3} 6` }} draw={[f + 4, f + 12]} seed={61} strokeWidth={size[ratio] * 0.07} stroke={PRIMARY} style={{ position: "relative" }} />
                </svg>
              )}
            </span>
          );
        })}
      </div>
    </Shell>
  );
}

// ── 3. the press ─────────────────────────────────────────────────────────────

const PRESS_CAM: Record<Ratio, CamKey[]> = {
  "16x9": [
    { f: 0, cx: 1270, cy: 470, z: 0.76 },
    { f: 105, cx: 1300, cy: 470, z: 0.8 },
    { f: 150, cx: 1450, cy: 500, z: 0.9 },
    { f: 188, cx: 1400, cy: 480, z: 0.88 },
    { f: 210, cx: 1350, cy: 300, z: 0.84, ease: easings.inQuad },
  ],
  "1x1": [
    { f: 0, cx: 700, cy: 690, z: 0.74 },
    { f: 105, cx: 720, cy: 720, z: 0.76 },
    { f: 150, cx: 730, cy: 860, z: 0.8 },
    { f: 188, cx: 730, cy: 820, z: 0.8 },
    { f: 210, cx: 730, cy: 620, z: 0.76, ease: easings.inQuad },
  ],
  "9x16": [
    { f: 0, cx: 700, cy: 720, z: 0.86 },
    { f: 105, cx: 710, cy: 760, z: 0.87 },
    { f: 150, cx: 720, cy: 800, z: 0.88 },
    { f: 188, cx: 720, cy: 790, z: 0.88 },
    { f: 210, cx: 720, cy: 600, z: 0.84, ease: easings.inQuad },
  ],
};

const P = { drag: [118, 130] as const, bar: 131, solve: at(13.7, AT.press), result: [163, 176] as const };

function liftAt(f: number) {
  if (f < 166) return 0;
  if (f < 190) return 60 * easings.outBack(prog(f, [166, 188], easings.linear));
  return 60 + 1500 * easings.inCubic(prog(f, [190, 210], easings.linear));
}

/** A selection on screen: the drag, the box, the bar above it, and the cursor that does it. */
function Selecting({ ratio, cam, box, drag, bar, click, item, until, enterFrom, leaveTo, hold, loadingUntil }: { ratio: Ratio; cam: (f: number) => Cam; box: { left: number; top: number; width: number; height: number }; drag: readonly [number, number]; bar: number; click: number; item: number; until: number; enterFrom: number; leaveTo?: { f: number; x: number; y: number }; hold?: number; loadingUntil?: number }) {
  const frame = useFrame();
  const { width: W, height: H } = useVideo();
  const ui = UI[ratio];
  const pad = 16;
  const corner = (f: number, x: number, y: number) => shot(cam(f), W, H, x, y);
  const a = corner(frame, box.left - pad, box.top - pad);
  const b = corner(frame, box.left + box.width + pad, box.top + box.height + pad);
  const bw = barWidth(ui);
  const barLeft = clamp((a.x + b.x) / 2 - bw / 2, 24, W - bw - 24);
  const barBottom = a.y - 10 * ui;
  const target = (f: number) => {
    const A = corner(f, box.left - pad, box.top - pad), B = corner(f, box.left + box.width + pad, box.top + box.height + pad);
    const L = clamp((A.x + B.x) / 2 - bw / 2, 24, W - bw - 24);
    return { x: L + itemCentre(item, ui), y: A.y - 10 * ui - 15 * ui };
  };
  const A0 = corner(drag[0], box.left - pad, box.top - pad), B1 = corner(drag[1], box.left + box.width + pad, box.top + box.height + pad);
  const t = target(click);
  const keys: CursorKey[] = [
    { f: enterFrom, x: B1.x + 160, y: B1.y + 260 },
    { f: drag[0], x: A0.x, y: A0.y, ease: easings.inOutCubic },
    { f: drag[1], x: B1.x, y: B1.y, ease: easings.inOutQuad },
    { f: bar + 4, x: B1.x, y: B1.y },
    { f: click, x: t.x, y: t.y, click: true, ease: easings.inOutCubic },
    { f: hold ?? click + 10, x: t.x, y: t.y },
    ...(leaveTo ? [{ ...leaveTo, ease: easings.inOutCubic }] : []),
  ];
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <Selection a={a} b={b} ui={ui} drag={[drag[0], drag[1]]} until={until} />
      {frame >= bar && frame < until && <SelectionBar left={barLeft} bottom={barBottom} ui={ui} appear={bar} loading={item} loadingFrom={click} loadingUntil={loadingUntil} caretAt={(a.x + b.x) / 2 - barLeft} />}
      {frame >= enterFrom && <Cursor keys={keys} size={24 * ui} color="#fff" outline="#111" rippleColor="#6965db" rippleSize={90 * ui} />}
    </div>
  );
}

function PressScene({ ratio }: AdProps) {
  const frame = useFrame();
  const { width: W, height: H } = useVideo();
  const cam = (f: number) => camAt(f, PRESS_CAM[ratio]);
  const c = cam(frame);
  const p = PRESS[ratio];
  const titles: Record<Ratio, { t: CSSProperties; ts: number; tUntil: number; c: CSSProperties; cs: number }> = {
    "16x9": { t: { right: 90, top: 64 }, ts: 124, tUntil: 152, c: { right: 90, bottom: 84, width: 900, textAlign: "right" }, cs: 76 },
    "1x1": { t: { right: 52, top: 40 }, ts: 84, tUntil: 104, c: { right: 36, top: 36, textAlign: "right" }, cs: 48 },
    "9x16": { t: { right: 70, top: 170 }, ts: 134, tUntil: 152, c: { left: 60, top: 150, width: 960 }, cs: 80 },
  };
  const g = titles[ratio];
  const speed = Math.abs(cam(frame).cy - cam(frame - 1).cy) * c.z;
  return (
    <Shell>
      <Grid cam={c} />
      <div style={{ position: "absolute", inset: 0, ...streak(speed * 0.1) }}>
        <CameraView cam={c}>
          <Press ratio={ratio} drawFrom={0} lift={liftAt(frame)} resultAt={[P.result[0], P.result[1]]} />
        </CameraView>
      </div>
      <Chrome ratio={ratio} opacity={prog(frame, [0, 10])} toolbar={ratio !== "1x1"} />
      <Selecting ratio={ratio} cam={cam} box={boxOf("nums", p.nums)} drag={P.drag} bar={P.bar} click={P.solve} item={0} until={P.result[0]} enterFrom={98} leaveTo={{ f: 192, x: W * 0.92, y: H * 0.95 }} hold={P.result[0] + 4} />
      <Head text="Hydraulics." from={12} until={g.tUntil} size={g.ts} color={PRIMARY} style={g.t} />
      <Head text="Computed exactly. | Right where you wrote it." from={at(13.85, AT.press)} size={g.cs} style={g.c} stagger={2} plate={ratio !== "16x9"} />
    </Shell>
  );
}

// ── 4. the engine ────────────────────────────────────────────────────────────

const ENGINE_CAM: Record<Ratio, CamKey[]> = {
  "16x9": [
    { f: 0, cx: 1350, cy: 300, z: 0.84 },
    { f: 12, cx: 1150, cy: 1930, z: 0.92, ease: easings.inOutCubic },
    { f: 90, cx: 1180, cy: 1945, z: 0.97 },
  ],
  "1x1": [
    { f: 0, cx: 730, cy: 620, z: 0.76 },
    { f: 12, cx: 700, cy: 2150, z: 0.72, ease: easings.inOutCubic },
    { f: 90, cx: 700, cy: 2160, z: 0.74 },
  ],
  "9x16": [
    { f: 0, cx: 720, cy: 600, z: 0.8 },
    { f: 12, cx: 700, cy: 2150, z: 0.86, ease: easings.inOutCubic },
    { f: 90, cx: 700, cy: 2160, z: 0.88 },
  ],
};

const E = { write: [12, 30] as const, drag: [33, 41] as const, bar: 42, solve: 50, result: [56, 68] as const };

function EngineScene({ ratio }: AdProps) {
  const frame = useFrame();
  const { width: W, height: H } = useVideo();
  const cam = (f: number) => camAt(f, ENGINE_CAM[ratio]);
  const c = cam(frame);
  const speed = Math.abs(c.cy - cam(frame - 1).cy) * c.z;
  const e = ENGINE[ratio];
  const title: Record<Ratio, { size: number; pad: number; bottom: number }> = {
    "16x9": { size: 120, pad: 60, bottom: 90 },
    "1x1": { size: 92, pad: 40, bottom: 60 },
    "9x16": { size: 124, pad: 50, bottom: 200 },
  };
  const t = title[ratio];
  return (
    <Shell>
      <Grid cam={c} />
      <div style={{ position: "absolute", inset: 0, transform: `scaleY(${1 + Math.min(0.15, speed * 0.0008)})`, ...streak(speed * 0.08) }}>
        <CameraView cam={c}>
          <Press ratio={ratio} lift={1560} resultAt={[-3, -2]} />
          <Engine ratio={ratio} eqWrite={[E.write[0], E.write[1]]} resWrite={[E.result[0], E.result[1]]} />
        </CameraView>
      </div>
      <Chrome ratio={ratio} toolbar={ratio !== "1x1"} />
      <Selecting ratio={ratio} cam={cam} box={etaLineBox("eta", e.eta)} drag={E.drag} bar={E.bar} click={E.solve} item={0} until={E.result[0]} enterFrom={22} leaveTo={{ f: 84, x: W * 0.9, y: H * 0.94 }} hold={E.result[0] + 4} />
      <div style={{ position: "absolute", left: W - t.pad - t.size * 1.05, top: H - t.bottom, width: 0, height: 0 }}>
        <div style={{ position: "absolute", left: 0, top: 0, transform: "rotate(-90deg)", transformOrigin: "0 0" }}>
          <Head text="Thermodynamics." from={8} size={t.size} color={PRIMARY} style={{ left: 0, top: 0, whiteSpace: "nowrap" }} />
        </div>
      </div>
    </Shell>
  );
}

// ── 5. explain ───────────────────────────────────────────────────────────────

const X = { click: 44, out: [62, 86] as const };

type PanelGeo = { left: number; top: number; w: number; h: number; k: number };
/** The panel's place on screen at frame f of the explain scene: in from the side, then out to fill the frame. */
function panelGeo(ratio: Ratio, f: number, W: number, H: number): PanelGeo {
  const inK = easings.outCubic(prog(f, [X.click + 1, X.click + 14], easings.linear));
  const outK = easings.inOutCubic(prog(f, X.out, easings.linear));
  if (ratio === "16x9") {
    const left = lerp(lerp(W, 1380, inK), 680, outK);
    return { left, top: 0, w: W - left, h: H, k: lerp(1.5, 2.0, outK) };
  }
  const end = ratio === "1x1" ? 330 : 760;
  const mid = ratio === "1x1" ? 560 : 1100;
  const top = lerp(lerp(H, mid, inK), end, outK);
  return { left: 0, top, w: W, h: H - top, k: ratio === "1x1" ? lerp(1.5, 1.7, outK) : lerp(2.0, 2.3, outK) };
}

/** Where the selected line sits on screen, as the panel takes the room. */
function explainCam(ratio: Ratio, f: number, W: number, H: number): Cam {
  const b = boxOf("nums", PRESS[ratio].nums);
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  const at = (sx: number, sy: number, z: number): Cam => ({ cx: cx + (W / 2 - sx) / z, cy: cy + (H / 2 - sy) / z, z });
  const spots: Record<Ratio, [Cam, Cam, Cam]> = {
    "16x9": [at(W / 2, H / 2 - 40, 0.95), at(690, 420, 0.9), at(340, 360, 0.58)],
    "1x1": [at(W / 2, 470, 0.9), at(W / 2, 280, 0.7), at(800, 170, 0.45)],
    "9x16": [at(W / 2, 760, 0.85), at(W / 2, 640, 0.85), at(W / 2, 520, 0.8)],
  };
  const [a, m, z] = spots[ratio];
  const k1 = easings.outCubic(prog(f, [X.click + 1, X.click + 14], easings.linear));
  const k2 = easings.inOutCubic(prog(f, X.out, easings.linear));
  const mix = (p: Cam, q: Cam, k: number): Cam => ({ cx: lerp(p.cx, q.cx, k), cy: lerp(p.cy, q.cy, k), z: lerp(p.z, q.z, k) });
  return mix(mix(a, m, k1), z, k2);
}

const NUMS_THUMB = { id: "nums", width: 132 };

/** A spot in the docked panel, on screen. */
function panelPoint(ratio: Ratio, W: number, H: number, pick: (spots: ReturnType<typeof panelSpots>, g: PanelGeo) => { x: number; y: number }) {
  const g = panelGeo(ratio, 999, W, H);
  const p = pick(panelSpots(g.w / g.k, g.h / g.k, -1), g);
  return { x: g.left + p.x * g.k, y: g.top + p.y * g.k };
}
const composerAt = (ratio: Ratio, W: number, H: number) => panelPoint(ratio, W, H, (s) => s.composer);

function ExplainScene({ ratio }: AdProps) {
  const frame = useFrame();
  const { width: W, height: H } = useVideo();
  const cam = (f: number) => explainCam(ratio, f, W, H);
  const c = cam(frame);
  const g = panelGeo(ratio, frame, W, H);
  const composer = composerAt(ratio, W, H);
  const heads: Record<Ratio, { s: React.CSSProperties; size: number }> = {
    "16x9": { s: { left: 80, bottom: 90, width: 560 }, size: 80 },
    "1x1": { s: { left: 48, top: 40, width: 520 }, size: 62 },
    "9x16": { s: { left: 70, top: 150, width: 940 }, size: 92 },
  };
  const hd = heads[ratio];
  const ui = UI[ratio];
  return (
    <Shell>
      <Grid cam={c} />
      <CameraView cam={c}>
        <Press ratio={ratio} lift={60} resultAt={[-3, -2]} />
      </CameraView>
      <Chrome ratio={ratio} toolbar={false} opacity={1 - prog(frame, [X.click, X.click + 10])} />
      <Selecting ratio={ratio} cam={cam} box={boxOf("nums", PRESS[ratio].nums)} drag={[-12, -6]} bar={-4} click={X.click} item={1} until={999} loadingUntil={X.click + 14} enterFrom={-10} hold={X.click + 6} leaveTo={{ f: 104, x: composer.x, y: composer.y }} />
      <Head text="When a student asks why." from={6} size={hd.size} style={hd.s} plate={ratio !== "16x9"} />
      <div style={{ position: "absolute", left: g.left, top: g.top, width: g.w, height: g.h, boxShadow: ratio === "16x9" ? "-12px 0 40px rgba(0,0,0,.10)" : "0 -12px 40px rgba(0,0,0,.12)", borderRadius: ratio === "16x9" ? 0 : `${22 * ui}px ${22 * ui}px 0 0`, overflow: "hidden" }}>
        <ChatPanelView w={g.w} h={g.h} k={g.k} t0={X.click} nums={NUMS_THUMB} />
      </div>
    </Shell>
  );
}

// ── 6. the simulation, then the whole lecture ────────────────────────────────

/** Frames of the sim scene. The follow-up is sent at `send`; the panel's own timings (FOLLOW_T) run from there. */
const S = { type: [4, 20] as const, send: 23, add: 54, away: [56, 72] as const, land: [58, 72] as const, focus: [52, 76] as const, drag: [76, 98] as const, wide: [100, 150] as const };

/** Where the sim box lands on the canvas, beside the press. Two of the sim's pixels to one of the canvas's. */
const SIMBOX: Record<Ratio, { x: number; y: number; s: number }> = {
  "16x9": { x: 1420, y: 840, s: 2 },
  "1x1": { x: 1420, y: 240, s: 2 },
  "9x16": { x: 1420, y: 240, s: 2 },
};

const SIM_CAMS: Record<Ratio, { focus: Cam; wide: Cam }> = {
  "16x9": { focus: { cx: 1980, cy: 1135, z: 1.1 }, wide: { cx: 1320, cy: 1022, z: 0.372 } },
  "1x1": { focus: { cx: 1980, cy: 519, z: 0.85 }, wide: { cx: 1320, cy: 1166, z: 0.309 } },
  "9x16": { focus: { cx: 1980, cy: 657, z: 0.9 }, wide: { cx: 1320, cy: 1190, z: 0.426 } },
};

const camMix = (p: Cam, q: Cam, k: number): Cam => ({ cx: lerp(p.cx, q.cx, k), cy: lerp(p.cy, q.cy, k), z: Math.exp(lerp(Math.log(p.z), Math.log(q.z), k)) });

function simCam(ratio: Ratio, f: number, W: number, H: number): Cam {
  const start = explainCam(ratio, 999, W, H);
  const { focus, wide } = SIM_CAMS[ratio];
  return camMix(camMix(start, focus, easings.inOutCubic(prog(f, S.focus, easings.linear))), wide, easings.inOutCubic(prog(f, S.wide, easings.linear)));
}

const f1At = (f: number) => 200 + 100 * easings.inOutCubic(prog(f, S.drag, easings.linear));

function SimScene({ ratio }: AdProps) {
  const frame = useFrame();
  const { width: W, height: H } = useVideo();
  const ui = UI[ratio];
  const cam = (f: number) => simCam(ratio, f, W, H);
  const c = cam(frame);
  const box = SIMBOX[ratio];
  const g0 = panelGeo(ratio, 999, W, H);
  const away = easings.inCubic(prog(frame, S.away, easings.linear));
  const g = ratio === "16x9" ? { ...g0, left: g0.left + (W - g0.left) * away } : { ...g0, top: g0.top + (H - g0.top) * away };
  const typed = frame < S.send ? FOLLOW_TEXT.slice(0, Math.round(prog(frame, S.type, easings.linear) * FOLLOW_TEXT.length)) : "";
  const composer = composerAt(ratio, W, H);
  const send = panelPoint(ratio, W, H, (sp) => sp.send);
  const add = (() => {
    const p = panelSpots(g0.w / g0.k, g0.h / g0.k, S.add - S.send);
    return { x: g0.left + p.addSim.x * g0.k, y: g0.top + p.addSim.y * g0.k };
  })();
  const thumb = (f: number, f1: number) => {
    const t = sliderAt(f1);
    return shot(cam(f), W, H, box.x + t.x * box.s, box.y + t.y * box.s);
  };
  const keys: CursorKey[] = [
    { f: 0, x: composer.x, y: composer.y },
    { f: 18, x: send.x - 30, y: send.y - 40, ease: easings.inOutCubic },
    { f: S.send, x: send.x, y: send.y, click: true, ease: easings.inOutCubic },
    { f: 42, x: add.x - 40, y: add.y + 50, ease: easings.inOutCubic },
    { f: S.add, x: add.x, y: add.y, click: true, ease: easings.inOutCubic },
    { f: 64, x: add.x - 120, y: add.y + 60, ease: easings.inOutCubic },
    { f: S.drag[0] - 4, ...thumb(S.drag[0], 200), ease: easings.inOutCubic },
    { f: S.drag[0], ...thumb(S.drag[0], 200) },
    { f: S.drag[1], ...thumb(S.drag[1], 300), ease: easings.inOutCubic },
    { f: S.drag[1] + 6, ...thumb(S.drag[1] + 6, 300) },
    { f: 132, x: W * 1.05, y: H * 1.05, ease: easings.inCubic },
  ];
  const land = easings.outBack(prog(frame, S.land, easings.linear));
  const clock = 0.4 + frame / 30;
  const heads: Record<Ratio, { one: CSSProperties; s1: number; two: CSSProperties; s2: number; three: CSSProperties; s3: number }> = {
    "16x9": { one: { left: 80, bottom: 90, width: 560 }, s1: 80, two: { left: "50%", top: 44, transform: "translateX(-50%)", whiteSpace: "nowrap" }, s2: 84, three: { left: 0, right: 0, top: 46, textAlign: "center" }, s3: 104 },
    "1x1": { one: { left: 48, top: 40, width: 520 }, s1: 62, two: { left: "50%", top: 30, transform: "translateX(-50%)", whiteSpace: "nowrap" }, s2: 64, three: { left: 0, right: 0, top: 40, textAlign: "center" }, s3: 88 },
    "9x16": { one: { left: 70, top: 150, width: 940 }, s1: 92, two: { left: "50%", top: 200, transform: "translateX(-50%)", whiteSpace: "nowrap" }, s2: 88, three: { left: 0, right: 0, top: 150, textAlign: "center" }, s3: 112 },
  };
  const hd = heads[ratio];
  return (
    <Shell>
      <Grid cam={c} />
      <CameraView cam={c}>
        <Press ratio={ratio} lift={60} resultAt={[-3, -2]} />
        <Engine ratio={ratio} resWrite={[-3, -2]} />
        {frame >= S.land[0] && (
          <div style={{ position: "absolute", left: box.x, top: box.y, transform: `scale(${box.s * (0.86 + 0.14 * land)})`, transformOrigin: "0 0", opacity: prog(frame, [S.land[0], S.land[0] + 5], easings.linear) }}>
            <SimBox f1={f1At(frame)} t={clock} active={frame < S.wide[0] + 10} />
          </div>
        )}
      </CameraView>
      {away < 1 && (
        <div style={{ position: "absolute", left: g.left, top: g.top, width: g.w, height: g.h, boxShadow: ratio === "16x9" ? "-12px 0 40px rgba(0,0,0,.10)" : "0 -12px 40px rgba(0,0,0,.12)", overflow: "hidden", borderRadius: ratio === "16x9" ? 0 : `${22 * ui}px ${22 * ui}px 0 0` }}>
          <ChatPanelView w={g.w} h={g.h} k={g.k} t0={-1000} follow={S.send} typed={typed} nums={NUMS_THUMB} sim={{ f1: 200, t: clock, addHot: frame >= S.add - 10 }} />
        </div>
      )}
      <Head text="Ask for a simulation." from={4} until={S.away[0] + 4} size={hd.s1} style={hd.one} plate={ratio !== "16x9"} />
      <Head text="Then drag the numbers." from={S.land[1] - 4} until={S.wide[0] + 2} size={hd.s2} style={hd.two} plate />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: (hd.three.top as number) + hd.s3 * 1.6, background: "linear-gradient(to bottom, rgba(255,255,255,.95) 60%, rgba(255,255,255,0))", opacity: prog(frame, [S.wide[0] + 2, S.wide[0] + 10]) }} />
      <Head text="All on one canvas." from={S.wide[0] + 2} size={hd.s3} style={hd.three} />
      <Cursor keys={keys} size={24 * ui} color="#fff" outline="#111" rippleColor="#6965db" rippleSize={90 * ui} />
    </Shell>
  );
}

// ── 7. end card ──────────────────────────────────────────────────────────────

function End({ ratio }: AdProps) {
  const frame = useFrame();
  const size: Record<Ratio, { mark: number; tag: number; url: number; free: number; gap: number }> = {
    "16x9": { mark: 128, tag: 54, url: 46, free: 38, gap: 34 },
    "1x1": { mark: 112, tag: 50, url: 44, free: 36, gap: 32 },
    "9x16": { mark: 124, tag: 58, url: 50, free: 42, gap: 40 },
  };
  const s = size[ratio];
  const rise = (f: number): React.CSSProperties => {
    const k = easings.outCubic(prog(frame, [f, f + 12], easings.linear));
    return { opacity: k, transform: `translateY(${(1 - k) * 24}px)` };
  };
  return (
    <Shell>
      <div style={{ position: "absolute", inset: 0, opacity: 0.55 }}>
        <Grid cam={{ cx: 0, cy: 0, z: 1.3 }} />
      </div>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: s.gap, fontFamily: '"Nunito", sans-serif' }}>
        <div style={rise(-4)}>
          <Wordmark size={s.mark} />
        </div>
        <div style={{ ...rise(at(27.8, AT.end)), fontSize: s.tag, fontWeight: 700, color: MUTED }}>Write math Naturally</div>
        <div style={{ ...rise(at(28.3, AT.end)), fontSize: s.url, fontWeight: 800, color: "#fff", background: PRIMARY, padding: `${s.url * 0.3}px ${s.url * 0.8}px`, borderRadius: s.url }}>mathbooklm.com</div>
        <div style={{ ...rise(at(29.2, AT.end)), fontSize: s.free, fontWeight: 700, color: TEXT }}>Free to start</div>
      </div>
    </Shell>
  );
}

export const scenes: Scene[] = [
  { id: "board", name: "The board", component: Board, frames: AT.wipe - AT.board },
  { id: "wipe", name: "The board wiped", component: Wipe, frames: AT.press - AT.wipe },
  { id: "press", name: "Hydraulics", component: PressScene, frames: AT.engine - AT.press },
  { id: "engine", name: "Thermodynamics", component: EngineScene, frames: AT.explain - AT.engine },
  { id: "explain", name: "Explain", component: ExplainScene, frames: AT.sim - AT.explain },
  { id: "sim", name: "Simulation", component: SimScene, frames: AT.end - AT.sim },
  { id: "end", name: "End card", component: End, frames: AT.stop - AT.end },
];
