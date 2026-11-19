import type { HandEntry, HandGen } from "./types.ts";

const gens = import.meta.glob<HandGen>("/src/ads/*/hand.gen.json", { eager: true, import: "default" });

/** An ad's traced strokes, by slug. Undefined until `bun run hand <slug>` has run. */
export const handGen = (slug: string): HandGen | undefined => gens[`/src/ads/${slug}/hand.gen.json`];

/** One traced text or path: from a slug, or from a `hand.gen.json` you imported yourself. */
export function handEntry(source: string | HandGen, id: string): HandEntry {
  const gen = typeof source === "string" ? handGen(source) : source;
  if (!gen) throw new Error(`no hand.gen.json for "${source}". Run: bun run hand ${source}`);
  const entry = gen.entries[id];
  if (!entry) throw new Error(`hand.gen.json has no "${id}". List it in hand.ts and run: bun run hand <slug>`);
  return entry;
}
