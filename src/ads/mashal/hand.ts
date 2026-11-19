import type { HandManifest, HandTextSpec } from "../../parts/hand/types.ts";

const HE = { family: "Gveret Levin", src: "ads/mashal/GveretLevin.ttf" };
const MATH = { family: "Virgil", src: "ads/mashal/Virgil-Regular.woff2" };

const he = (id: string, text: string): HandTextSpec => ({ id, text, font: HE, size: 220, weight: 400 });
const math = (id: string, text: string): HandTextSpec => ({ id, text, font: MATH, size: 220, weight: 400, dir: "ltr" });

/** What `bun run hand mashal` traces. Each ratio breaks the proof into its own lines, so the lines are listed per break. */
export default {
  texts: [
    // One line each: 16x9 and 1x1.
    he("g1", "נתון: עברית כותבים מימין לשמאל."),
    he("g2", "נתון: משוואה כותבים משמאל לימין."),
    he("q", "צ״ל: מה קורה כשהן נפגשות?"),
    he("c", "מסקנה: במחברת נגמר המקום."),
    // Two lines each: 9x16.
    he("g1a", "נתון: עברית כותבים"),
    he("g1b", "מימין לשמאל."),
    he("g2a", "נתון: משוואה כותבים"),
    he("g2b", "משמאל לימין."),
    he("qa", "צ״ל: מה קורה"),
    he("qb", "כשהן נפגשות?"),
    he("ca", "מסקנה: במחברת"),
    he("cb", "נגמר המקום."),
    // The crash: Hebrew words from the right.
    he("proof", "הוכחה:"),
    he("w1", "נפתור"),
    he("w2", "את"),
    he("w3", "המשוואה"),
    // The crash: the equation from the left, term by term.
    math("m1", "x"),
    math("m1s", "2"),
    math("m2", "−"),
    math("m3", "8x"),
    math("m4", "+"),
    math("m5", "15"),
    math("m6", "="),
    math("m7", "0"),
    // The teacher, then the way out.
    he("r1", "לא"),
    he("r2", "קריא!"),
    he("open", "דף שלא נגמר."),
    math("answer", "x = 3, 5"),
    he("tag", "מחושב, לא מנוחש."),
    he("qed", "מ.ש.ל."),
  ],
  paths: [
    { id: "arrowLeft", ink: 7, paths: ["M600 30C450 18 250 40 12 28", "M64 4C46 14 30 22 12 28C30 34 48 44 66 54"] },
    { id: "arrowRight", ink: 7, paths: ["M12 28C170 44 400 16 590 28", "M538 4C556 14 574 22 590 28C572 34 554 44 536 54"] },
    { id: "circle", ink: 8, paths: ["M880 44C640 -10 200 0 80 110C-30 210 120 330 420 342C720 354 990 300 996 176C1002 84 950 40 842 36"] },
    { id: "strike", ink: 10, paths: ["M6 34C40 22 96 38 170 12"] },
  ],
} satisfies HandManifest;
