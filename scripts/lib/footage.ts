/**
 * Real footage (spec.md §6.5): a clip under public/ads/<slug>/footage/ unpacked to numbered JPEGs in
 * public/ads/<slug>/gen/footage/<name>/, so <Footage> can show any frame exactly, like a Blender plate.
 *
 *   unpack(slug, file, { fps? })   frames, audio.wav, sheet.jpg and meta.json; returns the meta
 *   clipsOf(slug)                  the clips in footage/, with their meta if they've been unpacked
 *   download(slug, url)            one of the brand's own videos, through yt-dlp, into footage/; returns the file
 *   sources(slug)                  where downloaded clips came from (public/ads/<slug>/sources.json, committed)
 *   allSources(slug)               those, and the stock photos and clips in stock/ (stock.ts), which share the file
 *
 * HDR phone footage (PQ or HLG) is tone-mapped to SDR, or it comes out grey. Frames keep the clip's own rate (up to
 * 120 fps, so slow motion survives), and are scaled down to 1920 px on the short side. The original is never changed.
 * Shared by `bun run footage` and the desk, which unpacks a clip dropped on the board.
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
export const VIDEO = /\.(mov|mp4|m4v|webm|mkv|avi)$/i;
const MAX_FPS = 120;
const SHORT_SIDE = 1920;
const SHEET_TILES = 36;
const SHEET_COLUMNS = 6;

export type ClipMeta = {
  name: string;
  /** The original, from the repo root. */
  source: string;
  /** For <Footage src> and story.json: under public/, with ##### for the file number (the first file is 1). */
  src: string;
  fps: number;
  frames: number;
  seconds: number;
  width: number;
  height: number;
  /** It was HDR and has been tone-mapped. */
  hdr: boolean;
  /** Its sound under public/, for a cue. Missing when the clip has none. */
  sound?: string;
  /** A contact sheet to look at: a frame every `every` seconds, left to right, top to bottom, `columns` across. */
  sheet: { path: string; every: number; columns: number };
};

export const URL_RE = /^https?:\/\//i;
export const PYTHON = join(ROOT, process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");

const footageDir = (slug: string) => join(ROOT, "public", "ads", slug, "footage");
const framesDir = (slug: string, name: string) => join(ROOT, "public", "ads", slug, "gen", "footage", name);
const fromRoot = (path: string) => relative(ROOT, path).split(sep).join("/");
const underPublic = (path: string) => relative(join(ROOT, "public"), path).split(sep).join("/");

/** A clip's name from its file: letters, numbers and dashes. */
export const clipName = (file: string) =>
  basename(file, extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "clip";

function run(command: string, args: string[]): Promise<string> {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", (error) => fail(new Error(`${command} didn't start (${error.message}). Is it installed?`)));
    child.on("close", (code) => (code ? fail(new Error(`${command} failed: ${err.trim().split("\n").slice(-4).join("\n")}`)) : done(out)));
  });
}

type Probe = { width: number; height: number; rate: [number, number]; seconds: number; hdr: boolean; audio: boolean };

async function probe(path: string): Promise<Probe> {
  const info = JSON.parse(await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", path]));
  const video = info.streams?.find((stream: any) => stream.codec_type === "video" && !stream.disposition?.attached_pic);
  if (!video) throw new Error(`${basename(path)} has no video.`);
  const rotation = Number(video.side_data_list?.find((side: any) => side.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
  const turned = Math.abs(rotation) % 180 === 90; // ffmpeg turns it upright, so the frames are the other way round
  const [num, den] = String(video.avg_frame_rate !== "0/0" ? video.avg_frame_rate : video.r_frame_rate).split("/").map(Number);
  return {
    width: turned ? video.height : video.width,
    height: turned ? video.width : video.height,
    rate: [num, den || 1],
    seconds: Number(video.duration ?? info.format?.duration ?? 0),
    hdr: ["smpte2084", "arib-std-b67"].includes(video.color_transfer),
    audio: info.streams.some((stream: any) => stream.codec_type === "audio"),
  };
}

/** Where each downloaded clip in footage/ came from, by file name. Committed, unlike footage/, so a clone can fetch them again. */
export type Source = { url: string; title: string; channel: string; channelUrl: string; fetched: string };
/**
 * A stock photo or clip in stock/ (stock.ts), keyed `stock/<file>` in the same sources.json, so the brand's own videos
 * keep their bare file names and their format.
 */
export type StockSource = {
  kind: "stock";
  source: "pexels" | "pixabay";
  /** As `bun run stock` prints it: pexels:12345. */
  id: string;
  type: "photo" | "video";
  author: string;
  authorUrl: string;
  pageUrl: string;
  licence: string;
  licenceUrl: string;
  /** Which of the source's files it is, so a clone downloads the same one. */
  variant: string;
  width: number;
  height: number;
  seconds?: number;
  query?: string;
  fetched: string;
  sha256: string;
};
const sourcesPath = (slug: string) => join(ROOT, "public", "ads", slug, "sources.json");

/** Everything in sources.json: the brand's own videos by file name, and stock by `stock/<file>`. */
export function allSources(slug: string): Record<string, Source | StockSource> {
  const path = sourcesPath(slug);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

export const isStock = (entry: Source | StockSource): entry is StockSource => (entry as StockSource).kind === "stock";

/** The brand's own videos, downloaded with yt-dlp. */
export function sources(slug: string): Record<string, Source> {
  return Object.fromEntries(Object.entries(allSources(slug)).filter(([, entry]) => !isStock(entry))) as Record<string, Source>;
}

/** Adds or replaces one entry and keeps the rest. */
export function writeSource(slug: string, key: string, entry: Source | StockSource) {
  const all = allSources(slug);
  all[key] = entry;
  mkdirSync(join(ROOT, "public", "ads", slug), { recursive: true });
  writeFileSync(sourcesPath(slug), JSON.stringify(all, null, 2) + "\n");
}

/**
 * Downloads one of the brand's own videos with yt-dlp (in the .venv, from py/requirements.txt) into footage/, and notes
 * where it came from in sources.json. Up to 4K, video and sound merged to MP4. The name ends in the video's id, so a Hebrew
 * title still names it. `name` keeps the file it had before.
 */
export async function download(slug: string, url: string, name?: string): Promise<string> {
  if (!existsSync(PYTHON)) throw new Error("No .venv yet. Make it and run: pip install -r py/requirements.txt");
  const dir = mkdtempSync(join(tmpdir(), "nykma-dl-"));
  try {
    const out = await run(PYTHON, ["-m", "yt_dlp", "--js-runtimes", "node", "--no-playlist", "--no-progress",
      "-f", "bv*[height<=2160]+ba/b", "--merge-output-format", "mp4", "-o", join(dir, "%(title).40B %(id)s.%(ext)s"),
      "--no-simulate", "--print", "after_move:%(.{filepath,title,channel,uploader,channel_url,uploader_url,webpage_url})j", url]);
    const info = JSON.parse(out.trim().split("\n").pop()!);
    let file = info.filepath as string;
    if (name) {
      file = join(dir, name);
      copyFileSync(info.filepath, file);
    }
    const kept = adopt(slug, file);
    writeSource(slug, basename(kept), {
      url: info.webpage_url ?? url,
      title: info.title ?? "",
      channel: info.channel ?? info.uploader ?? "",
      channelUrl: info.channel_url ?? info.uploader_url ?? "",
      fetched: new Date().toISOString().slice(0, 10),
    });
    return kept;
  } catch (error) {
    if ((error as Error).message.includes("No module named yt_dlp")) throw new Error("yt-dlp isn't installed. Run: pip install -r py/requirements.txt");
    throw error;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Copies a clip into the ad's footage/ under a name no other clip there has, unless it's already there. */
export function adopt(slug: string, file: string): string {
  const dir = footageDir(slug);
  const path = resolve(file);
  if (path.startsWith(dir + sep)) return path;
  mkdirSync(dir, { recursive: true });
  const ext = extname(path).toLowerCase();
  let name = clipName(path);
  for (let n = 2; existsSync(join(dir, name + ext)); n++) name = `${clipName(path)}-${n}`;
  copyFileSync(path, join(dir, name + ext));
  return join(dir, name + ext);
}

/** Unpacks a clip in the ad's footage/ (or copies it there first). Replaces any frames it had. */
export async function unpack(slug: string, file: string, options: { fps?: number } = {}): Promise<ClipMeta> {
  if (!VIDEO.test(file)) throw new Error(`${basename(file)} isn't a video nykma takes (MOV, MP4, M4V, WebM, MKV or AVI).`);
  const source = adopt(slug, file);
  const name = clipName(source);
  const info = await probe(source);
  const sourceFps = info.rate[0] / info.rate[1];
  const fps = options.fps ?? Math.min(sourceFps, MAX_FPS);
  const rate = options.fps || sourceFps > MAX_FPS ? String(fps) : `${info.rate[0]}/${info.rate[1]}`;
  const k = Math.min(1, SHORT_SIDE / Math.min(info.width, info.height));
  const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
  const [width, height] = [even(info.width), even(info.height)];

  const dir = framesDir(slug, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const tonemap = "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";
  const video = [info.hdr ? tonemap : "", `fps=${rate}`, `scale=${width}:${height}:flags=lanczos`].filter(Boolean).join(",");
  const args = ["-v", "error", "-y", "-i", source, "-map", "0:v:0", "-vf", video, "-q:v", "2", "-start_number", "1", join(dir, "%05d.jpg")];
  if (info.audio) args.push("-map", "0:a:0", "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", join(dir, "audio.wav"));
  await run("ffmpeg", args);

  const frames = readdirSync(dir).filter((file) => /^\d{5}\.jpg$/.test(file)).length;
  if (!frames) throw new Error(`ffmpeg wrote no frames for ${basename(source)}.`);
  const step = Math.max(1, Math.ceil(frames / SHEET_TILES));
  const rows = Math.ceil(Math.ceil(frames / step) / SHEET_COLUMNS);
  const sheet = join(dir, "sheet.jpg");
  await run("ffmpeg", ["-v", "error", "-y", "-framerate", String(fps), "-i", join(dir, "%05d.jpg"),
    "-vf", `select=not(mod(n\\,${step})),scale=384:-2,tile=${SHEET_COLUMNS}x${rows}:padding=4`, "-fps_mode", "vfr", "-frames:v", "1", "-q:v", "3", sheet]);

  const meta: ClipMeta = {
    name,
    source: fromRoot(source),
    src: `${underPublic(dir)}/#####.jpg`,
    fps: Math.round(fps * 1000) / 1000,
    frames,
    seconds: Math.round((frames / fps) * 100) / 100,
    width,
    height,
    hdr: info.hdr,
    ...(info.audio ? { sound: `${underPublic(dir)}/audio.wav` } : {}),
    sheet: { path: fromRoot(sheet), every: Math.round((step / fps) * 100) / 100, columns: SHEET_COLUMNS },
  };
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  return meta;
}

/** The ad's clips: each original in footage/, with its meta once it's been unpacked and is newer than the original. */
export function clipsOf(slug: string): { file: string; meta?: ClipMeta }[] {
  const dir = footageDir(slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => VIDEO.test(file))
    .map((file) => {
      const path = join(dir, file);
      const metaPath = join(framesDir(slug, clipName(file)), "meta.json");
      const fresh = existsSync(metaPath) && statSync(metaPath).mtimeMs >= statSync(path).mtimeMs;
      return { file: path, meta: fresh ? (JSON.parse(readFileSync(metaPath, "utf8")) as ClipMeta) : undefined };
    });
}

/** The size of a clip's frames on disk, in MB. */
export function framesMb(slug: string, name: string) {
  const dir = framesDir(slug, name);
  return existsSync(dir) ? Math.round(readdirSync(dir).reduce((sum, file) => sum + statSync(join(dir, file)).size, 0) / 1e6) : 0;
}
