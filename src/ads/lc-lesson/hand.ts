import type { HandManifest, HandTextSpec } from "../../parts/hand/types.ts";

const VIRGIL = { family: "Virgil", src: "ads/lc-lesson/Virgil-Regular.woff2" };
const v = (id: string, text: string): HandTextSpec => ({ id, text, font: VIRGIL, size: 220, weight: 400, dir: "ltr" });

/**
 * What `bun run hand lc-lesson` traces, in the app's hand (Virgil): everything the teacher writes on the canvas.
 * A square is written as its own small "2" (`sup2`), never the font's ² glyph. L = 10 mH, C = 100 μF, V = 9 V.
 */
export default {
  texts: [
    v("plan-title", "Lesson 7: the LC circuit"),
    v("plan-1", "1. capacitor"),
    v("plan-2", "2. coil"),
    v("plan-3", "3. together"),
    v("plan-4", "4. lab"),
    v("h1", "1. Capacitor"),
    v("h2", "2. Coil"),
    v("h3", "3. Together"),
    v("c-val", "C = 100 μF"),
    v("v-val", "V = 9 V"),
    v("q-law", "Q = CV"),
    v("e-cap", "E = CV"),
    v("l-val", "L = 10 mH"),
    v("v-coil", "V = L dI/dt"),
    v("e-coil", "E = LI"),
    v("half", "/ 2"),
    v("sup2", "2"),
    v("given-l", "L = 10 mH"),
    v("given-c", "C = 100 μF"),
    v("given-f", "f = ?"),
    v("plus", "+"),
    v("minus", "−"),
    v("lbl-c", "C"),
    v("lbl-l", "L"),
    v("hw-1", "Homework: double L."),
    v("hw-2", "Predict f, then simulate."),
  ],
} satisfies HandManifest;
