/**
 * Generated media (spec.md §6.6): the shots an ad asks a model to make, what they'd cost, and whether they're made.
 * This file holds no keys and spends nothing, so the agent's `bun run gen --estimate` and the desk share it. The paid
 * calls are in gen-run.ts, which only the desk loads.
 *
 * An ad lists its shots in public/ads/<slug>/gen.json. Each made shot is a file in public/ads/<slug>/generated/, with
 * its record (model, prompt, settings, cost, job id, file hash) in generated/generated.json. A shot is made again only
 * when its request changes: the record keeps the request's hash, as mv.py does for ElevenLabs.
 *
 * Prices come from OpenRouter's public catalogue (no key needed), kept in out/gen-catalog/ for six hours. A still can
 * go through Codex on the ChatGPT login instead (`"via": "codex"`), and a video can be made on this PC (`"via":
 * "local"`, local.ts). Neither costs money.
 *
 * Stills come first: every video needs a first frame, and the desk makes a video only after you approve the stills it
 * starts from (gen-run.ts), so nothing is paid for on a frame you haven't seen.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { findCodex } from "./codex.ts";
import { localModel, localProblems } from "./local.ts";
import { readSettings } from "./settings.ts";

const ROOT = resolve(import.meta.dirname, "../..");
export const API = () => process.env.NYKMA_OPENROUTER_URL ?? "https://openrouter.ai/api/v1";
const CATALOG = join(ROOT, "out", "gen-catalog");
const FRESH_MS = 6 * 3600_000;
const ID = /^[a-z0-9][a-z0-9_-]{0,40}$/i;

export type Via = "openrouter" | "codex" | "local";

export type Shot = {
  id: string;
  kind: "image" | "video";
  /** Who makes it: OpenRouter by default. A still can go through Codex on the ChatGPT login, a video through this PC. */
  via?: Via;
  /** An OpenRouter model id, like google/veo-3.1-fast or google/gemini-nano-banana-2.1. Codex picks its own. Local: ltx-2.5-q4 (or ltx-2.5, the same model at full size and far slower on 16 GB). */
  model: string;
  prompt: string;
  /** Why this shot can't be built in code, Blender or real footage. Required: generation is the exception. */
  why: string;
  aspect_ratio?: string; // "16:9", "1:1", "9:16"
  resolution?: string; // video "720p" / "1080p"; image "1K" / "2K"
  seed?: number;
  /** Reference images, as paths under public/ads/<slug>/ (a made shot is generated/<id>.png). */
  refs?: string[];
  // Video only
  seconds?: number;
  first?: string;
  last?: string;
  /** Off by default: nykma makes its own sound. */
  audio?: boolean;
  // Image only
  quality?: string;
  background?: "auto" | "transparent" | "opaque";
  output_format?: "png" | "jpeg" | "webp" | "svg";
};

export type Made = {
  kind: Shot["kind"];
  model: string;
  prompt: string;
  why: string;
  settings: Record<string, unknown>;
  file: string; // from public/ads/<slug>/
  sha256: string;
  request: string; // the request's hash
  job?: string;
  costUsd: number;
  estimateUsd: number;
  made: string; // ISO date
  via: Via;
  terms: string;
  /** Codex rewrites the prompt before it draws: what it drew from. */
  revisedPrompt?: string;
  /** A Codex still cropped to the shot's aspect ratio, since Codex draws only a few fixed sizes: from what size. */
  cropped?: string;
  /** For a video: the unpacked frames, as `bun run footage` prints them. */
  footage?: { src: string; fps: number; frames: number; sound?: string; sheet: string };
};

export type Estimate = { usd: number; basis: string } | { error: string };
export type ShotState = Shot & { estimate: Estimate; made?: Made; current: boolean; problems: string[] };

export const adDir = (slug: string) => join(ROOT, "public", "ads", slug);
export const genDir = (slug: string) => join(adDir(slug), "generated");
const recordPath = (slug: string) => join(genDir(slug), "generated.json");

/* ── The spec ──────────────────────────────────────────────────────────────────────────────────────── */

export function readSpec(slug: string): Shot[] {
  const path = join(adDir(slug), "gen.json");
  if (!existsSync(path)) return [];
  let raw: any;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`public/ads/${slug}/gen.json isn't valid JSON: ${(error as Error).message}`);
  }
  const shots: Shot[] = Array.isArray(raw?.shots) ? raw.shots : [];
  const seen = new Set<string>();
  for (const shot of shots) {
    if (!shot || typeof shot.id !== "string" || !ID.test(shot.id)) throw new Error(`gen.json: every shot needs an "id" of letters, numbers, - and _.`);
    if (seen.has(shot.id)) throw new Error(`gen.json: two shots are called "${shot.id}".`);
    seen.add(shot.id);
    if (shot.kind !== "image" && shot.kind !== "video") throw new Error(`gen.json: "${shot.id}" needs "kind": "image" or "video".`);
    if (shot.via !== undefined && shot.via !== "openrouter" && shot.via !== "codex" && shot.via !== "local") throw new Error(`gen.json: "${shot.id}" has "via": "${shot.via}". It's "openrouter", "codex" or "local".`);
    if (shot.kind === "image" && shot.via === "local") throw new Error(`gen.json: still "${shot.id}" can't be made on this PC, which makes video only. Leave out "via", or use "codex".`);
    if (shot.kind === "video" && shot.via === "codex") throw new Error(`gen.json: video "${shot.id}" can't go through Codex, which makes stills only. Leave out "via".`);
    if (shot.via === "codex") shot.model = "codex";
    for (const field of ["model", "prompt", "why"] as const)
      if (typeof shot[field] !== "string" || !shot[field].trim()) throw new Error(`gen.json: "${shot.id}" needs a "${field}".`);
    if (shot.kind === "video" && !(Number.isInteger(shot.seconds) && shot.seconds! > 0)) throw new Error(`gen.json: video "${shot.id}" needs whole "seconds".`);
  }
  return shots;
}

export function readMade(slug: string): Record<string, Made> {
  try {
    return JSON.parse(readFileSync(recordPath(slug), "utf8"));
  } catch {
    return {};
  }
}

export function writeMade(slug: string, made: Record<string, Made>) {
  mkdirSync(genDir(slug), { recursive: true });
  writeFileSync(recordPath(slug), `${JSON.stringify(made, null, 2)}\n`);
}

/** A path from the ad's folder, only inside it. */
export function inAd(slug: string, path: string) {
  const full = resolve(adDir(slug), path);
  if (!full.startsWith(adDir(slug) + sep)) throw new Error(`"${path}" is outside public/ads/${slug}/.`);
  return full;
}

export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** The images a shot sends: first and last frames, then references. */
export function inputsOf(shot: Shot) {
  return [
    ...(shot.first ? [{ role: "first_frame" as const, path: shot.first }] : []),
    ...(shot.last ? [{ role: "last_frame" as const, path: shot.last }] : []),
    ...(shot.refs ?? []).map((path) => ({ role: "reference" as const, path })),
  ];
}

/**
 * An input image's file. `generated/<id>.png` also finds `generated/<id>.jpg`, since a model picks its own format and
 * the shot that names an earlier one's file is written before that file exists.
 */
export function inputFile(slug: string, path: string) {
  const full = inAd(slug, path);
  if (existsSync(full)) return full;
  const made = /^generated\/([^/]+)\.[a-z]+$/i.exec(path.replace(/\\/g, "/"));
  const record = made ? readMade(slug)[made[1]] : undefined;
  return record ? inAd(slug, record.file) : full;
}

/** The id of the still in gen.json that an input path names (`generated/<id>.png`), if it names one. */
export function stillOf(shots: Shot[], path: string): string | undefined {
  const name = path.replace(/\\/g, "/");
  return shots.find((other) => other.kind === "image" && name.startsWith(`generated/${other.id}.`))?.id;
}

/**
 * What the request would be, without the images' bytes: the settings, and each image by its hash. `via` is in it only
 * for Codex and this PC, so shots made through OpenRouter before they existed keep their hash.
 */
export function settingsOf(shot: Shot): Record<string, unknown> {
  const common = { via: shot.via === "codex" || shot.via === "local" ? shot.via : undefined, aspect_ratio: shot.aspect_ratio, resolution: shot.resolution, seed: shot.seed };
  const own =
    shot.kind === "video"
      ? { seconds: shot.seconds, audio: Boolean(shot.audio), first: shot.first, last: shot.last, refs: shot.refs }
      : { quality: shot.quality, background: shot.background, output_format: shot.output_format, refs: shot.refs };
  return Object.fromEntries(Object.entries({ ...common, ...own }).filter(([, value]) => value !== undefined));
}

/** The hash a made shot is kept under. Undefined while an input image doesn't exist yet (made by an earlier shot). */
export function requestHash(slug: string, shot: Shot): string | undefined {
  const images: Record<string, string> = {};
  for (const input of inputsOf(shot)) {
    const path = inputFile(slug, input.path);
    if (!existsSync(path)) return undefined;
    images[input.path] = sha256(readFileSync(path));
  }
  return sha256(JSON.stringify({ kind: shot.kind, model: shot.model, prompt: shot.prompt, settings: settingsOf(shot), images }));
}

export const extFor = (shot: Shot, mediaType?: string) =>
  shot.kind === "video" ? ".mp4" : mediaType?.includes("svg") ? ".svg" : mediaType?.includes("jpeg") ? ".jpg" : mediaType?.includes("webp") ? ".webp" : `.${shot.output_format === "jpeg" ? "jpg" : (shot.output_format ?? "png")}`;

/* ── The catalogue ─────────────────────────────────────────────────────────────────────────────────── */

async function cached(name: string, url: string): Promise<any> {
  mkdirSync(CATALOG, { recursive: true });
  const file = join(CATALOG, `${name.replace(/[^a-z0-9.-]+/gi, "_")}.json`);
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < FRESH_MS) return JSON.parse(readFileSync(file, "utf8"));
  const res = await fetch(url);
  if (!res.ok) {
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")); // stale beats nothing
    throw new Error(`OpenRouter's catalogue didn't load (${res.status}).`);
  }
  const data = await res.json();
  writeFileSync(file, JSON.stringify(data));
  return data;
}

export type VideoModel = {
  id: string;
  supported_resolutions: string[] | null;
  supported_aspect_ratios: string[] | null;
  supported_durations: number[] | null;
  supported_frame_images: string[] | null;
  generate_audio: boolean;
  seed: boolean;
  pricing_skus: Record<string, string>;
};
export type ImageEndpoint = {
  provider_slug: string;
  supported_parameters: Record<string, { type: string; values?: string[]; min?: number; max?: number }>;
  pricing: { billable: string; unit: string; cost_usd: number; variant?: string }[];
};

export async function videoModels(): Promise<VideoModel[]> {
  return (await cached("videos", `${API()}/videos/models`)).data;
}

export async function imageEndpoints(model: string): Promise<ImageEndpoint[]> {
  return (await cached(`image-${model}`, `${API()}/images/models/${model}/endpoints`)).endpoints ?? [];
}

/* ── Prices ────────────────────────────────────────────────────────────────────────────────────────── */

const SHORT_SIDE: Record<string, number> = { "360p": 360, "480p": 480, "720p": 720, "768p": 768, "1080p": 1080, "1k": 1024, "1.5k": 1536, "2k": 2048, "4k": 3840, "768": 768 };

/** Rough pixels for a resolution and aspect ratio, for prices by token or megapixel. */
function pixels(resolution = "1080p", aspect = "16:9") {
  const short = SHORT_SIDE[resolution.toLowerCase()] ?? 1080;
  const [w, h] = aspect.split(":").map(Number);
  const ratio = w && h ? Math.max(w, h) / Math.min(w, h) : 16 / 9;
  return short * short * ratio;
}

/** Dollars for a video shot, from the model's price list. Keys differ by model, so the most specific match wins. */
export function videoPrice(model: VideoModel, shot: Shot): Estimate {
  const skus = model.pricing_skus ?? {};
  const res = (shot.resolution ?? "").toLowerCase();
  const audio = Boolean(shot.audio);
  const i2v = Boolean(shot.first || shot.last);
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      if (res && skus[`${key}_${res}`] !== undefined) return { key: `${key}_${res}`, value: Number(skus[`${key}_${res}`]) };
      if (skus[key] !== undefined) return { key, value: Number(skus[key]) };
    }
    return undefined;
  };
  const seconds = shot.seconds ?? 0;
  let perSecond: number | undefined;
  let basis = "";
  const dollars = pick(audio ? "duration_seconds_with_audio" : "duration_seconds_without_audio", i2v ? "image_to_video_duration_seconds" : "text_to_video_duration_seconds", "duration_seconds");
  const cents = pick("cents_per_video_output_second", "cents_per_second_output");
  const tokens = pick(audio ? "video_tokens" : "video_tokens_without_audio", "video_tokens");
  if (dollars) [perSecond, basis] = [dollars.value, `${dollars.key}: $${dollars.value}/s`];
  else if (cents) [perSecond, basis] = [cents.value / 100, `${cents.key}: ${cents.value}¢/s`];
  else if (tokens) {
    // Seedance bills video tokens: width × height × fps × seconds / 1024, at 24 fps. Approximate, so it's marked.
    const perSec = (pixels(shot.resolution ?? "720p", shot.aspect_ratio) * 24) / 1024;
    [perSecond, basis] = [perSec * tokens.value, `${tokens.key}: ~${Math.round(perSec)} tokens/s (approximate)`];
  }
  if (perSecond === undefined || !Number.isFinite(perSecond)) return { error: `no price in the catalogue for ${model.id} with these settings` };
  let usd = perSecond * seconds;
  const refs = (shot.refs?.length ?? 0) + (i2v ? 1 : 0);
  if (skus.cents_per_image_input && refs) usd += (Number(skus.cents_per_image_input) / 100) * refs;
  const refPrice = skus.reference_images ?? skus.reference_input_images;
  if (refPrice && shot.refs?.length) usd += Number(refPrice) * shot.refs.length;
  if (skus.minimum_cents_per_generation) usd = Math.max(usd, Number(skus.minimum_cents_per_generation) / 100);
  return { usd, basis: `${seconds} s × ${basis}` };
}

/**
 * Output tokens per image for models billed by the token, from the vendors' published per-image prices. A model not
 * listed gets a ceiling, marked as one, and the real cost comes back with the image.
 */
const TOKENS_PER_IMAGE: [RegExp, Record<string, number>][] = [
  [/gemini-3-pro-image/, { "1k": 1120, "2k": 1120, "4k": 2000 }],
  [/gemini.*(nano-banana|flash.*image)/, { "1k": 1120, "2k": 1680, "4k": 3780 }],
  [/gpt-image|gpt-5.*image/, { low: 400, medium: 1600, high: 6300, auto: 6300 }],
];

export function imagePrice(endpoint: ImageEndpoint, shot: Shot, model: string): Estimate {
  const outputs = endpoint.pricing.filter((price) => price.billable === "output_image");
  if (!outputs.length) return { error: `no image price in the catalogue for ${model}` };
  const res = (shot.resolution ?? "").toLowerCase();
  const unit = outputs[0].unit;
  let usd: number;
  let basis: string;
  if (unit === "image") {
    const exact = outputs.find((price) => price.variant?.toLowerCase() === res) ?? outputs.find((price) => !price.variant);
    const price = exact ?? outputs.reduce((a, b) => (b.cost_usd > a.cost_usd ? b : a)); // unknown size: the dearest
    [usd, basis] = [price.cost_usd, `$${price.cost_usd}/image${price.variant ? ` at ${price.variant}` : ""}${exact ? "" : " (the dearest size)"}`];
  } else if (unit === "megapixel") {
    const mp = pixels(shot.resolution ?? "1k", shot.aspect_ratio ?? "1:1") / 1e6;
    [usd, basis] = [outputs[0].cost_usd * mp, `${mp.toFixed(2)} MP × $${outputs[0].cost_usd}/MP`];
  } else if (unit === "token") {
    const table = TOKENS_PER_IMAGE.find(([pattern]) => pattern.test(model))?.[1];
    const key = table && (table[res] !== undefined ? res : table[(shot.quality ?? "").toLowerCase()] !== undefined ? (shot.quality ?? "").toLowerCase() : undefined);
    const count = key ? table![key] : Math.max(8000, ...Object.values(table ?? {}));
    [usd, basis] = [outputs[0].cost_usd * count, `~${count} tokens × $${outputs[0].cost_usd}${key ? "" : " (a ceiling)"}`];
    const input = endpoint.pricing.find((price) => price.billable === "input_image" && price.unit === "token");
    if (input && shot.refs?.length) usd += input.cost_usd * 1600 * shot.refs.length;
  } else return { error: `${model} is priced per ${unit}, which nykma can't estimate` };
  return { usd, basis };
}

/** Whether the model takes these settings, from the catalogue: problems the agent can fix before anything is spent. */
export function videoProblems(model: VideoModel, shot: Shot): string[] {
  const problems: string[] = [];
  const has = (list: unknown[] | null, value: unknown, what: string) => {
    if (value !== undefined && list && !list.includes(value)) problems.push(`${what} ${value} isn't one of ${list.join(", ")}`);
  };
  has(model.supported_durations, shot.seconds, "seconds");
  has(model.supported_resolutions, shot.resolution, "resolution");
  has(model.supported_aspect_ratios, shot.aspect_ratio, "aspect_ratio");
  if (shot.first && model.supported_frame_images && !model.supported_frame_images.includes("first_frame")) problems.push("it takes no first frame");
  if (shot.last && model.supported_frame_images && !model.supported_frame_images.includes("last_frame")) problems.push("it takes no last frame");
  if (shot.audio && !model.generate_audio) problems.push("it makes no audio");
  return problems;
}

export function imageProblems(endpoint: ImageEndpoint, shot: Shot): string[] {
  const problems: string[] = [];
  const params = endpoint.supported_parameters ?? {};
  const check = (name: string, value: unknown) => {
    const allowed = params[name]?.values;
    if (value !== undefined && allowed && !allowed.includes(String(value))) problems.push(`${name} ${value} isn't one of ${allowed.join(", ")}`);
  };
  check("aspect_ratio", shot.aspect_ratio);
  check("resolution", shot.resolution);
  check("background", shot.background);
  check("quality", shot.quality);
  check("output_format", shot.output_format);
  const max = params.input_references?.max;
  if (shot.refs?.length && max !== undefined && shot.refs.length > max) problems.push(`it takes up to ${max} reference images`);
  if (shot.refs?.length && max === undefined) problems.push("it takes no reference images");
  return problems;
}

/** Every shot with its estimate, whether it's made for its current request, and anything the model won't take. */
export async function stateOf(slug: string): Promise<ShotState[]> {
  const shots = readSpec(slug);
  const made = readMade(slug);
  const videos = shots.some((shot) => shot.kind === "video" && shot.via !== "local") ? await videoModels() : [];
  const out: ShotState[] = [];
  for (const shot of shots) {
    const problems: string[] = [];
    let estimate: Estimate;
    if (shot.kind === "video" && shot.via === "local") {
      const model = localModel(shot.model);
      estimate = { usd: 0, basis: `no money: ${model?.name ?? shot.model} on this PC, ${model ? `about ${model.minutes} min of its GPU per 6 s at 720p` : "minutes of its GPU"}` };
      problems.push(...localProblems(shot));
    } else if (shot.kind === "video") {
      const model = videos.find((item) => item.id === shot.model);
      if (!model) estimate = { error: `${shot.model} isn't in OpenRouter's video catalogue` };
      else {
        problems.push(...videoProblems(model, shot));
        estimate = videoPrice(model, shot);
      }
    } else if (shot.via === "codex") {
      estimate = { usd: 0, basis: "no money: Codex, on the ChatGPT plan's image limit" };
      problems.push(...codexProblems(shot));
    } else {
      const endpoints = await imageEndpoints(shot.model).catch(() => []);
      if (!endpoints.length) estimate = { error: `${shot.model} isn't in OpenRouter's image catalogue` };
      else {
        problems.push(...imageProblems(endpoints[0], shot));
        estimate = imagePrice(endpoints[0], shot, shot.model);
      }
    }
    if (shot.kind === "video" && !shot.first)
      problems.push(`it has no first frame. Make a still first and give it as "first", so the user sees the frame before the video is paid for`);
    for (const input of inputsOf(shot)) {
      try {
        const path = inputFile(slug, input.path);
        const fromShot = stillOf(shots, input.path);
        if (!existsSync(path) && !fromShot) problems.push(`${input.path} doesn't exist`);
        if (!/\.(png|jpe?g|webp)$/i.test(extname(path))) problems.push(`${input.path} isn't a PNG, JPEG or WebP`);
      } catch (error) {
        problems.push((error as Error).message);
      }
    }
    const hash = requestHash(slug, shot);
    const record = made[shot.id];
    const current = Boolean(record && hash && record.request === hash && existsSync(join(adDir(slug), record.file)));
    out.push({ ...shot, estimate, made: record, current, problems });
  }
  return out;
}

/** What Codex can't do with a still's settings. It picks its own size and model, so those are left to it. */
function codexProblems(shot: Shot): string[] {
  const problems: string[] = [];
  if (!findCodex(readSettings().codex.bin)) problems.push("Codex isn't installed, or its path in Settings is wrong");
  if (shot.output_format === "svg") problems.push("Codex makes no SVG");
  if (shot.refs && shot.refs.length > 10) problems.push("Codex takes up to 10 reference images");
  return problems;
}

export const money = (usd: number) => `$${usd < 1 ? usd.toFixed(3) : usd.toFixed(2)}`;

/** What making everything not made yet would cost, or only the stills or videos. Undefined if any shot has no price. */
export function totalToMake(states: ShotState[], kind?: Shot["kind"]): number | undefined {
  let total = 0;
  for (const state of states) {
    if (state.current || (kind && state.kind !== kind)) continue;
    if ("error" in state.estimate) return undefined;
    total += state.estimate.usd;
  }
  return total;
}
