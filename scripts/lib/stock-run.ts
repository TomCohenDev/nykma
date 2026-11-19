/**
 * The half of free stock that needs a key (spec.md §6.8). Only the desk loads this: it holds the Pexels and Pixabay
 * keys, searches, and downloads the file you take. `bun run stock` asks it with the desk token.
 *
 * - Every API answer is kept for 24 hours in out/stock/.cache/ (no key in it), because Pixabay asks for that, and it
 *   spares both rate limits (Pexels: 200 an hour, 20,000 a month; Pixabay: 100 a minute). Taking a result from a
 *   search in the last 24 hours makes no API call at all.
 * - A taken file is downloaded once into public/ads/<slug>/stock/, never hotlinked, and recorded in sources.json.
 * - NYKMA_PEXELS_URL and NYKMA_PIXABAY_URL point the calls at a stand-in server, for tests.
 */
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { allSources, isStock, writeSource, type StockSource } from "./footage.ts";
import { readKey } from "./keys.ts";
import { bestFile, parseId, safeName, SOURCES, stockDir, type Kind, type Ratio, type Source, type StockFile, type StockItem } from "./stock.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const PEXELS = () => process.env.NYKMA_PEXELS_URL ?? "https://api.pexels.com";
const PIXABAY = () => process.env.NYKMA_PIXABAY_URL ?? "https://pixabay.com/api";
const CACHE = join(ROOT, "out", "stock", ".cache");
const DAY_MS = 24 * 3600_000;
const PER_SOURCE = 8;
const MAX_BYTES = 2_000_000_000;

export class NotConnected extends Error {}

type Answer = { body: any; remaining?: string };
type Cached = { at: number; base: string; source: Source; kind: Kind; request: string; body: any };

/** One API call, or its answer from the last 24 hours. The key never goes into the cache, an error or a log. */
async function get(source: Source, kind: Kind, path: string, params: Record<string, string | number | boolean | undefined>): Promise<Answer> {
  const key = readKey(source);
  if (!key) throw new NotConnected(`${SOURCES[source].label} isn't connected. Add its key in the desk's Settings, under Connections.`);
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== "").map(([name, value]) => [name, String(value)]));
  const request = `${path}?${query}`;
  const base = source === "pexels" ? PEXELS() : PIXABAY();
  const file = join(CACHE, `${source}-${createHash("sha256").update(base + request).digest("hex").slice(0, 24)}.json`);
  if (existsSync(file) && Date.now() - statSync(file).mtimeMs < DAY_MS) return { body: (JSON.parse(readFileSync(file, "utf8")) as Cached).body };

  const url = source === "pexels" ? `${base}${request}` : `${base}${path}?key=${encodeURIComponent(key)}&${query}`;
  const hide = (text: string) => text.split(key).join("[key]").split(encodeURIComponent(key)).join("[key]");
  let res: Response;
  try {
    res = await fetch(url, source === "pexels" ? { headers: { Authorization: key } } : {});
  } catch (error) {
    throw new Error(`${SOURCES[source].label} didn't answer: ${hide(String((error as Error).message))}`);
  }
  if (res.status === 429)
    throw new Error(source === "pexels" ? "Pexels' rate limit is used up (200 requests an hour, 20,000 a month). Try again later." : "Pixabay's rate limit is used up (100 requests a minute). Try again in a minute.");
  if (!res.ok) {
    const text = hide(await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`${SOURCES[source].label} answered ${res.status}${res.status === 401 || res.status === 403 ? ": the key doesn't work" : ""}${text ? `: ${text}` : ""}`);
  }
  const body = await res.json();
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify({ at: Date.now(), base, source, kind, request, body } satisfies Cached));
  return { body, remaining: res.headers.get("x-ratelimit-remaining") ?? undefined };
}

/* ── What each API answers, as StockItems ──────────────────────────────────────────────────────────── */

function pexelsPhoto(photo: any): StockItem {
  return {
    id: `pexels:${photo.id}`,
    source: "pexels",
    type: "photo",
    width: Number(photo.width),
    height: Number(photo.height),
    author: String(photo.photographer ?? ""),
    authorUrl: String(photo.photographer_url ?? ""),
    pageUrl: String(photo.url ?? ""),
    about: String(photo.alt ?? ""),
    preview: String(photo.src?.medium ?? photo.src?.large ?? photo.src?.original),
    files: [{ url: String(photo.src?.original), width: Number(photo.width), height: Number(photo.height), variant: "original" }],
  };
}

function pexelsVideo(video: any): StockItem {
  const files: StockFile[] = (video.video_files ?? [])
    .filter((file: any) => file.link && file.width && file.height && String(file.file_type ?? "video/mp4") === "video/mp4")
    .map((file: any) => ({ url: String(file.link), width: Number(file.width), height: Number(file.height), fps: file.fps ? Number(file.fps) : undefined, variant: `file ${file.id}` }));
  const small = [...files].sort((a, b) => a.width * a.height - b.width * b.height)[0];
  const large = [...files].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return {
    id: `pexels:${video.id}`,
    source: "pexels",
    type: "video",
    width: large?.width ?? Number(video.width),
    height: large?.height ?? Number(video.height),
    seconds: Number(video.duration),
    author: String(video.user?.name ?? ""),
    authorUrl: String(video.user?.url ?? ""),
    pageUrl: String(video.url ?? ""),
    about: String(video.alt ?? ""),
    preview: small?.url ?? "",
    files,
  };
}

/** Without full API access Pixabay gives 1280 px on the long side (largeImageURL); with it, the original. */
function pixabayPhoto(hit: any): StockItem {
  const w = Number(hit.imageWidth);
  const h = Number(hit.imageHeight);
  const scaled = (long: number) => {
    const k = Math.min(1, long / Math.max(w, h));
    return { width: Math.round(w * k), height: Math.round(h * k) };
  };
  const files: StockFile[] = [
    ...(hit.imageURL ? [{ url: String(hit.imageURL), width: w, height: h, variant: "imageURL" }] : []),
    ...(hit.fullHDURL ? [{ url: String(hit.fullHDURL), ...scaled(1920), variant: "fullHDURL" }] : []),
    ...(hit.largeImageURL ? [{ url: String(hit.largeImageURL), ...scaled(1280), variant: "largeImageURL" }] : []),
  ];
  const large = [...files].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return {
    id: `pixabay:${hit.id}`,
    source: "pixabay",
    type: "photo",
    width: large?.width ?? w,
    height: large?.height ?? h,
    author: String(hit.user ?? ""),
    authorUrl: hit.user && hit.user_id ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/` : "",
    pageUrl: String(hit.pageURL ?? ""),
    about: String(hit.tags ?? ""),
    preview: String(hit.webformatURL ?? hit.previewURL ?? hit.largeImageURL),
    files,
  };
}

function pixabayVideo(hit: any): StockItem {
  const files: StockFile[] = Object.entries(hit.videos ?? {})
    .filter(([, file]: [string, any]) => file?.url && file.width && file.height)
    .map(([size, file]: [string, any]) => ({ url: String(file.url), width: Number(file.width), height: Number(file.height), bytes: Number(file.size ?? 0) || undefined, variant: size }));
  const small = [...files].sort((a, b) => a.width * a.height - b.width * b.height)[0];
  const large = [...files].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return {
    id: `pixabay:${hit.id}`,
    source: "pixabay",
    type: "video",
    width: large?.width ?? 0,
    height: large?.height ?? 0,
    seconds: Number(hit.duration),
    author: String(hit.user ?? ""),
    authorUrl: hit.user && hit.user_id ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/` : "",
    pageUrl: String(hit.pageURL ?? ""),
    about: String(hit.tags ?? ""),
    preview: small?.url ?? "",
    files,
  };
}

function itemsOf(source: Source, kind: Kind, body: any): StockItem[] {
  if (source === "pexels") {
    if (kind === "photo") return (body?.photos ?? (body?.id ? [body] : [])).map(pexelsPhoto);
    return (body?.videos ?? (body?.id ? [body] : [])).map(pexelsVideo);
  }
  return (body?.hits ?? []).map(kind === "photo" ? pixabayPhoto : pixabayVideo);
}

/* ── Search ────────────────────────────────────────────────────────────────────────────────────────── */

export type SearchAsk = { query: string; kinds: Kind[]; ratio?: Ratio; minSeconds?: number; sources: Source[]; page?: number };

const PEXELS_ORIENTATION: Record<Ratio, string | undefined> = { "16x9": "landscape", "9x16": "portrait", "1x1": undefined };
const PIXABAY_ORIENTATION: Record<Ratio, string | undefined> = { "16x9": "horizontal", "9x16": "vertical", "1x1": undefined };

/**
 * Searches each source asked for (both by default) for photos, clips or both, up to 8 results from each, Pexels first.
 * A source that fails is a note, as long as the other answers. One with no key is skipped quietly when the other has
 * one, since either alone is enough (Pexels paused new API keys in November 2026).
 */
export async function search(ask: SearchAsk): Promise<{ items: StockItem[]; notes: string[] }> {
  const query = ask.query.trim().slice(0, 100);
  if (!query) throw new Error("Search for something: bun run stock <slug> \"person laughing at a phone\".");
  const page = ask.page && ask.page > 1 ? ask.page : undefined;
  const items: StockItem[] = [];
  const notes: string[] = [];
  let answered = false;
  const connected = ask.sources.filter((source) => readKey(source));
  for (const source of connected.length ? connected : ask.sources) {
    for (const kind of ask.kinds) {
      // Asks for more clips than it shows when a minimum length leaves some out.
      const count = kind === "video" && ask.minSeconds ? 30 : PER_SOURCE;
      try {
        let answer: Answer;
        if (source === "pexels") {
          const orientation = ask.ratio ? PEXELS_ORIENTATION[ask.ratio] : undefined;
          answer = kind === "photo"
            ? await get(source, kind, "/v1/search", { query, per_page: count, page, orientation: orientation ?? (ask.ratio === "1x1" ? "square" : undefined) })
            : await get(source, kind, "/v1/videos/search", { query, per_page: count, page, orientation, size: "medium" });
        } else {
          const [w, h] = ask.ratio === "16x9" ? [1920, 1080] : ask.ratio === "9x16" ? [1080, 1920] : [1080, 1080];
          answer = kind === "photo"
            ? await get(source, kind, "/", { q: query, image_type: "photo", orientation: ask.ratio ? PIXABAY_ORIENTATION[ask.ratio] : undefined, safesearch: true, per_page: count, page })
            : await get(source, kind, "/videos/", { q: query, safesearch: true, min_width: w, min_height: h, per_page: count, page });
        }
        answered = true;
        const found = itemsOf(source, kind, answer.body)
          .filter((item) => item.files.length && item.preview)
          .filter((item) => kind === "photo" || !ask.minSeconds || (item.seconds ?? 0) >= ask.minSeconds)
          .slice(0, PER_SOURCE);
        items.push(...found);
        if (answer.remaining !== undefined && Number(answer.remaining) < (source === "pexels" ? 500 : 10))
          notes.push(`${SOURCES[source].label}: ${answer.remaining} requests left ${source === "pexels" ? "this month" : "this minute"}.`);
      } catch (error) {
        notes.push((error as Error).message);
      }
    }
  }
  if (!answered) throw new NotConnected([...new Set(notes)].join(" ") || "Neither Pexels nor Pixabay is connected. Add a key in the desk's Settings, under Connections.");
  return { items, notes: [...new Set(notes)] };
}

/* ── Take ──────────────────────────────────────────────────────────────────────────────────────────── */

/** The item from a search in the last 24 hours, so taking it costs no request. */
function fromCache(id: string, type?: Kind): StockItem[] {
  if (!existsSync(CACHE)) return [];
  const found = new Map<string, StockItem>();
  for (const name of readdirSync(CACHE)) {
    const file = join(CACHE, name);
    if (Date.now() - statSync(file).mtimeMs >= DAY_MS) continue;
    try {
      const cached = JSON.parse(readFileSync(file, "utf8")) as Cached;
      if ((type && cached.kind !== type) || cached.base !== (cached.source === "pexels" ? PEXELS() : PIXABAY())) continue;
      for (const item of itemsOf(cached.source, cached.kind, cached.body)) if (item.id === id) found.set(item.type, item);
    } catch {}
  }
  return [...found.values()];
}

async function lookUp(id: string, type?: Kind): Promise<StockItem> {
  const parsed = parseId(id);
  if (!parsed) throw new Error(`"${id}" isn't a stock id. They look like pexels:12345 or pixabay:12345.`);
  const cached = fromCache(id, type);
  if (cached.length > 1) throw new Error(`${id} is both a photo and a clip. Say --photo or --video.`);
  if (cached.length) return cached[0];
  if (!type) throw new Error(`${id} isn't in a search from the last 24 hours, so say whether it's a --photo or a --video.`);
  const { source, number } = parsed;
  const answer = source === "pexels"
    ? await get(source, type, type === "photo" ? `/v1/photos/${number}` : `/v1/videos/videos/${number}`, {})
    : await get(source, type, type === "photo" ? "/" : "/videos/", { id: number });
  const item = itemsOf(source, type, answer.body)[0];
  if (!item) throw new Error(`${SOURCES[source].label} has no ${type} ${number}.`);
  return item;
}

const extOf = (url: string, type: Kind) => {
  const ext = /\.(jpe?g|png|webp|mp4|mov|webm)(?:$|[?#])/i.exec(new URL(url).pathname)?.[1]?.toLowerCase();
  return ext ? `.${ext === "jpeg" ? "jpg" : ext}` : type === "video" ? ".mp4" : ".jpg";
};

/** Streams a file to disk and hashes it on the way. */
async function download(url: string, path: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`The download answered ${res.status}.`);
  const hash = createHash("sha256");
  let size = 0;
  const count = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      if (size > MAX_BYTES) return done(new Error("That file is over 2 GB."));
      hash.update(chunk);
      done(null, chunk);
    },
  });
  const part = `${path}.part`;
  try {
    await pipeline(Readable.fromWeb(res.body as any), count, createWriteStream(part));
    renameSync(part, path);
  } finally {
    rmSync(part, { force: true });
  }
  return hash.digest("hex");
}

export type TakeAsk = {
  slug: string;
  id: string;
  type?: Kind;
  /** The file's name in stock/, without the extension. */
  name?: string;
  ratios?: Ratio[];
  query?: string;
  /** Downloading one in sources.json again after a clone: its key there. */
  restore?: string;
};

/**
 * Downloads the best-fitting file of a result into public/ads/<slug>/stock/ and records it in sources.json. Taking the
 * same id again replaces its file. Answers with the file from the repo root.
 */
export async function take(ask: TakeAsk): Promise<{ file: string; key: string; entry: StockSource; warning?: string; changed?: boolean }> {
  const all = allSources(ask.slug);
  const before = ask.restore ? all[ask.restore] : undefined;
  if (ask.restore && (!before || !isStock(before))) throw new Error(`sources.json has no stock "${ask.restore}".`);
  const old = before && isStock(before) ? before : undefined;
  const item = await lookUp(old?.id ?? ask.id, old?.type ?? ask.type);
  const best = bestFile(item, ask.ratios ?? []);
  const chosen = (old && item.files.find((file) => file.variant === old.variant)) || best.file;

  const dir = stockDir(ask.slug);
  mkdirSync(dir, { recursive: true });
  let file: string;
  if (old) file = ask.restore!.slice("stock/".length);
  else {
    const stem = safeName(ask.name ?? "") || `${item.source}-${item.id.split(":")[1]}`;
    const ext = extOf(chosen.url, item.type);
    // The same id taken again keeps its name. Another one with this name gets a number.
    file = `${stem}${ext}`;
    for (let n = 2; ; n++) {
      const there = all[`stock/${file}`];
      const same = there && isStock(there) && there.id === item.id && there.type === item.type;
      // A clip is unpacked through a copy in footage/, so its name mustn't be one of the user's clips there either.
      if (same || (!there && !existsSync(join(dir, file)) && !existsSync(join(dir, "..", "footage", file)))) break;
      file = `${stem}-${n}${ext}`;
    }
  }
  const sha256 = await download(chosen.url, join(dir, file));
  const entry: StockSource = {
    kind: "stock",
    source: item.source,
    id: item.id,
    type: item.type,
    author: item.author,
    authorUrl: item.authorUrl,
    pageUrl: item.pageUrl,
    licence: SOURCES[item.source].licence,
    licenceUrl: SOURCES[item.source].licenceUrl,
    variant: chosen.variant,
    width: chosen.width,
    height: chosen.height,
    ...(item.seconds ? { seconds: item.seconds } : {}),
    ...(ask.query || old?.query ? { query: ask.query ?? old?.query } : {}),
    fetched: new Date().toISOString().slice(0, 10),
    sha256,
  };
  const key = `stock/${file}`;
  writeSource(ask.slug, key, entry);
  return { file: `public/ads/${ask.slug}/stock/${file}`, key, entry, warning: chosen === best.file ? best.warning : undefined, ...(old ? { changed: old.sha256 !== sha256 } : {}) };
}

/* ── Test ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Whether a stock key works, with one small search that isn't cached. Answers in words, never with the key. */
export async function testStockKey(source: Source, key: string): Promise<{ ok: boolean; detail: string }> {
  const label = SOURCES[source].label;
  const url = source === "pexels" ? `${PEXELS()}/v1/search?query=nature&per_page=1` : `${PIXABAY()}/?key=${encodeURIComponent(key)}&q=nature&per_page=3`;
  try {
    const res = await fetch(url, source === "pexels" ? { headers: { Authorization: key } } : {});
    if (res.status === 429) return { ok: true, detail: `The key works, but its rate limit is used up for now.` };
    if (!res.ok) return { ok: false, detail: `${label} said ${res.status}: the key doesn't work.` };
    const left = res.headers.get("x-ratelimit-remaining");
    const limit = res.headers.get("x-ratelimit-limit");
    return { ok: true, detail: `Works.${left ? ` ${left}${limit ? ` of ${limit}` : ""} requests left ${source === "pexels" ? "this month" : "this minute"}.` : ""} Free: searching and downloading cost nothing.` };
  } catch (error) {
    return { ok: false, detail: `Couldn't reach ${label}: ${String((error as Error).message).split(key).join("[key]")}` };
  }
}
