// The score for mashal: 30 s at 100 BPM (18 frames a beat at 30 fps). No voice, so this and the pen carry the ad.
//   0-8.4 s    an exam room: a clock and a few plucks in D minor
//   8.4-14.4 s the plucks climb and double up to the crash
//   14.4-19.8  almost nothing, the clock alone
//   20.4 s     the page opens: D major, warm, plucks in thirds. Answer on 24.6 s, last cadence on the red מ.ש.ל.
// Run: node scripts/audio/mashal-track.mjs → public/ads/mashal/{track,crash,open,tick}.wav
import { SR, buffer, click, mtof, pad, rng, thump, whoosh, writeWav } from "./synth.mjs";

const BEAT = 0.6;
const LEN = 30;
const OUT = "public/ads/mashal";
const at = (frame) => frame / 30;

/** A nylon-ish pluck: Karplus-Strong with a soft attack. */
function pluck(b, t, midi, amp = 0.5, { decay = 0.996, bright = 0.5, seed = 7 } = {}) {
  const r = rng(seed + midi * 13 + Math.round(t * 100));
  const period = Math.max(Math.round(SR / mtof(midi)), 2);
  const line = Float32Array.from({ length: period }, () => r() * 2 - 1);
  // A rounder excitation: a sharp attack is what AAC turns into overshoot.
  for (let pass = 0; pass < 3; pass++) for (let k = 0; k < period; k++) line[k] = (line[k] + line[(k + 1) % period]) / 2;
  const start = Math.floor(t * SR);
  const length = Math.min(b.length - start, SR * 2.4);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const k = i % period;
    const value = line[k];
    const next = decay * (bright * value + (1 - bright) * last);
    last = value;
    line[k] = next;
    b[start + i] += amp * value * Math.min(1, i / 260);
  }
}

/** One tick of a wall clock. */
function tock(b, t, amp) {
  click(b, t, amp, Math.round(t * 10));
  thump(b, t, amp * 0.3, { from: 900, to: 500, decay: 0.012 });
}

const track = buffer(LEN);

// The clock runs through the first act and through the silence after the crash.
for (let beat = 0; beat * BEAT < at(594); beat++) {
  const t = beat * BEAT;
  if (t > at(252) && t < at(432)) continue;
  tock(track, t, t > at(432) ? 0.05 : 0.08);
}
pad(track, 0, at(252), [38, 45], 0.16, { cutoff: 420, attack: 1.2, release: 1.5, seed: 3 });

// Three pairs of plucks, one for each line of the proof so far.
[[0, 62], [1.5, 65], [5, 62], [6.5, 69], [10, 65], [11.5, 70]].forEach(([beat, note]) => pluck(track, beat * BEAT, note, 0.5));

// The duel: 8ths, then 16ths, climbing by semitone until they meet.
let t = at(252);
let step = 0;
let note = 50;
while (t < at(430)) {
  const left = (at(432) - t) / (at(432) - at(252));
  const gap = left > 0.55 ? BEAT / 2 : left > 0.25 ? BEAT / 4 : BEAT / 8;
  pluck(track, t, note + (step % 2 ? 12 : 0), 0.4 + 0.3 * (1 - left), { bright: 0.7 });
  if (step % 2 === 0) thump(track, t, 0.16 + 0.26 * (1 - left), { from: 130, to: 60, decay: 0.09 });
  t += gap;
  step++;
  if (step % 3 === 0) note++;
}
pad(track, at(300), at(432) - at(300), [38, 50, 53], 0.26, { cutoff: 1400, attack: 3.2, release: 0.02, seed: 8 });

// The page opens.
pad(track, at(612), at(900) - at(612), [50, 57, 62, 66, 69], 0.3, { cutoff: 1500, attack: 0.5, release: 2.4, seed: 12 });
thump(track, at(612), 0.7, { from: 90, to: 44, decay: 0.5 });
const major = [62, 66, 69, 74, 69, 66];
for (let i = 0; i < 18; i++) {
  const when = at(612) + i * BEAT;
  pluck(track, when, major[i % 6] + (i % 12 > 8 ? 2 : 0), i % 3 === 0 ? 0.32 : 0.2, { bright: 0.55 });
}

// The answer lands, two warm notes.
pluck(track, at(738), 74, 0.5, { bright: 0.6 });
pluck(track, at(738) + BEAT / 2, 78, 0.5, { bright: 0.6 });

// The last cadence, on מ.ש.ל.
[62, 69, 74, 78, 81].forEach((m, i) => pluck(track, at(862) + i * 0.06, m, 0.42, { decay: 0.994, bright: 0.5 }));
thump(track, at(862), 0.55, { from: 80, to: 46, decay: 0.45 });

for (let i = 0; i < track.length; i++) {
  const left = LEN - i / SR;
  if (left < 1.4) track[i] *= Math.max((left - 0.1) / 1.3, 0) ** 2;
}
writeWav(`${OUT}/track.wav`, track, 0.8);

// The crash: a hit, a split of noise, and something small falling over.
const crash = buffer(2);
thump(crash, 0, 1, { from: 160, to: 38, decay: 0.34 });
whoosh(crash, 0, 0.5, 0.75, { peak: 0.01, low: 500, high: 5200, seed: 5 });
whoosh(crash, 0.02, 1.2, 0.2, { peak: 0.02, low: 2600, high: 7000, seed: 6 });
for (let k = 0; k < 9; k++) click(crash, 0.05 + k * k * 0.012, 0.3 - k * 0.025, k);
writeWav(`${OUT}/crash.wav`, crash, 0.9);

const open = buffer(1.5);
whoosh(open, 0, 1.4, 0.8, { peak: 0.72, low: 300, high: 3400, seed: 9 });
writeWav(`${OUT}/open.wav`, open, 0.8);

const tick = buffer(0.06);
click(tick, 0, 0.9, 2);
writeWav(`${OUT}/tick.wav`, tick, 0.8);
