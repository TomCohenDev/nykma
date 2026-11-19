// bun run sheet <id> [--ratio all] [--frames 0,90,240] [--count 16] [--columns 4]   Contact sheet in out/<slug>/<id>-sheet.png.
import { join } from "node:path";
import { captureFrame, cli, contactSheet, evenFrames, openSession, outDir, resolveVideos } from "./lib/index.ts";

const TILE = 440; // Longest side of a tile, in pixels.

const { target, ratio, frames, values } = cli({ count: { type: "string" }, columns: { type: "string" } });
const videos = await resolveVideos(target, { ratio });
const session = await openSession();
try {
  for (const video of videos) {
    const page = await session.open(video);
    const scale = TILE / Math.max(video.width, video.height);
    const tiles = [];
    for (const frame of frames ?? evenFrames(video, Number(values.count ?? 16))) {
      tiles.push({ label: `${frame} · ${(frame / video.fps).toFixed(2)}s`, png: await captureFrame(page, frame, { scale }) });
    }
    await page.close();
    const path = join(outDir(video.slug), `${video.id}-sheet.png`);
    await contactSheet(session, tiles, path, { columns: Number(values.columns ?? (video.ratio === "9x16" ? 8 : 4)) });
    console.log(path);
  }
} finally {
  await session.close();
}
