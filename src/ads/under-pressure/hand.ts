import type { HandManifest, HandTextSpec } from "../../parts/hand/types.ts";

const VIRGIL = { family: "Virgil", src: "ads/under-pressure/Virgil-Regular.woff2" };
const v = (id: string, text: string): HandTextSpec => ({ id, text, font: VIRGIL, size: 220, weight: 400, dir: "ltr" });

/** What `bun run hand under-pressure` traces. Chalk on the board, ink on the canvas, all in the app's landing-demo hand. */
export default {
  texts: [
    // The chalkboard: the lecture's long way round.
    v("c1", "p = F / A"),
    v("c2", "F2 = F1 · A2 / A1"),
    v("c3", "= 200 · 100 / 4"),
    v("c4", "= 20000 / 4"),
    v("c5", "= 5000 ... ?"),
    v("k1", "÷ 4"),
    v("k2", "× 100"),
    v("k3", "carry 1"),
    v("k4", "4 ) 20000"),
    v("k5", "50 · 100 = ?"),
    v("k6", "= 500 ?"),
    v("k7", "5 · 4 = 20"),
    v("k8", "200 / 4 = 40"),
    v("k9", "= 50"),
    v("k10", "× 10 × 10"),
    v("k11", "= 5000 ?"),
    v("k12", "F2 = ?"),
    // The press.
    v("law", "p = F / A"),
    v("nums", "200 / 4 = F / 100"),
    v("n200", "200 N"),
    v("a4", "4 cm"),
    v("a100", "100 cm"),
    v("sq", "2"),
    v("fq", "F"),
    v("res", "F = 5000"),
    // The engine.
    v("hot", "600 K"),
    v("cold", "300 K"),
    v("eta", "= 1 - 300 / 600"),
    v("etaRes", "= 1/2"),
  ],
  paths: [
    // η, drawn as a pen would: the short stem, then the arch and its long tail.
    { id: "etaSym", paths: ["M6 30C10 22 16 22 16 32L16 78", "M16 44C22 28 32 24 40 26C48 28 50 36 50 46L50 112"], ink: 7 },
  ],
} satisfies HandManifest;
