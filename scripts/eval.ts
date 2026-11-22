// bun run eval <version> [--briefs a,b] [--runs 2] [--label name] [--build]   runs a prompt version on the briefs (spends tokens)
// bun run eval snapshot <name>                                       freezes the live instructions as a version
// bun run eval compare <labelA> <labelB>                             how the two worked, side by side: tools, cost, traces, MP4s (free)
// bun run eval blind <labelA> <labelB>                               a blind sheet comparing their pitches (free)
// bun run eval score <labelA> <labelB>                               tallies the filled-in sheet (free)
// bun run eval trace <label>                                         rewrites each run's trace.md from its events.jsonl (free)
//
// A version is a folder in evals/prompt-versions/ that mirrors repo paths (`.claude/agents/ad-agent.md`, `CLAUDE.md`,
// `queue/_template/pitch.md`, ...), plus a VERSION.md saying what it is. `current` is the working copy as it is now.
// Each run happens in a throwaway git worktree of HEAD with the working copy and then the version laid over it, so the
// tooling is today's and the version's own CLAUDE.md
// and agents load and nothing touches this checkout.
//
// Without --build a run is the pitch stage only, and everything that costs money, needs the desk or takes long is
// switched off. With --build the same session then gets "go", builds the ad and stops at the first look, rendering the
// MP4s: the worktree links to node_modules, .venv and .env.local (for ElevenLabs, within the pitch's estimate), and only
// free stock, generated media, footage and review stay off, the same for every version. evals/README.md has the method.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { SECRET_ENV } from "./lib/keys.ts";
import { INSTRUCTIONS } from "./lib/agents.ts";
import { AGENT_ENV, ALLOWED, DENIED } from "./lib/permissions.ts";
import { field, folderSlug, readIf, section } from "./lib/queue.ts";
import { briefFor, readSettings, type Ratio } from "./lib/settings.ts";

const ROOT = resolve(import.meta.dirname, "..");
const EVALS = join(ROOT, "evals");
const VERSIONS = join(EVALS, "prompt-versions");
const BRIEFS = join(EVALS, "briefs");
const RESULTS = join(EVALS, "results");
const PITCH_TIMEOUT = 20 * 60 * 1000;
const BUILD_TIMEOUT = 90 * 60 * 1000;

/** The files that make up "the instructions", for a snapshot: the same list the desk edits and `stamp` hashes. */
const INSTRUCTION_FILES = INSTRUCTIONS.map((file) => file.path);

// Off at the pitch, on top of the desk's own denials.
const PITCH_DENIED = [
  "Bash(bun run stock:*)", "Bash(bun run gen:*)", "Bash(bun run animatic:*)", "Bash(bun run render:*)", "Bash(bun run stills:*)",
  "Bash(bun run footage:*)", "Bash(bun run screen:*)", "Bash(.venv/Scripts/python:*)", "Bash(.venv/bin/python:*)", "Bash(bun run dev:*)",
];
// Off at the build: what needs the desk, spends generated-media money, or is a check the user hasn't asked for.
const BUILD_DENIED = ["Bash(bun run stock:*)", "Bash(bun run gen:*)", "Bash(bun run footage:*)", "Bash(bun run screen:*)", "Bash(bun run dev:*)", "Bash(bun run review:*)"];

const PITCH_NOTE =
  "(Eval run: this tests the pitch stage only. Write the pitch as usual and stop after it. Commands that cost money, need the desk or take long (stock, gen, animatic, mv.py, render, stills) are switched off here: skip them, and write \"not run (eval)\" where their results would go.)";
const BUILD_NOTE =
  "go\n\n(Eval run: build the pitch now and stop at the first look: render every ratio the registry line lists and copy the files to the queue folder, as you would for the user. Free stock and generated media are switched off in an eval, so make any shot the pitch planned from them in code instead, and say so. ElevenLabs is on, within what the pitch planned.)";

/** What a build-mode worktree links to in this checkout. Never read or copied: linked, and unlinked before removal. */
const LINKS = [
  { path: "node_modules", kind: "dir" },
  { path: ".venv", kind: "dir" },
  { path: ".env.local", kind: "file" },
] as const;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { briefs: { type: "string" }, runs: { type: "string" }, label: { type: "string" }, build: { type: "boolean" } },
});
const [command, ...rest] = positionals;

const git = (args: string[], cwd = ROOT) => {
  const out = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (out.status !== 0) throw new Error(`git ${args.join(" ")}: ${out.stderr.trim()}`);
  return out.stdout;
};
const posix = (path: string) => path.split(sep).join("/");
const filesUnder = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)])) : [];

/** Repo-relative path → absolute source file, for what a version lays over HEAD. */
function overlay(version: string): Map<string, string> {
  // Every version runs on the working copy's tooling (HEAD plus everything changed or new, not ignored files), so the
  // instructions are the only thing that differs. `current` is that alone; a version lays its own files on top.
  const files = new Map<string, string>();
  const changed = git(["ls-files", "--modified", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean);
  for (const path of changed) if (existsSync(join(ROOT, path)) && !path.startsWith("evals/results/")) files.set(path, join(ROOT, path));
  if (version === "current") return files;
  const dir = join(VERSIONS, version);
  if (!existsSync(join(dir, ".claude", "agents", "ad-agent.md"))) throw new Error(`No version at evals/prompt-versions/${version}/ (it needs .claude/agents/ad-agent.md).`);
  for (const file of filesUnder(dir)) {
    const path = posix(relative(dir, file));
    if (path !== "VERSION.md") files.set(path, file);
  }
  return files;
}

type Brief = { id: string; brand?: string; ratios: Ratio[]; text: string };

function readBriefs(only?: string[]): Brief[] {
  const all = readdirSync(BRIEFS).filter((name) => name.endsWith(".md")).sort();
  const picked = only ? only.map((id) => `${id.replace(/\.md$/, "")}.md`) : all;
  return picked.map((name) => {
    if (!all.includes(name)) throw new Error(`No brief evals/briefs/${name}.`);
    const raw = readFileSync(join(BRIEFS, name), "utf8");
    const brand = field(raw, "brand");
    const ratios = (field(raw, "layouts") ?? "1x1").split(/[,\s]+/).filter(Boolean) as Ratio[];
    // What the user would type: the brief without its title, its fields and the expected behaviour.
    const text = raw
      .replace(/^##\s+Expected[\s\S]*$/m, "")
      .replace(/^#\s.*$/m, "")
      .replace(/^(brand|layouts):.*$/gm, "")
      .trim();
    return { id: name.replace(/\.md$/, ""), brand, ratios, text };
  });
}

function promptFor(brief: Brief) {
  const settings = readSettings();
  return `${brief.text}${brief.brand ? `\n\nBrand: ${brief.brand}` : ""}\n${briefFor(settings, { ratios: brief.ratios, pitch: true })}\n\n${PITCH_NOTE}`;
}

/** Takes the links out of a worktree, so removing it can't reach what they point at. */
function unlinkFrom(tree: string) {
  for (const link of LINKS) {
    const at = join(tree, link.path);
    try {
      const stat = lstatSync(at);
      if (stat.isSymbolicLink() || (link.kind === "file" && stat.isFile())) unlinkSync(at);
    } catch {}
  }
}

/** A fresh worktree of HEAD with the version on top. */
function makeTree(label: string, files: Map<string, string>, build: boolean) {
  const tree = join(tmpdir(), `nykma-eval-${label}`);
  if (existsSync(tree)) {
    unlinkFrom(tree);
    spawnSync("git", ["worktree", "remove", "--force", tree], { cwd: ROOT });
    rmSync(tree, { recursive: true, force: true });
  }
  git(["worktree", "prune"]);
  git(["worktree", "add", "--detach", "--quiet", tree, "HEAD"]);
  if (build)
    for (const link of LINKS) {
      const from = join(ROOT, link.path);
      if (!existsSync(from)) continue;
      if (link.kind === "dir") symlinkSync(from, join(tree, link.path), "junction");
      else linkSync(from, join(tree, link.path));
    }
  const lay = () => {
    for (const [path, from] of files) {
      mkdirSync(dirname(join(tree, path)), { recursive: true });
      cpSync(from, join(tree, path));
    }
    // The desk's settings (gitignored) decide the defaults the brief lines don't cover.
    if (existsSync(join(ROOT, "settings.json"))) cpSync(join(ROOT, "settings.json"), join(tree, "settings.json"));
  };
  lay();
  return {
    tree,
    /** Back to HEAD plus the version, for the next run. Ignored files (the links, out/, gen/) stay. */
    reset() {
      git(["reset", "--hard", "--quiet"], tree);
      git(["clean", "-fdq"], tree);
      lay();
    },
    remove() {
      unlinkFrom(tree);
      spawnSync("git", ["worktree", "remove", "--force", tree], { cwd: ROOT });
      rmSync(tree, { recursive: true, force: true });
    },
  };
}

const queueDirs = (tree: string) => (existsSync(join(tree, "queue")) ? readdirSync(join(tree, "queue")).filter((name) => /^\d{4}-\d{2}-\d{2}-/.test(name)) : []);

/** What one stage of a run did. */
type Stage = {
  cost?: number; turns?: number; seconds?: number; error?: string;
  /** Tool calls by name: the agent's own, and its subagents'. */
  tools: Record<string, number>; subagentTools: Record<string, number>;
  /** Tool calls refused by a permission rule (the eval's switched-off commands, mostly). */
  refused: number;
};

type Meta = Partial<Stage> & {
  version: string; brief: string; run: number; model?: string; effort?: string;
  explorers: number; oldAdsRead: string[]; guidesRead: string[]; pitch: boolean;
  /** The queue folder the pitch made, and files the pitch read outside the worktree (a Claude memory folder, say). */
  folder?: string; outsideReads?: string[];
  /** The build stage, with --build: what it did and the files it rendered. */
  build?: Stage & { files: string[] };
};

const count = (into: Record<string, number>, name: string) => void (into[name] = (into[name] ?? 0) + 1);

/** The text of a tool result, which is a string or a list of parts. */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part: any) => (typeof part === "string" ? part : part?.text ?? "")).join("\n");
  return "";
}

/** One claude -p call in the tree: a new session, or `resume` to carry on one. */
function runClaude(tree: string, prompt: string, options: { deny: string[]; timeout: number; resume?: string }) {
  const settings = readSettings();
  const args = [
    "-p", "--agent", "ad-agent", "--output-format", "stream-json", "--verbose",
    "--allowedTools", ALLOWED.join(","), "--disallowedTools", [...DENIED, ...options.deny].join(","),
    ...(settings.claude.model ? ["--model", settings.claude.model] : []),
    ...(settings.claude.effort ? ["--effort", settings.claude.effort] : []),
    "--strict-mcp-config",
    ...(options.resume ? ["--resume", options.resume] : []),
  ];
  const [bin, ...before] = (process.env.NYKMA_CLAUDE ?? settings.claude.bin).split(" ");
  const env: NodeJS.ProcessEnv = { ...process.env, ...AGENT_ENV };
  for (const name of SECRET_ENV) delete env[name];
  delete env.NYKMA_DESK_URL;
  delete env.NYKMA_DESK_TOKEN;

  const stage: Stage = { tools: {}, subagentTools: {}, refused: 0 };
  const seen = { explorers: 0, looked: [] as string[], guides: [] as string[] };
  let reply = "";
  let log = "";
  let session = options.resume;
  const start = Date.now();
  return new Promise<{ stage: Stage; seen: typeof seen; reply: string; log: string; session?: string }>((done) => {
    const child = spawn(bin, [...before, ...args], { cwd: tree, stdio: ["pipe", "pipe", "pipe"], env });
    const timer = setTimeout(() => child.kill(), options.timeout);
    let buffer = "";
    let errors = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let at: number;
      while ((at = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, at).trim();
        buffer = buffer.slice(at + 1);
        if (!line) continue;
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        // Seconds since the stage started, for the trace.
        event._t = Math.round((Date.now() - start) / 100) / 10;
        log += `${JSON.stringify(event)}\n`;
        if (event.session_id) session = event.session_id;
        if (event.type === "assistant") {
          for (const part of event.message?.content ?? []) {
            if (part.type !== "tool_use") continue;
            count(event.parent_tool_use_id ? stage.subagentTools : stage.tools, part.name);
            if (event.parent_tool_use_id) continue;
            if (part.name === "Agent" || part.name === "Task") seen.explorers++;
            const path = posix(String(part.input?.file_path ?? part.input?.path ?? part.input?.pattern ?? ""));
            // Looking, not writing. The run's own new queue folder is taken out once the run is over.
            const old = ["Read", "Grep", "Glob"].includes(part.name) ? path.match(/(src\/ads\/.*|queue\/\d{4}-\d{2}-\d{2}-.*)$/)?.[1] : undefined;
            if (old && !seen.looked.includes(old)) seen.looked.push(old);
            const guide = path.match(/(\.claude\/guides\/.*)$/)?.[1];
            if (guide && !seen.guides.includes(guide)) seen.guides.push(guide);
          }
        }
        if (event.type === "user") {
          for (const part of event.message?.content ?? [])
            if (part.type === "tool_result" && part.is_error && /permission|denied|not allowed/i.test(resultText(part.content))) stage.refused++;
        }
        if (event.type === "result") {
          reply = String(event.result ?? "");
          stage.cost = event.total_cost_usd;
          stage.turns = event.num_turns;
          stage.seconds = event.duration_ms ? Math.round(event.duration_ms / 1000) : undefined;
          if (event.is_error) stage.error = String(event.subtype ?? "error");
        }
      }
    });
    child.stderr.on("data", (chunk) => (errors += chunk));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stage.error) stage.error = `exit ${code}: ${errors.trim().slice(-400)}`;
      done({ stage, seen, reply, log, session });
    });
    child.stdin.end(prompt);
  });
}

const money = (cost?: number) => `$${(cost ?? 0).toFixed(2)}`;

/**
 * What a stage looked at that it shouldn't need while finding an idea: old ads and pitches (by the file tools or by
 * cat, head, grep and the like in the shell), and files outside the worktree, such as a Claude memory folder.
 */
function lookedAt(log: string, own: (path: string) => boolean) {
  const old = new Set<string>();
  const outside = new Set<string>();
  const READS = /^\s*(cat|head|tail|sed|grep|rg|less|more|ls|find|awk|wc)\b/;
  for (const line of log.split("\n")) {
    if (!line.includes('"tool_use"')) continue;
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== "assistant" || event.parent_tool_use_id) continue;
    for (const part of event.message?.content ?? []) {
      if (part.type !== "tool_use") continue;
      const input = part.input ?? {};
      let targets: string[] = [];
      if (["Read", "Grep", "Glob"].includes(part.name)) targets = [input.file_path, input.path, input.pattern].filter(Boolean).map((value: string) => posix(String(value)));
      if (part.name === "Bash")
        targets = String(input.command ?? "")
          .split(/&&|;|\|\|?/)
          .filter((piece) => READS.test(piece))
          .flatMap((piece) => piece.split(/\s+/).map((word) => posix(word.replace(/^["']|["']$/g, ""))));
      for (const target of targets) {
        const inTree = target.replace(/^.*?nykma-eval-[^/]+\//, "");
        const ad = inTree.match(/^(src\/ads(\/[^\s]*)?|queue(\/(\d{4}-\d{2}-\d{2}-|\*)[^\s]*)?)$/)?.[0];
        if (ad && !own(ad)) old.add(part.name === "Read" ? ad : `${ad} (${part.name})`);
        if (/^([A-Za-z]:\/|\/|~\/)/.test(target) && !/nykma-eval-/.test(target) && part.name !== "Bash") outside.add(target);
      }
    }
  }
  return { old: [...old], outside: [...outside] };
}

async function evaluate(version: string) {
  const build = Boolean(values.build);
  const label = values.label ?? (version === "current" ? `current-${new Date().toISOString().slice(0, 10)}` : version);
  const runs = Math.max(1, Number(values.runs ?? 1));
  const briefs = readBriefs(values.briefs?.split(","));
  const files = overlay(version);
  const settings = readSettings();
  console.log(
    `${label}: ${briefs.length} brief${briefs.length === 1 ? "" : "s"} × ${runs} run${runs === 1 ? "" : "s"}${build ? ", pitch then build" : ", pitch only"}, ${files.size} file${files.size === 1 ? "" : "s"} over HEAD. This spends Claude tokens${build ? " and the ElevenLabs credits the pitches plan" : ""}.`,
  );
  const work = makeTree(label, files, build);
  try {
    for (const brief of briefs) {
      for (let run = 1; run <= runs; run++) {
        work.reset();
        const before = new Set(queueDirs(work.tree));
        const out = join(RESULTS, label, brief.id, String(run));
        rmSync(out, { recursive: true, force: true });
        mkdirSync(out, { recursive: true });
        process.stdout.write(`  ${brief.id} #${run} pitch … `);

        const pitched = await runClaude(work.tree, promptFor(brief), { deny: PITCH_DENIED, timeout: PITCH_TIMEOUT });
        const made = queueDirs(work.tree).filter((name) => !before.has(name));
        const folder = made.find((name) => existsSync(join(work.tree, "queue", name, "pitch.md")));
        const own = ownedBy(made);
        const looked = lookedAt(pitched.log, own);
        const meta: Meta = {
          version, brief: brief.id, run, model: settings.claude.model, effort: settings.claude.effort,
          explorers: pitched.seen.explorers, oldAdsRead: looked.old, outsideReads: looked.outside, guidesRead: pitched.seen.guides, pitch: Boolean(folder), folder,
          ...pitched.stage,
        };
        if (folder) cpSync(join(work.tree, "queue", folder, "pitch.md"), join(out, "pitch.md"));
        writeFileSync(join(out, "reply.md"), `${pitched.reply.trim()}\n`);
        writeFileSync(join(out, "events.jsonl"), pitched.log);
        console.log(pitched.stage.error ? `failed (${pitched.stage.error})` : `${folder ? "pitch" : "no pitch"}, ${meta.explorers} explorer${meta.explorers === 1 ? "" : "s"}, ${money(meta.cost)}, ${meta.seconds ?? "?"} s`);

        if (build && folder && pitched.session && !pitched.stage.error) {
          process.stdout.write(`  ${brief.id} #${run} build … `);
          const built = await runClaude(work.tree, BUILD_NOTE, { deny: BUILD_DENIED, timeout: BUILD_TIMEOUT, resume: pitched.session });
          const slug = folderSlug(folder);
          const queued = join(work.tree, "queue", folder);
          const renders = existsSync(queued) ? readdirSync(queued).filter((name) => /\.(mp4|mp3|png)$/i.test(name)) : [];
          mkdirSync(join(out, "ads"), { recursive: true });
          for (const name of renders) cpSync(join(queued, name), join(out, "ads", name));
          // The code it wrote, for comparing how the two were built.
          if (existsSync(join(work.tree, "src", "ads", slug))) cpSync(join(work.tree, "src", "ads", slug), join(out, "code"), { recursive: true });
          if (existsSync(join(queued, "pitch.md"))) cpSync(join(queued, "pitch.md"), join(out, "pitch-after-build.md"));
          writeFileSync(join(out, "build-reply.md"), `${built.reply.trim()}\n`);
          writeFileSync(join(out, "build-events.jsonl"), built.log);
          for (const guide of built.seen.guides) if (!meta.guidesRead.includes(guide)) meta.guidesRead.push(guide);
          meta.build = { ...built.stage, files: renders };
          const mp4s = renders.filter((name) => name.endsWith(".mp4")).length;
          console.log(built.stage.error ? `failed (${built.stage.error})` : `${mp4s} MP4${mp4s === 1 ? "" : "s"}, ${money(built.stage.cost)}, ${built.stage.seconds ?? "?"} s`);
        }
        writeFileSync(join(out, "trace.md"), traceFor(out, `${label} · ${brief.id} #${run}`));
        writeFileSync(join(out, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
      }
    }
  } finally {
    work.remove();
  }
  console.log(`Results in evals/results/${label}/. Compare two versions with: bun run eval compare <labelA> <labelB>`);
}

// ── Traces: what a run did, step by step ──

type Call = { id: string; name: string; input: any; t: number; result?: string; error?: boolean; children: Call[] };

/** Where a path sits in the repo, without the worktree it ran in. */
const shown = (path: string) => posix(path).replace(/^.*?nykma-eval-[^/]+\//, "");
const clip = (text: string, length: number) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > length ? `${line.slice(0, length - 1)}…` : line;
};

function describe(call: Call) {
  const input = call.input ?? {};
  switch (call.name) {
    case "Bash":
      return `\`${clip(String(input.command ?? ""), 160)}\``;
    case "Read":
      return `\`${shown(String(input.file_path ?? ""))}\``;
    case "Write":
      return `\`${shown(String(input.file_path ?? ""))}\` (${String(input.content ?? "").length} chars)`;
    case "Edit":
      return `\`${shown(String(input.file_path ?? ""))}\``;
    case "Glob":
    case "Grep":
      return `\`${clip(String(input.pattern ?? ""), 80)}\`${input.path ? ` in \`${shown(String(input.path))}\`` : ""}`;
    case "Agent":
    case "Task":
      return `**${input.subagent_type ?? "agent"}**: ${clip(String(input.description ?? ""), 100)}`;
    default:
      return clip(JSON.stringify(input), 160);
  }
}

/** One stage's events as a list of steps, with the subagents' steps under the call that started them. */
function stageTrace(log: string) {
  const calls = new Map<string, Call>();
  const top: (Call | { say: string; t: number })[] = [];
  let result: any;
  for (const line of log.split("\n")) {
    if (!line.trim()) continue;
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "assistant") {
      for (const part of event.message?.content ?? []) {
        if (part.type === "tool_use") {
          const call: Call = { id: part.id, name: part.name, input: part.input, t: event._t ?? 0, children: [] };
          calls.set(part.id, call);
          const parent = event.parent_tool_use_id ? calls.get(event.parent_tool_use_id) : undefined;
          if (parent) parent.children.push(call);
          else if (!event.parent_tool_use_id) top.push(call);
        } else if (part.type === "text" && part.text?.trim() && !event.parent_tool_use_id) top.push({ say: part.text, t: event._t ?? 0 });
      }
    }
    if (event.type === "user") {
      for (const part of event.message?.content ?? []) {
        if (part.type !== "tool_result") continue;
        const call = calls.get(part.tool_use_id);
        if (call) {
          call.result = resultText(part.content);
          call.error = Boolean(part.is_error);
        }
      }
    }
    if (event.type === "result") result = event;
  }
  const lines: string[] = [];
  const outcome = (call: Call) => {
    if (call.error) return ` → ✗ ${clip(call.result ?? "", 200)}`;
    if ((call.name === "Agent" || call.name === "Task") && call.result) {
      const titles = [...call.result.matchAll(/^#{2,4}\s+(.+)$/gm)].map((match) => clip(match[1], 60));
      return titles.length ? ` → ${titles.join(" · ")}` : ` → ${clip(call.result, 160)}`;
    }
    if (call.name === "Bash" && call.result) {
      const last = call.result.trim().split(/\r?\n/).filter(Boolean).at(-1);
      return last ? ` → ${clip(last, 120)}` : "";
    }
    return "";
  };
  for (const step of top) {
    if ("say" in step) {
      lines.push(`- \`${step.t.toFixed(0)} s\` says: ${clip(step.say, 300)}`);
      continue;
    }
    lines.push(`- \`${step.t.toFixed(0)} s\` **${step.name}** ${describe(step)}${outcome(step)}`);
    if (step.name === "Agent" || step.name === "Task") {
      if (step.input?.prompt) lines.push(`  - brief: ${clip(String(step.input.prompt), 500)}`);
      for (const child of step.children) lines.push(`  - \`${child.t.toFixed(0)} s\` ${child.name} ${describe(child)}${outcome(child)}`);
    }
  }
  if (result) lines.push("", `Done in ${Math.round((result.duration_ms ?? 0) / 1000)} s, ${result.num_turns ?? "?"} turns, ${money(result.total_cost_usd)}.`);
  return lines.join("\n");
}

function traceFor(out: string, title: string) {
  const parts = [`# ${title}`, ""];
  const pitch = readIf(join(out, "events.jsonl"));
  const build = readIf(join(out, "build-events.jsonl"));
  if (pitch) parts.push("## Pitch", "", stageTrace(pitch), "");
  else parts.push("No event log for this run (made before the runner kept one).", "");
  if (build) parts.push("## Build (after \"go\")", "", stageTrace(build), "");
  return parts.join("\n");
}

/** A run's own folders: the queue folders it made, and their ads' code. */
const ownedBy = (made: string[]) => (path: string) => made.some((name) => path.startsWith(`queue/${name}`) || path.startsWith(`src/ads/${folderSlug(name)}`));

function retrace(label: string) {
  const dirs = filesUnder(join(RESULTS, label)).filter((file) => file.endsWith("meta.json")).map(dirname);
  for (const dir of dirs) {
    writeFileSync(join(dir, "trace.md"), traceFor(dir, posix(relative(RESULTS, dir)).replace(/\//g, " · ")));
    // Runs from before the shell reads were counted get them counted now.
    const log = readIf(join(dir, "events.jsonl"));
    const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as Meta;
    const slug = (meta.folder && folderSlug(meta.folder)) ?? readIf(join(dir, "pitch.md"))?.match(/^#\s*([^:\s]+)/)?.[1];
    if (log && slug) {
      const looked = lookedAt(log, (path) => path.includes(`-${slug}`) || path.startsWith(`src/ads/${slug}`));
      meta.oldAdsRead = looked.old;
      meta.outsideReads = looked.outside;
      writeFileSync(join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
    }
  }
  console.log(`Rewrote ${dirs.length} trace${dirs.length === 1 ? "" : "s"} in evals/results/${label}/.`);
}

// ── Compare: how two versions worked, side by side ──

function compare(a: string, b: string) {
  for (const label of [a, b]) if (!existsSync(join(RESULTS, label))) throw new Error(`No results for ${label} in evals/results/.`);
  const read = (label: string, brief: string, run: string) => {
    const text = readIf(join(RESULTS, label, brief, run, "meta.json"));
    return text ? (JSON.parse(text) as Meta) : undefined;
  };
  const tools = (counts?: Record<string, number>) =>
    counts && Object.keys(counts).length
      ? Object.entries(counts)
          .sort((x, y) => y[1] - x[1])
          .map(([name, n]) => `${name} ${n}`)
          .join(", ")
      : "–";
  const parts = [`# ${a} vs ${b}`, "", "How each version worked on the same briefs: what it used, what it cost, and where its trace, pitch and renders are. This isn't blind: for the pitches alone, use `bun run eval blind`.", ""];
  let pairs = 0;
  for (const brief of readdirSync(join(RESULTS, a)).filter((name) => existsSync(join(RESULTS, b, name))).sort()) {
    for (const run of readdirSync(join(RESULTS, a, brief)).sort()) {
      const ma = read(a, brief, run);
      const mb = read(b, brief, run);
      if (!ma || !mb) continue;
      pairs++;
      const link = (label: string, file: string) => (existsSync(join(RESULTS, label, brief, run, file)) ? `[${file}](${label}/${brief}/${run}/${file})` : "–");
      const ads = (label: string, meta: Meta) =>
        meta.build?.files.filter((name) => name.endsWith(".mp4")).map((name) => `[${name}](${label}/${brief}/${run}/ads/${name})`).join("<br>") || "–";
      const row = (name: string, pick: (meta: Meta, label: string) => string) => `| ${name} | ${pick(ma, a)} | ${pick(mb, b)} |`;
      parts.push(
        `## ${brief} #${run}`, "",
        `| | ${a} | ${b} |`, "|---|---|---|",
        row("Pitch: cost, time, turns", (m) => `${money(m.cost)}, ${m.seconds ?? "?"} s, ${m.turns ?? "?"}`),
        row("Pitch: tools", (m) => tools(m.tools)),
        row("Pitch: subagents' tools", (m) => tools(m.subagentTools)),
        row("Explorers started", (m) => String(m.explorers)),
        row("Old ads opened at the pitch", (m) => (m.oldAdsRead.length ? m.oldAdsRead.map((path) => `\`${path}\``).join("<br>") : "none")),
        row("Read outside the repo at the pitch", (m) => (m.outsideReads?.length ? m.outsideReads.map((path) => `\`${path}\``).join("<br>") : "none")),
        row("Guides read", (m) => (m.guidesRead.length ? m.guidesRead.map((path) => `\`${path.replace(".claude/guides/", "")}\``).join(", ") : "none")),
        row("Refused by a permission", (m) => String((m.refused ?? 0) + (m.build?.refused ?? 0))),
        row("Build: cost, time, turns", (m) => (m.build ? `${money(m.build.cost)}, ${m.build.seconds ?? "?"} s, ${m.build.turns ?? "?"}` : "not built")),
        row("Build: tools", (m) => tools(m.build?.tools)),
        row("Build: error", (m) => m.build?.error ?? (m.build ? "none" : "–")),
        row("Total", (m) => `${money((m.cost ?? 0) + (m.build?.cost ?? 0))}, ${Math.round(((m.seconds ?? 0) + (m.build?.seconds ?? 0)) / 60)} min`),
        row("MP4s", (m, label) => ads(label, m)),
        row("Files", (_m, label) => [link(label, "trace.md"), link(label, "pitch.md"), link(label, "reply.md"), link(label, "build-reply.md")].join(" · ")),
        "",
      );
    }
  }
  if (!pairs) throw new Error(`No brief has results from both ${a} and ${b}.`);
  const path = join(RESULTS, `compare-${a}-vs-${b}.md`);
  writeFileSync(path, parts.join("\n"));
  console.log(`${pairs} pair${pairs === 1 ? "" : "s"} in ${posix(relative(ROOT, path))}.`);
}

function snapshot(name: string) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name) || name === "current") throw new Error("Give the version a plain name, like b-2026-11-08-lean-core.");
  const dir = join(VERSIONS, name);
  if (existsSync(dir)) throw new Error(`evals/prompt-versions/${name}/ exists already.`);
  const paths = INSTRUCTION_FILES.filter((path) => existsSync(join(ROOT, path)));
  for (const path of paths) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    cpSync(join(ROOT, path), join(dir, path));
  }
  writeFileSync(join(dir, "VERSION.md"), `# ${name}\n\nSnapshot of the live instructions on ${new Date().toISOString().slice(0, 10)}, at ${git(["rev-parse", "--short", "HEAD"]).trim()}.\n\n<What changed from the last version, and what it's meant to improve.>\n`);
  console.log(`Saved ${paths.length} files to evals/prompt-versions/${name}/. Say what it is in its VERSION.md.`);
}

/** The part of a pitch both versions have, so the template can't give the version away. */
function comparable(pitch: string) {
  const idea = section(pitch, /idea/i).trim();
  const board = section(pitch, /storyboard/i).trim();
  return `**The idea**\n\n${idea}\n\n**Storyboard**\n\n${board}`;
}

const sheetPath = (a: string, b: string) => join(RESULTS, `blind-${a}-vs-${b}.md`);
const keyPath = (a: string, b: string) => join(RESULTS, `blind-${a}-vs-${b}.key.json`);

function blind(a: string, b: string) {
  for (const label of [a, b]) if (!existsSync(join(RESULTS, label))) throw new Error(`No results for ${label} in evals/results/. Run bun run eval first.`);
  const pairs: { brief: string; run: string; x: string; y: string }[] = [];
  const parts: string[] = [
    `# Blind comparison`,
    "",
    "For each brief, read both pitches and write which one you'd make: `ship: X`, `ship: Y` or `ship: neither`. Only the idea and the storyboard are shown, because the rest of a pitch follows its template and would give the version away. Then, for each, whether it broke a hard rule (an invented claim, a fake testimonial, a spend nobody approved): `rules X: ok` or `rules X: <what broke>`, the same for Y. The brief's expected behaviour is there for the rules, not for picking a winner. Once every `ship:` line is filled in, the key (`" +
      `blind-${a}-vs-${b}.key.json` +
      "`) says where each full pitch and reply is, for the rules you couldn't judge from this. Then run `bun run eval score " +
      `${a} ${b}` +
      "`.",
    "",
  ];
  for (const brief of readdirSync(join(RESULTS, a)).sort()) {
    if (!existsSync(join(RESULTS, b, brief))) continue;
    for (const run of readdirSync(join(RESULTS, a, brief)).sort()) {
      const pa = readIf(join(RESULTS, a, brief, run, "pitch.md"));
      const pb = readIf(join(RESULTS, b, brief, run, "pitch.md"));
      if (!pa || !pb) continue;
      // Which side is X depends on a hash of the pair, so it's mixed but the same every time the sheet is made.
      const flip = createHash("sha256").update(`${a}|${b}|${brief}|${run}`).digest()[0] % 2 === 1;
      const [x, y] = flip ? [b, a] : [a, b];
      pairs.push({ brief, run, x, y });
      const raw = readIf(join(BRIEFS, `${brief}.md`)) ?? "";
      const expected = section(raw, /expected/i).trim();
      const asked = readBriefs([brief])[0].text;
      parts.push(
        `---`, "", `## ${brief} #${run}`, "", `> ${asked.replace(/\n/g, "\n> ")}`, "", expected ? `Expected:\n\n${expected}\n` : "",
        `### X`, "", comparable(flip ? pb : pa), "", `### Y`, "", comparable(flip ? pa : pb), "",
        `ship: `, `rules X: `, `rules Y: `, "",
      );
    }
  }
  if (!pairs.length) throw new Error(`No brief has a pitch from both ${a} and ${b} in evals/results/.`);
  writeFileSync(sheetPath(a, b), parts.join("\n"));
  writeFileSync(keyPath(a, b), `${JSON.stringify(pairs, null, 2)}\n`);
  console.log(`${pairs.length} pairs in ${posix(relative(ROOT, sheetPath(a, b)))}. Fill it in, then: bun run eval score ${a} ${b}`);
}

function score(a: string, b: string) {
  const sheet = readIf(sheetPath(a, b));
  const key: { brief: string; run: string; x: string; y: string }[] = JSON.parse(readIf(keyPath(a, b)) ?? "[]");
  if (!sheet || !key.length) throw new Error(`No sheet for ${a} vs ${b}. Make one with bun run eval blind ${a} ${b}.`);
  const wins = { [a]: 0, [b]: 0, neither: 0, blank: 0 } as Record<string, number>;
  const broke: Record<string, string[]> = { [a]: [], [b]: [] };
  for (const pair of key) {
    const block = sheet.split(/^## /m).find((part) => part.startsWith(`${pair.brief} #${pair.run}\n`)) ?? "";
    const ship = block.match(/^ship:\s*(\S*)/im)?.[1]?.toUpperCase();
    if (ship === "X") wins[pair.x]++;
    else if (ship === "Y") wins[pair.y]++;
    else if (ship === "NEITHER") wins.neither++;
    else wins.blank++;
    for (const [side, version] of [["X", pair.x], ["Y", pair.y]] as const) {
      const verdict = block.match(new RegExp(`^rules ${side}:\\s*(.*)$`, "im"))?.[1].trim();
      if (verdict && !/^ok\b/i.test(verdict)) broke[version].push(`${pair.brief} #${pair.run}: ${verdict}`);
    }
  }
  const cost = (label: string) => {
    const metas = filesUnder(join(RESULTS, label)).filter((file) => file.endsWith("meta.json")).map((file) => JSON.parse(readFileSync(file, "utf8")) as Meta);
    const sum = (pick: (meta: Meta) => number) => metas.reduce((total, meta) => total + pick(meta), 0);
    return metas.length ? `$${sum((m) => m.cost ?? 0).toFixed(2)} over ${metas.length} runs, ${Math.round(sum((m) => m.seconds ?? 0) / metas.length)} s a run, old ads read in ${metas.filter((m) => m.oldAdsRead.length).length}` : "no runs";
  };
  console.log(`${a} vs ${b}, ${key.length} pairs\n`);
  console.log(`Preferred: ${a} ${wins[a]}, ${b} ${wins[b]}, neither ${wins.neither}${wins.blank ? `, not judged ${wins.blank}` : ""}`);
  for (const version of [a, b]) console.log(`\n${version}: ${broke[version].length} hard-rule failure${broke[version].length === 1 ? "" : "s"}${broke[version].map((line) => `\n  - ${line}`).join("")}\n  cost: ${cost(version)}`);
  console.log("\nA version graduates with no more hard-rule failures, a preference that holds across briefs (not one great pitch), and no large cost for nothing.");
}

const COMMANDS = ["snapshot", "blind", "score", "compare", "trace"];
if (command === "snapshot" && rest[0]) snapshot(rest[0]);
else if (command === "blind" && rest.length === 2) blind(rest[0], rest[1]);
else if (command === "score" && rest.length === 2) score(rest[0], rest[1]);
else if (command === "compare" && rest.length === 2) compare(rest[0], rest[1]);
else if (command === "trace" && rest[0]) retrace(rest[0]);
else if (command && !COMMANDS.includes(command)) await evaluate(command);
else throw new Error("Usage: bun run eval <version|current> [--briefs a,b] [--runs 2] [--label name] [--build] | snapshot <name> | compare <a> <b> | blind <a> <b> | score <a> <b> | trace <label>");
