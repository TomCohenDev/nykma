/** The three output shapes. An id ends in one of these: `<slug>[-<take>]-<ratio>`. */
export type Ratio = "16x9" | "1x1" | "9x16";

export const RATIOS: Ratio[] = ["16x9", "1x1", "9x16"];

export const SIZES: Record<Ratio, { width: number; height: number }> = {
  "16x9": { width: 1920, height: 1080 },
  "1x1": { width: 1080, height: 1080 },
  "9x16": { width: 1080, height: 1920 },
};

/** Per-ratio framing: `const L: Layout<{ title: number }> = { ... }`, then `L[ratio].title`. */
export type Layout<T> = Record<Ratio, T>;
