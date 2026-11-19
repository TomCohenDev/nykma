/**
 * The paid half of generated media (spec.md §6.6). Only the desk loads this: it holds the OpenRouter key, checks each
 * shot against the budget you approved for the ad, makes the call, downloads the result, and records what it cost.
 *
 * - The budget per ad is what you approved on the desk, in gen-budgets.json in the key store's folder (keys.ts),
 *   outside the repo. The ledger, gen-spend.jsonl, is there too. A job is written to it when it's sent, at its
 *   estimate, and again when it's done, at its real cost, so a desk that dies mid-job still counts it.
 * - A shot runs only if the approved budget, less what's spent and what's running, covers its estimate.
 * - Stills first. A still goes through OpenRouter or Codex (codex.ts, on the ChatGPT login, no money). A video is made
 *   only from the desk page, after you approve each still it starts from. Approvals are in gen-frames.json, next to the
 *   budgets, and hold the still's file hash, so a retake needs approving again. `bun run gen` makes stills only.
 * - A made video is unpacked like real footage (footage.ts), so the ad plays it with <Footage>.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { CODEX_TERMS, codexImage, findCodex } from "./codex.ts";
import { unpack } from "./footage.ts";
import { API, adDir, extFor, genDir, inputFile, inputsOf, money, readMade, requestHash, sha256, stateOf, settingsOf, stillOf, writeMade, type Made, type Shot, type ShotState } from "./gen.ts";
import { ensureHome, home, readKey } from "./keys.ts";
import { localModel, makeLocal, withoutSound } from "./local.ts";
import { readSettings } from "./settings.ts";

const budgetsFile = () => join(home(), "gen-budgets.json");
const ledgerFile = () => join(home(), "gen-spend.jsonl");
const reviewsFile = () => join(home(), "gen-frames.json");
const POLL_MS = Number(process.env.NYKMA_GEN_POLL_MS ?? 10_000);
const VIDEO_TIMEOUT_MS = 25 * 60_000;
const TERMS = "https://openrouter.ai/terms";

type Entry = { at: string; slug: string; shot: string; job: string; model: string; status: "sent" | "done" | "failed"; usd: number };

export function budgets(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(budgetsFile(), "utf8"));
  } catch {
    return {};
  }
}

/** Sets the ad's approved total, in dollars. Only the desk page calls this, when you press Approve. */
export function approve(slug: string, usd: number) {
  if (!Number.isFinite(usd) || usd < 0 || usd > 500) throw new Error("An approval is between $0 and $500.");
  ensureHome();
  const all = budgets();
  all[slug] = Math.round(usd * 100) / 100;
  writeFileSync(budgetsFile(), `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
}

function ledger(): Entry[] {
  if (!existsSync(ledgerFile())) return [];
  return readFileSync(ledgerFile(), "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Entry];
      } catch {
        return [];
      }
    });
}

function record(entry: Omit<Entry, "at">) {
  ensureHome();
  appendFileSync(ledgerFile(), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, { mode: 0o600 });
}

/** Spent on an ad: each job's last line. A job sent and never finished counts at its estimate. */
export function spent(slug: string): number {
  const last = new Map<string, Entry>();
  for (const entry of ledger()) if (entry.slug === slug) last.set(entry.job, entry);
  return [...last.values()].reduce((sum, entry) => sum + entry.usd, 0);
}

export type Job = { id: string; slug: string; shot: string; model: string; status: "running" | "done" | "failed"; message: string; estimate: number; cost?: number; file?: string; started: number };
const jobs = new Map<string, Job>();
export const jobOf = (id: string) => jobs.get(id);
export const jobsOf = (slug: string) => [...jobs.values()].filter((job) => job.slug === slug);
const reserved = (slug: string) => jobsOf(slug).filter((job) => job.status === "running").reduce((sum, job) => sum + job.estimate, 0);

export class NeedsApproval extends Error {}
/** A video asked for before its stills are approved, or by `bun run gen`, which makes stills only. */
export class WaitingOnStills extends Error {}

/* ── Approving the stills ──────────────────────────────────────────────────────────────────────────── */

export type Review = { sha256: string; verdict: "approved" | "retake"; note?: string; at: string };

function allReviews(): Record<string, Record<string, Review>> {
  try {
    return JSON.parse(readFileSync(reviewsFile(), "utf8"));
  } catch {
    return {};
  }
}

/** Your verdicts on an ad's stills, each still only while its file is the one you saw. */
export function reviewsOf(slug: string, states: ShotState[]): Record<string, Review> {
  const saved = allReviews()[slug] ?? {};
  const out: Record<string, Review> = {};
  for (const state of states) {
    const review = saved[state.id];
    if (state.kind === "image" && state.current && review && review.sha256 === state.made!.sha256) out[state.id] = review;
  }
  return out;
}

/** Approve a still, or ask for a retake with a note. Only the desk page calls this. */
export async function reviewStill(slug: string, id: string, verdict: Review["verdict"], note = "") {
  const state = (await stateOf(slug)).find((shot) => shot.id === id);
  if (!state || state.kind !== "image") throw new Error(`gen.json has no still "${id}".`);
  if (!state.current) throw new Error(`"${id}" isn't made for its current prompt yet.`);
  ensureHome();
  const all = allReviews();
  all[slug] = { ...(all[slug] ?? {}), [id]: { sha256: state.made!.sha256, verdict, note: note.trim().slice(0, 2000) || undefined, at: new Date().toISOString() } };
  writeFileSync(reviewsFile(), `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
}

/** The stills a video starts from (its first and last frames and references) that aren't made and approved yet. */
export function stillsWaiting(slug: string, video: ShotState, states: ShotState[]): string[] {
  const reviews = reviewsOf(slug, states);
  return inputsOf(video)
    .map((input) => stillOf(states, input.path))
    .filter((id): id is string => Boolean(id) && reviews[id!]?.verdict !== "approved");
}

/* ── Making a shot ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * Starts making one shot, or says it's already made. Refuses, spending nothing, if the shot has a problem, has no
 * price, or doesn't fit in what's left of the approved budget. A video starts only from the desk page (`from: "desk"`),
 * and only once the stills it starts from are approved.
 */
export async function startShot(slug: string, id: string, from: "agent" | "desk" = "agent"): Promise<Job> {
  const running = jobsOf(slug).find((job) => job.shot === id && job.status === "running");
  if (running) return running;
  const states = await stateOf(slug);
  const state = states.find((shot) => shot.id === id);
  if (!state) throw new Error(`gen.json has no shot "${id}".`);
  if (state.problems.length) throw new Error(`"${id}" can't be made as written: ${state.problems.join("; ")}.`);
  if ("error" in state.estimate) throw new Error(`"${id}" has ${state.estimate.error}, so it can't be checked against the budget.`);
  const hash = requestHash(slug, state);
  if (!hash) throw new Error(`"${id}" needs an image that isn't made yet: make the shots it uses first.`);
  if (state.current) return { id: randomUUID(), slug, shot: id, model: state.model, status: "done", message: "Already made, nothing spent", estimate: 0, cost: 0, file: state.made!.file, started: Date.now() };
  if (state.kind === "video") {
    const waiting = stillsWaiting(slug, state, states);
    if (from === "agent")
      throw new WaitingOnStills(
        `Videos are made from the desk, after the user approves the stills they start from${waiting.length ? ` (waiting on ${waiting.join(", ")})` : ""}. Tell the user the stills are ready in the Generated media panel, and stop.`,
      );
    if (waiting.length) throw new WaitingOnStills(`"${id}" starts from ${waiting.join(", ")}, which ${waiting.length === 1 ? "isn't" : "aren't"} approved yet.`);
  }

  const estimate = state.estimate.usd;
  const left = (budgets()[slug] ?? 0) - spent(slug) - reserved(slug);
  // A Codex still costs no money, so the budget doesn't hold it up, even when real costs ran past the approval.
  if (estimate > 0 && estimate > left + 1e-9)
    throw new NeedsApproval(`"${id}" would cost about ${money(estimate)}, and ${money(Math.max(0, left))} of this ad's approved budget is left. Approve more on the desk first.`);
  const codex = state.via === "codex" ? findCodex(readSettings().codex.bin) : undefined;
  const local = state.via === "local";
  const key = state.via === "codex" || local ? "" : readKey("openrouter");
  if (state.via === "codex" && !codex) throw new Error("Codex isn't installed, or its path in Settings is wrong.");
  if (state.via !== "codex" && !local && !key) throw new Error("OpenRouter isn't connected. Add its key in the desk's Settings.");

  const job: Job = { id: randomUUID(), slug, shot: id, model: state.model, status: "running", message: "Sending", estimate, started: Date.now() };
  jobs.set(job.id, job);
  (codex ? makeWithCodex(job, state, hash, codex) : local ? makeOnThisPC(job, state, hash) : make(job, state, hash, key!)).catch((error) => {
    job.status = "failed";
    job.message = key ? String(error?.message ?? error).replace(key, "[key]") : String(error?.message ?? error);
  });
  return job;
}

/**
 * Every video not made yet, from the desk page once you've approved their stills. `usd`, if given, is the ad's new
 * approved total, set first, so approving the videos' cost and starting them is one press.
 */
export async function startVideos(slug: string, usd?: number): Promise<Job[]> {
  const states = await stateOf(slug);
  const videos = states.filter((state) => state.kind === "video" && !state.current);
  if (!videos.length) throw new Error("Every video is made already.");
  // Everything that would stop a video is checked before the approval changes, so a refusal leaves the budget alone.
  for (const video of videos) {
    const waiting = stillsWaiting(slug, video, states);
    if (waiting.length) throw new WaitingOnStills(`"${video.id}" starts from ${waiting.join(", ")}, which ${waiting.length === 1 ? "isn't" : "aren't"} approved yet.`);
    if (video.problems.length) throw new Error(`"${video.id}" can't be made as written: ${video.problems.join("; ")}.`);
    if ("error" in video.estimate) throw new Error(`"${video.id}" has ${video.estimate.error}.`);
  }
  if (videos.some((video) => video.via !== "local") && !readKey("openrouter")) throw new Error("OpenRouter isn't connected. Add its key in the desk's Settings.");
  const cost = videos.reduce((sum, video) => sum + ("error" in video.estimate ? 0 : video.estimate.usd), 0);
  const left = (usd ?? budgets()[slug] ?? 0) - spent(slug) - reserved(slug);
  if (cost > left + 1e-9) throw new NeedsApproval(`The videos would cost about ${money(cost)}, and ${money(Math.max(0, left))} would be left of the approval.`);
  if (usd !== undefined) approve(slug, usd);
  const started: Job[] = [];
  for (const video of videos) started.push(await startShot(slug, video.id, "desk"));
  return started;
}

/** Codex draws a few fixed sizes, so a still for 9:16 or 16:9 is cropped to it from the centre, as a PNG. */
async function cropTo(bytes: Buffer, ext: string, aspect?: string): Promise<{ bytes: Buffer; ext: string; from?: string }> {
  const [w, h] = (aspect ?? "").split(":").map(Number);
  if (!w || !h) return { bytes, ext };
  const dir = mkdtempSync(join(tmpdir(), "nykma-crop-"));
  const run = (bin: string, args: string[]) =>
    new Promise<string>((done, fail) => execFile(bin, args, { timeout: 60_000 }, (error, stdout, stderr) => (error ? fail(new Error(`${bin}: ${stderr || error.message}`)) : done(String(stdout)))));
  try {
    const input = join(dir, `in.${ext}`);
    writeFileSync(input, bytes);
    const [iw, ih] = (await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", input])).trim().split("x").map(Number);
    if (!iw || !ih || Math.abs(iw / ih - w / h) / (w / h) < 0.01) return { bytes, ext };
    const cw = Math.min(iw, Math.round((ih * w) / h / 2) * 2);
    const ch = Math.min(ih, Math.round((iw * h) / w / 2) * 2);
    const output = join(dir, "out.png");
    await run("ffmpeg", ["-v", "error", "-y", "-i", input, "-vf", `crop=${cw}:${ch}`, "-frames:v", "1", output]);
    return { bytes: readFileSync(output), ext: "png", from: `${iw}x${ih} to ${cw}x${ch}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function makeWithCodex(job: Job, shot: Shot, hash: string, bin: string) {
  const slug = job.slug;
  const refs = inputsOf(shot).map((input) => inputFile(slug, input.path));
  const drawn = await codexImage(bin, { prompt: shot.prompt, aspect_ratio: shot.aspect_ratio, background: shot.background, refs }, (message) => (job.message = message));
  const { bytes, ext, from } = await cropTo(drawn.bytes, drawn.ext, shot.aspect_ratio);
  const file = join(genDir(slug), `${shot.id}.${ext}`);
  mkdirSync(genDir(slug), { recursive: true });
  writeFileSync(file, bytes);
  const fromAd = relative(adDir(slug), file).split(sep).join("/");
  const all = readMade(slug);
  all[shot.id] = {
    kind: "image",
    model: "codex",
    prompt: shot.prompt,
    why: shot.why,
    settings: settingsOf(shot),
    file: fromAd,
    sha256: sha256(bytes),
    request: hash,
    job: drawn.generationId,
    costUsd: 0,
    estimateUsd: 0,
    made: new Date().toISOString(),
    via: "codex",
    terms: CODEX_TERMS,
    revisedPrompt: drawn.revisedPrompt,
    cropped: from,
  };
  writeMade(slug, all);
  job.status = "done";
  job.cost = 0;
  job.file = fromAd;
  job.message = `Made through Codex, on the ChatGPT plan${from ? `, cropped ${from}` : ""}`;
}

/**
 * A video made on this PC (local.ts): no money, so nothing goes in the ledger. The seed is the shot's own, or one
 * taken from the request's hash, so the same request makes the same clip and the record says which seed made it.
 */
async function makeOnThisPC(job: Job, shot: Shot, hash: string) {
  const slug = job.slug;
  const model = localModel(shot.model)!;
  const seed = shot.seed ?? parseInt(hash.slice(0, 12), 16);
  const first = inputsOf(shot).find((input) => input.role === "first_frame");
  const result = await makeLocal(
    { model: shot.model, prompt: shot.prompt, first: first ? inputFile(slug, first.path) : undefined, seconds: shot.seconds!, aspect_ratio: shot.aspect_ratio, resolution: shot.resolution, seed, name: `${slug}-${shot.id}` },
    (message) => (job.message = message),
  );
  const bytes = shot.audio ? result.bytes : await withoutSound(result.bytes, join(home(), "tmp"));
  const file = join(genDir(slug), `${shot.id}.mp4`);
  mkdirSync(genDir(slug), { recursive: true });
  writeFileSync(file, bytes);
  const fromAd = relative(adDir(slug), file).split(sep).join("/");
  const made: Made = {
    kind: "video",
    model: shot.model,
    prompt: shot.prompt,
    why: shot.why,
    settings: { ...settingsOf(shot), seed },
    file: fromAd,
    sha256: sha256(bytes),
    request: hash,
    job: result.promptId,
    costUsd: 0,
    estimateUsd: 0,
    made: new Date().toISOString(),
    via: "local",
    terms: model.licence,
  };
  job.message = "Unpacking to frames";
  const meta = await unpack(slug, file);
  made.footage = { src: meta.src, fps: meta.fps, frames: meta.frames, sound: meta.sound, sheet: meta.sheet.path };
  const all = readMade(slug);
  all[shot.id] = made;
  writeMade(slug, all);
  job.status = "done";
  job.cost = 0;
  job.file = fromAd;
  job.message = `Made on this PC in ${Math.floor(result.seconds / 60)} min ${result.seconds % 60} s`;
}

const dataUrl = (path: string) => {
  const ext = path.toLowerCase().split(".").pop();
  const type = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  return `data:${type};base64,${readFileSync(path).toString("base64")}`;
};

async function call(key: string, path: string, init: RequestInit = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${API()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 300);
    try {
      detail = JSON.parse(text)?.error?.message ?? detail;
    } catch {}
    throw new Error(`OpenRouter answered ${res.status}: ${detail}`);
  }
  return res;
}

async function make(job: Job, shot: Shot, hash: string, key: string) {
  const slug = job.slug;
  const inputs = inputsOf(shot).map((input) => ({ ...input, url: dataUrl(inputFile(slug, input.path)) }));
  let bytes: Buffer;
  let mediaType: string | undefined;
  let cost: number | undefined;
  let remote = "";

  if (shot.kind === "image") {
    job.message = "Making the image";
    remote = `img-${job.id}`;
    record({ slug, shot: shot.id, job: remote, model: shot.model, status: "sent", usd: job.estimate });
    const body = {
      model: shot.model,
      prompt: shot.prompt,
      n: 1,
      aspect_ratio: shot.aspect_ratio,
      resolution: shot.resolution,
      quality: shot.quality,
      background: shot.background,
      output_format: shot.output_format,
      seed: shot.seed,
      input_references: inputs.length ? inputs.map((input) => ({ type: "image_url", image_url: { url: input.url } })) : undefined,
    };
    let reply: any;
    try {
      reply = await (await call(key, "/images", { method: "POST", body: JSON.stringify(body) })).json();
    } catch (error) {
      // Images are all or nothing: a failed one isn't billed.
      record({ slug, shot: shot.id, job: remote, model: shot.model, status: "failed", usd: 0 });
      throw error;
    }
    const image = reply?.data?.[0];
    if (!image?.b64_json) {
      record({ slug, shot: shot.id, job: remote, model: shot.model, status: "failed", usd: Number(reply?.usage?.cost ?? 0) });
      throw new Error("OpenRouter sent no image back.");
    }
    bytes = Buffer.from(image.b64_json, "base64");
    mediaType = image.media_type;
    cost = reply?.usage?.cost ?? undefined;
  } else {
    job.message = "Sending the video job";
    const body = {
      model: shot.model,
      prompt: shot.prompt,
      duration: shot.seconds,
      resolution: shot.resolution,
      aspect_ratio: shot.aspect_ratio,
      generate_audio: Boolean(shot.audio),
      seed: shot.seed,
      frame_images: inputs.filter((input) => input.role !== "reference").map((input) => ({ type: "image_url", image_url: { url: input.url }, frame_type: input.role })),
      input_references: inputs.filter((input) => input.role === "reference").map((input) => ({ type: "image_url", image_url: { url: input.url } })),
    };
    if (!body.frame_images.length) delete (body as any).frame_images;
    if (!body.input_references.length) delete (body as any).input_references;
    const submitted: any = await (await call(key, "/videos", { method: "POST", body: JSON.stringify(body) })).json();
    remote = String(submitted.id);
    record({ slug, shot: shot.id, job: remote, model: shot.model, status: "sent", usd: job.estimate });
    const polling = new URL(submitted.polling_url ?? `${API()}/videos/${remote}`, API()).toString();
    let status: any = submitted;
    while (status.status !== "completed") {
      if (["failed", "cancelled", "expired"].includes(status.status)) {
        record({ slug, shot: shot.id, job: remote, model: shot.model, status: "failed", usd: Number(status.usage?.cost ?? 0) });
        throw new Error(`The video job ${status.status}${status.error ? `: ${status.error}` : ""}.`);
      }
      if (Date.now() - job.started > VIDEO_TIMEOUT_MS) throw new Error(`The video job ${remote} took over 25 minutes. It's still counted at its estimate; check it on openrouter.ai.`);
      job.message = `Making the video (${status.status ?? "pending"}, ${Math.round((Date.now() - job.started) / 1000)} s)`;
      await new Promise((done) => setTimeout(done, POLL_MS));
      status = await (await call(key, polling)).json();
    }
    job.message = "Downloading";
    const url = status.unsigned_urls?.[0] ?? `${API()}/videos/${remote}/content?index=0`;
    bytes = Buffer.from(await (await call(key, url)).arrayBuffer());
    cost = status.usage?.cost ?? undefined;
  }

  const usd = typeof cost === "number" ? cost : job.estimate;
  const file = join(genDir(slug), `${shot.id}${extFor(shot, mediaType)}`);
  mkdirSync(genDir(slug), { recursive: true });
  writeFileSync(file, bytes);
  record({ slug, shot: shot.id, job: remote, model: shot.model, status: "done", usd });

  const fromAd = relative(adDir(slug), file).split(sep).join("/");
  const made: Made = {
    kind: shot.kind,
    model: shot.model,
    prompt: shot.prompt,
    why: shot.why,
    settings: settingsOf(shot),
    file: fromAd,
    sha256: sha256(bytes),
    request: hash,
    job: remote,
    costUsd: Math.round(usd * 10000) / 10000,
    estimateUsd: Math.round(job.estimate * 10000) / 10000,
    made: new Date().toISOString(),
    via: "openrouter",
    terms: TERMS,
  };
  if (shot.kind === "video") {
    job.message = "Unpacking to frames";
    const meta = await unpack(slug, file);
    made.footage = { src: meta.src, fps: meta.fps, frames: meta.frames, sound: meta.sound, sheet: meta.sheet.path };
  }
  const all = readMade(slug);
  all[shot.id] = made;
  writeMade(slug, all);

  job.status = "done";
  job.cost = usd;
  job.file = fromAd;
  job.message = `Made for ${money(usd)}${typeof cost === "number" ? "" : " (estimated: OpenRouter sent no cost)"}`;
}
