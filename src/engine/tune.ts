import { useSyncExternalStore, type CSSProperties } from "react";
import type { Ratio } from "./ratio";
import { useVideo } from "./timing";

/**
 * Knobs: values an ad reads by name, so the desk can change them without touching code (spec.md §5).
 *
 *   const { k, nudge, at } = useTune();
 *   const size = k("title.size", 120);                       // a number, string or boolean
 *   <h1 style={{ transform: `translateY(${rise}px)`, ...nudge("title") }}>   // moved, scaled, turned by the desk
 *   const drop = at("drop", 90);                             // a named time, in frames
 *
 * The values live in src/ads/<slug>/tune.json (tune-<take>.json for a take with its own), with a ratio's entry winning
 * over "all". With no file, or no key, every knob is its fallback, so the code alone still makes the ad.
 * `nudge` returns CSS individual transforms (`translate`, `scale`, `rotate`). They compose with the element's own
 * `transform`, so code motion keeps playing; don't set those three properties yourself on a nudged element.
 */

export type Nudge = { dx?: number; dy?: number; scale?: number; rotate?: number };
export type TuneValue = number | string | boolean | Nudge;
/** src/ads/<slug>/tune.json. */
export type TuneFile = { all?: Record<string, TuneValue> } & { [R in Ratio]?: Record<string, TuneValue> };
export type KnobKind = "value" | "nudge" | "time";
/** A knob as an ad last read it, for the desk's knob panel. `value` is what it got: the file's, a live one, or the fallback. */
export type KnobSeen = { slug: string; take?: string; ratio: Ratio; id: string; kind: KnobKind; fallback: TuneValue; value: TuneValue };
/** What `useTune()` and `tuneFor()` give. */
export type Tune = {
  /** The value, or `fallback`. Typed by the fallback: `k("size", 120)` is a number. */
  k: { (id: string, fallback: number): number; (id: string, fallback: string): string; (id: string, fallback: boolean): boolean };
  nudge: (id: string) => CSSProperties;
  at: (id: string, frame: number) => number;
};

type State = {
  files: Record<string, TuneFile>;
  /** `${slug}|${take}|${ratio or "all"}` → id → value. The viewer's own, never a render's. */
  live: Map<string, Map<string, TuneValue>>;
  listeners: Set<() => void>;
  seen: Map<string, KnobSeen>;
  version: number;
};

// A glob, not an import, so an ad with no tune.json can't break anything.
const files = import.meta.glob<TuneFile>("/src/ads/*/tune*.json", { eager: true, import: "default" });

// Shared across hot updates: this module re-runs when a tune file changes, and ads that imported the old copy read the
// same state, so a write to tune.json reaches a mounted page without a reload.
const g = globalThis as { __nykmaTune?: State };
const state: State = (g.__nykmaTune ??= { files, live: new Map(), listeners: new Set(), seen: new Map(), version: 0 });
if (state.files !== files) {
  state.files = files;
  notify();
}

if (import.meta.hot) import.meta.hot.accept();

function notify() {
  state.version++;
  for (const listener of [...state.listeners]) listener();
}

export const tunePath = (slug: string, take?: string) => `/src/ads/${slug}/tune${take ? `-${take}` : ""}.json`;

/** The file a take reads: its own tune-<take>.json, or the ad's tune.json. */
export const tuneFile = (slug: string, take?: string): TuneFile | undefined => state.files[tunePath(slug, take)] ?? state.files[tunePath(slug)];

const liveKey = (slug: string, take: string | undefined, ratio: Ratio | "all") => `${slug}|${take ?? ""}|${ratio}`;

/** Every knob value for one video: the file's "all", then its ratio, each with the viewer's live values on top. */
function valuesFor(slug: string, take: string | undefined, ratio: Ratio): Record<string, TuneValue> {
  const file = tuneFile(slug, take);
  const live = (scope: Ratio | "all") => Object.fromEntries(state.live.get(liveKey(slug, take, scope)) ?? []);
  return { ...file?.all, ...live("all"), ...file?.[ratio], ...live(ratio) };
}

const isNudge = (value: unknown): value is Nudge => typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** The knobs of one video, without React: for cue functions and anything else outside a component. */
export function tuneFor({ slug, take, ratio }: { slug: string; take?: string; ratio: Ratio }): Tune {
  const values = valuesFor(slug, take, ratio);
  const record = (id: string, kind: KnobKind, fallback: TuneValue, value: TuneValue) =>
    state.seen.set(`${slug}|${take ?? ""}|${id}`, { slug, ...(take ? { take } : {}), ratio, id, kind, fallback, value });

  const k = ((id: string, fallback: number | string | boolean) => {
    const found = values[id];
    // A value of the wrong type (a hand edit, a renamed knob) is ignored rather than breaking the ad.
    const value = typeof found === typeof fallback && (typeof found !== "number" || finite(found)) ? (found as number | string | boolean) : fallback;
    record(id, "value", fallback, value);
    return value;
  }) as Tune["k"];
  const nudge = (id: string): CSSProperties => {
    const found = values[id];
    const value: Nudge = isNudge(found) ? found : {};
    record(id, "nudge", {}, value);
    const style: CSSProperties = {};
    const dx = finite(value.dx) ? value.dx : 0;
    const dy = finite(value.dy) ? value.dy : 0;
    if (dx || dy) style.translate = `${dx}px ${dy}px`;
    if (finite(value.scale) && value.scale !== 1) style.scale = value.scale;
    if (finite(value.rotate) && value.rotate) style.rotate = `${value.rotate}deg`;
    return style;
  };
  const at = (id: string, frame: number): number => {
    const found = values[id];
    const value = finite(found) ? found : frame;
    record(id, "time", frame, value);
    return value;
  };
  return { k, nudge, at };
}

const subscribe = (listener: () => void) => onTune(listener);
const snapshot = () => state.version;

/** The knobs of the video being shown. Re-renders when tune.json changes or the desk sets a live value. */
export function useTune(): Tune {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const { slug, take, ratio } = useVideo();
  return tuneFor({ slug, take, ratio });
}

/**
 * A value the viewer is trying, in memory only: the desk sets it while you drag, before it saves tune.json. `null`
 * takes it off. capture.html never calls this, so renders read only the files.
 */
export function setLiveTune(slug: string, ratio: Ratio | "all", id: string, value: TuneValue | null, take?: string) {
  const key = liveKey(slug, take, ratio);
  const values = state.live.get(key) ?? new Map<string, TuneValue>();
  if (value === null) values.delete(id);
  else values.set(id, value);
  if (values.size) state.live.set(key, values);
  else state.live.delete(key);
  notify();
}

/** Drops every live value, or one ad's. */
export function clearLiveTune(slug?: string) {
  for (const key of [...state.live.keys()]) if (slug === undefined || key.startsWith(`${slug}|`)) state.live.delete(key);
  notify();
}

/** Calls `listener` when a tune file or a live value changes. Returns the unsubscribe. */
export function onTune(listener: () => void): () => void {
  state.listeners.add(listener);
  return () => void state.listeners.delete(listener);
}

/** The knobs the ads have read so far, the last read of each, optionally for one ad. */
export function knobsSeen(slug?: string): KnobSeen[] {
  return [...state.seen.values()].filter((knob) => slug === undefined || knob.slug === slug);
}
