// Cuts the Danit lines for pag-tokef, tightens them by 18% with pitch kept, places them, and mixes them over the music.
// Free: ffmpeg only. Run after `mv.py build pag-tokef`:
//   node scripts/audio/pag-tokef-voice.mjs → public/ads/pag-tokef/vo/<id>.wav, mix.wav, src/ads/pag-tokef/words.json
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "public/ads/pag-tokef";
const FPS = 30;
const SPEED = 1.18;

// [id, seconds it starts in the ad, spans kept from the source]: the spans drop the pauses found with silencedetect.
const LINES = [
  ["swipe", 0.15, [[0, 1.2], [1.35, 2.21]]],
  ["rate", 2.2, [[0, 0.95], [1.1, 2.46], [2.62, 4.34]]],
  ["market", 5.75, [[0, 2.55], [2.67, 5.7]]],
  ["form", 10.65, [[0, 1.46], [1.76, 2.58]]],
  ["resume", 12.75, [[0, 3.55]]],
  ["feed", 15.9, [[0, 1.22], [1.53, 4.84]]],
  ["chat", 21, [[0, 3.13]]],
  ["tailored", 23.75, [[0, 2.37]]],
  ["list", 25.84, [[0, 1.97]]],
  ["end", 27.7, [[0, 2.78]]],
];

/** Each word of a line and when it starts in the source, in seconds. */
function wordsOf(id) {
  const { characters: a } = JSON.parse(readFileSync(`${DIR}/gen/voice.${id}.align.json`, "utf8"));
  const out = [];
  let word = "";
  let start = 0;
  a.characters.forEach((c, i) => {
    if (c.trim()) {
      if (!word) start = a.character_start_times_seconds[i];
      word += c;
    } else if (word) {
      out.push({ word, start });
      word = "";
    }
  });
  if (word) out.push({ word, start });
  return out;
}

/** Where a moment in the source lands after the pauses are cut and the line is tightened. */
function after(spans, t) {
  let kept = 0;
  for (const [from, to] of spans) {
    if (t < from) break;
    kept += Math.min(t, to) - from;
  }
  return kept / SPEED;
}

mkdirSync(`${DIR}/vo`, { recursive: true });
const words = {};
for (const [id, at, spans] of LINES) {
  const out = `${DIR}/vo/${id}.wav`;
  const parts = spans.map(([from, to], i) => `[0]atrim=${from}:${to},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,areverse,afade=t=in:d=0.03,areverse[p${i}]`);
  const join = `${spans.map((_, i) => `[p${i}]`).join("")}concat=n=${spans.length}:v=0:a=1,atempo=${SPEED}[v]`;
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", `${DIR}/gen/voice.${id}.mp3`, "-filter_complex", [...parts, join].join(";"), "-map", "[v]", "-ar", "44100", "-ac", "1", out]);
  const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString());
  words[id] = {
    at: Math.round(at * FPS),
    end: Math.round((at + seconds) * FPS),
    words: wordsOf(id).map((w) => [w.word, Math.round((at + after(spans, w.start)) * FPS)]),
  };
  console.log(id, seconds.toFixed(2), `${at.toFixed(2)}-${(at + seconds).toFixed(2)} s`);
}
writeFileSync("src/ads/pag-tokef/words.json", `${JSON.stringify(words, null, 1)}\n`);

// The music sits well under the voice and dips further while she speaks. render.ts takes an ad's own mix as finished, so it ends at -14 LUFS here.
const inputs = ["-i", `${DIR}/gen/music.mp3`, ...LINES.flatMap(([id]) => ["-i", `${DIR}/vo/${id}.wav`])];
const delayed = LINES.map(([, at], i) => `[${i + 1}]adelay=${Math.round(at * 1000)}:all=1,apad[d${i}]`);
const graph = [
  ...delayed,
  `${LINES.map((_, i) => `[d${i}]`).join("")}amix=inputs=${LINES.length}:normalize=0,atrim=0:30.5,asplit=2[voice][key]`,
  "[0]apad,atrim=0:30.5,aformat=channel_layouts=stereo,volume=0.42[bed]",
  "[bed][key]sidechaincompress=threshold=0.02:ratio=4:attack=20:release=400[ducked]",
  "[voice]aformat=channel_layouts=stereo,volume=2.2[lead]",
  "[ducked][lead]amix=inputs=2:normalize=0,alimiter=limit=0.9[out]",
].join(";");
const raw = `${DIR}/gen/mix-raw.wav`;
execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", graph, "-map", "[out]", "-ar", "44100", raw]);
const measured = spawnSync("ffmpeg", ["-hide_banner", "-i", raw, "-af", "loudnorm=I=-14:TP=-2.5:LRA=20:print_format=json", "-f", "null", "-"], { encoding: "utf8" }).stderr;
const gain = -14 - Number(measured.match(/"input_i" : "(-?[0-9.]+)"/)[1]);
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", raw, "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=0.74:level=disabled`, "-ar", "44100", `${DIR}/mix.wav`]);
console.log(`mix written, ${gain.toFixed(2)} dB to -14 LUFS`);
