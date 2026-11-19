import type { Timeline } from "../../parts";

/** A hand-made stand-in for gen/timeline.json, so the demo cues from words and beats with no audio or credits. The Hebrew words carry niqqud on purpose. */
const FPS = 30;
const DURATION = 12;
const FIRST_WORD = 5.7;

const voice = (track: string, words: string[]) =>
  words.map((text, i) => ({ text, track, start: FIRST_WORD + i * 0.3, end: FIRST_WORD + (i + 1) * 0.3 }));

const beats = Array.from({ length: DURATION * 2 }, (_, i) => i / 2);

export const tl: Timeline = {
  version: 1,
  slug: "parts-demo",
  fps: FPS,
  duration: DURATION,
  frames: DURATION * FPS,
  bpm: 120,
  sections: [
    { name: "Intro", start: 0, end: 5.5 },
    { name: "Verse", start: 5.5, end: 9 },
    { name: "Outro", start: 9, end: DURATION },
  ],
  beats,
  downbeats: beats.filter((_, i) => i % 4 === 0),
  onsets: { all: beats },
  energy: { rms: Array.from({ length: DURATION * FPS }, (_, i) => 0.55 + 0.45 * Math.sin(i / 11) * Math.sin(i / 37)) },
  words: [
    ...voice("vo-en", ["A", "whole", "ad", "from", "Claude", "Code", "for", "just", "$49."]),
    ...voice("vo-he", ["מוֹדָעָה", "שְׁלֵמָה", "מִ־Claude", "Code", "ב־₪49", "בִּלְבַד."]),
  ],
  lines: [],
  clips: [],
  markers: [
    { name: "caption", t: 5.5 },
    { name: "end", t: 9 },
  ],
  mix: "",
};
