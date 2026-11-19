/**
 * Handwriting that writes itself (spec §6.2). List what to write in the ad's `hand.ts`, trace it, then use it:
 *
 *   // src/ads/launch/hand.ts
 *   export default {
 *     texts: [{ id: "hello", text: "שלום", font: "playpen-hebrew", weight: 500 }],   // size 240 by default; dir from the text
 *     paths: [{ id: "arrow", paths: ["M10 10C40 60 90 60 120 20"], ink: 8 }],        // single-line SVG paths, in order
 *   } satisfies HandManifest;
 *
 *   bun run hand launch          writes src/ads/launch/hand.gen.json, cached by text + font + weight + size
 *   bun run hand:check launch    out/launch/hand-check.png (numbered strokes), hand-check.json (flags)
 *
 *   <HandText id="hello" write={[30, 90]} size={160} pen />
 *   <HandText id="hello" write={[30, 90]} mode="ink" />      the strokes are the ink
 *   <HandText id="hello" write={[30, 90]} erase={[150, 165]} />    then runs backwards; `erase` alone runs `write` backwards
 *   <HandText id="arrow" write={[90, 110]} width={300} />
 *   cues: ({ fps }) => handCues("launch", [{ id: "hello", write: [30, 90] }], { fps })
 *
 * Fonts: `HAND_FONTS`, or `{ family, src: "ads/launch/hand.woff2" }` for a file under public/. A brand's hand font is
 * copied there from brands/<brand>/assets/ first. One line per id.
 */
export { HandText, type HandTextProps } from "./HandText";
export { handCues, PEN_SCRATCH, type HandCueOptions, type HandWrite } from "./cues";
export { HAND_FONTS } from "./fonts";
export { handEntry, handGen } from "./gen";
export { penAt, penPlan, penProgress, steadyPen, type PenRun, type PenTip } from "./timeline";
export type { HandEntry, HandGen, HandManifest, HandPathSpec, HandStroke, HandTextSpec } from "./types";
