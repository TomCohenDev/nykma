/** A number in [0, 1) that depends only on the seed. In a loop, vary it: random(`star-${i}`). */
export function random(seed: number | string): number {
  let h = 0x811c9dc5;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193);
  // A finaliser, so neighbouring seeds don't give neighbouring numbers.
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
