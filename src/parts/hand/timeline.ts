import type { HandEntry } from "./types.ts";

/** A steady pen, from the portfolio: speeds up over the first 15% of the word, holds one speed, slows over the last 15%. */
const RAMP = 0.15;
const PEAK = 1 / (1 - RAMP);
export const steadyPen = (t: number) =>
  t < RAMP ? (PEAK * t * t) / (2 * RAMP) : t < 1 - RAMP ? PEAK * (t - RAMP / 2) : 1 - (PEAK * (1 - t) ** 2) / (2 * RAMP);

/** The pen covers ground in the air about three times as fast as on the page. */
const AIR = 0.35;

const clamp01 = (t: number) => Math.min(Math.max(t, 0), 1);

/** Where each stroke sits on the one continuous run of the pen, in pen units, gaps in the air included. */
export type PenPlan = { total: number; spans: { from: number; to: number }[] };

const plans = new WeakMap<HandEntry, PenPlan>();

export function penPlan(entry: HandEntry): PenPlan {
  const known = plans.get(entry);
  if (known) return known;
  let at = 0;
  const spans = entry.strokes.map((stroke, i) => {
    if (i) {
      const last = entry.strokes[i - 1].pts.at(-1)!;
      at += Math.hypot(stroke.pts[0][0] - last[0], stroke.pts[0][1] - last[1]) * AIR;
    }
    const from = at;
    at += stroke.len;
    return { from, to: at };
  });
  const plan = { total: at, spans };
  plans.set(entry, plan);
  return plan;
}

/** Share of the run done at a frame. A pure function of the frame: nothing here keeps time. */
export const writeClock = (frame: number, [a, b]: readonly [number, number]) => steadyPen(clamp01((frame - a) / Math.max(b - a, 1)));

/** How to run the pen. `erase: true` runs `write` backwards; `erase: [c, d]` writes over `write`, then unwrites over `[c, d]`. */
export type PenRun = { write: readonly [number, number]; erase?: boolean | readonly [number, number] };

/** Pen position along the run at a frame, in pen units. */
export function penProgress(entry: HandEntry, frame: number, { write, erase }: PenRun) {
  const { total } = penPlan(entry);
  if (erase === true) return total * (1 - writeClock(frame, write));
  if (erase && frame >= erase[0]) return total * (1 - writeClock(frame, erase));
  return total * writeClock(frame, write);
}

/** The frames the pen is busy, for showing the stylus. */
export const penBusy = ({ write, erase }: PenRun): [number, number] => (erase && erase !== true ? [write[0], erase[1]] : [write[0], write[1]]);

export type PenTip = {
  /** In the entry's own units. */
  x: number;
  y: number;
  /** Direction of travel, in radians. */
  angle: number;
  /** 0 on the page, up to 1 at the top of a hop between strokes. */
  air: number;
  /** The stroke it's on, or the next one when in the air. */
  stroke: number;
};

function pointAlong(pts: [number, number][], t: number) {
  const at = clamp01(t) * (pts.length - 1);
  const k = Math.min(Math.floor(at), pts.length - 2);
  const [a, b] = [pts[Math.max(k, 0)], pts[Math.min(k + 1, pts.length - 1)]];
  const f = at - k;
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, angle: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

/** Where the pen is for a position along the run. */
export function penAt(entry: HandEntry, progress: number): PenTip {
  const { spans } = penPlan(entry);
  for (let i = 0; i < spans.length; i++) {
    const { from, to } = spans[i];
    if (progress <= to) {
      if (progress >= from) return { ...pointAlong(entry.strokes[i].pts, (progress - from) / (to - from)), air: 0, stroke: i };
      if (!i) return { ...pointAlong(entry.strokes[0].pts, 0), air: 0, stroke: 0 };
      const last = entry.strokes[i - 1].pts.at(-1)!;
      const next = entry.strokes[i].pts[0];
      const t = (progress - spans[i - 1].to) / (from - spans[i - 1].to);
      return {
        x: last[0] + (next[0] - last[0]) * t,
        y: last[1] + (next[1] - last[1]) * t,
        angle: Math.atan2(next[1] - last[1], next[0] - last[0]),
        air: Math.sin(Math.PI * t),
        stroke: i,
      };
    }
  }
  const lastStroke = entry.strokes.length - 1;
  return { ...pointAlong(entry.strokes[lastStroke].pts, 1), air: 0, stroke: lastStroke };
}

/** The frame the pen reaches a share of the run: `steadyPen` undone by bisection. Sound uses it to land on the strokes. */
export function frameAt(share: number, [a, b]: readonly [number, number]) {
  let [lo, hi] = [0, 1];
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (steadyPen(mid) < share) lo = mid;
    else hi = mid;
  }
  return a + ((lo + hi) / 2) * (b - a);
}
