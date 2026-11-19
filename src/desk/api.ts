/** Talking to the desk's server (scripts/lib/desk.ts), and the shapes it returns. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Ad, AdInfo, BrandKit, Run, SceneInfo, Status, TakeInfo, Voice } from "../../scripts/lib/desk.ts";
import type { Settings } from "../../scripts/lib/settings.ts";

export type { Ad, AdInfo, BrandKit, Run, SceneInfo, Settings, Status, TakeInfo, Voice };
export type State = { ads: Ad[]; brands: BrandKit[]; runs: Run[] };
export type Registry = { ads: AdInfo[]; error?: string };
export type Ratio = "16x9" | "1x1" | "9x16";
export type View = Ratio | "all";

export const SIZES: Record<Ratio, { width: number; height: number }> = {
  "16x9": { width: 1920, height: 1080 },
  "1x1": { width: 1080, height: 1080 },
  "9x16": { width: 1080, height: 1920 },
};
export const RATIOS: Ratio[] = ["16x9", "1x1", "9x16"];
export const ratioLabel = (ratio: Ratio) => ratio.replace("x", ":");

/** A project is an ad: its queue folder, its code in the registry, or both. */
export type Project = {
  key: string; // the queue folder, or "code:<slug>" for an ad with no folder yet
  slug: string;
  folder?: string;
  ad?: Ad;
  info?: AdInfo;
  brand?: string;
  kind: "video" | "asset";
  state: Ad["state"] | "code";
  updated: number;
  running: boolean;
};

export const STATE_LABEL: Record<Project["state"], string> = {
  pitch: "Pitch",
  "first-look": "First look",
  checked: "Checked",
  ready: "Ready",
  dropped: "Dropped",
  code: "In code",
};

export function projectsOf(state: State, registry?: Registry): Project[] {
  const running = new Set(state.runs.filter((run) => run.running).flatMap((run) => [run.folder, run.slug]).filter(Boolean));
  const bySlug = new Map((registry?.ads ?? []).map((info) => [info.slug, info]));
  const fromQueue = state.ads.map((ad): Project => {
    const info = bySlug.get(ad.slug);
    return {
      key: ad.folder,
      slug: ad.slug,
      folder: ad.folder,
      ad,
      info,
      brand: ad.brand,
      kind: info?.takes[0]?.kind ?? (ad.stills.length ? "asset" : "video"),
      state: ad.state,
      updated: ad.updated,
      running: running.has(ad.folder) || running.has(ad.slug),
    };
  });
  const inQueue = new Set(state.ads.map((ad) => ad.slug));
  const codeOnly = (registry?.ads ?? [])
    .filter((info) => !inQueue.has(info.slug))
    .map((info): Project => ({ key: `code:${info.slug}`, slug: info.slug, info, kind: info.takes[0]?.kind ?? "video", state: "code", updated: 0, running: running.has(info.slug) }));
  return [...fromQueue, ...codeOnly];
}

/** Calls `onClose` on Escape, for dialogs and overlays. */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
}

export async function post<T = any>(path: string, body: object): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const reply = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(reply.error ?? "That didn't work.");
  return reply;
}

/** Saves a file to queue/<folder>/inbox/ or brands/<brand>/uploads/. Returns its path from the repo. */
export async function upload(file: File, to: string): Promise<string> {
  const res = await fetch(`/api/upload?to=${encodeURIComponent(to)}&name=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
  const reply = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(reply.error ?? `${file.name} didn't upload.`);
  return reply.path;
}

/** Fetches `url` now and every `every` ms. Never two at once. `null` stops it. */
export function usePoll<T>(url: string | null, every: number) {
  const [data, setData] = useState<T>();
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const live = useRef(url);
  live.current = url;
  const load = useCallback(() => {
    if (!url || busy.current) return;
    busy.current = true;
    fetch(url)
      .then((res) => res.json())
      .then((next: T) => {
        if (live.current !== url) return;
        setData(next);
        setFailed(false);
      })
      .catch(() => setFailed(true))
      .finally(() => (busy.current = false));
  }, [url]);
  // Forget the old data only when the URL changes. Changing the pace must keep it: the chat polls faster while the
  // agent runs, and clearing here made it think nothing was running, slow down, reload, and flash forever.
  useEffect(() => {
    setData(undefined);
    if (url) load();
  }, [url, load]);
  useEffect(() => {
    if (!url) return;
    const timer = setInterval(load, every);
    return () => clearInterval(timer);
  }, [url, every, load]);
  return { data, failed, reload: load };
}

const enc = encodeURIComponent;
export const media = (folder: string, file: string) => `/media/${enc(folder)}/${enc(file)}`;
export const brandFile = (brand: string, file: string) => `/brand-files/${enc(brand)}/${file.replace(/\\/g, "/").split("/").map(enc).join("/")}`;
export const storyboardImage = (path: string, folder?: string, brand?: string) =>
  `/api/file?path=${enc(path)}${folder ? `&folder=${enc(folder)}` : ""}${brand ? `&brand=${enc(brand)}` : ""}`;

/** "3 min ago", "yesterday", "2 Nov". */
export function ago(ms: number) {
  if (!ms) return "";
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "yesterday";
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export const seconds = (frames: number, fps: number) => `${(frames / fps).toFixed(1)} s`;

/** The poster for a project's card: its cover, a render, a still, the animatic, or a storyboard image. */
export function posterOf(project: Project): { video?: string; image?: string } {
  const ad = project.ad;
  if (!ad) return {};
  // A cover is made to be the picture of the ad, so it wins: the 16:9 one if there is one, as cards are wide.
  if (ad.thumbnails?.length) return { image: media(ad.folder, ad.thumbnails.find((file) => file.includes("16x9")) ?? ad.thumbnails[0]) };
  const take = Object.values(ad.takes)[0];
  const file = take?.["16x9"] ?? take?.["1x1"] ?? take?.["9x16"];
  if (file) return { video: media(ad.folder, file) };
  if (ad.stills.length) return { image: media(ad.folder, ad.stills.find((still) => still.includes("16x9")) ?? ad.stills[0]) };
  if (ad.animatic) return { video: media(ad.folder, ad.animatic) };
  const row = ad.storyboard.find((item) => item.image);
  if (row) return { image: storyboardImage(row.image, ad.folder, ad.brand) };
  return {};
}
