// The py-demo fixture: 8 bars at 150 BPM (12.8 s, A minor) with a real change at bars 3 and 7.
//   bars 1-2  pad and clicks, no kick       bars 3-6  full groove      bars 7-8  pad and sparse kick, fades away
// Run: node scripts/audio/py-demo-track.mjs → public/ads/py-demo/assets/{track,whoosh}.wav
import { SR, buffer, click, mtof, pad, thump, whoosh, writeWav } from "./synth.mjs";

const BEAT = 60 / 150;
const BAR = BEAT * 4;
const LEN = BAR * 8;
const OUT = "public/ads/py-demo/assets";
const CHORDS = [[45, 57, 60, 64], [41, 53, 57, 60], [43, 55, 59, 62], [45, 57, 60, 64]];

const track = buffer(LEN);
CHORDS.concat(CHORDS).forEach((chord, i) => {
  const groove = i >= 2 && i < 6;
  pad(track, i * BAR, BAR + 0.1, chord, groove ? 0.26 : 0.5, { cutoff: groove ? 2600 : 900, seed: i + 10 });
});

for (let beat = 0; beat < 32; beat++) {
  const t = beat * BEAT;
  const bar = Math.floor(beat / 4);
  if (bar < 2) click(track, t, beat % 4 === 0 ? 0.5 : 0.32, beat);
  else if (bar < 6) {
    thump(track, t, 1, { decay: 0.16 });
    thump(track, t + BEAT / 2, 0.22, { from: 90, to: 60, decay: 0.06 }); // bass on the offbeat
    for (let k = 0; k < 4; k++) click(track, t + (k * BEAT) / 4, k === 2 ? 0.26 : 0.14, beat * 4 + k);
    if (beat % 2 === 1) whoosh(track, t, 0.12, 0.6, { peak: 0.02, low: 1800, high: 2400, seed: beat }); // snare
  } else if (beat % 4 === 0) thump(track, t, 0.8, { decay: 0.3 });
}

// A rising swell into bar 3, in the track so the drop reads, and the same shape again as an sfx file.
whoosh(track, BAR * 2 - 0.8, 0.8, 0.4, { peak: 0.98, seed: 41 });
for (let i = 0; i < track.length; i++) {
  const left = LEN - i / SR;
  if (left < 1) track[i] *= Math.max(left, 0);
}
writeWav(`${OUT}/track.wav`, track);

const sweep = buffer(0.5);
whoosh(sweep, 0, 0.5, 0.8, { peak: 0.6, seed: 42 });
writeWav(`${OUT}/whoosh.wav`, sweep);

console.log(`wrote ${OUT}/track.wav (${LEN} s, ${(60 / BEAT).toFixed(0)} BPM, A at ${mtof(69)} Hz) and whoosh.wav`);
