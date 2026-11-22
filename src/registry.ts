/**
 * Every ad, one line each. `bun run <script> <id>` finds them here. All fields: `Ad` in src/engine/ad.ts.
 *
 *
 * The ads listed here are the ones the repo already holds. A new ad is the user's own and stays on this machine: its
 * folders are gitignored, and its line goes in src/ads/local.ts (also gitignored, made from local.example.ts), which
 * is added below when it exists. A fresh clone has no local.ts and builds without it (spec.md §12).
 */
import { PartsDemo } from "./ads/parts-demo/PartsDemo";
import { PyDemo, cues as pyDemoCues } from "./ads/py-demo/PyDemo";
import { HandDemo, cues as handDemoCues, FRAMES as handDemoFrames } from "./ads/hand-demo/HandDemo";
import { Smoke, cues as smokeCues } from "./ads/smoke/Smoke";
import { WhosSarah, cues as whosSarahCues, FRAMES as whosSarahFrames } from "./ads/whos-sarah/WhosSarah";
import { Mashal, cues as mashalCues, FRAMES as mashalFrames } from "./ads/mashal/Mashal";
import { PagTokef, cues as pagTokefCues, FRAMES as pagTokefFrames } from "./ads/pag-tokef/PagTokef";
import { scenes as storyDemoScenes } from "./ads/story-demo/StoryDemo";
import { scenes as underPressureScenes, cues as underPressureCues } from "./ads/under-pressure/UnderPressure";
import { scenes as bakeNykmaScenes } from "./ads/bake-nykma/BakeNykma";
import { ScreenDemo, FRAMES as screenDemoFrames } from "./ads/screen-demo/ScreenDemo";
import { ThreeDemo, ThreeDemoThumbnail, FRAMES as threeDemoFrames } from "./ads/three-demo/ThreeDemo";
import { scenes as springMovesScenes, cues as springMovesCues } from "./ads/spring-moves/SpringMoves";
import { scenes as lcLessonScenes, cues as lcLessonCues } from "./ads/lc-lesson/LcLesson";
import { scenes as newtonLessonScenes, cues as newtonLessonCues } from "./ads/newton-lesson/NewtonLesson";
import { scenes as loMaaminScenes, cues as loMaaminCues, Thumb as LoMaaminThumb } from "./ads/lo-maamin/LoMaamin";
import { scenes as madrichScenes, cues as madrichCues, Thumb as MadrichThumb } from "./ads/madrich/Madrich";
import { scenes as threeTriesScenes, cues as threeTriesCues, Thumb as ThreeTriesThumb } from "./ads/three-tries/ThreeTries";
import { scenes as etzbaAchatScenes, cues as etzbaAchatCues, Thumb as EtzbaAchatThumb } from "./ads/etzba-achat/EtzbaAchat";
import { defineAd, type Ad } from "./engine";
import { videosOf } from "./engine/ad";

const ads: Ad[] = [
  defineAd({ slug: "hand-demo", component: HandDemo, fps: 30, frames: handDemoFrames, cues: handDemoCues }),
  defineAd({ slug: "smoke", component: Smoke, fps: 30, frames: 90, lang: "he", cues: smokeCues }),
  defineAd({ slug: "py-demo", component: PyDemo, cues: pyDemoCues }),
  defineAd({ slug: "story-demo", scenes: storyDemoScenes, fps: 30 }),
  defineAd({ slug: "parts-demo", take: "en", component: PartsDemo, fps: 30, frames: 360 }),
  defineAd({ slug: "parts-demo", take: "he", component: PartsDemo, fps: 30, frames: 360, lang: "he" }),
  defineAd({ slug: "whos-sarah", component: WhosSarah, fps: 30, frames: whosSarahFrames, cues: whosSarahCues }),
  defineAd({ slug: "mashal", component: Mashal, fps: 30, frames: mashalFrames, lang: "he", cues: mashalCues }),
  defineAd({ slug: "pag-tokef", component: PagTokef, fps: 30, frames: pagTokefFrames, lang: "he", cues: pagTokefCues }),
  defineAd({ slug: "under-pressure", scenes: underPressureScenes, fps: 30, cues: underPressureCues }),
  defineAd({ slug: "bake-nykma", scenes: bakeNykmaScenes, fps: 30 }),
  defineAd({ slug: "screen-demo", component: ScreenDemo, fps: 30, frames: screenDemoFrames, ratios: ["1x1", "16x9"] }),
  defineAd({ slug: "three-demo", component: ThreeDemo, thumbnail: ThreeDemoThumbnail, fps: 30, frames: threeDemoFrames, ratios: ["1x1", "9x16"] }),
  defineAd({ slug: "spring-moves", scenes: springMovesScenes, fps: 30, lang: "he", cues: springMovesCues, ratios: ["1x1", "9x16"] }),
  defineAd({ slug: "lc-lesson", scenes: lcLessonScenes, fps: 30, cues: lcLessonCues, ratios: ["16x9", "1x1", "9x16"] }),
  defineAd({ slug: "newton-lesson", scenes: newtonLessonScenes, fps: 30, cues: newtonLessonCues, ratios: ["16x9", "1x1", "9x16"] }),
  defineAd({ slug: "lo-maamin", scenes: loMaaminScenes, fps: 30, lang: "he", cues: loMaaminCues, thumbnail: LoMaaminThumb, ratios: ["16x9", "1x1", "9x16"] }),
  defineAd({ slug: "madrich", scenes: madrichScenes, fps: 30, lang: "he", cues: madrichCues, thumbnail: MadrichThumb, ratios: ["1x1", "9x16"] }),
  defineAd({ slug: "three-tries", scenes: threeTriesScenes, fps: 30, lang: "he", cues: threeTriesCues, thumbnail: ThreeTriesThumb, ratios: ["9x16", "1x1", "16x9"] }),
  defineAd({ slug: "etzba-achat", scenes: etzbaAchatScenes, fps: 30, lang: "en", cues: etzbaAchatCues, thumbnail: EtzbaAchatThumb, ratios: ["9x16", "1x1", "16x9"] }),
];

// This machine's own ads, from the gitignored src/ads/local.ts. A glob, so a clone without the file still builds.
const local = import.meta.glob<{ ads?: Ad[] }>("./ads/local.ts", { eager: true });
ads.push(...(local["./ads/local.ts"]?.ads ?? []));

export const videos = ads.flatMap(videosOf);

export const findVideo = (id: string) => videos.find((video) => video.id === id);

// A change to an ad's code stops here: the desk's frames (src/board/frame.tsx) draw the new registry in place. A page
// that doesn't listen reloads itself, instead of Vite reloading every open page, the desk with them.
if (import.meta.hot)
  import.meta.hot.accept((next) => {
    const listeners = (globalThis as { __nykmaRegistry?: Set<(next: unknown) => void> }).__nykmaRegistry;
    if (next && listeners?.size) listeners.forEach((listen) => listen(next));
    else location.reload();
  });
