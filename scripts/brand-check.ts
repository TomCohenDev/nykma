// bun run brand-check <brand>   Re-hashes brands/<brand>/sources.txt and lists what changed. Free, and changes no kit.
// A line with no hash yet gets one recorded. To accept a change, leave only the path or URL on its line and run it again.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseSource, readIf } from "./lib/queue.ts";

const ROOT = resolve(import.meta.dirname, "..");
const SKIP = new Set([".git", "node_modules", "dist", "build", ".next", "out", ".venv", "__pycache__"]);

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex").slice(0, 16);

const isUrl = (source: string) => /^https?:\/\//i.test(source);

function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !SKIP.has(entry.name) && !entry.name.startsWith(".env")) // Never open a .env, not even to hash it.
    .flatMap((entry) => (entry.isDirectory() ? filesIn(join(dir, entry.name)) : [join(dir, entry.name)]))
    .sort();
}

function hashPath(path: string) {
  if (!statSync(path).isDirectory()) return sha(readFileSync(path));
  const hash = createHash("sha256");
  for (const file of filesIn(path)) hash.update(relative(path, file)).update(readFileSync(file));
  return hash.digest("hex").slice(0, 16);
}

/** Pages carry per-request scripts and nonces, so only the markup and text are hashed. */
async function hashUrl(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: "follow" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  if (!/text|html|json|xml|css/.test(type)) return sha(Buffer.from(await response.arrayBuffer()));
  const body = (await response.text())
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\snonce="[^"]*"/gi, "")
    .replace(/\s+/g, " ");
  return sha(body);
}

const { positionals } = parseArgs({ allowPositionals: true });
const name = positionals[0];
if (!name) throw new Error("which brand? bun run brand-check <brand>");

const dir = join(ROOT, "brands", name);
const path = join(dir, "sources.txt");
const text = readIf(path);
if (text === undefined) {
  console.error(`brands/${name}/sources.txt doesn't exist${existsSync(dir) ? "" : `, and neither does brands/${name}/`}.`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const report = { same: 0, changed: [] as string[], recorded: [] as string[], gone: [] as string[], unreachable: [] as string[], notes: [] as string[] };

async function check(line: string) {
  const entry = parseSource(line);
  if (!entry) return line;
  const { source, hash } = entry;

  let local: string | undefined;
  if (!isUrl(source)) {
    local = isAbsolute(source) ? source : [join(dir, source), join(ROOT, source)].find(existsSync);
    if (!local || !existsSync(local)) {
      if (hash) report.gone.push(`${source} (hashed ${entry.date})`);
      else report.notes.push(source); // Plain words: "told by the user", a chat, a person. Nothing to hash.
      return line;
    }
  }

  let now: string;
  try {
    now = local ? hashPath(local) : await hashUrl(source);
  } catch (error) {
    report.unreachable.push(`${source}: ${(error as Error).message}`);
    return line;
  }
  if (!hash) {
    report.recorded.push(source);
    return `${now} ${today} ${source}`;
  }
  if (hash === now) report.same++;
  else report.changed.push(`${source} (since ${entry.date})`);
  return line;
}

const lines = text.split(/\r?\n/);
const checked = await Promise.all(lines.map(check));
if (report.recorded.length) writeFileSync(path, checked.join("\n"));

const hashable = report.same + report.changed.length + report.recorded.length + report.gone.length + report.unreachable.length;
const list = (title: string, items: string[]) => {
  if (items.length) console.log(`${title}:\n${items.map((item) => `  ${item}`).join("\n")}`);
};

list("Changed since the kit was made", report.changed);
list("Gone", report.gone);
list("Couldn't reach (not counted as a change)", report.unreachable);
list("Recorded for the first time", report.recorded);
list("Nothing to hash", report.notes);

if (!hashable) console.log(`brands/${name}: no files or URLs to hash, so changes can't be noticed.`);
else if (report.changed.length || report.gone.length) console.log(`brands/${name}: ${report.changed.length + report.gone.length} of ${hashable} sources changed. Mention it; refresh only if asked.`);
else if (report.same) console.log(`brands/${name}: ${report.same} of ${hashable} sources unchanged.`);
else console.log(`brands/${name}: ${hashable} sources recorded.`);
