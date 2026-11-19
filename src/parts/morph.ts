/**
 * Shape morphs: one closed outline turning into another, as an SVG path `d` for frame math.
 * `<path d={morph(rect(0, 0, 300, 600, 40), ellipse(150, 300, 120), prog(f, [10, 40], ease))} />`
 * turns a phone-shaped card into a disc. Both shapes are resampled to the same number of points
 * along their length, and the second is turned so its points line up with the first's, so the
 * morph doesn't twist. Numbers in, a string out: the same frame gives the same path.
 */
import { lerp } from "./time";

export type Pt = readonly [number, number];
export type Outline = readonly Pt[];

/** A rectangle, with rounded corners when `r` is set. Clockwise from the top-left. */
export function rect(x: number, y: number, w: number, h: number, r = 0, steps = 8): Outline {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!rr) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const corners: [number, number, number][] = [
    [x + w - rr, y + rr, -Math.PI / 2],
    [x + w - rr, y + h - rr, 0],
    [x + rr, y + h - rr, Math.PI / 2],
    [x + rr, y + rr, Math.PI],
  ];
  const pts: Pt[] = [];
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * (Math.PI / 2);
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
  return pts;
}

/** An ellipse (a circle when `ry` is left out), clockwise from the top. */
export function ellipse(cx: number, cy: number, rx: number, ry = rx, steps = 64): Outline {
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * Math.PI * 2;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

/** A regular polygon or star: `points` tips, with `inner` as the inner radius for a star. */
export function star(cx: number, cy: number, r: number, points = 5, inner = r): Outline {
  const n = inner === r ? points : points * 2;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const rad = inner !== r && i % 2 ? inner : r;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}

/** `n` points spread evenly along a closed outline's length. */
export function resample(shape: Outline, n: number): Pt[] {
  const m = shape.length;
  const lens = [0];
  for (let i = 0; i < m; i++) {
    const [ax, ay] = shape[i];
    const [bx, by] = shape[(i + 1) % m];
    lens.push(lens[i] + Math.hypot(bx - ax, by - ay));
  }
  const total = lens[m] || 1;
  const out: Pt[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * total;
    while (seg < m - 1 && lens[seg + 1] < d) seg++;
    const t = (d - lens[seg]) / (lens[seg + 1] - lens[seg] || 1);
    const [ax, ay] = shape[seg];
    const [bx, by] = shape[(seg + 1) % m];
    out.push([lerp(ax, bx, t), lerp(ay, by, t)]);
  }
  return out;
}

function align(a: Pt[], b: Pt[]): Pt[] {
  let best = 0;
  let bestCost = Infinity;
  for (let s = 0; s < b.length; s++) {
    let cost = 0;
    for (let i = 0; i < a.length; i++) {
      const [bx, by] = b[(i + s) % b.length];
      cost += (a[i][0] - bx) ** 2 + (a[i][1] - by) ** 2;
    }
    if (cost < bestCost) [best, bestCost] = [s, cost];
  }
  return a.map((_, i) => b[(i + best) % b.length]);
}

const toPath = (pts: readonly Pt[]) => `M${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join("L")}Z`;

/** The outline `k` of the way (0..1) from `from` to `to`, as an SVG path `d`. */
export function morph(from: Outline, to: Outline, k: number, n = 96): string {
  const a = resample(from, n);
  const b = align(a, resample(to, n));
  return toPath(a.map(([x, y], i) => [lerp(x, b[i][0], k), lerp(y, b[i][1], k)] as const));
}

/** An outline as an SVG path `d`, for drawing a shape from this file without morphing it. */
export const outlinePath = (shape: Outline) => toPath(shape);
