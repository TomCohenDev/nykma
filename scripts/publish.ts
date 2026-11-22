// bun run publish                     the connected accounts and the latest posts
// bun run publish <slug> --to <account>[,<account>...] [--at <time>] [--dry-run]
//                                     posts the ad through the desk, now or at a time, as the desk's Publish dialog does
//     --to         an account's id, its platform (facebook) when only one is connected, its name (Mathbooklm), or
//                  platform:name (facebook:mathbooklm). Several, comma-separated
//     --at         2026-11-23 18:00 (local time), an ISO time, or +30m / +2h / +1d. Missing is now
//     --file       the MP4 in the ad's folder (default: the ratio that suits the platform, main take first)
//     --cover      the cover in the folder (default: the file's own -thumbnail.jpg or .png)
//     --caption    the caption for every account (default: post.md's section for each platform, or its fallbacks)
//     --title      the title, for YouTube and Pinterest (default: post.md's)
//     --set k=v    a per-post choice, for every account that has it (privacy=PUBLIC_TO_EVERYONE, ai=true). Repeatable
//     --force      post to a platform whose post.md section says the ad isn't for it
//     --no-wait    return once approved; by default an immediate post is followed until it's out (up to 10 minutes)
// bun run publish --status [<slug>]   posts and their state
// bun run publish --cancel <id> | --now <id> | --remove <id>   what the Publishing page's buttons do
//
// Publishing (spec.md §10.12). The desk holds the logins and does the posting, so it must be running (bun run dev);
// this proves itself with the desk's token, gets account names and states, and never a token. Connecting an account
// stays on the Publishing page, since a login is a browser window.
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { PLATFORM_INFO } from "./lib/publish/info.ts";
import type { AccountView, Job, Option, Platform } from "./lib/publish/types.ts";
import { findDesk } from "./lib/stock.ts";

const ROOT = resolve(import.meta.dirname, "..");
const QUEUE = join(ROOT, "queue");

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    to: { type: "string" },
    at: { type: "string" },
    file: { type: "string" },
    cover: { type: "string" },
    caption: { type: "string" },
    title: { type: "string" },
    set: { type: "string", multiple: true },
    force: { type: "boolean" },
    "dry-run": { type: "boolean" },
    "no-wait": { type: "boolean" },
    status: { type: "boolean" },
    cancel: { type: "string" },
    now: { type: "string" },
    remove: { type: "string" },
  },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
const desk = findDesk() ?? fail("The desk isn't running, and it holds the logins and does the posting. Start it with bun run dev.");

async function ask<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${desk.url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-nykma-token": desk.token },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => undefined);
  if (!res) throw new Error("The desk didn't answer. Is bun run dev still running?");
  const reply: any = await res.json().catch(() => ({}));
  if (!res.ok || reply.error) throw new Error(reply.error ?? `The desk answered ${res.status}.`);
  return reply;
}

type State = { accounts: AccountView[]; jobs: Job[]; providers: { id: string; label: string; platformCost?: boolean; accounts: number }[] };
type Draft = {
  folder: string;
  videos: { file: string; ratio: string; id: string; bytes: number }[];
  covers: string[];
  hasPost: boolean;
  copy: Record<Platform, { caption: string; title?: string; section?: string; skip?: string }>;
  aiGenerated: boolean;
};

const when = (ms: number) => new Date(ms).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const line = (job: Job) =>
  `${job.id.slice(0, 8)}  ${job.state.padEnd(9)}  ${PLATFORM_INFO[job.platform].label} · ${job.accountId.split(":").slice(2).join(":")}  ${job.folder}/${job.file}` +
  `${job.at ? `  at ${when(job.at)}` : ""}${job.url ? `\n          ${job.url}` : ""}${job.error ? `\n          ${job.error}` : ""}`;

/** The ad's queue folder from a slug (the latest one) or the folder's own name. */
function folderOf(name: string): string {
  if (/^\d{4}-\d{2}-\d{2}-/.test(name) && existsSync(join(QUEUE, name))) return name;
  const found = readdirSync(QUEUE).filter((folder) => folder.slice(11) === name).sort();
  return found.at(-1) ?? fail(`No folder for ${name} in queue/.`);
}

/** --at: a local "2026-11-23 18:00", an ISO time, or +30m / +2h / +1d from now. */
function timeOf(text: string): number {
  const relative = text.match(/^\+(\d+(?:\.\d+)?)\s*(m|h|d)$/i);
  if (relative) return Date.now() + Number(relative[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[relative[2].toLowerCase() as "m" | "h" | "d"];
  const ms = new Date(text.replace(" ", "T")).getTime();
  return Number.isFinite(ms) ? ms : fail(`--at ${text}: say 2026-11-23 18:00, an ISO time, or +2h.`);
}

/** --to: one entry to one account, or a failure that lists the ones it could mean. */
function accountOf(entry: string, accounts: AccountView[]): AccountView {
  const want = entry.trim().toLowerCase();
  const exact = accounts.find((account) => account.id.toLowerCase() === want);
  if (exact) return exact;
  const [platform, name] = want.includes(":") ? want.split(/:(.*)/s) : [undefined, want];
  const matches = accounts.filter((account) => {
    if (platform && account.platform !== platform) return false;
    if (!platform && account.platform === want) return true;
    const names = [account.name, account.handle ?? ""].map((n) => n.toLowerCase().replace(/^@/, ""));
    return names.some((n) => n === name) || names.some((n) => n.includes(name));
  });
  const names = (list: AccountView[]) => list.map((account) => `  ${account.id}  ${account.label}`).join("\n");
  if (matches.length === 1) return matches[0];
  if (!matches.length) return fail(`No connected account is ${entry}. Connected:\n${names(accounts) || "  none: connect one on the desk's Publishing page"}`);
  const exactName = matches.filter((account) => account.name.toLowerCase() === name);
  if (exactName.length === 1) return exactName[0];
  return fail(`${entry} could be any of these. Say which with its id or platform:name:\n${names(matches)}`);
}

function bestFile(platform: Platform, videos: Draft["videos"]) {
  const order = PLATFORM_INFO[platform].ratios;
  const sorted = [...videos].sort((a, b) => order.indexOf(a.ratio as never) - order.indexOf(b.ratio as never) || a.id.length - b.id.length);
  return sorted.find((video) => order.includes(video.ratio as never)) ?? sorted[0];
}
const coverFor = (file: string, covers: string[]) => {
  const id = file.replace(/\.mp4$/, "");
  return covers.find((cover) => cover === `${id}-thumbnail.jpg`) ?? covers.find((cover) => cover === `${id}-thumbnail.png`);
};

/** --set k=v, with true and false as toggles. */
function sets(): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const pair of values.set ?? []) {
    const at = pair.indexOf("=");
    if (at < 1) fail(`--set ${pair}: say key=value.`);
    const value = pair.slice(at + 1);
    out[pair.slice(0, at)] = value === "true" ? true : value === "false" ? false : value;
  }
  return out;
}

async function follow(ids: string[]) {
  const until = Date.now() + 10 * 60_000;
  let last = "";
  while (Date.now() < until) {
    const state = await ask<State>("/api/publish");
    const jobs = state.jobs.filter((job) => ids.includes(job.id));
    const text = jobs.map(line).join("\n");
    if (text !== last) console.log(`\n${text}`), (last = text);
    if (jobs.every((job) => !["approved", "running"].includes(job.state) || (job.state === "approved" && job.at))) return jobs;
    await new Promise((done) => setTimeout(done, 3000));
  }
  console.log("\nStill posting after 10 minutes: bun run publish --status shows how it ends.");
  return [];
}

async function main() {
  const action = values.cancel ? "cancel" : values.now ? "now" : values.remove ? "remove" : undefined;
  if (action) {
    const short = (values.cancel ?? values.now ?? values.remove)!;
    const state = await ask<State>("/api/publish");
    const found = state.jobs.filter((job) => job.id.startsWith(short));
    if (found.length !== 1) fail(found.length ? `${short} matches ${found.length} posts: give more of its id.` : `No post ${short}.`);
    await ask("/api/publish/job", { id: found[0].id, action });
    console.log(`${action === "cancel" ? "Cancelled" : action === "now" ? "Posting now" : "Removed"}: ${found[0].id.slice(0, 8)}`);
    if (action === "now" && !values["no-wait"]) await follow([found[0].id]);
    return;
  }

  const state = await ask<State>("/api/publish");
  const [name] = positionals;
  if (values.status || !name) {
    const folder = name ? folderOf(name) : undefined;
    if (!name) {
      console.log("Connected accounts:");
      console.log(state.accounts.map((account) => `  ${account.id}  ${account.label}${account.needsReconnect ? "  (connect again on the desk)" : ""}`).join("\n") || "  none: connect one on the desk's Publishing page");
    }
    const jobs = state.jobs.filter((job) => !folder || job.folder === folder).sort((a, b) => b.updated - a.updated).slice(0, 30);
    console.log(`\n${folder ? `Posts of ${folder}` : "Latest posts"}:`);
    console.log(jobs.map(line).join("\n") || "  none");
    return;
  }

  if (!values.to) fail("Say where with --to, e.g. --to facebook:mathbooklm. bun run publish lists the connected accounts.");
  const folder = folderOf(name);
  const draft = await ask<Draft>(`/api/publish/draft?folder=${encodeURIComponent(folder)}`);
  if (!draft.videos.length) fail(`${folder} has no MP4 to post. Render it first.`);
  const accounts = [...new Set(values.to!.split(",").filter((entry) => entry.trim()).map((entry) => accountOf(entry, state.accounts)))];
  const at = values.at ? timeOf(values.at) : undefined;
  const chosen = sets();

  const posts = [];
  let cost = 0;
  for (const account of accounts) {
    const info = PLATFORM_INFO[account.platform];
    if (account.needsReconnect) fail(`${account.label} needs connecting again on the desk's Publishing page.`);
    const file = values.file ?? bestFile(account.platform, draft.videos)?.file;
    if (!file || !draft.videos.some((video) => video.file === file)) fail(`${values.file} isn't one of ${folder}'s MP4s: ${draft.videos.map((video) => video.file).join(", ")}.`);
    const copy = draft.copy[account.platform] ?? { caption: "" };
    if (copy.skip && !values.force && values.caption === undefined) fail(`${account.label}: post.md says ${copy.skip}. Give a --caption, or --force to post it anyway.`);
    const caption = (values.caption ?? copy.caption).trim();
    if (!caption) fail(`${account.label}: post.md has no copy for ${info.label}. Give a --caption.`);
    const title = info.titleLimit ? (values.title ?? copy.title ?? "") : undefined;
    const specs = (await ask<{ options: Option[] }>(`/api/publish/options?account=${encodeURIComponent(account.id)}`)).options ?? [];
    const options: Record<string, string | boolean> = {};
    for (const option of specs) if (option.default !== undefined) options[option.key] = option.default;
    if (specs.some((option) => option.key === "ai")) options.ai = draft.aiGenerated;
    for (const option of specs) if (option.key in chosen) options[option.key] = chosen[option.key];
    for (const option of specs) {
      const shown = !option.when || options[option.when.key] === option.when.is;
      if (shown && option.required && (options[option.key] === undefined || options[option.key] === ""))
        fail(`${account.label}: choose ${option.label} with --set ${option.key}=<value>${option.choices ? `: ${option.choices.map((choice) => choice.value).join(", ")}` : ""}.`);
    }
    const provider = state.providers.find((p) => p.id === account.provider);
    if (info.cost && provider?.platformCost !== false) cost += info.cost(caption);
    posts.push({ accountId: account.id, file, thumbnail: values.cover ?? coverFor(file, draft.covers), caption, title, options, at, label: account.label, section: copy.section });
  }

  console.log(`${at ? `Scheduling for ${when(at)}` : "Posting now"}: ${folder}${values["dry-run"] ? " (dry run: nothing is approved)" : ""}`);
  for (const post of posts) {
    console.log(`\n${post.label}`);
    console.log(`  file     ${post.file}${post.thumbnail ? `, cover ${post.thumbnail}` : ""}`);
    if (post.title !== undefined) console.log(`  title    ${post.title}`);
    console.log(`  caption  (${values.caption !== undefined ? "--caption" : post.section ? `post.md ## ${post.section}` : "post.md"})\n${post.caption.split("\n").map((l) => `           ${l}`).join("\n")}`);
    const options = Object.entries(post.options);
    if (options.length) console.log(`  options  ${options.map(([k, v]) => `${k}=${v}`).join("  ")}`);
  }
  if (cost) console.log(`\nX charges $${cost.toFixed(3)}.`);
  if (values["dry-run"]) return;

  const reply = await ask<{ jobs: Job[] }>("/api/publish/approve", { folder, posts: posts.map(({ label: _l, section: _s, ...post }) => post) });
  console.log(`\nApproved ${reply.jobs.length} post${reply.jobs.length > 1 ? "s" : ""}.`);
  if (at || values["no-wait"]) {
    console.log(reply.jobs.map(line).join("\n"));
    return;
  }
  const done = await follow(reply.jobs.map((job) => job.id));
  if (done.some((job) => job.state === "failed" || job.state === "changed")) process.exit(1);
}

main().catch((error: Error) => fail(error.message));
