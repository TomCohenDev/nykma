/**
 * The desk's change history, one per ad (spec.md §10.13). Every file the desk writes in src/ads/<slug>/ (a literal in
 * the code, tune.json, story.json) is one entry, so the desk can undo, redo or go back to any point.
 *
 *   record(slug, kind, label, files, key?)   after a write: what each file was and is now
 *   historyOf(slug)                          the entries, oldest first, and how many are applied
 *   undo(slug) / redo(slug) / goto(slug, n)  puts the files back. n = 0 is before everything recorded
 *
 * The history is linear: a change made after an undo drops what could have been redone. A file is put back only if it
 * is still what the history left it as, so an edit by the agent or in an editor is never overwritten (409). It lives in
 * out/<slug>/desk-history.json (gitignored), the last 200 entries, so it survives a restart. An entry keeps only the
 * changed stretch of each file and a hash of the whole, as a desk edit changes a few characters of a long file.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const ADS = join(ROOT, "src", "ads");
const SLUG = /^[a-z0-9][a-z0-9_-]*$/i;
/** Entries kept per ad. */
const CAP = 200;
/** Two writes with the same key this close together are one entry: a slider dragged, a value nudged with the arrows. */
const MERGE_MS = 2000;

export type HistoryKind = "source" | "tune" | "story";
/** One file's change. null is a file that isn't there. */
export type FileChange = { path: string; before: string | null; after: string | null };
export type HistoryItem = { id: string; at: number; kind: HistoryKind; label: string; files: string[] };
/** Entries oldest first. position is how many are applied: undo goes to position - 1, redo to position + 1. */
export type HistoryView = { entries: HistoryItem[]; position: number };
export type HistoryMove = HistoryView & { changed: string[] };

/** A file's change as stored: the whole file's hash before and after, and the stretch between a shared start and end. */
type Stored = { path: string; before: string | null; after: string | null; at: number; tail: number; was: string; now: string };
type Entry = { id: string; at: number; slug: string; kind: HistoryKind; label: string; key?: string; files: Stored[] };
type Store = { version: 1; position: number; entries: Entry[] };

export class HistoryError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const hash = (text: string | null) => (text === null ? null : createHash("sha256").update(text).digest("hex").slice(0, 20));

/** Writes whole, then renames, so nothing ever reads half a file. */
export function writeAtomic(file: string, text: string) {
  const temp = join(dirname(file), `.${basename(file)}.${process.pid}.nk-tmp`);
  writeFileSync(temp, text, "utf8");
  try {
    renameSync(temp, file);
  } catch {
    // Windows can refuse the rename while something holds the file open. Then a plain write.
    writeFileSync(file, text, "utf8");
    if (existsSync(temp)) unlinkSync(temp);
  }
}

const readOrNull = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : null);

/** The absolute path of a repo path, if it's inside src/ads/<slug>/. */
function inAd(slug: string, path: string) {
  const file = resolve(ROOT, path);
  if (!SLUG.test(slug) || path.split(/[\\/]/).includes("..") || !file.startsWith(join(ADS, slug) + sep)) return undefined;
  return file;
}

const storeFile = (slug: string) => join(ROOT, "out", slug, "desk-history.json");

function load(slug: string): Store {
  if (!SLUG.test(slug)) throw new HistoryError(404, "No such ad.");
  try {
    const store = JSON.parse(readFileSync(storeFile(slug), "utf8")) as Store;
    if (store?.version === 1 && Array.isArray(store.entries) && Number.isInteger(store.position)) {
      store.position = Math.max(0, Math.min(store.entries.length, store.position));
      return store;
    }
  } catch {}
  return { version: 1, position: 0, entries: [] };
}

function save(slug: string, store: Store) {
  mkdirSync(dirname(storeFile(slug)), { recursive: true });
  writeAtomic(storeFile(slug), JSON.stringify(store));
}

/** The stored form of a change: the stretch that differs. */
function stored(path: string, before: string | null, after: string | null): Stored {
  const a = before ?? "";
  const b = after ?? "";
  let at = 0;
  while (at < a.length && at < b.length && a.charCodeAt(at) === b.charCodeAt(at)) at++;
  let tail = 0;
  while (tail < a.length - at && tail < b.length - at && a.charCodeAt(a.length - 1 - tail) === b.charCodeAt(b.length - 1 - tail)) tail++;
  return { path, before: hash(before), after: hash(after), at, tail, was: a.slice(at, a.length - tail), now: b.slice(at, b.length - tail) };
}

/** The file on the other side of a change, from the side it's on now. */
function across(change: Stored, current: string | null, toward: "before" | "after"): string | null {
  if (toward === "before" ? change.before === null : change.after === null) return null;
  const text = current ?? "";
  const [from, to] = toward === "before" ? [change.now, change.was] : [change.was, change.now];
  const out = text.slice(0, change.at) + to + text.slice(text.length - change.tail);
  if (text.length - change.tail - change.at !== from.length) throw new HistoryError(409, `${change.path} doesn't match the desk's history.`);
  return out;
}

const view = (store: Store): HistoryView => ({
  entries: store.entries.map((entry) => ({ id: entry.id, at: entry.at, kind: entry.kind, label: entry.label, files: entry.files.map((file) => file.path) })),
  position: store.position,
});

/** Two labels of one joined entry: "Font size 80 → 96" then "Font size 96 → 100" is "Font size 80 → 100". */
function joinLabels(first: string, next: string) {
  const a = first.lastIndexOf(" → ");
  const b = next.lastIndexOf(" → ");
  return a > 0 && b >= 0 ? first.slice(0, a) + next.slice(b) : next;
}

/** The ad Ctrl+Z reaches when the desk doesn't say which. */
let lastSlug: string | undefined;

export function historyOf(slug: string): HistoryView {
  return view(load(slug));
}

/**
 * Records one change the desk just wrote. Files that didn't change are left out, and nothing is recorded when none did.
 * With `key`, a change right after one with the same key (and the same files) joins it.
 */
export function record(slug: string, kind: HistoryKind, label: string, files: FileChange[], key?: string): HistoryView {
  const changes = files.filter((file) => file.before !== file.after);
  for (const file of changes) if (!inAd(slug, file.path)) throw new HistoryError(400, `${file.path} isn't in src/ads/${slug}/.`);
  const store = load(slug);
  if (!changes.length) return view(store);
  lastSlug = slug;
  const name = label.trim().slice(0, 200) || "Change";
  store.entries.splice(store.position);
  const now = Date.now();
  const top = store.entries.at(-1);
  const paths = (list: { path: string }[]) => list.map((file) => file.path).sort().join("\n");
  if (key && top && top.key === key && now - top.at < MERGE_MS && paths(top.files) === paths(changes)) {
    // Join the two only if each file is still what the first left it as.
    const joined = changes.map((change) => {
      const first = top.files.find((file) => file.path === change.path)!;
      if (first.after !== hash(change.before)) return undefined;
      return stored(change.path, across(first, change.before, "before"), change.after);
    });
    if (joined.every(Boolean)) {
      const files = joined as Stored[];
      if (files.every((file) => file.before === file.after)) store.entries.pop();
      else Object.assign(top, { at: now, label: joinLabels(top.label, name), files });
      store.position = store.entries.length;
      save(slug, store);
      return view(store);
    }
  }
  store.entries.push({ id: randomUUID(), at: now, slug, kind, label: name, key, files: changes.map((file) => stored(file.path, file.before, file.after)) });
  if (store.entries.length > CAP) store.entries.splice(0, store.entries.length - CAP);
  store.position = store.entries.length;
  save(slug, store);
  return view(store);
}

/**
 * Moves to `target` through the undo or redo steps between. Every step is checked against the files first, and only
 * then is anything written, so a refused move changes nothing.
 */
export function goto(slug: string, target: number): HistoryMove {
  const store = load(slug);
  if (!Number.isInteger(target) || target < 0 || target > store.entries.length) throw new HistoryError(400, `There are ${store.entries.length} changes: go to 0 to ${store.entries.length}.`);
  lastSlug = slug;
  const disk = new Map<string, string | null>();
  const files = new Map<string, string | null>();
  const contentOf = (path: string) => {
    if (!files.has(path)) {
      const file = inAd(slug, path);
      if (!file) throw new HistoryError(400, `${path} isn't in src/ads/${slug}/.`);
      const text = readOrNull(file);
      disk.set(path, text);
      files.set(path, text);
    }
    return files.get(path)!;
  };
  const step = (entry: Entry, toward: "before" | "after") => {
    for (const change of entry.files) {
      const current = contentOf(change.path);
      const expected = toward === "before" ? change.after : change.before;
      if (hash(current) !== expected) {
        const what = toward === "before" ? "undone" : "redone";
        throw new HistoryError(
          409,
          `${change.path} changed since the desk wrote it (the agent or an editor), so "${entry.label}" can't be ${what} without losing that. Change it in the code, or make a new edit.`,
        );
      }
      files.set(change.path, across(change, current, toward));
    }
  };
  for (let at = store.position; at > target; at--) step(store.entries[at - 1], "before");
  for (let at = store.position; at < target; at++) step(store.entries[at], "after");
  const changed: string[] = [];
  for (const [path, text] of files) {
    if (text === disk.get(path)) continue;
    const file = inAd(slug, path)!;
    if (text === null) existsSync(file) && unlinkSync(file);
    else {
      mkdirSync(dirname(file), { recursive: true });
      writeAtomic(file, text);
    }
    changed.push(path);
  }
  store.position = target;
  save(slug, store);
  return { ...view(store), changed };
}

export function undo(slug?: string): HistoryMove {
  const ad = slug ?? lastSlug;
  if (!ad) throw new HistoryError(400, "Nothing to undo.");
  const { position } = load(ad);
  if (position === 0) throw new HistoryError(400, "Nothing to undo.");
  return goto(ad, position - 1);
}

export function redo(slug: string): HistoryMove {
  const store = load(slug);
  if (store.position >= store.entries.length) throw new HistoryError(400, "Nothing to redo.");
  return goto(slug, store.position + 1);
}
