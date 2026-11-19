/**
 * The agent's instructions, and each brand's own version of them (spec.md §10.11). The defaults are the repo's files.
 * A brand's edits are copies in brands/<brand>/knowledge/, at the same path with the leading dots dropped, so
 * `.claude/agents/ad-agent.md` becomes `brands/<brand>/knowledge/claude/agents/ad-agent.md`.
 *
 * A run for a brand with any edits starts with `.claude/agents/ad-agent-for-<brand>.md` (gitignored), written fresh at
 * every start: the brand's ad-agent.md (or the default), plus a list of its other files to read instead of the defaults.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const BRANDS = join(ROOT, "brands");
const AGENT = ".claude/agents/ad-agent.md";
const REVIEWER = ".claude/agents/ad-reviewer.md";
const EXPLORER = ".claude/agents/concept-explorer.md";
const CLAIMS = ".claude/agents/claims-checker.md";
const NAME = /^[a-z0-9][a-z0-9_-]*$/i;

/** Everything the agent is told, in the order the desk shows it, in its groups. */
export const INSTRUCTIONS = [
  { path: AGENT, group: "Agents", title: "The agent", about: "ad-agent's own prompt: the hard rules, the stages, how it finds the idea, and the craft." },
  { path: EXPLORER, group: "Agents", title: "Concept explorer", about: "The three explorers ad-agent starts before a pitch, each down a different route." },
  { path: CLAIMS, group: "Agents", title: "Claims checker", about: "What bun run claims asks about a pitch against its brand kit, before you see the pitch." },
  { path: REVIEWER, group: "Agents", title: "The reviewer", about: "What bun run review asks about an ad's stills, when you ask for checks." },
  { path: "CLAUDE.md", group: "Project", title: "Project rules", about: "The commands, code rules and limits Claude Code loads for every session here." },
  { path: "queue/_template/pitch.md", group: "Project", title: "Pitch template", about: "What every pitch.md starts from." },
  { path: ".claude/guides/build.md", group: "Guides", title: "Build", about: "Read once you say go: code, scenes, commands, and what to look for before rendering." },
  { path: ".claude/guides/engine.md", group: "Guides", title: "Engine", about: "Read once you say go: what the engine and the parts bin can do, so the build doesn't learn it from old ads." },
  { path: ".claude/guides/3d.md", group: "Guides", title: "3D", about: "Read when an idea needs depth: CSS 3D, three.js or Blender, and how each stays a function of the frame." },
  { path: ".claude/guides/thumbnail.md", group: "Guides", title: "Thumbnail", about: "Read when the brief asks for a thumbnail: what makes a cover work, and how it's made and rendered." },
  { path: ".claude/guides/footage.md", group: "Guides", title: "Footage", about: "Read when you give the agent video." },
  { path: ".claude/guides/stock.md", group: "Guides", title: "Free stock", about: "Read when the idea needs a shot code can't make." },
  { path: ".claude/guides/generated.md", group: "Guides", title: "Generated media", about: "Read before the agent proposes a generated still or video, when stock has nothing." },
  { path: ".claude/guides/hebrew.md", group: "Guides", title: "Hebrew", about: "Read for any ad in Hebrew, from the first idea on." },
  { path: ".claude/guides/checks.md", group: "Guides", title: "Checks", about: "Read when you say \"check it\"." },
  { path: ".claude/guides/hand-off.md", group: "Guides", title: "Hand-off", about: "Read when the ad is done." },
  { path: ".claude/guides/brand-kit.md", group: "Guides", title: "Brand kit", about: "Read when you ask for a new brand kit or a refresh." },
] as const;

export type InstructionFile = (typeof INSTRUCTIONS)[number] & { edited?: boolean };

const known = (path: string) => INSTRUCTIONS.some((file) => file.path === path);
const isBrand = (brand?: string): brand is string => Boolean(brand && NAME.test(brand) && existsSync(join(BRANDS, brand)));

/** Where a brand keeps its version of path. */
const overridePath = (brand: string, path: string) => join(BRANDS, brand, "knowledge", ...path.split("/").map((part) => part.replace(/^\.+/, "")));
const fromRoot = (path: string) => relative(ROOT, path).split(sep).join("/");
const brandHas = (brand: string, path: string) => existsSync(overridePath(brand, path));

export function instructions(brand?: string): InstructionFile[] {
  return INSTRUCTIONS.map((file) => ({ ...file, edited: isBrand(brand) ? brandHas(brand, file.path) : undefined }));
}

/** The default, and the brand's version if it has one. */
export function readInstruction(path: string, brand?: string) {
  if (!known(path)) throw new Error("That isn't one of the agent's files.");
  const base = readFileSync(join(ROOT, path), "utf8");
  const mine = isBrand(brand) && brandHas(brand, path) ? readFileSync(overridePath(brand, path), "utf8") : undefined;
  return { path, base, text: mine ?? base, edited: mine !== undefined, where: isBrand(brand) ? fromRoot(overridePath(brand, path)) : path };
}

/** With a brand, saves its version. Without one, changes the default, the repo's file. */
export function saveInstruction(path: string, text: string, brand?: string) {
  if (!known(path)) throw new Error("That isn't one of the agent's files.");
  if (brand !== undefined && !isBrand(brand)) throw new Error("No such brand kit.");
  const target = brand ? overridePath(brand, path) : join(ROOT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  return readInstruction(path, brand);
}

/** Deletes the brand's version, so it reads the default again. */
export function resetInstruction(path: string, brand: string) {
  if (!known(path)) throw new Error("That isn't one of the agent's files.");
  if (!isBrand(brand)) throw new Error("No such brand kit.");
  const target = overridePath(brand, path);
  if (existsSync(target)) unlinkSync(target);
  // Take away the folders it leaves empty, up to knowledge/ itself.
  const top = join(BRANDS, brand);
  for (let dir = dirname(target); dir.startsWith(top + sep) && dir !== top; dir = dirname(dir)) {
    if (readdirSync(dir).length) break;
    rmdirSync(dir);
  }
  return readInstruction(path, brand);
}

/** How many of the agent's files the brand has its own version of. */
export const editedCount = (brand: string) => (isBrand(brand) ? INSTRUCTIONS.filter((file) => brandHas(brand, file.path)).length : 0);

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * The agent a run starts with: ad-agent when the brand has no edits that reach it, or a copy written now with them.
 * The reviewer and the claims checker aren't part of the run (their scripts read them), so they don't count.
 */
export function agentFor(brand?: string): string {
  if (!isBrand(brand)) return "ad-agent";
  const id = `ad-agent-for-${brand.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const generated = join(ROOT, ".claude", "agents", `${id}.md`);
  const edited = INSTRUCTIONS.filter((file) => file.path !== REVIEWER && file.path !== CLAIMS && brandHas(brand, file.path));
  if (!edited.length) {
    if (existsSync(generated)) unlinkSync(generated);
    return "ad-agent";
  }
  const source = readFileSync(brandHas(brand, AGENT) ? overridePath(brand, AGENT) : join(ROOT, AGENT), "utf8");
  const [, front = "", body = source] = source.match(FRONT) ?? [];
  const fields = front
    .split(/\r?\n/)
    .filter((line) => !/^(name|description):/.test(line))
    .join("\n");
  const description = `ad-agent with the ${brand} brand's edits. The desk writes this file at every run from brands/${brand}/knowledge/: edit there, not here.`;
  const at = (path: string) => fromRoot(overridePath(brand, path));
  const others = edited.filter((file) => file.path !== AGENT && file.path !== "CLAUDE.md" && file.path !== EXPLORER);
  const notes = [
    `## ${brand}'s own instructions`,
    "",
    `The user edited some of your instructions for ${brand}, and their edits come before the defaults.`,
    ...(brandHas(brand, "CLAUDE.md")
      ? ["", `- **CLAUDE.md:** the project's CLAUDE.md is loaded for you, but ${brand} has its own: read \`${at("CLAUDE.md")}\` before anything else. Where the two differ, the brand's wins.`]
      : []),
    ...(others.length ? ["", "Wherever you're sent to a file on the left, read the one on the right instead:", "", ...others.map((file) => `- \`${file.path}\` → \`${at(file.path)}\``)] : []),
    ...(brandHas(brand, EXPLORER)
      ? ["", `- **Concept explorers:** ${brand} has its own version of their instructions. Start each explorer's brief with: "Read \`${at(EXPLORER)}\` first: it's ${brand}'s version of your instructions, and where it differs from them, it wins."`]
      : []),
  ];
  writeFileSync(generated, `---\nname: ${id}\ndescription: ${description}\n${fields ? `${fields}\n` : ""}---\n\n${body.trim()}\n\n${notes.join("\n")}\n`);
  return id;
}

/** Every instruction file as a run for this brand reads it: the brand's version where it has one. Repo path → text. */
export function instructionTexts(brand?: string): Map<string, string> {
  const texts = new Map<string, string>();
  for (const file of INSTRUCTIONS) {
    const path = isBrand(brand) && brandHas(brand, file.path) ? overridePath(brand, file.path) : join(ROOT, file.path);
    if (existsSync(path)) texts.set(file.path, readFileSync(path, "utf8").replace(/\r\n/g, "\n"));
  }
  return texts;
}

/** The claims checker's prompt for a pitch of this brand: the brand's version if it has one. */
export function claimsCheckerText(brand?: string) {
  return readFileSync(isBrand(brand) && brandHas(brand, CLAIMS) ? overridePath(brand, CLAIMS) : join(ROOT, CLAIMS), "utf8");
}

/** The reviewer's prompt for an ad of this brand: the brand's version if it has one. */
export function reviewerText(brand?: string) {
  return readFileSync(isBrand(brand) && brandHas(brand, REVIEWER) ? overridePath(brand, REVIEWER) : join(ROOT, REVIEWER), "utf8");
}
