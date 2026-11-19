// bun run export-public [--to <dir>] [--dry-run]   Copies the public part of nykma into <dir> (default ../nykma-public),
// the working tree of the public repo. publish.json is the allowlist: brands, ads and folders it doesn't name stay
// private. It drops every other file in <dir> but keeps its .git, so a commit there shows exactly what changed.
// It stops before copying anything when an exported text file matches `blocked` (a client's name, a local path).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: { to: { type: "string" }, "dry-run": { type: "boolean" } } });
const target = resolve(values.to ?? join(ROOT, "..", "nykma-public"));
const dryRun = values["dry-run"] ?? false;

type Config = {
  brands: string[];
  brandFilesKept: { drop: string[] };
  ads: string[];
  dropPaths: string[];
  keepPaths: string[];
  blocked: string[];
};
const config: Config = JSON.parse(readFileSync(join(ROOT, "publish.json"), "utf8"));
const brands = new Set(config.brands);
const ads = new Set(config.ads);

if (target === ROOT || !relative(ROOT, target).startsWith("..")) {
  console.error(`--to has to be outside the repo, not ${target}.`);
  process.exit(1);
}

// Every ad there is, listed or not, so a script named after an unlisted ad can be told from a shared one.
const allAds = new Set([...readdirSync(join(ROOT, "src/ads")), ...readdirSync(join(ROOT, "public/ads"))]);
for (const ad of ads) if (!existsSync(join(ROOT, "src/ads", ad))) console.warn(`publish.json lists ${ad}, but src/ads/${ad}/ doesn't exist.`);

const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 })
  .split("\0")
  .filter((file) => file && existsSync(join(ROOT, file)));

const adOfScript = (name: string) => [...allAds].filter((ad) => name.startsWith(`${ad}-`)).sort((a, b) => b.length - a.length)[0];

function keep(file: string): boolean {
  if (config.keepPaths.some((path) => file.startsWith(path))) return true;
  if (config.dropPaths.some((path) => file === path || file.startsWith(path))) return false;
  const parts = file.split("/");
  if (parts[0] === "brands" && parts.length > 2) return brands.has(parts[1]) && !(parts.length === 3 && config.brandFilesKept.drop.includes(parts[2]));
  if ((file.startsWith("src/ads/") || file.startsWith("public/ads/")) && parts.length > 3) return ads.has(parts[2]);
  if (file.startsWith("scripts/audio/")) {
    const ad = adOfScript(parts[2]);
    return !ad || ads.has(ad);
  }
  if (file.startsWith("evals/briefs/")) {
    const brand = parts[2].split("-")[0];
    return [...brands].some((name) => parts[2].startsWith(`${name}-`)) || !brand;
  }
  return true;
}

const kept = files.filter(keep);

// The registry imports every ad, so it's rewritten to the listed ones. Anything else that still names an unlisted
// ad's folder would break the public build, so it stops the export.
const registry = readFileSync(join(ROOT, "src/registry.ts"), "utf8")
  .split("\n")
  .filter((line) => {
    const imported = line.match(/from "\.\/ads\/([^/"]+)\//)?.[1];
    const defined = line.match(/defineAd\(\{ slug: "([^"]+)"/)?.[1];
    const slug = imported ?? defined;
    return !slug || ads.has(slug);
  })
  .join("\n");

const PRIVATE_LINE = "<!-" + "- private -->";
const TEXT = /\.(md|ts|tsx|js|mjs|cjs|json|txt|py|yml|yaml|html|css|svg|toml|example)$|(^|\/)(LICENSE|\.gitignore)$/;
const blocked = config.blocked.map((pattern) => new RegExp(pattern, "i"));
const unlisted = [...allAds].filter((ad) => !ads.has(ad));
const unlistedRef = unlisted.length ? new RegExp(`ads/(${unlisted.map((ad) => ad.replace(/[-]/g, "\\-")).join("|")})/`) : null;

const problems: string[] = [];
const warnings: string[] = [];
let bytes = 0;
for (const file of kept) {
  const size = statSync(join(ROOT, file)).size;
  bytes += size;
  if (size > 50 * 1024 * 1024) problems.push(`${file}: ${(size / 1024 / 1024).toFixed(0)} MB, over GitHub's 50 MB warning`);
  if (!TEXT.test(file)) continue;
  const text = file === "src/registry.ts" ? registry : readFileSync(join(ROOT, file), "utf8");
  text.split("\n").forEach((line, index) => {
    for (const pattern of blocked) if (pattern.test(line)) problems.push(`${file}:${index + 1}: matches ${pattern.source}: ${line.trim().slice(0, 140)}`);
    if (unlistedRef?.test(line) && /\.(ts|tsx|js|mjs)$/.test(file)) problems.push(`${file}:${index + 1}: uses an unlisted ad: ${line.trim().slice(0, 140)}`);
    else if (unlisted.some((ad) => line.includes(ad)) && /\.md$/.test(file)) warnings.push(`${file}:${index + 1}: names an unlisted ad`);
  });
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(`${kept.length} of ${files.length} files, ${mb(bytes)}, from ${config.ads.length} ads and ${config.brands.length} brands.`);
if (warnings.length) console.log(`\n${warnings.length} mentions of unlisted ads in docs (left as they are):\n  ${warnings.slice(0, 15).join("\n  ")}${warnings.length > 15 ? "\n  ..." : ""}`);
if (problems.length) {
  console.error(`\nNot exported. Fix these in this repo, or change publish.json:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
if (dryRun) {
  console.log(`\nDry run: nothing written. It would go to ${target}.`);
  process.exit(0);
}

mkdirSync(target, { recursive: true });
for (const entry of readdirSync(target)) if (entry !== ".git") rmSync(join(target, entry), { recursive: true, force: true });
for (const file of kept) {
  const to = join(target, file.split("/").join(sep));
  mkdirSync(dirname(to), { recursive: true });
  if (file === "src/registry.ts") writeFileSync(to, registry);
  else if (TEXT.test(file) && readFileSync(join(ROOT, file), "utf8").includes(PRIVATE_LINE)) {
    writeFileSync(to, readFileSync(join(ROOT, file), "utf8").split("\n").filter((line) => !line.includes(PRIVATE_LINE)).join("\n"));
  } else cpSync(join(ROOT, file), to);
}
console.log(`\nWrote ${target}. Nothing is committed or pushed: look at \`git status\` there first.`);
