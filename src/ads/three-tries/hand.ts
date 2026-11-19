import type { HandManifest, HandTextSpec } from "../../parts/hand/types.ts";

const VIRGIL = { family: "Virgil", src: "ads/three-tries/Virgil-Regular.woff2" };
const GVERET = { family: "Gveret Levin", src: "ads/three-tries/GveretLevin.ttf" };
const v = (id: string, text: string): HandTextSpec => ({ id, text, font: VIRGIL, size: 220, weight: 400, dir: "ltr" });
const h = (id: string, text: string): HandTextSpec => ({ id, text, font: GVERET, size: 220, weight: 400, dir: "rtl" });

/**
 * What `bun run hand three-tries` traces: the teacher's ink. Maths in Virgil (the app's hand font stand-in), Hebrew
 * notes in Gveret Levin (the kit's Hebrew hand). The radical in ω = 1/√(LC) is drawn as a sketch, not a glyph.
 */
export default {
  texts: [
    v("val-l", "L = 10 mH"),
    v("val-c", "C = 100 μF"),
    v("val-v", "V = 9 V"),
    v("w-eq", "ω = 1 /"),
    v("lc", "LC"),
    v("lbl-c", "C"),
    v("lbl-l", "L"),
    v("ax-q", "q"),
    v("ax-t", "t"),
    v("n1", "1"),
    v("n2", "2"),
    v("n3", "3"),
    v("n4", "4"),
    v("plus", "+"),
    v("minus", "−"),
    h("he-q", "המטען"),
    h("he-back", "ואז חוזר"),
    h("note", "את זה אני מראה מחר."),
  ],
} satisfies HandManifest;
