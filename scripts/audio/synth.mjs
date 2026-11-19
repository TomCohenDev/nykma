// Small WAV synth with no dependencies and nothing to license. Every sound is a function of its seed.
//
//   node scripts/audio/synth.mjs click public/ads/x/click.wav          one sound: click, whoosh, thump, pad
//   import { buffer, click, thump, whoosh, pad, writeWav } from "./synth.mjs";   a score, see py-demo-track.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SR = 44100;
export const buffer = (seconds) => new Float32Array(Math.ceil(seconds * SR));
export const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

/** A seeded 0..1 generator (mulberry32), so a track comes out the same every time. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two-pole resonant low-pass over a sample stream. `freq` is a number, or a function of the sample index. */
function lowpass(freq, q = 0.8) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, i) => {
    const f = typeof freq === "function" ? freq(i) : freq;
    const w = (2 * Math.PI * Math.min(Math.max(f, 20), SR * 0.45)) / SR;
    const cs = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    const b = (1 - cs) / 2;
    const y = (b * x + 2 * b * x1 + b * x2 + 2 * cs * y1 - (1 - al) * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

/** A short tick, for cursors, UI and metronomes. */
export function click(b, t = 0, amp = 0.8, seed = 1) {
  const r = rng(seed), s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(0.03 * SR));
  for (let i = 0; i < n; i++) {
    const e = i / SR;
    b[s + i] += amp * (0.6 * Math.sin(2 * Math.PI * 3200 * e) + 0.6 * (r() * 2 - 1)) * Math.exp(-e / 0.003);
  }
}

/** A swell of filtered noise that peaks at `t + length * peak`: a pass-by, a transition. */
export function whoosh(b, t = 0, length = 0.6, amp = 0.5, { peak = 0.75, low = 300, high = 5000, seed = 2 } = {}) {
  const r = rng(seed), s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(length * SR));
  const at = (i) => { const u = i / Math.floor(length * SR); return u < peak ? u / peak : (1 - u) / (1 - peak); };
  const lp = lowpass((i) => low + (high - low) * at(i) ** 2, 1.2);
  for (let i = 0; i < n; i++) b[s + i] += amp * lp(r() * 2 - 1, i) * at(i) ** 2;
}

/** A low hit: a sine falling in pitch, for kicks and impacts. */
export function thump(b, t = 0, amp = 0.9, { from = 150, to = 46, decay = 0.2 } = {}) {
  const s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(decay * 7 * SR));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const e = i / SR;
    ph += (2 * Math.PI * (to + (from - to) * Math.exp(-e / 0.03))) / SR;
    b[s + i] += amp * Math.sin(ph) * Math.exp(-e / decay) * Math.min(1, e * 500);
  }
}

/** A soft chord: detuned saws under a low-pass, with slow ends. `notes` are MIDI numbers. */
export function pad(b, t = 0, length = 2, notes = [45, 57, 60, 64], amp = 0.3, { cutoff = 1200, attack = 0.2, release = 0.4, seed = 3 } = {}) {
  const r = rng(seed), s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(length * SR));
  const saws = notes.flatMap((m) => [-0.07, 0, 0.07].map((d) => ({ f: mtof(m + d), ph: r() })));
  const lp = lowpass(cutoff);
  for (let i = 0; i < n; i++) {
    const e = i / SR;
    let v = 0;
    for (const o of saws) {
      o.ph = (o.ph + o.f / SR) % 1;
      v += 2 * o.ph - 1;
    }
    b[s + i] += (amp * lp(v / saws.length, i) * Math.min(1, e / attack, (length - e) / release));
  }
}

/** Writes 16-bit mono PCM, scaled to `peak`. Silence stays silent. */
export function writeWav(path, b, peak = 0.89) {
  const top = b.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const pcm = Buffer.alloc(b.length * 2);
  b.forEach((v, i) => pcm.writeInt16LE(Math.round((v / top) * peak * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, Buffer.concat([h, pcm]));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [sound, path] = process.argv.slice(2);
  const sounds = { click: [0.05, click], whoosh: [0.6, whoosh], thump: [1.2, thump], pad: [2, pad] };
  if (!sounds[sound] || !path) {
    console.error("usage: node scripts/audio/synth.mjs <click|whoosh|thump|pad> <out.wav>");
    process.exit(1);
  }
  const [seconds, make] = sounds[sound];
  const b = buffer(seconds);
  make(b);
  writeWav(path, b);
  console.log(`wrote ${path}, ${seconds} s`);
}
