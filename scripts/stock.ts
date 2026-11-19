// bun run stock <slug> "query" [--video|--photo] [--ratio 1x1|16x9|9x16] [--min-seconds N] [--source pexels|pixabay] [--page N]
//                                     searches Pexels and Pixabay through the desk, and makes a numbered contact sheet
// bun run stock <slug> --take pexels:12345 [--name <clip>] [--ratio 1x1,9x16|all]
//                                     downloads one into public/ads/<slug>/stock/ and records it in sources.json. A clip
//                                     is unpacked like real footage, and its <Footage> line printed
// bun run stock <slug> [--force]      downloads the stock in sources.json that's missing (a fresh clone), and unpacks
//                                     its clips again
//
// Free stock (spec.md §6.8), the first place to look before a shot is generated. The desk holds the keys and makes the
// calls, so it must be running (bun run dev). Previews and the sheet go to out/stock/<slug>/<query>/ (gitignored): Read
// sheet.jpg, where a clip is four frames from its preview, left to right, top to bottom.
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { allSources, clipName, framesMb, isStock, PYTHON, unpack, type ClipMeta, type StockSource } from "./lib/footage.ts";
import { credit, findDesk, isRatio, isSource, OUTPUTS, parseId, safeName, SOURCES, stockDir, type Kind, type Ratio, type StockItem } from "./lib/stock.ts";

const ROOT = resolve(import.meta.dirname, "..");
const PREVIEW_JOBS = 4;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    video: { type: "boolean" },
    photo: { type: "boolean" },
    ratio: { type: "string" },
    "min-seconds": { type: "string" },
    source: { type: "string" },
    page: { type: "string" },
    take: { type: "string" },
    name: { type: "string" },
    force: { type: "boolean" },
  },
});
const [slug, ...words] = positionals;
const query = words.join(" ").trim();
const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};
if (!slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug))
  fail('Usage: bun run stock <slug> "query" [--video|--photo] [--ratio 1x1] [--min-seconds 4] [--source pexels|pixabay]\n       bun run stock <slug> --take pexels:12345 [--name <clip>]\n       bun run stock <slug>');
if (values.video && values.photo) fail("Say --video or --photo, or neither for both.");
const kinds: Kind[] = values.video ? ["video"] : values.photo ? ["photo"] : ["photo", "video"];
const ratios: Ratio[] = values.ratio === "all" ? ["16x9", "1x1", "9x16"] : (values.ratio ?? "").split(",").filter(Boolean) as Ratio[];
if (!ratios.every(isRatio)) fail(`--ratio is 16x9, 1x1, 9x16, a list like 1x1,9x16, or all.`);
if (values.source && !isSource(values.source)) fail("--source is pexels or pixabay.");
const minSeconds = values["min-seconds"] ? Number(values["min-seconds"]) : undefined;
if (minSeconds !== undefined && !(minSeconds > 0)) fail("--min-seconds takes a number of seconds.");

const desk = findDesk() ?? fail("The desk isn't running, and it holds the Pexels and Pixabay keys. Start it with bun run dev.");

async function ask(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${desk.url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-nykma-token": desk.token },
    body: JSON.stringify(body),
  }).catch(() => undefined);
  if (!res) throw new Error("The desk didn't answer. Is bun run dev still running?");
  const reply: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(reply.error ?? `The desk answered ${res.status}.`);
  return reply;
}
const orFail = (error: Error): never => fail(error.message);

function run(command: string, args: string[]): Promise<string> {
  return new Promise((done, failed) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("error", (error) => failed(new Error(`${command} didn't start (${error.message}).`)));
    child.on("close", (code) => (code ? failed(new Error(out.trim().split("\n").slice(-3).join("\n"))) : done(out)));
  });
}

const footageLine = (meta: ClipMeta) => `<Footage src="${meta.src}" fps={${meta.fps}} frames={${meta.frames}} />`;

/** A stock clip is unpacked through its copy in footage/, which is replaced, so taking it again doesn't make a -2. */
async function unpackStock(file: string) {
  const copy = join(ROOT, "public", "ads", slug, "footage", basename(file));
  mkdirSync(join(copy, ".."), { recursive: true });
  copyFileSync(file, copy);
  const meta = await unpack(slug, copy);
  console.log(`  ${meta.name}: ${meta.seconds} s at ${meta.fps} fps, ${meta.frames} frames of ${meta.width}x${meta.height}, ${framesMb(slug, meta.name)} MB${meta.sound ? ", with sound" : ""}`);
  console.log(`  ${footageLine(meta)}`);
  if (meta.sound) console.log(`  sound: { src: "${meta.sound}" } as a cue`);
  console.log(`  look: ${meta.sheet.path} (a frame every ${meta.sheet.every} s, ${meta.sheet.columns} across)`);
}

const describe = (entry: Pick<StockSource, "type" | "width" | "height" | "seconds">) =>
  `${entry.type}${entry.seconds ? ` ${Math.round(entry.seconds)} s` : ""}, ${entry.width}x${entry.height}`;

/* ── Take one ──────────────────────────────────────────────────────────────────────────────────────── */

/** What the last searches printed about an id: its type, so pexels:123 the clip isn't pexels:123 the photo. */
function fromSearches(id: string, wanted?: Kind): { type?: Kind; query?: string } {
  const dir = join(ROOT, "out", "stock", slug);
  if (!existsSync(dir)) return {};
  const found = readdirSync(dir)
    .map((name) => join(dir, name, "results.json"))
    .filter((file) => existsSync(file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    .flatMap((file) => {
      try {
        const saved = JSON.parse(readFileSync(file, "utf8")) as { query: string; items: StockItem[] };
        return saved.items.filter((item) => item.id === id && (!wanted || item.type === wanted)).map((item) => ({ type: item.type, query: saved.query }));
      } catch {
        return [];
      }
    });
  const types = new Set(found.map((item) => item.type));
  return types.size === 1 ? found[0] : {};
}

if (values.take) {
  const id = values.take.trim().toLowerCase();
  if (!parseId(id)) fail(`"${values.take}" isn't a stock id. They look like pexels:12345 or pixabay:12345.`);
  const seen = fromSearches(id, values.video ? "video" : values.photo ? "photo" : undefined);
  const type: Kind | undefined = values.video ? "video" : values.photo ? "photo" : seen.type;
  const reply = await ask("/api/stock/take", { slug, id, type, name: values.name, ratios: ratios.length ? ratios : ["1x1"], query: seen.query }).catch(orFail);
  const entry = reply.entry as StockSource;
  const file = join(ROOT, reply.file);
  console.log(`${entry.id}: ${describe(entry)}, by ${entry.author || "an unnamed author"} -> ${reply.file}`);
  if (reply.warning) console.log(`  warning: ${reply.warning}`);
  if (entry.type === "video") await unpackStock(file);
  else {
    console.log(`  <img src={asset("ads/${slug}/stock/${basename(file)}")} />`);
    console.log(`  look: ${reply.file}`);
  }
  console.log(`  credit (post.md and the README): ${credit(entry)}`);
  process.exit(0);
}

/* ── Download again after a clone ──────────────────────────────────────────────────────────────────── */

if (!query) {
  const stock = Object.entries(allSources(slug)).filter((pair): pair is [string, StockSource] => isStock(pair[1]));
  if (!stock.length) {
    console.log(`public/ads/${slug}/sources.json lists no stock. Search with: bun run stock ${slug} "what you need"`);
    process.exit(0);
  }
  let failed = false;
  for (const [key, entry] of stock) {
    const file = join(ROOT, "public", "ads", slug, key);
    const missing = !existsSync(file);
    if (missing) {
      try {
        const reply = await ask("/api/stock/take", { slug, id: entry.id, type: entry.type, restore: key });
        console.log(`${key}: downloaded again from ${SOURCES[entry.source].label}${reply.changed ? ". Warning: it isn't the same file as before (its hash changed), so look at it again" : ""}`);
      } catch (error) {
        failed = true;
        console.error(`${key}: ${(error as Error).message}`);
        continue;
      }
    }
    const meta = join(ROOT, "public", "ads", slug, "gen", "footage", clipName(file), "meta.json");
    if (entry.type === "video" && (missing || values.force || !existsSync(meta))) {
      console.log(`${key}: unpacking`);
      await unpackStock(file);
    }
  }
  console.log(`Every stock file in sources.json is in public/ads/${slug}/stock/.`);
  process.exit(failed ? 1 : 0);
}

/* ── Search ────────────────────────────────────────────────────────────────────────────────────────── */

const reply = (await ask("/api/stock/search", {
  slug,
  query,
  kinds,
  ratio: ratios[0],
  minSeconds,
  sources: values.source ? [values.source] : undefined,
  page: values.page ? Number(values.page) : undefined,
}).catch(orFail)) as { items: StockItem[]; notes: string[] };
for (const note of reply.notes) console.log(`note: ${note}`);
if (!reply.items.length) {
  console.log(`Nothing for "${query}". Try other words, or --page 2.`);
  process.exit(0);
}

const folder = [safeName(query) || "search", values.video ? "video" : values.photo ? "photo" : "", ratios[0] ?? "", values.page && values.page !== "1" ? `p${values.page}` : ""].filter(Boolean).join("-");
const dir = join(ROOT, "out", "stock", slug, folder);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

/** Downloads a preview (no key: the files are on the sources' CDNs) and, for a clip, takes four frames from it. */
async function preview(item: StockItem, n: number): Promise<string[]> {
  const stem = String(n).padStart(2, "0");
  const ext = item.type === "video" ? ".mp4" : extname(new URL(item.preview).pathname).toLowerCase() || ".jpg";
  const file = join(dir, `${stem}${ext}`);
  const res = await fetch(item.preview, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`the preview answered ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  if (item.type === "photo") return [basename(file)];
  let seconds = item.seconds ?? 0;
  if (!(seconds > 0)) seconds = Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])).trim()) || 1;
  const frames: string[] = [];
  for (let k = 0; k < 4; k++) {
    const out = join(dir, `${stem}-${k + 1}.jpg`);
    await run("ffmpeg", ["-v", "error", "-y", "-ss", ((seconds * (2 * k + 1)) / 8).toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "3", out]);
    if (existsSync(out)) frames.push(basename(out));
  }
  return frames;
}

const images: string[][] = new Array(reply.items.length).fill([]);
const problems: string[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: PREVIEW_JOBS }, async () => {
    while (next < reply.items.length) {
      const i = next++;
      try {
        images[i] = await preview(reply.items[i], i + 1);
      } catch (error) {
        problems.push(`${i + 1} (${reply.items[i].id}): no preview, ${(error as Error).message}`);
      }
    }
  }),
);

const label = (item: StockItem) => `${item.id}  ${item.type === "video" ? `${Math.round(item.seconds ?? 0)}s` : "photo"}  ${item.width}x${item.height}`;
writeFileSync(join(dir, "tiles.json"), JSON.stringify({ tiles: reply.items.map((item, i) => ({ n: i + 1, label: label(item), images: images[i] })) }, null, 1));
writeFileSync(join(dir, "results.json"), JSON.stringify({ query, kinds, ratio: ratios[0], at: new Date().toISOString(), items: reply.items }, null, 1));
const sheet = join(dir, "sheet.jpg");
if (!existsSync(PYTHON)) problems.push("no .venv, so no sheet. Make it and run: pip install -r py/requirements.txt");
else
  await run(PYTHON, ["py/stock_sheet.py", join(dir, "tiles.json"), sheet]).catch((error) => {
    problems.push(`the sheet failed: ${(error as Error).message}`);
  });

const [w, h] = OUTPUTS[ratios[0] ?? "1x1"];
const used = [...new Set(reply.items.map((item) => item.source))].map((source) => `${SOURCES[source].label} (${SOURCES[source].site})`);
console.log(`${reply.items.length} result${reply.items.length === 1 ? "" : "s"} for "${query}", from ${used.join(" and ")}:`);
reply.items.forEach((item, i) => {
  const small = item.width < w || item.height < h ? `  (smaller than ${w}x${h})` : "";
  console.log(`${String(i + 1).padStart(2)}. ${item.id}  ${item.type}${item.seconds ? ` ${Math.round(item.seconds)} s` : ""}  ${item.width}x${item.height}${small}  by ${item.author || "?"}  ${item.pageUrl}`);
  if (item.about) console.log(`    ${item.about.slice(0, 110)}`);
});
for (const problem of problems) console.log(`problem: ${problem}`);
if (existsSync(sheet)) console.log(`\nlook: ${sheet.slice(ROOT.length + 1).replace(/\\/g, "/")} (a clip is four frames of its preview, left to right, top to bottom)`);
console.log(`take one: bun run stock ${slug} --take <id> [--name <clip>] [--ratio ${ratios.join(",") || "1x1"}]`);
