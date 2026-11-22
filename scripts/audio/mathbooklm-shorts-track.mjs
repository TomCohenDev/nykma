// Music for the three MathbookLM shorts of 2026-11-21 (shorashim, rak-et-zeh, kav-echad). Made here from synth.mjs,
// so there's nothing to license and it comes out the same every time. Music only, no pen sounds (as on three-tries).
// Run: node scripts/audio/mathbooklm-shorts-track.mjs → public/ads/<slug>/music.wav for each.
import { SR, buffer, mtof, pad, rng, thump, whoosh, writeWav } from "./synth.mjs";

/** A soft felt-piano note: a few sine partials, a quick soft attack and a long decay. */
function pluck(b, t, midi, amp = 0.3, decay = 1.6, seed = 1) {
  const r = rng(seed), s = Math.floor(t * SR), n = Math.min(b.length - s, Math.floor(decay * 5 * SR));
  if (s < 0 || n <= 0) return;
  const f = mtof(midi);
  const parts = [[1, 1], [2, 0.32], [3, 0.12], [4.01, 0.05]].map(([m, a]) => ({ f: f * m * (1 + (r() - 0.5) * 0.002), a, d: decay / m ** 0.6 }));
  for (let i = 0; i < n; i++) {
    const e = i / SR;
    let v = 0;
    for (const p of parts) v += p.a * Math.sin(2 * Math.PI * p.f * e) * Math.exp(-e / p.d);
    b[s + i] += amp * v * Math.min(1, e / 0.006);
  }
}

/** Fades the last `seconds` to silence, and the first `inS` in. */
function fades(b, inS, seconds) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    const t = i / SR, left = (n - i) / SR;
    if (t < inS) b[i] *= t / inS;
    if (left < seconds) b[i] *= (left / seconds) ** 1.5;
  }
}

const out = (slug, b) => {
  writeWav(`public/ads/${slug}/music.wav`, b);
  console.log(`wrote public/ads/${slug}/music.wav (${(b.length / SR).toFixed(2)} s)`);
};

// ── shorashim, 14 s: D major, slow and growing. A note as the root forks, a lift when the equation shows, one note per
// row as Solve writes it, a warm low note on the green box, the resolved chord on the end card.
{
  const b = buffer(14);
  pad(b, 0, 2.7, [38, 50, 57, 64], 0.16, { cutoff: 520, attack: 0.05, release: 0.6, seed: 11 });
  pad(b, 2.4, 5.6, [38, 50, 57, 62, 66], 0.18, { cutoff: 900, attack: 0.5, release: 0.8, seed: 12 });
  pad(b, 7.6, 3.4, [43, 55, 59, 62, 66], 0.18, { cutoff: 1100, attack: 0.4, release: 0.8, seed: 13 });
  pad(b, 10.7, 3.3, [38, 50, 57, 62, 66, 69], 0.2, { cutoff: 1300, attack: 0.3, release: 1.4, seed: 14 });
  [[0.05, 74], [0.75, 69], [1.45, 71], [1.5, 78]].forEach(([t, m], i) => pluck(b, t, m, 0.2, 1.4, 20 + i));
  [[2.75, 74], [3.15, 78], [3.55, 81]].forEach(([t, m], i) => pluck(b, t, m, 0.24, 1.8, 30 + i));
  [[4.7, 76], [5.95, 74], [6.55, 71]].forEach(([t, m], i) => pluck(b, t, m, 0.24, 1.5, 40 + i));
  thump(b, 8.5, 0.35, { from: 110, to: 73.4, decay: 0.5 });
  [[8.5, 66], [8.5, 74], [8.62, 78]].forEach(([t, m], i) => pluck(b, t, m, 0.22, 2.2, 50 + i));
  [[10.95, 74], [11.3, 78], [11.65, 81], [12.0, 86]].forEach(([t, m], i) => pluck(b, t, m, 0.2, 2.4, 60 + i));
  fades(b, 0.02, 1.4);
  out("shorashim", b);
}

// ── rak-et-zeh, 15 s: the first 8.5 s are a phrase played backwards (swells that suck in), then near silence on the
// hold, then a forward chord for the payoff line and the end card.
{
  const len = 15;
  const fwd = buffer(8.5);
  pad(fwd, 0, 8.5, [45, 57, 64, 67, 72], 0.16, { cutoff: 1000, attack: 0.01, release: 3, seed: 71 });
  const notes = [76, 72, 74, 69, 71, 67, 72, 64, 69, 76, 71, 74];
  notes.forEach((m, i) => pluck(fwd, 0.15 + i * 0.62, m, 0.26, 1.2, 80 + i));
  whoosh(fwd, 0, 0.9, 0.25, { peak: 0.1, low: 600, high: 3000, seed: 90 });
  const b = buffer(len);
  for (let i = 0; i < fwd.length; i++) b[i] = fwd[fwd.length - 1 - i];
  // the stop: a soft low note as the rewind halts at 8.5 s, then a held, quiet room
  thump(b, 8.5, 0.3, { from: 90, to: 55, decay: 0.45 });
  pad(b, 8.6, 1.6, [45, 57, 64], 0.05, { cutoff: 400, attack: 0.4, release: 0.8, seed: 91 });
  // the payoff: forward, plain and warm
  pad(b, 10.0, 5.0, [41, 53, 60, 64, 69], 0.17, { cutoff: 1100, attack: 0.35, release: 1.6, seed: 92 });
  [[10.05, 72], [10.45, 76], [10.85, 79], [12.45, 77], [12.8, 81], [13.15, 84]].forEach(([t, m], i) => pluck(b, t, m, 0.22, 2.2, 100 + i));
  fades(b, 0.02, 1.3);
  out("rak-et-zeh", b);
}

// ── kav-echad, 14.5 s: a pen line's quiet drone, then a soft pulse that follows the current: one beat a half-period
// at the slowed sim's speed, halving its rate when C goes from 100 to 400 µF (f ≈ 159 → 79.6 Hz), and one note on the M.
{
  const b = buffer(14.5);
  pad(b, 0, 6.6, [40, 52, 59, 64], 0.15, { cutoff: 600, attack: 0.05, release: 0.8, seed: 121 });
  [[0.05, 71], [1.0, 76], [2.0, 74], [3.0, 79], [4.1, 76], [5.0, 83]].forEach(([t, m], i) => pluck(b, t, m, 0.17, 1.2, 130 + i));
  pad(b, 6.3, 6.0, [40, 52, 59, 64, 68], 0.17, { cutoff: 1000, attack: 0.4, release: 0.8, seed: 122 });
  // the pulse: from the sim's first swing (6.9 s), every 0.45 s; from 9.5 s the period stretches to twice that
  let t = 6.9;
  let i = 0;
  while (t < 12) {
    const k = Math.min(1, Math.max(0, (t - 9.5) / 1.2));
    const period = 0.45 * (1 + k);
    thump(b, t, 0.42, { from: 120, to: 64, decay: 0.16 + 0.1 * k });
    pluck(b, t, i % 2 ? 71 : 76, 0.1, 0.5, 140 + i);
    t += period;
    i++;
  }
  pad(b, 11.9, 2.6, [40, 52, 59, 64, 68, 71], 0.2, { cutoff: 1300, attack: 0.3, release: 1.4, seed: 123 });
  [[12.0, 76], [12.3, 80], [12.6, 83], [12.95, 88]].forEach(([t2, m], j) => pluck(b, t2, m, 0.22, 2.2, 160 + j));
  fades(b, 0.02, 1.3);
  out("kav-echad", b);
}
