// Writes public/ads/smoke/blip.wav: one second of a soft two-note chime, synthesized here so there's nothing to license.
import { mkdirSync, writeFileSync } from "node:fs";

const rate = 44100;
const samples = rate;
const data = Buffer.alloc(samples * 2);
for (let i = 0; i < samples; i++) {
  const t = i / rate;
  const note = Math.sin(2 * Math.PI * 440 * t) + 0.6 * Math.sin(2 * Math.PI * 660 * t);
  const envelope = Math.min(t / 0.005, 1) * Math.exp(-3 * t);
  data.writeInt16LE(Math.round(note * envelope * 0.5 * 32767), i * 2);
}

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

mkdirSync("public/ads/smoke", { recursive: true });
writeFileSync("public/ads/smoke/blip.wav", Buffer.concat([header, data]));
