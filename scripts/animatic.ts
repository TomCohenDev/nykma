// bun run animatic <slug> [--ratio 9x16]   Turns the table in queue/<date>-<brand>-<slug>/pitch.md into queue/.../animatic.mp4.
// Free: images with a slow push-in, captions in the brand font, OS speech for the voice, a click on each beat.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium, type Browser } from "playwright";
import { RATIOS, SIZES, type Ratio } from "../src/engine/ratio.ts";
import { cli, outDir, probeSeconds, run } from "./lib/index.ts";
import { brandFor, HEBREW, locate, queueFolder, readPitch, type Brand, type Row } from "./lib/queue.ts";

const FPS = 30;
const SCALE = 2 / 3; // 1280x720 is plenty for judging an idea, and it keeps this in seconds.
const PUSH = 0.07; // Zoom gained over 6 s, so a short row drifts as slowly as a long one.
const HEBREW_WORDS_PER_SECOND = 2.4; // A calm voice-over.
const RATE = 48000;

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf" };

const dataUrl = (path: string) => `data:${MIME[extname(path).toLowerCase()] ?? "application/octet-stream"};base64,${readFileSync(path).toString("base64")}`;

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(seconds % 1 ? 1 : 0).padStart(seconds % 1 ? 4 : 2, "0")}`;

/** @font-face for each brand font with a file. System fonts are named as they are. */
function fontCss(brand?: Brand) {
  const faces = (brand?.fonts ?? []).flatMap(({ family, file }) => {
    const path = file && locate(file, brand!.dir, join(brand!.dir, "assets"));
    return path ? [`@font-face { font-family: "${family}"; src: url("${dataUrl(path)}"); font-weight: 100 900; }`] : [];
  });
  const named = (role: RegExp) => brand?.fonts.find((font) => role.test(font.role) && !/hand/i.test(font.role))?.family;
  const stack = (first?: string, second?: string) => [first, second].filter(Boolean).map((family) => `"${family}"`).concat("system-ui", "sans-serif").join(", ");
  const latin = named(/latin/i);
  const hebrew = named(/hebrew/i);
  return { faces: faces.join("\n"), latin: stack(latin, hebrew), hebrew: stack(hebrew, latin) };
}

const fontFor = (text: string, fonts: ReturnType<typeof fontCss>) => (HEBREW.test(text) ? fonts.hebrew : fonts.latin);

/**
 * Text as lines, each its own paragraph with its own direction, so a Hebrew quote inside an English label (or the
 * other way round) keeps its punctuation where it belongs. A long cell is split at its sentences, one per line.
 */
function paragraphs(text: string, long = 70) {
  const lines = text.split(/\n+/).flatMap((line) => (line.length > long ? line.split(/(?<=[.!?…]["”'״׳)\]]?)\s+(?=\S)/) : [line]));
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    // Each quoted piece is isolated, so "פרסומת" inside an English label (or "Google Play" inside Hebrew) reads whole.
    .map((line) => `<div dir="auto">${escape(line).replace(/(["“”״])([^"“”״]+)(["“”״])/g, "$1<bdi>$2</bdi>$3")}</div>`)
    .join("");
}

/** The most of the frame's height the caption block may take, so the picture or the description still shows. */
const CAPTION_SHARE = 0.38;

type Layers = { picture: string; caption: string };

/** One row as two PNGs: the picture, drawn large so the push-in stays sharp, and the caption, which holds still. */
async function drawRow(browser: Browser, row: Row, size: { width: number; height: number }, dir: string, fonts: ReturnType<typeof fontCss>, image: string | undefined, spoken: string): Promise<Layers> {
  const { width, height } = size;
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 2 });
  const unit = Math.min(width, height) / 720;
  const base = `<!doctype html><meta charset="utf-8"><style>
    ${fonts.faces}
    html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: transparent; }
    .card { position: absolute; inset: 0; background: #16181d; display: flex; align-items: center; justify-content: center; padding: ${60 * unit}px; box-sizing: border-box; }
    .card img { max-width: 100%; max-height: 100%; }
    .picture { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: #16181d; }
    .happens { color: #8b93a3; font-size: ${30 * unit}px; line-height: 1.4; text-align: center; max-width: 85%; max-height: 100%; overflow: hidden; }
    .under { position: absolute; left: 6%; right: 6%; bottom: 6%; display: flex; flex-direction: column; align-items: center; gap: ${10 * unit}px; }
    .caption { color: #fff; background: rgba(0, 0, 0, 0.72); font-size: ${46 * unit}px; font-weight: 700; line-height: 1.25; padding: ${10 * unit}px ${24 * unit}px; border-radius: ${8 * unit}px; text-align: center; max-width: 100%; box-sizing: border-box; }
    .spoken { color: #ffe08a; background: rgba(0, 0, 0, 0.72); font-size: ${24 * unit}px; line-height: 1.35; padding: ${6 * unit}px ${16 * unit}px; border-radius: ${6 * unit}px; text-align: center; max-width: 100%; box-sizing: border-box; }
    .happens > div, .caption > div, .spoken > div { unicode-bidi: plaintext; }
    .note { color: #8b93a3; font: ${15 * unit}px system-ui, sans-serif; background: rgba(0, 0, 0, 0.6); padding: ${2 * unit}px ${8 * unit}px; border-radius: ${4 * unit}px; }
  </style>`;

  const shoot = async (body: string, name: string, transparent: boolean) => {
    await page.setContent(base + body);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode()));
    });
    const path = join(dir, name);
    await page.screenshot({ path, omitBackground: transparent });
    return path;
  };

  /** Shrinks the text in `selector` (a step at a time, not below `min` px) until `fits()` holds in the page. */
  const fit = (selector: string, min: number, fits: string) =>
    page.evaluate(
      ([selector, min, fits]) => {
        const els = [...document.querySelectorAll<HTMLElement>(selector as string)];
        const ok = new Function(`return (${fits})`) as () => boolean;
        for (let guard = 0; guard < 80 && !ok(); guard++) {
          const sizes = els.map((el) => parseFloat(getComputedStyle(el).fontSize));
          if (sizes.every((size) => size <= (min as number))) break;
          els.forEach((el, i) => (el.style.fontSize = `${Math.max(min as number, sizes[i] * 0.94)}px`));
        }
      },
      [selector, min, fits] as const,
    );

  // The caption first: it takes at most CAPTION_SHARE of the height, its text shrinking to fit.
  const blocks = [
    row.text && `<div class="caption" style='font-family: ${fontFor(row.text, fonts)}'>${paragraphs(row.text)}</div>`,
    spoken && `<div class="spoken" style='font-family: ${fontFor(spoken, fonts)}'>${paragraphs(spoken)}</div>`,
    spoken && `<div class="note">voice, timed from word count: no Hebrew voice installed</div>`,
  ].filter(Boolean);
  await page.setContent(`${base}<div class="under">${blocks.join("")}</div>`);
  await page.evaluate(() => document.fonts.ready);
  await fit(".caption, .spoken", 16 * unit, `document.querySelector(".under").offsetHeight <= ${Math.round(height * CAPTION_SHARE)}`);
  const captionHeight = await page.evaluate(() => document.querySelector<HTMLElement>(".under")?.offsetHeight ?? 0);
  const caption = join(dir, `row${row.number}-caption.png`);
  await page.screenshot({ path: caption, omitBackground: true });

  // The picture: an image as it is, or the description, set in the space above the caption and shrunk to fit it.
  const room = captionHeight ? captionHeight + height * 0.06 + 16 * unit : 0;
  const picture = await shoot(
    image
      ? `<img class="picture" src="${dataUrl(image)}">`
      : `<div class="card" style="padding-bottom: ${Math.round(room + 60 * unit)}px"><div class="happens" style='font-family: ${fontFor(row.happens, fonts)}'>${paragraphs(row.happens, 1e9)}</div></div>`,
    `row${row.number}-picture.png`,
    false,
  );
  if (!image) {
    await fit(".happens", 14 * unit, `(() => { const el = document.querySelector(".happens"); return el.scrollHeight <= el.clientHeight + 1; })()`);
    await page.screenshot({ path: picture });
  }
  await page.close();
  return { picture, caption };
}

async function renderRow(row: Row, layers: Layers, size: { width: number; height: number }, seconds: number, path: string) {
  const frames = Math.round(seconds * FPS);
  // zoompan rounds its crop to whole pixels. Working at twice the size hides that, so the drift doesn't shake.
  const zoom = `1+${PUSH}*min(1\\,${seconds}/6)*on/${Math.max(frames - 1, 1)}`;
  const push = `zoompan=z='${zoom}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${frames}:s=${size.width * 2}x${size.height * 2}:fps=${FPS}`;
  await run("ffmpeg", [
    "-y", "-v", "error",
    "-i", layers.picture,
    "-i", layers.caption,
    "-filter_complex", `[0:v]${push},scale=${size.width}:${size.height}[p];[1:v]scale=${size.width}:${size.height},loop=-1:1:0[c];[p][c]overlay=shortest=1,format=yuv420p[v]`,
    "-map", "[v]", "-frames:v", String(frames),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-r", String(FPS),
    path,
  ]);
}

type Speech = { available: string[]; speak(lines: { text: string; hebrew: boolean; path: string }[]): Promise<void> };

/** Windows speech. Runs one PowerShell for all lines, reading UTF-8 so Hebrew and quotes survive. */
function windowsSpeech(dir: string): Speech {
  const shell = (script: string) => run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script]);
  const listing = join(dir, "voices.ps1");
  writeFileSync(listing, `Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Culture.Name }
$s.Dispose()\n`);
  const found = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", listing], { encoding: "utf8" });
  const available = found.status === 0 ? found.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];

  return {
    available,
    async speak(lines) {
      const jobs = join(dir, "lines.json");
      const script = join(dir, "speak.ps1");
      writeFileSync(jobs, JSON.stringify(lines));
      writeFileSync(script, `Add-Type -AssemblyName System.Speech
$lines = [IO.File]::ReadAllText('${jobs.replace(/'/g, "''")}', [Text.Encoding]::UTF8) | ConvertFrom-Json
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
foreach ($line in $lines) {
  $culture = if ($line.hebrew) { 'he-IL' } else { 'en' }
  $voice = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name.StartsWith($culture) } | Select-Object -First 1
  if ($voice) { $s.SelectVoice($voice.VoiceInfo.Name) }
  $s.SetOutputToWaveFile($line.path)
  $s.Speak($line.text)
  $s.SetOutputToNull()
}
$s.Dispose()\n`);
      await shell(script);
    },
  };
}

/** macOS `say`. It can write AIFF only with the path's extension, so ffmpeg makes it a WAV. */
function macSpeech(): Speech {
  const found = spawnSync("say", ["-v", "?"], { encoding: "utf8" });
  const voices = found.status === 0 ? found.stdout.split("\n") : [];
  const voiceFor = (locale: RegExp) => voices.find((line) => locale.test(line))?.split(/\s{2,}/)[0];
  const hebrew = voiceFor(/\bhe[_-]IL\b/);
  return {
    available: [...(voiceFor(/\ben[_-]/) ? ["en-US"] : []), ...(hebrew ? ["he-IL"] : [])],
    async speak(lines) {
      for (const line of lines) {
        const aiff = `${line.path}.aiff`;
        await run("say", [...(line.hebrew && hebrew ? ["-v", hebrew] : []), "-o", aiff, "--", line.text]);
        await run("ffmpeg", ["-y", "-v", "error", "-i", aiff, line.path]);
      }
    },
  };
}

const speech = (dir: string): Speech | undefined =>
  process.platform === "win32" ? windowsSpeech(dir) : process.platform === "darwin" ? macSpeech() : undefined;

/** Hebrew counts as spoken in Hebrew even with English names in the line. */
async function timeVoices(rows: Row[], dir: string) {
  const voiced = rows.filter((row) => row.voice);
  const synth = voiced.length ? speech(dir) : undefined;
  const canSpeak = (hebrew: boolean) => synth?.available.some((culture) => culture.startsWith(hebrew ? "he" : "en")) ?? false;

  const spoken = voiced.flatMap((row) => {
    const hebrew = HEBREW.test(row.voice);
    return canSpeak(hebrew) ? [{ row, job: { text: row.voice, hebrew, path: join(dir, `voice${row.number}.wav`) } }] : [];
  });
  if (spoken.length) await synth!.speak(spoken.map(({ job }) => job));

  const lengths = new Map<Row, number>();
  for (const { row, job } of spoken) lengths.set(row, await probeSeconds(job.path));
  const counted = voiced.filter((row) => !lengths.has(row));
  for (const row of counted) lengths.set(row, row.voice.split(/\s+/).filter(Boolean).length / HEBREW_WORDS_PER_SECOND);
  return { spoken: spoken.map(({ row, job }) => ({ row, path: job.path })), counted, lengths };
}

/** A mono WAV with a tick on each beat, the first of each bar louder. No dependencies, nothing to license. */
function clickTrack(bpm: number, seconds: number, path: string) {
  const samples = Math.ceil(seconds * RATE);
  const wave = Buffer.alloc(44 + samples * 2);
  wave.write("RIFF", 0);
  wave.writeUInt32LE(36 + samples * 2, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(RATE, 24);
  wave.writeUInt32LE(RATE * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(samples * 2, 40);
  const length = Math.round(RATE * 0.03);
  for (let beat = 0; ; beat++) {
    const at = Math.round((beat * 60 * RATE) / bpm);
    if (at >= samples) break;
    const pitch = beat % 4 ? 1500 : 2200;
    for (let i = 0; i < length && at + i < samples; i++) {
      const value = Math.sin((2 * Math.PI * pitch * i) / RATE) * Math.exp((-6 * i) / length);
      wave.writeInt16LE(Math.round(value * (beat % 4 ? 9000 : 14000)), 44 + (at + i) * 2);
    }
  }
  writeFileSync(path, wave);
}

async function mixSound(voices: { row: Row; path: string }[], click: string | undefined, seconds: number, path: string) {
  const inputs = [...voices.map(({ path: voice }) => voice), ...(click ? [click] : [])];
  if (!inputs.length) return false;
  const chains = voices.map(({ row }, i) => `[${i}:a]aresample=${RATE},aformat=channel_layouts=stereo,adelay=${Math.round(row.start * 1000)}:all=1[v${i}]`);
  if (click) chains.push(`[${voices.length}:a]aresample=${RATE},aformat=channel_layouts=stereo,volume=0.5[v${voices.length}]`);
  const labels = chains.map((_, i) => `[v${i}]`).join("");
  await run("ffmpeg", [
    "-y", "-v", "error",
    ...inputs.flatMap((input) => ["-i", input]),
    "-filter_complex", `${chains.join(";")};${labels}amix=inputs=${chains.length}:normalize=0:duration=longest,apad,atrim=end=${seconds}[out]`,
    "-map", "[out]", "-c:a", "pcm_s16le", path,
  ]);
  return true;
}

const { target: slug, ratio, values } = cli({ keep: { type: "boolean" } });
const shape = (ratio ?? "16x9") as Ratio;
if (!RATIOS.includes(shape)) throw new Error(`no ratio "${ratio}". Have: ${RATIOS.join(", ")}`);

const folder = queueFolder(slug);
if (!folder) throw new Error(`no queue/<date>-<brand>-${slug}/ folder. Write the pitch there first; queue/_template/ has the format.`);
const pitch = readPitch(folder);
if (!pitch) throw new Error(`${folder} has no pitch.md`);
if (pitch.problems.length) throw new Error(`pitch.md:\n  ${pitch.problems.join("\n  ")}`);
if (!pitch.rows.length) throw new Error("pitch.md has no storyboard table. It needs a header row with Time, What happens, On-screen text, Voice, Image.");

const started = Date.now();
const warnings: string[] = [];
const notes: string[] = [];

const { brand, asked } = brandFor(folder);
if (asked && !brand) warnings.push(`brand "${asked}" isn't in brands/, so captions use a system font.`);
if (!brand && !asked) notes.push("no brand named in pitch.md, so captions use a system font.");
if (brand && !brand.fonts.length) notes.push(`brands/${brand.name}/brand.md names no fonts, so captions use a system font.`);

// Each row runs until the next one starts, so a gap can't leave a hole in the slideshow.
const rows = pitch.rows;
rows.forEach((row, i) => {
  const next = rows[i + 1];
  if (next && Math.abs(next.start - row.end) > 0.001) warnings.push(`row ${row.number} ends at ${clock(row.end)} but row ${next.number} starts at ${clock(next.start)}.`);
});
const span = (row: Row, i: number) => (rows[i + 1]?.start ?? row.end) - row.start;
if (rows[0].start > 0) warnings.push(`the first row starts at ${clock(rows[0].start)}; the animatic starts there too.`);
const total = rows.reduce((sum, row, i) => sum + Math.max(span(row, i), 0), 0);
const first = rows[0].start;
const shifted = rows.map((row) => ({ ...row, start: row.start - first }));

const size = { width: Math.round((SIZES[shape].width * SCALE) / 2) * 2, height: Math.round((SIZES[shape].height * SCALE) / 2) * 2 };
const dir = join(outDir(slug), ".animatic");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--font-render-hinting=none"] });
try {
  const { spoken, counted, lengths } = await timeVoices(shifted, dir);

  shifted.forEach((row, i) => {
    const said = lengths.get(row);
    if (said && said > span(row, i) + 0.05) {
      const how = counted.includes(row) ? " (from word count)" : "";
      warnings.push(`row ${row.number} (${clock(rows[i].start)}-${clock(rows[i].start + span(row, i))}): the voice runs ${said.toFixed(1)} s${how} in a ${span(row, i).toFixed(1)} s row.`);
    }
  });
  if (counted.length) {
    const hebrew = counted.filter((row) => HEBREW.test(row.voice)).length;
    notes.push(hebrew === counted.length
      ? `no Hebrew voice installed: ${hebrew} voice line${hebrew > 1 ? "s are" : " is"} silent, timed from word count (${HEBREW_WORDS_PER_SECOND} words/s), and shown on screen.`
      : `${counted.length} voice lines have no speech voice here: silent, timed from word count, and shown on screen.`);
  }

  const fonts = fontCss(brand);
  const parts: string[] = [];
  const places = [folder, brand?.dir, brand && join(brand.dir, "assets")];
  await Promise.all(
    shifted.map(async (row, i) => {
      const image = row.image ? locate(row.image, ...places) : undefined;
      if (row.image && !image) warnings.push(`row ${row.number}: no image at ${row.image}, so it's a plain card.`);
      const seconds = span(row, i);
      const layers = await drawRow(browser, row, size, dir, fonts, image, counted.includes(row) ? row.voice : "");
      parts[i] = join(dir, `row${row.number}.mp4`);
      await renderRow(row, layers, size, seconds, parts[i]);
    }),
  );

  const list = join(dir, "rows.txt");
  writeFileSync(list, parts.map((part) => `file '${part.replace(/\\/g, "/")}'`).join("\n"));
  const click = pitch.bpm ? join(dir, "click.wav") : undefined;
  if (click) clickTrack(pitch.bpm!, total, click);
  const sound = join(dir, "sound.wav");
  const hasSound = await mixSound(spoken, click, total, sound);

  const path = join(folder, "animatic.mp4");
  await run("ffmpeg", [
    "-y", "-v", "error",
    "-f", "concat", "-safe", "0", "-i", list,
    ...(hasSound ? ["-i", sound, "-c:a", "aac", "-b:a", "128k", "-shortest"] : []),
    "-c:v", "copy", "-movflags", "+faststart", path,
  ]);
  console.log(`${path}  ${total.toFixed(1)} s, ${rows.length} rows, ${size.width}x${size.height}${pitch.bpm ? `, click at ${pitch.bpm} BPM` : ""}, ${((Date.now() - started) / 1000).toFixed(1)} s to make`);
} finally {
  await browser.close();
  if (!values.keep) rmSync(dir, { recursive: true, force: true });
}

for (const note of notes) console.log(`note: ${note}`);
for (const warning of warnings) console.log(`warning: ${warning}`);
