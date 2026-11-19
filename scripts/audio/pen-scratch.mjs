// Writes public/sfx/pen-scratch.wav: eight seconds of a nib on paper, synthesized here so there's nothing to license.
// Band-passed noise for the scratch, a low rumble for the page, both shaken by random paper grain. handCues() trims it.
import { mkdirSync, writeFileSync } from "node:fs";

const rate = 44100;
const samples = rate * 8;

let state = 0x2f6e2b1;
const noise = () => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return ((state >>> 0) / 0xffffffff) * 2 - 1;
};

/** A band-pass biquad (RBJ cookbook). */
function bandPass(freq, q) {
  const w = (2 * Math.PI * freq) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const [b0, b2, a1, a2] = [alpha / a0, -alpha / a0, (-2 * Math.cos(w)) / a0, (1 - alpha) / a0];
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  return (x) => {
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    [x2, x1, y2, y1] = [x1, x, y1, y];
    return y;
  };
}

const scratch = bandPass(3400, 0.9);
const fibre = bandPass(6800, 1.4);
const page = bandPass(520, 0.8);

let grain = 0.6;
let target = 0.6;
const out = new Float64Array(samples);
for (let i = 0; i < samples; i++) {
  if (i % 700 === 0) target = 0.35 + 0.65 * Math.abs(noise()); // About 60 tiny catches of the nib a second.
  grain += (target - grain) * 0.004;
  const hand = 0.75 + 0.25 * Math.sin((2 * Math.PI * 6.3 * i) / rate + 2 * Math.sin((2 * Math.PI * 0.7 * i) / rate));
  out[i] = (scratch(noise()) * 0.9 + fibre(noise()) * 0.35 + page(noise()) * 0.5) * grain * hand;
}

const peak = out.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
const data = Buffer.alloc(samples * 2);
for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round((out[i] / peak) * 0.7 * 32767), i * 2);

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

mkdirSync("public/sfx", { recursive: true });
writeFileSync("public/sfx/pen-scratch.wav", Buffer.concat([header, data]));
