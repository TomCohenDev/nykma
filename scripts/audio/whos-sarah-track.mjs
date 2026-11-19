// whos-sarah's score, timed by src/ads/whos-sarah/score.json. Two worlds: a 120 BPM hype track in F# minor that flinches each time
// the pen touches it and tape-stops when it's scribbled out, then silence, then one marimba in A on bare paper.
// Run: node scripts/audio/whos-sarah-track.mjs → public/ads/whos-sarah/assets/track.wav
import { readFileSync } from "node:fs";
import { SR, buffer, click, mtof, pad, rng, thump, whoosh, writeWav } from "./synth.mjs";

const score = JSON.parse(readFileSync("src/ads/whos-sarah/score.json", "utf8"));
const LEN = score.frames / score.fps;
const f2t = (f) => f / score.fps;
const BEAT = 60 / score.bpm;
const BAR = BEAT * 4;
const { cuts, flinch, retort, strikes, landed } = score;
const HYPE_END = f2t(cuts.paper);

// ---- the hype bus ----

const CHORDS = [[42, 54, 57, 61, 64], [38, 50, 54, 57, 62], [45, 52, 57, 61, 64], [40, 52, 56, 59, 64]]; // F#m D A E
const hype = buffer(HYPE_END + 1);

/** A short bright chord of detuned saws: the stabs. */
function stab(b, t, notes, amp, length = 0.16, seed = 1) {
  const r = rng(seed), s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(length * SR));
  const saws = notes.flatMap((m) => [-0.12, 0, 0.12].map((d) => ({ f: mtof(m + 12 + d), ph: r() })));
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const e = i / SR;
    let v = 0;
    for (const o of saws) {
      o.ph = (o.ph + o.f / SR) % 1;
      v += 2 * o.ph - 1;
    }
    const cut = 0.07 + 0.5 * Math.exp(-e / 0.05);
    lp += cut * (v / saws.length - lp);
    b[s + i] += amp * lp * Math.min(1, e / 0.002) * Math.exp(-e / (length * 0.45));
  }
}

function noiseHit(b, t, amp, decay, seed, bright = 0.6) {
  const r = rng(seed), s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(decay * 6 * SR));
  let last = 0;
  for (let i = 0; i < n; i++) {
    const v = r() * 2 - 1;
    b[s + i] += amp * (v - bright * last) * Math.exp(-i / SR / decay);
    last = v;
  }
}

function sawBass(b, t, m, amp, length) {
  const s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(length * SR));
  let ph = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    ph = (ph + mtof(m) / SR) % 1;
    lp += 0.09 * (2 * ph - 1 - lp);
    b[s + i] += amp * lp * Math.min(1, i / 200) * Math.min(1, (n - i) / 400);
  }
}

const bars = Math.ceil(HYPE_END / BAR);
for (let bar = 0; bar < bars; bar++) {
  const chord = CHORDS[bar % 4];
  pad(hype, bar * BAR, BAR + 0.05, chord.map((m) => m + 12), 0.2, { cutoff: 2600, attack: 0.02, release: 0.05, seed: bar + 3 });
  for (let step = 0; step < 16; step++) {
    const t = bar * BAR + (step * BEAT) / 4;
    if ([0, 3, 6, 8, 11, 14].includes(step)) stab(hype, t, chord.slice(1), step % 8 === 0 ? 0.5 : 0.34, 0.18, bar * 16 + step);
    if (step % 2 === 0) noiseHit(hype, t + (step % 4 === 2 ? 0 : BEAT / 8), step % 4 === 2 ? 0.13 : 0.05, step % 4 === 2 ? 0.05 : 0.012, step + bar * 16 + 100);
    if (step % 4 === 2) sawBass(hype, t, chord[0], 0.7, BEAT / 2.2);
  }
  for (let beat = 0; beat < 4; beat++) {
    thump(hype, bar * BAR + beat * BEAT, 1, { decay: 0.13 });
    if (beat % 2 === 1) noiseHit(hype, bar * BAR + beat * BEAT, 0.34, 0.07, bar * 4 + beat + 300, 0.3);
  }
}
for (const key of ["g2", "g3", "g4", "g5"]) {
  const t = f2t(cuts[key]);
  thump(hype, t, 0.8, { from: 160, to: 40, decay: 0.3 });
  noiseHit(hype, t + 0.004, 0.2, 0.12, cuts[key], 0.2);
  whoosh(hype, t - 0.32, 0.34, 0.22, { peak: 0.8, seed: cuts[key] + 7 });
}
for (const [i, f] of retort.entries()) stab(hype, f2t(f), [69, 73, 76, 81], 0.6, 0.3, i + 500); // The ad's comeback lands on a bright pling.
for (const [i, f] of strikes.entries()) noiseHit(hype, f2t(f), 0.5, 0.05, i + 600, 0.2);

// The flinch: the track drops behind the pen, muffled and small, and snaps back for the ad's comeback.
const wet = new Float32Array(hype.length);
let [one, two] = [0, 0];
const flinching = (f) => flinch.reduce((most, [a, b]) => {
  if (f < a || f > b) return most;
  return Math.max(most, Math.min(1, (f - a) / 3) * Math.min(1, (b - f) / 1.5));
}, 0);
for (let i = 0; i < hype.length; i++) {
  const k = flinching((i / SR) * score.fps);
  const cut = (1 - k) * 0.95 + k * 0.05;
  one += cut * (hype[i] - one);
  two += cut * (one - two);
  wet[i] = (k > 0 ? two : hype[i]) * (1 - 0.55 * k);
}

// ---- the mix ----

const track = buffer(LEN);
const stopFrom = Math.floor(f2t(cuts.scribble) * SR);
const stopTo = Math.floor(f2t(cuts.paper) * SR);
for (let i = 0; i < stopFrom; i++) track[i] = wet[i];
const loudest = wet.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
// Scaled, not clipped: a clipped flat top rings through AAC and came out 2 dB hotter.
const soft = (v) => v / loudest;
for (let i = 0; i < stopFrom; i++) track[i] = soft(track[i]);
// Tape stop: the read head slows to nothing over the scribble, and the picture cuts to paper as it dies.
let head = stopFrom;
for (let i = stopFrom; i < stopTo; i++) {
  const u = (i - stopFrom) / (stopTo - stopFrom);
  const k = Math.floor(head);
  track[i] = soft(wet[k] + (wet[k + 1] - wet[k]) * (head - k)) * (1 - u ** 4);
  head += (1 - u) ** 1.4;
}

/** Wooden bar: a sine with a quick fourth-harmonic knock. */
function marimba(b, t, m, amp = 0.5) {
  const s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(1.6 * SR));
  const f = mtof(m);
  for (let i = 0; i < n; i++) {
    const e = i / SR;
    const v = Math.sin(2 * Math.PI * f * e) * Math.exp(-e / 0.42) + 0.4 * Math.sin(2 * Math.PI * f * 4 * e) * Math.exp(-e / 0.035) + 0.12 * Math.sin(2 * Math.PI * f * 10 * e) * Math.exp(-e / 0.01);
    b[s + i] += amp * v * Math.min(1, e / 0.0015);
  }
}

const at = f2t;
for (let key = 0; key < 22; key++) click(track, at(cuts.ask + 6 + key) + 0.008 * Math.sin(key * 2.1), 0.13, key + 200); // The prompt being typed.
marimba(track, at(landed.ask + 25), 69, 0.5);
marimba(track, at(landed.ask + 40), 73, 0.36);
pad(track, at(cuts.ask), at(cuts.rule) - at(cuts.ask) + 0.5, [45, 57, 64, 69], 0.06, { cutoff: 800, attack: 0.9, release: 0.6, seed: 41 });
marimba(track, at(landed.frames[0]), 76, 0.46);
marimba(track, at(landed.frames[1]), 81, 0.46);
marimba(track, at(landed.frames[2]), 85, 0.5);
marimba(track, at(landed.copy), 74, 0.46);
marimba(track, at(landed.copy + 30), 78, 0.36);
pad(track, at(cuts.rule) - 0.2, at(cuts.end) - at(cuts.rule) + 0.6, [47, 59, 66, 71], 0.07, { cutoff: 900, attack: 0.6, release: 0.5, seed: 42 });
marimba(track, at(landed.rule), 71, 0.46);
marimba(track, at(landed.rule + 15), 76, 0.36);
for (let beat = 0; beat < 8; beat++) thump(track, at(cuts.ask + beat * 30 + 60), 0.16, { from: 110, to: 55, decay: 0.09 }); // A quiet pulse under the second half.

// The pen closes the prompt: the whole A major chord, at last.
pad(track, at(landed.close), at(score.frames) - at(landed.close) - 0.05, [33, 45, 52, 57, 61, 64], 0.2, { cutoff: 1400, attack: 0.06, release: 1.4, seed: 43 });
[57, 64, 69, 73, 76, 81].forEach((m, i) => marimba(track, at(landed.close + i * 3), m, 0.4));
stab(track, at(landed.sneak), [69, 73, 76, 81], 0.3, 0.22, 700); // The ad, one last time.
click(track, at(landed.flick), 0.32, 77);
marimba(track, at(landed.flick + 6), 81, 0.3);

for (let i = 0; i < track.length; i++) {
  const left = LEN - i / SR;
  if (i >= stopTo) track[i] *= 0.75; // The paper half is small, not faint: a phone speaker still has to carry it.
  if (left < 0.5) track[i] *= Math.max(left / 0.5, 0) ** 2;
}
writeWav("public/ads/whos-sarah/assets/track.wav", track, 0.8);
console.log(`wrote public/ads/whos-sarah/assets/track.wav (${LEN} s)`);
