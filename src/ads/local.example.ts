/**
 * This machine's own ads: copy this file to src/ads/local.ts (gitignored) and give each new ad its line here, as
 * src/registry.ts shows. A new ad's folders (src/ads/<slug>/, public/ads/<slug>/, queue/<date>-<brand>-<slug>/) are
 * gitignored too, so nothing of it reaches the private or the public repo (spec.md §12). The registry adds these
 * after its own; a clone without local.ts builds without them.
 *
 *   import { scenes as launchScenes, cues as launchCues } from "./launch/Launch";
 *   export const ads: Ad[] = [defineAd({ slug: "launch", scenes: launchScenes, fps: 30, cues: launchCues, ratios: ["1x1"] })];
 */
import { defineAd, type Ad } from "../engine";

export const ads: Ad[] = [];

void defineAd;
