import { clamp01, inBack, inCubic, inExpo, inOutCubic, inOutSine, linear, outBack, outCubic, outExpo, outQuad, spring } from "./ease.ts"; // With its extension, so Node scripts (validate) can load this file directly.

/**
 * Object effects: `data-fx` on any element of an ad, written by hand or by the desk (spec.md §5).
 *
 *   <h1 data-fx="in:fade-up@12+15 loop:float out:fade@80+10">
 *
 * A space-separated list of steps, each `slot:effect[@start][+frames][*amount][~ease]`:
 *   slot    in (entrance), loop (emphasis, repeats) or out (exit)
 *   @start  the scene frame it starts on, counted like `useFrame()` in that scene. in and loop default to 0; out
 *           defaults to ending on the scene's last frame
 *   +frames how long an in or out takes (default per effect, about half a second); for a loop, one cycle
 *   *amount scales the distance or strength (default 1)
 *   ~ease   linear, in, out, in-out, expo, back or spring, in place of the effect's own curve
 *
 * Before its `in` starts the element waits in that effect's first pose (hidden, for the fades), and after its `out`
 * ends it stays gone. The engine applies it after every commit of the <Stage>, from the frame alone, so the viewer and a
 * render draw the same thing. It writes only the CSS individual transforms (`translate`, `scale`, `rotate`), `filter`
 * (blur(), opacity(), drop-shadow()) and `mask-image` (wipes), and composes with a value the ad sets itself for one of
 * them: translate is added with calc(), scale multiplied, a plain rotate angle added, filter functions appended after
 * the ad's own. An ad's own `mask-image` wins over a wipe, and a rotate given about an axis is left alone.
 */

export type FxSlot = "in" | "out" | "loop";
export type FxEase = "linear" | "in" | "out" | "in-out" | "expo" | "back" | "spring";
export type FxStep = { slot: FxSlot; effect: string; at?: number; frames?: number; amount?: number; ease?: FxEase };
export type FxInfo = { id: string; label: string; frames: number };

/** The pose an element takes this frame, on top of what the ad gives it. */
type Pose = { x: number; y: number; s: number; r: number; o: number; blur: number; glow: number; mask?: string };
type Ctx = { amount: number; rtl: boolean };
/** `v` is the eased progress (0 at the start of the step, 1 at its end), `t` the linear one. */
type Move = (v: number, t: number, ctx: Ctx) => Partial<Pose>;

const SLIDE = 260;
const NEAR = 56;

/** Opacity for a moving entrance: in over the first 60%, so the move is seen arriving. */
const appear = (t: number) => outQuad(t / 0.6);
/** Opacity for a moving exit: holds, then goes over the last 60%. */
const vanish = (t: number) => 1 - inCubic((t - 0.4) / 0.6);

function wipe(edge: "start" | "top" | "bottom", reveal: boolean, v: number, rtl: boolean) {
  const soft = 14;
  const to = edge === "top" ? "to bottom" : edge === "bottom" ? "to top" : rtl ? "to left" : "to right";
  const at = v * (100 + soft);
  const [a, b] = reveal ? ["#000", "transparent"] : ["transparent", "#000"];
  return { mask: `linear-gradient(${to}, ${a} ${+(at - soft).toFixed(3)}%, ${b} ${+at.toFixed(3)}%)`, o: v <= 0 && reveal ? 0 : v >= 1 && !reveal ? 0 : 1 };
}

type Def = { label: string; frames: number; ease: (t: number) => number; move: Move };

/** Entrances. `v` runs 0 → 1 toward the element's own pose. Directions name where the element travels. */
const IN: Record<string, Def> = {
  fade: { label: "Fade in", frames: 15, ease: inOutSine, move: (v) => ({ o: v }) },
  "fade-up": { label: "Fade up", frames: 18, ease: outCubic, move: (v, t, { amount }) => ({ y: NEAR * amount * (1 - v), o: appear(t) }) },
  "fade-down": { label: "Fade down", frames: 18, ease: outCubic, move: (v, t, { amount }) => ({ y: -NEAR * amount * (1 - v), o: appear(t) }) },
  "fade-left": { label: "Fade left", frames: 18, ease: outCubic, move: (v, t, { amount }) => ({ x: NEAR * amount * (1 - v), o: appear(t) }) },
  "fade-right": { label: "Fade right", frames: 18, ease: outCubic, move: (v, t, { amount }) => ({ x: -NEAR * amount * (1 - v), o: appear(t) }) },
  "slide-up": { label: "Slide up", frames: 20, ease: outExpo, move: (v, t, { amount }) => ({ y: SLIDE * amount * (1 - v), o: appear(t / 0.5) }) },
  "slide-down": { label: "Slide down", frames: 20, ease: outExpo, move: (v, t, { amount }) => ({ y: -SLIDE * amount * (1 - v), o: appear(t / 0.5) }) },
  "slide-left": { label: "Slide left", frames: 20, ease: outExpo, move: (v, t, { amount }) => ({ x: SLIDE * amount * (1 - v), o: appear(t / 0.5) }) },
  "slide-right": { label: "Slide right", frames: 20, ease: outExpo, move: (v, t, { amount }) => ({ x: -SLIDE * amount * (1 - v), o: appear(t / 0.5) }) },
  pop: { label: "Pop", frames: 18, ease: spring, move: (v, t, { amount }) => ({ s: 1 - 0.7 * Math.min(amount, 1.4) * (1 - v), o: outQuad(t / 0.3) }) },
  "zoom-in": { label: "Zoom in", frames: 18, ease: outCubic, move: (v, t, { amount }) => ({ s: 1 - 0.4 * amount * (1 - v), o: appear(t) }) },
  "zoom-out": { label: "Zoom out", frames: 18, ease: outCubic, move: (v, t, { amount }) => ({ s: 1 + 0.4 * amount * (1 - v), o: appear(t) }) },
  blur: { label: "Blur in", frames: 18, ease: outCubic, move: (v, t, { amount }) => ({ blur: 24 * amount * (1 - v), s: 1 + 0.08 * (1 - v), o: outQuad(t / 0.7) }) },
  drop: { label: "Drop", frames: 24, ease: spring, move: (v, t, { amount }) => ({ y: -SLIDE * amount * (1 - v), o: outQuad(t / 0.25) }) },
  spin: { label: "Spin in", frames: 20, ease: outCubic, move: (v, t, { amount }) => ({ r: -120 * amount * (1 - v), s: 0.5 + 0.5 * v, o: appear(t) }) },
  wipe: { label: "Wipe", frames: 18, ease: inOutCubic, move: (v, _t, { rtl }) => wipe("start", true, v, rtl) },
  "wipe-up": { label: "Wipe up", frames: 18, ease: inOutCubic, move: (v, _t, { rtl }) => wipe("bottom", true, v, rtl) },
  "wipe-down": { label: "Wipe down", frames: 18, ease: inOutCubic, move: (v, _t, { rtl }) => wipe("top", true, v, rtl) },
};

/** Exits. `v` runs 0 → 1 away from the element's own pose. Directions name where the element travels. */
const OUT: Record<string, Def> = {
  fade: { label: "Fade out", frames: 12, ease: inOutSine, move: (v) => ({ o: 1 - v }) },
  "fade-up": { label: "Fade up", frames: 15, ease: inCubic, move: (v, t, { amount }) => ({ y: -NEAR * amount * v, o: vanish(t) }) },
  "fade-down": { label: "Fade down", frames: 15, ease: inCubic, move: (v, t, { amount }) => ({ y: NEAR * amount * v, o: vanish(t) }) },
  "fade-left": { label: "Fade left", frames: 15, ease: inCubic, move: (v, t, { amount }) => ({ x: -NEAR * amount * v, o: vanish(t) }) },
  "fade-right": { label: "Fade right", frames: 15, ease: inCubic, move: (v, t, { amount }) => ({ x: NEAR * amount * v, o: vanish(t) }) },
  "slide-up": { label: "Slide up", frames: 16, ease: inExpo, move: (v, t, { amount }) => ({ y: -SLIDE * amount * v, o: vanish(t) }) },
  "slide-down": { label: "Slide down", frames: 16, ease: inExpo, move: (v, t, { amount }) => ({ y: SLIDE * amount * v, o: vanish(t) }) },
  "slide-left": { label: "Slide left", frames: 16, ease: inExpo, move: (v, t, { amount }) => ({ x: -SLIDE * amount * v, o: vanish(t) }) },
  "slide-right": { label: "Slide right", frames: 16, ease: inExpo, move: (v, t, { amount }) => ({ x: SLIDE * amount * v, o: vanish(t) }) },
  pop: { label: "Pop", frames: 14, ease: inBack, move: (v, t, { amount }) => ({ s: 1 - 0.7 * Math.min(amount, 1.4) * v, o: 1 - inQuadSafe((t - 0.5) / 0.5) }) },
  "zoom-in": { label: "Zoom in", frames: 15, ease: inCubic, move: (v, t, { amount }) => ({ s: 1 + 0.4 * amount * v, o: vanish(t) }) },
  "zoom-out": { label: "Zoom out", frames: 15, ease: inCubic, move: (v, t, { amount }) => ({ s: 1 - 0.4 * amount * v, o: vanish(t) }) },
  blur: { label: "Blur out", frames: 15, ease: inCubic, move: (v, t, { amount }) => ({ blur: 24 * amount * v, s: 1 + 0.08 * v, o: 1 - inOutSine(t) }) },
  drop: { label: "Fall", frames: 18, ease: inCubic, move: (v, t, { amount }) => ({ y: SLIDE * 1.4 * amount * v, r: 6 * amount * v, o: vanish(t) }) },
  spin: { label: "Spin out", frames: 16, ease: inCubic, move: (v, t, { amount }) => ({ r: 120 * amount * v, s: 1 - 0.5 * v, o: vanish(t) }) },
  wipe: { label: "Wipe", frames: 15, ease: inOutCubic, move: (v, _t, { rtl }) => wipe("start", false, v, rtl) },
  "wipe-up": { label: "Wipe up", frames: 15, ease: inOutCubic, move: (v, _t, { rtl }) => wipe("bottom", false, v, rtl) },
  "wipe-down": { label: "Wipe down", frames: 15, ease: inOutCubic, move: (v, _t, { rtl }) => wipe("top", false, v, rtl) },
};

function inQuadSafe(t: number) {
  return clamp01(t) ** 2;
}

/** 0 → 1 → 0 over a cycle, smooth at both ends. */
const swell = (phase: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
/** A burst in the first 30% of each cycle, then still: for shakes that call attention without buzzing. */
const burst = (phase: number) => {
  const p = phase - Math.floor(phase);
  if (p >= 0.3) return 0;
  const k = p / 0.3;
  return Math.sin(Math.PI * k) * Math.sin(2 * Math.PI * 3 * k);
};

type Loop = { label: string; frames: number; move: (phase: number, amount: number) => Partial<Pose> };

/** Emphasis: `phase` counts cycles from the loop's start, and each starts from the element's own pose. */
const LOOP: Record<string, Loop> = {
  pulse: { label: "Pulse", frames: 45, move: (phase, a) => ({ s: 1 + 0.06 * a * swell(phase) }) },
  float: { label: "Float", frames: 90, move: (phase, a) => ({ y: -12 * a * Math.sin(2 * Math.PI * phase) }) },
  bounce: { label: "Bounce", frames: 36, move: (phase, a) => ({ y: -26 * a * Math.abs(Math.sin(Math.PI * phase)) }) },
  sway: { label: "Sway", frames: 90, move: (phase, a) => ({ r: 3 * a * Math.sin(2 * Math.PI * phase) }) },
  shake: { label: "Shake", frames: 60, move: (phase, a) => ({ x: 12 * a * burst(phase) }) },
  wiggle: { label: "Wiggle", frames: 60, move: (phase, a) => ({ r: 4 * a * burst(phase) }) },
  glow: { label: "Glow", frames: 60, move: (phase, a) => ({ glow: 24 * a * swell(phase) }) },
  blink: { label: "Blink", frames: 45, move: (phase, a) => ({ o: 1 - Math.min(0.6 * a, 1) * swell(phase) }) },
  spin: { label: "Spin", frames: 120, move: (phase, a) => ({ r: 360 * a * phase }) },
};

const infos = (defs: Record<string, { label: string; frames: number }>): FxInfo[] => Object.entries(defs).map(([id, { label, frames }]) => ({ id, label, frames }));

/** Every effect, by slot, with the label the desk shows and its default length (a loop's: one cycle) in frames. */
export const EFFECTS: { in: FxInfo[]; loop: FxInfo[]; out: FxInfo[] } = { in: infos(IN), loop: infos(LOOP), out: infos(OUT) };

export const FX_EASES: FxEase[] = ["linear", "in", "out", "in-out", "expo", "back", "spring"];

/** An ease by name, for a slot: expo, back and spring settle on the way in and gather speed on the way out. */
const easeFor = (ease: FxEase, slot: FxSlot): ((t: number) => number) =>
  ({
    linear,
    in: inCubic,
    out: outCubic,
    "in-out": inOutCubic,
    expo: slot === "out" ? inExpo : outExpo,
    back: slot === "out" ? inBack : outBack,
    spring: slot === "out" ? (t: number) => 1 - spring(1 - t) : spring,
  })[ease];

const STEP = /^(in|out|loop):([a-z][a-z0-9-]*)((?:[@+*~][^@+*~\s]+)*)$/;

/** One step, or why it isn't one. */
function parseStep(token: string): FxStep | string {
  const match = token.match(STEP);
  if (!match) return `"${token}" isn't slot:effect[@start][+frames][*amount][~ease]`;
  const [, slot, effect, rest] = match as unknown as [string, FxSlot, string, string];
  const defs = slot === "in" ? IN : slot === "out" ? OUT : LOOP;
  if (!defs[effect]) return `"${token}": no ${slot} effect "${effect}" (${Object.keys(defs).join(", ")})`;
  const step: FxStep = { slot, effect };
  for (const [, mark, value] of rest.matchAll(/([@+*~])([^@+*~]+)/g)) {
    if (mark === "~") {
      if (!FX_EASES.includes(value as FxEase)) return `"${token}": no ease "${value}" (${FX_EASES.join(", ")})`;
      step.ease = value as FxEase;
      continue;
    }
    const n = Number(value);
    if (mark === "@" && Number.isInteger(n) && n >= 0) step.at = n;
    else if (mark === "+" && Number.isInteger(n) && n >= 1) step.frames = n;
    else if (mark === "*" && Number.isFinite(n) && n > 0) step.amount = n;
    else return `"${token}": ${mark}${value} should be ${mark === "*" ? "a number above 0" : mark === "+" ? "a whole number of frames, 1 or more" : "a whole frame, 0 or more"}`;
  }
  return step;
}

/** The steps of a `data-fx` value. Steps that don't parse are skipped (`checkFx` says why). */
export function parseFx(text: string): FxStep[] {
  return text.split(/\s+/).filter(Boolean).map(parseStep).filter((step): step is FxStep => typeof step !== "string");
}

/** What's wrong with a `data-fx` value, one line per step that doesn't parse. Empty when it's all good. */
export function checkFx(text: string): string[] {
  return text.split(/\s+/).filter(Boolean).map(parseStep).filter((step): step is string => typeof step === "string");
}

/** The `data-fx` value for some steps: the inverse of `parseFx`. */
export function formatFx(steps: FxStep[]): string {
  return steps
    .map(({ slot, effect, at, frames, amount, ease }) =>
      [`${slot}:${effect}`, at !== undefined ? `@${at}` : "", frames !== undefined ? `+${frames}` : "", amount !== undefined && amount !== 1 ? `*${amount}` : "", ease ? `~${ease}` : ""].join(""),
    )
    .join(" ");
}

const IDENTITY: Pose = { x: 0, y: 0, s: 1, r: 0, o: 1, blur: 0, glow: 0 };

function combine(pose: Pose, add: Partial<Pose>) {
  pose.x += add.x ?? 0;
  pose.y += add.y ?? 0;
  pose.s *= add.s ?? 1;
  pose.r += add.r ?? 0;
  pose.o *= add.o ?? 1;
  pose.blur += add.blur ?? 0;
  pose.glow += add.glow ?? 0;
  if (add.mask) pose.mask = add.mask;
}

/** The pose of an element with these steps on scene frame `frame` of a scene `length` frames long. */
export function fxPose(steps: FxStep[], frame: number, length: number, rtl = false): Pose {
  const pose: Pose = { ...IDENTITY };
  for (const step of steps) {
    const amount = step.amount ?? 1;
    if (step.slot === "loop") {
      const def = LOOP[step.effect];
      const start = step.at ?? 0;
      if (!def || frame < start) continue;
      combine(pose, def.move((frame - start) / (step.frames ?? def.frames), amount));
      continue;
    }
    const def = (step.slot === "in" ? IN : OUT)[step.effect];
    if (!def) continue;
    const frames = step.frames ?? def.frames;
    const start = step.at ?? (step.slot === "in" ? 0 : Math.max(length - frames, 0));
    const t = clamp01((frame - start) / frames);
    // An exit that hasn't started, or an entrance that's done, is the element's own pose.
    if ((step.slot === "out" && t <= 0) || (step.slot === "in" && t >= 1)) continue;
    const ease = step.ease ? easeFor(step.ease, step.slot) : def.ease;
    combine(pose, def.move(ease(t), t, { amount, rtl }));
  }
  pose.o = clamp01(pose.o);
  return pose;
}

// ---- The runtime: writing poses onto the stage's elements ----

const round = (value: number, digits = 3) => +value.toFixed(digits);

/** Splits a CSS value on top-level spaces, keeping calc(…) and friends whole. */
function words(value: string) {
  const out: string[] = [];
  let depth = 0;
  let word = "";
  for (const ch of value.trim()) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (word) out.push(word);
      word = "";
    } else word += ch;
  }
  if (word) out.push(word);
  return out;
}

const empty = (value: string) => !value || value === "none";

type Prop = "translate" | "scale" | "rotate" | "filter" | "mask-image";
const PROPS: Prop[] = ["translate", "scale", "rotate", "filter", "mask-image"];

/** The value of one property: the ad's own `base` with the pose composed in. */
function compose(prop: Prop, base: string, pose: Pose): string {
  switch (prop) {
    case "translate": {
      const x = round(pose.x, 2);
      const y = round(pose.y, 2);
      if (!x && !y) return base;
      if (empty(base)) return `${x}px ${y}px`;
      const [bx, by = "0px", bz] = words(base);
      return [`calc(${bx} + ${x}px)`, `calc(${by} + ${y}px)`, bz].filter(Boolean).join(" ");
    }
    case "scale": {
      const s = round(pose.s, 4);
      if (s === 1) return base;
      if (empty(base)) return String(s);
      const parts = words(base).map((part) => (part.endsWith("%") ? parseFloat(part) / 100 : Number(part)));
      if (parts.some((part) => !Number.isFinite(part))) return base;
      return parts.map((part) => round(part * s, 4)).join(" ");
    }
    case "rotate": {
      const r = round(pose.r, 3);
      if (!r) return base;
      if (empty(base)) return `${r}deg`;
      return /^-?[\d.]+(deg|rad|turn|grad)$/.test(base.trim()) ? `calc(${base.trim()} + ${r}deg)` : base;
    }
    case "filter": {
      const parts = [
        pose.blur > 0.01 ? `blur(${round(pose.blur, 2)}px)` : "",
        pose.glow > 0.05 ? `drop-shadow(0 0 ${round(pose.glow, 2)}px currentColor)` : "",
        pose.o < 0.999 ? `opacity(${round(pose.o, 4)})` : "",
      ].filter(Boolean);
      if (!parts.length) return base;
      return empty(base) ? parts.join(" ") : `${base} ${parts.join(" ")}`;
    }
    case "mask-image":
      return pose.mask && empty(base) ? pose.mask : base;
  }
}

/** Per element, per property: the ad's own value and the one written over it, to tell React's next write from ours. */
type Written = { base: string; applied: string; wanted: string };
const written = new WeakMap<Element, Partial<Record<Prop, Written>>>();
const touched = new WeakMap<Element, Set<HTMLElement | SVGElement>>();
const parsed = new Map<string, FxStep[]>();

function stepsOf(text: string) {
  let steps = parsed.get(text);
  if (!steps) {
    steps = parseFx(text);
    if (parsed.size > 500) parsed.clear();
    parsed.set(text, steps);
  }
  return steps;
}

function write(el: HTMLElement | SVGElement, pose: Pose | null) {
  const record = written.get(el) ?? {};
  for (const prop of PROPS) {
    const current = el.style.getPropertyValue(prop);
    const known = record[prop];
    // Ours if it's still what we wrote; anything else is the ad's (React wrote it, or took it away).
    const base = known && current === known.applied ? known.base : current;
    const wanted = pose ? compose(prop, base, pose) : base;
    if (known && current === known.applied && wanted === known.wanted) continue;
    if (wanted !== current) {
      if (wanted) el.style.setProperty(prop, wanted);
      else el.style.removeProperty(prop);
    }
    if (wanted === base) delete record[prop];
    else record[prop] = { base, applied: el.style.getPropertyValue(prop), wanted };
  }
  if (Object.keys(record).length) written.set(el, record);
  else written.delete(el);
}

/**
 * Applies every `data-fx` under `root` for the frame each element's scene is on: the nearest `data-nykma-frame` above it
 * (each scene's wrapper, else the stage). Elements that lost their `data-fx` get their own values back.
 */
export function applyFx(root: HTMLElement) {
  const before = touched.get(root) ?? new Set();
  const now = new Set<HTMLElement | SVGElement>();
  for (const el of root.querySelectorAll<HTMLElement | SVGElement>("[data-fx]")) {
    const marker = el.closest<HTMLElement>("[data-nykma-frame]");
    const frame = Number(marker?.dataset.nykmaFrame ?? 0);
    const length = Number(marker?.dataset.nykmaLength ?? 0);
    const rtl = el.closest("[dir]")?.getAttribute("dir") === "rtl";
    write(el, fxPose(stepsOf(el.dataset.fx ?? ""), frame, length, rtl));
    now.add(el);
  }
  for (const el of before) if (!now.has(el) && el.isConnected) write(el, null);
  touched.set(root, now);
}
