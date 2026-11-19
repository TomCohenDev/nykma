/**
 * Free stock (spec.md §6.8): photos and clips from Pexels and Pixabay, the first place to look before a shot is
 * generated. This file holds no keys and calls neither API, so `bun run stock` and the desk share it. The searches and
 * downloads that need a key are in stock-run.ts, which only the desk loads.
 *
 * A result is a StockItem with an id like `pexels:12345`. A photo and a clip can share a number at the same source, so
 * the type travels with it: `bun run stock` remembers it from the search it printed.
 *
 * A taken photo or clip is a file in public/ads/<slug>/stock/ (gitignored, like footage/), recorded under
 * `stock/<file>` in public/ads/<slug>/sources.json (committed): who made it, where it's from, its licence, which of the
 * source's files it is, and its hash. `bun run stock <slug>` downloads the missing ones again after a clone.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { StockSource } from "./footage.ts";

const ROOT = resolve(import.meta.dirname, "../..");

export type Source = "pexels" | "pixabay";
export type Kind = "photo" | "video";
export type Ratio = "16x9" | "1x1" | "9x16";

/** One of the files a result comes in. `variant` names it at its source, so a clone can ask for the same one. */
export type StockFile = { url: string; width: number; height: number; fps?: number; bytes?: number; variant: string };

export type StockItem = {
  id: string;
  source: Source;
  type: Kind;
  /** The largest file there is to take. */
  width: number;
  height: number;
  seconds?: number;
  author: string;
  authorUrl: string;
  pageUrl: string;
  /** Pexels' alt text, or Pixabay's tags. */
  about: string;
  /** A small image for a photo, the smallest file for a clip: for the contact sheet only. */
  preview: string;
  files: StockFile[];
};

export const SOURCES: Record<Source, { label: string; site: string; licence: string; licenceUrl: string }> = {
  pexels: { label: "Pexels", site: "https://www.pexels.com", licence: "Pexels License", licenceUrl: "https://www.pexels.com/license/" },
  pixabay: { label: "Pixabay", site: "https://pixabay.com", licence: "Pixabay Content License", licenceUrl: "https://pixabay.com/service/license-summary/" },
};
export const isSource = (name: unknown): name is Source => name === "pexels" || name === "pixabay";

/** The size each shape renders at. A file must cover it after the crop, so it needs both sides. */
export const OUTPUTS: Record<Ratio, [number, number]> = { "16x9": [1920, 1080], "1x1": [1080, 1080], "9x16": [1080, 1920] };
export const isRatio = (name: unknown): name is Ratio => typeof name === "string" && name in OUTPUTS;

/** Width and height a file needs to fill every one of these shapes without being scaled up. */
export function needed(ratios: Ratio[]): [number, number] {
  const sizes = (ratios.length ? ratios : (["1x1"] as Ratio[])).map((ratio) => OUTPUTS[ratio]);
  return [Math.max(...sizes.map(([w]) => w)), Math.max(...sizes.map(([, h]) => h))];
}

/**
 * The file to take: for a clip, the smallest that still covers the shapes (a 1080p clip for 1:1, a 4K landscape clip
 * for 9:16), else the largest there is. For a photo, the largest. `warning` says when it will be scaled up.
 */
export function bestFile(item: StockItem, ratios: Ratio[]): { file: StockFile; warning?: string } {
  const [w, h] = needed(ratios);
  const bySize = [...item.files].sort((a, b) => a.width * a.height - b.width * b.height || (a.bytes ?? 0) - (b.bytes ?? 0));
  const largest = bySize[bySize.length - 1];
  if (!largest) throw new Error(`${item.id} has no file to download.`);
  const covers = (file: StockFile) => file.width >= w && file.height >= h;
  const file = item.type === "video" ? (bySize.find(covers) ?? largest) : largest;
  return covers(file) ? { file } : { file, warning: `${file.width}x${file.height} is the largest there is, so it's scaled up to fill ${w}x${h}` };
}

/** `pexels:12345` → its source and number. */
export function parseId(id: string): { source: Source; number: string } | undefined {
  const match = /^(pexels|pixabay):(\d{1,15})$/.exec(id.trim().toLowerCase());
  return match ? { source: match[1] as Source, number: match[2] } : undefined;
}

export const stockDir = (slug: string) => join(ROOT, "public", "ads", slug, "stock");

/** A file name: letters, numbers and dashes. */
export const safeName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** The line for post.md and the README. */
export function credit(entry: Pick<StockSource, "type" | "author" | "source" | "pageUrl" | "licence" | "licenceUrl">) {
  return `${entry.type === "video" ? "Video" : "Photo"} by ${entry.author || "an unnamed author"} on ${SOURCES[entry.source].label}: ${entry.pageUrl} (${entry.licence}, ${entry.licenceUrl})`;
}

/** The running desk: from the environment of a run it started, else the file it writes when it starts. */
export function findDesk(): { url: string; token: string } | undefined {
  if (process.env.NYKMA_DESK_URL && process.env.NYKMA_DESK_TOKEN) return { url: process.env.NYKMA_DESK_URL, token: process.env.NYKMA_DESK_TOKEN };
  const file = join(ROOT, "out", ".desk.json");
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}
