// bun run history <brand>   What this brand's ads have already done, for the agent to steer away from, plus the
// user's standing notes for the brand (brands/<brand>/notes.md). Free: it reads queue/ and the kit, nothing else.
//
// It lists each ad's mechanism (the `mechanism:` line in its pitch), or the first line of its idea for older pitches,
// cut short on purpose: the agent needs to know what's been used, not to read the old ad, which would pull a new idea
// toward it (spec.md §8).
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { field, readIf, readPitch } from "./lib/queue.ts";

const ROOT = resolve(import.meta.dirname, "..");

const LONGEST = 220;
const brand = process.argv[2];
if (!brand || brand.startsWith("-")) throw new Error("Usage: bun run history <brand>");
if (!existsSync(join(ROOT, "brands", brand, "brand.md"))) throw new Error(`No brand kit at brands/${brand}/.`);

const short = (text: string) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > LONGEST ? `${line.slice(0, LONGEST - 1).trimEnd()}…` : line;
};

const queue = join(ROOT, "queue");
const rows: string[] = [];
for (const name of existsSync(queue) ? readdirSync(queue).filter((entry) => /^\d{4}-\d{2}-\d{2}-/.test(entry)).sort() : []) {
  const folder = join(queue, name);
  const text = readIf(join(folder, "pitch.md"));
  if (text === undefined || field(text, "brand") !== brand) continue;
  const readme = readIf(join(folder, "README.md")) ?? "";
  const status = /^\s*(#[^\n]*\n\s*)?\**dropped\**/im.test(readme.slice(0, 400)) ? "dropped" : existsSync(join(folder, "post.md")) ? "handed off" : "pitched";
  const what = field(text, "mechanism") ?? readPitch(folder)?.idea.split("\n")[0] ?? "";
  rows.push(`- ${name} (${status}): ${short(what) || "no idea line"}`);
}

const notes = readIf(join(ROOT, "brands", brand, "notes.md"))?.trim();
console.log(`# ${brand}: what's been done\n`);
console.log(rows.length ? rows.join("\n") : "No ads for this brand in queue/ yet.");
console.log("\nA new idea needs a different mechanism from these, unless the brief asks for a follow-up. Don't open the old ads to compare: this list is enough.");
console.log(notes ? `\n# The user's notes for ${brand} (brands/${brand}/notes.md)\n\n${notes.replace(/^#[^\n]*\n+/, "")}` : `\nNo notes for ${brand} yet (brands/${brand}/notes.md).`);
