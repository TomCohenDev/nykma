// bun run hand <slug> [--force]   Traces the texts and paths in src/ads/<slug>/hand.ts into src/ads/<slug>/hand.gen.json.
//
// Each letter is rendered alone in Chromium (shaped with its line, so the letters are the ones the ad shows), thinned to a
// centre line (Zhang-Suen), turned into a graph of line ends and crossings, trimmed of spurs and joined straight through,
// ordered the way a pen would go, smoothed, simplified, extended at the tips and written as Catmull-Rom curves. Letters
// run in logical order, which is writing order: Hebrew comes out right to left and a number inside it left to right.
//
// Cached by text + font + weight + size + direction: entries that haven't changed are kept and cost nothing.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { resolveHandFont, textDirection } from "../src/parts/hand/fonts.ts";
import type { HandEntry, HandGen, HandPathSpec, HandStroke, HandTextSpec, Point } from "../src/parts/hand/types.ts";
import {
  DEFAULT_SIZE, DEFAULT_WEIGHT, TRACER, genPath, graphemes, loadGen, loadManifest, openHandPage, pathKey, textKey,
  type HandPage, type Mask, type TextSetting,
} from "./lib/hand-page.ts";

type Edge = { a: number | null; b: number | null; pts: Point[]; alive: boolean };
type GraphNode = { x: number; y: number; edges: Set<Edge> };
type Glyph = { index: number; text: string; mask: Mask };

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pathLength = (pts: Point[]) => pts.reduce((sum, p, k) => (k ? sum + dist(p, pts[k - 1]) : 0), 0);

/** Zhang-Suen: peels ink down to one-pixel centre lines. */
function thin({ w, h, data }: Mask) {
  const sk = data.slice();
  const nb = (i: number) => [sk[i - w], sk[i - w + 1], sk[i + 1], sk[i + w + 1], sk[i + w], sk[i + w - 1], sk[i - 1], sk[i - w - 1]];
  for (let changed = true; changed; ) {
    changed = false;
    for (const step of [0, 1]) {
      const del: number[] = [];
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!sk[i]) continue;
          const [p2, p3, p4, p5, p6, p7, p8, p9] = nb(i);
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let a = 0;
          for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) a++;
          if (a !== 1) continue;
          if (step === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
          del.push(i);
        }
      for (const i of del) sk[i] = 0;
      if (del.length) changed = true;
    }
  }
  // Slanted lines come out as staircases, whose corner pixels have three neighbours and look like crossings. Take out
  // every pixel whose neighbours still touch each other without it. Spur trimming would otherwise eat along those lines.
  const ring = [-w, -w + 1, 1, w + 1, w, w - 1, -1, -w - 1];
  const at = (offset: number): Point => [((offset % w) + w + 1) % w - 1, Math.round(offset / w)];
  for (let i = w; i < sk.length - w; i++) {
    if (!sk[i]) continue;
    const set = ring.filter((offset) => sk[i + offset]);
    if (set.length < 2) continue;
    const touching = new Set([set[0]]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const a of set) {
        if (touching.has(a)) continue;
        if ([...touching].some((b) => Math.max(Math.abs(at(a)[0] - at(b)[0]), Math.abs(at(a)[1] - at(b)[1])) === 1)) {
          touching.add(a);
          grew = true;
        }
      }
    }
    if (touching.size === set.length) sk[i] = 0;
  }
  return sk;
}

/** Nodes are line ends and crossings (pixels without exactly two neighbours), merged when they touch. Edges are the lines. */
function buildGraph(sk: Uint8Array, w: number, thickness: number) {
  const pixels: number[] = [];
  for (let i = 0; i < sk.length; i++) if (sk[i]) pixels.push(i);
  const around = (i: number) => [i - w, i - w + 1, i + 1, i + w + 1, i + w, i + w - 1, i - 1, i - w - 1].filter((j) => sk[j]);
  const deg = new Map(pixels.map((i) => [i, around(i).length]));
  const xy = (i: number): Point => [i % w, (i / w) | 0];

  const nodeOf = new Map<number, number>();
  const nodes: GraphNode[] = [];
  for (const i of pixels) {
    if (deg.get(i) === 2 || nodeOf.has(i)) continue;
    const id = nodes.length;
    const members = [i];
    nodeOf.set(i, id);
    for (let k = 0; k < members.length; k++)
      for (const j of around(members[k]))
        if (deg.get(j) !== 2 && !nodeOf.has(j)) {
          nodeOf.set(j, id);
          members.push(j);
        }
    const pts = members.map(xy);
    nodes.push({ x: pts.reduce((s, p) => s + p[0], 0) / pts.length, y: pts.reduce((s, p) => s + p[1], 0) / pts.length, edges: new Set() });
  }

  const edges: Edge[] = [];
  const seen = new Set<number>();
  const addEdge = (a: number | null, b: number | null, pts: Point[]) => {
    const edge: Edge = { a, b, pts, alive: true };
    edges.push(edge);
    if (a !== null) nodes[a].edges.add(edge);
    if (b !== null) nodes[b].edges.add(edge);
  };
  for (const [n, node] of [...nodeOf.entries()]) {
    for (const q of around(n)) {
      if (nodeOf.has(q) || seen.has(q)) continue;
      const pts: Point[] = [[nodes[node].x, nodes[node].y], xy(q)];
      seen.add(q);
      let prev = n, cur = q;
      let end: number | null = null;
      for (;;) {
        const next = around(cur).find((j) => j !== prev && !seen.has(j) && !(nodeOf.has(j) && nodeOf.get(j) === node && pts.length < 3));
        if (next === undefined) {
          const back = around(cur).find((j) => nodeOf.has(j) && j !== prev);
          if (back !== undefined) end = nodeOf.get(back)!;
          break;
        }
        if (nodeOf.has(next)) {
          end = nodeOf.get(next)!;
          break;
        }
        seen.add(next);
        pts.push(xy(next));
        prev = cur;
        cur = next;
      }
      if (end !== null) pts.push([nodes[end].x, nodes[end].y]);
      addEdge(node, end, pts);
    }
  }
  // Closed loops with no line end or crossing (o, ס).
  for (const i of pixels) {
    if (seen.has(i) || nodeOf.has(i)) continue;
    const pts = [xy(i)];
    seen.add(i);
    let cur = i;
    for (;;) {
      const next = around(cur).find((j) => !seen.has(j));
      if (next === undefined) break;
      seen.add(next);
      pts.push(xy(next));
      cur = next;
    }
    pts.push(pts[0]);
    addEdge(null, null, pts);
  }

  const alive = (n: number) => [...nodes[n].edges].filter((e) => e.alive);
  const other = (e: Edge, n: number) => (e.a === n ? e.b : e.a);
  // Drop the short spurs thinning leaves at corners, then join lines that pass straight through a node.
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of edges) {
      if (!e.alive || e.a === null) continue;
      const da = alive(e.a).length, db = e.b === null ? 1 : alive(e.b).length;
      if ((da === 1) !== (db === 1) && pathLength(e.pts) < thickness * 0.75) {
        e.alive = false;
        changed = true;
      }
    }
    for (let n = 0; n < nodes.length; n++) {
      const es = alive(n);
      if (es.length !== 2 || es[0] === es[1]) continue;
      const [e1, e2] = es;
      const p1 = e1.b === n ? e1.pts : [...e1.pts].reverse();
      const p2 = e2.a === n ? e2.pts : [...e2.pts].reverse();
      e1.alive = e2.alive = false;
      addEdge(other(e1, n), other(e2, n), [...p1, ...p2.slice(1)]);
      changed = true;
    }
    // Thinning pulls an X apart into two forks a short way apart. Close them up, so a line can run straight through.
    for (const e of edges) {
      if (!e.alive || e.a === null || e.b === null || e.a === e.b || pathLength(e.pts) > thickness * 1.6) continue;
      const [keep, gone] = [e.a, e.b];
      if (alive(keep).length < 3 || alive(gone).length < 3) continue;
      e.alive = false;
      nodes[keep].x = (nodes[keep].x + nodes[gone].x) / 2;
      nodes[keep].y = (nodes[keep].y + nodes[gone].y) / 2;
      for (const f of alive(gone)) {
        if (f.a === gone) f.a = keep;
        if (f.b === gone) f.b = keep;
        nodes[keep].edges.add(f);
      }
      nodes[gone].edges.clear();
      for (const f of alive(keep)) {
        if (f.a === keep) f.pts[0] = [nodes[keep].x, nodes[keep].y];
        if (f.b === keep) f.pts[f.pts.length - 1] = [nodes[keep].x, nodes[keep].y];
      }
      changed = true;
    }
  }
  return { nodes, live: edges.filter((e) => e.alive && pathLength(e.pts) > 2), alive, other };
}

/** Separate pieces of ink: the dot of an i, the two parts of a quote. Sets `labels` and returns each piece's pixels. */
function pieces({ w, data }: Mask) {
  const labels = new Int32Array(data.length).fill(-1);
  const out: number[][] = [];
  for (let i = 0; i < data.length; i++) {
    if (!data[i] || labels[i] >= 0) continue;
    const members = [i];
    labels[i] = out.length;
    for (let k = 0; k < members.length; k++)
      for (const j of [members[k] - w, members[k] + w, members[k] - 1, members[k] + 1, members[k] - w - 1, members[k] - w + 1, members[k] + w - 1, members[k] + w + 1])
        if (data[j] && labels[j] < 0) {
          labels[j] = out.length;
          members.push(j);
        }
    out.push(members);
  }
  return { labels, parts: out };
}

/** Turns on the screen, positive when it runs counter-clockwise (y points down). */
const signedArea = (pts: Point[]) => -pts.reduce((sum, p, k) => sum + p[0] * pts[(k + 1) % pts.length][1] - pts[(k + 1) % pts.length][0] * p[1], 0) / 2;

/** These start on the bowl, at its top, and go round it before the stem. Everything else starts at its top. */
const BOWL_FIRST = "adgq";

/** A closed loop's points, starting at its top right and going off to the left: counter-clockwise, in Latin and Hebrew alike. */
function setOff(loop: Point[]) {
  let k0 = 0;
  loop.forEach((p, k) => {
    if (p[1] - p[0] * 0.5 < loop[k0][1] - loop[k0][0] * 0.5) k0 = k;
  });
  const pts = [...loop.slice(k0, -1), ...loop.slice(0, k0 + 1)];
  return signedArea(pts) < 0 ? pts.reverse() : pts;
}

/** A stroke that sets off round a loop, like an e or a g, goes round it counter-clockwise. */
function roundFirst(pts: Point[], thickness: number) {
  let k = pts.length - 1;
  while (k > 0 && dist(pts[k], pts[0]) > 3) k--;
  if (pathLength(pts.slice(0, k + 1)) < thickness * 4) return pts;
  return signedArea(pts.slice(0, k + 1)) < 0 ? [...pts.slice(0, k + 1).reverse(), ...pts.slice(k + 1)] : pts;
}

/** ח and ת are one line with both ends low, but a Hebrew pen starts at the top left: right across and down, then the left leg. */
function fromCorner(pts: Point[], middle: number, thickness: number): Point[][] {
  const [a, b] = [pts[0], pts[pts.length - 1]];
  if (a[1] < middle || b[1] < middle) return [pts];
  let k = 0;
  pts.forEach((p, i) => {
    if (p[1] + p[0] * 0.5 < pts[k][1] + pts[k][0] * 0.5) k = i;
  });
  if (pathLength(pts.slice(0, k + 1)) < thickness * 2 || pathLength(pts.slice(k)) < thickness * 2) return [pts];
  const [one, two] = [pts.slice(0, k + 1).reverse(), pts.slice(k)];
  return one[one.length - 1][0] > two[two.length - 1][0] ? [one, two] : [two, one];
}

/** Strokes for one letter in the order a pen makes them, starting from where the pen is. */
function orderLetter(glyph: Glyph, thickness: number, pen: Point | null) {
  const { mask } = glyph;
  const { live, alive, other } = buildGraph(thin(mask), mask.w, thickness);
  const { labels, parts } = pieces(mask);
  const xs = parts.flat().map((i) => i % mask.w);
  const ys = parts.flat().map((i) => (i / mask.w) | 0);
  const [minX, minY, maxY] = [Math.min(...xs), Math.min(...ys), Math.max(...ys)];
  const hebrew = /[֐-׿]/.test(glyph.text);

  // Marks come last: the dot of an i goes on once its stem is written, though it sits above it.
  const box = (members: number[]) => {
    const px = members.map((i) => i % mask.w), py = members.map((i) => (i / mask.w) | 0);
    return { size: Math.hypot(Math.max(...px) - Math.min(...px), Math.max(...py) - Math.min(...py)), y: Math.min(...py) };
  };
  const largest = Math.max(...parts.map((members) => box(members).size));
  const pieceOrder = parts
    .map((members, label) => ({ label, members, ...box(members), mark: box(members).size < largest * 0.6 }))
    .sort((a, b) => Number(a.mark) - Number(b.mark) || a.y - b.y);

  /** The longest line from one crossing to another, or back to the same one, or an open one off a crossing: the bowl of an a or a d. */
  const bowlOf = (todo: Set<Edge>) => {
    const longest = (edges: Edge[]) => edges.sort((a, b) => pathLength(b.pts) - pathLength(a.pts))[0];
    const crossing = (n: number | null) => n !== null && alive(n).length > 1;
    const edges = [...todo];
    return longest(edges.filter((e) => e.a !== e.b && crossing(e.a) && crossing(e.b))) ?? edges.find((e) => e.a === e.b) ?? longest(edges.filter((e) => crossing(e.a) || crossing(e.b))) ?? null;
  };

  const strokes: Point[][] = [];
  // A line's heading, read a little way off the crossing, since thinning bends lines as they come into one.
  const heading = (pts: Point[], back: boolean) => {
    const skip = Math.min(pts.length - 2, Math.round(thickness * 0.5));
    const k = Math.min(pts.length - 1, skip + Math.round(thickness));
    const [a, b] = back ? [pts[pts.length - 1 - skip], pts[pts.length - 1 - k]] : [pts[skip], pts[k]];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };

  for (const piece of pieceOrder) {
    // Node points are averages, so only a pixel on the line itself says which piece an edge is in.
    const of = (e: Edge) => {
      const [x, y] = e.pts.find((p) => Number.isInteger(p[0]) && Number.isInteger(p[1])) ?? e.pts[0].map(Math.round);
      return labels[y * mask.w + x];
    };
    const todo = new Set(live.filter((e) => of(e) === piece.label));
    if (!todo.size) {
      // Too small to thin to a line: a short tick through its middle, so it's still written.
      const px = piece.members.map((i) => i % mask.w), py = piece.members.map((i) => (i / mask.w) | 0);
      const c: Point = [px.reduce((s, v) => s + v, 0) / px.length, py.reduce((s, v) => s + v, 0) / py.length];
      strokes.push([[c[0] - 1.5, c[1] - 1.5], [c[0] + 1.5, c[1] + 1.5]]);
      pen = c;
      continue;
    }
    let firstInLetter = !strokes.length;
    while (todo.size) {
      // Start where a pen would: the free line end nearest the pen, favouring the top and the side the text starts on.
      let best: { e: Edge; end: number; score: number } | null = null;
      const bowl = firstInLetter && BOWL_FIRST.includes(glyph.text) ? bowlOf(todo) : null;
      for (const e of bowl ? [bowl] : todo)
        for (const [end, n] of [[0, e.a], [1, e.b]] as const) {
          const p = end ? e.pts[e.pts.length - 1] : e.pts[0];
          const free = n === null || alive(n).filter((f) => todo.has(f)).length === 1 ? 0 : 40;
          const near = pen ? dist(p, pen) * (firstInLetter ? 0.1 : 0.6) : 0;
          // Latin leads from the left. Hebrew's top bars run left to right too, so it doesn't lean either way.
          const side = (p[0] - minX) * (hebrew ? 0.05 : 0.3);
          const score = near + (p[1] - minY) + side + free - Math.min(pathLength(e.pts), 120) * 0.02;
          if (!best || score < best.score) best = { e, end, score };
        }
      const { e, end } = best!;
      let pts = end ? [...e.pts].reverse() : [...e.pts];
      const onlyLoop = e.a === e.b && (e.a === null || alive(e.a).filter((f) => todo.has(f)).length === 1);
      if (onlyLoop) pts = setOff(pts);
      else if (e.a === e.b && signedArea(pts) < 0) pts.reverse();
      todo.delete(e);
      let at = end ? e.a : e.b;
      // Keep the pen down through crossings while the line goes on smoothly.
      while (at !== null) {
        const going = heading(pts, true);
        let pick: { f: Edge; fp: Point[]; bend: number } | null = null;
        for (const f of alive(at)) {
          if (!todo.has(f)) continue;
          // A loop back to this crossing can be taken either way round.
          for (const fp of f.a === f.b ? [f.pts, [...f.pts].reverse()] : [f.a === at ? f.pts : [...f.pts].reverse()]) {
            let turn = Math.abs(heading(fp, false) - (going + Math.PI));
            turn = Math.abs(((turn + Math.PI) % (2 * Math.PI)) - Math.PI);
            const bend = Math.PI - turn;
            if (bend < 1.4 && (!pick || bend < pick.bend)) pick = { f, fp, bend };
          }
        }
        if (!pick) break;
        const { f, fp } = pick;
        todo.delete(f);
        pts = [...pts, ...fp.slice(1)];
        at = other(f, at);
      }
      if (!hebrew) pts = roundFirst(pts, thickness);
      strokes.push(...(hebrew && firstInLetter ? fromCorner(pts, minY + (maxY - minY) / 2, thickness) : [pts]));
      pen = strokes[strokes.length - 1][strokes[strokes.length - 1].length - 1];
      firstInLetter = false;
    }
  }
  return { strokes, pen };
}

/** Takes the pixel steps out. */
const smooth = (pts: Point[]): Point[] =>
  pts.map((p, k) => {
    if (k < 2 || k > pts.length - 3) return p;
    const win = pts.slice(k - 2, k + 3);
    return [win.reduce((s, q) => s + q[0], 0) / 5, win.reduce((s, q) => s + q[1], 0) / 5];
  });

/** Ramer-Douglas-Peucker: keeps only the points that matter. */
function simplify(pts: Point[], eps: number): Point[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const len = dist(a, b);
  if (len < 1) {
    // A closed loop: split it at the point farthest from its start.
    let at = 1;
    pts.forEach((p, k) => {
      if (dist(p, a) > dist(pts[at], a)) at = k;
    });
    return [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)];
  }
  let far = 0, at = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    const d = Math.abs((b[0] - a[0]) * (a[1] - pts[k][1]) - (a[0] - pts[k][0]) * (b[1] - a[1])) / len;
    if (d > far) {
      far = d;
      at = k;
    }
  }
  return far > eps ? [...simplify(pts.slice(0, at + 1), eps).slice(0, -1), ...simplify(pts.slice(at), eps)] : [a, b];
}

/** Thinning stops short of the tips and the mask pen has flat ends: carry each open stroke past both, and a loop past its seam. */
function extend(s: Point[], thickness: number): Point[] {
  if (s.length < 2) return s;
  if (dist(s[0], s[s.length - 1]) < 2) return [...s, ...s.slice(1, Math.min(s.length, 4))];
  const reach = (from: Point, to: Point): Point => {
    const d = dist(from, to) || 1;
    return [from[0] + ((from[0] - to[0]) / d) * thickness * 0.9, from[1] + ((from[1] - to[1]) / d) * thickness * 0.9];
  };
  const k = Math.min(4, s.length - 1);
  return [reach(s[0], s[k]), ...s, reach(s[s.length - 1], s[s.length - 1 - k])];
}

/** Catmull-Rom as cubic Béziers: [start, c1, c2, end] for each span. */
function spans(s: Point[]) {
  const out: [Point, Point, Point, Point][] = [];
  for (let k = 0; k < s.length - 1; k++) {
    const [p0, p1, p2, p3] = [s[Math.max(0, k - 1)], s[k], s[k + 1], s[Math.min(s.length - 1, k + 2)]];
    out.push([p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2]);
  }
  return out;
}

const fixed = (n: number) => n.toFixed(1);

const curve = (s: Point[]) =>
  `M${fixed(s[0][0])} ${fixed(s[0][1])}` + spans(s).map(([, a, b, c]) => `C${fixed(a[0])} ${fixed(a[1])} ${fixed(b[0])} ${fixed(b[1])} ${fixed(c[0])} ${fixed(c[1])}`).join("");

/** The curve as a dense polyline. */
function flatten(s: Point[]): Point[] {
  const out: Point[] = [s[0]];
  for (const [p, a, b, c] of spans(s))
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      out.push([
        u * u * u * p[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * c[0],
        u * u * u * p[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * c[1],
      ]);
    }
  return out;
}

/** Evenly spaced points along a polyline, ends included. */
function resample(line: Point[], step: number): Point[] {
  const total = pathLength(line);
  const count = Math.max(1, Math.round(total / step));
  const out: Point[] = [];
  let k = 1, walked = 0;
  for (let i = 0; i <= count; i++) {
    const want = (total * i) / count;
    while (k < line.length - 1 && walked + dist(line[k - 1], line[k]) < want) {
      walked += dist(line[k - 1], line[k]);
      k++;
    }
    const seg = dist(line[k - 1], line[k]) || 1;
    const t = Math.min(1, (want - walked) / seg);
    out.push([+(line[k - 1][0] + (line[k][0] - line[k - 1][0]) * t).toFixed(1), +(line[k - 1][1] + (line[k][1] - line[k - 1][1]) * t).toFixed(1)]);
  }
  return out;
}

/** How far every pixel lies from a set of points: a two-pass chamfer distance. */
function distanceFrom(seeds: Point[], w: number, h: number) {
  const far = 1e6;
  const field = new Float32Array(w * h).fill(far);
  for (const [x, y] of seeds) {
    const [ix, iy] = [Math.round(x), Math.round(y)];
    if (ix >= 0 && iy >= 0 && ix < w && iy < h) field[iy * w + ix] = 0;
  }
  const [o, d] = [1, Math.SQRT2];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      field[i] = Math.min(field[i], field[i - 1] + o, field[i - w] + o, field[i - w - 1] + d, field[i - w + 1] + d);
    }
  for (let y = h - 2; y > 0; y--)
    for (let x = w - 2; x > 0; x--) {
      const i = y * w + x;
      field[i] = Math.min(field[i], field[i + 1] + o, field[i + w] + o, field[i + w + 1] + d, field[i + w - 1] + d);
    }
  return field;
}

async function traceText(hp: HandPage, spec: HandTextSpec, key: string): Promise<HandEntry> {
  const font = resolveHandFont(spec.font);
  const size = spec.size ?? DEFAULT_SIZE;
  const weight = spec.weight ?? DEFAULT_WEIGHT;
  const dir = spec.dir ?? textDirection(spec.text);
  const base = { text: spec.text, family: font.family, weight, size, dir };

  const pad = Math.round(size * 0.7);
  const W = Math.ceil(await hp.measure(base)) + pad * 2;
  const H = Math.round(size * 2.4);
  const setting: TextSetting = { ...base, x: dir === "rtl" ? W - pad : pad, y: Math.round(size * 1.45) };
  const box: [number, number, number, number] = [0, 0, W, H];

  const glyphs: Glyph[] = [];
  const parts = graphemes(spec.text);
  for (let index = 0; index < parts.length; index++) {
    const mask = await hp.letter(setting, box, index);
    if (mask) glyphs.push({ index, text: parts[index], mask });
  }
  if (!glyphs.length) throw new Error(`${spec.id}: nothing was drawn. Does the font have these letters?`);

  // Stroke thickness: ink over centre line. It sizes the spurs, the tips and the pen.
  let ink = 0, line = 0;
  for (const { mask } of glyphs) {
    ink += mask.data.reduce((s, v) => s + v, 0);
    line += thin(mask).reduce((s, v) => s + v, 0);
  }
  const thickness = ink / line;

  const raw: { pts: Point[]; letter: number }[] = [];
  let pen: Point | null = null;
  for (const glyph of glyphs) {
    const done = orderLetter(glyph, thickness, pen);
    pen = done.pen;
    for (const pts of done.strokes) raw.push({ pts: pts.length < 4 ? pts : simplify(smooth(smooth(smooth(pts))), 0.9), letter: glyph.index });
  }

  // Each stroke's mask pen is as wide as the ink closest to it needs and no wider, or it shows what's next to it early.
  const widths = new Map<number, number>();
  for (const { index, mask } of glyphs) {
    const own = raw.flatMap((r, i) => (r.letter === index ? [i] : []));
    const fields = own.map((i) => distanceFrom(flatten(extend(raw[i].pts, thickness)), W, H));
    const near: number[][] = own.map(() => []);
    for (let i = 0; i < mask.data.length; i++) {
      if (!mask.data[i]) continue;
      let closest = 0;
      for (let k = 1; k < fields.length; k++) if (fields[k][i] < fields[closest][i]) closest = k;
      near[closest].push(fields[closest][i]);
    }
    own.forEach((i, k) => {
      const sorted = near[k].sort((a, b) => a - b);
      widths.set(i, Math.ceil((sorted[Math.floor(sorted.length * 0.998)] ?? thickness / 2) * 2 + 4));
    });
  }

  const strokes: HandStroke[] = raw.map(({ pts, letter }, i) => {
    const whole = extend(pts, thickness);
    return {
      d: curve(whole),
      core: curve(pts),
      len: Math.round(pathLength(flatten(whole))),
      reveal: widths.get(i)!,
      pts: resample(flatten(pts), size / 24),
      letter,
    };
  });
  const reveal = Math.max(...widths.values());

  const all = await hp.ink(setting, box);
  let [minX, maxX, minY, maxY] = [W, 0, H, 0];
  for (let i = 0; i < all.data.length; i++)
    if (all.data[i]) {
      const [x, y] = [i % W, (i / W) | 0];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  const margin = Math.ceil(thickness);
  return {
    kind: "text",
    key,
    viewBox: [minX - margin, minY - margin, maxX - minX + margin * 2, maxY - minY + margin * 2],
    reveal,
    ink: +thickness.toFixed(1),
    strokes,
    text: spec.text,
    font: { family: font.family, src: font.src, weight },
    size,
    dir,
    x: setting.x,
    y: setting.y,
  };
}

async function tracePath(hp: HandPage, spec: HandPathSpec, key: string): Promise<HandEntry> {
  const read = await hp.page.evaluate((paths) => {
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" overflow="visible">${paths.map((d) => `<path d="${d}" fill="none"/>`).join("")}</svg>`;
    return [...document.querySelectorAll("path")].map((path) => {
      const len = path.getTotalLength();
      const count = Math.max(2, Math.round(len / 10));
      const pts = Array.from({ length: count + 1 }, (_, i) => {
        const p = path.getPointAtLength((len * i) / count);
        return [+p.x.toFixed(1), +p.y.toFixed(1)] as [number, number];
      });
      const b = path.getBBox();
      return { len, pts, box: [b.x, b.y, b.x + b.width, b.y + b.height] };
    });
  }, spec.paths);
  const margin = spec.ink;
  const [minX, minY] = [Math.min(...read.map((r) => r.box[0])), Math.min(...read.map((r) => r.box[1]))];
  const [maxX, maxY] = [Math.max(...read.map((r) => r.box[2])), Math.max(...read.map((r) => r.box[3]))];
  return {
    kind: "path",
    key,
    viewBox: [Math.floor(minX - margin), Math.floor(minY - margin), Math.ceil(maxX - minX + margin * 2), Math.ceil(maxY - minY + margin * 2)],
    reveal: spec.ink,
    ink: spec.ink,
    strokes: read.map((r, i) => ({ d: spec.paths[i], core: spec.paths[i], len: Math.round(r.len), reveal: spec.ink, pts: r.pts, letter: -1 })),
  };
}

/** One stroke to a line, so a change in one word is a small diff. */
function serialise(gen: HandGen) {
  const entries = Object.entries(gen.entries).map(([id, { strokes, ...rest }]) => {
    const head = JSON.stringify(rest).slice(1, -1);
    return `    ${JSON.stringify(id)}: {${head}, "strokes": [\n${strokes.map((s) => `      ${JSON.stringify(s)}`).join(",\n")}\n    ]}`;
  });
  return `{\n  "version": ${gen.version},\n  "entries": {\n${entries.join(",\n")}\n  }\n}\n`;
}

const { values, positionals } = parseArgs({ allowPositionals: true, options: { force: { type: "boolean" } } });
const slug = positionals[0];
if (!slug) throw new Error("which ad? bun run hand <slug>");

const manifest = await loadManifest(slug);
const texts = manifest.texts ?? [];
const paths = manifest.paths ?? [];
const ids = [...texts, ...paths].map((spec) => spec.id);
const twice = ids.find((id, i) => ids.indexOf(id) !== i);
if (twice) throw new Error(`hand.ts lists "${twice}" twice`);

const old = values.force ? null : loadGen(slug);
const entries: Record<string, HandEntry> = {};
const keyOf = new Map<string, string>([...texts.map((s) => [s.id, textKey(s)] as const), ...paths.map((s) => [s.id, pathKey(s)] as const)]);
const stale = ids.filter((id) => old?.entries[id]?.key !== keyOf.get(id));

let hp: HandPage | null = null;
if (stale.length) hp = await openHandPage(texts.map((s) => resolveHandFont(s.font)));
try {
  for (const spec of texts) {
    const key = keyOf.get(spec.id)!;
    entries[spec.id] = stale.includes(spec.id) ? await traceText(hp!, spec, key) : old!.entries[spec.id];
  }
  for (const spec of paths) {
    const key = keyOf.get(spec.id)!;
    entries[spec.id] = stale.includes(spec.id) ? await tracePath(hp!, spec, key) : old!.entries[spec.id];
  }
} finally {
  await hp?.close();
}

for (const id of ids) {
  const entry = entries[id];
  console.log(`${stale.includes(id) ? "traced" : "cached"}  ${id.padEnd(16)} ${String(entry.strokes.length).padStart(3)} strokes, reveal ${entry.reveal}, ink ${entry.ink}`);
}
const path = genPath(slug);
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, serialise({ version: TRACER, entries }));
console.log(path);
