/**
 * Publishing's files, all in the key store (keys.ts), outside the repo and denied to agents:
 *
 *   ~/.config/nykma/publish/apps/<provider>.json      an app's credentials (client id and secret), or a fields login
 *   ~/.config/nykma/publish/accounts/<id>.json        a connected account, with its tokens
 *   ~/.config/nykma/publish/jobs/<id>.json            an approved post: what, where, when, and the file's hash
 *
 * Jobs live here and not in the queue folder so that only the desk page can approve a post: an agent can write to
 * queue/ but not here. What happened to a post is also appended to queue/<folder>/posts.jsonl, without tokens, as the
 * ad's record.
 */
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureHome, home } from "../keys.ts";
import type { Account, AccountView, Job, ProviderId } from "./types.ts";

const dir = (kind: "apps" | "accounts" | "jobs") => join(home(), "publish", kind);
const safeName = (id: string) => id.replace(/[^A-Za-z0-9_.:@-]/g, "_").replace(/:/g, "~");

function ensure(kind: "apps" | "accounts" | "jobs") {
  ensureHome();
  mkdirSync(dir(kind), { recursive: true, mode: 0o700 });
  chmodSync(join(home(), "publish"), 0o700);
  chmodSync(dir(kind), 0o700);
}

function write(kind: "apps" | "accounts" | "jobs", name: string, value: unknown) {
  ensure(kind);
  const path = join(dir(kind), `${safeName(name)}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function read<T>(kind: "apps" | "accounts" | "jobs", name: string): T | undefined {
  const path = join(dir(kind), `${safeName(name)}.json`);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function all<T>(kind: "apps" | "accounts" | "jobs"): T[] {
  if (!existsSync(dir(kind))) return [];
  return readdirSync(dir(kind))
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      try {
        return [JSON.parse(readFileSync(join(dir(kind), file), "utf8")) as T];
      } catch {
        return [];
      }
    });
}

/* ── Apps: a provider's credentials ──────────────────────────────────────────────────────────────── */

export const readApp = (provider: ProviderId): Record<string, string> => read<Record<string, string>>("apps", provider) ?? {};
export const saveApp = (provider: ProviderId, values: Record<string, string>) => write("apps", provider, values);
export const removeApp = (provider: ProviderId) => rmSync(join(dir("apps"), `${provider}.json`), { force: true });

/* ── Accounts ─────────────────────────────────────────────────────────────────────────────────────── */

export const readAccount = (id: string) => read<Account>("accounts", id);
export const saveAccount = (account: Account) => write("accounts", account.id, account);
export const listAccounts = () => all<Account>("accounts").sort((a, b) => a.platform.localeCompare(b.platform) || a.name.localeCompare(b.name));
export const removeAccount = (id: string) => rmSync(join(dir("accounts"), `${safeName(id)}.json`), { force: true });

export function viewAccount(account: Account, label: string): AccountView {
  const { tokens: _tokens, ...rest } = account;
  return { ...rest, label };
}

/* ── Jobs ──────────────────────────────────────────────────────────────────────────────────────────── */

export const readJob = (id: string) => read<Job>("jobs", id);
export const listJobs = () => all<Job>("jobs").sort((a, b) => (b.at ?? b.approvedAt) - (a.at ?? a.approvedAt));
export const removeJob = (id: string) => rmSync(join(dir("jobs"), `${safeName(id)}.json`), { force: true });

export function saveJob(job: Job) {
  job.updated = Date.now();
  job.log = job.log.slice(-80);
  write("jobs", job.id, job);
}

/** The ad's own record of its posts, in its queue folder. No tokens, no secrets: what, where, when, and the link. */
export function record(queueDir: string, job: Job) {
  if (!existsSync(queueDir)) return;
  const line = { at: new Date().toISOString(), job: job.id, platform: job.platform, account: job.accountId.split(":").slice(1).join(":"), file: job.file, state: job.state, url: job.url, error: job.error, scheduledFor: job.at ? new Date(job.at).toISOString() : undefined };
  appendFileSync(join(queueDir, "posts.jsonl"), `${JSON.stringify(line)}\n`);
}

/** SHA-256 of a file, streamed, so a 2 GB render doesn't sit in memory. */
export const hashFile = (path: string) =>
  new Promise<string>((done, fail) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => done(hash.digest("hex")))
      .on("error", fail);
  });
