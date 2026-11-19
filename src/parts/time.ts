/** Frame math: `interpolate`, easings, `prog(f, [a, b])`, a closed-form `spring`. Numbers in, numbers out. */
export type Ease = (t: number) => number;
export type Span = readonly [number, number];

export const clamp = (x: number, min = 0, max = 1) => Math.min(Math.max(x, min), max);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

const inOut = (p: number): Ease => (t) => (t < 0.5 ? (2 * t) ** p / 2 : 1 - (2 * (1 - t)) ** p / 2);
const out = (p: number): Ease => (t) => 1 - (1 - t) ** p;
const into = (p: number): Ease => (t) => t ** p;

export const easings = {
  linear: ((t) => t) as Ease,
  inQuad: into(2),
  outQuad: out(2),
  inOutQuad: inOut(2),
  inCubic: into(3),
  outCubic: out(3),
  inOutCubic: inOut(3),
  inQuart: into(4),
  outQuart: out(4),
  inOutQuart: inOut(4),
  inOutSine: ((t) => (1 - Math.cos(Math.PI * t)) / 2) as Ease,
  outExpo: ((t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))) as Ease,
  outBack: ((t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2) as Ease,
};

/** The default ease everywhere: `easings.inOutCubic`. */
export const ease = easings.inOutCubic;

/** Maps `x` through matching `input` and `output` stops. Clamps at the ends unless `extend` is set. */
export function interpolate(x: number, input: readonly number[], output: readonly number[], { ease: e = easings.linear, extend = false }: { ease?: Ease; extend?: boolean } = {}) {
  const last = input.length - 2;
  let i = 0;
  while (i < last && x >= input[i + 1]) i++;
  const t = (x - input[i]) / (input[i + 1] - input[i]);
  const k = t >= 0 && t <= 1 ? e(t) : extend ? t : clamp(t);
  return lerp(output[i], output[i + 1], k);
}

/** Eased 0..1 progress of frame `f` through a span. */
export const prog = (f: number, [a, b]: Span, e: Ease = ease) => e(clamp((f - a) / Math.max(b - a, 1e-6)));

/** The two `{ f }` keys around frame `f`, and the eased 0..1 between them. A key's `ease` shapes the leg into it. */
export function between<K extends { f: number; ease?: Ease }>(f: number, keys: readonly K[]): [K, K, number] {
  const next = keys.findIndex((key) => f < key.f);
  if (next === 0) return [keys[0], keys[0], 0];
  if (next === -1) return [keys[keys.length - 1], keys[keys.length - 1], 0];
  const [a, b] = [keys[next - 1], keys[next]];
  return [a, b, (b.ease ?? ease)((f - a.f) / (b.f - a.f))];
}

/** A damped spring at frame `f`, solved exactly, so any frame can be asked for in any order. */
export function spring(f: number, { fps = 30, from = 0, to = 1, stiffness = 100, damping = 10, mass = 1 } = {}) {
  const t = Math.max(f, 0) / fps;
  const w = Math.sqrt(stiffness / mass);
  const z = damping / (2 * Math.sqrt(stiffness * mass));
  let rest: number; // How far is left to travel: 1 at the start, settling to 0.
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    rest = Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
  } else if (z === 1) {
    rest = Math.exp(-w * t) * (1 + w * t);
  } else {
    const r = w * Math.sqrt(z * z - 1);
    const [s1, s2] = [-z * w + r, -z * w - r];
    rest = (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1);
  }
  return lerp(from, to, 1 - rest);
}
