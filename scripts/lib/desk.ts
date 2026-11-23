/**
 * The desk's local API, mounted on the Vite dev server (see vite.config.ts, spec.md §10). There is no database: state is
 * read from queue/, src/ads/ and brands/ on every request, and a button only sends ad-agent the words you'd type.
 *
 *   GET  /api/state                         projects, brand kits and running runs
 *   GET  /api/registry                      every ad's takes, ratios and scenes, plus its story.json from disk
 *   GET  /api/chat?folder= | brand= | slug= | run=   the conversation: past runs (.chat.json) and live ones
 *   POST /api/ask    { folder?, slug?, brand?, kit?, kind?, text, shown? }   starts or continues ad-agent
 *   POST /api/story  { slug, take?, story, label? }  writes src/ads/<slug>/story[-<take>].json
 *   POST /api/tune   { slug, take?, ratio: "16x9"|"1x1"|"9x16"|"all", id, value, label? }   sets one knob in tune[-<take>].json;
 *                                        null removes it
 *   POST /api/render { slug, folder? }      renders every ratio and take, then copies them to the queue folder. No agent
 *   POST /api/upload?to=folder:<f>|brand:<b>|board:<slug>|footage:<slug>&name=<file>   raw body, saved to queue/<f>/inbox/,
 *                                        brands/<b>/uploads/, public/ads/<slug>/board/ (an image for the board) or
 *                                        public/ads/<slug>/footage/ (a video clip, up to 4 GB)
 *   POST /api/footage { slug, file }     unpacks a clip in footage/ to frames, and answers with its meta (spec.md §6.5)
 *   POST /api/brand-md    { brand, text }   saves brand.md as you edited it
 *   POST /api/brand-check { brand }         runs bun run brand-check
 *   GET  /api/instructions?brand=           the agent's instruction files, and which the brand edited (agents.ts)
 *   GET  /api/instruction?path=&brand=      one of them: the default, and the brand's version if any
 *   POST /api/instruction { path, text, brand? }   saves the brand's version, or the default with no brand
 *   POST /api/instruction/reset { path, brand }    deletes the brand's version, so it reads the default again
 *   POST /api/drop | /api/restore { folder }   marks the ad Dropped or takes the mark off, no agent, no tokens
 *   POST /api/stop   { id }                 stops a run
 *   GET  /api/settings | POST /api/settings { settings }   settings.json (scripts/lib/settings.ts)
 *   GET  /api/status                        Claude Code, ElevenLabs, Whisper and yt-dlp: there or not
 *   GET  /api/voices                        the ElevenLabs voices on the account (free, needs the key)
 *   GET  /api/voice?id=                     one voice by id, to name a voice you add in Settings (free)
 *   GET  /api/keys | POST /api/keys { service, key } | POST /api/keys/remove { service }   the key store (keys.ts):
 *                                        set or not and the last four characters, never the key
 *   GET  /api/keys/test?service=           asks the service whether the key works (free)
 *   GET  /api/gen?slug=                     an ad's generated shots, estimates, approved budget and spend (spec.md §6.6)
 *   POST /api/local/start | /api/local/stop   starts or stops ComfyUI for video made on this PC (local.ts, §6.9)
 *   POST /api/gen/approve { slug, usd }     sets the ad's approved budget for generated media. The desk page only
 *   POST /api/gen/run { slug, id }          makes one still within that budget. Needs x-nykma-token: bun run gen sends it.
 *                                        A video is refused (409): only the desk page makes videos
 *   POST /api/gen/review { slug, id, verdict: "approved" | "retake", note? }   your verdict on a made still. Desk page only
 *   POST /api/gen/videos { slug, usd? }     sets the approved total to usd, then makes every video not made yet, once
 *                                        the stills they start from are approved. Desk page only
 *   GET  /api/gen/job?id=                   a shot being made
 *   POST /api/stock/search { slug, query, kinds?, ratio?, minSeconds?, sources?, page? }   free stock from Pexels and
 *                                        Pixabay (spec.md §6.8). Needs x-nykma-token: bun run stock sends it
 *   POST /api/stock/take { slug, id, type?, name?, ratios?, query?, restore? }   downloads one into public/ads/<slug>/stock/
 *                                        and records it in sources.json. Needs x-nykma-token
 *   GET  /api/publish                       publishing (publish/index.ts, spec.md §10.12): providers with their setup
 *                                        steps, the connected accounts and the posts. Never a token
 *   GET  /api/publish/draft?folder=         what the publish dialog starts from: the MP4s, covers and post.md's copy
 *   GET  /api/publish/options?account=      the per-post choices for an account (TikTok asks the platform)
 *   GET  /api/publish/login?state=          whether a login that Connect opened has come back
 *   POST /api/publish/provider { provider, values } | /api/publish/provider/remove { provider }   an app's credentials,
 *                                        or a login made of fields (Bluesky, Telegram), which connects at once
 *   POST /api/publish/connect { provider }  the login URL to open. It comes back to 127.0.0.1:8723, not to the page
 *   POST /api/publish/account/remove { id }
 *   POST /api/publish/approve { folder, posts }   approves posts: the only way one is made. The page, or
 *                                        bun run publish with x-nykma-token
 *   POST /api/publish/job { id, action: "cancel" | "now" | "remove" }   the page, or bun run publish with the token
 *   POST /api/publish/reveal { folder, file }   shows the file in Explorer or Finder, for posting by hand
 *   GET  /media/<folder>/<file>             the queue folder's files
 *   GET  /brand-files/<brand>/<file>        a brand kit's files (logos, fonts)
 *   GET  /api/file?path=&folder=&brand=     an image a storyboard row points at
 *   GET  /api/source/element?loc=<file>:<line>:<col>[&text=...][&slug=]   an element's text, style, props and data-*
 *                                        attributes in an ad's code (source.ts). Each text (what the element shows, then
 *                                        its parents') also finds the string literals in the ad's folder it comes from
 *   POST /api/source/edit { loc, hash, edit, label? }   changes, adds or removes one literal in src/ads/ (409 with the
 *                                        hash if the file changed)
 *   POST /api/source/undo { slug? }         the same as /api/history/undo
 *   GET  /api/elements?slug=                the ad's ready-made elements, from src/ads/<slug>/elements.tsx (source.ts)
 *   POST /api/source/add { slug, scene, at, length, fps, x, y, kind, text?, dir?, style?, element? }   adds an element
 *                                        to the scene's JSX (spec.md §10.14); answers with its loc and the file's hash
 *   GET  /api/history?slug=                 the ad's change history: the desk's writes to story, tune and code (history.ts)
 *   POST /api/history/undo | /api/history/redo { slug } | /api/history/goto { slug, position }   moves through it,
 *                                        never over a file changed since (409)
 * Every write to an ad (story, tune, a source edit) is one entry in its history, labelled with `label` or a made-up one.
 *
 * Sessions live in queue/<folder>/.session or brands/<brand>/.session, and finished runs in .chat.json next to them
 * (all gitignored), so notes continue the same conversation and the chat survives a restart.
 * NYKMA_CLAUDE swaps the `claude` binary, for tests (otherwise it's the one in settings).
 */
import { execFile, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, join, relative, resolve, sep } from "node:path";
import sirv from "sirv";
import type { ViteDevServer } from "vite";
import type { Story, Video } from "../../src/engine/index.ts";
import { PYTHON, unpack, VIDEO } from "./footage.ts";
import { AGENT_ENV, ALLOWED, DENIED } from "./permissions.ts";
import { agentFor, editedCount, instructions, readInstruction, resetInstruction, saveInstruction } from "./agents.ts";
import { brandFor, folderSlug, locate, readBrand, readIf, readPitch } from "./queue.ts";
import { briefFor, readSettings, saveSettings, VOICE_ID, type Ratio } from "./settings.ts";
import { money, stateOf, totalToMake } from "./gen.ts";
import { approve, budgets, jobOf, jobsOf, NeedsApproval, reviewsOf, reviewStill, spent, startShot, startVideos, stillsWaiting, WaitingOnStills } from "./gen-run.ts";
import { codexAccount, findCodex } from "./codex.ts";
import { localStatus, startComfy, stopComfy, type LocalStatus } from "./local.ts";
import { NotConnected, search as searchStock, take as takeStock, testStockKey } from "./stock-run.ts";
import { isRatio, isSource, type Kind } from "./stock.ts";
import { addElement, editSource, elementAt, readyElements, sourceFailure, undoSource } from "./source.ts";
import { goto as historyGoto, historyOf, record, redo as historyRedo, undo as historyUndo, writeAtomic, type FileChange, type HistoryKind } from "./history.ts";
import { home as keyHome, isService, keyHint, readKey, removeKey, saveKey, SECRET_ENV, SERVICES } from "./keys.ts";
import { act as actOnPost, approve as approvePosts, connect as connectProvider, disconnect, draft as publishDraft, forgetProvider, loginOutcome, optionsFor, publishState, reveal, saveProvider, startPublishing } from "./publish/index.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const QUEUE = join(ROOT, "queue");
const BRANDS = join(ROOT, "brands");
const ADS = join(ROOT, "src", "ads");
const PUBLIC_ADS = join(ROOT, "public", "ads");
const FOLDER = /^\d{4}-\d{2}-\d{2}-[^\\/.][^\\/]*$/;
const NAME = /^[a-z0-9][a-z0-9_-]*$/i;
const RATIOS = ["16x9", "1x1", "9x16"] as const;
const IMAGE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const NODE_SCRIPT = ["--experimental-strip-types", "--disable-warning=ExperimentalWarning"];

// ad-agent runs unattended, so it gets what it needs to build and nothing that publishes. No gh, no .env. The lists
// are in permissions.ts, shared with bun run eval.

/**
 * Lets bun run gen and bun run stock, started by an agent run or in a terminal, ask the desk to make a shot or search
 * stock. New each time the desk starts.
 */
const DESK_TOKEN = randomBytes(24).toString("hex");
let deskUrl = "";

export type Line = { kind: "say" | "do" | "error"; text: string };

export type Run = {
  id: string;
  /** "agent" is ad-agent. "render" is a render with no agent and no tokens. */
  kind: "agent" | "render";
  folder?: string;
  brand?: string;
  slug?: string;
  /** The first run of a conversation that started with no folder, so its replies show together. */
  thread?: string;
  /** The brand whose edits to the agent's instructions (brands/<brand>/knowledge/) this run uses. */
  uses?: string;
  /** What you wrote, as the chat shows it. The prompt may carry context on top. */
  title: string;
  running: boolean;
  started: number;
  log: Line[];
  /** The agent's message as it streams in, until it's whole. */
  partial?: string;
  cost?: number;
  error?: string;
};

type Live = Run & { child?: ChildProcess; session?: string };

export type Ad = {
  folder: string;
  slug: string;
  date: string;
  idea: string;
  brand?: string;
  state: "pitch" | "first-look" | "checked" | "ready" | "dropped";
  takes: Record<string, Partial<Record<(typeof RATIOS)[number], string>>>;
  stills: string[];
  /** The covers, <id>-thumbnail.png (and .jpg). */
  thumbnails: string[];
  animatic?: string;
  extras: string[]; // The silent videos and the MP3s.
  storyboard: { number: number; time: string; start: number; end: number; happens: string; text: string; voice: string; image: string }[];
  docs: { name: string; file: string; text: string }[];
  hasSession: boolean;
  updated: number;
};

export type BrandKit = {
  name: string;
  made: boolean; // brand.md exists
  /** How many of the agent's instruction files the brand has its own version of (brands/<brand>/knowledge/). */
  knowledge: number;
  url?: string;
  tagline?: string;
  colours: string[];
  fonts: { role: string; family: string; file?: string }[];
  logos: string[];
  text: string;
  sources: string;
  uploads: string[];
  updated: number;
};

/** `frames` is how long it plays, `full` its length untrimmed, and `trimIn` the scene frame it starts on (story.json `trim`). */
export type SceneInfo = { id: string; name: string; frames: number; from: number; onStory: boolean; image?: boolean; trimIn: number; full: number };
/** A cue as the video plays it: `at` in frames from the start, `trim` frames into its file, `frames` long when that's known. */
export type CueInfo = { src: string; at: number; trim?: number; volume?: number; frames?: number; scene?: string };
export type TakeInfo = {
  take?: string;
  name: string; // slug or slug-take
  kind: "video" | "asset";
  fps: number;
  frames: number;
  lang: string;
  dir: "ltr" | "rtl";
  audioTimed: boolean;
  ratios: { ratio: (typeof RATIOS)[number]; id: string; width: number; height: number }[];
  scenes: SceneInfo[];
  /** Read from disk, so it's what the board last wrote even before the module graph catches up. */
  story?: Story;
  /** Whether the ad lists `scenes` (so arrows mean something) or is one component. */
  hasScenes: boolean;
  /** The take's sound, from its first ratio. */
  cues: CueInfo[];
  /** tune.json (or tune-<take>.json), read from disk like the story. */
  tune?: object;
};
export type AdInfo = { slug: string; takes: TakeInfo[] };

const runs = new Map<string, Live>();
const stopping = new Set<string>(); // Stopped by you, so a non-zero exit isn't an error.

const dropped = (readme = "") => /^\s*#*\s*\**Dropped\b/i.test(readme);
const mtime = (path: string) => (existsSync(path) ? statSync(path).mtimeMs : 0);

function readAd(folder: string): Ad {
  const dir = join(QUEUE, folder);
  const files = readdirSync(dir);
  const readme = readIf(join(dir, "README.md"));
  const pitch = readPitch(dir);

  const takes: Ad["takes"] = {};
  for (const file of files) {
    const match = file.match(/^(.+)-(16x9|1x1|9x16)\.mp4$/);
    if (match) (takes[match[1]] ??= {})[match[2] as (typeof RATIOS)[number]] = file;
  }
  const stills = files.filter((file) => /-(16x9|1x1|9x16)-\d+\.png$/.test(file)).sort();
  const thumbnails = files.filter((file) => /-(16x9|1x1|9x16)-thumbnail\.png$/.test(file)).sort();
  const rendered = Object.keys(takes).length > 0 || stills.length > 0;

  const docs = [
    ["Pitch", "pitch.md"],
    ["Post copy", "post.md"],
    ["Notes", "README.md"],
    ["Reviewer", "review.md"],
    ["Validators", "validate.md"],
  ].flatMap(([name, file]) => {
    const text = readIf(join(dir, file));
    return text === undefined ? [] : [{ name, file, text }];
  });

  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const hasPost = files.includes("post.md");
  return {
    folder,
    slug: folderSlug(folder),
    date: folder.slice(0, 10),
    idea: pitch?.idea ?? "",
    brand: pitch?.brand ?? brandFor(dir).asked,
    state: dropped(readme) ? "dropped" : !rendered ? "pitch" : hasPost ? "ready" : files.includes("validate.md") ? "checked" : "first-look",
    takes,
    stills,
    thumbnails,
    animatic: files.includes("animatic.mp4") ? "animatic.mp4" : undefined,
    extras: files.filter((file) => /-silent\.mp4$|\.mp3$|-thumbnail\.jpg$/.test(file)),
    storyboard: (pitch?.rows ?? []).map((row) => ({
      number: row.number,
      time: `${clock(row.start)}-${clock(row.end)}`,
      start: row.start,
      end: row.end,
      happens: row.happens,
      text: row.text,
      voice: row.voice,
      image: row.image,
    })),
    docs,
    hasSession: existsSync(join(dir, ".session")),
    updated: Math.max(...files.map((file) => statSync(join(dir, file)).mtimeMs)),
  };
}

function readKit(name: string): BrandKit {
  const dir = join(BRANDS, name);
  const brand = readBrand(name);
  const uploads = existsSync(join(dir, "uploads")) ? readdirSync(join(dir, "uploads")) : [];
  return {
    name,
    made: Boolean(brand),
    knowledge: editedCount(name),
    url: brand?.url,
    tagline: brand?.tagline,
    colours: [...new Set(brand?.colours ?? [])],
    fonts: brand?.fonts ?? [],
    logos: (brand?.logos ?? []).filter((logo) => existsSync(join(dir, logo))), // brand.md also names where a logo came from
    text: brand?.text ?? "",
    sources: readIf(join(dir, "sources.txt")) ?? "",
    uploads,
    updated: Math.max(mtime(join(dir, "brand.md")), mtime(dir)),
  };
}

const kitNames = () =>
  existsSync(BRANDS) ? readdirSync(BRANDS).filter((name) => !name.startsWith("_") && !name.startsWith(".") && statSync(join(BRANDS, name)).isDirectory()) : [];

const publicRun = ({ child: _child, session: _session, ...run }: Live): Run => run;

const queueFolders = () => (existsSync(QUEUE) ? readdirSync(QUEUE).filter((name) => FOLDER.test(name) && statSync(join(QUEUE, name)).isDirectory()) : []);

function state() {
  const ads = queueFolders().map(readAd);
  return {
    ads: ads.sort((a, b) => b.updated - a.updated),
    brands: kitNames().map(readKit).sort((a, b) => Number(b.made) - Number(a.made) || a.name.localeCompare(b.name)),
    runs: [...runs.values()].map(({ log: _log, partial: _partial, ...run }) => publicRun({ ...run, log: [] })).sort((a, b) => b.started - a.started),
  };
}

/* ── The registry, through the dev server's own module loader ──────────────────────────────────────── */

let loadedAt = 0;

/** The newest change under src/, so the registry is reloaded only when something changed. */
function newest(dir: string): number {
  let latest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    // A temp file (a desk edit being saved) can vanish between the listing and the stat.
    let mtime = 0;
    try {
      mtime = entry.isDirectory() ? newest(path) : statSync(path).mtimeMs;
    } catch {
      continue;
    }
    latest = Math.max(latest, mtime);
  }
  return latest;
}

const LOAD_TIMEOUT = 45_000;
let loading: Promise<Video[]> | undefined;

/**
 * The registry through Vite's SSR loader, one load at a time however often the desk polls. A load that never settles
 * (seen 2026-11-22, the desk polling while an agent wrote a new ad) stays pending in Vite's module runner, and every
 * later load waits on it, so the desk showed no scenes and no error until it was restarted. After LOAD_TIMEOUT the
 * load fails with an error the desk shows, and the next poll starts on a fresh runner.
 */
function loadVideos(server: ViteDevServer): Promise<Video[]> {
  if (loading) return loading;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, fail) => {
    timer = setTimeout(() => {
      // Vite keeps the runner on a private field and makes a new one when it's gone (ssrLoadModule in vite's node.js).
      (server as { _ssrCompatModuleRunner?: unknown })._ssrCompatModuleRunner = undefined;
      server.moduleGraph.invalidateAll();
      fail(new Error(`Loading src/registry.ts took over ${LOAD_TIMEOUT / 1000}s, so the desk is trying again. If this keeps happening, restart the desk (bun run dev).`));
    }, LOAD_TIMEOUT);
  });
  const load = Promise.race([server.ssrLoadModule("/src/registry.ts").then((module) => module.videos as Video[]), timedOut]).finally(() => {
    clearTimeout(timer);
    if (loading === load) loading = undefined;
  });
  loading = load;
  return load;
}

async function registry(server: ViteDevServer): Promise<{ ads: AdInfo[]; error?: string }> {
  const changed = newest(join(ROOT, "src"));
  if (changed > loadedAt) {
    server.moduleGraph.invalidateAll();
    loadedAt = changed;
  }
  let videos: Video[];
  try {
    videos = await loadVideos(server);
  } catch (error) {
    loadedAt = 0; // Try again next time: the agent may be halfway through an edit.
    return { ads: [], error: String((error as Error)?.message ?? error) };
  }
  const ads = new Map<string, AdInfo>();
  for (const video of videos) {
    const ad = ads.get(video.slug) ?? { slug: video.slug, takes: [] };
    ads.set(video.slug, ad);
    let take = ad.takes.find((item) => item.take === video.take);
    if (!take) {
      const storyFile = join(ADS, video.slug, `story${video.take ? `-${video.take}` : ""}.json`);
      const baseFile = join(ADS, video.slug, "story.json");
      const text = readIf(existsSync(storyFile) ? storyFile : baseFile);
      let story: Story | undefined;
      try {
        story = text ? JSON.parse(text) : undefined;
      } catch {
        story = undefined;
      }
      const tuneFile = join(ADS, video.slug, `tune${video.take ? `-${video.take}` : ""}.json`);
      const tuneText = readIf(existsSync(tuneFile) ? tuneFile : join(ADS, video.slug, "tune.json"));
      let tune: object | undefined;
      try {
        tune = tuneText ? JSON.parse(tuneText) : undefined;
      } catch {
        tune = undefined;
      }
      const cues: CueInfo[] = video.cues.map((cue) => {
        const [from, to] = typeof cue.trim === "number" ? [cue.trim, undefined] : (cue.trim ?? [0, undefined]);
        return {
          src: cue.src,
          at: cue.at ?? 0,
          ...(from ? { trim: from } : {}),
          ...(cue.volume !== undefined ? { volume: cue.volume } : {}),
          ...(to !== undefined ? { frames: to - from } : {}),
          ...(cue.scene ? { scene: cue.scene } : {}),
        };
      });
      take = {
        take: video.take,
        name: video.take ? `${video.slug}-${video.take}` : video.slug,
        kind: video.kind,
        fps: video.fps,
        frames: video.frames,
        lang: video.lang,
        dir: video.dir,
        audioTimed: video.audioTimed,
        ratios: [],
        scenes: video.scenes.map(({ id, name, frames, from, onStory, image, trimIn, full }) => ({ id, name, frames, from, onStory, ...(image ? { image: true } : {}), trimIn, full })),
        story,
        hasScenes: !(video.scenes.length === 1 && video.scenes[0].id === video.slug && !video.story),
        cues,
        ...(tune ? { tune } : {}),
      };
      ad.takes.push(take);
    }
    take.ratios.push({ ratio: video.ratio, id: video.id, width: video.width, height: video.height });
  }
  return { ads: [...ads.values()] };
}

/* ── Settings: what's installed and connected ────────────────────────────────────────────────────────── */

export type Status = {
  claude: { ok: boolean; version?: string; loggedIn?: boolean; account?: string; plan?: string; detail: string };
  eleven: { ok: boolean; detail: string };
  openrouter: { ok: boolean; detail: string };
  codex: { ok: boolean; detail: string; email?: string; plan?: string; path?: string };
  local: LocalStatus;
  whisper: { ok: boolean; detail: string };
  ytdlp: { ok: boolean; detail: string };
  opencv: { ok: boolean; detail: string };
  ffmpeg: { ok: boolean; detail: string };
};

const exec = (command: string, args: string[], timeout = 20_000) =>
  new Promise<{ ok: boolean; out: string }>((done) => {
    const [bin, ...before] = command.split(" ");
    execFile(bin, [...before, ...args], { cwd: ROOT, timeout }, (error, stdout, stderr) => done({ ok: !error, out: `${stdout}`.trim() || `${stderr}`.trim() || String(error?.message ?? "") }));
  });

let checked: { at: number; status: Status } | undefined;

/** Each check only asks whether a thing is there: nothing here spends a token or a credit. Kept for a minute. */
async function status(fresh: boolean): Promise<Status> {
  if (!fresh && checked && Date.now() - checked.at < 60_000) return checked.status;
  const bin = process.env.NYKMA_CLAUDE ?? readSettings().claude.bin;
  const venv = existsSync(PYTHON);
  const noVenv = { ok: false, detail: "No .venv yet. Make it and run: pip install -r py/requirements.txt" };
  // eleven.py reads only the key's line, and this prints only whether there is one.
  const hasKey = "import os, sys; sys.path.insert(0, 'py'); import eleven; print('yes' if eleven.dotenv('ELEVENLABS_API_KEY') or os.environ.get('ELEVENLABS_API_KEY') else 'no')";
  const codexBin = findCodex(readSettings().codex.bin);
  const [version, auth, key, whisper, ytdlp, opencv, ffmpeg, codex, local] = await Promise.all([
    exec(bin, ["--version"]),
    exec(bin, ["auth", "status", "--json"]),
    venv ? exec(PYTHON, ["-c", hasKey]) : undefined,
    venv ? exec(PYTHON, ["-c", "import faster_whisper; print(faster_whisper.__version__)"]) : undefined,
    venv ? exec(PYTHON, ["-m", "yt_dlp", "--version"]) : undefined,
    venv ? exec(PYTHON, ["-c", "import cv2; print(cv2.__version__)"]) : undefined,
    exec("ffmpeg", ["-version"]),
    codexAccount(codexBin),
    localStatus(),
  ]);
  let account: any = {};
  try {
    account = JSON.parse(auth.out);
  } catch {}
  const claude: Status["claude"] = !version.ok
    ? { ok: false, detail: `\`${bin}\` didn't run. Install Claude Code, or set the path to it below.` }
    : account.loggedIn
      ? { ok: true, version: version.out.split(" ")[0], loggedIn: true, account: account.email ?? account.orgName, plan: account.subscriptionType ?? account.authMethod, detail: "Connected" }
      : { ok: false, version: version.out.split(" ")[0], loggedIn: false, detail: "Installed, but not logged in. Run claude auth login in a terminal." };
  const next: Status = {
    claude,
    eleven: keyHint("elevenlabs").set
      ? { ok: true, detail: "Key in the desk's key store" }
      : !key ? noVenv : key.out === "yes" ? { ok: true, detail: "Key found in .env.local, .env or the environment" } : { ok: false, detail: "No key. Add it under Connections" },
    openrouter: keyHint("openrouter").set ? { ok: true, detail: "Key in the desk's key store" } : { ok: false, detail: "Not connected. Add its key under Connections" },
    codex: { ...codex, path: codexBin, detail: codex.ok ? `Logged in${codex.email ? ` as ${codex.email}` : ""}${codex.plan ? ` (ChatGPT ${codex.plan})` : ""}` : codex.detail },
    local,
    whisper: !whisper ? noVenv : whisper.ok ? { ok: true, detail: `faster-whisper ${whisper.out}, on this machine` } : { ok: false, detail: "Not installed. Run: pip install -r py/requirements.txt" },
    ytdlp: !ytdlp ? noVenv : ytdlp.ok ? { ok: true, detail: `yt-dlp ${ytdlp.out}` } : { ok: false, detail: "Not installed. Run: pip install -r py/requirements.txt" },
    opencv: !opencv ? noVenv : opencv.ok ? { ok: true, detail: `OpenCV ${opencv.out}, for screens in clips` } : { ok: false, detail: "Not installed. Run: pip install -r py/requirements.txt" },
    ffmpeg: ffmpeg.ok ? { ok: true, detail: ffmpeg.out.split("\n")[0].replace(/ Copyright.*/, "") } : { ok: false, detail: "Not on PATH. Every render needs it." },
  };
  checked = { at: Date.now(), status: next };
  return next;
}

export type Voice = { id: string; name: string; labels: Record<string, string>; preview?: string; category?: string };
let voiceList: { at: number; voices: Voice[] } | undefined;

/** `mv.py voices --id`: one voice's name and preview, or why there's none. Free. */
async function lookUpVoice(id: string): Promise<{ voice?: Voice; error?: string }> {
  if (!VOICE_ID.test(id)) return { error: "A voice id is 8 to 40 letters and numbers, as ElevenLabs shows it." };
  if (!existsSync(PYTHON)) return { error: "No .venv yet, so the voice can't be looked up." };
  const { ok, out } = await exec(PYTHON, ["py/mv.py", "voices", "--id", id], 30_000);
  if (!ok) return { error: out.split("\n").pop() || "ElevenLabs didn't find it." };
  try {
    return { voice: JSON.parse(out) };
  } catch {
    return { error: "ElevenLabs didn't find it." };
  }
}

/** `mv.py voices --json`: listing them is free, but it needs the key. Kept for ten minutes. */
async function voices(): Promise<{ voices?: Voice[]; error?: string }> {
  if (voiceList && Date.now() - voiceList.at < 600_000) return { voices: voiceList.voices };
  if (!existsSync(PYTHON)) return { error: "No .venv yet, so the voices can't be listed." };
  const { ok, out } = await exec(PYTHON, ["py/mv.py", "voices", "--json"], 30_000);
  if (!ok) return { error: out.split("\n").pop() || "The voices didn't load." };
  try {
    voiceList = { at: Date.now(), voices: JSON.parse(out) };
    return { voices: voiceList.voices };
  } catch {
    return { error: "The voices didn't load." };
  }
}

/* ── Connections and generated media ───────────────────────────────────────────────────────────────── */

function keysState() {
  return { home: keyHome(), services: Object.entries(SERVICES).map(([name, service]) => ({ name, label: service.label, for: service.for, ...keyHint(name as keyof typeof SERVICES) })) };
}

/** Asks the service whether the key works, with a call that costs nothing. Answers in words, never with the key. */
async function testKey(service: string | null): Promise<{ ok: boolean; detail: string }> {
  if (!isService(service)) return { ok: false, detail: "No such service." };
  const key = readKey(service);
  if (!key) return { ok: false, detail: "No key saved." };
  try {
    if (service === "openrouter") {
      const res = await fetch(`${process.env.NYKMA_OPENROUTER_URL ?? "https://openrouter.ai/api/v1"}/key`, { headers: { Authorization: `Bearer ${key}` } });
      if (!res.ok) return { ok: false, detail: `OpenRouter said ${res.status}: the key doesn't work.` };
      const data = (await res.json())?.data ?? {};
      const limit = data.limit == null ? "no credit limit on this key (set one at openrouter.ai/keys)" : `${money(Number(data.limit_remaining ?? 0))} left of its ${money(Number(data.limit))} limit${data.limit_reset ? `, reset ${data.limit_reset}` : ""}`;
      // A key's limit isn't money: paid models need credits on the account too, and a key on an account that never
      // bought any gets 402 on every paid call. /credits says the balance, where the key may ask for it.
      const balance = await fetch(`${process.env.NYKMA_OPENROUTER_URL ?? "https://openrouter.ai/api/v1"}/credits`, { headers: { Authorization: `Bearer ${key}` } })
        .then((reply) => (reply.ok ? reply.json() : null))
        .then((body) => (body?.data ? Number(body.data.total_credits ?? 0) - Number(body.data.total_usage ?? 0) : null), () => null);
      if (data.is_free_tier || (balance !== null && balance <= 0))
        return { ok: false, detail: `The key works, but the account has no credits${balance !== null ? ` (${money(Math.max(0, balance))})` : ""}, so every paid model is refused. Buy some at openrouter.ai/settings/credits, on the account this key belongs to.` };
      return { ok: true, detail: `Works. Account credits: ${balance === null ? "unknown" : money(balance)}. This key: used ${money(Number(data.usage ?? 0))}; ${limit}.` };
    }
    if (service === "pexels" || service === "pixabay") return await testStockKey(service, key);
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } });
    if (!res.ok) return { ok: false, detail: `ElevenLabs said ${res.status}: the key doesn't work.` };
    const sub = await res.json();
    return { ok: true, detail: `Works. ${sub.tier ?? "Plan"}: ${Number(sub.character_count ?? 0).toLocaleString()} of ${Number(sub.character_limit ?? 0).toLocaleString()} credits used this period.` };
  } catch (error) {
    return { ok: false, detail: `Couldn't reach it: ${(error as Error).message}` };
  }
}

/** An ad's shots with their estimates, what's made, the approved budget and what's spent. Free: no paid call. */
async function genState(slug: string) {
  if (!NAME.test(slug)) return { error: "No such ad." };
  try {
    const states = await stateOf(slug);
    const reviews = reviewsOf(slug, states);
    // Each still with your verdict on it, and each video with the stills it's still waiting on.
    const shots = states.map((state) => (state.kind === "image" ? { ...state, review: reviews[state.id] } : { ...state, waiting: stillsWaiting(slug, state, states) }));
    const needsOpenRouter = states.some((state) => !state.current && state.via !== "codex" && state.via !== "local");
    return {
      slug,
      shots,
      toMake: totalToMake(states) ?? null,
      stillsToMake: totalToMake(states, "image") ?? null,
      videosToMake: totalToMake(states, "video") ?? null,
      approved: budgets()[slug] ?? 0,
      spent: spent(slug),
      jobs: jobsOf(slug),
      connected: !needsOpenRouter || keyHint("openrouter").set,
      codex: Boolean(findCodex(readSettings().codex.bin)),
    };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

/* ── Runs: ad-agent, and renders ─────────────────────────────────────────────────────────────────────── */

/** Where a conversation's session and history are kept. */
function home(run: { folder?: string; brand?: string }) {
  if (run.folder && existsSync(join(QUEUE, run.folder))) return join(QUEUE, run.folder);
  if (run.brand && existsSync(join(BRANDS, run.brand))) return join(BRANDS, run.brand);
  return undefined;
}

function remember(run: Live) {
  const dir = home(run);
  if (!dir) return;
  if (run.session) writeFileSync(join(dir, ".session"), run.session);
}

function saveChat(run: Live) {
  const dir = home(run);
  if (!dir) return;
  const path = join(dir, ".chat.json");
  let past: Run[] = [];
  try {
    past = JSON.parse(readIf(path) ?? "[]");
  } catch {
    past = [];
  }
  const { partial: _partial, ...done } = publicRun(run);
  writeFileSync(path, JSON.stringify([...past.filter((item) => item.id !== run.id), done].slice(-200), null, 1));
}

/** What the agent did, in words. */
function describe(name: string, input: Record<string, unknown>) {
  const file = typeof input.file_path === "string" ? basename(input.file_path) : "";
  if (name === "Bash") return String(input.description ?? input.command ?? "Ran a command");
  if (name === "Write") return `Wrote ${file}`;
  if (name === "Edit") return `Edited ${file}`;
  if (name === "Read") return `Read ${file}`;
  if (name === "Glob" || name === "Grep") return "Searched the project";
  return name;
}

type Ask = {
  folder?: string; slug?: string; brand?: string; kit?: string; kind?: string; text: string; shown?: string; session?: string; thread?: string;
  ratios?: Ratio[]; pitch?: boolean; thumbnail?: boolean;
};

function promptFor({ folder, slug, brand, kit, kind, text, ratios, pitch, thumbnail }: Ask, session?: string) {
  if (session) return text;
  if (kit) return `Work on the brand kit in brands/${kit}/ (spec.md §9), from the desk. The user says:\n\n${text}`;
  if (folder) return `Continue the ad in queue/${folder}/, following the flow in your prompt. The user says:\n\n${text}`;
  if (slug) return `This is about the ad in src/ads/${slug}/, which has no queue folder yet. The user says:\n\n${text}`;
  const settings = readSettings();
  const asset = kind === "asset" ? `\nKind: an asset, not a video: stills, \`kind: "asset"\` in the registry, one image per scene (spec.md §10.5).` : "";
  const brief = briefFor(settings, { ratios: ratios?.length ? ratios : settings.ratios, pitch, thumbnail, asset: kind === "asset" });
  return `${text}${brand ? `\n\nBrand: ${brand}` : "\n"}${asset}\n${brief}`;
}

function start(ask: Ask) {
  const { folder, slug, kit } = ask;
  const settings = readSettings();
  const dir = home({ folder, brand: kit });
  const session = ask.session ?? (dir && readIf(join(dir, ".session"))?.trim());

  // A new project takes a queue folder the agent makes, never one it only reads: it often opens old pitches as
  // examples, and claiming one of those used to open the wrong project and overwrite its .session.
  const existing = new Set(queueFolders());
  const fits = (name: string) => FOLDER.test(name) && !existing.has(name) && (!slug || name.endsWith(`-${slug}`));
  const newFolder = (input: unknown) =>
    [...JSON.stringify(input ?? {}).matchAll(/queue[\\/]+(\d{4}-\d{2}-\d{2}-[^\\/"' ;&|)]+)/g)].map((match) => match[1]).find(fits);
  /** A folder that appeared since the run began, for when the agent made it without naming it in a tool call. */
  const appeared = () => {
    const fresh = queueFolders().filter(fits);
    return fresh.length === 1 ? fresh[0] : undefined;
  };

  const id = randomUUID();
  // The brand's own version of the agent, if it edited any of its instructions (agents.ts).
  const uses = kit ?? ask.brand ?? (folder ? brandFor(join(QUEUE, folder)).asked : undefined);
  const agent = agentFor(uses);
  const run: Live = { id, kind: "agent", folder, brand: kit, slug, thread: ask.thread, uses, title: ask.shown?.trim() || ask.text, running: true, started: Date.now(), log: [], session: session || undefined };
  runs.set(id, run);
  /** The project's folder is known: remember the session there. */
  const claim = (name: string) => {
    run.folder = name;
    remember(run);
  };

  const args = [
    "-p", "--agent", agent, "--output-format", "stream-json", "--verbose", "--include-partial-messages",
    "--allowedTools", ALLOWED.join(","), "--disallowedTools", DENIED.join(","),
    ...(settings.claude.model ? ["--model", settings.claude.model] : []),
    ...(settings.claude.effort ? ["--effort", settings.claude.effort] : []),
    "--strict-mcp-config",
    ...(session ? ["--resume", session] : []),
  ];
  const [bin, ...before] = (process.env.NYKMA_CLAUDE ?? settings.claude.bin).split(" ");
  // The run gets the desk's address for bun run gen, and none of the paid services' keys.
  const env: NodeJS.ProcessEnv = { ...process.env, ...AGENT_ENV, NYKMA_DESK_URL: deskUrl, NYKMA_DESK_TOKEN: DESK_TOKEN };
  for (const name of SECRET_ENV) delete env[name];
  const child = spawn(bin, [...before, ...args], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"], env });
  run.child = child;
  child.stdin.end(promptFor(ask, session || undefined));

  const onEvent = (event: any) => {
    if (event.session_id && event.session_id !== run.session) {
      run.session = event.session_id;
      remember(run);
    }
    if (!run.folder && !run.brand && event.type === "user") {
      // A tool just finished: if it made exactly one new queue folder, that's this project's.
      const made = appeared();
      if (made) claim(made);
    }
    if (event.type === "stream_event") {
      const inner = event.event;
      if (inner?.type === "message_start") run.partial = "";
      if (inner?.type === "content_block_delta" && inner.delta?.type === "text_delta") run.partial = (run.partial ?? "") + inner.delta.text;
    }
    if (event.type === "assistant") {
      run.partial = undefined;
      for (const block of event.message?.content ?? []) {
        if (block.type === "text" && block.text.trim()) run.log.push({ kind: "say", text: block.text.trim() });
        if (block.type === "tool_use") {
          run.log.push({ kind: "do", text: describe(block.name, block.input ?? {}) });
          const named = !run.folder && !run.brand && newFolder(block.input);
          if (named) claim(named);
        }
      }
    }
    if (event.type === "result") {
      run.cost = event.total_cost_usd;
      if (event.is_error) run.error = String(event.result ?? "The agent stopped with an error.");
    }
  };

  let buffer = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line));
      } catch {
        run.log.push({ kind: "do", text: line.slice(0, 200) });
      }
    }
  });

  let errors = "";
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => (errors += chunk));
  child.on("error", (error: NodeJS.ErrnoException) => {
    run.running = false;
    run.error = error.code === "ENOENT" ? `\`${bin}\` isn't there. Install Claude Code and log in, or set its path in Settings.` : error.message;
    saveChat(run);
  });
  child.on("close", (code) => {
    run.running = false;
    run.child = undefined;
    run.partial = undefined;
    if (code && !run.error && !stopping.delete(id)) run.error = errors.trim().slice(-400) || `The agent exited with code ${code}.`;
    saveChat(run);
  });
  return run;
}

/**
 * `bun run render <slug> --ratio all`, then every file it wrote copied to the
 * queue folder. Spends no tokens.
 */
function render(slug: string, folder: string | undefined) {
  const id = randomUUID();
  const run: Live = { id, kind: "render", folder, slug, title: `Render every ratio of ${slug}`, running: true, started: Date.now(), log: [] };
  runs.set(id, run);
  const script = [...NODE_SCRIPT, "scripts/render.ts", slug, "--ratio", "all"];
  const child = spawn(process.platform === "win32" ? "node.exe" : "node", script, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  run.child = child;
  const written: string[] = [];
  const onLine = (line: string) => {
    const text = line.trim();
    if (!text) return;
    if (/\.(mp4|mp3|png)$/i.test(text) && existsSync(text)) written.push(text);
    run.log.push({ kind: "do", text: text.startsWith(ROOT) ? relative(ROOT, text) : text });
  };
  let buffer = "";
  const read = (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    lines.forEach(onLine);
  };
  child.stdout.setEncoding("utf8").on("data", read);
  child.stderr.setEncoding("utf8").on("data", read);
  child.on("error", (error) => {
    run.running = false;
    run.error = error.message;
    saveChat(run);
  });
  child.on("close", (code) => {
    onLine(buffer);
    run.running = false;
    run.child = undefined;
    if (code && !stopping.delete(id)) run.error = `The render stopped (exit ${code}). The last lines above say why.`;
    else if (!code) {
      const dir = folder && join(QUEUE, folder);
      if (dir && existsSync(dir)) {
        for (const file of written) copyFileSync(file, join(dir, basename(file)));
        run.log.push({ kind: "say", text: `Rendered and copied ${written.length} files to queue/${folder}/.` });
      } else run.log.push({ kind: "say", text: `Rendered ${written.length} files to out/${slug}/. There's no queue folder to copy them to.` });
    }
    saveChat(run);
  });
  return run;
}

function stop(id: string) {
  const child = runs.get(id)?.child;
  if (!child?.pid) return;
  stopping.add(id);
  // The agent's renders are its children, so take the whole tree down.
  if (process.platform === "win32") execFile("taskkill", ["/T", "/F", "/PID", String(child.pid)], () => {});
  else child.kill();
}

/** Past runs from .chat.json, then the live ones, oldest first. */
function chat(query: URLSearchParams) {
  const folder = query.get("folder") ?? undefined;
  const brand = query.get("brand") ?? undefined;
  const slug = query.get("slug") ?? undefined;
  const runId = query.get("run") ?? undefined;
  const dir = home({ folder: folder && FOLDER.test(folder) ? folder : undefined, brand: brand && NAME.test(brand) ? brand : undefined });
  let past: Run[] = [];
  try {
    past = dir ? JSON.parse(readIf(join(dir, ".chat.json")) ?? "[]") : [];
  } catch {
    past = [];
  }
  const live = [...runs.values()]
    .filter((run) => (runId && (run.id === runId || run.thread === runId)) || (folder && run.folder === folder) || (brand && run.brand === brand) || (slug && !run.folder && run.slug === slug))
    .map(publicRun);
  const ids = new Set(live.map((run) => run.id));
  return [...past.filter((run) => !ids.has(run.id)), ...live].sort((a, b) => a.started - b.started);
}

/* ── HTTP ────────────────────────────────────────────────────────────────────────────────────────────── */

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
};

const readBody = (req: IncomingMessage) =>
  new Promise<any>((done, fail) => {
    let text = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      text += chunk;
      if (text.length > 2_000_000) req.destroy(new Error("Too long"));
    });
    req.on("end", () => {
      try {
        done(JSON.parse(text || "{}"));
      } catch (error) {
        fail(error);
      }
    });
    req.on("error", fail);
  });

/** A web page you visit could post to localhost and start an agent, so only this page may. */
function sameOrigin(req: IncomingMessage) {
  const { origin, host } = req.headers;
  if (!origin || !host) return false;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
  return local.test(host) && origin.replace(/^https?:\/\//, "") === host;
}

const busy = (match: (run: Live) => boolean) => [...runs.values()].some((run) => run.running && match(run));

/** Streams an upload to disk: queue/<folder>/inbox/, brands/<brand>/uploads/ or public/ads/<slug>/board/. */
function upload(req: IncomingMessage, res: ServerResponse, query: URLSearchParams) {
  const [kind, target] = (query.get("to") ?? "").split(/:(.*)/s);
  let name = basename(query.get("name") ?? "").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120);
  if (!name || name.startsWith(".")) return send(res, 400, { error: "That file needs a name." });
  let dir: string;
  if (kind === "folder" && FOLDER.test(target) && existsSync(join(QUEUE, target))) dir = join(QUEUE, target, "inbox");
  else if (kind === "brand" && NAME.test(target)) dir = join(BRANDS, target, "uploads");
  else if (kind === "board" && NAME.test(target) && existsSync(join(ADS, target))) {
    // The video reads only public/, so a board image goes there. It never overwrites one already on a board.
    if (!IMAGE.test(name)) return send(res, 400, { error: "The board takes images: PNG, JPEG, WebP, GIF, AVIF or SVG." });
    dir = join(PUBLIC_ADS, target, "board");
    name = name.replace(/ +/g, "-");
    const [stem, ext] = [name.slice(0, name.lastIndexOf(".")), name.slice(name.lastIndexOf("."))];
    for (let n = 2; existsSync(join(dir, name)); n++) name = `${stem}-${n}${ext}`;
  } else if (kind === "footage" && NAME.test(target) && existsSync(join(ADS, target))) {
    if (!VIDEO.test(name)) return send(res, 400, { error: "A clip is a video: MOV, MP4, M4V, WebM, MKV or AVI." });
    dir = join(PUBLIC_ADS, target, "footage");
    name = name.replace(/ +/g, "-");
    const [stem, ext] = [name.slice(0, name.lastIndexOf(".")), name.slice(name.lastIndexOf("."))];
    for (let n = 2; existsSync(join(dir, name)); n++) name = `${stem}-${n}${ext}`;
  } else return send(res, 400, { error: "Upload to a project, a brand kit or an ad's board." });
  const limit = kind === "footage" ? 4_000_000_000 : 500_000_000;
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  const out = createWriteStream(path);
  let size = 0;
  req.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > limit) {
      req.destroy();
      out.destroy();
      if (existsSync(path)) unlinkSync(path);
      send(res, 413, { error: `Files over ${limit / 1e9 >= 1 ? `${limit / 1e9} GB` : `${limit / 1e6} MB`} aren't taken.` });
    }
  });
  req.pipe(out);
  out.on("finish", () => send(res, 200, { path: relative(ROOT, path).split(sep).join("/") }));
  out.on("error", (error) => send(res, 500, { error: error.message }));
}

async function post(path: string, body: any, res: ServerResponse) {
  const folder: string | undefined = body.folder || undefined;
  if (folder !== undefined && (!FOLDER.test(folder) || !existsSync(join(QUEUE, folder)))) return send(res, 404, { error: "That ad's folder isn't in queue/." });

  if (path === "/api/footage") {
    const slug = String(body.slug ?? "");
    const file = resolve(ROOT, String(body.file ?? ""));
    if (!NAME.test(slug) || !existsSync(join(ADS, slug))) return send(res, 404, { error: "No such ad." });
    if (!file.startsWith(join(PUBLIC_ADS, slug, "footage") + sep) || !existsSync(file)) return send(res, 404, { error: "That clip isn't in the ad's footage/." });
    return void unpack(slug, file).then(
      (meta) => send(res, 200, meta),
      (error) => send(res, 500, { error: String(error?.message ?? error) }),
    );
  }

  if (path === "/api/ask") {
    const text = String(body.text ?? "").trim();
    if (!text) return send(res, 400, { error: "Write what you want first." });
    const kit = body.kit ? String(body.kit) : undefined;
    const slug = body.slug ? String(body.slug) : undefined;
    if (kit !== undefined && !NAME.test(kit)) return send(res, 400, { error: "A brand kit's name is letters, numbers and dashes." });
    if (slug !== undefined && !NAME.test(slug)) return send(res, 400, { error: "No such ad." });
    if (folder && busy((run) => run.folder === folder)) return send(res, 409, { error: "The agent is still working on this ad." });
    if (kit && busy((run) => run.brand === kit)) return send(res, 409, { error: "The agent is still working on this kit." });
    if (kit) mkdirSync(join(BRANDS, kit), { recursive: true });
    // A reply to a run that hasn't named its folder yet continues that run's session.
    const before = body.after ? runs.get(String(body.after)) : undefined;
    if (before?.running) return send(res, 409, { error: "The agent is still working." });
    const ratios = Array.isArray(body.ratios) ? (RATIOS.filter((ratio) => body.ratios.includes(ratio)) as Ratio[]) : undefined;
    const run = start({
        folder: folder ?? before?.folder,
        slug: slug ?? before?.slug,
        kit: kit ?? before?.brand,
        brand: body.brand || before?.uses || undefined,
        kind: body.kind,
        text,
        shown: body.shown,
        session: before?.session,
        thread: before ? (before.thread ?? before.id) : undefined,
        ratios,
        pitch: typeof body.pitch === "boolean" ? body.pitch : undefined,
        thumbnail: typeof body.thumbnail === "boolean" ? body.thumbnail : undefined,
    });
    return send(res, 200, { id: run.id });
  }
  if (path === "/api/stop") {
    stop(String(body.id));
    return send(res, 200, {});
  }
  if (path === "/api/story") {
    const slug = String(body.slug ?? "");
    const take = body.take ? String(body.take) : undefined;
    if (!NAME.test(slug) || !existsSync(join(ADS, slug)) || (take && !NAME.test(take))) return send(res, 404, { error: "No such ad." });
    const story = body.story as Story;
    const ids = (list: unknown) => Array.isArray(list) && list.every((item) => typeof item === "string");
    // The timeline writes the order and trims; arrows were the old board's and are no longer needed.
    if (!story || !ids(story.order) || (story.arrows !== undefined && !Array.isArray(story.arrows))) return send(res, 400, { error: "That isn't a story." });
    const frame = (n: unknown) => n === undefined || (typeof n === "number" && Number.isFinite(n) && n >= 0);
    const trims = Object.values((story as Story & { trim?: Record<string, { in?: unknown; out?: unknown }> }).trim ?? {});
    if (!trims.every((trim) => trim && typeof trim === "object" && frame(trim.in) && frame(trim.out))) return send(res, 400, { error: "A trim is { in, out } in frames." });
    const images = Object.values(story.images ?? {});
    const inPublic = (src: unknown) => typeof src === "string" && src.startsWith(`ads/${slug}/`) && !src.includes("..");
    if (!images.every((image) => inPublic(image?.src))) return send(res, 400, { error: `Board images must be under public/ads/${slug}/.` });
    // Written whole, then renamed: a half-written story.json would break every board frame's import of the stories.
    const storyFile = join(ADS, slug, `story${take ? `-${take}` : ""}.json`);
    const before = readIf(storyFile) ?? null;
    const after = `${JSON.stringify(story, null, 2)}\n`;
    writeAtomic(storyFile, after);
    const label = labelOf(body.label) ?? storyLabel(before, story);
    toHistory(slug, "story", label, [{ path: repoPath(storyFile), before, after }], `story:${storyFile}:${label}`);
    return send(res, 200, {});
  }
  if (path === "/api/tune") {
    const slug = String(body.slug ?? "");
    const take = body.take ? String(body.take) : undefined;
    if (!NAME.test(slug) || !existsSync(join(ADS, slug)) || (take && !NAME.test(take))) return send(res, 404, { error: "No such ad." });
    const scope = String(body.ratio ?? "");
    const id = String(body.id ?? "");
    if (!["all", ...RATIOS].includes(scope)) return send(res, 400, { error: "ratio is 16x9, 1x1, 9x16 or all." });
    if (!/^[\w.-]{1,64}$/.test(id)) return send(res, 400, { error: "That isn't a knob id." });
    const value: unknown = body.value;
    const nudge = (v: unknown) =>
      typeof v === "object" && v !== null && !Array.isArray(v) && Object.entries(v).every(([key, n]) => ["dx", "dy", "scale", "rotate"].includes(key) && typeof n === "number" && Number.isFinite(n));
    const plain = value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
    if (!plain && !nudge(value)) return send(res, 400, { error: "A knob is a number, string, boolean, { dx, dy, scale, rotate } or null." });
    // A take with no tune file of its own sets the ad's, as that's the one it reads.
    const own = join(ADS, slug, `tune${take ? `-${take}` : ""}.json`);
    const file = take && !existsSync(own) ? join(ADS, slug, "tune.json") : own;
    let tune: Record<string, Record<string, unknown>>;
    try {
      const text = readIf(file);
      tune = text ? JSON.parse(text) : {};
    } catch {
      return send(res, 409, { error: `${relative(ROOT, file)} isn't valid JSON, so it wasn't overwritten.` });
    }
    const before = readIf(file) ?? null;
    const old = tune[scope]?.[id];
    const values = { ...(tune[scope] ?? {}) };
    if (value === null) delete values[id];
    else values[id] = value;
    if (Object.keys(values).length) tune[scope] = values;
    else delete tune[scope];
    const after = `${JSON.stringify(tune, null, 2)}\n`;
    writeAtomic(file, after);
    const where = scope === "all" ? "" : ` (${scope.replace("x", ":")})`;
    const auto = value === null ? `Reset ${id}${where}` : `${id}${old === undefined ? "" : ` ${knobText(old)}`} → ${knobText(value)}${where}`;
    toHistory(slug, "tune", labelOf(body.label) ?? auto, [{ path: repoPath(file), before, after }], `tune:${file}:${scope}:${id}`);
    return send(res, 200, { tune });
  }
  if (path === "/api/settings") return send(res, 200, saveSettings(body.settings));
  if (path === "/api/keys") {
    if (!isService(body.service)) return send(res, 400, { error: "No such service." });
    saveKey(body.service, String(body.key ?? ""));
    checked = undefined;
    return send(res, 200, keysState());
  }
  if (path === "/api/keys/remove") {
    if (!isService(body.service)) return send(res, 400, { error: "No such service." });
    removeKey(body.service);
    checked = undefined;
    return send(res, 200, keysState());
  }
  if (path === "/api/local/start" || path === "/api/local/stop") {
    try {
      if (path === "/api/local/start") await startComfy();
      else await stopComfy();
    } catch (error) {
      return send(res, 500, { error: (error as Error).message });
    }
    checked = undefined;
    return send(res, 200, await localStatus());
  }
  if (path === "/api/gen/approve") {
    const slug = String(body.slug ?? "");
    if (!NAME.test(slug) || !existsSync(join(PUBLIC_ADS, slug))) return send(res, 404, { error: "No such ad." });
    approve(slug, Number(body.usd));
    return send(res, 200, await genState(slug));
  }
  if (path === "/api/gen/review") {
    const slug = String(body.slug ?? "");
    if (!NAME.test(slug) || !existsSync(join(PUBLIC_ADS, slug))) return send(res, 404, { error: "No such ad." });
    if (body.verdict !== "approved" && body.verdict !== "retake") return send(res, 400, { error: "A still is approved or retaken." });
    await reviewStill(slug, String(body.id ?? ""), body.verdict, String(body.note ?? ""));
    return send(res, 200, await genState(slug));
  }
  if (path === "/api/gen/videos") {
    const slug = String(body.slug ?? "");
    if (!NAME.test(slug) || !existsSync(join(PUBLIC_ADS, slug))) return send(res, 404, { error: "No such ad." });
    await startVideos(slug, body.usd === undefined ? undefined : Number(body.usd));
    return send(res, 200, await genState(slug));
  }
  if (path === "/api/render") {
    const slug = String(body.slug ?? "");
    if (!NAME.test(slug)) return send(res, 404, { error: "No such ad." });
    if (!existsSync(join(ADS, slug))) return send(res, 404, { error: "No such ad." });
    if (busy((run) => run.slug === slug && run.kind === "render")) return send(res, 409, { error: "It's already rendering." });
    if (folder && busy((run) => run.folder === folder && run.kind === "agent")) return send(res, 409, { error: "The agent is working on this ad. Let it finish first." });
    return send(res, 200, { id: render(slug, folder).id });
  }
  if (path === "/api/brand-md") {
    const brand = String(body.brand ?? "");
    if (!NAME.test(brand) || !existsSync(join(BRANDS, brand))) return send(res, 404, { error: "No such brand kit." });
    writeFileSync(join(BRANDS, brand, "brand.md"), String(body.text ?? ""));
    return send(res, 200, {});
  }
  if (path === "/api/instruction" || path === "/api/instruction/reset") {
    const file = String(body.path ?? "");
    const brand = body.brand ? String(body.brand) : undefined;
    try {
      if (path === "/api/instruction/reset") return send(res, 200, resetInstruction(file, brand ?? ""));
      return send(res, 200, saveInstruction(file, String(body.text ?? ""), brand));
    } catch (error) {
      return send(res, 400, { error: (error as Error).message });
    }
  }
  if (path === "/api/brand-check") {
    const brand = String(body.brand ?? "");
    if (!NAME.test(brand) || !existsSync(join(BRANDS, brand))) return send(res, 404, { error: "No such brand kit." });
    execFile(process.platform === "win32" ? "node.exe" : "node", [...NODE_SCRIPT, "scripts/brand-check.ts", brand], { cwd: ROOT, timeout: 120_000 }, (error, stdout, stderr) =>
      send(res, 200, { output: `${stdout}${stderr}`.trim() || error?.message || "Nothing to report.", failed: Boolean(error) }),
    );
    return;
  }
  if (!folder) return send(res, 400, { error: "Pick an ad first." });
  if (busy((run) => run.folder === folder)) return send(res, 409, { error: "The agent is still working on this ad." });

  const readme = join(QUEUE, folder, "README.md");
  const current = readIf(readme) ?? "";
  if (path === "/api/drop") {
    if (!dropped(current)) writeFileSync(readme, `Dropped\n\n${current}`);
    return send(res, 200, {});
  }
  if (path === "/api/restore") {
    writeFileSync(readme, current.replace(/^\s*#*\s*\**Dropped\b\**\s*/i, ""));
    return send(res, 200, {});
  }
  return send(res, 404, { error: "No such action." });
}

const repoPath = (file: string) => relative(ROOT, file).split(sep).join("/");
const labelOf = (label: unknown) => (typeof label === "string" && label.trim() ? label.trim().slice(0, 200) : undefined);
const knobText = (value: unknown) =>
  value && typeof value === "object"
    ? Object.entries(value)
        .map(([key, n]) => `${key} ${n}`)
        .join(", ")
    : typeof value === "string"
      ? `"${value.length > 40 ? `${value.slice(0, 39)}…` : value}"`
      : String(value);

/** Adds a write to the ad's history (history.ts). The write is made either way: a history that fails only warns. */
function toHistory(slug: string, kind: HistoryKind, label: string, files: FileChange[], key: string) {
  try {
    record(slug, kind, label, files, key);
  } catch (error) {
    console.warn(`[desk] ${files.map((file) => file.path).join(", ")} changed but isn't in the history: ${(error as Error).message}`);
  }
}

/** A label for a story write, from what changed in it. */
function storyLabel(before: string | null, story: Story): string {
  let old: Record<string, any> = {};
  try {
    old = before ? JSON.parse(before) : {};
  } catch {}
  const now = story as Record<string, any>;
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const list = (ids: string[]) => (ids.length > 2 ? `${ids.slice(0, 2).join(", ")} and ${ids.length - 2} more` : ids.join(", "));
  if (!same(old.order, now.order)) {
    const was: string[] = Array.isArray(old.order) ? old.order : [];
    const is: string[] = Array.isArray(now.order) ? now.order : [];
    const added = is.filter((id) => !was.includes(id));
    const removed = was.filter((id) => !is.includes(id));
    if (added.length && !removed.length) return `Add ${list(added)}`;
    if (removed.length && !added.length) return `Remove ${list(removed)}`;
    if (!added.length && !removed.length) return "Reorder scenes";
  }
  const changedKeys = (a: Record<string, unknown> = {}, b: Record<string, unknown> = {}) =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !same(a[key], b[key]));
  const images = changedKeys(old.images, now.images);
  if (images.length) return images.every((id) => !old.images?.[id]) ? "Add image" : images.every((id) => !now.images?.[id]) ? "Remove image" : `Change ${list(images)}`;
  const trims = changedKeys(old.trim, now.trim);
  if (trims.length) return `Trim ${list(trims)}`;
  const transitions = changedKeys(old.transitions, now.transitions);
  if (transitions.length) return `Transition into ${list(transitions)}`;
  const keys = changedKeys(old, now);
  return keys.length ? `Change ${list(keys)}` : "Change the story";
}

/** The ad's history: what the desk changed, and moving through it (history.ts). */
function historyPost(path: string, body: any) {
  const slug = String(body.slug ?? "");
  if (!NAME.test(slug) || !existsSync(join(ADS, slug))) throw Object.assign(new Error("No such ad."), { status: 404 });
  if (path === "/api/history/undo") return historyUndo(slug);
  if (path === "/api/history/redo") return historyRedo(slug);
  if (path === "/api/history/goto") return historyGoto(slug, Number(body.position));
  throw Object.assign(new Error("No such action."), { status: 404 });
}

/** Free stock (stock-run.ts): a search, or taking one result into the ad. */
function stock(path: string, body: any): Promise<unknown> {
  const slug = String(body.slug ?? "");
  if (!NAME.test(slug)) throw new Error("No such ad.");
  const kind = (value: unknown): Kind | undefined => (value === "photo" || value === "video" ? value : undefined);
  if (path === "/api/stock/search") {
    const kinds = Array.isArray(body.kinds) ? body.kinds.map(kind).filter(Boolean) : [];
    const sources = Array.isArray(body.sources) ? body.sources.filter(isSource) : [];
    return searchStock({
      query: String(body.query ?? ""),
      kinds: kinds.length ? kinds : ["photo", "video"],
      ratio: isRatio(body.ratio) ? body.ratio : undefined,
      minSeconds: Number(body.minSeconds) > 0 ? Number(body.minSeconds) : undefined,
      sources: sources.length ? sources : ["pexels", "pixabay"],
      page: Number.isInteger(body.page) ? body.page : undefined,
    });
  }
  return takeStock({
    slug,
    id: String(body.id ?? ""),
    type: kind(body.type),
    name: body.name ? String(body.name) : undefined,
    ratios: Array.isArray(body.ratios) ? body.ratios.filter(isRatio) : undefined,
    query: body.query ? String(body.query).slice(0, 100) : undefined,
    restore: typeof body.restore === "string" && /^stock\/[a-z0-9][a-z0-9-]*\.[a-z0-9]+$/i.test(body.restore) ? body.restore : undefined,
  });
}

/**
 * Publishing's actions, from the desk page (sameOrigin). Approving is the only way a post is made, and approve and job
 * also take bun run publish's desk token, so an agent can post when asked.
 */
async function publishPost(path: string, body: any, byScript: boolean): Promise<unknown> {
  if (path === "/api/publish/provider") return saveProvider(body.provider, body.values && typeof body.values === "object" ? body.values : {});
  if (path === "/api/publish/provider/remove") return forgetProvider(body.provider), {};
  if (path === "/api/publish/connect") return connectProvider(body.provider);
  if (path === "/api/publish/account/remove") return disconnect(String(body.id ?? "")), {};
  if (path === "/api/publish/approve") return { jobs: await approvePosts(String(body.folder ?? ""), Array.isArray(body.posts) ? body.posts : [], byScript ? "by bun run publish" : undefined) };
  if (path === "/api/publish/job") return actOnPost(String(body.id ?? ""), String(body.action ?? "")), {};
  if (path === "/api/publish/reveal") return reveal(String(body.folder ?? ""), String(body.file ?? ""));
  throw new Error("No such action.");
}

/** An image a storyboard row points at: the queue folder, the repo, public/ or the brand. Only images, only in the repo. */
function storyboardImage(res: ServerResponse, query: URLSearchParams) {
  const path = query.get("path") ?? "";
  const folder = query.get("folder") ?? "";
  const brand = query.get("brand") ?? "";
  const found = IMAGE.test(path)
    ? locate(path, FOLDER.test(folder) ? join(QUEUE, folder) : undefined, NAME.test(brand) ? join(BRANDS, brand) : undefined)
    : undefined;
  if (!found || !resolve(found).startsWith(ROOT + sep)) return send(res, 404, { error: "No such image." });
  return found;
}

/** Connect middleware for the dev server. */
export function deskApi(server: ViteDevServer) {
  // Approved posts go out on time while the desk runs (publish/index.ts). A script's own Vite server (render, stills,
  // validate: middleware mode, no HTTP server) loads this plugin too, and must not take the posting clock.
  if (!server.config.server.middlewareMode) startPublishing();
  // bun run gen in a terminal finds the desk here. The token changes every start, so an old file is harmless.
  server.httpServer?.once("listening", () => {
    const address = server.httpServer!.address();
    if (!address || typeof address === "string") return;
    deskUrl = `http://localhost:${address.port}`;
    mkdirSync(join(ROOT, "out"), { recursive: true });
    writeFileSync(join(ROOT, "out", ".desk.json"), JSON.stringify({ url: deskUrl, token: DESK_TOKEN }), { mode: 0o600 });
  });
  const media = sirv(QUEUE, { dev: true });
  const kits = sirv(BRANDS, { dev: true });
  const files = sirv(ROOT, { dev: true });
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://desk");
    const path = url.pathname;
    if (path.startsWith("/media/")) {
      req.url = (req.url ?? "").slice("/media".length);
      return media(req, res, () => send(res, 404, { error: "No such file." }));
    }
    if (path.startsWith("/brand-files/")) {
      req.url = (req.url ?? "").slice("/brand-files".length);
      return kits(req, res, () => send(res, 404, { error: "No such file." }));
    }
    if (!path.startsWith("/api/")) return next();
    if (req.method === "GET") {
      if (path === "/api/state") return send(res, 200, state());
      if (path === "/api/chat") return send(res, 200, chat(url.searchParams));
      if (path === "/api/registry")
        return void registry(server).then(
          (reply) => send(res, 200, reply),
          (error) => send(res, 200, { ads: [], error: String(error?.message ?? error) }),
        );
      if (path === "/api/settings") return send(res, 200, readSettings());
      if (path === "/api/instructions") return send(res, 200, { files: instructions(url.searchParams.get("brand") ?? undefined) });
      if (path === "/api/instruction") {
        try {
          return send(res, 200, readInstruction(url.searchParams.get("path") ?? "", url.searchParams.get("brand") ?? undefined));
        } catch (error) {
          return send(res, 404, { error: (error as Error).message });
        }
      }
      if (path === "/api/status") return void status(url.searchParams.has("fresh")).then((reply) => send(res, 200, reply));
      if (path === "/api/voices") return void voices().then((reply) => send(res, reply.error ? 502 : 200, reply));
      if (path === "/api/voice") return void lookUpVoice(url.searchParams.get("id") ?? "").then((reply) => send(res, 200, reply));
      if (path === "/api/keys") return send(res, 200, keysState());
      if (path === "/api/keys/test") return void testKey(url.searchParams.get("service")).then((reply) => send(res, 200, reply));
      if (path === "/api/gen") return void genState(url.searchParams.get("slug") ?? "").then((reply) => send(res, reply.error ? 400 : 200, reply));
      if (path === "/api/publish") return send(res, 200, publishState());
      if (path === "/api/publish/login") return send(res, 200, loginOutcome(url.searchParams.get("state") ?? ""));
      if (path === "/api/publish/draft") {
        try {
          return send(res, 200, publishDraft(url.searchParams.get("folder") ?? ""));
        } catch (error) {
          return send(res, 404, { error: (error as Error).message });
        }
      }
      if (path === "/api/publish/options")
        return void optionsFor(url.searchParams.get("account") ?? "").then(
          (options) => send(res, 200, { options }),
          (error) => send(res, 400, { error: String(error?.message ?? error) }),
        );
      if (path === "/api/gen/job") {
        const job = jobOf(url.searchParams.get("id") ?? "");
        return job ? send(res, 200, job) : send(res, 404, { error: "No such job. Did the desk restart?" });
      }
      if (path === "/api/file") {
        const found = storyboardImage(res, url.searchParams);
        if (!found) return;
        req.url = `/${relative(ROOT, found).split(sep).map(encodeURIComponent).join("/")}`;
        return files(req, res, () => send(res, 404, { error: "No such file." }));
      }
      if (path === "/api/source/element") {
        try {
          const texts = url.searchParams.getAll("text").slice(0, 6);
          return send(res, 200, elementAt(url.searchParams.get("loc") ?? "", texts, url.searchParams.get("slug") ?? undefined));
        } catch (error) {
          return send(res, ...sourceFailure(error));
        }
      }
      if (path === "/api/elements") {
        try {
          return send(res, 200, { elements: readyElements(url.searchParams.get("slug") ?? "") });
        } catch (error) {
          return send(res, ...sourceFailure(error));
        }
      }
      if (path === "/api/history") {
        const slug = url.searchParams.get("slug") ?? "";
        if (!NAME.test(slug) || !existsSync(join(ADS, slug))) return send(res, 404, { error: "No such ad." });
        return send(res, 200, historyOf(slug));
      }
      return send(res, 404, { error: "No such thing." });
    }
    if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
    // bun run gen isn't the desk page, so it proves itself with the desk's token instead. A web page can't send that
    // header without the desk's say-so (CORS), and the budget still applies.
    if (path === "/api/gen/run") {
      if (req.headers["x-nykma-token"] !== DESK_TOKEN) return send(res, 403, { error: "Wrong or missing desk token: run bun run gen from this repo while the desk is up." });
      return void readBody(req)
        .then((body) => startShot(String(body.slug ?? ""), String(body.id ?? "")))
        .then((job) => send(res, 200, job))
        .catch((error) => send(res, error instanceof NeedsApproval ? 402 : error instanceof WaitingOnStills ? 409 : 400, { error: String(error?.message ?? error) }));
    }
    // bun run stock proves itself the same way. The keys stay here: it gets results and files, never a key.
    if (path === "/api/stock/search" || path === "/api/stock/take") {
      if (req.headers["x-nykma-token"] !== DESK_TOKEN) return send(res, 403, { error: "Wrong or missing desk token: run bun run stock from this repo while the desk is up." });
      return void readBody(req)
        .then((body) => stock(path, body))
        .then((reply) => send(res, 200, reply))
        .catch((error) => send(res, error instanceof NotConnected ? 409 : 400, { error: String(error?.message ?? error) }));
    }
    // bun run publish posts through the desk too, so an agent the user asked can post: approving and acting on a post.
    // Setting up a provider and connecting stay on the page, since a login is a browser window.
    const byScript = (path === "/api/publish/approve" || path === "/api/publish/job") && req.headers["x-nykma-token"] === DESK_TOKEN;
    if (!byScript && !sameOrigin(req)) return send(res, 403, { error: path.startsWith("/api/publish/") ? "Only the desk page or bun run publish can do this." : "Only the desk page can do this." });
    if (path === "/api/upload") return upload(req, res, url.searchParams);
    if (path === "/api/source/edit" || path === "/api/source/undo" || path === "/api/source/add")
      return void readBody(req)
        .then((body) =>
          send(
            res,
            200,
            path === "/api/source/undo"
              ? undoSource(body.slug ? String(body.slug) : undefined)
              : path === "/api/source/add"
                ? addElement(body as never)
                : editSource(String(body.loc ?? ""), String(body.hash ?? ""), body.edit, body.label),
          ),
        )
        .catch((error) => send(res, ...sourceFailure(error)));
    if (path.startsWith("/api/history/"))
      return void readBody(req)
        .then((body) => send(res, 200, historyPost(path, body)))
        .catch((error) => send(res, typeof error?.status === "number" ? error.status : 400, { error: String(error?.message ?? error) }));
    if (path.startsWith("/api/publish/"))
      return void readBody(req)
        .then((body) => publishPost(path, body, byScript))
        .then((reply) => send(res, 200, reply ?? {}))
        .catch((error) => send(res, 400, { error: String(error?.message ?? error) }));
    readBody(req)
      .then((body) => post(path, body, res))
      .catch((error) => send(res, 400, { error: String(error?.message ?? error) }));
  };
}
