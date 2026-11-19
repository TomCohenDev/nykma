import type { HandManifest, HandTextSpec } from "../../parts/hand/types.ts";

const VIRGIL = { family: "Virgil", src: "ads/newton-lesson/Virgil-Regular.woff2" };
const v = (id: string, text: string): HandTextSpec => ({ id, text, font: VIRGIL, size: 220, weight: 400, dir: "ltr" });

/**
 * What `bun run hand newton-lesson` traces, in the app's hand (Virgil): everything the teacher writes on the canvas.
 * Subscripts (μ with k or s) and the square in m/s² are written as their own small pieces, never as glyphs.
 * m = 5 kg, F = 30 N, μk = 0.2, μs = 0.3, g = 10 m/s².
 */
export default {
  texts: [
    v("plan-title", "Lesson 4: Newton's laws"),
    v("plan-1", "1. forces"),
    v("plan-2", "2. second law"),
    v("plan-3", "3. why it sticks"),
    v("plan-4", "4. lab"),
    v("h1", "1. Forces"),
    v("lbl-f", "F"),
    v("lbl-fr", "f"),
    v("lbl-mg", "mg"),
    v("lbl-n", "N"),
    v("g-m", "m = 5 kg"),
    v("g-f", "F = 30 N"),
    v("mu", "μ"),
    v("sub-k", "k"),
    v("sub-s", "s"),
    v("g-muk", "= 0.2"),
    v("g-mus", "= 0.3"),
    v("g-g", "g = 10 m/s"),
    v("sup2", "2"),
    v("g-a", "a = ?"),
    v("fr-1", "f ≤"),
    v("fr-2", "N"),
    v("hw-1", "Homework: double the mass."),
    v("hw-2", "Does 30 N still move it?"),
  ],
} satisfies HandManifest;
