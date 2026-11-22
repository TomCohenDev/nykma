// node site/scripts/examples.mjs   Makes the landing page's example videos from the ads' hand-offs in queue/, which
// only the private repo has. For each ad in site/src/examples.json: its 1:1 MP4, re-encoded to 720 px with the sound
// kept (a few MB, under Workers' 25 MB file limit), and a poster: the frame at `poster` seconds when the list gives
// one, or else its thumbnail, or else frame 0, which nykma designs to work as one. Writes site/public/examples/
// <slug>.mp4 and .jpg, and skips any that are already there (--force makes them again). An ad marked `wide` also
// gets <slug>-16x9.mp4 and .jpg at 1280x720, from its 16:9 hand-off, for the home page's terminal. The spec ads in
// site/src/spec-ads.json, and the silent cuts of our own ads in more-ads.json, are made at their own shape (16:9 at 1280x720, 9:16 at 720x1280, 1:1 at 720), with a poster
// from half a second in. Needs ffmpeg. Free.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE = join(SITE, "..", "queue");
const OUT = join(SITE, "public", "examples");
const force = process.argv.includes("--force");
const examples = JSON.parse(readFileSync(join(SITE, "src", "examples.json"), "utf8"));

mkdirSync(OUT, { recursive: true });
const folders = existsSync(QUEUE) ? readdirSync(QUEUE) : [];
const ffmpeg = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });

for (const { slug, poster: at, wide } of examples) {
  if (wide) makeWide(slug, at);
  const video = join(OUT, `${slug}.mp4`);
  const poster = join(OUT, `${slug}.jpg`);
  if (!force && existsSync(video) && existsSync(poster)) continue;
  const makeVideo = force || !existsSync(video);
  const folder = folders.filter((name) => name.endsWith(`-${slug}`)).sort().at(-1);
  const source = folder && join(QUEUE, folder, `${slug}-1x1.mp4`);
  if (!source || !existsSync(source)) {
    console.error(`${slug}: no queue/*-${slug}/${slug}-1x1.mp4. Render it first: bun run render ${slug}-1x1`);
    process.exitCode = 1;
    continue;
  }
  if (makeVideo) ffmpeg(["-i", source, "-vf", "scale=720:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "26",
    "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "96k", video]);
  const thumbnail = join(QUEUE, folder, `${slug}-1x1-thumbnail.jpg`);
  ffmpeg(at !== undefined
    ? ["-ss", String(at), "-i", source, "-frames:v", "1", "-vf", "scale=720:720", "-q:v", "4", poster]
    : existsSync(thumbnail)
      ? ["-i", thumbnail, "-vf", "scale=720:720", "-q:v", "4", poster]
      : ["-i", source, "-frames:v", "1", "-vf", "scale=720:720", "-q:v", "4", poster]);
  console.log(`${slug}: ${(statSync(video).size / 1048576).toFixed(1)} MB video, ${Math.round(statSync(poster).size / 1024)} KB poster`);
}

function makeWide(slug, at) {
  const video = join(OUT, `${slug}-16x9.mp4`);
  const poster = join(OUT, `${slug}-16x9.jpg`);
  if (!force && existsSync(video) && existsSync(poster)) return;
  const folder = folders.filter((name) => name.endsWith(`-${slug}`)).sort().at(-1);
  const source = folder && join(QUEUE, folder, `${slug}-16x9.mp4`);
  if (!source || !existsSync(source)) {
    console.error(`${slug}: no 16:9 hand-off. Render it first: bun run render ${slug}-16x9`);
    process.exitCode = 1;
    return;
  }
  ffmpeg(["-i", source, "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "slow", "-crf", "26",
    "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "96k", video]);
  ffmpeg(["-ss", String(at ?? 0), "-i", source, "-frames:v", "1", "-vf", "scale=1280:720", "-q:v", "4", poster]);
  console.log(`${slug}: 16:9, ${(statSync(video).size / 1048576).toFixed(1)} MB`);
}

const SIZE = { "16x9": "1280:720", "9x16": "720:1280", "1x1": "720:720" };
const silentAds = ["spec-ads.json", "more-ads.json"].flatMap((file) => JSON.parse(readFileSync(join(SITE, "src", file), "utf8")));
for (const { slug, ratio } of silentAds) {
  const video = join(OUT, `${slug}.mp4`);
  const poster = join(OUT, `${slug}.jpg`);
  if (!force && existsSync(video) && existsSync(poster)) continue;
  const folder = folders.filter((name) => name.endsWith(`-${slug}`)).sort().at(-1);
  const source = folder && join(QUEUE, folder, `${slug}-${ratio}.mp4`);
  if (!source || !existsSync(source)) {
    console.error(`${slug}: no queue/*-${slug}/${slug}-${ratio}.mp4. Render it first: bun run render ${slug}-${ratio}`);
    process.exitCode = 1;
    continue;
  }
  ffmpeg(["-i", source, "-vf", `scale=${SIZE[ratio]}:flags=lanczos`, "-c:v", "libx264", "-preset", "slow", "-crf", "26",
    "-profile:v", "high", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", video]);
  ffmpeg(["-ss", "0.5", "-i", source, "-frames:v", "1", "-vf", `scale=${SIZE[ratio]}`, "-q:v", "4", poster]);
  console.log(`${slug}: ${ratio}, ${(statSync(video).size / 1048576).toFixed(1)} MB`);
}
