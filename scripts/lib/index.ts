/**
 * What every script imports. Scripts run on Node, not bun: Playwright hangs under bun on Windows, so package.json
 * starts them with `node --experimental-strip-types`. `bun run <x>` is still the command. For a new script that
 * means .ts extensions on relative imports, `import type` for types, no enums, no JSX. page.evaluate is safe.
 *
 *   import { cli, resolveVideos, openSession, captureFrame, inspectFrame, outDir } from "./lib/index.ts";
 *
 *   const { target, ratio, frames } = cli();                 // <id|slug> --ratio all --frames 0,90
 *   const videos = await resolveVideos(target, { ratio });
 *   const session = await openSession();                     // builds once, then a preview server and Chromium
 *   try {
 *     for (const video of videos) {
 *       const page = await session.open(video);              // capture page at the exact size
 *       await captureFrame(page, 45, { path: "x.png" });     // seeks, returns a PNG Buffer, optional file
 *       const text = await inspectFrame(page, 45);           // window.nykma.inspect() + the fonts really used
 *       await page.close();
 *     }
 *   } finally {
 *     await session.close();
 *   }
 *
 * Videos    listVideos(): Promise<Video[]>
 *           resolveVideos(target, { ratio? }): Promise<Video[]>
 *             an id gives that video; a slug or slug-take gives its first ratio per take;
 *             ratio "all" gives every ratio, and a ratio name gives that one
 *           publicFile(src): string                          path on disk of a cue or asset under public/
 *           outDir(slug): string                             out/<slug>, created
 *           ROOT: string                                     the repo
 * Pages     openSession(): Promise<Session>                  { browser, url, open(video), close() }
 *           seek(page, frame): Promise<void>                 throws if the page has hit an error
 *           captureFrame(page, frame, { path?, scale? }): Promise<Buffer>
 *           inspectFrame(page, frame): Promise<TextItem[]>
 * Frames    evenFrames(video, count): number[]               count frames spread from first to last
 *           contactSheet(session, tiles, path, { columns? }) tiles are { label, png }
 * Commands  run(command, args): Promise<string>              rejects on failure, resolves to stderr + stdout
 *           probeSeconds(file): Promise<number>
 *           cli(options?): { target, ratio, frames, values } extra flags are node:util parseArgs options
 */
export * from "./videos.ts";
export * from "./session.ts";
export * from "./media.ts";
