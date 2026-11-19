import type { HandManifest, HandTextSpec } from "../../parts/hand/types.ts";

const VIRGIL = { family: "Virgil", src: "ads/spring-moves/Virgil-Regular.woff2" };
const v = (id: string, text: string): HandTextSpec => ({ id, text, font: VIRGIL, size: 220, weight: 400, dir: "ltr" });

/**
 * What `bun run hand spring-moves` traces, in the app's hand (Virgil): the problem the teacher writes once on the
 * canvas in the second half. The board in the first half is generated from board-ref.png, so it isn't traced here.
 * m = 2 kg, k = 200 N/m: 2x'' + 200x = 0, x(0) = 0.1 m, x'(0) = 0, so x(t) = 0.1 cos 10t.
 */
export default {
  texts: [v("b1", "2x'' + 200x = 0"), v("b2", "x(0) = 0.1,  x'(0) = 0")],
} satisfies HandManifest;
