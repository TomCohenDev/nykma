// bun run gen <slug> --estimate        what each shot in public/ads/<slug>/gen.json would cost, and the total. Free, no key
// bun run gen <slug> [--only a,b]      makes the stills not made yet, in order, within the budget approved on the desk
//
// Generated media (spec.md §6.6). The paid calls go through the desk, which holds the key and the budget, so the desk
// must be running (bun run dev). A shot already made for the same request is skipped and costs nothing. Stills land in
// public/ads/<slug>/generated/<id>.<ext>. Videos are made on the desk, once the user has approved the stills they start
// from, so this stops with exit code 2 at the first video not made yet. Run it again after: made videos print their
// <Footage> lines.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { money, stateOf, totalToMake } from "./lib/gen.ts";

const ROOT = resolve(import.meta.dirname, "..");
const { positionals, values } = parseArgs({ allowPositionals: true, options: { estimate: { type: "boolean" }, only: { type: "string" } } });
const slug = positionals[0];
if (!slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) {
  console.error("Usage: bun run gen <slug> [--estimate] [--only id,id]");
  process.exit(1);
}
const only = values.only ? new Set(values.only.split(",").map((id) => id.trim())) : undefined;

/** The running desk: from the environment of a run it started, else the file it writes when it starts. */
function desk(): { url: string; token: string } | undefined {
  if (process.env.NYKMA_DESK_URL && process.env.NYKMA_DESK_TOKEN) return { url: process.env.NYKMA_DESK_URL, token: process.env.NYKMA_DESK_TOKEN };
  const file = join(ROOT, "out", ".desk.json");
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

async function budget() {
  const d = desk();
  if (!d) return undefined;
  try {
    const res = await fetch(`${d.url}/api/gen?slug=${encodeURIComponent(slug)}`);
    return res.ok ? ((await res.json()) as { approved: number; spent: number }) : undefined;
  } catch {
    return undefined;
  }
}

let states;
try {
  states = (await stateOf(slug)).filter((state) => !only || only.has(state.id));
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
if (!states.length) {
  console.log(only ? "No shots with those ids in gen.json." : `public/ads/${slug}/gen.json lists no shots, so nothing is generated.`);
  process.exit(0);
}

if (values.estimate) {
  for (const state of states) {
    const cost = "error" in state.estimate ? `no price: ${state.estimate.error}` : `${money(state.estimate.usd)}  (${state.estimate.basis})`;
    console.log(`${state.id}  ${state.kind} ${state.via === "codex" ? "through Codex" : state.model}  ${state.current ? "made, $0" : cost}`);
    for (const problem of state.problems) console.log(`    problem: ${problem}`);
  }
  const total = totalToMake(states);
  console.log(total === undefined ? "\nTotal: unknown, since a shot has no price. Change its model or settings." : `\nTo make: ${money(total)}. Already made shots cost nothing again.`);
  const b = await budget();
  if (b) console.log(`Approved on the desk: ${money(b.approved)}, spent: ${money(b.spent)}.`);
  process.exit(states.some((state) => state.problems.length) ? 1 : 0);
}

const d = desk();
if (!d) {
  console.error("The desk isn't running, and it makes the paid calls. Start it with bun run dev.");
  process.exit(1);
}
// Stills first, whatever the order in gen.json: the videos wait on them.
const ordered = [...states.filter((state) => state.kind === "image"), ...states.filter((state) => state.kind === "video")];
for (const state of ordered) {
  if (state.current) {
    console.log(`${state.id}: already made (${state.made!.file}), nothing spent`);
    continue;
  }
  const res = await fetch(`${d.url}/api/gen/run`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-nykma-token": d.token },
    body: JSON.stringify({ slug, id: state.id }),
  }).catch(() => undefined);
  if (!res) {
    console.error("The desk didn't answer. Is bun run dev still running?");
    process.exit(1);
  }
  const reply: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`${state.id}: ${reply.error ?? `the desk answered ${res.status}`}`);
    process.exit(res.status === 402 || res.status === 409 ? 2 : 1);
  }
  let job = reply;
  let said = "";
  while (job.status === "running") {
    if (job.message !== said) console.log(`${state.id}: ${(said = job.message)}`);
    await new Promise((done) => setTimeout(done, 3000));
    job = await (await fetch(`${d.url}/api/gen/job?id=${encodeURIComponent(job.id)}`)).json();
  }
  if (job.status === "failed") {
    console.error(`${state.id}: failed. ${job.message}`);
    process.exit(1);
  }
  console.log(`${state.id}: ${job.message} -> public/ads/${slug}/${job.file}`);
}
// The <Footage> lines for the videos, as bun run footage prints them.
for (const state of await stateOf(slug)) {
  const footage = state.made?.footage;
  if (state.kind === "video" && footage && (!only || only.has(state.id)))
    console.log(`${state.id}: <Footage src="${footage.src}" fps={${footage.fps}} frames={${footage.frames}} />${footage.sound ? `  sound: ${footage.sound}` : ""}  sheet: ${footage.sheet}`);
}
