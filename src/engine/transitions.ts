import type { CSSProperties } from "react";
import { clamp01, inOutCubic, inOutQuart, inOutQuint, inOutSine, outCubic } from "./ease.ts"; // With its extension, so Node scripts (validate) can load this file directly.

/**
 * Scene transitions (spec.md §10.4). story.json's `transitions` names the one INTO a scene from the scene before it:
 *
 *   "transitions": { "two": { "type": "push-left", "frames": 15 } }
 *
 * Nothing moves in time: the video's length and every scene's start stay as they are, so cues stay put. For the
 * incoming scene's first `frames`, the outgoing scene is held on its last frame and the incoming one plays from its frame
 * 0, the transition laid over both. Directions name where the incoming picture moves: `slide-left` comes in from the
 * right edge travelling left.
 */
export type TransitionInfo = { id: string; label: string; description: string };

export const TRANSITIONS = [
  { id: "cut", label: "Cut", description: "No transition: the next scene starts on its first frame." },
  { id: "fade", label: "Crossfade", description: "The next scene fades in over the last frame of this one." },
  { id: "fade-black", label: "Dip to black", description: "Fades down to black, then up into the next scene." },
  { id: "fade-white", label: "Dip to white", description: "Fades up to white, then down into the next scene." },
  { id: "slide-left", label: "Slide left", description: "The next scene slides in from the right over this one, which drifts back and dims." },
  { id: "slide-right", label: "Slide right", description: "The next scene slides in from the left over this one, which drifts back and dims." },
  { id: "slide-up", label: "Slide up", description: "The next scene slides up from the bottom over this one, which drifts back and dims." },
  { id: "slide-down", label: "Slide down", description: "The next scene slides down from the top over this one, which drifts back and dims." },
  { id: "push-left", label: "Push left", description: "The next scene pushes this one out to the left, both moving together." },
  { id: "push-right", label: "Push right", description: "The next scene pushes this one out to the right, both moving together." },
  { id: "push-up", label: "Push up", description: "The next scene pushes this one out of the top, both moving together." },
  { id: "push-down", label: "Push down", description: "The next scene pushes this one out of the bottom, both moving together." },
  { id: "whip-left", label: "Whip left", description: "A fast push to the left with motion blur, like a whip pan." },
  { id: "whip-right", label: "Whip right", description: "A fast push to the right with motion blur, like a whip pan." },
  { id: "zoom-in", label: "Zoom in", description: "This scene pushes in and blurs while the next grows into place over it." },
  { id: "zoom-out", label: "Zoom out", description: "This scene shrinks away and fades, revealing the next settling in from close up." },
  { id: "blur", label: "Blur", description: "This scene blurs out as the next one comes into focus over it." },
  { id: "wipe-left", label: "Wipe left", description: "A soft edge sweeps from right to left, revealing the next scene." },
  { id: "wipe-right", label: "Wipe right", description: "A soft edge sweeps from left to right, revealing the next scene." },
  { id: "wipe-up", label: "Wipe up", description: "A soft edge sweeps from the bottom up, revealing the next scene." },
  { id: "wipe-down", label: "Wipe down", description: "A soft edge sweeps from the top down, revealing the next scene." },
  { id: "iris", label: "Iris", description: "A circle opens from the centre to reveal the next scene." },
] as const satisfies readonly TransitionInfo[];

export type TransitionId = (typeof TRANSITIONS)[number]["id"];

/** One entry of story.json's `transitions`. */
export type StoryTransition = { type: string; frames: number };

/**
 * A transition as the video plays it: into `scene` from `prev`, over video frames [start, start + frames). `frames` is
 * clamped to the incoming scene's length, and is 0 for a cut or a type the engine doesn't know (which plays as a cut).
 */
export type TransitionSpan = { scene: string; prev: string; type: string; frames: number; start: number };

const known = new Set<string>(TRANSITIONS.map((item) => item.id));
export const isTransition = (type: string): type is TransitionId => known.has(type);

/** How the two scenes and an optional overlay look at progress `p` (0 = all outgoing, 1 = all incoming). */
export type TransitionLook = {
  out: CSSProperties;
  in: CSSProperties;
  /** The outgoing scene is drawn over the incoming one. */
  outOnTop?: boolean;
  /** A full-frame colour layer over both (the dips). */
  overlay?: CSSProperties;
  /** A horizontal motion blur in px, for the whips: drawn with an SVG filter the engine adds. */
  smear?: number;
};

const pct = (value: number) => `${+(value * 100).toFixed(3)}%`;
const px = (value: number) => `${+value.toFixed(2)}px`;
const num = (value: number) => +value.toFixed(4);

type Dir = "left" | "right" | "up" | "down";
/** The unit vector a direction moves along, in screen axes. */
const AXIS: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
const shift = ([x, y]: [number, number], by: number) => `${pct(x * by)} ${pct(y * by)}`;

/** The soft-edged mask a wipe reveals the incoming scene through. */
function wipeMask(dir: Dir, e: number) {
  const soft = 18;
  // The gradient runs from the edge the wipe starts at; the visible part grows from there.
  const from = { left: "to left", right: "to right", up: "to top", down: "to bottom" }[dir];
  const edge = e * (100 + soft);
  return `linear-gradient(${from}, #000 ${+(edge - soft).toFixed(3)}%, transparent ${+edge.toFixed(3)}%)`;
}

const masked = (mask: string): CSSProperties => ({ maskImage: mask, WebkitMaskImage: mask });

/** Softens a layer's four edges by `f` (0..1 of the frame's shorter side), so a scaled-down scene isn't a hard card. */
function feathered(f: number, size: { width: number; height: number }): CSSProperties {
  const edge = f * Math.min(size.width, size.height);
  if (edge < 0.5) return {};
  const ramp = (to: string) => `linear-gradient(${to}, transparent, #000 ${px(edge)}, #000 calc(100% - ${px(edge)}), transparent)`;
  const mask = `${ramp("to right")}, ${ramp("to bottom")}`;
  return { maskImage: mask, WebkitMaskImage: mask, maskComposite: "intersect", WebkitMaskComposite: "source-in" };
}

/** The look of one transition at linear progress `p`. `null` for a cut or an unknown type. */
export function transitionLook(type: string, p: number, size: { width: number; height: number }): TransitionLook | null {
  const t = clamp01(p);
  const dir = type.split("-")[1] as Dir;
  switch (type) {
    case "fade":
      return { out: {}, in: { opacity: num(inOutSine(t)) } };
    case "fade-black":
    case "fade-white": {
      const background = type === "fade-black" ? "#000" : "#fff";
      // Down to the colour over the first half, up out of it over the second, each half eased on its own.
      const first = t < 0.5;
      const k = first ? inOutSine(t * 2) : 1 - inOutSine(t * 2 - 1);
      return { out: first ? {} : { visibility: "hidden" }, in: first ? { visibility: "hidden" } : {}, overlay: { background, opacity: num(k) } };
    }
    case "slide-left":
    case "slide-right":
    case "slide-up":
    case "slide-down": {
      const e = inOutQuart(t);
      const axis = AXIS[dir];
      return {
        out: { translate: shift(axis, 0.3 * e), filter: `brightness(${num(1 - 0.45 * e)})` },
        in: { translate: shift(axis, e - 1), boxShadow: `0 0 120px rgba(0,0,0,${num(0.55 * Math.sin(Math.PI * t))})` },
      };
    }
    case "push-left":
    case "push-right":
    case "push-up":
    case "push-down": {
      const e = inOutQuart(t);
      const axis = AXIS[dir];
      return { out: { translate: shift(axis, e) }, in: { translate: shift(axis, e - 1) } };
    }
    case "whip-left":
    case "whip-right": {
      const e = inOutQuint(t);
      const axis = AXIS[dir];
      // Blur follows speed: the slope of the curve, which peaks in the middle of the move.
      const h = 0.01;
      const speed = (inOutQuint(t + h) - inOutQuint(t - h)) / (2 * h);
      return { out: { translate: shift(axis, e) }, in: { translate: shift(axis, e - 1) }, smear: Math.min(speed * size.width * 0.012, 80) };
    }
    case "zoom-in": {
      const e = inOutCubic(t);
      return {
        out: { scale: num(1 + 0.45 * e), filter: `blur(${px(14 * e)})` },
        in: { scale: num(0.82 + 0.18 * outCubic(t)), opacity: num(inOutSine(Math.min(t * 1.25, 1))), ...feathered(0.7 * 0.18 * (1 - outCubic(t)), size) },
      };
    }
    case "zoom-out": {
      const e = inOutCubic(t);
      return {
        out: { scale: num(1 - 0.2 * e), opacity: num(1 - inOutSine(Math.min(t * 1.25, 1))), ...feathered(0.6 * 0.2 * e, size) },
        in: { scale: num(1.35 - 0.35 * outCubic(t)), filter: `blur(${px(14 * (1 - e))})` },
        outOnTop: true,
      };
    }
    case "blur": {
      const e = inOutSine(t);
      return {
        out: { filter: `blur(${px(36 * e)})` },
        in: { opacity: num(e), filter: `blur(${px(36 * (1 - e))})`, scale: num(1.04 - 0.04 * e) },
      };
    }
    case "wipe-left":
    case "wipe-right":
    case "wipe-up":
    case "wipe-down":
      return { out: {}, in: masked(wipeMask(dir, inOutCubic(t))) };
    case "iris": {
      const e = inOutCubic(t);
      const radius = Math.hypot(size.width, size.height) / 2;
      const soft = radius * 0.08;
      const r = e * (radius + soft);
      return {
        out: { scale: num(1 + 0.06 * e) },
        in: { ...masked(`radial-gradient(circle at 50% 50%, #000 ${px(Math.max(r - soft, 0))}, transparent ${px(r)})`), scale: num(1.08 - 0.08 * e) },
      };
    }
    default:
      return null;
  }
}

/** Every transition a story plays, in order. Positions that can't hold one (the first scene, a scene off the story) are skipped. */
export function transitionSpans(
  playing: { id: string; from: number; frames: number }[],
  transitions: Record<string, StoryTransition> | undefined,
): TransitionSpan[] {
  if (!transitions) return [];
  return playing.flatMap((scene, i) => {
    const entry = transitions[scene.id];
    if (i === 0 || !entry || typeof entry.type !== "string") return [];
    const asked = typeof entry.frames === "number" && Number.isFinite(entry.frames) ? Math.round(entry.frames) : 0;
    const frames = isTransition(entry.type) && entry.type !== "cut" ? Math.min(Math.max(asked, 0), scene.frames) : 0;
    return [{ scene: scene.id, prev: playing[i - 1].id, type: entry.type, frames, start: scene.from }];
  });
}
