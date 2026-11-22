import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { createServer } from "vite";
import type { Ratio, Video } from "../../src/engine/index.ts";

export const ROOT = resolve(import.meta.dirname, "../..");

export const publicFile = (src: string) => join(ROOT, "public", src);

export function outDir(slug: string) {
  const dir = join(ROOT, "out", slug);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** The registry, loaded through Vite so that Node sees exactly what the browser sees. */
export async function listVideos(): Promise<Video[]> {
  const server = await createServer({
    root: ROOT,
    appType: "custom",
    logLevel: "warn",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null }, // One read, so nothing needs to watch public/ or out/.
    optimizeDeps: { noDiscovery: true },
    // Its own dependency cache. Its optimizer settings differ from the dev server's, so sharing node_modules/.vite made
    // every render, still or validate rebuild that cache with only React in it, and the open desk went blank with
    // "Outdated Optimize Dep".
    cacheDir: join(ROOT, "node_modules/.vite-scripts"),
  });
  try {
    return (await server.ssrLoadModule("/src/registry.ts")).videos;
  } finally {
    await server.close();
  }
}

export async function resolveVideos(target: string, { ratio }: { ratio?: string } = {}): Promise<Video[]> {
  const videos = await listVideos();
  const exact = videos.find((video) => video.id === target);
  // "smoke", "smoke-A" and, with --ratio, "smoke-16x9" all name a family of ratios.
  const family = videos.filter((video) => {
    const name = video.take ? `${video.slug}-${video.take}` : video.slug;
    return name === target || video.slug === target || (exact && name === (exact.take ? `${exact.slug}-${exact.take}` : exact.slug));
  });
  if (!family.length) {
    throw new Error(`no video or ad "${target}". Have: ${videos.map((video) => video.id).join(", ")}`);
  }

  const chosen = ratio === "all"
    ? family
    : ratio
      ? family.filter((video) => video.ratio === (ratio as Ratio))
      : exact
        ? [exact]
        : family.filter((video, i) => i === family.findIndex((other) => other.take === video.take));
  if (!chosen.length) throw new Error(`"${target}" has no ratio "${ratio}"`);

  for (const video of chosen) {
    if (!video.frames) {
      throw new Error(`${video.id} takes its length from public/ads/${video.slug}/gen/timeline.json, which doesn't exist yet. Run: ${process.platform === "win32" ? ".venv/Scripts/python" : ".venv/bin/python"} py/mv.py build ${video.slug}`);
    }
  }
  return chosen;
}

/** Parses `<id|slug> [--ratio all] [--frames 0,90,240]` plus any extra flags. */
export function cli(options: ParseArgsOptionsConfig = {}) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { ratio: { type: "string" }, frames: { type: "string" }, ...options },
  });
  const target = positionals[0];
  if (!target) throw new Error("which ad? Give an id or slug, e.g. smoke-16x9");
  const frames = typeof values.frames === "string" ? values.frames.split(",").map(Number) : undefined;
  return { target, ratio: values.ratio as string | undefined, frames, values: values as Record<string, string | boolean | undefined>, positionals };
}
