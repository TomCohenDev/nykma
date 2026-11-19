import type { CSSProperties, ReactNode } from "react";
import { Plate, asset, random, useFrame, useVideo, type AdProps, type Cue, type CueInput, type Layout, type Ratio } from "../../engine";
import { HandText, handCues, handEntry, type HandWrite, type PenTip } from "../../parts/hand";
import { Typing } from "../../parts/Typing";
import { clamp, easings, prog, spring } from "../../parts/time";
import score from "./score.json";

/**
 * A shiny AI ad gets corrected live by a red pen, argues back, and is scribbled out. Then, on bare paper, the pen writes only
 * what's true. Two worlds, one pen. All timing is in score.json, which the track reads too.
 */
const { cuts: C, landed } = score;
export const FRAMES = score.frames;

const INK = "#141414";
const PAPER = "#F4EFE6";
const MARKER = "#E8301F";
const DISPLAY = '"Archivo Black", sans-serif';
const MONO = '"JetBrains Mono", monospace';

const FONTS = `
@font-face{font-family:"Archivo Black";font-display:block;src:url("${asset("ads/whos-sarah/ArchivoBlack-Regular.ttf")}")}
@font-face{font-family:"JetBrains Mono";font-weight:100 800;font-display:block;src:url("${asset("ads/whos-sarah/JetBrainsMono-wght.ttf")}")}`;

const X_AT = [245, 250, 255, 260];
const STRIKES = [
  { id: "strike", write: [396, 403] },
  { id: "strike", write: [405, 412] },
  { id: "strike", write: [413, 419] },
] satisfies HandWrite[];

const W = {
  ring: { id: "ring", write: [34, 50] },
  who: { id: "who", write: [50, 78] },
  ringName: { id: "ring-name", write: [142, 156] },
  sarah: { id: "sarah", write: [156, 188] },
  teams: { id: "teams", write: [264, 285] },
  what: { id: "what", write: [335, 362] },
  ok: { id: "ok", write: [462, 474] },
  true: { id: "true", write: [486, 520] },
  ask: { id: "ask", write: [556, 582] },
  mp4: { id: "mp4", write: [588, 608] },
  watching: { id: "watching", write: [634, 658] },
  copy: { id: "copy", write: [668, 688] },
  yours: { id: "yours", write: [692, 716] },
  barA: { id: "bar-a", write: [742, 756] },
  barB: { id: "bar-b", write: [758, 788] },
  close: { id: "close", write: [landed.close, landed.close + 11] },
  tag: { id: "tag", write: [838, 858] },
  flick: { id: "flick", write: [landed.flick, landed.flick + 6] },
} satisfies Record<string, HandWrite>;

const scribble = (ratio: Ratio): HandWrite => ({ id: `scribble-${ratio}`, write: [C.scribble + 1, C.paper] });
const ringFor = (ratio: Ratio): HandWrite => ({ id: `ring-${ratio}`, write: [618, 634] });

export const cues = ({ fps, ratio }: CueInput): Cue[] => [
  { src: "ads/whos-sarah/assets/track.wav" },
  ...handCues("whos-sarah", [...Object.values(W), ...STRIKES, ...X_AT.map((at) => ({ id: "x", write: [at, at + 5] as const })), ringFor(ratio)], { fps, volume: 0.6 }),
  ...handCues("whos-sarah", [scribble(ratio)], { fps, volume: 1 }),
];

/** Rect kept clear in output pixels, per the validator's safe areas. */
const SAFE: Layout<{ left: number; top: number; width: number; height: number }> = {
  "16x9": { left: 96, top: 54, width: 1728, height: 972 },
  "1x1": { left: 54, top: 54, width: 972, height: 972 },
  "9x16": { left: 60, top: 200, width: 900, height: 1400 },
};

// ---- the pen ----

/** A fat felt-tip, held from the lower right. Nib at (0, 0), in output pixels. */
function Marker(tip: PenTip) {
  const lean = 142 + 3 * Math.sin(tip.angle);
  return (
    <g transform={`translate(0 ${-tip.air * 16}) rotate(${lean})`} style={{ filter: "drop-shadow(-14px 22px 16px rgba(0,0,0,.4))" }}>
      <path d="M0 0L-13 -20L-13 -44L13 -44L13 -20Z" fill={MARKER} />
      <path d="M-30 -52L-16 -44L16 -44L30 -52L34 -130L-34 -130Z" fill="#26211f" />
      <rect x={-40} y={-720} width={80} height={592} rx={10} fill="#F7F2E8" />
      <rect x={-40} y={-300} width={80} height={120} fill={MARKER} />
      <rect x={-22} y={-720} width={14} height={592} fill="#fff" opacity={0.55} />
    </g>
  );
}

type Note = HandWrite & { size?: number; width?: number; at: CSSProperties; turn?: number; weight?: number; color?: string };

function Pen({ id, write, erase, size, width, at, turn = 0, weight = 1.25, color = MARKER }: Note) {
  return (
    <div style={{ position: "absolute", transform: `rotate(${turn}deg)`, ...at }}>
      <HandText id={id} write={write} erase={erase} mode="ink" size={size} width={width} color={color} weight={weight} pen={Marker} />
    </div>
  );
}

// ---- the hype world ----

const chrome: CSSProperties = {
  background: "linear-gradient(180deg,#ffffff 0%,#d9dcff 44%,#7a5cff 50%,#f0e8ff 58%,#ffffff 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "#fff",
  fontFamily: DISPLAY,
  letterSpacing: "-0.02em",
};

const blobs = [
  { x: 0.2, y: 0.25, r: 0.8, color: "rgba(112,48,255,.75)", speed: 0.021 },
  { x: 0.85, y: 0.7, r: 0.7, color: "rgba(40,90,255,.6)", speed: 0.017 },
  { x: 0.6, y: 0.05, r: 0.5, color: "rgba(255,40,190,.34)", speed: 0.027 },
];

/** Everything the fake ad stands on: aurora, twinkle, and a slow push that never lets up. */
function Hype({ children, at, punch = 0.7 }: { children: ReactNode; at: number; punch?: number }) {
  const frame = useFrame();
  const { width, height } = useVideo();
  const side = Math.max(width, height);
  const hit = clamp((frame - at) / 10);
  const zoom = 1 + 0.1 * (1 - easings.outExpo(hit)) + 0.0002 * (frame - at);
  const flash = punch * (1 - clamp((frame - at) / 5));
  const flinched = score.flinch.find(([a]) => frame >= a && frame < a + 9);
  const shake = flinched ? 9 * Math.sin(frame * 2.4) * (1 - (frame - flinched[0]) / 9) : 0;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#0B0620" }}>
      {blobs.map(({ x, y, r, color, speed }, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: width * x + 180 * Math.sin(frame * speed + i * 2) - (side * r) / 2,
            top: height * y + 140 * Math.cos(frame * speed * 1.3 + i) - (side * r) / 2,
            width: side * r,
            height: side * r,
            background: `radial-gradient(closest-side, ${color}, transparent)`,
          }}
        />
      ))}
      {Array.from({ length: 22 }, (_, i) => {
        const glow = Math.sin(frame * (0.14 + 0.1 * random(`s${i}`)) + 6 * random(`p${i}`));
        const size = 14 + 34 * random(`z${i}`);
        if (glow < 0.2) return null;
        return (
          <svg key={i} viewBox="-10 -10 20 20" width={size} height={size} style={{ position: "absolute", left: width * random(`x${i}`), top: height * random(`y${i}`), opacity: glow, transform: `scale(${glow})` }}>
            <path d="M0-10C1-2 2-1 10 0C2 1 1 2 0 10C-1 2-2 1-10 0C-2-1-1-2 0-10Z" fill="#fff" />
          </svg>
        );
      })}
      <div style={{ position: "absolute", inset: 0, transform: `translate(${shake}px, ${-shake * 0.6}px) scale(${zoom})` }}>{children}</div>
      <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash }} />
    </div>
  );
}

function Chrome({ box, first = 1 }: { box: CSSProperties; first?: number }) {
  return (
    <div style={{ position: "absolute", ...box }}>
      <Plate src="ads/whos-sarah/gen/blender/chrome-1x1/####.png" first={first} length={390} />
    </div>
  );
}

const pop = (frame: number, at: number) => (frame < at ? 0 : spring(frame - at, { stiffness: 260, damping: 13 }));

const G1: Layout<{ plate: CSSProperties; head: CSSProperties; size: number; lines: string[]; note: CSSProperties; ring: number; ringAt: CSSProperties; who: CSSProperties; whoSize: number }> = {
  "16x9": {
    plate: { left: 860, top: -50, width: 1020, height: 1020 },
    head: { left: 118, top: 262, textAlign: "left" },
    size: 144,
    lines: ["THE #1", "AI AD", "PLATFORM"],
    note: { left: 120, top: 750 },
    ring: 830,
    ringAt: { left: 952, top: 90 },
    who: { left: 1190, top: 835 },
    whoSize: 130,
  },
  "1x1": {
    plate: { left: 140, top: 10, width: 800, height: 800 },
    head: { left: 0, right: 0, top: 716, textAlign: "center" },
    size: 106,
    lines: ["THE #1 AI AD", "PLATFORM"],
    note: { left: 0, right: 0, top: 952, textAlign: "center" },
    ring: 680,
    ringAt: { left: 197, top: 100 },
    who: { left: 640, top: 34 },
    whoSize: 92,
  },
  "9x16": {
    plate: { left: 0, top: 150, width: 1020, height: 1020 },
    head: { left: 84, top: 1036, textAlign: "left" },
    size: 142,
    lines: ["THE #1", "AI AD", "PLATFORM"],
    note: { left: 86, top: 1490 },
    ring: 760,
    ringAt: { left: 127, top: 322 },
    who: { left: 500, top: 212 },
    whoSize: 110,
  },
};

function Gag1({ ratio }: AdProps) {
  const frame = useFrame();
  const L = G1[ratio];
  const said = pop(frame, score.retort[0]);
  return (
    <Hype at={-8}>
      <Chrome box={L.plate} />
      <div style={{ position: "absolute", ...L.head }}>
        {L.lines.map((line) => (
          <div key={line} style={{ ...chrome, fontSize: L.size, lineHeight: 1.04 }}>
            {line}
          </div>
        ))}
      </div>
      {said > 0 && (
        <div style={{ position: "absolute", ...L.note, fontFamily: MONO, fontSize: 48, fontWeight: 500, color: "#fff", transformOrigin: "left center", transform: `scale(${said})` }}>*says us</div>
      )}
      <Pen {...W.ring} width={L.ring} at={L.ringAt} weight={1.1} />
      <Pen {...W.who} size={L.whoSize} at={L.who} turn={-5} />
    </Hype>
  );
}

const G2: Layout<{ card: CSSProperties; plate: CSSProperties; quote: number; lines: string[]; quoteTop: number; byTop: number; by: number; ringWidth: number; ringAt: CSSProperties; hand: CSSProperties; handSize: number }> = {
  "16x9": {
    card: { left: 300, top: 90, width: 1320, height: 690 },
    plate: { left: 530, top: -215, width: 860, height: 860 },
    quote: 92,
    lines: ["“This changed my life.”"],
    quoteTop: 262,
    byTop: 470,
    by: 54,
    ringWidth: 1000,
    ringAt: { left: 456, top: 474 },
    hand: { left: 595, top: 804 },
    handSize: 150,
  },
  "1x1": {
    card: { left: 54, top: 60, width: 972, height: 730 },
    plate: { left: 150, top: -210, width: 780, height: 780 },
    quote: 92,
    lines: ["“This changed", "my life.”"],
    quoteTop: 230,
    byTop: 530,
    by: 46,
    ringWidth: 830,
    ringAt: { left: 122, top: 527 },
    hand: { left: 230, top: 820 },
    handSize: 130,
  },
  "9x16": {
    card: { left: 60, top: 350, width: 900, height: 760 },
    plate: { left: 130, top: 80, width: 760, height: 760 },
    quote: 96,
    lines: ["“This changed", "my life.”"],
    quoteTop: 250,
    byTop: 570,
    by: 44,
    ringWidth: 860,
    ringAt: { left: 77, top: 853 },
    hand: { left: 110, top: 1150 },
    handSize: 170,
  },
};

function byline(frame: number) {
  const [from, to] = ["Founder", "Real Person"];
  const hit = score.retort[1];
  if (frame < hit) return from;
  if (frame < hit + 7) return from.slice(0, from.length - (frame - hit));
  return to.slice(0, Math.min(frame - hit - 6, to.length));
}

function Gag2({ ratio }: AdProps) {
  const frame = useFrame();
  const L = G2[ratio];
  return (
    <Hype at={C.g2}>
      <div style={{ position: "absolute", ...L.card, borderRadius: 40, background: "rgba(255,255,255,.1)", border: "2px solid rgba(255,255,255,.35)", boxShadow: "0 40px 120px rgba(0,0,0,.45)" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: L.quoteTop, textAlign: "center" }}>
          {L.lines.map((line) => (
            <div key={line} style={{ ...chrome, fontSize: L.quote, lineHeight: 1.12 }}>
              {line}
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, top: L.byTop, display: "flex", alignItems: "center", justifyContent: "center", gap: 26 }}>
          <div style={{ width: 104, height: 104, borderRadius: "50%", background: "linear-gradient(135deg,#ff4fd8,#6a4dff)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: DISPLAY, fontSize: 40, flex: "none" }}>SK</div>
          <div style={{ color: "#fff", fontFamily: MONO, fontWeight: 600, fontSize: L.by, whiteSpace: "pre" }}>Sarah K., {byline(frame)}</div>
        </div>
      </div>
      <Chrome box={L.plate} first={1} />
      <Pen {...W.ringName} width={L.ringWidth} at={L.ringAt} weight={1.1} />
      <Pen {...W.sarah} size={L.handSize} at={L.hand} turn={-4} />
    </Hype>
  );
}

const G3: Layout<{ title: number; titleTop: number; logos: { left: number; top: number }[]; box: [number, number]; x: number; hand: CSSProperties; handSize: number }> = {
  "16x9": {
    title: 124,
    titleTop: 104,
    logos: [0, 1, 2, 3].map((i) => ({ left: 186 + i * 396, top: 474 })),
    box: [360, 200],
    x: 190,
    hand: { left: 560, top: 720 },
    handSize: 170,
  },
  "1x1": {
    title: 96,
    titleTop: 100,
    logos: [0, 1, 2, 3].map((i) => ({ left: 110 + (i % 2) * 450, top: 400 + (i >> 1) * 190 })),
    box: [410, 160],
    x: 150,
    hand: { left: 240, top: 800 },
    handSize: 130,
  },
  "9x16": {
    title: 112,
    titleTop: 290,
    logos: [0, 1, 2, 3].map((i) => ({ left: 60 + (i % 2) * 470, top: 730 + (i >> 1) * 270 })),
    box: [430, 240],
    x: 200,
    hand: { left: 120, top: 1280 },
    handSize: 170,
  },
};

function Gag3({ ratio }: AdProps) {
  const frame = useFrame();
  const L = G3[ratio];
  const future = pop(frame, score.retort[2]);
  return (
    <Hype at={C.g3}>
      <div style={{ position: "absolute", left: ratio === "9x16" ? 60 : 0, right: ratio === "9x16" ? 120 : 0, top: L.titleTop, textAlign: "center", fontSize: L.title, lineHeight: 1.1 }}>
        <div style={chrome}>TRUSTED BY</div>
        <div style={{ display: "flex", flexDirection: ratio === "9x16" ? "column" : "row", alignItems: "center", justifyContent: "center", columnGap: "0.34em" }}>
          {future > 0 && <span style={{ ...chrome, display: "inline-block", transformOrigin: "right center", transform: `scale(${Math.min(future, 1)})`, background: "linear-gradient(180deg,#fff,#ff7ad9)", WebkitBackgroundClip: "text", backgroundClip: "text" }}>FUTURE</span>}
          <span style={{ ...chrome, display: "inline-block" }}>TEAMS</span>
        </div>
      </div>
      {L.logos.map((at, i) => {
        const [w, h] = L.box;
        return (
          <div key={i} style={{ position: "absolute", ...at, width: w, height: h, borderRadius: 22, background: "rgba(255,255,255,.07)", border: "3px dashed rgba(255,255,255,.5)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: MONO, fontWeight: 700, fontSize: 56, boxSizing: "border-box" }}>
            LOGO
          </div>
        );
      })}
      {L.logos.map((at, i) => {
        const [w, h] = L.box;
        return <Pen key={i} id="x" write={[X_AT[i], X_AT[i] + 5]} width={L.x} at={{ left: at.left + (w - L.x) / 2, top: at.top + (h - L.x * 0.9) / 2 }} weight={1.2} />;
      })}
      <Pen {...W.teams} size={L.handSize} at={L.hand} turn={-3} />
    </Hype>
  );
}

const G4: Layout<{ plate: CSSProperties; head: CSSProperties; size: number; lines: (string | null)[][]; hand: CSSProperties; handSize: number; label: number }> = {
  "16x9": {
    plate: { left: 120, top: 40, width: 980, height: 980 },
    head: { left: 1130, top: 300, textAlign: "left" },
    size: 150,
    lines: [["GROW"], [null], ["FASTER"]],
    hand: { left: 170, top: 190 },
    handSize: 170,
    label: 52,
  },
  "1x1": {
    plate: { left: 180, top: 205, width: 790, height: 790 },
    head: { left: 0, right: 0, top: 84, textAlign: "center" },
    size: 104,
    lines: [["GROW ", null], ["FASTER"]],
    hand: { left: 170, top: 350 },
    handSize: 140,
    label: 48,
  },
  "9x16": {
    plate: { left: 150, top: 610, width: 810, height: 810 },
    head: { left: 84, top: 256, textAlign: "left" },
    size: 136,
    lines: [["GROW ", null], ["FASTER"]],
    hand: { left: 200, top: 700 },
    handSize: 150,
    label: 48,
  },
};

function Gag4({ ratio }: AdProps) {
  const frame = useFrame();
  const L = G4[ratio];
  const said = pop(frame, score.retort[3]);
  const side = L.plate.width as number;
  const [left, top] = [L.plate.left as number, L.plate.top as number];
  return (
    <Hype at={C.g4}>
      <Chrome box={L.plate} />
      <div style={{ position: "absolute", ...L.head }}>
        {L.lines.map((line, i) => (
          <div key={i} style={{ fontSize: L.size, lineHeight: 1.08, whiteSpace: "pre" }}>
            {line.map((word, k) =>
              word === null ? (
                <span key={k} style={{ display: "inline-block", width: "2.1em", height: "0.78em", background: PAPER, verticalAlign: "-0.04em" }} />
              ) : (
                <span key={k} style={chrome}>
                  {word}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
      {said > 0 && (
        <>
          <div style={{ position: "absolute", left: left - 8, top: top + side * 0.1, width: 5, height: side * 0.82, background: "#fff", opacity: 0.8 }} />
          <div style={{ position: "absolute", left: left - 8, top: top + side * 0.92, width: side, height: 5, background: "#fff", opacity: 0.8 }} />
          <div style={{ position: "absolute", left: left - 8 - L.label * 1.5, top: top + side * 0.5, fontFamily: MONO, fontWeight: 600, fontSize: L.label, color: "#fff", transformOrigin: "left top", transform: `rotate(-90deg) scale(${said})` }}>vibes</div>
          {frame >= score.retort[3] + 6 && <div style={{ position: "absolute", left: left + side * 0.42, top: top + side * 0.92 + 12, fontFamily: MONO, fontWeight: 600, fontSize: L.label, color: "#fff" }}>time, probably</div>}
        </>
      )}
      <Pen {...W.what} size={L.handSize} at={L.hand} turn={-4} />
    </Hype>
  );
}

const G5: Layout<{ sizes: number[]; shift: number }> = {
  "16x9": { sizes: [176, 176, 176], shift: 0 },
  "1x1": { sizes: [146, 146, 96], shift: 0 },
  "9x16": { sizes: [136, 136, 92], shift: -60 },
};
const JARGON = [
  { word: "SEAMLESS", em: 6.5 },
  { word: "NEXT-GEN", em: 6.3 },
  { word: "REVOLUTIONARY", em: 9.5 },
];

function Gag5({ ratio }: AdProps) {
  const frame = useFrame();
  const L = G5[ratio];
  const inset = ratio === "9x16" ? 60 : 0;
  const { height } = useVideo();
  const gap = L.sizes[0] * 0.2;
  const stack = L.sizes.reduce((sum, size) => sum + size * 1.05, 0) + gap * 2;
  return (
    <Hype at={frame < 400 ? C.g5 : frame < 410 ? 400 : 410} punch={frame < 400 ? 0.7 : 0.14}>
      <div style={{ position: "absolute", left: inset, right: ratio === "9x16" ? 120 : 0, top: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `translateY(${L.shift}px)`, gap }}>
        {JARGON.map(({ word }, i) => (
          <div key={word} style={{ position: "relative", ...chrome, fontSize: L.sizes[i], lineHeight: 1.05, whiteSpace: "nowrap", opacity: frame >= C.g5 + i * 10 ? 1 : 0 }}>
            {word}
          </div>
        ))}
      </div>
      {STRIKES.map((run, i) => {
        const above = L.sizes.slice(0, i).reduce((sum, size) => sum + size * 1.05 + gap, 0);
        const strike = L.sizes[i] * JARGON[i].em;
        return <Pen key={i} {...run} width={strike} at={{ left: (ratio === "9x16" ? 1020 : ratio === "1x1" ? 1080 : 1920) / 2 - strike / 2, top: height / 2 - stack / 2 + L.shift + above + (L.sizes[i] * 1.05) / 2 - 8 }} weight={1.5} />;
      })}
    </Hype>
  );
}

function Scribble({ ratio }: AdProps) {
  const run = scribble(ratio);
  const [vx, vy, vw] = handEntry("whos-sarah", run.id).viewBox;
  return <Pen {...run} width={vw} at={{ left: vx, top: vy }} weight={1.5} />;
}

// ---- the paper world ----

const STOPS = [C.ask, C.mp4, C.copy, C.rule, C.end];

const STILLS: { ratio: Ratio; label: string; aspect: number }[] = [
  { ratio: "16x9", label: "16:9", aspect: 16 / 9 },
  { ratio: "1x1", label: "1:1", aspect: 1 },
  { ratio: "9x16", label: "9:16", aspect: 9 / 16 },
];

const P: Layout<{
  ok: number;
  true: number;
  term: { width: number; size: number };
  ask: number;
  mp4: number;
  shots: Record<Ratio, { left: number; top: number; height: number }>;
  watching: { size: number; at: CSSProperties };
  card: { width: number; size: number; label: number };
  copy: number;
  yours: number;
  bar: number;
  logo: number;
  word: number;
  tag: number;
  url: number;
  row: boolean;
}> = {
  "16x9": {
    ok: 230,
    true: 170,
    term: { width: 1300, size: 72 },
    ask: 170,
    mp4: 150,
    shots: { "16x9": { left: 235, top: 290, height: 410 }, "1x1": { left: 1005, top: 290, height: 410 }, "9x16": { left: 1455, top: 290, height: 410 } },
    watching: { size: 110, at: { left: 577, top: 830 } },
    card: { width: 1420, size: 54, label: 36 },
    copy: 160,
    yours: 130,
    bar: 118,
    logo: 330,
    word: 190,
    tag: 130,
    url: 52,
    row: true,
  },
  "1x1": {
    ok: 200,
    true: 124,
    term: { width: 972, size: 58 },
    ask: 130,
    mp4: 130,
    shots: { "16x9": { left: 54, top: 340, height: 270 }, "1x1": { left: 558, top: 340, height: 270 }, "9x16": { left: 852, top: 340, height: 270 } },
    watching: { size: 100, at: { left: 190, top: 770 } },
    card: { width: 972, size: 44, label: 32 },
    copy: 130,
    yours: 104,
    bar: 104,
    logo: 300,
    word: 150,
    tag: 92,
    url: 46,
    row: false,
  },
  "9x16": {
    ok: 230,
    true: 118,
    term: { width: 900, size: 54 },
    ask: 122,
    mp4: 150,
    shots: { "16x9": { left: 60, top: 460, height: 495 }, "1x1": { left: 158, top: 1045, height: 400 }, "9x16": { left: 618, top: 1045, height: 400 } },
    watching: { size: 108, at: { left: 110, top: 1518 } },
    card: { width: 900, size: 44, label: 34 },
    copy: 150,
    yours: 112,
    bar: 104,
    logo: 340,
    word: 170,
    tag: 100,
    url: 48,
    row: false,
  },
};

function Sheet({ index, ratio, children }: { index: number; ratio: Ratio; children: ReactNode }) {
  const { height } = useVideo();
  const safe = SAFE[ratio];
  return (
    <div style={{ position: "absolute", left: safe.left, top: index * height + safe.top, width: safe.width, height: safe.height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>{children}</div>
  );
}

function Hand({ run, size, turn = 0, gap = 0 }: { run: HandWrite; size: number; turn?: number; gap?: number }) {
  return (
    <div style={{ transform: `rotate(${turn}deg)`, marginTop: gap }}>
      <HandText id={run.id} write={run.write} mode="ink" size={size} color={MARKER} weight={1.25} pen={Marker} />
    </div>
  );
}

function FileCard({ name, width, size, label, children, red }: { name: string; width: number; size: number; label: number; children: ReactNode; red?: boolean }) {
  return (
    <div style={{ width, boxSizing: "border-box", background: "#fffdf8", border: `3px solid ${red ? MARKER : INK}`, borderRadius: 18, padding: `${size * 0.7}px ${size * 0.9}px`, color: INK, fontFamily: MONO, fontSize: size, lineHeight: 1.4, boxShadow: "0 14px 0 rgba(20,20,20,.08)" }}>
      <div style={{ fontSize: Math.max(label, ratioFloor), fontWeight: 700, color: red ? MARKER : "#5c574e", marginBottom: size * 0.4 }}>{name}</div>
      {children}
    </div>
  );
}
const ratioFloor = 40; // The smallest size a phone can read comfortably.

function Paper({ ratio }: AdProps) {
  const frame = useFrame();
  const { height, width } = useVideo();
  const L = P[ratio];
  const slid = STOPS.reduce((sum, at) => sum + prog(frame, [at - 8, at + 8]), 0);
  const offset = slid * height;
  const near = (i: number) => Math.abs(i - slid) < 1;
  const shot = (at: number) => (frame < at ? 0 : spring(frame - at, { stiffness: 170, damping: 14 }));
  const ring = ringFor(ratio);
  const here = L.shots[ratio];
  const shown = STILLS.find((still) => still.ratio === ratio)!;
  const [rvx, rvy, rvw, rvh] = handEntry("whos-sarah", ring.id).viewBox;
  const ringWidth = here.height * shown.aspect * (ratio === "9x16" ? 1.62 : 1.3);
  const ringScale = ringWidth / rvw;

  const nudge = 1 + 0.06 * Math.exp(-Math.max(frame - landed.close - 11, 0) / 5) * (frame >= landed.close + 11 ? 1 : 0);
  const word = clamp((frame - 826) / 12);
  const makeRoom = prog(frame, [822, 838]); // The prompt starts alone in the middle, and moves over for the name.
  const url = clamp((frame - 852) / 6);
  const sneak = frame < landed.sneak ? 0 : spring(frame - landed.sneak, { stiffness: 300, damping: 14 });
  const gone = clamp((frame - landed.flick - 2) / 10);
  const close = W.close;
  const entry = handEntry("whos-sarah", close.id);
  const logoScale = L.logo / 120;

  const badge = (
    <>
      {sneak > 0 && gone < 1 && (
        <span
          style={{
            position: "absolute",
            left: "100%",
            marginLeft: 26,
            top: -10,
            fontFamily: DISPLAY,
            fontSize: 60,
            lineHeight: 1.2,
            letterSpacing: 0,
            color: "#fff",
            background: "linear-gradient(135deg,#7a2bff,#1f55ff)",
            borderRadius: 16,
            padding: "6px 16px",
            transform: `translate(${gone * 60}px, ${gone * gone * 420}px) rotate(${10 + gone * 90}deg) scale(${sneak})`,
            opacity: 1 - gone,
          }}
        >
          #1
        </span>
      )}
      {frame < landed.flick + 16 && (
        <span style={{ position: "absolute", left: "100%", top: 0, opacity: 1 - clamp((frame - landed.flick - 10) / 6) }}>
          <Pen {...W.flick} width={150} at={{ left: 14, top: 6 }} weight={1.2} />
        </span>
      )}
    </>
  );

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: PAPER }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "linear-gradient(rgba(20,60,120,.1) 3px, transparent 3px)",
          backgroundSize: "100% 72px",
          backgroundPosition: `0 ${-offset % 72}px`,
        }}
      />
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${-offset}px)` }}>
        {near(0) && (
          <Sheet index={0} ratio={ratio}>
            <Hand run={W.ok} size={L.ok} turn={-3} />
            <Hand run={W.true} size={L.true} turn={-2} gap={30} />
          </Sheet>
        )}
        {near(1) && (
          <Sheet index={1} ratio={ratio}>
            <div style={{ width: L.term.width, boxSizing: "border-box", background: INK, color: PAPER, borderRadius: 22, padding: `${L.term.size * 1.1}px ${L.term.size}px`, fontFamily: MONO, fontWeight: 500, fontSize: L.term.size, whiteSpace: "pre" }}>
              {"> "}
              <Typing text="make an ad about nykma" typed={[C.ask + 6, C.ask + 28]} caretColor={PAPER} seed="ask" />
            </div>
            <Hand run={W.ask} size={L.ask} turn={-2} gap={46} />
          </Sheet>
        )}
        {near(2) && (
          <div style={{ position: "absolute", left: 0, top: 2 * height, width, height }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: ratio === "9x16" ? 240 : ratio === "1x1" ? 90 : 70, display: "flex", justifyContent: "center", paddingRight: ratio === "9x16" ? 60 : 0 }}>
              <Hand run={W.mp4} size={L.mp4} turn={-2} />
            </div>
            {STILLS.map(({ ratio: shape, label, aspect }, i) => {
              const at = L.shots[shape];
              const fall = shot(landed.frames[i]);
              return (
                <div key={shape} style={{ position: "absolute", left: at.left, top: at.top, height: at.height, width: at.height * aspect, opacity: clamp(fall * 3), transform: `translateY(${(1 - fall) * -90}px)` }}>
                  <img src={asset(`ads/whos-sarah/frame-${shape}.png`)} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", borderRadius: 10, boxShadow: "0 18px 30px rgba(20,20,20,.28)" }} />
                  <div style={{ marginTop: 14, textAlign: "center", color: INK, fontFamily: MONO, fontWeight: 700, fontSize: 40 }}>{label}</div>
                </div>
              );
            })}
            <Pen {...ring} width={ringWidth} at={{ left: here.left + (here.height * shown.aspect) / 2 - ringWidth * (-rvx / rvw), top: here.top + (here.height + 66) / 2 - rvh * ringScale * (-rvy / rvh) }} weight={1.1} />
            <Pen {...W.watching} size={L.watching.size} at={L.watching.at} turn={-2} />
          </div>
        )}
        {near(3) && (
          <Sheet index={3} ratio={ratio}>
            <Hand run={W.copy} size={L.copy} turn={-2} />
            <div style={{ height: 30 }} />
            <FileCard name="post.md" width={L.card.width} size={L.card.size} label={L.card.label}>
              <div style={{ fontWeight: 700 }}>## TikTok</div>
              <div>the ad tried to lie.</div>
              <div>the pen wouldn't let it.</div>
            </FileCard>
            <Hand run={W.yours} size={L.yours} turn={-2} gap={30} />
          </Sheet>
        )}
        {near(4) && (
          <Sheet index={4} ratio={ratio}>
            <FileCard name="ad-agent.md" width={L.card.width} size={L.card.size} label={L.card.label}>
              <div style={{ fontWeight: 700 }}>## Don't lie</div>
              <div>Illustration is free.</div>
              <div>Claims aren't.</div>
            </FileCard>
            <div style={{ height: 34 }} />
            <FileCard name="validate.md" width={L.card.width} size={L.card.size * (ratio === "16x9" ? 0.74 : ratio === "1x1" ? 0.82 : 0.92)} label={L.card.label} red>
              <div style={{ whiteSpace: ratio === "16x9" ? "pre" : "normal" }}>
                <b style={{ color: MARKER }}>fail</b> Truth <span>"███"</span> on screen isn't in brand.md's facts
              </div>
            </FileCard>
            <div style={{ position: "relative", marginTop: 26, display: "flex", flexDirection: ratio === "16x9" ? "row" : "column", alignItems: "center", gap: ratio === "16x9" ? 40 : 0 }}>
              <Hand run={W.barA} size={L.bar} turn={-2} />
              <Hand run={W.barB} size={L.bar} turn={-2} />
            </div>
          </Sheet>
        )}
        {near(5) && (
          <Sheet index={5} ratio={ratio}>
            <div style={{ display: "flex", flexDirection: L.row ? "row" : "column", alignItems: "center", gap: L.row ? 50 : 20 }}>
              <div aria-label="logo" style={{ position: "relative", width: L.logo, height: L.logo, flex: "none", transform: `translate(${L.row ? 509 * (1 - makeRoom) : 0}px, ${L.row ? 0 : 200 * (1 - makeRoom)}px) scale(${nudge})` }}>
                <svg viewBox="0 0 120 120" width={L.logo} height={L.logo} style={{ position: "absolute", inset: 0 }}>
                  <path d="M36 22L92 60L36 98" fill="none" stroke={INK} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <Pen {...close} width={entry.viewBox[2] * logoScale} at={{ left: entry.viewBox[0] * logoScale, top: entry.viewBox[1] * logoScale }} weight={1} />
              </div>
              <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: L.row ? "flex-start" : "center" }}>
                <div style={{ position: "relative", fontFamily: MONO, fontWeight: 800, fontSize: L.word, color: INK, letterSpacing: "-0.03em", lineHeight: 1, whiteSpace: "pre" }}>
                  <span style={{ opacity: word > 0 ? 1 : 0 }}>{"nykma".slice(0, Math.ceil(word * 5))}</span>
                  <span style={{ opacity: 0 }}>{"nykma".slice(Math.ceil(word * 5))}</span>
                  {badge}
                </div>
                <Hand run={W.tag} size={L.tag} turn={-1} gap={L.row ? 24 : 38} />
                <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: L.url, color: INK, opacity: url, marginTop: 20 }}>nykma.example</div>
              </div>
            </div>
          </Sheet>
        )}
      </div>
    </div>
  );
}

export function WhosSarah({ ratio }: AdProps) {
  const frame = useFrame();
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#0B0620" }}>
      <style href="whos-sarah-fonts" precedence="ad">
        {FONTS}
      </style>
      {frame < C.g2 && <Gag1 ratio={ratio} />}
      {frame >= C.g2 && frame < C.g3 && <Gag2 ratio={ratio} />}
      {frame >= C.g3 && frame < C.g4 && <Gag3 ratio={ratio} />}
      {frame >= C.g4 && frame < C.g5 && <Gag4 ratio={ratio} />}
      {frame >= C.g5 && frame < C.paper && <Gag5 ratio={ratio} />}
      {frame >= C.scribble && frame < C.paper && <Scribble ratio={ratio} />}
      {frame >= C.paper && <Paper ratio={ratio} />}
    </div>
  );
}
