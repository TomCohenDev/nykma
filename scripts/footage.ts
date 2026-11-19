// bun run footage <slug> <clip> [<clip> ...] [--fps 60]   copies each clip to public/ads/<slug>/footage/ and unpacks it
// bun run footage <slug> <url> --own                      downloads one of the brand's own videos (yt-dlp), then the same
// bun run footage <slug> [--force]                        unpacks the clips in footage/ that aren't yet, and downloads
//                                                         any in sources.json that are missing, and adopts the generated
//                                                         videos in generated/ and the stock clips in stock/ that
//                                                         aren't in footage/ (a fresh clone). Missing stock comes
//                                                         back with bun run stock <slug>
//
// Unpacks to public/ads/<slug>/gen/footage/<name>/: 00001.jpg on, audio.wav if it has sound, sheet.jpg to look at, and
// meta.json. HDR is tone-mapped. Prints the <Footage> line to use (spec.md §6.5).
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { basename, join } from "node:path";
import { adDir, readMade } from "./lib/gen.ts";
import { allSources, clipsOf, download, framesMb, isStock, sources, unpack, URL_RE, type ClipMeta } from "./lib/footage.ts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { fps: { type: "string" }, force: { type: "boolean" }, own: { type: "boolean" } },
});
const [slug, ...given] = positionals;
if (!slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) {
  console.error("Usage: bun run footage <slug> [<clip or url> ...] [--own] [--fps 60] [--force]");
  process.exit(1);
}
const urls = given.filter((arg) => URL_RE.test(arg));
if (urls.length && !values.own) {
  console.error("Download only the brand's own videos: its channel, its posts, footage it owns. Someone else's video can't go in an ad.\n" +
    "Add --own to say this one is the brand's.");
  process.exit(1);
}
const fps = values.fps ? Number(values.fps) : undefined;
if (fps !== undefined && !(fps > 0)) {
  console.error("--fps takes a number, like 30 or 60.");
  process.exit(1);
}
for (const file of given.filter((arg) => !URL_RE.test(arg))) {
  if (!existsSync(file)) {
    console.error(`No file at ${file}`);
    process.exit(1);
  }
}

let failed = false;
const fetched: string[] = [];
const fetch = async (url: string, name?: string) => {
  try {
    const file = await download(slug, url, name);
    const source = sources(slug)[basename(file)];
    console.log(`${url}: downloaded from ${source.channel || "an unnamed channel"}${source.channelUrl ? ` (${source.channelUrl})` : ""}`);
    fetched.push(file);
  } catch (error) {
    failed = true;
    console.error(`${url}: ${(error as Error).message}`);
  }
};
for (const url of urls) await fetch(url);
if (!given.length) {
  const have = new Set(clipsOf(slug).map((clip) => basename(clip.file)));
  for (const [name, source] of Object.entries(sources(slug))) if (!have.has(name)) await fetch(source.url, name);
  // Generated videos are committed in generated/ (they were paid for and can't be made again the same), and their
  // copies in footage/ aren't.
  for (const made of Object.values(readMade(slug)))
    if (made.kind === "video" && !have.has(basename(made.file)) && existsSync(join(adDir(slug), made.file))) fetched.push(join(adDir(slug), made.file));
  // Stock clips are gitignored in stock/ too, and come back with bun run stock <slug>.
  for (const [key, entry] of Object.entries(allSources(slug))) {
    if (!isStock(entry) || entry.type !== "video" || have.has(basename(key))) continue;
    if (existsSync(join(adDir(slug), key))) fetched.push(join(adDir(slug), key));
    else console.log(`${key} isn't here. bun run stock ${slug} downloads it again.`);
  }
}

const files = given.filter((arg) => !URL_RE.test(arg));
// With no clips given, the ones in footage/ not unpacked yet, and the generated and stock clips not copied there yet.
const todo = given.length ? [...files, ...fetched] : [...new Set([...clipsOf(slug).filter((clip) => values.force || !clip.meta).map((clip) => clip.file), ...fetched])];
if (!todo.length) {
  console.log(given.length ? "" : `Every clip in public/ads/${slug}/footage/ is unpacked. --force does them again.`);
  process.exit(failed ? 1 : 0);
}

const line = (meta: ClipMeta) => `<Footage src="${meta.src}" fps={${meta.fps}} frames={${meta.frames}} />`;
for (const file of todo) {
  try {
    const meta = await unpack(slug, file, { fps });
    console.log(`${meta.name}: ${meta.seconds} s at ${meta.fps} fps, ${meta.frames} frames of ${meta.width}x${meta.height}, ${framesMb(slug, meta.name)} MB${meta.hdr ? ", HDR tone-mapped" : ""}${meta.sound ? ", with sound" : ""}`);
    console.log(`  ${line(meta)}`);
    if (meta.sound) console.log(`  sound: { src: "${meta.sound}" } as a cue`);
    console.log(`  look: ${meta.sheet.path} (a frame every ${meta.sheet.every} s, ${meta.sheet.columns} across)`);
  } catch (error) {
    failed = true;
    console.error(`${file}: ${(error as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
