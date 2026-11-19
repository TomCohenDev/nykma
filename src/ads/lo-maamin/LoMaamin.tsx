import type { ReactNode } from "react";
import { Footage, ScreenInsert, asset, useFrame, useVideo, type AdProps, type Cue, type Layout, type Ratio, type Scene } from "../../engine";
import shoulderWide from "./shoulder.screen.json";
import shoulderTall from "./shoulder-tall.screen.json";
import { clamp, lerp } from "../../parts/time";
import { ICONS, JOBS, SHOT_H, SHOT_W, banner, bare, feed, icon, phone, streak, touch } from "./app";

/**
 * "לא מאמין". She looks up from her laptop at the guy on the couch and can't believe it: he's job hunting by flicking
 * right and left. Her view of his phone shows the real Gomlin feed under his thumb, the phone lifts out into the app 1:1,
 * and she closes her laptop. The people are generated (public/ads/lo-maamin/gen.json); his phone's green screen gets the
 * app in code. Until the clips are made, each shot is its still with a push-in done here. Music only (ElevenLabs).
 */
export const SLUG = "lo-maamin";
export const cues: Cue[] = [{ src: `ads/${SLUG}/gen/mix.wav` }];

const FPS = 30;
const PURPLE = "#655EE4", INK = "#171923", BG = "#F4F5F9", GREEN = "#16A34A", RED = "#EF4444";
const FOOTNOTE = "הגשה בהחלקה במשרות המסומנות ״החלקה להגשה פעילה״";

const p = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const out3 = (x: number) => 1 - (1 - x) ** 3;
const in3 = (x: number) => x ** 3;
const inOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const outBack = (x: number) => 1 + 2.2 * (x - 1) ** 3 + 1.2 * (x - 1) ** 2;

// ── the stills ───────────────────────────────────────────────────────────────

type Plate = { file: string; w: number; h: number; quad?: [number, number, number, number] };
/** Green screens measured from the stills (x0, y0, x1, y1 in still pixels). */
const STILLS = {
  gasp: { file: "generated/gasp-still.png", w: 1672, h: 941 },
  gaspTall: { file: "generated/gasp-tall-still.png", w: 941, h: 1672 },
  chill: { file: "generated/chill-still.png", w: 1672, h: 941 },
  chillTall: { file: "generated/chill-tall-still.png", w: 941, h: 1672 },
  shoulder: { file: "generated/shoulder-still.png", w: 1672, h: 941, quad: [727, 147, 936, 640] },
  shoulderTall: { file: "generated/shoulder-tall-still.png", w: 941, h: 1672, quad: [333, 369, 608, 988] },
  laptop: { file: "generated/laptop-still.png", w: 1672, h: 941 },
  laptopTall: { file: "generated/laptop-tall-still.png", w: 941, h: 1672 },
} satisfies Record<string, Plate>;

const pick = (r: Ratio, wide: Plate, tall: Plate) => (r === "9x16" ? tall : wide);

/** The clips made on this PC from those stills (gen.json), unpacked by bun run gen. A shot without one uses its still. */
type Clip = { src: string; fps: number; frames: number; w: number; h: number; speed: number; from: number };
const clip = (id: string, frames: number, w = 1280, h = 704, speed = 1, from = 0): Clip => ({ src: `ads/${SLUG}/gen/footage/${id}/#####.jpg`, fps: 24, frames, w, h, speed, from });
const CLIPS: Partial<Record<string, Clip>> = {
  gasp: clip("gasp", 97),
  // the tall takes go wrong late (a logo on her hoodie, a third hand by his face), so only their start is used, slowed
  "gasp-tall": clip("gasp-tall", 97, 704, 1280, 0.8),
  "chill-tall": clip("chill-tall", 97, 704, 1280, 0.67),
  "laptop-tall": clip("laptop-tall", 97, 704, 1280, 1.1, 0.6),
  chill: clip("chill-2", 97), // the retake: the first take lost his phone after 0.8 s
  laptop: clip("laptop", 97, 1280, 704, 0.7, 0.3), // a blurred head drifts in from the left after 2.4 s
};
const clipFor = (r: Ratio, wide: string, tall: string) => CLIPS[r === "9x16" ? tall : wide];

/** <Footage> focus that keeps clip point (cx, cy) in the middle of the frame at this zoom, as far as the clip allows. */
function centre(W: number, H: number, c: { w: number; h: number }, cx: number, cy: number, zoom: number): [number, number] {
  const k = Math.max(W / c.w, H / c.h) * zoom;
  const fx = W - c.w * k, fy = H - c.h * k;
  return [Math.abs(fx) < 0.5 ? 0.5 : clamp((W / 2 - cx * k) / fx, 0, 1), Math.abs(fy) < 0.5 ? 0.5 : clamp((H / 2 - cy * k) / fy, 0, 1)];
}

/** Where a still point lands on screen, for a still covering the frame with (cx, cy) centred and z on top of cover. */
function still(p: Plate, W: number, H: number, cx: number, cy: number, z: number) {
  const k = Math.max(W / p.w, H / p.h) * z;
  const x = clamp(W / 2 - cx * k, W - p.w * k, 0);
  const y = clamp(H / 2 - cy * k, H - p.h * k, 0);
  return { k, x, y, at: (px: number, py: number) => [x + px * k, y + py * k] as const };
}

function Still({ p, cx, cy, z, children, blur = 0 }: { p: Plate; cx: number; cy: number; z: number; children?: ReactNode; blur?: number }) {
  const { width: W, height: H } = useVideo();
  const { k, x, y } = still(p, W, H, cx, cy, z);
  const q = p.quad;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: p.w, height: p.h, transformOrigin: "0 0", transform: `translate(${x}px, ${y}px) scale(${k})`, filter: blur ? `blur(${blur}px)` : undefined }}>
      <img src={asset(`ads/${SLUG}/${p.file}`)} alt="" style={{ position: "absolute", left: 0, top: 0, width: p.w, height: p.h }} />
      {q && <div style={{ position: "absolute", left: q[0], top: q[1], width: q[2] - q[0], height: q[3] - q[1], overflow: "hidden", borderRadius: 13 }}>{children}</div>}
    </div>
  );
}

// ── type ─────────────────────────────────────────────────────────────────────

const CSS = `
@font-face{font-family:"Noto Sans Hebrew";src:url("${asset(`ads/${SLUG}/NotoSansHebrew-wdth-wght.ttf`)}");font-weight:100 900}
@font-face{font-family:"Noto Sans";src:url("${asset(`ads/${SLUG}/NotoSans-wdth-wght.ttf`)}");font-weight:100 900}
.gomlin{position:absolute;inset:0;overflow:hidden;background:${BG};color:${INK};font-family:"Noto Sans","Noto Sans Hebrew",Arial,sans-serif;line-height:1.3}
.gomlin *{box-sizing:border-box}
.dock-small{width:46px;height:46px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;border:.5px solid rgba(101,94,228,.5)}
.dock-large{width:58px;height:58px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;border:1px solid rgba(23,25,35,.51);box-shadow:0 4px 15px rgba(0,0,0,.18);transform-origin:bottom center}
`;

function Shell({ children, bg = "#2a2420" }: { children: ReactNode; bg?: string }) {
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

const SHADOW = "0 2px 4px rgba(0,0,0,.35), 0 6px 30px rgba(0,0,0,.55)";

/** A line that rises out of a mask, holds, and fades out at `until`. (x, y) is its anchor; ax -50 centres it. */
function Line({ x, y, ax = 0, t, from, until, size, color = "#fff", weight = 900, shadow = SHADOW, children, width }: {
  x: number; y: number; ax?: number; t: number; from: number; until: number; size: number; color?: string; weight?: number; shadow?: string; children: ReactNode; width?: number;
}) {
  if (t < from - 0.05 || t > until) return null;
  const m = out3(p(t, from, from + 0.45)), o = 1 - p(t, until - 0.2, until);
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(${ax}%, -50%)`, overflow: "hidden", padding: "14px 20px", margin: "0 -20px", opacity: o, width, zIndex: 6 }}>
      <div dir="rtl" style={{ transform: `translateY(${lerp(115, 0, m)}%)`, fontSize: size, fontWeight: weight, color, lineHeight: 1.12, textShadow: shadow, whiteSpace: width ? "normal" : "nowrap", textAlign: ax === -50 ? "center" : "right" }}>{children}</div>
    </div>
  );
}

/** The small line about where swipe apply works, from the laptop beat to the end. */
function Footnote({ x, y, size, o, onPhoto = false }: { x?: number; y: number; size: number; o: number; onPhoto?: boolean }) {
  const { width, ratio } = useVideo();
  const tall = ratio === "9x16";
  return (
    <div dir="rtl" style={{
      position: "absolute", left: x ?? width / 2, top: y, transform: "translate(-50%, -50%)", whiteSpace: "nowrap", textAlign: "center",
      fontSize: size, fontWeight: 600, lineHeight: 1.3, color: onPhoto ? "#fff" : "#4A4E5E", opacity: o, zIndex: 7,
      background: onPhoto ? "rgba(23,25,35,.62)" : "none", padding: onPhoto ? "8px 22px" : 0, borderRadius: 18,
    }}>{tall ? <>הגשה בהחלקה במשרות המסומנות<br />״החלקה להגשה פעילה״</> : FOOTNOTE}</div>
  );
}

// ── the app ──────────────────────────────────────────────────────────────────

/** Cards swiped in order: [when, 1 right or -1 left]. The drag is the app's: 0.33 s of drag, then the fling. */
function deck(a: number, swipes: [number, 1 | -1][], first = 0, over = "") {
  const done = swipes.filter(([at]) => a >= at + 0.5);
  const now = swipes.find(([at]) => a >= at && a < at + 0.5);
  const index = first + done.length;
  const job = (i: number) => i % JOBS.length;
  let dx = 0;
  if (now) {
    const b = a - now[0];
    dx = now[1] * (b < 0.33 ? 100 * inOut(b / 0.33) : 100 + 620 * in3((b - 0.33) / 0.17));
  }
  const lastRight = [...done].reverse().find(([, dir]) => dir === 1);
  return feed(job(index), job(index + 1), dx, {
    applied: !!lastRight && a < lastRight[0] + 1.5,
    finger: now && a - now[0] < 0.33 ? touch(195 + dx, 330, 1, 1) : "",
    over,
  });
}

// ── 1. The gasp ──────────────────────────────────────────────────────────────

type Cap = { x: number; y: number; ax: number; size: number; width?: number };
type GaspL = { cx: number; cy: number; cap: Cap; clip: [number, number] };
const GASP: Layout<GaspL> = {
  "16x9": { cx: 1150, cy: 400, cap: { x: 130, y: 470, ax: 0, size: 104, width: 760 }, clip: [800, 300] },
  "1x1": { cx: 1180, cy: 420, cap: { x: 50, y: 330, ax: 0, size: 64, width: 500 }, clip: [800, 300] },
  "9x16": { cx: 470, cy: 850, cap: { x: 540, y: 420, ax: -50, size: 92, width: 900 }, clip: [352, 430] },
};

function Gasp({ ratio }: AdProps) {
  const f = useFrame(), t = f / FPS;
  const g = GASP[ratio];
  const { width, height } = useVideo();
  const c = clipFor(ratio, "gasp", "gasp-tall");
  const z = 1.0 + 0.09 * out3(p(t, 0, 3));
  const side = ratio === "9x16" ? "linear-gradient(180deg, rgba(0,0,0,.5), rgba(0,0,0,0) 40%)" : ratio === "1x1" ? "linear-gradient(90deg, rgba(0,0,0,.62), rgba(0,0,0,0) 58%)" : "linear-gradient(90deg, rgba(0,0,0,.66), rgba(0,0,0,0) 58%)";
  return (
    <Shell>
      {c ? <Footage src={c.src} fps={c.fps} frames={c.frames} speed={c.speed} from={c.from} focus={centre(width, height, c, g.clip[0], g.clip[1], z)} zoom={z} /> : <Still p={pick(ratio, STILLS.gasp, STILLS.gaspTall)} cx={g.cx} cy={g.cy} z={z} />}
      <div style={{ position: "absolute", inset: 0, background: side, opacity: p(t, 0.3, 0.8) }} />
      <Line {...g.cap} t={t} from={0.5} until={3.1}>
        <span style={{ display: "block" }}>רגע.</span>
        <span style={{ display: "block" }}>ככה אתה מחפש עבודה?!</span>
      </Line>
    </Shell>
  );
}

// ── 2. Him ───────────────────────────────────────────────────────────────────

const CHILL: Layout<{ cx: number; cy: number; z: [number, number] }> = {
  "16x9": { cx: 760, cy: 420, z: [1.04, 1.16] },
  "1x1": { cx: 560, cy: 420, z: [1.0, 1.1] },
  "9x16": { cx: 470, cy: 760, z: [1.02, 1.12] },
};

function Chill({ ratio }: AdProps) {
  const t = useFrame() / FPS;
  const g = CHILL[ratio];
  const { width, height } = useVideo();
  const c = clipFor(ratio, "chill", "chill-tall");
  const z = lerp(g.z[0], g.z[1], inOut(p(t, 0, 3)));
  return (
    <Shell>
      {c ? <Footage src={c.src} fps={c.fps} frames={c.frames} speed={c.speed} from={c.from} focus={centre(width, height, c, ratio === "9x16" ? 352 : 400, ratio === "9x16" ? 420 : 300, z)} zoom={z} /> : <Still p={pick(ratio, STILLS.chill, STILLS.chillTall)} cx={g.cx} cy={g.cy} z={z} />}
    </Shell>
  );
}

// ── 3. Over his shoulder: the real feed under his thumb ──────────────────────

/** Swipes on the beat (112 BPM, from gen/timeline.json): the flings land on 6.46, 7.53, 8.06 and 8.60 s of the ad. */
const SWIPES: [number, 1 | -1][] = [[0.125, 1], [1.195, 1], [1.73, -1], [2.265, 1]];
const PUSH = 3.25; // into the screen, to the cut

type ShoulderL = { cx: number; cy: number; words: { right: [number, number]; left: [number, number]; size: number } };
const SHOULDER: Layout<ShoulderL> = {
  "16x9": { cx: 830, cy: 420, words: { right: [1450, 470], left: [420, 470], size: 120 } },
  "1x1": { cx: 830, cy: 420, words: { right: [890, 300], left: [190, 300], size: 84 } },
  "9x16": { cx: 470, cy: 760, words: { right: [760, 1330], left: [320, 1330], size: 96 } },
};

function Shoulder({ ratio }: AdProps) {
  const t = useFrame() / FPS;
  const g = SHOULDER[ratio];
  const pl = pick(ratio, STILLS.shoulder, STILLS.shoulderTall);
  const q = pl.quad!;
  const sw = q[2] - q[0], sh = q[3] - q[1];
  const appH = Math.round((SHOT_W * sh) / sw);
  // a slow push, then into the screen for the cut
  const push = in3(p(t, PUSH, 4));
  const qx = (q[0] + q[2]) / 2, qy = (q[1] + q[3]) / 2;
  const cx = lerp(g.cx, qx, inOut(p(t, PUSH - 0.2, 4))), cy = lerp(g.cy, qy, inOut(p(t, PUSH - 0.2, 4)));
  const z = lerp(1.02, 1.1, inOut(p(t, 0, PUSH))) * lerp(1, 2.6, push);
  const html = bare(deck(t, SWIPES, 0), { h: appH });
  const shoulderTrack = ratio === "9x16" ? shoulderTall : shoulderWide;
  const { width, height } = useVideo();
  // the phone's middle in the clip, followed, so the push lands on the screen wherever his hand has moved it
  const ci = Math.min(Math.floor(t * shoulderTrack.fps), shoulderTrack.frames - 1);
  const pc = shoulderTrack.corners[ci] as [number, number][];
  const px = pc.reduce((a, [x]) => a + x, 0) / 4, py = pc.reduce((a, [, y]) => a + y, 0) / 4;
  const tz = lerp(1.0, 1.08, inOut(p(t, 0, PUSH))) * lerp(1, 2.8, push);
  const m = inOut(p(t, PUSH - 0.2, 4));
  const tf = centre(width, height, { w: shoulderTrack.width, h: shoulderTrack.height }, lerp(shoulderTrack.width / 2, px, m), lerp(shoulderTrack.height / 2, py, m), tz);
  const [c0, c1, , c3] = shoulderTrack.corners[0] as [number, number][];
  const TRACK_H = Math.round((SHOT_W * Math.hypot(c3[0] - c0[0], c3[1] - c0[1])) / Math.hypot(c1[0] - c0[0], c1[1] - c0[1]));
  const now = [...SWIPES].reverse().find(([at]) => t >= at - 0.05);
  const k = now ? outBack(p(t, now[0] - 0.05, now[0] + 0.25)) : 0;
  const word = now && t < PUSH ? now : null;
  const [wx, wy] = word ? (word[1] === 1 ? g.words.right : g.words.left) : [0, 0];
  return (
    <Shell>
      {shoulderTrack ? (
        <ScreenInsert track={shoulderTrack as never} size={[SHOT_W, TRACK_H]} focus={tf} zoom={tz} screenStyle={{ filter: "brightness(0.96)" }}>
          <div dir="ltr" style={{ position: "absolute", left: 0, top: 0, width: SHOT_W, height: TRACK_H }} dangerouslySetInnerHTML={{ __html: bare(deck(t, SWIPES, 0), { h: TRACK_H }) }} />
        </ScreenInsert>
      ) : (
        <Still p={pl} cx={cx} cy={cy} z={z}>
          <div dir="ltr" style={{ position: "absolute", left: 0, top: 0, width: SHOT_W, height: appH, transformOrigin: "0 0", transform: `scale(${sw / SHOT_W})` }} dangerouslySetInnerHTML={{ __html: html }} />
        </Still>
      )}
      {word && (
        <div dir="rtl" style={{
          position: "absolute", left: wx, top: wy, transform: `translate(-50%, -50%) scale(${k}) rotate(${word[1] * -4}deg)`, padding: "6px 34px 12px", borderRadius: 999,
          background: "#fff", color: word[1] === 1 ? GREEN : RED, fontSize: g.words.size, fontWeight: 900, lineHeight: 1.1, boxShadow: "0 10px 40px rgba(0,0,0,.35)", whiteSpace: "nowrap", zIndex: 6,
        }}>{word[1] === 1 ? "ימינה." : "שמאלה."}</div>
      )}
    </Shell>
  );
}

// ── 4. The app, 1:1 ──────────────────────────────────────────────────────────

const APP_SWIPES: [number, 1 | -1][] = [[0.3, 1], [1.65, -1], [2.45, 1], [4.6, 1]];
const STREAK_AT = 2.95;
const PHONE_MOVE = 3.7;

type Spot = { x: number; y: number; s: number; ry: number; rz: number };
type AppL = { start: Spot; side: Spot; close: Spot; text: Cap & { y2: number; y3: number } };
const APP: Layout<AppL> = {
  "16x9": {
    start: { x: 960, y: 540, s: 1.6, ry: 0, rz: 0 },
    side: { x: 1380, y: 560, s: 1.12, ry: -14, rz: 3 },
    close: { x: 960, y: 760, s: 1.75, ry: 0, rz: -2 },
    text: { x: 140, y: 330, ax: 0, size: 112, y2: 470, y3: 600 },
  },
  "1x1": {
    start: { x: 540, y: 560, s: 1.25, ry: 0, rz: 0 },
    side: { x: 790, y: 600, s: 0.92, ry: -12, rz: 3 },
    close: { x: 540, y: 820, s: 1.5, ry: 0, rz: -2 },
    text: { x: 66, y: 300, ax: 0, size: 70, y2: 390, y3: 480 },
  },
  "9x16": {
    start: { x: 540, y: 1000, s: 1.7, ry: 0, rz: 0 },
    side: { x: 540, y: 1230, s: 1.36, ry: -10, rz: 2 },
    close: { x: 540, y: 1260, s: 1.75, ry: 0, rz: -2 },
    text: { x: 540, y: 320, ax: -50, size: 88, y2: 430, y3: 540 },
  },
};

const mix = (a: Spot, b: Spot, m: number): Spot => ({ x: lerp(a.x, b.x, m), y: lerp(a.y, b.y, m), s: lerp(a.s, b.s, m), ry: lerp(a.ry, b.ry, m), rz: lerp(a.rz, b.rz, m) });

function AppScene({ ratio }: AdProps) {
  const t = useFrame() / FPS;
  const g = APP[ratio];
  const c = t < PHONE_MOVE ? mix(g.start, g.side, inOut(p(t, 0, 0.9))) : mix(g.side, g.close, inOut(p(t, PHONE_MOVE, PHONE_MOVE + 0.8)));
  const bob = Math.sin(t * 1.3) * 6;
  const over = t > STREAK_AT ? streak(lerp(-110, 8, out3(p(t, STREAK_AT, STREAK_AT + 0.35))), lerp(0.4, 0.6, out3(p(t, STREAK_AT + 0.1, STREAK_AT + 0.7))), 4, t > STREAK_AT + 0.15 ? 3 : 2) : "";
  const html = phone(deck(t, APP_SWIPES, 1, over));
  const reveal = out3(p(t, 0, 0.45));
  const tx = g.text, leave = PHONE_MOVE + 0.1;
  const textColor = "#fff", flat = "0 4px 24px rgba(23,25,35,.25)";
  return (
    <Shell bg={PURPLE}>
      <Still p={pick(ratio, STILLS.shoulder, STILLS.shoulderTall)} cx={0} cy={0} z={1} blur={18} />
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 50% 45%, #7A72F0, ${PURPLE} 60%, #544BD0)`, clipPath: `circle(${reveal * 150}% at ${g.start.x}px ${g.start.y}px)` }} />
      <div style={{ position: "absolute", left: c.x, top: c.y + bob, width: SHOT_W + 22, height: SHOT_H + 22, transform: `translate(-50%, -50%) perspective(2400px) rotateY(${c.ry + Math.sin(t * 0.9) * 2}deg) rotateZ(${c.rz}deg) scale(${c.s})`, zIndex: 3 }} dangerouslySetInnerHTML={{ __html: html }} />
      <Line x={tx.x} y={tx.y} ax={tx.ax} t={t} from={0.75} until={leave} size={tx.size} color={textColor} shadow={flat}>ימינה,</Line>
      <Line x={tx.x} y={tx.y2} ax={tx.ax} t={t} from={0.95} until={leave} size={tx.size * 0.72} color={textColor} weight={800} shadow={flat}>וקורות החיים שלך</Line>
      <Line x={tx.x} y={tx.y3} ax={tx.ax} t={t} from={1.15} until={leave} size={tx.size * 0.72} color={textColor} weight={800} shadow={flat}>כבר נשלחו.</Line>
    </Shell>
  );
}

// ── 5. Her laptop ────────────────────────────────────────────────────────────

const LAPTOP: Layout<GaspL & { note: [number, number] }> = {
  "16x9": { cx: 1150, cy: 420, cap: { x: 130, y: 430, ax: 0, size: 96, width: 760 }, note: [1000, 34], clip: [900, 300] },
  "1x1": { cx: 1180, cy: 420, cap: { x: 50, y: 470, ax: 0, size: 64, width: 470 }, note: [1000, 30], clip: [900, 300] },
  "9x16": { cx: 470, cy: 880, cap: { x: 540, y: 400, ax: -50, size: 88, width: 900 }, note: [1520, 40], clip: [352, 430] },
};

function Laptop({ ratio }: AdProps) {
  const t = useFrame() / FPS;
  const g = LAPTOP[ratio];
  const { width, height } = useVideo();
  const c = clipFor(ratio, "laptop", "laptop-tall");
  const z = lerp(1.12, 1.03, out3(p(t, 0, 3)));
  const side = ratio === "9x16" ? "linear-gradient(180deg, rgba(0,0,0,.5), rgba(0,0,0,0) 40%), linear-gradient(0deg, rgba(0,0,0,.45), rgba(0,0,0,0) 25%)" : "linear-gradient(90deg, rgba(0,0,0,.8), rgba(0,0,0,.25) 50%, rgba(0,0,0,0) 62%), linear-gradient(0deg, rgba(0,0,0,.45), rgba(0,0,0,0) 20%)";
  return (
    <Shell>
      {c ? <Footage src={c.src} fps={c.fps} frames={c.frames} speed={c.speed} from={c.from} focus={centre(width, height, c, g.clip[0], g.clip[1], z)} zoom={z} /> : <Still p={pick(ratio, STILLS.laptop, STILLS.laptopTall)} cx={g.cx} cy={g.cy} z={z} />}
      <div style={{ position: "absolute", inset: 0, background: side, opacity: p(t, 0.2, 0.6) }} />
      <Line {...g.cap} t={t} from={0.45} until={3.1}>
        <span style={{ display: "block", fontWeight: 900, fontSize: "0.75em" }}>ואני...</span>
        <span style={{ display: "block" }}>עוד בטופס הראשון.</span>
      </Line>
      <Footnote y={g.note[0]} size={g.note[1]} o={p(t, 0.3, 0.7)} onPhoto />
    </Shell>
  );
}

// ── 6. End card ──────────────────────────────────────────────────────────────

type EndL = { phone: Spot; mid: number; banner: [number, number]; line: [number, number]; stores: [number, number]; note: [number, number] };
const END: Layout<EndL> = {
  "16x9": { phone: { x: 480, y: 600, s: 1.0, ry: 12, rz: -6 }, mid: 1260, banner: [290, 230], line: [570, 76], stores: [810, 0.85], note: [990, 34] },
  "1x1": { phone: { x: 895, y: 660, s: 0.58, ry: -10, rz: 6 }, mid: 400, banner: [240, 170], line: [490, 54], stores: [690, 0.68], note: [990, 30] },
  "9x16": { phone: { x: 540, y: 1560, s: 0.85, ry: 0, rz: 4 }, mid: 540, banner: [360, 230], line: [640, 62], stores: [870, 1], note: [1050, 40] },
};

function End({ ratio }: AdProps) {
  const t = useFrame() / FPS;
  const g = END[ratio];
  const wipe = inOut(p(t, 0, 0.5));
  const rise = out3(p(t, 0.05, 0.75));
  const ph = g.phone;
  const center = (y: number, from: number, children: ReactNode, s = 1) => (
    <div style={{ position: "absolute", left: g.mid, top: y + lerp(30, 0, out3(p(t, from, from + 0.5))), transform: `translate(-50%, -50%) scale(${s})`, opacity: p(t, from, from + 0.35), whiteSpace: "nowrap", zIndex: 4 }}>{children}</div>
  );
  return (
    <Shell bg={BG}>
      <div style={{ position: "absolute", inset: 0, background: PURPLE, clipPath: `circle(${(1 - wipe) * 150}% at 50% 50%)` }} />
      <div style={{ position: "absolute", left: ph.x, top: lerp(ph.y + 900, ph.y, rise) + Math.sin(t * 1.2) * 5, width: SHOT_W + 22, height: SHOT_H + 22, transform: `translate(-50%, -50%) perspective(2400px) rotateY(${ph.ry}deg) rotateZ(${ph.rz}deg) scale(${ph.s})`, zIndex: 3 }}
        dangerouslySetInnerHTML={{ __html: phone(feed(0, 1, 0, { applied: false })) }} />
      {center(g.banner[0], 0.3, <img src={banner} alt="Gomlin logo" aria-label="logo" style={{ height: g.banner[1] }} />, lerp(0.9, 1, out3(p(t, 0.3, 0.9))))}
      {center(g.line[0], 0.6, (
        <div dir="rtl" style={{ fontSize: g.line[1], fontWeight: 900, lineHeight: 1.15, textAlign: "center", color: INK }}>
          <span style={{ display: "block" }}>חיפוש עבודה</span>
          <span style={{ display: "block", color: PURPLE }}>לא אמור להרגיש כמו עבודה.</span>
        </div>
      ))}
      {center(g.stores[0], 0.9, (
        <div dir="ltr" style={{ display: "flex", gap: 22 }}>
          {([["play", "Google Play"], ["apple", "App Store"]] as const).map(([glyph, name]) => (
            <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 16, background: INK, color: "#fff", padding: "20px 34px", borderRadius: 18, fontSize: 40, fontWeight: 700 }}>
              <span style={{ display: "flex" }} dangerouslySetInnerHTML={{ __html: icon(glyph, 44, "#fff") }} />{name}
            </span>
          ))}
        </div>
      ), g.stores[1])}
      <Footnote x={ratio === "16x9" ? g.mid : undefined} y={g.note[0]} size={g.note[1]} o={1} />
    </Shell>
  );
}

// ── the cover ────────────────────────────────────────────────────────────────

type ThumbL = { face: { cx: number; cy: number; z: number }; phone: Spot; words: Cap };
const THUMB: Layout<ThumbL> = {
  "16x9": { face: { cx: 1180, cy: 330, z: 1.25 }, phone: { x: 1690, y: 660, s: 0.92, ry: -14, rz: 6 }, words: { x: 90, y: 300, ax: 0, size: 150, width: 900 } },
  "1x1": { face: { cx: 1260, cy: 330, z: 1.35 }, phone: { x: 880, y: 800, s: 0.66, ry: -12, rz: 6 }, words: { x: 50, y: 210, ax: 0, size: 112, width: 620 } },
  "9x16": { face: { cx: 470, cy: 800, z: 1.15 }, phone: { x: 790, y: 1440, s: 0.8, ry: -10, rz: 6 }, words: { x: 540, y: 560, ax: -50, size: 130, width: 980 } },
};

export function Thumb({ ratio }: AdProps) {
  const g = THUMB[ratio];
  const html = phone(feed(1, 2, 0, { applied: true }));
  return (
    <Shell>
      <Still p={pick(ratio, STILLS.gasp, STILLS.gaspTall)} cx={g.face.cx} cy={g.face.cy} z={g.face.z} />
      <div style={{ position: "absolute", inset: 0, background: ratio === "9x16" ? "linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,0) 45%)" : "linear-gradient(90deg, rgba(0,0,0,.6), rgba(0,0,0,0) 60%)" }} />
      <div style={{ position: "absolute", left: g.phone.x, top: g.phone.y, width: SHOT_W + 22, height: SHOT_H + 22, transform: `translate(-50%, -50%) perspective(2400px) rotateY(${g.phone.ry}deg) rotateZ(${g.phone.rz}deg) scale(${g.phone.s})`, zIndex: 3, filter: "drop-shadow(0 30px 50px rgba(0,0,0,.5))" }} dangerouslySetInnerHTML={{ __html: html }} />
      <Line {...g.words} t={5} from={0} until={99}>
        <span style={{ display: "block" }}>ככה הוא</span>
        <span style={{ display: "block", color: "#B9B4FF" }}>מחפש עבודה?!</span>
      </Line>
    </Shell>
  );
}

export const scenes: Scene[] = [
  { id: "gasp", name: "Her gasp", component: Gasp, frames: 90 },
  { id: "chill", name: "Him, on the couch", component: Chill, frames: 90 },
  { id: "shoulder", name: "Over his shoulder", component: Shoulder, frames: 120 },
  { id: "app", name: "The app, 1:1", component: AppScene, frames: 180 },
  { id: "laptop", name: "Her laptop", component: Laptop, frames: 90 },
  { id: "end", name: "End card", component: End, frames: 120 },
];
