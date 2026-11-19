import type { CSSProperties, ReactNode } from "react";
import { asset, useFrame, useVideo, type AdProps, type Cue, type Layout, type Ratio, type Scene } from "../../engine";
import { clamp, lerp } from "../../parts/time";
import { ICONS, JOBS, SHOT_H, SHOT_W, banner, chatScreen, feed, icon, onboarding, phone, sheet, tailoredSheet, touch } from "./app";

/**
 * "המדריך" (madrich). A "full tutorial" on how to apply for a job that's over at second 1.5: the card is swiped right,
 * "הוגש!", "זהו." But the progress bar at the top has barely moved, so the rest of the ad is what that one swipe did
 * and what the app does around it. The real Gomlin app (app.ts, from the Flutter source) in a phone moved in CSS 3D,
 * kinetic type in the app's Noto Sans Hebrew, Danit's voice and an ElevenLabs track cut to the picture (spec.json).
 * Times are the ad's seconds from gen/timeline.json, which spec.json fixes.
 */
export const SLUG = "madrich";
export const cues: Cue[] = [{ src: `ads/${SLUG}/gen/mix.wav` }];

const FPS = 30;
const PURPLE = "#655EE4", DARK = "#544BD0", INK = "#171923", BG = "#F4F5F9";
const PW = SHOT_W + 22, PH = SHOT_H + 22; // the phone with its bezel

const p = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const out3 = (x: number) => 1 - (1 - x) ** 3;
const out5 = (x: number) => 1 - (1 - x) ** 5;
const in3 = (x: number) => x ** 3;
const inOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const outBack = (x: number) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;

// ── the story's clock ────────────────────────────────────────────────────────

/** Scene lengths in frames, cut on the sound: the swipe after the title (2.43 s), the freeze at 3.97 s, the restart at 4.77 s, the hit at 22.73 s. */
const LEN = { title: 73, swipe: 46, freeze: 24, bar: 87, sent: 123, once: 124, chat: 93, tailor: 112, end: 104 } as const;
type Id = keyof typeof LEN;
const ORDER: Id[] = ["title", "swipe", "freeze", "bar", "sent", "once", "chat", "tailor", "end"];
const START = {} as Record<Id, number>;
ORDER.reduce((at, id) => ((START[id] = at), at + LEN[id]), 0);
const HIT = START.end / FPS; // the bar is full here

/** Seconds into the scene, and into the ad. */
function useClock(id: Id) {
  const f = useFrame();
  return { t: f / FPS, g: (START[id] + f) / FPS };
}

// ── the stage ────────────────────────────────────────────────────────────────

const CSS = `
@font-face{font-family:"Noto Sans Hebrew";src:url("${asset(`ads/${SLUG}/NotoSansHebrew-wdth-wght.ttf`)}");font-weight:100 900}
@font-face{font-family:"Noto Sans";src:url("${asset(`ads/${SLUG}/NotoSans-wdth-wght.ttf`)}");font-weight:100 900}
.gomlin{position:absolute;inset:0;overflow:hidden;color:${INK};font-family:"Noto Sans","Noto Sans Hebrew",Arial,sans-serif;line-height:1.3}
.gomlin *{box-sizing:border-box}
.dock-small{width:46px;height:46px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;border:.5px solid rgba(101,94,228,.5)}
.dock-large{width:58px;height:58px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;border:1px solid rgba(23,25,35,.51);box-shadow:0 4px 15px rgba(0,0,0,.18);transform-origin:bottom center}
.type{font-family:"Noto Sans Hebrew","Noto Sans",Arial,sans-serif;font-weight:900;letter-spacing:-0.015em;line-height:1.08;color:${INK}}
`;

function Shell({ children, bg }: { children: ReactNode; bg: string }) {
  const { width, height } = useVideo();
  return (
    <>
      <style>{CSS}</style>
      <div style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
        {ICONS.map((src: string) => <img key={src} src={src} alt="" />)}
      </div>
      <div className="gomlin" style={{ width, height, background: bg }}>{children}</div>
    </>
  );
}

/** A soft purple light that drifts, so the background is never still. */
function Glow({ x, y, r, o = 0.35, color = "#8B84F2" }: { x: number; y: number; r: number; o?: number; color?: string }) {
  return <div style={{ position: "absolute", left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: "50%", background: `radial-gradient(circle, ${color} 0%, rgba(139,132,242,0) 70%)`, opacity: o, pointerEvents: "none" }} />;
}

// ── the progress bar: the ad's spine ─────────────────────────────────────────

type BarSpot = { x0: number; x1: number; y: number; h: number };
const BAR: Layout<BarSpot> = {
  "9x16": { x0: 100, x1: 940, y: 236, h: 10 },
  "1x1": { x0: 90, x1: 990, y: 78, h: 10 },
  "16x9": { x0: 160, x1: 1760, y: 78, h: 10 },
};

/** Fills right to left, as Hebrew reads, and is full at the hit. */
function Bar({ g, spot, light = false, glow = 0 }: { g: number; spot: BarSpot; light?: boolean; glow?: number }) {
  const fill = clamp(g / HIT);
  const w = spot.x1 - spot.x0;
  return (
    <div style={{ position: "absolute", left: spot.x0, top: spot.y - spot.h / 2, width: w, height: spot.h, borderRadius: spot.h / 2, background: light ? "rgba(255,255,255,.28)" : "rgba(23,25,35,.12)", overflow: "hidden", zIndex: 20, boxShadow: glow ? `0 0 ${30 * glow}px rgba(101,94,228,${0.6 * glow})` : "none" }}>
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: w * fill, borderRadius: spot.h / 2, background: light ? "#fff" : `linear-gradient(270deg, ${PURPLE}, #8B7FF6)` }} />
    </div>
  );
}

// ── the phone in space ───────────────────────────────────────────────────────

type Pose = { x: number; y: number; s: number; rx?: number; ry?: number; rz?: number };
const mix = (a: Pose, b: Pose, m: number): Pose => ({
  x: lerp(a.x, b.x, m), y: lerp(a.y, b.y, m), s: lerp(a.s, b.s, m),
  rx: lerp(a.rx ?? 0, b.rx ?? 0, m), ry: lerp(a.ry ?? 0, b.ry ?? 0, m), rz: lerp(a.rz ?? 0, b.rz ?? 0, m),
});

/** The real app in its Android frame, with a back for when it flips, and a shadow under it. */
function Phone({ pose, html, origin = "50% 50%", shadow = 1, flat = false }: { pose: Pose; html: string; origin?: string; shadow?: number; flat?: boolean }) {
  const { rx = 0, ry = 0, rz = 0 } = pose;
  const tf = `translate(-50%, -50%) perspective(2600px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${pose.s})`;
  const face: CSSProperties = { position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };
  return (
    <div style={{ position: "absolute", left: pose.x, top: pose.y, width: PW, height: PH, transform: tf, transformOrigin: origin, transformStyle: "preserve-3d", zIndex: 5 }}>
      {shadow > 0 && (
        <div style={{ position: "absolute", inset: "4% 6%", borderRadius: 60, background: "rgba(23,25,35,.55)", filter: `blur(${flat ? 26 : 40}px)`, transform: flat ? "translate(18px, 26px)" : "translate(0, 46px) scale(.94)", opacity: 0.45 * shadow }} />
      )}
      <div style={face} dangerouslySetInnerHTML={{ __html: html }} />
      <div style={{ ...face, transform: "rotateY(180deg)", borderRadius: 44, background: "linear-gradient(135deg, #2A2B33, #15161B 60%, #22232A)", boxShadow: "inset 0 0 0 2px #3A3B44" }}>
        <div style={{ position: "absolute", top: 34, left: 34, width: 120, height: 150, borderRadius: 34, background: "#1B1C22", boxShadow: "inset 0 0 0 2px #3A3B44" }}>
          {[[30, 32], [30, 92]].map(([x, y]) => <div key={y} style={{ position: "absolute", left: x, top: y, width: 44, height: 44, borderRadius: "50%", background: "radial-gradient(circle at 40% 40%, #3B3D4A, #07070A 70%)", boxShadow: "0 0 0 3px #2C2D35" }} />)}
        </div>
      </div>
    </div>
  );
}

/** A swipe: [when, 1 right, seconds of drag, seconds of fling]. The app's own is 0.33 s of drag, then 0.17 s of fling. */
type Swipe = [number, 1 | -1, number?, number?];
const DRAG = (s: Swipe) => s[2] ?? 0.33;
const FLING = (s: Swipe) => s[3] ?? 0.17;
/** How far the finger drags the card, in app pixels, before the fling: further for a slow, staged swipe. */
const REACH = (s: Swipe) => (DRAG(s) > 0.4 ? 150 : 100);

/** Cards swiped in order. Past the drag the card flies off, the apply button swells and "הוגש!" shows, as in the app. */
function deck(a: number, swipes: Swipe[], first = 0, over = "") {
  const end = (s: Swipe) => s[0] + DRAG(s) + FLING(s);
  const done = swipes.filter((s) => a >= end(s));
  const now = swipes.find((s) => a >= s[0] && a < end(s));
  const index = first + done.length;
  const job = (i: number) => i % JOBS.length;
  let dx = 0;
  if (now) {
    const b = a - now[0], drag = DRAG(now), reach = REACH(now);
    dx = now[1] * (b < drag ? reach * inOut(b / drag) : reach + 620 * in3((b - drag) / FLING(now)));
  }
  const lastRight = [...done].reverse().find(([, dir]) => dir === 1);
  return feed(job(index), job(index + 1), dx, {
    applied: !!lastRight && a < end(lastRight) + 1.1,
    finger: now && a - now[0] < DRAG(now) ? touch(195 + dx, 330, DRAG(now) > 0.4 ? 1.4 : 1, 1) : "",
    over,
  });
}

/** The ad's own cue for the swipe, outside the app: a green arrow that rides out of the card with it, and a trail. */
function SwipeCue({ pose, t, swipe, size }: { pose: Pose; t: number; swipe: Swipe; size: number }) {
  const [at] = swipe, drag = DRAG(swipe), fling = FLING(swipe);
  if (t < at - 0.18 || t > at + drag + fling + 0.3) return null;
  const d = inOut(p(t, at, at + drag)), f = in3(p(t, at + drag, at + drag + fling));
  const travel = (REACH(swipe) * d + 620 * f) * pose.s;
  const x0 = pose.x - 40 * pose.s, cy = pose.y - 60 * pose.s;
  const pop = outBack(p(t, at - 0.18, at + 0.12));
  const o = 1 - p(t, at + drag + fling, at + drag + fling + 0.3);
  const h = size * 0.34;
  const trailO = 1 - p(t, at + drag + fling * 0.5, at + drag + fling + 0.08);
  return (
    <>
      <div style={{ position: "absolute", left: x0, top: cy - h / 2, width: Math.max(0, travel + 20), height: h, borderRadius: h / 2, background: "linear-gradient(90deg, rgba(34,197,94,0), rgba(34,197,94,.55))", opacity: trailO, zIndex: 7 }} />
      <div style={{ position: "absolute", left: x0 + travel, top: cy, width: size, height: size, transform: `translate(-50%, -50%) scale(${pop})`, borderRadius: "50%", background: "#22C55E", boxShadow: `0 0 0 ${size * 0.09}px rgba(34,197,94,.25), 0 14px 40px rgba(34,197,94,.55)`, opacity: o, zIndex: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h15M13 5l7 7-7 7" /></svg>
      </div>
    </>
  );
}

/** The camera leans in and tilts with the swipe, and a green light flashes behind the phone as the card flies. */
function swipeLean(pose: Pose, t: number, swipe: Swipe): Pose {
  const [at] = swipe, span = DRAG(swipe) + FLING(swipe);
  const bump = Math.sin(Math.PI * p(t, at - 0.1, at + span + 0.4));
  return { ...pose, s: pose.s * (1 + 0.07 * bump), rz: (pose.rz ?? 0) + 3 * bump, ry: (pose.ry ?? 0) - 6 * bump };
}
const flash = (t: number, swipe: Swipe) => Math.sin(Math.PI * p(t, swipe[0] + DRAG(swipe) - 0.05, swipe[0] + DRAG(swipe) + FLING(swipe) + 0.6));

const CUE: Layout<number> = { "9x16": 170, "1x1": 120, "16x9": 140 };

// ── type ─────────────────────────────────────────────────────────────────────

type Anchor = "center" | "right" | "left";
const shift: Record<Anchor, string> = { center: "-50%", right: "-100%", left: "0%" };

/** One line whose words rise out of a mask in reading order, right to left, and leave together. */
function Rise({ x, y, size, t, from, until = 99, anchor = "center", color = INK, weight = 900, stagger = 0.07, children, z = 10 }: {
  x: number; y: number; size: number; t: number; from: number; until?: number; anchor?: Anchor; color?: string; weight?: number; stagger?: number; children: string; z?: number;
}) {
  if (t < from - 0.02 || t > until) return null;
  const words = children.split(" ");
  const o = 1 - p(t, until - 0.18, until);
  const lift = lerp(0, -30, in3(p(t, until - 0.18, until)));
  return (
    <div dir="rtl" className="type" style={{ position: "absolute", left: x, top: y, transform: `translate(${shift[anchor]}, -50%) translateY(${lift}px)`, fontSize: size, fontWeight: weight, color, whiteSpace: "nowrap", opacity: o, zIndex: z, display: "flex", gap: `0 ${size * 0.26}px` }}>
      {words.map((w, i) => {
        const k = out5(p(t, from + i * stagger, from + i * stagger + 0.5));
        return (
          <span key={i} style={{ display: "inline-block", overflow: k < 1 ? "hidden" : "visible", padding: `${size * 0.22}px 0.14em ${size * 0.2}px`, margin: `-${size * 0.22}px -0.14em -${size * 0.2}px` }}>
            <span style={{ display: "inline-block", transform: `translateY(${lerp(105, 0, k)}%) rotate(${lerp(4, 0, k)}deg)` }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
}

/** A pill label, popped in. */
function Pill({ x, y, size, t, from, children, bg = PURPLE, color = "#fff" }: { x: number; y: number; size: number; t: number; from: number; children: string; bg?: string; color?: string }) {
  const k = outBack(p(t, from, from + 0.4));
  if (t < from) return null;
  return (
    <div dir="rtl" className="type" style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -50%) scale(${k})`, fontSize: size, fontWeight: 800, color, background: bg, padding: `${size * 0.22}px ${size * 0.62}px ${size * 0.3}px`, borderRadius: 999, whiteSpace: "nowrap", zIndex: 11, boxShadow: "0 10px 30px rgba(101,94,228,.35)" }}>{children}</div>
  );
}

// ── 1. The title: the question, alone ────────────────────────────────────────

type Line = { x: number; y: number; size: number; anchor: Anchor };
type TitleL = { pill: [number, number, number]; lines: Line[]; glow: [number, number, number] };
const TITLE: Layout<TitleL> = {
  "9x16": {
    pill: [510, 600, 64], glow: [540, 900, 760],
    lines: [{ x: 510, y: 790, size: 150, anchor: "center" }, { x: 510, y: 960, size: 150, anchor: "center" }, { x: 510, y: 1130, size: 150, anchor: "center" }],
  },
  "1x1": {
    pill: [540, 330, 54], glow: [540, 560, 560],
    lines: [{ x: 540, y: 500, size: 118, anchor: "center" }, { x: 540, y: 650, size: 118, anchor: "center" }],
  },
  "16x9": {
    pill: [960, 300, 58], glow: [960, 560, 700],
    lines: [{ x: 960, y: 480, size: 150, anchor: "center" }, { x: 960, y: 660, size: 150, anchor: "center" }],
  },
};
const TITLE_WORDS: Record<Ratio, string[]> = {
  "9x16": ["איך מגישים", "מועמדות", "לעבודה"],
  "1x1": ["איך מגישים", "מועמדות לעבודה"],
  "16x9": ["איך מגישים", "מועמדות לעבודה"],
};

/** The tutorial's title while she asks the question, then it flies off the top before anything else happens. */
function Title({ ratio }: AdProps) {
  const { t, g } = useClock("title");
  const { height } = useVideo();
  const L = TITLE[ratio];
  const leave = in3(p(t, 2.0, 2.42));
  return (
    <Shell bg={BG}>
      <Glow x={L.glow[0] + 50 * Math.sin(t * 1.3)} y={L.glow[1]} r={L.glow[2]} o={0.38} />
      <Bar g={g} spot={BAR[ratio]} />
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${-leave * height * 0.9}px) scale(${lerp(1, 0.92, leave)})`, opacity: 1 - p(t, 2.3, 2.42) }}>
        <Pill x={L.pill[0]} y={L.pill[1]} size={L.pill[2]} t={t} from={0.02}>מדריך מלא</Pill>
        {TITLE_WORDS[ratio].map((w, i) => (
          <Rise key={w} {...L.lines[i]} t={t} from={0.1 + i * 0.2} color={i === 0 ? INK : PURPLE}>{w}</Rise>
        ))}
      </div>
    </Shell>
  );
}

// ── 2. The swipe: the phone, big, and nothing else ───────────────────────────

/** Slower than the app's own swipe, so nobody misses it: in at 0.32 s, 0.45 s of drag, then the fling, done by 0.97 s. */
const SWIPE_AT: Swipe = [0.32, 1, 0.45, 0.2];

type SwipeL = { pose: Pose; cue: number; it: { x: number; y: number; size: number } };
const SWIPE: Layout<SwipeL> = {
  "9x16": { pose: { x: 540, y: 1010, s: 1.5, rx: 4, ry: -4, rz: 1 }, cue: 230, it: { x: 510, y: 960, size: 340 } },
  "1x1": { pose: { x: 540, y: 565, s: 1.02, rx: 4, ry: -4, rz: 1 }, cue: 170, it: { x: 540, y: 540, size: 300 } },
  "16x9": { pose: { x: 960, y: 560, s: 1.08, rx: 4, ry: -4, rz: 1 }, cue: 180, it: { x: 960, y: 540, size: 360 } },
};

/** The phone comes up from below into the middle of the frame, then leans in a little on "הוגש!". */
function swipePose(L: SwipeL, t: number): Pose {
  const k = out5(p(t, 0, 0.34));
  const hold = out3(p(t, 0.97, 1.53));
  const base = { ...L.pose, y: L.pose.y + lerp(1200, 0, k), rx: lerp(30, L.pose.rx ?? 0, k), s: L.pose.s * lerp(0.88, 1, k) * lerp(1, 1.04, hold) };
  return swipeLean(base, t, SWIPE_AT);
}
const SWIPE_END = LEN.swipe / FPS;

function SwipeScene({ ratio }: AdProps) {
  const { t, g } = useClock("swipe");
  const L = SWIPE[ratio];
  const pose = swipePose(L, t);
  return (
    <Shell bg={BG}>
      <Glow x={L.pose.x} y={L.pose.y} r={700} o={0.3} />
      <Glow x={pose.x} y={pose.y} r={680} o={0.6 * flash(t, SWIPE_AT)} color="#4ADE80" />
      <Bar g={g} spot={BAR[ratio]} />
      <Phone pose={pose} html={phone(deck(t, [SWIPE_AT], 0))} />
      <SwipeCue pose={pose} t={t} swipe={SWIPE_AT} size={L.cue} />
    </Shell>
  );
}

// ── 3. The punchline: "זהו." ─────────────────────────────────────────────────

function Freeze({ ratio }: AdProps) {
  const { t, g } = useClock("freeze");
  const L = SWIPE[ratio];
  const pose = swipePose(L, SWIPE_END);
  const k = p(t, 0, 0.12);
  return (
    <Shell bg={BG}>
      <Glow x={L.pose.x} y={L.pose.y} r={700} o={0.3} />
      <Phone pose={pose} html={phone(deck(SWIPE_END, [SWIPE_AT], 0))} />
      <div style={{ position: "absolute", inset: 0, background: BG, opacity: 0.72 * out3(k), zIndex: 9 }} />
      <Bar g={g} spot={BAR[ratio]} glow={p(t, 0.3, 0.8)} />
      <div dir="rtl" className="type" style={{ position: "absolute", left: L.it.x, top: L.it.y, transform: `translate(-50%, -50%) scale(${lerp(1.25, 1, out3(k))})`, fontSize: L.it.size, zIndex: 10, whiteSpace: "nowrap" }}>זהו.</div>
    </Shell>
  );
}

// ── 3. The bar: "רגע… נשארו עוד 19 שניות?" ───────────────────────────────────

type BarL = { big: BarSpot; wait: { x: number; y: number; size: number }; left: { x: number; y: number; size: number }; phone: Pose; out: Pose; clock: [number, number, number] };
const BARS: Layout<BarL> = {
  "9x16": {
    big: { x0: 100, x1: 980, y: 860, h: 64 }, wait: { x: 540, y: 470, size: 150 }, left: { x: 540, y: 640, size: 84 },
    phone: { x: 600, y: 1560, s: 0.9, rx: 36, ry: 10, rz: -12 }, out: { x: 300, y: 2300, s: 1.1, rx: 10, ry: 0, rz: 14 }, clock: [980, 960, 44],
  },
  "1x1": {
    big: { x0: 90, x1: 990, y: 560, h: 54 }, wait: { x: 540, y: 220, size: 130 }, left: { x: 540, y: 380, size: 72 },
    phone: { x: 580, y: 1010, s: 0.62, rx: 36, ry: 8, rz: -12 }, out: { x: 330, y: 1500, s: 0.8, rx: 10, rz: 14 }, clock: [990, 650, 38],
  },
  "16x9": {
    big: { x0: 160, x1: 1760, y: 560, h: 60 }, wait: { x: 960, y: 250, size: 140 }, left: { x: 960, y: 400, size: 80 },
    phone: { x: 1000, y: 1020, s: 0.7, rx: 40, ry: 6, rz: -10 }, out: { x: 1500, y: 1500, s: 0.9, rx: 10, rz: -14 }, clock: [1760, 650, 40],
  },
};

function BarScene({ ratio }: AdProps) {
  const { t, g } = useClock("bar");
  const L = BARS[ratio], top = BAR[ratio], S = SWIPE[ratio];
  const rush = out5(p(t, 0, 0.5)), back = inOut(p(t, 2.45, 2.9));
  const m = rush * (1 - back);
  const spot: BarSpot = { x0: lerp(top.x0, L.big.x0, m), x1: lerp(top.x1, L.big.x1, m), y: lerp(top.y, L.big.y, m), h: lerp(top.h, L.big.h, m) };
  const fall = out3(p(t, 0, 0.7));
  const start = swipePose(S, SWIPE_END);
  const pose = t < 2.45 ? mix(start, L.phone, fall) : mix(L.phone, L.out, in3(p(t, 2.45, 2.9)));
  const left = Math.max(0, Math.round(HIT - g));
  return (
    <Shell bg="#FFFFFF">
      <Glow x={L.phone.x} y={L.phone.y} r={600} o={0.22 * fall} />
      <Phone pose={{ ...pose, y: pose.y + 8 * Math.sin(t * 2) }} html={phone(deck(9, [SWIPE_AT], 0))} />
      <Bar g={g} spot={spot} glow={m * 0.6} />
      <div dir="ltr" className="type" style={{ position: "absolute", left: L.clock[0], top: L.clock[1], transform: "translate(-100%, -50%)", fontSize: L.clock[2], fontWeight: 700, color: "rgba(23,25,35,.5)", opacity: p(t, 0.3, 0.6) * (1 - back), fontVariantNumeric: "tabular-nums", zIndex: 21 }}>-0:{String(left).padStart(2, "0")}</div>
      <Rise {...L.wait} t={t} from={0.04} until={2.75}>רגע…</Rise>
      <Rise {...L.left} t={t} from={0.46} until={2.75} weight={800}>נשארו עוד 19 שניות?</Rise>
    </Shell>
  );
}

// ── 4. What the swipe sent ───────────────────────────────────────────────────

/** Each word leaves the card as it's said (gen/timeline.json): שם 7.12, אימייל 7.56, טלפון 8.28, קורות חיים 8.88. */
const SENT_WORDS: [string, number][] = [["שם", 7.12 - 6.0], ["אימייל", 7.56 - 6.0], ["טלפון", 8.28 - 6.0], ["קורות חיים", 8.88 - 6.0]];
/** The swipe again, as the phone lands, slow enough to see; the words leave the card as it flies. */
const SENT_SWIPE: Swipe[] = [[0.42, 1, 0.5, 0.2]];

type SentL = { path: Pose[]; words: { x: number; y: number }[]; size: number; anchor: Anchor; glow: [number, number] };
const SENT: Layout<SentL> = {
  "9x16": {
    path: [{ x: 1000, y: 2150, s: 0.9, rx: 10, ry: -20, rz: 22 }, { x: 340, y: 1380, s: 1.04, rx: 4, ry: 12, rz: -7 }, { x: 310, y: 1360, s: 1.08, rx: 2, ry: 16, rz: -9 }],
    words: [{ x: 960, y: 330 }, { x: 960, y: 470 }, { x: 960, y: 610 }, { x: 960, y: 750 }], size: 116, anchor: "right", glow: [700, 700],
  },
  "1x1": {
    path: [{ x: 1150, y: 1500, s: 0.6, ry: -20, rz: 22 }, { x: 250, y: 660, s: 0.64, ry: 14, rz: -7 }, { x: 230, y: 650, s: 0.66, ry: 18, rz: -9 }],
    words: [{ x: 1000, y: 220 }, { x: 1000, y: 380 }, { x: 1000, y: 540 }, { x: 1000, y: 700 }], size: 104, anchor: "right", glow: [800, 500],
  },
  "16x9": {
    path: [{ x: 1950, y: 1500, s: 0.75, ry: -20, rz: 18 }, { x: 960, y: 790, s: 0.86, rx: 14, rz: -4 }, { x: 940, y: 780, s: 0.88, rx: 16, rz: -5 }],
    words: [{ x: 1640, y: 250 }, { x: 1230, y: 250 }, { x: 820, y: 250 }, { x: 340, y: 250 }], size: 112, anchor: "center", glow: [960, 400],
  },
};

function Sent({ ratio }: AdProps) {
  const { t, g } = useClock("sent");
  const L = SENT[ratio];
  const pose = t < 1.0 ? mix(L.path[0], L.path[1], out3(p(t, 0, 1.0))) : mix(L.path[1], L.path[2], inOut(p(t, 1.0, 4.1)));
  const exit = in3(p(t, 3.8, 4.1));
  return (
    <Shell bg={`linear-gradient(160deg, #EFEEFD, ${BG} 55%)`}>
      <Glow x={L.glow[0] - 60 * t} y={L.glow[1]} r={620} o={0.3} />
      <Glow x={pose.x} y={pose.y} r={560} o={0.5 * flash(t, SENT_SWIPE[0])} color="#4ADE80" />
      <Bar g={g} spot={BAR[ratio]} />
      <Phone pose={swipeLean({ ...pose, s: pose.s * lerp(1, 1.12, exit), rz: (pose.rz ?? 0) + 30 * exit }, t, SENT_SWIPE[0])} html={phone(deck(t, SENT_SWIPE, 2))} />
      <SwipeCue pose={swipeLean(pose, t, SENT_SWIPE[0])} t={t} swipe={SENT_SWIPE[0]} size={CUE[ratio]} />
      {SENT_WORDS.map(([w, at], i) => {
        if (t < at) return null;
        const k = out3(p(t, at, at + 0.5)), pop = outBack(p(t, at, at + 0.5));
        const target = L.words[i];
        const drift = (t - at) * (10 + 6 * i);
        const ox = lerp(pose.x, target.x, k), oy = lerp(pose.y - 120, target.y, k);
        const o = 1 - p(t, 3.85, 4.05);
        return (
          <div key={w} dir="rtl" className="type" style={{ position: "absolute", left: ox - drift, top: oy, transform: `translate(${shift[L.anchor]}, -50%) scale(${lerp(0.2, 1, pop)})`, transformOrigin: L.anchor === "right" ? "right center" : "center", fontSize: L.size, color: i === 3 ? PURPLE : INK, whiteSpace: "nowrap", opacity: Math.min(1, k * 3) * o, zIndex: 12 }}>
            {w}
          </div>
        );
      })}
    </Shell>
  );
}

// ── 5. The resume, once: the phone flat on a table ──────────────────────────

type OnceL = { pose: Pose; turn: [number, number]; q: { x: number; y: number; size: number; anchor: Anchor }; once: { x: number; y: number; size: number; anchor: Anchor } };
const ONCE: Layout<OnceL> = {
  "9x16": { pose: { x: 540, y: 1160, s: 1.0 }, turn: [-38, 52], q: { x: 540, y: 340, size: 96, anchor: "center" }, once: { x: 540, y: 500, size: 170, anchor: "center" } },
  "1x1": { pose: { x: 620, y: 650, s: 0.66 }, turn: [-38, 52], q: { x: 1000, y: 150, size: 80, anchor: "right" }, once: { x: 1000, y: 280, size: 130, anchor: "right" } },
  "16x9": { pose: { x: 1400, y: 560, s: 0.8 }, turn: [-38, 52], q: { x: 520, y: 400, size: 110, anchor: "center" }, once: { x: 520, y: 590, size: 180, anchor: "center" } },
};

function Once({ ratio }: AdProps) {
  const { t, g } = useClock("once");
  const L = ONCE[ratio];
  const rz = lerp(L.turn[0], L.turn[1], inOut(p(t, 0, 4.13)));
  const s = L.pose.s * lerp(0.9, 1.02, out3(p(t, 0, 4.13)));
  const html = t < 2.7 ? phone(onboarding(t), { showNav: false }) : phone(deck(t - 2.7, [], 3));
  const enter = out5(p(t, 0, 0.5));
  return (
    <Shell bg="#FFFFFF">
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 40%, #FFFFFF 30%, #ECEDF3 100%)" }} />
      <Bar g={g} spot={BAR[ratio]} />
      <Phone pose={{ x: L.pose.x, y: L.pose.y + lerp(220, 0, enter), s, rz }} html={html} flat />
      <Rise {...L.q} t={t} from={0.06} until={4.0} weight={800} color="rgba(23,25,35,.6)">קו״ח?</Rise>
      <Rise {...L.once} t={t} from={0.42} until={4.0} color={PURPLE}>פעם אחת.</Rise>
    </Shell>
  );
}

// ── 6. Ask about the job: low angle, into the dock ───────────────────────────

type ChatL = { pose: Pose; push: number; a: { x: number; y: number; size: number; anchor: Anchor }; b: { x: number; y: number; size: number; anchor: Anchor } };
const CHAT: Layout<ChatL> = {
  "9x16": { pose: { x: 540, y: 1360, s: 1.5, rx: 20, rz: -2 }, push: 1.14, a: { x: 540, y: 330, size: 116, anchor: "center" }, b: { x: 540, y: 470, size: 86, anchor: "center" } },
  "1x1": { pose: { x: 265, y: 640, s: 0.72, rx: 20, ry: 10, rz: -3 }, push: 1.12, a: { x: 1010, y: 380, size: 100, anchor: "right" }, b: { x: 1010, y: 510, size: 64, anchor: "right" } },
  "16x9": { pose: { x: 640, y: 590, s: 0.92, rx: 20, ry: 14, rz: -3 }, push: 1.14, a: { x: 1790, y: 430, size: 130, anchor: "right" }, b: { x: 1790, y: 590, size: 96, anchor: "right" } },
};

function Chat({ ratio }: AdProps) {
  const { t, g } = useClock("chat");
  const L = CHAT[ratio];
  const enter = out5(p(t, 0, 0.6));
  const s = L.pose.s * lerp(0.92, L.push, out3(p(t, 0, 3.1)));
  return (
    <Shell bg={`linear-gradient(180deg, ${BG}, #E4E2FB)`}>
      <Glow x={L.pose.x} y={L.pose.y + 300} r={700} o={0.35} />
      <Bar g={g} spot={BAR[ratio]} />
      <Phone pose={{ ...L.pose, x: L.pose.x + lerp(-160, 0, enter), rx: lerp(34, L.pose.rx ?? 0, enter), s }} origin="50% 85%" html={phone(chatScreen(t))} />
      <Rise {...L.a} t={t} from={0.0} until={3.0}>לא בטוחים?</Rise>
      <Rise {...L.b} t={t} from={0.3} until={3.0} weight={800} color={PURPLE}>שואלים על המשרה</Rise>
    </Shell>
  );
}

// ── 7. A resume for this job: the phone flips ────────────────────────────────

type TailorL = { pose: Pose; lines: { x: number; y: number; size: number; anchor: Anchor; text: string; color?: string; weight?: number }[]; out: Pose };
const TAILOR: Layout<TailorL> = {
  "9x16": {
    pose: { x: 540, y: 830, s: 1.05, ry: -8, rz: -2 }, out: { x: 540, y: 960, s: 0.92 },
    lines: [{ x: 510, y: 1400, size: 72, anchor: "center", text: "בונוס:", color: PURPLE, weight: 800 }, { x: 510, y: 1520, size: 86, anchor: "center", text: "קו״ח מותאמים למשרה" }],
  },
  "1x1": {
    pose: { x: 790, y: 590, s: 0.76, ry: -10, rz: 2 }, out: { x: 540, y: 560, s: 0.6 },
    lines: [{ x: 335, y: 390, size: 66, anchor: "center", text: "בונוס:", color: PURPLE, weight: 800 }, { x: 335, y: 500, size: 76, anchor: "center", text: "קו״ח מותאמים" }, { x: 335, y: 600, size: 76, anchor: "center", text: "למשרה" }],
  },
  "16x9": {
    pose: { x: 960, y: 650, s: 0.82, ry: -8, rz: 1 }, out: { x: 960, y: 560, s: 0.92 },
    lines: [{ x: 960, y: 165, size: 92, anchor: "center", text: "בונוס: קו״ח מותאמים למשרה" }],
  },
};

const tailorPose = (L: TailorL, t: number): Pose => {
  const flip = inOut(p(t, 0, 0.75));
  return { ...L.pose, ry: lerp(-180, L.pose.ry ?? 0, flip) + 3 * Math.sin(t * 1.2), s: L.pose.s * lerp(0.86, 1, out3(p(t, 0, 0.9))), x: L.pose.x + lerp(120, 0, flip) };
};

function Tailor({ ratio }: AdProps) {
  const { t, g } = useClock("tailor");
  const L = TAILOR[ratio];
  const rise = out3(p(t, 0.55, 0.95));
  const html = phone(deck(9, [], 1), { modal: sheet(rise, tailoredSheet(t), "96px"), scrim: rise });
  return (
    <Shell bg={BG}>
      <div style={{ position: "absolute", left: L.pose.x, top: L.pose.y, width: 1400, height: 1400, transform: `translate(-50%, -50%) scale(${lerp(0.3, 1, out3(p(t, 0, 1.2)))})`, borderRadius: "50%", background: "radial-gradient(circle, rgba(101,94,228,.16), rgba(101,94,228,0) 65%)" }} />
      <Bar g={g} spot={BAR[ratio]} />
      <Phone pose={tailorPose(L, t)} html={html} />
      {L.lines.map((l, i) => (
        <div key={i} style={{ position: "absolute", inset: 0, transform: `translateX(${lerp(-90, 0, out5(p(t, 0.2 + i * 0.12, 0.9 + i * 0.12)))}px)`, zIndex: 10 }}>
          <Rise x={l.x} y={l.y} size={l.size} anchor={l.anchor} t={t} from={0.2 + i * 0.12} until={3.6} color={l.color} weight={l.weight}>{l.text}</Rise>
        </div>
      ))}
    </Shell>
  );
}

// ── 8. End card ──────────────────────────────────────────────────────────────

type EndL = { phone: Pose; banner: [number, number, number]; stores: [number, number, number]; column?: boolean };
const END: Layout<EndL> = {
  // The banner is white lettering with a thin outline, made for colour: it goes straight on the purple, big, and leads.
  "9x16": { phone: { x: 540, y: 1090, s: 0.7, ry: -6, rz: 2 }, banner: [530, 470, 290], stores: [510, 1530, 1.0] },
  "1x1": { phone: { x: 540, y: 650, s: 0.47, ry: -6, rz: 2 }, banner: [540, 215, 210], stores: [540, 965, 0.8] },
  "16x9": { phone: { x: 1390, y: 560, s: 0.9, ry: -8, rz: 3 }, banner: [520, 420, 260], stores: [520, 760, 0.86] },
};

function Stores({ x, y, s, column, o, lift }: { x: number; y: number; s: number; column?: boolean; o: number; lift: number }) {
  return (
    <div dir="ltr" style={{ position: "absolute", left: x, top: y + lift, transform: `translate(-50%, -50%) scale(${s})`, display: "flex", flexDirection: column ? "column" : "row", gap: 22, opacity: o, zIndex: 8 }}>
      {([["play", "Google Play"], ["apple", "App Store"]] as const).map(([glyph, name]) => (
        <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 16, background: INK, color: "#fff", padding: "20px 34px", borderRadius: 18, fontSize: 40, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 14px 34px rgba(23,25,35,.35)" }}>
          <span style={{ display: "flex" }} dangerouslySetInnerHTML={{ __html: icon(glyph, 44, "#fff") }} />{name}
        </span>
      ))}
    </div>
  );
}

function End({ ratio }: AdProps) {
  const { t, g } = useClock("end");
  const L = END[ratio], T = TAILOR[ratio];
  const from = tailorPose(T, LEN.tailor / FPS);
  const land = out5(p(t, 0, 0.8));
  const pose = mix(from, L.phone, land);
  const wipe = out3(p(t, 0, 0.55));
  const appear = (a: number) => [p(t, a, a + 0.35), lerp(40, 0, out3(p(t, a, a + 0.5)))] as const;
  const [bo, bl] = appear(0.25), [so, sl] = appear(0.5);
  return (
    <Shell bg={BG}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 50% 45%, #7A72F0, ${PURPLE} 55%, ${DARK})`, clipPath: `circle(${wipe * 160}% at ${from.x}px ${from.y}px)` }} />
      <Bar g={g} spot={BAR[ratio]} light />
      <Phone pose={{ ...pose, y: pose.y + 6 * Math.sin(t * 1.3) }} html={phone(feed(4, 0, 0))} />
      <div style={{ position: "absolute", left: L.banner[0], top: L.banner[1], width: L.banner[2] * 3.4, height: L.banner[2] * 1.9, transform: "translate(-50%, -50%)", borderRadius: "50%", background: "radial-gradient(ellipse, rgba(255,255,255,.22), rgba(255,255,255,0) 65%)", opacity: bo, zIndex: 7 }} />
      <div style={{ position: "absolute", left: L.banner[0], top: L.banner[1] + bl, transform: `translate(-50%, -50%) scale(${lerp(0.7, 1, outBack(p(t, 0.2, 0.75)))})`, opacity: bo, zIndex: 8, display: "flex", filter: "drop-shadow(0 12px 28px rgba(23,25,35,.35))" }}>
        <img src={banner} alt="Gomlin logo" aria-label="logo" style={{ height: L.banner[2] }} />
      </div>
      <Stores x={L.stores[0]} y={L.stores[1]} s={L.stores[2]} column={L.column} o={so} lift={sl} />
    </Shell>
  );
}

// ── the cover ────────────────────────────────────────────────────────────────

type ThumbL = { phone: Pose; a: { x: number; y: number; size: number }; b: { x: number; y: number; size: number }; banner: [number, number, number] };
/** On the end card's purple, so the logo goes on the colour as big as it is there (END's banner heights). */
const THUMB: Layout<ThumbL> = {
  "9x16": { phone: { x: 560, y: 1470, s: 1.0, rx: 6, ry: -10, rz: 4 }, a: { x: 530, y: 700, size: 150 }, b: { x: 530, y: 870, size: 176 }, banner: [530, 390, 290] },
  "1x1": { phone: { x: 830, y: 640, s: 0.72, rx: 6, ry: -12, rz: 5 }, a: { x: 315, y: 560, size: 96 }, b: { x: 315, y: 690, size: 104 }, banner: [315, 300, 210] },
  "16x9": { phone: { x: 1430, y: 600, s: 0.98, rx: 6, ry: -14, rz: 5 }, a: { x: 640, y: 600, size: 140 }, b: { x: 640, y: 770, size: 160 }, banner: [640, 300, 260] },
};

export function Thumb({ ratio }: AdProps) {
  const L = THUMB[ratio];
  return (
    <Shell bg={`radial-gradient(circle at 50% 40%, #7A72F0, ${PURPLE} 55%, ${DARK})`}>
      <Glow x={L.banner[0]} y={L.banner[1]} r={L.banner[2] * 1.8} o={0.35} color="rgba(255,255,255,.5)" />
      <Phone pose={L.phone} html={phone(deck(1.2, [SWIPE_AT], 0))} />
      <div style={{ position: "absolute", left: L.banner[0], top: L.banner[1], transform: "translate(-50%, -50%)", zIndex: 8, display: "flex", filter: "drop-shadow(0 12px 28px rgba(23,25,35,.35))" }}>
        <img src={banner} alt="Gomlin logo" aria-label="logo" style={{ height: L.banner[2] }} />
      </div>
      <Rise {...L.a} t={9} from={0} color="#fff">מדריך של</Rise>
      <Rise {...L.b} t={9} from={0} color="#F0D08A">שנייה אחת</Rise>
    </Shell>
  );
}

export const scenes: Scene[] = [
  { id: "title", name: "The tutorial", component: Title, frames: LEN.title },
  { id: "swipe", name: "The swipe", component: SwipeScene, frames: LEN.swipe },
  { id: "freeze", name: "זהו.", component: Freeze, frames: LEN.freeze },
  { id: "bar", name: "19 seconds left", component: BarScene, frames: LEN.bar },
  { id: "sent", name: "What the swipe sent", component: Sent, frames: LEN.sent },
  { id: "once", name: "Resume, once", component: Once, frames: LEN.once },
  { id: "chat", name: "Ask about the job", component: Chat, frames: LEN.chat },
  { id: "tailor", name: "Tailored resume", component: Tailor, frames: LEN.tailor },
  { id: "end", name: "End card", component: End, frames: LEN.end },
];

export const ratios: Ratio[] = ["16x9", "1x1", "9x16"];
