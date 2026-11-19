// bun run stamp [<brand>]   Which instructions an ad is made with: a short hash of every instruction file as a run for
// the brand reads them (its own versions where it has them), so a live result can be tied back to the prompt that
// made it. It names the frozen version in evals/prompt-versions/ with the same files, if there is one, and otherwise
// keeps a copy in evals/stamps/<hash>/ so the hash can always be looked up. The hand-off writes the line it prints
// into the queue README.
//
// bun run stamp --report    The queue's ads by the instructions they were made with, and the results filled in.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { INSTRUCTIONS, instructionTexts } from "./lib/agents.ts";
import { field, readIf, section } from "./lib/queue.ts";

const ROOT = resolve(import.meta.dirname, "..");
const VERSIONS = join(ROOT, "evals", "prompt-versions");
const STAMPS = join(ROOT, "evals", "stamps");

/** A hash of the files, in the desk's order, so the same instructions always give the same stamp. */
function hashOf(texts: Map<string, string>) {
  const hash = createHash("sha256");
  for (const { path } of INSTRUCTIONS) hash.update(`${path}\n${texts.get(path) ?? ""}\n\0`);
  return hash.digest("hex").slice(0, 8);
}

/** A frozen version's files, read the same way, for the ones it has. */
function versionTexts(name: string) {
  const texts = new Map<string, string>();
  for (const { path } of INSTRUCTIONS) {
    const text = readIf(join(VERSIONS, name, path));
    if (text !== undefined) texts.set(path, text.replace(/\r\n/g, "\n"));
  }
  return texts;
}

function stamp(brand?: string) {
  const texts = instructionTexts(brand);
  const hash = hashOf(texts);
  const named = (existsSync(VERSIONS) ? readdirSync(VERSIONS) : []).find((name) => hashOf(versionTexts(name)) === hash);
  if (!named && !existsSync(join(STAMPS, hash))) {
    for (const [path, text] of texts) {
      mkdirSync(dirname(join(STAMPS, hash, path)), { recursive: true });
      writeFileSync(join(STAMPS, hash, path), text);
    }
    writeFileSync(join(STAMPS, hash, "STAMP.md"), `# ${hash}\n\nThe instructions${brand ? ` for ${brand}` : ""} as they were on ${new Date().toISOString().slice(0, 10)}, kept by bun run stamp so ads stamped ${hash} can be traced back.\n`);
  }
  return named ? `${named} (${hash})` : hash;
}

function report() {
  const queue = join(ROOT, "queue");
  const rows: string[][] = [];
  for (const name of existsSync(queue) ? readdirSync(queue).filter((entry) => /^\d{4}-\d{2}-\d{2}-/.test(entry)).sort() : []) {
    const readme = readIf(join(queue, name, "README.md"));
    if (!readme) continue;
    const results = section(readme, /^results/i)
      .split(/\r?\n/)
      .filter((line) => /^\|/.test(line) && !/^\|\s*-/.test(line) && !/<[^>]+>/.test(line))
      .slice(1);
    rows.push([name, field(readme, "brand") ?? "", field(readme, "instructions") ?? "not stamped", results.length ? `${results.length} row${results.length === 1 ? "" : "s"}` : "none yet"]);
  }
  if (!rows.length) return console.log("No queue folders with a README yet.");
  console.log("| Ad | Brand | Instructions | Results |\n|---|---|---|---|");
  for (const row of rows) console.log(`| ${row.join(" | ")} |`);
  console.log("\nResults are the table under \"## Results\" in each README, filled in after the ad is posted.");
}

const arg = process.argv[2];
if (arg === "--report") report();
else if (arg && !existsSync(join(ROOT, "brands", arg, "brand.md"))) throw new Error(`No brand kit at brands/${arg}/.`);
else console.log(`instructions: ${stamp(arg)}`);

