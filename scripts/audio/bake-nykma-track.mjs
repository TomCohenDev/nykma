// The sound of bake-nykma, one WAV per scene, made here so there's nothing to license. 120 bpm, a beat every 0.5 s.
// rush: a kick and a rising pluck on every beat (an answer inked on each). stuck: the beat stops; a clock tick, three
// pen taps, a low hum. solve: the Solve click, the spinner, a resolving arpeggio, and the beat comes back. end: the beat
// under a soft chord. Levels are absolute (no per-file normalising), so the silence in "stuck" stays quiet.
// Run: node scripts/audio/bake-nykma-track.mjs → public/ads/bake-nykma/gen/{rush,stuck,solve,end}.wav
import { mkdirSync, writeFileSync } from "node:fs";
import { SR, buffer, click, mtof, pad, rng, thump, whoosh } from "./synth.mjs";

const OUT = "public/ads/bake-nykma/gen";
const F = (frame) => frame / 30;

function pluck(b, t, midi, amp = 0.25, decay = 0.28) {
  const s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(decay * 6 * SR)), f = mtof(midi);
  for (let i = 0; i < n; i++) {
    const e = i / SR;
    const env = Math.min(1, e * 400) * Math.exp(-e / decay);
    b[s + i] += amp * env * (Math.sin(2 * Math.PI * f * e) + 0.35 * Math.sin(4 * Math.PI * f * e) * Math.exp(-e / 0.08));
  }
}

function hat(b, t, amp = 0.06, seed = 9) {
  const r = rng(seed), s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(0.05 * SR));
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const x = r() * 2 - 1, hp = x - prev; // a crude high-pass: noise minus its last sample
    prev = x;
    b[s + i] += amp * hp * Math.exp(-(i / SR) / 0.012);
  }
}

/** A nib tapping paper: a short, dull knock. */
function tap(b, t, amp = 0.22, seed = 5) {
  const r = rng(seed), s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(0.04 * SR));
  let y = 0;
  for (let i = 0; i < n; i++) {
    y += 0.25 * ((r() * 2 - 1) - y); // low-passed noise
    const e = i / SR;
    b[s + i] += amp * (y * 2 + 0.6 * Math.sin(2 * Math.PI * 900 * e)) * Math.exp(-e / 0.008);
  }
}

function hum(b, t, length, amp = 0.05) {
  const s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(length * SR));
  for (let i = 0; i < n; i++) {
    const e = i / SR;
    const env = Math.min(1, e / 0.6, (length - e) / 0.2);
    b[s + i] += amp * env * (Math.sin(2 * Math.PI * 55 * e) + 0.5 * Math.sin(2 * Math.PI * 82.4 * e + 0.3 * Math.sin(e * 3)));
  }
}

function write(name, b) {
  const pcm = Buffer.alloc(b.length * 2);
  b.forEach((v, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.wav`, Buffer.concat([h, pcm]));
  const peak = b.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  console.log(`wrote ${OUT}/${name}.wav, ${(b.length / SR).toFixed(2)} s, peak ${peak.toFixed(2)}`);
}

// rush: 4 s, 8 beats. The pluck climbs C major pentatonic, one step per answer.
{
  const b = buffer(4);
  const notes = [60, 62, 64, 67, 69, 72, 74, 76];
  pad(b, 0, 4.2, [36, 43, 48], 0.1, { cutoff: 500, attack: 0.05, release: 0.05, seed: 11 });
  for (let k = 0; k < 8; k++) {
    const t = k * 0.5;
    thump(b, t, 0.55, { from: 140, to: 48, decay: 0.12 });
    pluck(b, t + F(1), notes[k], 0.2);
    hat(b, t + 0.25, 0.05, 20 + k);
  }
  write("rush", b);
}

// stuck: 2.5 s. No beat. A clock on the beat, the pen taps (frames 28, 35, 42), a hum that creeps in.
{
  const b = buffer(2.5);
  hum(b, 0.1, 2.4, 0.045);
  for (let k = 0; k < 5; k++) click(b, k * 0.5 + 0.02, 0.05, 30 + k);
  [28, 35, 42].forEach((f, i) => tap(b, F(f), 0.22, 40 + i));
  write("stuck", b);
}

// solve: 4 s. Click Solve at frame 44, spinner to 56, then the answer: an arpeggio and a chord, and the beat is back.
{
  const b = buffer(4);
  hum(b, 0, 1.9, 0.04);
  click(b, F(14), 0.08, 50); // mouse down for the drag
  click(b, F(30), 0.06, 51); // mouse up
  click(b, F(44), 0.16, 52); // Solve
  for (let f = 46; f < 56; f += 3) click(b, F(f), 0.025, 60 + f);
  const t0 = F(56);
  [60, 64, 67, 72, 76].forEach((m, i) => pluck(b, t0 + i * 0.07, m, 0.2, 0.4));
  pad(b, t0, 4 - t0, [48, 55, 60, 64], 0.12, { cutoff: 1400, attack: 0.15, release: 0.1, seed: 12 });
  for (let t = 2; t < 4; t += 0.5) {
    thump(b, t, 0.5, { from: 140, to: 48, decay: 0.12 });
    hat(b, t + 0.25, 0.05, Math.round(t * 10));
  }
  write("solve", b);
}

// end: 4.5 s. The beat under F major 7 then C, a soft whoosh as the camera pulls back, a bell on the ring (frame 30).
{
  const b = buffer(4.5);
  whoosh(b, 0, 1.0, 0.12, { peak: 0.5, low: 300, high: 3000, seed: 70 });
  pad(b, 0, 2.0, [41, 53, 57, 60, 64], 0.12, { cutoff: 1300, attack: 0.05, release: 0.1, seed: 13 });
  pad(b, 2.0, 2.5, [36, 48, 55, 60, 64], 0.12, { cutoff: 1300, attack: 0.1, release: 0.8, seed: 14 });
  pluck(b, F(30), 84, 0.12, 0.6);
  pluck(b, F(30) + 0.09, 79, 0.1, 0.6);
  for (let k = 0; k < 8; k++) {
    const t = k * 0.5;
    thump(b, t, k < 7 ? 0.45 : 0.6, { from: 140, to: 48, decay: k < 7 ? 0.12 : 0.3 });
    if (k < 7) hat(b, t + 0.25, 0.045, 80 + k);
  }
  pluck(b, 3.5, 72, 0.18, 0.5);
  pluck(b, 3.5, 60, 0.14, 0.5);
  write("end", b);
}
