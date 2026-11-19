// bun run hand:check <slug>   Sheet of every traced text and path with the strokes numbered in writing order, and flags.
//
// Writes out/<slug>/hand-check.png (to look at) and out/<slug>/hand-check.json (for the validator). Exits 1 on any error.
//
// hand-check.json, format 1:
//   {
//     "format": 1,
//     "slug": "launch",
//     "ok": true,                      false if any entry has a flag of level "error"
//     "sheet": "out/launch/hand-check.png",
//     "thresholds": { "coverage": 0.995, "leak": 0.05, ... },
//     "entries": [{
//       "id": "hello",
//       "kind": "text",                "text" or "path"
//       "text": "Hello",               text only
//       "dir": "ltr",                  text only
//       "strokes": 7,
//       "letters": 5,                  letters with ink; 0 on a path
//       "coverage": 0.999,             0..1, share of the ink the finished mask reaches. A low value means the word's last
//                                      frame pops when the mask comes off. Paths are their own ink, so always 1.
//       "leak": 0.012,                 0..1, the worst moment of the write: share of the ink of letters not yet written
//                                      that the pen has already uncovered. High means it reads as a wipe. 0 on a path.
//       "flags": [{
//         "code": "order-backwards",   see below
//         "level": "error",            "error" fails the check, "warn" is worth a look on the sheet
//         "message": "…",              one line for a person
//         "stroke": 4,                 optional, 1-based, the number on the sheet
//         "letter": 2                  optional, 0-based, in logical order
//       }]
//     }]
//   }
//
// Flag codes:
//   missing          error  listed in hand.ts but not in hand.gen.json. Run `bun run hand <slug>`.
//   stale            error  hand.ts or the font changed since the trace. Run `bun run hand <slug>`.
//   no-strokes       error  an entry with nothing to write.
//   letter-missing   error  a letter has ink but no strokes.
//   coverage-low     error  coverage below the threshold, for the text or one letter.
//   order-letters    error  a stroke belongs to a letter earlier than the one before it.
//   order-backwards  error  a letter starts against the direction of the text.
//   start-low        warn   a letter's first stroke starts in its bottom quarter.
//   leak-high        warn   the pen uncovers later letters early.
//   stroke-tiny      warn   a stroke too short to read.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import type { HandEntry } from "../src/parts/hand/types.ts";
import { resolveHandFont } from "../src/parts/hand/fonts.ts";
import { graphemes, loadGen, loadManifest, openHandPage, pathKey, settingOf, textKey, type HandPage, type Mask } from "./lib/hand-page.ts";
import { ROOT } from "./lib/videos.ts";

const THRESHOLDS = {
  coverage: 0.995, // Below this the end of the write visibly pops.
  letterCoverage: 0.97,
  leak: 0.05,
  backwards: 0.35, // A letter may start this many letter-widths behind the last one before it counts as backwards.
  startLow: 0.75, // Share of a letter's height, from its top.
  tiny: 0.015, // Share of the font size.
};

type Flag = { code: string; level: "error" | "warn"; message: string; stroke?: number; letter?: number };

const count = (mask: Mask) => mask.data.reduce((sum, v) => sum + v, 0);
const overlap = (a: Mask, b: Mask) => a.data.reduce((sum, v, i) => sum + (v & b.data[i]), 0);

function bounds({ w, data }: Mask) {
  let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i < data.length; i++)
    if (data[i]) {
      const [x, y] = [i % w, (i / w) | 0];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  return { minX, maxX, minY, maxY };
}

/** Text entries: what the masks really do, measured from pixels. */
async function checkText(hp: HandPage, entry: HandEntry) {
  const flags: Flag[] = [];
  const s = settingOf(entry);
  const [vx, vy, vw, vh] = entry.viewBox;
  const pad = entry.reveal;
  const box: [number, number, number, number] = [vx - pad, vy - pad, vw + pad * 2, vh + pad * 2];
  const pen = (strokes: HandEntry["strokes"]) =>
    strokes.map((k) => `<path d="${k.d}" fill="none" stroke="#fff" stroke-width="${k.reveal}" stroke-linecap="butt" stroke-linejoin="round"/>`).join("");

  const ink = await hp.ink(s, box);
  const parts = graphemes(entry.text!);
  const letters: { index: number; mask: Mask; bounds: ReturnType<typeof bounds> }[] = [];
  for (let index = 0; index < parts.length; index++) {
    const mask = await hp.letter(s, box, index);
    if (mask) letters.push({ index, mask, bounds: bounds(mask) });
  }

  const reached = await hp.shapes(pen(entry.strokes), box);
  const coverage = overlap(ink, reached) / count(ink);
  if (coverage < THRESHOLDS.coverage) {
    flags.push({ code: "coverage-low", level: "error", message: `the mask reaches ${(coverage * 100).toFixed(1)}% of the ink` });
  }

  for (const { index, mask } of letters) {
    const own = entry.strokes.filter((k) => k.letter === index);
    if (!own.length) {
      flags.push({ code: "letter-missing", level: "error", letter: index, message: `"${parts[index]}" has ink but no strokes` });
      continue;
    }
    const part = overlap(mask, await hp.shapes(pen(own), box)) / count(mask);
    if (part < THRESHOLDS.letterCoverage) {
      flags.push({ code: "coverage-low", level: "error", letter: index, message: `"${parts[index]}": its strokes reach ${(part * 100).toFixed(1)}% of it` });
    }
  }

  // Leak: after each letter, how much of what's still to come is already showing.
  let leak = 0;
  for (let i = 0; i + 1 < letters.length; i++) {
    const written = await hp.shapes(pen(entry.strokes.filter((k) => k.letter <= letters[i].index)), box);
    let shown = 0, later = 0;
    for (let j = i + 1; j < letters.length; j++) {
      shown += overlap(letters[j].mask, written);
      later += count(letters[j].mask);
    }
    const share = shown / later;
    if (share > leak) leak = share;
  }
  if (leak > THRESHOLDS.leak) {
    flags.push({ code: "leak-high", level: "warn", message: `up to ${(leak * 100).toFixed(1)}% of the letters to come show early` });
  }

  // Order, stroke by stroke.
  const toward = entry.dir === "rtl" ? -1 : 1;
  const firstOf = new Map<number, number>();
  entry.strokes.forEach((k, i) => {
    if (!firstOf.has(k.letter)) firstOf.set(k.letter, i);
    if (i && k.letter < entry.strokes[i - 1].letter) {
      flags.push({ code: "order-letters", level: "error", stroke: i + 1, letter: k.letter, message: `stroke ${i + 1} goes back to an earlier letter` });
    }
    if (k.len < entry.size! * THRESHOLDS.tiny) {
      flags.push({ code: "stroke-tiny", level: "warn", stroke: i + 1, letter: k.letter, message: `stroke ${i + 1} is only ${k.len} long` });
    }
  });
  for (let i = 0; i < letters.length; i++) {
    const { index, bounds: b } = letters[i];
    const first = firstOf.get(index);
    if (first === undefined) continue;
    const [x, y] = entry.strokes[first].pts[0];
    const height = b.maxY - b.minY || 1;
    if ((y - (b.minY + box[1])) / height > THRESHOLDS.startLow) {
      flags.push({ code: "start-low", level: "warn", stroke: first + 1, letter: index, message: `"${parts[index]}" starts near its bottom` });
    }
    // Measured from the last real letter: a dot has no width to give a tolerance, and a cursive ל swings over one.
    const last = letters.slice(0, i).findLast((letter) => /\p{L}/u.test(parts[letter.index]));
    if (last) {
      const before = last.bounds;
      const width = Math.max(1, before.maxX - before.minX);
      const lead = toward > 0 ? before.minX + box[0] : before.maxX + box[0];
      if ((x - lead) * toward < -width * THRESHOLDS.backwards) {
        flags.push({ code: "order-backwards", level: "error", stroke: first + 1, letter: index, message: `"${parts[index]}" starts behind "${parts[last.index]}"` });
      }
    }
  }
  return { coverage, leak, letters: letters.length, flags };
}

/** A panel: the ink in grey, strokes colored along the rainbow by order, each numbered at its start with an arrow part way. */
function panel(id: string, entry: HandEntry, flags: Flag[], longest: number) {
  const [vx, vy, vw, vh] = entry.viewBox;
  const k = Math.min(1500, vw * 1.5, Math.max(760, longest * 1.5)) / vw;
  const label = entry.strokes.map((stroke, i) => {
    const hue = (i / Math.max(entry.strokes.length, 1)) * 300;
    const color = `hsl(${hue} 90% 62%)`;
    const pts = stroke.pts;
    const [sx, sy] = pts[0];
    const mid = Math.floor(pts.length / 2);
    const [ax, ay] = pts[Math.max(0, mid - 1)];
    const [bx, by] = pts[Math.min(pts.length - 1, mid + 1)];
    const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
    const unit = 1 / k;
    const r = 11 * unit;
    return `<path d="${stroke.core}" fill="none" stroke="${color}" stroke-width="${3.5 * unit}" stroke-linecap="round" opacity=".95"/>
      <path d="M${-9 * unit} ${-7 * unit}L${9 * unit} 0L${-9 * unit} ${7 * unit}Z" fill="${color}" transform="translate(${pts[mid][0]} ${pts[mid][1]}) rotate(${angle})"/>
      <circle cx="${sx}" cy="${sy}" r="${r}" fill="#000" stroke="${color}" stroke-width="${2 * unit}"/>
      <text x="${sx}" y="${sy}" dy=".36em" text-anchor="middle" font-family="system-ui" font-size="${13 * unit}" font-weight="700" fill="#fff" direction="ltr">${i + 1}</text>`;
  });
  const ghost = entry.kind === "text"
    ? `<text x="${entry.x}" y="${entry.y}" direction="${entry.dir}" text-anchor="start" font-family="${entry.font!.family}" font-weight="${entry.font!.weight}" font-size="${entry.size}" fill="#3d3d44" text-rendering="geometricPrecision" style="white-space:pre">${entry.text}</text>`
    : entry.strokes.map((s) => `<path d="${s.d}" fill="none" stroke="#3d3d44" stroke-width="${entry.ink}" stroke-linecap="round"/>`).join("");
  const worst = flags.filter((f) => f.level === "error").length ? "#ff6b6b" : flags.length ? "#ffc14d" : "#7ddc8a";
  return `<figure><figcaption><b>${id}</b> <span dir="auto">${entry.text ?? ""}</span> · ${entry.strokes.length} strokes
    <span style="color:${worst}">${flags.length ? flags.map((f) => f.code).join(", ") : "clean"}</span></figcaption>
    <svg xmlns="http://www.w3.org/2000/svg" width="${vw * k}" height="${vh * k}" viewBox="${vx} ${vy} ${vw} ${vh}" style="background:#17171b">${ghost}${label.join("")}</svg></figure>`;
}

const { positionals } = parseArgs({ allowPositionals: true });
const slug = positionals[0];
if (!slug) throw new Error("which ad? bun run hand:check <slug>");

const manifest = await loadManifest(slug);
const gen = loadGen(slug);
const texts = manifest.texts ?? [];
const paths = manifest.paths ?? [];

const hp = await openHandPage(texts.map((s) => resolveHandFont(s.font)));
const report = [];
const panels: string[] = [];
try {
  const specs = [...texts.map((s) => ({ spec: s, key: textKey(s) })), ...paths.map((s) => ({ spec: s, key: pathKey(s) }))];
  const longest = Math.max(0, ...specs.map(({ spec }) => gen?.entries[spec.id]?.viewBox[2] ?? 0));
  for (const { spec, key } of specs) {
    const entry = gen?.entries[spec.id];
    if (!entry) {
      const flags: Flag[] = [{ code: "missing", level: "error", message: `not traced. Run: bun run hand ${slug}` }];
      report.push({ id: spec.id, kind: "text" in spec ? "text" : "path", strokes: 0, letters: 0, coverage: 0, leak: 0, flags });
      continue;
    }
    const measured = entry.kind === "text" ? await checkText(hp, entry) : { coverage: 1, leak: 0, letters: 0, flags: [] as Flag[] };
    const flags = measured.flags;
    if (entry.key !== key) flags.unshift({ code: "stale", level: "error", message: `hand.ts or the font changed. Run: bun run hand ${slug}` });
    if (!entry.strokes.length) flags.unshift({ code: "no-strokes", level: "error", message: "nothing to write" });
    report.push({ id: spec.id, kind: entry.kind, text: entry.text, dir: entry.dir, strokes: entry.strokes.length, letters: measured.letters, coverage: +measured.coverage.toFixed(4), leak: +measured.leak.toFixed(4), flags });
    panels.push(panel(spec.id, entry, flags, longest));
  }

  const dir = join(ROOT, "out", slug);
  mkdirSync(dir, { recursive: true });
  const sheet = join(dir, "hand-check.png");
  await hp.page.setViewportSize({ width: 1600, height: 900 });
  await hp.page.evaluate((html) => {
    document.body.innerHTML = `<style>
      html, body { background: #0d0d10; } body { margin: 0; padding: 16px; width: max-content; color: #ddd; font: 17px system-ui; display: grid; gap: 18px; }
      figure { margin: 0; } figcaption { padding-bottom: 6px; } svg { display: block; }
    </style>${html}`;
  }, panels.join(""));
  await hp.page.evaluate(() => document.fonts.ready.then(() => {}));
  await hp.page.screenshot({ path: sheet, fullPage: true });

  const ok = report.every((entry) => entry.flags.every((flag) => flag.level !== "error"));
  writeFileSync(
    join(dir, "hand-check.json"),
    JSON.stringify({ format: 1, slug, ok, sheet: relative(ROOT, sheet).replaceAll("\\", "/"), thresholds: THRESHOLDS, entries: report }, null, 2) + "\n",
  );
  for (const entry of report) {
    console.log(`${entry.id.padEnd(16)} ${String(entry.strokes).padStart(3)} strokes  coverage ${(entry.coverage * 100).toFixed(1)}%  leak ${(entry.leak * 100).toFixed(1)}%`);
    for (const flag of entry.flags) console.log(`  ${flag.level.padEnd(5)} ${flag.code}: ${flag.message}`);
  }
  console.log(sheet);
  if (!ok) process.exitCode = 1;
} finally {
  await hp.close();
}
