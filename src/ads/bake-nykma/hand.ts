import type { HandManifest, HandTextSpec } from "../../parts/hand/types.ts";

const VIRGIL = { family: "Virgil", src: "ads/bake-nykma/Virgil-Regular.woff2" };
const v = (id: string, text: string): HandTextSpec => ({ id, text, font: VIRGIL, size: 220, weight: 400, dir: "ltr" });

/** The homework column. Every answer here is checked arithmetic (see PROBLEMS in world.tsx). */
export const EQUATIONS = [
  "x + 7 = 12",
  "3x = 21",
  "2x + 5 = 17",
  "x − 9 = 4",
  "4x − 3 = 25",
  "5x + 2 = 37",
  "2(x + 4) = 18",
  "6x − 1 = 29",
  "x / 3 = 6",
  "9x = 54",
  "3x + 8 = 2x + 12",
  "7x − 4 = 31",
  "4(x − 2) = 20",
  "x² − 8x + 15 = 0",
];
export const ANSWERS = [5, 7, 6, 13, 7, 7, 5, 5, 18, 6, 4, 5, 7];

export default {
  texts: [
    ...EQUATIONS.map((e, i) => v(`e${i + 1}`, e)),
    ...EQUATIONS.map((_, i) => v(`n${i + 1}`, `${i + 1}.`)),
    ...[...new Set(ANSWERS)].map((a) => v(`a${a}`, `x = ${a}`)),
    v("q", "x = ?"),
    v("xeq", "x ="),
    v("qm", "?"),
    v("res", "x = 3, 5"),
  ],
} satisfies HandManifest;
