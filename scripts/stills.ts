// bun run stills <id> --frames 0,90,240 [--ratio all] [--sheet]   PNGs in out/<slug>/stills/. With no --frames: first, middle, last.
// --sheet writes one labelled grid of those frames per video instead, so an agent looks at one image, not one per frame.
// --thumbnail captures the ad's cover image instead (out/<slug>/stills/<id>-thumbnail.png), every ratio given.
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { captureFrame, cli, evenFrames, openSession, outDir, resolveVideos } from "./lib/index.ts";
import { contactSheet } from "./lib/media.ts";

/** About this wide per tile, so a sheet of a dozen frames stays readable as one image. */
const TILE = 540;

const { target, ratio, frames, values } = cli({ sheet: { type: "boolean" }, thumbnail: { type: "boolean" } });
const videos = await resolveVideos(target, { ratio });
const session = await openSession();
try {
  for (const video of videos) {
    const dir = join(outDir(video.slug), "stills");
    mkdirSync(dir, { recursive: true });
    if (values.thumbnail) {
      if (!video.thumbnail) throw new Error(`${video.id} has no thumbnail: give its registry line \`thumbnail: Thumb\`.`);
      const page = await session.open(video, { thumbnail: true });
      const path = join(dir, `${video.id}-thumbnail.png`);
      await captureFrame(page, 0, { path });
      await page.close();
      console.log(path);
      continue;
    }
    const page = await session.open(video);
    const wanted = frames ?? evenFrames(video, 3);
    if (values.sheet) {
      const scale = Math.min(1, TILE / video.width);
      const tiles = [];
      for (const frame of wanted) tiles.push({ label: `${frame} (${(frame / video.fps).toFixed(2)} s)`, png: await captureFrame(page, frame, { scale }) });
      const path = join(dir, `${video.id}-sheet.png`);
      await contactSheet(session, tiles, path, { columns: Math.min(video.width >= video.height ? 3 : 4, wanted.length) });
      console.log(path);
    } else {
      for (const frame of wanted) {
        const path = join(dir, `${video.id}-${String(frame).padStart(6, "0")}.png`);
        await captureFrame(page, frame, { path });
        console.log(path);
      }
    }
    await page.close();
  }
} finally {
  await session.close();
}
