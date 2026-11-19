import type { Layout, Ratio } from "../../engine";
import { handEntry, type HandEntry, type HandTextSpec } from "../../parts/hand";
import type { CamKey } from "../../parts/camera";

/** Every frame the ad turns on. 100 BPM at 30 fps is 18 frames a beat, and the big moments sit on beats. */
export const T = {
  g1: [3, 70],
  arrow1: [72, 86],
  g2: [93, 160],
  arrow2: [162, 176],
  q: [184, 244],
  proof: [252, 274],
  crash: 432,
  circle: [444, 468],
  red1: [472, 482],
  red2: [486, 504],
  c: [510, 572],
  open: 594, // The desk starts to go.
  openDone: 654,
  words: [612, 650],
  chrome: 652,
  drag: [668, 690],
  bar: 692,
  click: 714,
  answer: [738, 754],
  tag: [758, 790],
  strike: [794, 804],
  away: 818, // The camera lets go.
  veil: [832, 846],
  card: 846,
  qed: [862, 884],
  end: 900,
} as const;

export const FRAMES = T.end;

/** Hebrew from the right, word by word, faster as it goes. */
export const HE_WRITES = [
  { id: "w1", write: [278, 322] },
  { id: "w2", write: [326, 346] },
  { id: "w3", write: [350, 428] },
] as const;

/** The equation from the left, term by term. */
export const MATH_WRITES = [
  { id: "m1", write: [278, 298] },
  { id: "m1s", write: [300, 307] },
  { id: "m2", write: [310, 322] },
  { id: "m3", write: [326, 352] },
  { id: "m4", write: [356, 368] },
  { id: "m5", write: [372, 394] },
  { id: "m6", write: [398, 410] },
  { id: "m7", write: [414, 428] },
] as const;

export type Row = { id: string; base: number };

type Geometry = {
  page: readonly [number, number]; // Paper's left and right edges.
  margin: number; // The red line.
  right: number; // Where Hebrew starts.
  left: number; // Where the equation starts.
  he: number;
  g1: Row[];
  arrow1: number;
  g2: Row[];
  arrow2: number;
  arrowWidth: number;
  q: Row[];
  proof: Row;
  proofOnCrash: boolean;
  c: Row[];
  crashBase: number;
  crashHe: readonly [number, number, number]; // Sizes of the three words, squeezed.
  crashMath: readonly number[]; // Sizes of the seven terms, squeezed.
  crashLift: readonly number[]; // How far each term climbs.
  circleWidth: number;
  redRight: number;
  redBase: number;
  red: number;
  relaxHe: number;
  eq: { base: number; size: number; right?: number; left?: number };
  open: { right: number; base: number; size: number };
  answer: { base: number; size: number };
  tag: { right: number; base: number; size: number };
  ui: number; // App chrome scale.
  toolbarTop: number;
  toolbarUi?: number; // Smaller than the bar, where the frame has no room for both at full size.
  zoomBottom: number; // 0 leaves it out.
  barLeft?: number; // 9x16 frames the bar from its left end.
  barItems: number; // How many of the nine fit the frame.
    cam: CamKey[];
  end: { top: number; mark: number; tag: number; url: number; price: number; gap: number; qed: { left: number; base: number; size: number } };
};

const E = 18; // A beat.

export const L: Layout<Geometry> = {
  "16x9": {
    page: [150, 1770],
    margin: 1650,
    right: 1622,
    left: 200,
    he: 110,
    g1: [{ id: "g1", base: 170 }],
    arrow1: 196,
    g2: [{ id: "g2", base: 350 }],
    arrow2: 376,
    arrowWidth: 560,
    q: [{ id: "q", base: 530 }],
    proof: { id: "proof", base: 690 },
    proofOnCrash: true,
    c: [{ id: "c", base: 960 }],
    crashBase: 690,
    crashHe: [100, 84, 66],
    crashMath: [120, 120, 112, 92, 78, 62, 54],
    crashLift: [0, 0, 0, 6, 16, 34, 62],
    circleWidth: 640,
    redRight: 1120,
    redBase: 836,
    red: 100,
    relaxHe: 110,
    eq: { base: 690, size: 118, left: -930 },
    open: { right: 120, base: 350, size: 112 },
    answer: { base: 850, size: 118 },
    tag: { right: 120, base: 1010, size: 104 },
    ui: 1.6,
    toolbarTop: 30,
    zoomBottom: 44,
    barItems: 9,
    cam: [
      { f: 0, cx: 1250, cy: 200, z: 1.5 },
      { f: 74, cx: 900, cy: 200, z: 1.5 },
      { f: 100, cx: 960, cy: 300, z: 1.2 },
      { f: 180, cx: 960, cy: 330, z: 1.2 },
      { f: 250, cx: 960, cy: 470, z: 1.08 },
      { f: 290, cx: 960, cy: 540, z: 1 },
      { f: T.crash, cx: 860, cy: 640, z: 1.42 },
      { f: T.crash + E, cx: 860, cy: 640, z: 1.42 },
      { f: T.crash + 3 * E, cx: 960, cy: 620, z: 1.1 },
      { f: T.open, cx: 960, cy: 620, z: 1 },
      { f: T.openDone + 6, cx: 327, cy: 610, z: 0.66 },
      { f: T.away, cx: 327, cy: 610, z: 0.66 },
      { f: T.card, cx: 327, cy: 610, z: 0.28 },
    ],
    end: { top: 190, mark: 170, tag: 112, url: 60, price: 44, gap: 52, qed: { left: 300, base: 985, size: 110 } },
  },
  "1x1": {
    page: [40, 1040],
    margin: 935,
    right: 908,
    left: 76,
    he: 69,
    g1: [{ id: "g1", base: 130 }],
    arrow1: 150,
    g2: [{ id: "g2", base: 280 }],
    arrow2: 300,
    arrowWidth: 380,
    q: [{ id: "q", base: 430 }],
    proof: { id: "proof", base: 570 },
    proofOnCrash: true,
    c: [{ id: "c", base: 830 }],
    crashBase: 570,
    crashHe: [62, 50, 40],
    crashMath: [78, 78, 72, 58, 50, 40, 34],
    crashLift: [0, 0, 0, 4, 12, 24, 44],
    circleWidth: 430,
    redRight: 640,
    redBase: 690,
    red: 76,
    relaxHe: 69,
    eq: { base: 1060, size: 100, left: -300 },
    open: { right: 42, base: 300, size: 72 },
    answer: { base: 1200, size: 100 },
    tag: { right: 908, base: 1200, size: 76 },
    ui: 1.75,
    toolbarTop: 24,
    zoomBottom: 0,
    barItems: 9,
    cam: [
      { f: 0, cx: 690, cy: 170, z: 1.5 },
      { f: 74, cx: 460, cy: 170, z: 1.5 },
      { f: 100, cx: 495, cy: 260, z: 1.12 },
      { f: 180, cx: 495, cy: 290, z: 1.12 },
      { f: 250, cx: 540, cy: 420, z: 1.04 },
      { f: 290, cx: 540, cy: 540, z: 1 },
      { f: T.crash, cx: 482, cy: 530, z: 1.3 },
      { f: T.crash + E, cx: 482, cy: 530, z: 1.3 },
      { f: T.crash + 3 * E, cx: 540, cy: 560, z: 1.08 },
      { f: T.open, cx: 540, cy: 540, z: 1 },
      { f: T.openDone + 6, cx: 300, cy: 600, z: 0.76 },
      { f: T.away, cx: 300, cy: 600, z: 0.76 },
      { f: T.card, cx: 300, cy: 600, z: 0.3 },
    ],
    end: { top: 200, mark: 120, tag: 92, url: 54, price: 42, gap: 44, qed: { left: 142, base: 950, size: 96 } },
  },
  "9x16": {
    page: [30, 1050],
    margin: 985,
    right: 955,
    left: 76,
    he: 110,
    g1: [{ id: "g1a", base: 330 }, { id: "g1b", base: 450 }],
    arrow1: 476,
    g2: [{ id: "g2a", base: 610 }, { id: "g2b", base: 730 }],
    arrow2: 756,
    arrowWidth: 460,
    q: [{ id: "qa", base: 908 }, { id: "qb", base: 1028 }],
    proof: { id: "proof", base: 1148 },
    proofOnCrash: false,
    c: [{ id: "ca", base: 1508 }, { id: "cb", base: 1628 }],
    crashBase: 1278,
    crashHe: [100, 74, 56],
    crashMath: [112, 112, 96, 72, 58, 44, 36],
    crashLift: [0, 0, 0, 6, 14, 30, 54],
    circleWidth: 560,
    redRight: 800,
    redBase: 1396,
    red: 90,
    relaxHe: 104,
    eq: { base: 2135, size: 140, left: -430 },
    open: { right: 955, base: 1785, size: 104 },
    answer: { base: 2292, size: 140 },
    tag: { right: 955, base: 2392, size: 96 },
    ui: 2.42,
    toolbarTop: 206,
    toolbarUi: 1.7,
    zoomBottom: 0,
    barLeft: 70,
    barItems: 6,
    cam: [
      { f: 0, cx: 640, cy: 430, z: 1.3 },
      { f: 74, cx: 480, cy: 480, z: 1.3 },
      { f: 100, cx: 570, cy: 640, z: 1.04 },
      { f: 180, cx: 570, cy: 700, z: 1.04 },
      { f: 250, cx: 550, cy: 900, z: 1 },
      { f: 290, cx: 550, cy: 960, z: 1 },
      { f: T.crash, cx: 490, cy: 1180, z: 1.25 },
      { f: T.crash + E, cx: 490, cy: 1180, z: 1.25 },
      { f: T.crash + 3 * E, cx: 560, cy: 1040, z: 0.97 },
      { f: T.open, cx: 560, cy: 990, z: 0.95 },
      { f: T.openDone + 6, cx: 300, cy: 1356, z: 0.6 },
      { f: T.away, cx: 300, cy: 1356, z: 0.6 },
      { f: T.card, cx: 300, cy: 1356, z: 0.26 },
    ],
    end: { top: 470, mark: 120, tag: 112, url: 60, price: 44, gap: 52, qed: { left: 160, base: 1270, size: 110 } },
  },
};

const entry = (id: string): HandEntry => handEntry("mashal", id);

/** A box's width at a font size. */
export const widthAt = (id: string, size: number) => {
  const e = entry(id);
  return (e.viewBox[2] * size) / e.size!;
};

/** Where a text goes: its box's left edge, and the baseline. */
export type Place = { x: number; base: number; size: number };

const GAP = 0.2;

function flowLeft(ids: readonly string[], sizes: readonly number[], right: number, base: number, lifts: readonly number[] = []): Place[] {
  let at = right;
  return ids.map((id, i) => {
    const w = widthAt(id, sizes[i]);
    const place = { x: at - w, base: base - (lifts[i] ?? 0), size: sizes[i] };
    at -= w + sizes[i] * GAP;
    return place;
  });
}

function flowRight(ids: readonly string[], sizes: readonly number[], left: number, base: number, lifts: readonly number[] = []): Place[] {
  let at = left;
  return ids.map((id, i) => {
    const place = { x: at, base: base - (lifts[i] ?? 0), size: sizes[i] };
    at += widthAt(id, sizes[i]) + sizes[i] * (i === SUP.index - 1 ? -0.1 : GAP);
    return place;
  });
}

/** The exponent: a small 2 tucked up against the x. */
const SUP = { index: 1, size: 0.56, lift: 0.5 };
const withSup = (sizes: readonly number[], lifts: readonly number[]) => {
  const big = [sizes[0], sizes[0] * SUP.size, ...sizes.slice(1)];
  const up = [lifts[0], sizes[0] * SUP.lift, ...lifts.slice(1)];
  return { big, up };
};

const HE_IDS = HE_WRITES.map(({ id }) => id);
const MATH_IDS = MATH_WRITES.map(({ id }) => id);

export type Plan = {
  proof: Place;
  heCrash: Place[];
  heRelax: Place[];
  mathCrash: Place[];
  mathRelax: Place[];
  wreck: { x: number; y: number };
  source: { left: number; right: number; top: number; bottom: number };
};

const memo = new Map<Ratio, Plan>();

/** The crash line in both of its states, worked out from the traced widths. */
export function plan(ratio: Ratio): Plan {
  const known = memo.get(ratio);
  if (known) return known;
  const g = L[ratio];
  const proofWidth = widthAt("proof", g.he);
  const proofRight = g.right;
  const proof = { x: proofRight - proofWidth, base: g.proof.base, size: g.he };
  const heStart = g.proofOnCrash ? proof.x - g.he * 0.28 : g.right;
  const heCrash = flowLeft(HE_IDS, g.crashHe, heStart, g.crashBase, [0, 0, -8]);
  const crashed = withSup(g.crashMath, g.crashLift);
  const mathCrash = flowRight(MATH_IDS, crashed.big, g.left, g.crashBase, crashed.up);
  const heRelax = flowLeft(HE_IDS, HE_IDS.map(() => g.relaxHe), heStart, g.crashBase);
  const fits = withSup(MATH_IDS.slice(1).map(() => g.eq.size), MATH_IDS.slice(1).map(() => 0));
  const measured = flowRight(MATH_IDS, fits.big, 0, 0);
  const eqWidth = measured.at(-1)!.x + widthAt("m7", g.eq.size);
  const eqLeft = g.eq.left ?? heRelax[2].x - g.relaxHe * 0.5 - eqWidth;
  const mathRelax = flowRight(MATH_IDS, fits.big, eqLeft, g.eq.base, fits.up);
  const lastMath = mathCrash.at(-1)!;
  const lastHe = heCrash.at(-1)!;
  const wreck = { x: (lastMath.x + widthAt("m7", lastMath.size) + lastHe.x + widthAt("w3", lastHe.size)) / 2 - widthAt("w3", lastHe.size) / 3, y: g.crashBase - 30 };
  const source = { left: eqLeft - 16, right: eqLeft + eqWidth + 16, top: g.eq.base - g.eq.size * 1.02, bottom: g.eq.base + g.eq.size * 0.28 };
  const result = { proof, heCrash, heRelax, mathCrash, mathRelax, wreck, source };
  memo.set(ratio, result);
  return result;
}

/** Splits a span across rows by their widths, leaving the pen a few frames in the air between them. */
export function splitWrite(rows: Row[], [a, b]: readonly [number, number]) {
  const air = 5;
  const widths = rows.map(({ id }) => entry(id).viewBox[2]);
  const total = widths.reduce((sum, w) => sum + w, 0);
  const ink = b - a - air * (rows.length - 1);
  let at = a;
  return rows.map((row, i) => {
    const length = Math.round((ink * widths[i]) / total);
    const write = [at, at + length] as const;
    at += length + air;
    return { ...row, write };
  });
}

export type { HandTextSpec };
