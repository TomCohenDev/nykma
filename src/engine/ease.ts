/** The curves transitions and `data-fx` move on. Plain numbers in and out, 0..1 for t. */

export const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);

export const linear = (t: number) => clamp01(t);
export const inQuad = (t: number) => clamp01(t) ** 2;
export const outQuad = (t: number) => 1 - (1 - clamp01(t)) ** 2;
export const inCubic = (t: number) => clamp01(t) ** 3;
export const outCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;
export const inOutSine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
export const inOutCubic = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};
export const inOutQuart = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2;
};
export const inOutQuint = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2;
};
export const outExpo = (t: number) => {
  const x = clamp01(t);
  return x === 1 ? 1 : 1 - 2 ** (-10 * x);
};
export const inExpo = (t: number) => {
  const x = clamp01(t);
  return x === 0 ? 0 : 2 ** (10 * x - 10);
};

const C1 = 1.70158;
/** Overshoots by about 10% and settles. */
export const outBack = (t: number) => {
  const x = clamp01(t) - 1;
  return 1 + (C1 + 1) * x ** 3 + C1 * x ** 2;
};
/** Pulls back about 10% before it goes. */
export const inBack = (t: number) => {
  const x = clamp01(t);
  return (C1 + 1) * x ** 3 - C1 * x ** 2;
};

/** A damped spring (damping ratio 0.55) that overshoots by about 12%, rings once and is at rest by t = 1. */
export const spring = (t: number) => {
  const x = clamp01(t);
  if (x === 1) return 1;
  const zeta = 0.55;
  const omega = 11;
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * x) * (Math.cos(damped * x) + ((zeta * omega) / damped) * Math.sin(damped * x));
};
