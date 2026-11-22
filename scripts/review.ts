// bun run review <slug> [--frames 240,412 | --frames +240,412] [--ratio 9x16]
// One fresh read-only `claude -p` per ratio on stills, merged to queue/<date>-<brand>-<slug>/review.md. --frames limits the
// frames to those; a leading + adds them to the automatic pick. Spends tokens; everything before the claude step is free.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Video } from "../src/engine/index.ts";
import { captureFrame, cli, openSession, outDir, resolveVideos, run, type Session } from "./lib/index.ts";
import { reviewerText } from "./lib/agents.ts";
import { askClaude } from "./lib/claude.ts";
import { quarterFrames, queueFolder, readPitch, readIf } from "./lib/queue.ts";

const MAX = 10;
const TIMEOUT = 5 * 60 * 1000;
const GRID = { width: 96, height: 54 };
const SECONDS_WHILE_MOVING = 2;

type Adjustment = { frame: number; element: string; off: string; adjustment: string; severity: number };

const SCHEMA = {
  type: "object",
  required: ["adjustments"],
  additionalProperties: false,
  properties: {
    adjustments: {
      type: "array",
      maxItems: MAX,
      items: {
        type: "object",
        required: ["frame", "element", "off", "adjustment", "severity"],
        additionalProperties: false,
        properties: {
          frame: { type: "integer" },
          element: { type: "string" },
          off: { type: "string", description: "what's off" },
          adjustment: { type: "string" },
          severity: { type: "integer", enum: [1, 2, 3] },
        },
      },
    },
  },
};

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** Share of the grid's pixels that visibly differ. */
function changed(a: Uint8Array, b: Uint8Array) {
  let count = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 20) count++;
  return count / a.length;
}

/**
 * The last frame before each change of shot, plus one every 2 s while the picture keeps moving, plus the last frame.
 * It reads pixels only, so it doesn't care how the ad was made: long takes and Blender plates pick the same way.
 */
async function pickFrames(session: Session, video: Video, dir: string) {
  const samples = quarterFrames(video);
  const page = await session.open(video);
  for (const [i, frame] of samples.entries()) await captureFrame(page, frame, { scale: 0.25, path: join(dir, `${String(i).padStart(6, "0")}.png`) });
  await page.close();

  const raw = join(dir, "grid.raw");
  await run("ffmpeg", ["-y", "-v", "error", "-framerate", "4", "-start_number", "0", "-i", join(dir, "%06d.png"), "-vf", `scale=${GRID.width}:${GRID.height}:flags=area,format=gray`, "-f", "rawvideo", raw]);
  const bytes = readFileSync(raw);
  const size = GRID.width * GRID.height;
  const grid = samples.map((_, i) => bytes.subarray(i * size, (i + 1) * size));

  const steps = samples.map((_, i) => (i ? changed(grid[i - 1], grid[i]) : 0));
  // A cut hits most of the picture. A swap of text on a still background hits little, but stands out from what's around it.
  const isCut = (i: number) => {
    if (i === 0) return false;
    const around = steps.filter((_, at) => at >= 1 && at !== i && Math.abs(at - i) <= 4);
    return steps[i] >= 0.25 || (steps[i] >= 0.012 && steps[i] >= 2.5 * median(around));
  };

  const picks = new Set<number>([samples.length - 1]);
  let held = 0; // The sample the picture was last judged against.
  for (let i = 1; i < samples.length; i++) {
    if (isCut(i)) {
      if (!isCut(i - 1)) picks.add(i - 1); // A dissolve is several steps but one change.
      held = i;
    } else if ((samples[i] - samples[held]) / video.fps >= SECONDS_WHILE_MOVING && changed(grid[held], grid[i]) >= 0.002) {
      picks.add(i);
      held = i;
    }
  }
  return [...picks].sort((a, b) => a - b).map((i) => samples[i]);
}

function frameList(video: Video, auto: number[] | undefined, spec: string | undefined) {
  const given = (spec ?? "").replace(/^\+/, "").split(",").filter(Boolean).map(Number);
  for (const frame of given) {
    if (!Number.isInteger(frame) || frame < 0 || frame >= video.frames) throw new Error(`frame ${frame} is outside 0..${video.frames - 1}`);
  }
  return [...new Set([...(auto ?? []), ...given])].sort((a, b) => a - b);
}

type Result = { video: Video; label: string; frames: number[]; adjustments: Adjustment[]; cost: number; error?: string };

async function review(video: Video, label: string, frames: number[], session: Session, base: string, prompt: { model: string; system: string }, idea: string): Promise<Result> {
  const dir = join(base, label.replace(/\s+/g, "-"));
  mkdirSync(dir, { recursive: true });
  const page = await session.open(video);
  const names: string[] = [];
  for (const frame of frames) {
    const name = `frame-${String(frame).padStart(6, "0")}.png`;
    await captureFrame(page, frame, { path: join(dir, name) });
    names.push(name);
  }
  await page.close();

  const ask = [
    idea ? `The maker's idea:\n${idea}` : "The maker gave no idea for this ad.",
    `Ratio ${video.ratio} (${video.width}x${video.height}), ${video.dir === "rtl" ? `language ${video.lang}, right to left` : `language ${video.lang}`}. ${video.frames} frames at ${video.fps} fps.`,
    `The stills, in order, in the current folder:\n${names.join("\n")}`,
  ].join("\n\n");

  const args = [
    "-p",
    "--safe-mode", // No CLAUDE.md, memory, hooks or MCP: it knows only what's on screen.
    "--model", prompt.model,
    "--system-prompt", prompt.system,
    "--tools", "Read",
    "--allowed-tools", "Read",
    "--permission-mode", "dontAsk",
    "--no-session-persistence",
    "--output-format", "json",
    "--json-schema", JSON.stringify(SCHEMA),
  ];

  const blank = { video, label, frames, adjustments: [], cost: 0 };
  try {
    const raw = await askClaude(args, ask, dir, TIMEOUT);
    let reply: { is_error?: boolean; result?: string; structured_output?: { adjustments?: Adjustment[] }; total_cost_usd?: number };
    try {
      reply = JSON.parse(raw);
    } catch {
      return { ...blank, error: `claude's reply wasn't JSON: ${raw.slice(0, 300)}` };
    }
    if (reply.is_error) return { ...blank, error: reply.result ?? "claude reported an error" };
    if (!reply.structured_output?.adjustments) return { ...blank, error: `claude gave no adjustment list: ${(reply.result ?? raw).slice(0, 300)}` };
    return { ...blank, adjustments: reply.structured_output.adjustments, cost: reply.total_cost_usd ?? 0 };
  } catch (error) {
    return { ...blank, error: (error as Error).message };
  }
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

/** Worst first across ratios. Inside one severity, each reviewer's own order stands. */
function merge(results: Result[]) {
  return results
    .flatMap(({ label, adjustments }) => adjustments.map((item, rank) => ({ ...item, label, rank })))
    .sort((a, b) => b.severity - a.severity || a.rank - b.rank)
    .slice(0, MAX);
}

const { target: slug, ratio, values } = cli({ "dry-run": { type: "boolean" } }); // --dry-run stops after picking frames: free.
const spec = values.frames as string | undefined;
const limited = !!spec && !spec.startsWith("+");

const videos = await resolveVideos(slug, { ratio: ratio ?? "all" });
const name = videos[0].slug;
const folder = queueFolder(name);
const pitch = folder ? readPitch(folder) : undefined;
if (!pitch?.idea) console.log(`note: no idea in ${folder ? `${folder}/pitch.md` : `queue/<date>-<brand>-${name}/pitch.md`}, so the reviewer sees only the stills.`);

// The brand's own version of the reviewer, if it edited one on the desk (spec.md §10.11).
const text = reviewerText(pitch?.brand);
const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
const model = front?.[1].match(/^model:\s*(\S+)/m)?.[1];
if (!front || !model) throw new Error("ad-reviewer.md needs front matter with model:");

const base = join(outDir(name), "review");
rmSync(base, { recursive: true, force: true });
mkdirSync(base, { recursive: true });

const started = Date.now();
const session = await openSession();
let results: Result[];
try {
  const jobs: Promise<Result>[] = [];
  for (const take of new Set(videos.map((video) => video.take))) {
    const family = videos.filter((video) => video.take === take);
    let auto: number[] | undefined;
    if (!limited) {
      const dir = join(base, `low-${take ?? "main"}`);
      mkdirSync(dir, { recursive: true });
      auto = await pickFrames(session, family[0], dir);
      rmSync(dir, { recursive: true, force: true });
    }
    const frames = frameList(family[0], auto, spec);
    console.log(`${take ? `take ${take}: ` : ""}${frames.length} frames: ${frames.join(", ")}`);
    if (values["dry-run"]) continue;
    for (const video of family) jobs.push(review(video, take ? `${take} ${video.ratio}` : video.ratio, frames, session, base, { model, system: front[2].trim() }, pitch?.idea ?? ""));
  }
  results = await Promise.all(jobs);
} finally {
  await session.close();
}
if (values["dry-run"]) process.exit(0);

const failed = results.filter((result) => result.error);
for (const { label, error } of failed) console.error(`${label}: ${error}`);
if (failed.length === results.length) {
  console.error("The reviewer didn't run, so review.md wasn't written.");
  process.exit(1);
}

const list = merge(results);
const cost = results.reduce((sum, result) => sum + result.cost, 0);
const seconds = Math.round((Date.now() - started) / 1000);
const framesSeen = [...new Set(results.flatMap((result) => result.frames))].sort((a, b) => a - b);
const lines = [
  `# Review: ${name}`,
  "",
  `${results.length - failed.length} of ${results.length} ratios reviewed by ${model}, on frames ${framesSeen.join(", ")}.`,
  ...failed.map(({ label, error }) => `\n**${label} wasn't reviewed:** ${cell(error!)}`),
  "",
  ...(list.length
    ? [
        "| Ratio | Frame | Element | What's off | Adjustment |",
        "|---|---|---|---|---|",
        ...list.map((item) => `| ${item.label} | ${item.frame} | ${cell(item.element)} | ${cell(item.off)} | ${cell(item.adjustment)} |`),
      ]
    : ["Nothing to adjust."]),
  "",
];

const path = join(folder ?? outDir(name), "review.md");
// A recheck on --frames adds to the first pass, because the README answers for what that pass found.
const earlier = limited ? readIf(path) : undefined;
writeFileSync(path, earlier ? `${earlier.trimEnd()}\n\n---\n\n${lines.join("\n").replace(/^# Review:/, "## Recheck:")}` : lines.join("\n"));
console.log(`${path}  ${list.length ? `${list.length} adjustments` : "nothing to adjust"}, ${seconds} s${cost ? `, $${cost.toFixed(2)}` : ""}`);
if (!folder) console.log(`note: no queue/<date>-<brand>-${name}/ folder, so it went in out/ instead.`);
if (failed.length) process.exit(1);
