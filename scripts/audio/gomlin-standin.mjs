// Stand-in music for the three Gomlin shorts of 2026-11-21, for timing only (brands/gomlin/notes.md: a synthesized bed
// is a stand-in; the real track is ElevenLabs music, from each ad's spec.json, once the user approves the credits).
// Music only: no swipes, whooshes or pops.
//   node scripts/audio/gomlin-standin.mjs kmo-avoda|hilukh-iti|ha-sela  → public/ads/<slug>/music.wav
import { SR, buffer, mtof, pad, rng, thump, writeWav } from "./synth.mjs";

/** A plucked string: a decaying triangle with a little noise in the attack. Soft enough for a lyre or a synth pluck. */
function pluck(b, t, midi, amp = 0.25, decay = 0.35, bright = 0.5, seed = 7) {
  const r = rng(seed + Math.round(midi * 10)), s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(decay * 5 * SR));
  const f = mtof(midi);
  let ph = r(), lp = 0;
  for (let i = 0; i < n; i++) {
    const e = i / SR;
    ph = (ph + f / SR) % 1;
    const tri = 4 * Math.abs(ph - 0.5) - 1;
    const sq = ph < 0.5 ? 1 : -1;
    const v = tri * (1 - bright) + sq * bright * 0.35 + (r() * 2 - 1) * 0.3 * Math.exp(-e / 0.004);
    lp += (v - lp) * (0.12 + 0.5 * Math.exp(-e / 0.08));
    b[s + i] += amp * lp * Math.exp(-e / decay) * Math.min(1, e * 800);
  }
}

/** A closed hi-hat: bright noise with a fast decay. */
function hat(b, t, amp = 0.08, seed = 11) {
  const r = rng(seed + Math.round(t * 1000)), s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(0.06 * SR));
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const x = r() * 2 - 1;
    b[s + i] += amp * (x - prev) * Math.exp(-(i / SR) / 0.012);
    prev = x;
  }
}

/** A frame drum: a low skin tone and a soft slap. */
function drum(b, t, amp = 0.5) {
  thump(b, t, amp, { from: 110, to: 70, decay: 0.16 });
  hat(b, t, amp * 0.15, 3);
}

/** A sustained sine bass note. */
function bass(b, t, midi, length, amp = 0.35) {
  const s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(length * SR)), f = mtof(midi);
  for (let i = 0; i < n; i++) {
    const e = i / SR;
    b[s + i] += amp * Math.sin(2 * Math.PI * f * e) * Math.min(1, e * 60, (length - e) * 20);
  }
}

/** A soft cymbal swell into a downbeat, as a musical crash rather than an effect. */
function crash(b, t, amp = 0.12, length = 1.4) {
  const r = rng(99), s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(length * SR));
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const x = r() * 2 - 1;
    b[s + i] += amp * (x - prev) * 0.6 * Math.exp(-(i / SR) / 0.5);
    prev = x;
  }
}

const PLANS = {
  // 150 BPM, a word card every two beats. Half a beat of silence at 4.8 s, the downbeat back on the throw at 6.0 s,
  // the lift on the pill at 10.0 s, the last chord at 11.2 s under the end card.
  "kmo-avoda": () => {
    const LEN = 13.6, B = 0.4, b = buffer(LEN);
    const chords = [[57, 60, 64, 69], [53, 57, 60, 65], [60, 64, 67, 72], [55, 59, 62, 67]]; // Am F C G
    const roots = [45, 41, 48, 43];
    const groove = (from, to, bright) => {
      for (let t = from; t < to - 0.01; t += B) {
        const beat = Math.round(t / B);
        const c = Math.floor(beat / 4) % 4;
        thump(b, t, 0.85, { from: 130, to: 48, decay: 0.16 });
        hat(b, t + B / 2, 0.07);
        if (beat % 4 === 0) { pad(b, t, B * 4, chords[c], 0.16, { cutoff: bright, attack: 0.05, release: 0.3, seed: beat }); bass(b, t, roots[c] - 12, B * 3.8, 0.28); }
        [0, 2, 1, 3].forEach((k, j) => pluck(b, t + (j * B) / 4, chords[c][k] + 12, 0.07, 0.12, 0.6, beat));
      }
    };
    groove(0, 4.8, 1800);
    pad(b, 5.0, 1.0, [57, 60, 64], 0.12, { cutoff: 700, attack: 0.3, release: 0.1, seed: 40 });
    crash(b, 6.0);
    groove(6.0, 10.0, 2600);
    crash(b, 10.0, 0.1);
    groove(10.0, 11.2, 3200);
    pad(b, 11.2, 2.4, [45, 57, 60, 64, 69], 0.2, { cutoff: 2200, attack: 0.02, release: 1.2, seed: 50 });
    bass(b, 11.2, 33, 2.2, 0.3);
    thump(b, 11.2, 0.9, { from: 130, to: 44, decay: 0.3 });
    return b;
  },
  // A stretched pad under the slow motion, one held note at "בזמן אמת:" (8.5 s), the beat dropping in on the snap
  // (9.6 s) at 120 BPM, and the last chord at 11.2 s.
  "hilukh-iti": () => {
    const LEN = 13.7, b = buffer(LEN);
    pad(b, 0, 4.4, [38, 50, 57, 62, 65], 0.2, { cutoff: 900, attack: 0.05, release: 0.4, seed: 1 });
    pad(b, 4.2, 4.5, [41, 53, 57, 60, 64], 0.2, { cutoff: 1100, attack: 0.4, release: 0.4, seed: 2 });
    for (let t = 0.2; t < 8.4; t += 1.4) { thump(b, t, 0.4, { from: 70, to: 40, decay: 0.3 }); pluck(b, t + 0.7, 74 + ((t * 3) % 5 > 2 ? 2 : 0), 0.05, 0.9, 0.2, 3); }
    pad(b, 8.5, 1.1, [69, 81], 0.12, { cutoff: 3000, attack: 0.05, release: 0.05, seed: 9 });
    const B = 0.5;
    crash(b, 9.6, 0.14);
    for (let t = 9.6; t < 11.2; t += B) {
      thump(b, t, 0.95, { from: 140, to: 46, decay: 0.18 });
      hat(b, t + B / 2, 0.08);
    }
    pad(b, 9.6, 1.6, [50, 57, 62, 65, 69], 0.18, { cutoff: 2600, attack: 0.01, release: 0.2, seed: 5 });
    bass(b, 9.6, 38, 1.5, 0.3);
    pad(b, 11.2, 2.5, [38, 50, 57, 62, 66], 0.2, { cutoff: 2000, attack: 0.02, release: 1.3, seed: 6 });
    bass(b, 11.2, 38, 2.3, 0.3);
    thump(b, 11.2, 0.9, { from: 130, to: 44, decay: 0.3 });
    return b;
  },
  // An ancient colour (a plucked lyre line and a frame drum, D Dorian) that turns modern on the first swipe at 5.7 s,
  // with the last chord at 11.0 s.
  "ha-sela": () => {
    const LEN = 13.5, b = buffer(LEN);
    const lyre = [62, 65, 67, 69, 67, 65, 64, 62, 60, 62, 65, 64];
    for (let i = 0; i < 19; i++) pluck(b, i * 0.3, lyre[i % lyre.length], 0.16, 0.5, 0.15, i);
    for (let t = 0; t < 5.7; t += 0.6) drum(b, t, 0.45);
    for (let t = 0.3; t < 5.7; t += 1.2) drum(b, t, 0.25);
    pad(b, 0, 5.7, [38, 45, 50], 0.1, { cutoff: 600, attack: 0.5, release: 0.3, seed: 2 });
    crash(b, 5.7, 0.12);
    const B = 0.5;
    const chords = [[50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [48, 55, 60, 64]];
    for (let t = 5.7; t < 11.0; t += B) {
      const beat = Math.round((t - 5.7) / B), c = Math.floor(beat / 4) % 4;
      thump(b, t, 0.85, { from: 130, to: 48, decay: 0.16 });
      hat(b, t + B / 2, 0.07);
      if (beat % 4 === 0) { pad(b, t, B * 4, chords[c], 0.14, { cutoff: 2200, attack: 0.05, release: 0.3, seed: beat }); bass(b, t, chords[c][0] - 12, B * 3.8, 0.26); }
      pluck(b, t, lyre[beat % lyre.length] + 12, 0.08, 0.3, 0.2, beat);
    }
    pad(b, 11.0, 2.5, [38, 50, 57, 62, 65], 0.2, { cutoff: 2000, attack: 0.02, release: 1.3, seed: 8 });
    bass(b, 11.0, 38, 2.3, 0.3);
    thump(b, 11.0, 0.9, { from: 130, to: 44, decay: 0.3 });
    return b;
  },
};

const slug = process.argv[2];
if (!PLANS[slug]) {
  console.error(`usage: node scripts/audio/gomlin-standin.mjs <${Object.keys(PLANS).join("|")}>`);
  process.exit(1);
}
const out = `public/ads/${slug}/music.wav`;
writeWav(out, PLANS[slug](), 0.5);
console.log(`wrote ${out}`);
