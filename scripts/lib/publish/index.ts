/**
 * Publishing (spec.md §10.12): connecting accounts, approving posts, and posting them on time. The desk does all of it;
 * an agent can't, because approvals live in the key store and only the desk page can make one.
 *
 * A post is a job: one MP4 to one account, with its caption, options and time. Approving it records the file's
 * SHA-256, so a re-render after you approved isn't posted ("changed"). The desk checks for due jobs every 15 seconds
 * while it runs. Where the platform schedules posts itself (YouTube, Facebook, Mastodon, Tumblr), the desk uploads at
 * approval and the platform posts at the time, so the PC can be off then. Elsewhere the desk posts at the time, and a
 * time missed while the desk was off waits for you ("overdue") instead of posting late.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { home } from "../keys.ts";
import { folderSlug, readIf } from "../queue.ts";
import { copyFor } from "./captions.ts";
import { PLATFORM_INFO } from "./info.ts";
import { begin, outcome, redirectUri } from "./oauth.ts";
import { hashFile, listAccounts, listJobs, readAccount, readApp, readJob, record, removeAccount, removeApp, removeJob, saveAccount, saveApp, saveJob, viewAccount } from "./store.ts";
import { PLATFORMS, PROVIDERS, PublishError, type Account, type Job, type Option, type Platform, type Provider, type ProviderId } from "./types.ts";
import { provider as youtube } from "./platforms/youtube.ts";
import { provider as meta } from "./platforms/meta.ts";
import { provider as tiktok } from "./platforms/tiktok.ts";
import { provider as linkedin } from "./platforms/linkedin.ts";
import { provider as x } from "./platforms/x.ts";
import { provider as tumblr } from "./platforms/tumblr.ts";
import { provider as bluesky } from "./platforms/bluesky.ts";
import { provider as mastodon } from "./platforms/mastodon.ts";
import { provider as telegram } from "./platforms/telegram.ts";
import { provider as discord } from "./platforms/discord.ts";
import { provider as uploadpost } from "./platforms/uploadpost.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const QUEUE = join(ROOT, "queue");
const FOLDER = /^\d{4}-\d{2}-\d{2}-[^\\/.][^\\/]*$/;
const MP4 = /^[^\\/]+\.mp4$/i;
const COVER = /^[^\\/]+-thumbnail\.(jpe?g|png)$/i;

export const providers: Record<ProviderId, Provider> = { youtube, meta, tiktok, linkedin, x, tumblr, bluesky, mastodon, telegram, discord, uploadpost };
export { PLATFORM_INFO, PLATFORMS };

const label = (account: Account) => `${PLATFORM_INFO[account.platform].label}${account.provider === "uploadpost" ? " (Upload-Post)" : ""} · ${account.name}`;
const isProvider = (value: unknown): value is ProviderId => typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);

/* ── What the page sees ─────────────────────────────────────────────────────────────────────────────── */

/** Every provider with its setup steps and whether it's set up, the accounts, and the jobs. Never a token. */
export function publishState() {
  const accounts = listAccounts();
  return {
    providers: PROVIDERS.map((id) => {
      const p = providers[id];
      const app = readApp(id);
      const redirect = p.auth === "oauth" ? redirectUri(p.redirectHost) : undefined;
      return {
        id,
        label: p.label,
        auth: p.auth,
        blurb: p.blurb,
        console: p.console,
        caveat: p.caveat,
        platforms: p.platforms,
        redirect,
        setup: p.setup.map((step) => step.replaceAll("{redirect}", redirect ?? "")),
        fields: p.fields.map((field) => {
          const value = p.auth === "oauth" ? app[field.key] : undefined;
          return { ...field, set: Boolean(value), value: value && !field.secret ? value : undefined, last4: value && field.secret ? value.slice(-4) : undefined };
        }),
        ready: p.auth === "fields" || p.fields.every((field) => field.optional || app[field.key]),
        nativeSchedule: p.nativeSchedule,
        platformCost: p.platformCost,
        accounts: accounts.filter((account) => account.provider === id).length,
      };
    }),
    accounts: accounts.map((account) => viewAccount(account, label(account))),
    jobs: listJobs(),
    platforms: Object.fromEntries(
      PLATFORMS.map((platform) => {
        const { cost, ...info } = PLATFORM_INFO[platform];
        return [platform, { ...info, paid: Boolean(cost) }];
      }),
    ),
  };
}

/** What the publish dialog starts from: the folder's MP4s and covers, each platform's copy from post.md. */
export function draft(folder: string) {
  if (!FOLDER.test(folder) || !existsSync(join(QUEUE, folder))) throw new Error("That ad's folder isn't in queue/.");
  const dir = join(QUEUE, folder);
  const files = readdirSync(dir);
  const videos = files
    .filter((file) => /-(16x9|1x1|9x16)\.mp4$/.test(file))
    .map((file) => ({ file, ratio: file.match(/-(16x9|1x1|9x16)\.mp4$/)![1], id: file.replace(/\.mp4$/, ""), bytes: statSync(join(dir, file)).size }));
  const covers = files.filter((file) => COVER.test(file));
  const postMd = readIf(join(dir, "post.md"));
  const readme = readIf(join(dir, "README.md")) ?? "";
  const slug = folderSlug(folder);
  // Generated media leaves gen.json (spec.md §6.6). The AI label starts on when there is any, and you can change it.
  const genFile = join(ROOT, "public", "ads", slug, "gen.json");
  const generated = existsSync(genFile) && /"(id|prompt)"\s*:/.test(readIf(genFile) ?? "");
  const said = /AI-generated|generated (still|clip|image|video|person)/i.test(`${postMd ?? ""}\n${readme}`) && !/Nothing in this ad is AI-generated/i.test(`${postMd ?? ""}\n${readme}`);
  return {
    folder,
    slug,
    videos,
    covers,
    hasPost: Boolean(postMd),
    copy: Object.fromEntries(PLATFORMS.map((platform) => [platform, copyFor(postMd, platform)])),
    aiGenerated: generated || said,
  };
}

/**
 * Where the API has an AI-content label: the dialog shows it as `ai`, starting from what the ad's files say (draft),
 * and each provider maps it to its own field (YouTube's containsSyntheticMedia, TikTok's is_aigc, Instagram's
 * is_ai_generated).
 */
export const AI_LABEL: Platform[] = ["youtube", "tiktok", "instagram", "threads"];

/** The per-post choices for an account: the AI label where there is one, then the provider's own. */
export async function optionsFor(accountId: string): Promise<Option[]> {
  const account = readAccount(accountId);
  if (!account) throw new Error("That account isn't connected.");
  const p = providers[account.provider];
  const own = p.options ? await p.options(await fresh(account), readApp(account.provider)) : [];
  const ai: Option[] = AI_LABEL.includes(account.platform) && !own.some((option) => option.key === "ai")
    ? [{ key: "ai", label: "Label it as AI-generated", type: "toggle", help: "On when the ad has generated people, places or footage that look real." }]
    : [];
  return [...ai, ...own];
}

/* ── Setting up and connecting ──────────────────────────────────────────────────────────────────────── */

/** Saves an app's credentials. A secret left empty keeps the one saved. For a fields provider, this is connecting. */
export async function saveProvider(id: unknown, values: Record<string, unknown>) {
  if (!isProvider(id)) throw new Error("No such provider.");
  const p = providers[id];
  const clean: Record<string, string> = {};
  for (const field of p.fields) {
    const value = typeof values[field.key] === "string" ? (values[field.key] as string).trim() : "";
    if (/[\r\n]/.test(value) || value.length > 4000) throw new Error(`${field.label} doesn't look right.`);
    if (value) clean[field.key] = value;
  }
  if (p.auth === "fields") {
    for (const field of p.fields) if (!field.optional && !clean[field.key]) throw new Error(`${field.label} is needed.`);
    const accounts = await p.connect!(clean);
    for (const account of accounts) saveAccount(account);
    return { connected: accounts.map((account) => account.name) };
  }
  const before = readApp(id);
  const next = { ...clean };
  for (const field of p.fields) if (field.secret && !next[field.key] && before[field.key]) next[field.key] = before[field.key];
  saveApp(id, next);
  return { connected: [] };
}

export function forgetProvider(id: unknown) {
  if (!isProvider(id)) throw new Error("No such provider.");
  removeApp(id);
}

/** Finishes any login: whichever provider it began with exchanges the code, and its accounts are saved. */
async function finishLogin(start: Parameters<Provider["exchange"] & {}>[2], code: string) {
  const p = providers[start.provider];
  const accounts = await p.exchange!(readApp(start.provider), code, start);
  if (!accounts.length) throw new Error("The login worked, but it gave no account to post to.");
  for (const account of accounts) saveAccount(account);
  return accounts;
}

export async function connect(id: unknown): Promise<{ url: string; state: string }> {
  if (!isProvider(id)) throw new Error("No such provider.");
  const p = providers[id];
  if (p.auth !== "oauth" || !p.authorizeUrl) throw new Error(`${p.label} connects with the fields on its card, not a login.`);
  const app = readApp(id);
  const missing = p.fields.filter((field) => !field.optional && !app[field.key]);
  if (missing.length) throw new Error(`Save ${missing.map((field) => field.label).join(" and ")} first.`);
  const start = await begin(id, p.redirectHost ?? "127.0.0.1", finishLogin);
  return { url: p.authorizeUrl(app, start), state: start.state };
}

export const loginOutcome = (state: string) => outcome(state) ?? { done: true, error: "No such login. Did the desk restart?" };

export function disconnect(accountId: string) {
  removeAccount(accountId);
}

/** The account with tokens that work for the next few minutes, refreshed if they don't. */
async function fresh(account: Account): Promise<Account> {
  const p = providers[account.provider];
  if (!p.refresh || !account.expiresAt || account.expiresAt > Date.now() + 5 * 60_000) return account;
  try {
    const next = await p.refresh(readApp(account.provider), account);
    next.needsReconnect = undefined;
    saveAccount(next);
    return next;
  } catch (error) {
    if (error instanceof PublishError && !error.reconnect) throw error;
    saveAccount({ ...account, needsReconnect: String((error as Error).message) });
    throw new PublishError(`${label(account)} needs connecting again: ${(error as Error).message}`, { reconnect: true });
  }
}

/** Keeps logins alive: refreshes any that end within a week, where the provider can (Meta's 60 days, TikTok's). */
async function keepAlive() {
  for (const account of listAccounts()) {
    const p = providers[account.provider];
    if (!p.refresh || !account.expiresAt || account.needsReconnect || account.expiresAt > Date.now() + 7 * 86_400_000) continue;
    try {
      const next = await p.refresh(readApp(account.provider), account);
      saveAccount({ ...next, needsReconnect: undefined });
    } catch (error) {
      if (error instanceof PublishError && error.retry) continue;
      saveAccount({ ...account, needsReconnect: String((error as Error).message) });
    }
  }
}

/* ── Approving ──────────────────────────────────────────────────────────────────────────────────────── */

export type Draft = { accountId: string; file: string; thumbnail?: string; caption: string; title?: string; options?: Record<string, unknown>; at?: number };

const probe = (file: string) =>
  new Promise<{ seconds: number; width: number; height: number }>((done) =>
    execFile("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file], { timeout: 30_000 }, (error, stdout) => {
      try {
        const data = JSON.parse(stdout);
        done({ seconds: Number(data.format?.duration ?? 0), width: Number(data.streams?.[0]?.width ?? 0), height: Number(data.streams?.[0]?.height ?? 0) });
      } catch {
        done({ seconds: 0, width: 0, height: 0 });
      }
      void error;
    }),
  );

/**
 * Turns what you approved on the dialog into jobs. Every check that can fail before posting fails here, so a job that
 * waits for its time already passed them: the caption fits, the file is in the folder and within the platform's
 * limits, the account is connected and the required choices are made.
 */
export async function approve(folder: string, posts: Draft[], by = "on the desk page"): Promise<Job[]> {
  if (!FOLDER.test(folder) || !existsSync(join(QUEUE, folder))) throw new Error("That ad's folder isn't in queue/.");
  if (!Array.isArray(posts) || !posts.length) throw new Error("Pick an account to post to.");
  if (posts.length > 40) throw new Error("That's a lot of posts at once. Approve up to 40.");
  const dir = join(QUEUE, folder);
  const jobs: Job[] = [];
  const now = Date.now();
  for (const post of posts) {
    const account = readAccount(String(post.accountId ?? ""));
    if (!account) throw new Error("One of those accounts isn't connected any more.");
    if (account.needsReconnect) throw new Error(`${label(account)} needs connecting again first.`);
    const info = PLATFORM_INFO[account.platform];
    const name = label(account);
    if (!MP4.test(post.file ?? "") || !existsSync(join(dir, post.file))) throw new Error(`${name}: that video isn't in the folder.`);
    if (post.thumbnail && (!COVER.test(post.thumbnail) || !existsSync(join(dir, post.thumbnail)))) throw new Error(`${name}: that cover isn't in the folder.`);
    const caption = String(post.caption ?? "").replace(/\r\n/g, "\n").trim();
    const title = post.title === undefined ? undefined : String(post.title).trim();
    if (caption.length > info.captionLimit) throw new Error(`${name}: the caption is ${caption.length} characters, and ${info.label} takes ${info.captionLimit}.`);
    if (info.titleLimit && title && title.length > info.titleLimit) throw new Error(`${name}: the title is ${title.length} characters, and ${info.label} takes ${info.titleLimit}.`);
    if (account.platform === "youtube" && !title) throw new Error(`${name}: YouTube needs a title.`);
    const path = join(dir, post.file);
    const bytes = statSync(path).size;
    if (info.maxBytes && bytes > info.maxBytes) throw new Error(`${name}: ${post.file} is ${(bytes / 1e6).toFixed(0)} MB, and ${info.label} takes ${(info.maxBytes / 1e6).toFixed(0)} MB.`);
    const { seconds } = await probe(path);
    if (info.maxSeconds && seconds > info.maxSeconds) throw new Error(`${name}: ${post.file} is ${Math.round(seconds)} s, and ${info.label} takes ${info.maxSeconds} s.`);
    const at = post.at === undefined || post.at === null ? undefined : Number(post.at);
    if (at !== undefined && (!Number.isFinite(at) || at < now + 60_000)) throw new Error(`${name}: pick a time at least a minute from now, or post now.`);
    if (at !== undefined && at > now + 366 * 86_400_000) throw new Error(`${name}: that's more than a year away.`);
    const lead = at === undefined ? 0 : at - now;
    const p = providers[account.provider];
    const window = p.nativeSchedule ?? info.nativeSchedule;
    const native = Boolean(window && at !== undefined && lead >= window.minMinutes * 60_000 && lead <= window.maxDays * 86_400_000);

    const options: Record<string, string | boolean> = {};
    for (const [key, value] of Object.entries(post.options ?? {})) if (typeof value === "string" || typeof value === "boolean") options[key] = typeof value === "string" ? value.slice(0, 500) : value;
    const wanted = await optionsFor(account.id).catch(() => [] as Option[]);
    for (const option of wanted) {
      const shown = !option.when || options[option.when.key] === option.when.is;
      if (shown && option.required && (options[option.key] === undefined || options[option.key] === "")) throw new Error(`${name}: choose ${option.label}.`);
    }
    const refused = p.validate?.({ caption, title, options }, account);
    if (refused) throw new Error(`${name}: ${refused}`);

    jobs.push({
      id: randomUUID(),
      folder,
      slug: folderSlug(folder),
      accountId: account.id,
      provider: account.provider,
      platform: account.platform,
      file: post.file,
      thumbnail: post.thumbnail,
      caption,
      title,
      options,
      at,
      native,
      fileHash: await hashFile(path),
      thumbnailHash: post.thumbnail ? await hashFile(join(dir, post.thumbnail)) : undefined,
      approvedAt: now,
      state: "approved",
      attempts: 0,
      handle: {},
      log: [{ at: now, text: at === undefined ? `Approved ${by}, to post now.` : `Approved ${by}, to post ${new Date(at).toLocaleString()}${native ? `. ${info.label} holds it, so the desk uploads it now.` : ". The desk posts it then, if it's running."}` }],
      updated: now,
    });
  }
  for (const job of jobs) saveJob(job);
  tick();
  return jobs;
}

/* ── Posting ────────────────────────────────────────────────────────────────────────────────────────── */

// Vite re-imports this module when its config reloads, and the old timers keep running: the posts in flight and the
// clock's timers live on globalThis, so a reload swaps the clock instead of starting a second one that posts twice.
const shared = globalThis as typeof globalThis & { __nykmaPublish?: { active: Set<string>; timers: NodeJS.Timeout[] } };
shared.__nykmaPublish ??= { active: new Set(), timers: [] };
const active = shared.__nykmaPublish.active;
const MAX_AT_ONCE = 2;
const BACKOFF = [60_000, 5 * 60_000, 15 * 60_000];

function due(job: Job, now: number) {
  if (job.state !== "approved" || active.has(job.id)) return false;
  if (job.nextTry && job.nextTry > now) return false;
  return job.native || !job.at || job.at <= now;
}

async function run(job: Job) {
  active.add(job.id);
  const dir = join(QUEUE, job.folder);
  const log = (text: string) => {
    job.log.push({ at: Date.now(), text });
    saveJob(job);
  };
  try {
    job.state = "running";
    job.attempts += 1;
    saveJob(job);
    const file = join(dir, job.file);
    if (!existsSync(file)) throw new PublishError(`${job.file} isn't in queue/${job.folder}/ any more.`);
    if ((await hashFile(file)) !== job.fileHash) {
      job.state = "changed";
      job.error = `${job.file} changed after you approved it, so it wasn't posted. Approve it again to post the new one.`;
      log(job.error);
      record(dir, job);
      return;
    }
    const thumbnail = job.thumbnail ? join(dir, job.thumbnail) : undefined;
    if (thumbnail && (!existsSync(thumbnail) || (await hashFile(thumbnail)) !== job.thumbnailHash)) {
      job.state = "changed";
      job.error = `The cover ${job.thumbnail} changed after you approved it, so it wasn't posted. Approve it again.`;
      log(job.error);
      record(dir, job);
      return;
    }
    const stored = readAccount(job.accountId);
    if (!stored) throw new PublishError("That account isn't connected any more.");
    const account = await fresh(stored);
    const video = { bytes: statSync(file).size, ...(await probe(file)) };
    log(`Posting to ${label(account)}${job.attempts > 1 ? ` (try ${job.attempts})` : ""}.`);
    const result = await providers[job.provider].publish({
      job,
      account,
      app: readApp(job.provider),
      file,
      thumbnail,
      video,
      log,
      save: (handle) => {
        job.handle = { ...job.handle, ...handle };
        saveJob(job);
      },
      saveAccount,
    });
    job.state = result.state;
    job.url = result.url;
    job.remoteId = result.remoteId;
    job.error = undefined;
    log(result.state === "scheduled" ? `Uploaded. ${PLATFORM_INFO[job.platform].label} posts it ${new Date(job.at!).toLocaleString()}.` : result.state === "inbox" ? "Sent to the TikTok app's inbox. Open TikTok to finish and post it." : `Posted${result.url ? `: ${result.url}` : "."}`);
    record(dir, job);
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    const failure = error instanceof PublishError ? error : new PublishError(message);
    if (failure.reconnect) {
      const account = readAccount(job.accountId);
      if (account) saveAccount({ ...account, needsReconnect: message });
    }
    job.error = message;
    if (failure.retry && job.attempts <= BACKOFF.length) {
      job.state = "approved";
      job.nextTry = Date.now() + BACKOFF[job.attempts - 1];
      log(`${message} Trying again ${new Date(job.nextTry).toLocaleTimeString()}.`);
    } else {
      job.state = "failed";
      log(message);
      record(dir, job);
    }
  } finally {
    active.delete(job.id);
    saveJob(job);
  }
}

export function tick() {
  const now = Date.now();
  const busyAccounts = new Set(listJobs().filter((job) => active.has(job.id)).map((job) => job.accountId));
  for (const job of listJobs().reverse()) {
    // The PC slept through its time: ask, don't post hours late.
    if (job.state === "approved" && !job.native && job.at && job.attempts === 0 && job.at < now - 10 * 60_000) {
      job.state = "overdue";
      job.log.push({ at: now, text: `Its time (${new Date(job.at).toLocaleString()}) passed while the desk wasn't running. Post it now or cancel it.` });
      saveJob(job);
      continue;
    }
    if (active.size >= MAX_AT_ONCE) break;
    if (!due(job, now) || busyAccounts.has(job.accountId)) continue;
    busyAccounts.add(job.accountId);
    void run(job);
  }
}

/** You on a job: post an overdue or failed one now, cancel one waiting, or clear one that's done. */
export function act(id: string, action: string) {
  const job = readJob(id);
  if (!job) throw new Error("No such post.");
  if (active.has(id)) throw new Error("It's posting right now.");
  if (action === "cancel") {
    if (!["approved", "overdue", "failed", "changed"].includes(job.state)) throw new Error(job.state === "scheduled" ? `${PLATFORM_INFO[job.platform].label} holds this one: cancel it there.` : "It's already done.");
    job.state = "cancelled";
    job.log.push({ at: Date.now(), text: "Cancelled." });
    saveJob(job);
    record(join(QUEUE, job.folder), job);
  } else if (action === "now") {
    if (!["overdue", "failed", "approved"].includes(job.state)) throw new Error("That one can't be posted again from here.");
    job.state = "approved";
    job.at = undefined;
    job.native = false;
    job.nextTry = undefined;
    job.attempts = 0;
    job.log.push({ at: Date.now(), text: "Post now." });
    saveJob(job);
    tick();
  } else if (action === "remove") {
    if (["approved", "running"].includes(job.state)) throw new Error("Cancel it first.");
    removeJob(id);
  } else throw new Error("No such action.");
}

/** Opens the folder with the file selected, for posting by hand. */
export function reveal(folder: string, file: string) {
  if (!FOLDER.test(folder) || !/^[^\\/]+$/.test(file)) throw new Error("No such file.");
  const path = join(QUEUE, folder, file);
  if (!existsSync(path) || !resolve(path).startsWith(QUEUE + sep)) throw new Error("No such file.");
  if (process.platform === "win32") execFile("explorer.exe", [`/select,${path}`], () => {});
  else if (process.platform === "darwin") execFile("open", ["-R", path], () => {});
  else execFile("xdg-open", [join(QUEUE, folder)], () => {});
  return { path: `queue/${folder}/${basename(path)}` };
}

/** One clock per machine: a second desk (bun run dev twice) leaves posting to the first. */
function holdClock(): boolean {
  const lock = join(home(), "publish", "clock.lock");
  try {
    const holder = Number(readFileSync(lock, "utf8"));
    if (holder && holder !== process.pid) {
      try {
        process.kill(holder, 0);
        return false;
      } catch {}
    }
  } catch {}
  mkdirSync(join(home(), "publish"), { recursive: true, mode: 0o700 });
  writeFileSync(lock, String(process.pid), { mode: 0o600 });
  return true;
}

/**
 * Starts the clock, once per desk. A post left mid-way by a desk that stopped is failed, not resumed, because the
 * platform may have posted it: you check, then post it again or clear it. A time that passed while the desk was off
 * waits for you as overdue.
 */
export function startPublishing() {
  if (process.env.NYKMA_NO_PUBLISH) return;
  for (const timer of shared.__nykmaPublish!.timers) clearInterval(timer), clearTimeout(timer);
  shared.__nykmaPublish!.timers = [];
  if (!holdClock()) {
    console.log("nykma: another desk is running, so it posts the approved posts, not this one.");
    return;
  }
  const now = Date.now();
  for (const job of listJobs()) {
    if (job.state === "running" && !active.has(job.id)) {
      job.state = "failed";
      job.error = `The desk stopped while this was posting. Check ${PLATFORM_INFO[job.platform].label} before you post it again: it may be there.`;
      job.log.push({ at: now, text: job.error });
      saveJob(job);
    } else if (job.state === "running" && active.has(job.id)) {
      // Still posting from before a config reload: leave it be.
    } else if (job.state === "approved" && !job.native && job.at && job.at < now - 10 * 60_000) {
      job.state = "overdue";
      job.log.push({ at: now, text: `Its time (${new Date(job.at).toLocaleString()}) passed while the desk was off. Post it now or cancel it.` });
      saveJob(job);
    }
  }
  shared.__nykmaPublish!.timers.push(
    setInterval(tick, 15_000).unref(),
    setInterval(() => void keepAlive(), 6 * 3600_000).unref(),
    setTimeout(() => void keepAlive(), 20_000).unref(),
    setTimeout(tick, 3000).unref(),
  );
}

export const isPlatform = (value: unknown): value is Platform => typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
