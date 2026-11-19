import { useMemo, type CSSProperties } from "react";
import rough from "roughjs";
import type { Options } from "roughjs/bin/core";
import { random, useFrame, useVideo } from "../engine";
import { clamp, easings, prog, type Ease, type Span } from "./time";

type Point = readonly [number, number];
export type RoughShape =
  | { kind: "line"; from: Point; to: Point }
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "ellipse"; cx: number; cy: number; w: number; h: number }
  | { kind: "path"; d: string }
  | { kind: "arrow"; from: Point; to: Point; bend?: number; head?: number } // `bend` pushes the middle sideways, in pixels.
  | { kind: "lasso"; cx: number; cy: number; w: number; h: number; loops?: number }; // A loose circling stroke that overshoots its start.

type Props = {
  shape: RoughShape;
  draw?: Span; // Leave out to show it finished.
  ease?: Ease;
  seed?: number; // Not 0: roughjs reads 0 as "use Math.random".
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  fillStyle?: "hachure" | "solid" | "zigzag" | "cross-hatch" | "dashed" | "zigzag-line"; // No `dots`: roughjs can't seed them.
  options?: Omit<Options, "seed" | "stroke" | "strokeWidth" | "fill" | "fillStyle">;
  style?: CSSProperties;
};

type Op = { op: "move" | "bcurveTo" | "lineTo"; data: number[] };
type OpSet = { type: "path" | "fillPath" | "fillSketch"; ops: Op[] };
type Pen = { d: string; length: number; start: number; fill: boolean };

const generator = rough.generator();

function lassoPoints(cx: number, cy: number, w: number, h: number, loops: number, seed: number) {
  const steps = Math.round(12 * loops) + 2; // Two steps past the full turn, so the end overshoots the start.
  return Array.from({ length: steps }, (_, i): [number, number] => {
    const a = -1.9 + (i / 12) * Math.PI * 2;
    const k = 1 + 0.09 * (2 * random(`lasso-${seed}-${i}`) - 1) - (0.05 * i) / steps;
    return [cx + (Math.cos(a) * w * k) / 2, cy + (Math.sin(a) * h * k) / 2];
  });
}

/** The shape as roughjs op sets. Closed shapes also say which x to mirror around in RTL, so the pen starts on the right. */
function build(shape: RoughShape, seed: number, o: Options): { sets: OpSet[]; mirror?: number } {
  const own = { ...o, seed };
  switch (shape.kind) {
    case "line":
      return { sets: generator.line(...shape.from, ...shape.to, own).sets };
    case "rect":
      return { sets: generator.rectangle(shape.x, shape.y, shape.w, shape.h, own).sets, mirror: shape.x + shape.w / 2 };
    case "ellipse":
      return { sets: generator.ellipse(shape.cx, shape.cy, shape.w, shape.h, own).sets, mirror: shape.cx };
    case "path":
      return { sets: generator.path(shape.d, own).sets };
    case "lasso":
      return { sets: generator.curve(lassoPoints(shape.cx, shape.cy, shape.w, shape.h, shape.loops ?? 1, seed), { ...own, disableMultiStroke: true }).sets, mirror: shape.cx };
    case "arrow": {
      const { from: [x1, y1], to: [x2, y2], bend = 0, head = 26 } = shape;
      const length = Math.hypot(x2 - x1, y2 - y1) || 1;
      const mid: [number, number] = [(x1 + x2) / 2 - ((y2 - y1) / length) * bend, (y1 + y2) / 2 + ((x2 - x1) / length) * bend];
      const shaft = bend ? generator.curve([[x1, y1], mid, [x2, y2]], own) : generator.line(x1, y1, x2, y2, own);
      const [cx, cy] = shaft.sets[0].ops[shaft.sets[0].ops.length - 1].data.slice(-4); // The head follows the curve as it really arrives.
      const angle = Math.atan2(y2 - cy, x2 - cx);
      const barb = (turn: number, s: number) => generator.line(x2, y2, x2 - head * Math.cos(angle + turn), y2 - head * Math.sin(angle + turn), { ...o, seed: s, disableMultiStroke: true }).sets;
      return { sets: [...shaft.sets, ...barb(0.5, seed + 1), ...barb(-0.5, seed + 2)] };
    }
  }
}

function lengthOf(ops: Op[]) {
  let length = 0;
  let [x, y] = [0, 0];
  for (const { op, data } of ops) {
    if (op === "bcurveTo") {
      const [x1, y1, x2, y2, x3, y3] = data;
      let [px, py] = [x, y];
      for (let i = 1; i <= 16; i++) {
        const t = i / 16;
        const u = 1 - t;
        const qx = u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
        const qy = u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
        length += Math.hypot(qx - px, qy - py);
        [px, py] = [qx, qy];
      }
    } else if (op === "lineTo") length += Math.hypot(data[0] - x, data[1] - y);
    [x, y] = data.slice(-2);
  }
  return length;
}

const COMMAND = { move: "M", bcurveTo: "C", lineTo: "L" };
const toD = (ops: Op[]) => ops.map(({ op, data }) => COMMAND[op] + data.map((n) => n.toFixed(2)).join(" ")).join(" ");

/** One pen stroke per sub-path, because a dash pattern restarts at each one. A doubled outline goes all the way round, then round again. */
function strokes(sets: OpSet[], doubled: boolean) {
  const pens: Pen[] = [];
  const add = (set: OpSet, fill: boolean) => {
    const subs: Op[][] = [];
    for (const op of set.ops) {
      if (op.op === "move") subs.push([]);
      subs[subs.length - 1].push(op);
    }
    const order = doubled && !fill ? [...subs.filter((_, i) => i % 2 === 0), ...subs.filter((_, i) => i % 2 === 1)] : subs;
    for (const ops of order) pens.push({ d: toD(ops), length: lengthOf(ops), start: 0, fill });
  };
  sets.filter((set) => set.type === "path").forEach((set) => add(set, false));
  sets.filter((set) => set.type === "fillSketch").forEach((set) => add(set, true));
  let total = 0;
  for (const pen of pens) {
    pen.start = total;
    total += pen.length;
  }
  return { pens, total, solid: sets.filter((set) => set.type === "fillPath").map((set) => toD(set.ops)) };
}

/** Hand-sketched shapes that draw on over `draw`, in the parent's pixels. The same seed always gives the same wobble. */
export function Rough({ shape, draw, ease = easings.inOutSine, seed = 1, stroke = "currentColor", strokeWidth = 4, fill, fillStyle, options, style }: Props) {
  if (!seed) throw new Error("Rough: seed must not be 0, roughjs would fall back to Math.random");
  const frame = useFrame();
  const { dir } = useVideo();
  const key = JSON.stringify([shape, seed, strokeWidth, fill, fillStyle, options, dir]);
  const { pens, total, solid } = useMemo(() => {
    const { sets, mirror } = build(shape, seed, { strokeWidth, fill, fillStyle, ...options });
    if (dir === "rtl" && mirror !== undefined) {
      for (const set of sets) for (const op of set.ops) op.data = op.data.map((n, i) => (i % 2 ? n : 2 * mirror - n));
    }
    return strokes(sets, !options?.disableMultiStroke);
  }, [key]);

  const p = draw ? prog(frame, draw, ease) : 1;
  const head = p * total;
  return (
    <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none", ...style }}>
      {solid.map((d, i) => <path key={i} d={d} fill={fill} opacity={clamp(p * 4 - 3)} />)}
      {pens.map((pen, i) => {
        const shown = clamp(head - pen.start, 0, pen.length);
        if (shown <= 0) return null;
        return (
          <path
            key={i}
            d={pen.d}
            fill="none"
            stroke={pen.fill ? fill : stroke}
            strokeWidth={pen.fill ? (options?.fillWeight ?? strokeWidth / 2) : strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={pen.length}
            strokeDasharray={shown < pen.length ? `${shown} ${pen.length}` : undefined}
          />
        );
      })}
    </svg>
  );
}
