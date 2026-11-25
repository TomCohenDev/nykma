// bun run take <slug> <take> [--script <file>] [--mic <file>] [--lang he]   cuts a talking-head take (spec.md §6.11)
// bun run take <slug>                                                          recuts from src/ads/<slug>/cut.json, in seconds
// bun run take <slug> --verify                                                 hears the cut again and checks every word
//
// <take> is a video file (copied to public/ads/<slug>/footage/ and unpacked, as bun run footage does) or the name of a
// clip already unpacked there. The script is a markdown table with a Line column (an "id" or "scene" column names the
// scenes), or one line per scene; with none given it's the queue folder's script.md, then the pitch's voice lines, and
// with none at all the take's own sentences. More flags, kept in cut.json for the next run:
//   --mic <file>          a separate mic recording of the same take, lined up with the camera's sound and used as the voice
//   --screen <file>       a screen recording made during the take, unpacked and lined up by its sound (or by hand, cut.md
//                         says how, when it has none), for <TakeScreen>
//   --clean auto|on|off   the voice chain (auto: denoise only a noisy room)
//   --pause 0.5           a pause longer than this inside a line becomes a jump cut
//   --fresh               hear the take again instead of using what Whisper heard last time
//   --no-face             don't look for the face
//
// Writes src/ads/<slug>/cut.json (the decisions: edit this), src/ads/<slug>/take.json (what the ad imports, through
// src/parts/take.tsx) and the cut as a table in queue/<folder>/cut.md (out/<slug>/cut.md with no queue folder).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { clipName, clipsOf, PYTHON, unpack, VIDEO } from "./lib/footage.ts";
import { folderParts, HEBREW, queueFolder, readIf, readPitch, tables } from "./lib/queue.ts";

const ROOT = resolve(import.meta.dirname, "..");
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    script: { type: "string" },
    mic: { type: "string" },
    screen: { type: "string" },
    lang: { type: "string" },
    clean: { type: "string" },
    pause: { type: "string" },
    fps: { type: "string" },
    fresh: { type: "boolean" },
    verify: { type: "boolean" },
    "no-face": { type: "boolean" },
  },
});
const [slug, given] = positionals;
if (!slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) {
  console.error("Usage: bun run take <slug> [<take file or clip>] [--script <file>] [--mic <file>] [--screen <file>] [--lang he] [--verify]");
  process.exit(1);
}

type Line = { id: string; line: string; pick?: number; hl?: string[]; fix?: Record<string, string>; trim?: [number, number]; pause?: number };
type Cut = { clip?: string; lang?: string; mic?: string; screen?: { clip: string; at?: number | null; by?: string }; clean?: string; pause?: number; script?: string; lines?: Line[]; fix?: Record<string, string> };

const adDir = join(ROOT, "src", "ads", slug);
mkdirSync(adDir, { recursive: true });
const cutPath = join(adDir, "cut.json");
const cut: Cut = existsSync(cutPath) ? JSON.parse(readFileSync(cutPath, "utf8")) : {};
const folder = queueFolder(slug);
const brand = folder ? folderParts(basename(folder))?.brand : undefined;

/** A cell or line as said: no markdown, no quotes around it. */
const said = (text: string) =>
  text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\*\*|__|`/g, "")
    .replace(/^["“”״]+|["“”״]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** The scenes of a script: a table's Line column (ids from an id or scene column), or one line each. */
function scriptLines(text: string): Line[] {
  const ids = new Set<string>();
  const idFor = (raw: string | undefined, n: number) => {
    let id = raw && /^[a-z][a-z0-9-]*$/i.test(raw.trim()) ? raw.trim().toLowerCase() : `s${n}`;
    for (let k = 2; ids.has(id); k++) id = `${id.replace(/-\d+$/, "")}-${k}`;
    ids.add(id);
    return id;
  };
  for (const table of tables(text)) {
    const col = table.header.findIndex((cell) => /^(line|says|text|script|שורה)|to say/.test(cell));
    if (col < 0) continue;
    const idCol = table.header.findIndex((cell) => /^(id|scene|shot)$/.test(cell));
    const lines = table.rows.map((row, i) => ({ id: idFor(row[idCol], i + 1), line: said(row[col] ?? "") })).filter((line) => line.line);
    if (lines.length) return lines;
  }
  return text
    .split(/\r?\n/)
    .map((raw) => raw.replace(/^\s*(?:[-*]|\d+[.)])\s+/, ""))
    .filter((raw) => raw.trim() && !/^\s*(#|>|\|)/.test(raw))
    .map((raw, i) => {
      const named = raw.match(/^([a-z][a-z0-9-]*)\s*[:|]\s*(.+)$/i);
      return { id: idFor(named?.[1], i + 1), line: said(named ? named[2] : raw) };
    });
}

/** New lines keep what cut.json had decided for the same id. */
function adopt(lines: Line[]) {
  const before = new Map((cut.lines ?? []).map((line) => [line.id, line]));
  cut.lines = lines.map((line) => ({ ...before.get(line.id), ...line }));
}

if (values.script) {
  const file = resolve(values.script);
  if (!existsSync(file)) {
    console.error(`No script at ${values.script}`);
    process.exit(1);
  }
  adopt(scriptLines(readFileSync(file, "utf8")));
  cut.script = values.script;
} else if (!cut.lines?.length && folder) {
  const script = readIf(join(folder, "script.md"));
  const fromScript = script ? scriptLines(script) : [];
  const fromPitch = readPitch(folder)?.rows.filter((row) => row.voice).map((row, i) => ({ id: `s${i + 1}`, line: said(row.voice) })) ?? [];
  if (fromScript.length) {
    adopt(fromScript);
    cut.script = `${basename(folder)}/script.md`;
  } else if (fromPitch.length) {
    adopt(fromPitch);
    cut.script = `${basename(folder)}/pitch.md`;
  }
}
if (values.lang) cut.lang = values.lang;
if (!cut.lang && cut.lines?.some((line) => HEBREW.test(line.line))) cut.lang = "he";
if (values.mic) cut.mic = values.mic;
if (values.clean) {
  if (!["auto", "on", "off"].includes(values.clean)) {
    console.error("--clean is auto, on or off.");
    process.exit(1);
  }
  cut.clean = values.clean;
}
if (values.pause) cut.pause = Number(values.pause);

// The take: a file to copy in and unpack, a clip already unpacked, or the one cut.json names.
let clip = cut.clip;
if (given) {
  const file = resolve(given);
  if (existsSync(file) && VIDEO.test(file)) {
    const name = clipName(file);
    const have = clipsOf(slug).find((item) => item.meta?.name === name);
    if (!have?.meta || values.fresh) {
      const meta = await unpack(slug, file);
      console.log(`${meta.name}: ${meta.seconds} s at ${meta.fps} fps, ${meta.width}x${meta.height}${meta.sound ? ", with sound" : ", NO SOUND"}`);
    }
    clip = name;
  } else clip = given;
}
if (!clip) {
  console.error("Which take? bun run take <slug> <the take's file>");
  process.exit(1);
}
cut.clip = clip;
const clipDir = join(ROOT, "public", "ads", slug, "gen", "footage", clip);
if (!existsSync(join(clipDir, "meta.json"))) {
  const file = clipsOf(slug).find((item) => clipName(item.file) === clip)?.file;
  if (!file) {
    console.error(`No clip "${clip}" in public/ads/${slug}/footage/. Give the take's file.`);
    process.exit(1);
  }
  await unpack(slug, file);
}
if (values.screen) {
  const file = resolve(values.screen);
  if (!existsSync(file) || !VIDEO.test(file)) {
    console.error(`No screen recording at ${values.screen}`);
    process.exit(1);
  }
  const name = clipName(file);
  if (!clipsOf(slug).find((item) => item.meta?.name === name)?.meta || values.fresh) {
    const meta = await unpack(slug, file);
    console.log(`${meta.name}: ${meta.seconds} s at ${meta.fps} fps, ${meta.width}x${meta.height}${meta.sound ? ", with sound" : ", NO SOUND: it'll be lined up by hand"}`);
  }
  cut.screen = cut.screen?.clip === name ? cut.screen : { clip: name };
}
writeFileSync(cutPath, JSON.stringify(cut, null, 1) + "\n");

const report = folder ? join(folder, "cut.md") : join(ROOT, "out", slug, "cut.md");
const lexicon = brand && existsSync(join(ROOT, "brands", brand, "spelling.json")) ? join(ROOT, "brands", brand, "spelling.json") : undefined;
const args = [
  join(ROOT, "py", "take.py"), clipDir,
  "--cut", cutPath, "--take", join(adDir, "take.json"), "--report", report,
  ...(values.fps ? ["--fps", values.fps] : []),
  ...(lexicon ? ["--lexicon", lexicon] : []),
  ...(values.fresh ? ["--retranscribe"] : []),
  ...(values["no-face"] ? ["--no-face"] : []),
  ...(values.verify ? ["--verify"] : []),
];
if (!existsSync(PYTHON)) {
  console.error("No Python venv. py/README.md says how to make one.");
  process.exit(1);
}
const result = spawnSync(PYTHON, args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
process.exit(result.status ?? 1);
