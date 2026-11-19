// bun run render <id> [--ratio all] [--pages 4] [--thumbnail]   Writes out/<slug>/<id>.mp4 at the exact length, H.264 + AAC
// at -14 LUFS, plus <id>-silent.mp4 with no sound, and the sound alone as <slug>[-<take>].mp3. An asset writes
// <id>-<n>.png per scene. An ad with a `thumbnail` also gets <id>-thumbnail.png and a .jpg under 2 MB (YouTube's limit);
// --thumbnail renders only those.
import { cpus } from "node:os";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { cueSpan, type Cue } from "../src/engine/cue.ts";
import type { Video } from "../src/engine/index.ts";
import { captureFrame, cli, openSession, outDir, probeSeconds, publicFile, resolveVideos, run, type Session } from "./lib/index.ts";

const RATE = 48000;
const TARGET = { I: -14, TP: -2.5 }; // AAC overshoots: a -1.5 mix came out of the encoder at -0.6, past validate's -1 on the MP4.

const { target, ratio, values } = cli({ pages: { type: "string" }, thumbnail: { type: "boolean" } });
const pageCount = Number(values.pages ?? Math.min(4, Math.ceil(cpus().length / 2)));

/** Each page takes the next frame until none are left. Frames are pure, so order doesn't matter. */
async function captureAll(session: Session, video: Video, dir: string) {
  const pages = await Promise.all(Array.from({ length: pageCount }, () => session.open(video)));
  let next = 0;
  let done = 0;
  await Promise.all(
    pages.map(async (page) => {
      while (next < video.frames) {
        const frame = next++;
        await captureFrame(page, frame, { path: join(dir, `${String(frame).padStart(6, "0")}.png`) });
        if (++done % 100 === 0) console.log(`${video.id}: ${done}/${video.frames}`);
      }
      await page.close();
    }),
  );
}

/** An audio-first ad's list is just the pipeline's mix, already at -14 LUFS. */
const isFinishedMix = (cues: Cue[]) =>
  cues.length === 1 && basename(cues[0].src) === "mix.wav" && !cues[0].at && !cues[0].trim && !cues[0].fade && (cues[0].volume ?? 1) === 1;

/** One filter chain per cue, summed, and cut to the ad's length. */
async function mixCues(video: Video, cues: Cue[], mixPath: string, dir: string) {
  const files = [...new Set(cues.map((cue) => publicFile(cue.src)))];
  const seconds = new Map(await Promise.all(files.map(async (file) => [file, await probeSeconds(file)] as const)));

  const chains: string[] = [];
  for (const cue of cues) {
    const file = publicFile(cue.src);
    const span = cueSpan(cue, video.fps, video.frames, seconds.get(file)!);
    if (!span) continue;
    const { start, offset, length, fadeIn, fadeOut, volume } = span;
    const steps = [
      `aresample=${RATE}`,
      "aformat=sample_fmts=fltp:channel_layouts=stereo",
      `atrim=start=${offset}:end=${offset + length}`,
      "asetpts=PTS-STARTPTS",
      fadeIn && `afade=t=in:d=${fadeIn}`,
      fadeOut && `afade=t=out:st=${length - fadeOut}:d=${fadeOut}`,
      `volume=${volume}`,
      `adelay=${Math.round(start * 1000)}:all=1`,
    ];
    chains.push(`[${files.indexOf(file)}:a]${steps.filter(Boolean).join(",")}[c${chains.length}]`);
  }
  if (!chains.length) return false;

  const graph = `${chains.join(";\n")};\n${chains.map((_, i) => `[c${i}]`).join("")}amix=inputs=${chains.length}:normalize=0:duration=longest[out]`;
  const script = join(dir, "mix.filter");
  writeFileSync(script, graph);
  await run("ffmpeg", ["-y", "-v", "error", ...files.flatMap((file) => ["-i", file]), "-/filter_complex", script, "-map", "[out]", "-c:a", "pcm_f32le", mixPath]);
  return true;
}

/** Two-pass loudnorm: measure, then a straight gain to -14 LUFS. Reports what came out. */
async function normalise(video: Video, mixPath: string, finalPath: string) {
  const report = (output: string) => JSON.parse(output.slice(output.lastIndexOf("{"), output.lastIndexOf("}") + 1));
  const base = `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=20`;
  const measured = report(await run("ffmpeg", ["-hide_banner", "-i", mixPath, "-af", `${base}:print_format=json`, "-f", "null", "-"]));
  if (!Number.isFinite(Number(measured.input_i))) return mixPath; // Silence: there's nothing to raise.

  const second = `${base}:linear=true:print_format=json:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}`;
  const result = report(await run("ffmpeg", ["-y", "-hide_banner", "-i", mixPath, "-af", second, "-ar", String(RATE), "-c:a", "pcm_f32le", finalPath]));
  console.log(`${video.id}: ${result.output_i} LUFS, ${result.output_tp} dBTP`);
  return finalPath;
}

async function audioFor(video: Video, dir: string) {
  if (!video.cues.length) return null;
  const missing = video.cues.map((cue) => cue.src).filter((src) => !existsSync(publicFile(src)));
  if (missing.length) throw new Error(`${video.id}: missing sound files under public/: ${[...new Set(missing)].join(", ")}`);

  if (isFinishedMix(video.cues)) return publicFile(video.cues[0].src);
  const mixPath = join(dir, "mix.wav");
  if (!(await mixCues(video, video.cues, mixPath, dir))) return null;
  return normalise(video, mixPath, join(dir, "final.wav"));
}

async function encode(video: Video, framesDir: string, audio: string | null, path: string) {
  const samples = Math.round((video.frames / video.fps) * RATE);
  const inputs = ["-framerate", String(video.fps), "-start_number", "0", "-i", join(framesDir, "%06d.png"), ...(audio ? ["-i", audio] : [])];
  const picture = [
    "-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p",
    "-frames:v", String(video.frames),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
  ];
  const sound = audio ? ["-af", `aresample=${RATE},apad=whole_len=${samples},atrim=end_sample=${samples}`, "-c:a", "aac", "-b:a", "192k"] : [];
  await run("ffmpeg", ["-y", "-v", "error", ...inputs, ...picture, ...sound, "-movflags", "+faststart", path]);
}

/** The same picture with no sound stream, copied rather than re-encoded. */
const writeSilent = (path: string, silentPath: string) =>
  run("ffmpeg", ["-y", "-v", "error", "-i", path, "-map", "0:v", "-c", "copy", "-movflags", "+faststart", silentPath]);

/** The ad's sound on its own, at the exact length of the picture. */
async function writeMp3(video: Video, audio: string, mp3Path: string) {
  const samples = Math.round((video.frames / video.fps) * RATE);
  await run("ffmpeg", ["-y", "-v", "error", "-i", audio, "-af", `aresample=${RATE},apad=whole_len=${samples},atrim=end_sample=${samples}`, "-c:a", "libmp3lame", "-b:a", "320k", mp3Path]);
}

/** The ad's cover: a PNG at the video's size, and a JPEG of it for the platforms that cap uploads at 2 MB. */
async function writeThumbnail(session: Session, video: Video) {
  const page = await session.open(video, { thumbnail: true });
  const png = join(outDir(video.slug), `${video.id}-thumbnail.png`);
  await captureFrame(page, 0, { path: png });
  await page.close();
  const jpg = png.replace(/\.png$/, ".jpg");
  await run("ffmpeg", ["-y", "-v", "error", "-i", png, "-q:v", "2", jpg]);
  console.log(png);
  console.log(jpg);
}

const videos = await resolveVideos(target, { ratio });
if (values.thumbnail && !videos.some((video) => video.thumbnail)) throw new Error(`${target} has no thumbnail: give its registry line \`thumbnail: Thumb\`.`);
const session = await openSession();
try {
  for (const video of videos) {
    if (video.thumbnail) await writeThumbnail(session, video);
    if (values.thumbnail) continue;
    if (video.kind === "asset") {
      // An asset is stills: one PNG per scene, numbered in story order, and no sound.
      const page = await session.open(video);
      for (let frame = 0; frame < video.frames; frame++) {
        const path = join(outDir(video.slug), `${video.id}-${frame + 1}.png`);
        await captureFrame(page, frame, { path });
        console.log(path);
      }
      await page.close();
      continue;
    }
    const dir = join(outDir(video.slug), ".frames", video.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    await captureAll(session, video, dir);
    const audio = await audioFor(video, dir);
    const path = join(outDir(video.slug), `${video.id}.mp4`);
    await encode(video, dir, audio, path);
    const silentPath = join(outDir(video.slug), `${video.id}-silent.mp4`);
    await writeSilent(path, silentPath);
    console.log(path);
    console.log(silentPath);
    if (audio) {
      // Every ratio of a take shares its sound, so there's one MP3 per take.
      const mp3Path = join(outDir(video.slug), `${video.slug}${video.take ? `-${video.take}` : ""}.mp3`);
      await writeMp3(video, audio, mp3Path);
      console.log(mp3Path);
    } else console.log(`${video.id}: no sound, so no MP3`);
    rmSync(dir, { recursive: true, force: true });
  }
} finally {
  await session.close();
}
