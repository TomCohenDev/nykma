import type { Cue } from "../../engine/cue";
import { random } from "../../engine/random";
import { handGen, handEntry } from "./gen";
import { frameAt, penPlan, type PenRun } from "./timeline";
import type { HandGen } from "./types";

export const PEN_SCRATCH = "sfx/pen-scratch.wav";
const SOURCE_SECONDS = 8; // Length of the file above. scripts/audio/pen-scratch.mjs makes it.

export type HandWrite = PenRun & { id: string };

export type HandCueOptions = {
  /** The ad's fps. Pass it through from `cues: ({ fps }) => …`. */
  fps?: number;
  src?: string;
  volume?: number;
};

/**
 * Pen-scratch cues that land on the strokes: sound while the pen is on the page, none in the air, and strokes that touch
 * are one cue. Give it the same `write` and `erase` as the `<HandText>`.
 *
 *   cues: ({ fps }) => handCues("launch", [{ id: "hello", write: [30, 90] }], { fps })
 *
 * Before `bun run hand` has run there's nothing to match, so it gives no cues rather than breaking the registry.
 */
export function handCues(source: string | HandGen, writes: HandWrite[], { fps = 30, src = PEN_SCRATCH, volume = 0.5 }: HandCueOptions = {}): Cue[] {
  const known = typeof source === "string" ? handGen(source) : source;
  if (!known) return [];
  const cues: Cue[] = [];
  for (const { id, write, erase } of writes) {
    const entry = handEntry(known, id);
    const { total, spans } = penPlan(entry);
    const runs: { span: readonly [number, number]; backwards: boolean }[] = [];
    if (erase !== true) runs.push({ span: write, backwards: false });
    if (erase) runs.push({ span: erase === true ? write : erase, backwards: true });

    for (const [r, { span, backwards }] of runs.entries()) {
      const hits = spans.map(({ from, to }) => {
        const [a, b] = backwards ? [1 - to / total, 1 - from / total] : [from / total, to / total];
        return [frameAt(a, span), frameAt(b, span)];
      });
      if (backwards) hits.reverse();
      const merged: number[][] = [];
      for (const [start, end] of hits) {
        const last = merged.at(-1);
        if (last && start - last[1] < 0.5) last[1] = end;
        else merged.push([start, end]);
      }
      for (const [i, [start, end]] of merged.entries()) {
        const at = Math.round(start);
        const length = Math.max(Math.round(end) - at, 2);
        // A different stretch of the file each time, so strokes don't sound the same. Erasing is quicker and lighter.
        const seed = `${id}-${r}-${i}`;
        const skip = Math.floor(random(seed) * Math.max(SOURCE_SECONDS * fps - length, 1));
        const gain = volume * (backwards ? 0.6 : 1) * (0.8 + 0.2 * random(`${seed}-v`));
        cues.push({ src, at, trim: [skip, skip + length], volume: +gain.toFixed(3), fade: [Math.min(1, length >> 1), Math.min(2, length >> 1)] });
      }
    }
  }
  return cues;
}
