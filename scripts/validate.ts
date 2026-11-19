// bun run validate <id> [--brand <brand>]   Free checks on a rendered ad. A slug checks every ratio and take; an id with a
// ratio checks that one. Writes queue/<date>-<slug>/validate.md (out/<slug>/ with no queue folder). Exits 1 on any failure.
//
// bun run validate <id> --layout   Only the checks that read the page (Layout, and Hebrew direction and fonts), with no
// render needed: what the agent runs on its own before a first look. Writes out/<slug>/layout.md, not the queue's
// validate.md, because it isn't the check the user asks for.
//
// A failure in Render, Layout or Brand that's the idea rather than a mistake (a deliberate five-second freeze, type that
// bleeds off the frame) goes in the queue README as `Deliberate: layout 120-300 the giant word is the backdrop`. It then
// shows as a warning with that reason, so the user still sees it. Sound, Truth and Copy can't be waived.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import type { Ratio, TextItem, Video } from "../src/engine/index.ts";
import { captureFrame, cli, inspectFrame, openSession, outDir, resolveVideos, run, seek, type Session } from "./lib/index.ts";
import { brandFor, HEBREW, locate, quarterFrames, queueFolder, readIf, sourceFolders, stripNiqqud, tables, type Brand } from "./lib/queue.ts";

/** Margins kept clear in output pixels. 9x16 leaves room for the app's own UI: top bar, caption block, action rail. */
const SAFE: Record<Ratio, { top: number; right: number; bottom: number; left: number }> = {
  "16x9": { top: 54, right: 96, bottom: 54, left: 96 },
  "1x1": { top: 54, right: 54, bottom: 54, left: 54 },
  "9x16": { top: 200, right: 120, bottom: 320, left: 60 },
};
const LIMITS = {
  phonePx: 32, // On a 1080-wide 9x16: below this, a phone can't read it.
  phoneWarnPx: 40,
  contrast: 3, // WCAG large text. The 20th percentile, so a few bright pixels behind the text can't hide or fake a problem.
  contrastSmall: 4.5,
  smallPx: 48,
  sustained: 0.75, // Seconds. A layout problem held this long fails; shorter is a moment in a move, and a warning.
  blank: 0.5,
  frozenWarn: 2,
  frozenFail: 3,
  endHold: 6, // A trailing freeze up to this long is an end card, not a stuck render.
  endCard: 1,
  lufs: -14,
  lufsRange: 1,
  truePeak: -1,
  endLevel: -35, // dB, the last 150 ms. Above this the sound was cut off rather than faded.
  palette: 32, // RGB distance that still counts as the same colour.
  rerender: 256, // Pixels more than 48 levels apart. See differingPixels.
};

const AREAS = ["Render", "Sound", "Layout", "Brand", "Truth", "Copy", "Handwriting"] as const;
type Area = (typeof AREAS)[number];
type Status = "pass" | "warn" | "fail" | "skip";
type Finding = { area: Area; status: Status; ratio?: string; first?: number; last?: number; detail: string };

const findings: Finding[] = [];
const add = (area: Area, status: Status, detail: string, ratio?: string, first?: number, last = first) => {
  findings.push({ area, status, ratio, first, last, detail });
};

const label = (video: Video) => (video.take ? `${video.take} ${video.ratio}` : video.ratio);
const short = (text: string, length = 40) => (text.length > length ? `${text.slice(0, length)}…` : text);

// ---- Render: the files themselves ----

function renderFile(video: Video, folder?: string) {
  const out = join(outDir(video.slug), `${video.id}.mp4`);
  const queued = folder ? join(folder, `${video.id}.mp4`) : undefined;
  if (queued && existsSync(queued)) {
    if (existsSync(out) && statSync(out).mtimeMs > statSync(queued).mtimeMs) add("Render", "warn", `the copy in queue/ is older than out/${video.slug}/${video.id}.mp4`, label(video));
    return queued;
  }
  return existsSync(out) ? out : undefined;
}

type Stream = { codec_type: string; width?: number; height?: number; r_frame_rate?: string; duration?: string; nb_read_packets?: string };

async function checkFile(video: Video, file: string) {
  const report = await run("ffprobe", ["-v", "error", "-count_packets", "-show_entries", "stream=codec_type,width,height,nb_read_packets,r_frame_rate,duration", "-of", "json", file]);
  const streams: Stream[] = JSON.parse(report).streams;
  const picture = streams.find((stream) => stream.codec_type === "video");
  const sound = streams.find((stream) => stream.codec_type === "audio");
  const where = label(video);
  if (!picture) return add("Render", "fail", `${video.id}.mp4 has no video stream`, where);
  if (picture.width !== video.width || picture.height !== video.height) add("Render", "fail", `${picture.width}x${picture.height}, should be ${video.width}x${video.height}`, where);
  const [num, den] = (picture.r_frame_rate ?? "0/1").split("/").map(Number);
  if (Math.abs(num / den - video.fps) > 0.01) add("Render", "fail", `${(num / den).toFixed(2)} fps, should be ${video.fps}`, where);
  if (Number(picture.nb_read_packets) !== video.frames) add("Render", "fail", `${picture.nb_read_packets} frames, should be ${video.frames}. Re-render.`, where);
  return { sound };
}

const runs = (flags: boolean[]) => {
  const spans: [number, number][] = [];
  flags.forEach((on, i) => {
    if (!on) return;
    if (spans.at(-1)?.[1] === i - 1) spans.at(-1)![1] = i;
    else spans.push([i, i]);
  });
  return spans;
};

/** Reads the finished MP4 as tiny grey frames, so this judges what was encoded rather than what the page meant. */
async function checkPicture(video: Video, file: string, dir: string) {
  const width = 160;
  const height = 90;
  const raw = join(dir, `${video.id}.gray`);
  await run("ffmpeg", ["-y", "-v", "error", "-i", file, "-vf", `scale=${width}:${height}:flags=area,format=gray`, "-f", "rawvideo", raw]);
  const bytes = readFileSync(raw);
  rmSync(raw);
  const size = width * height;
  const count = Math.floor(bytes.length / size);
  const frame = (i: number) => bytes.subarray(i * size, (i + 1) * size);

  const blank = Array.from({ length: count }, (_, i) => {
    const pixels = frame(i);
    let sum = 0;
    let square = 0;
    for (const value of pixels) {
      sum += value;
      square += value * value;
    }
    const mean = sum / size;
    return Math.sqrt(Math.max(square / size - mean * mean, 0)) < 1.5;
  });
  const still = Array.from({ length: count }, (_, i) => {
    if (i === 0) return false;
    const [a, b] = [frame(i - 1), frame(i)];
    let moved = 0; // One pixel of a tiny grid is keyframe noise. Two is a real thing moving, down to a small cursor.
    for (let p = 0; p < size && moved < 2; p++) if (Math.abs(a[p] - b[p]) > 6) moved++;
    return moved < 2;
  });

  const where = label(video);
  for (const [first, last] of runs(blank)) {
    const seconds = (last - first + 1) / video.fps;
    if (seconds >= LIMITS.blank) {
      const mean = frame(first).reduce((sum, value) => sum + value, 0) / size;
      add("Render", "fail", `${seconds.toFixed(1)} s of ${mean < 16 ? "black" : "blank"} picture`, where, first, last);
    }
  }
  for (const [start, last] of runs(still)) {
    const first = start - 1; // The first frame of a freeze differs from the one before it, not from the next.
    const seconds = (last - first + 1) / video.fps;
    if (blank[first] && blank[last]) continue;
    if (last === count - 1 && seconds <= LIMITS.endHold) continue;
    if (seconds >= LIMITS.frozenFail) add("Render", "fail", `picture frozen for ${seconds.toFixed(1)} s`, where, first, last);
    else if (seconds >= LIMITS.frozenWarn) add("Render", "warn", `picture still for ${seconds.toFixed(1)} s`, where, first, last);
  }
}

// ---- Sound ----

const decibels = (output: string, pattern: RegExp) => {
  const match = output.match(pattern)?.[1];
  return match === undefined ? undefined : match.includes("inf") ? -Infinity : Number(match);
};

async function checkSound(video: Video, file: string, sound?: Stream) {
  const where = label(video);
  if (!sound) {
    if (video.cues.length) add("Sound", "fail", "the ad has sound cues but the MP4 has no audio", where);
    return false;
  }

  const summary = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"]);
  const tail = summary.slice(summary.lastIndexOf("Summary:"));
  const lufs = decibels(tail, /\bI:\s+(-?[\d.]+|-?inf) LUFS/);
  const peak = decibels(tail, /Peak:\s+(-?[\d.]+|-?inf) dBFS/);
  if (lufs === undefined || peak === undefined) add("Sound", "fail", "ebur128 gave no reading", where);
  else {
    if (Math.abs(lufs - LIMITS.lufs) > LIMITS.lufsRange) add("Sound", "fail", `loudness ${lufs} LUFS, should be ${LIMITS.lufs} ±${LIMITS.lufsRange}`, where);
    if (peak >= LIMITS.truePeak) add("Sound", "fail", `true peak ${peak} dB, should stay under ${LIMITS.truePeak} dB`, where);
  }

  const stats = await run("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "astats=metadata=0:measure_perchannel=none", "-f", "null", "-"]);
  const level = decibels(stats, /Peak level dB:\s+(-?[\d.]+|-?inf)/);
  const flat = decibels(stats, /Flat factor:\s+(-?[\d.]+)/);
  if (level !== undefined && level >= -0.01) add("Sound", "fail", `clipping: samples reach ${level.toFixed(2)} dBFS`, where);
  else if (flat !== undefined && flat > 3) add("Sound", "warn", `flat-topped peaks (flat factor ${flat.toFixed(1)}): the mix may have clipped before it was turned down`, where);

  const length = Number(sound.duration);
  const seconds = video.frames / video.fps;
  if (Math.abs(length - seconds) > 1 / video.fps + 0.03) add("Sound", "fail", `sound runs ${length.toFixed(3)} s, picture ${seconds.toFixed(3)} s`, where);

  const end = await run("ffmpeg", ["-hide_banner", "-nostats", "-sseof", "-0.15", "-i", file, "-af", "volumedetect", "-f", "null", "-"]);
  const last = decibels(end.slice(end.lastIndexOf("n_samples: ") ), /mean_volume:\s+(-?[\d.]+|-?inf) dB/);
  // A hard stop can be the joke, so this only flags it.
  if (last !== undefined && last > LIMITS.endLevel) add("Sound", "warn", `the sound is still at ${last} dB when the ad ends, so the music hasn't faded`, where, video.frames - 1);
  return true;
}

// ---- The page: text on frames sampled every quarter second ----

type Line = { x: number; y: number; width: number; height: number };
type Item = TextItem & { lines: Line[]; block: number; contrast?: number };
type Sample = { frame: number; items: Item[]; colours: string[]; written: string[] };

async function lineBoxes(page: Page, items: TextItem[]): Promise<Item[]> {
  const extra = await page.evaluate(() => {
    const stage = document.querySelector("[data-nykma-stage]")!;
    const origin = stage.getBoundingClientRect();
    const blocks = new Map<Element, number>();
    return window.nykma.inspected.map((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const lines = [...range.getClientRects()]
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({ x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height }));
      let el: Element = node.parentElement!;
      while (el !== stage && getComputedStyle(el).display.startsWith("inline")) el = el.parentElement!;
      if (!blocks.has(el)) blocks.set(el, blocks.size);
      return { lines, block: blocks.get(el)! };
    });
  });
  return items.map((item, i) => ({ ...item, ...extra[i] }));
}

/** A shot of the frame with its text gone: what's behind each letter. Shadows and panels stay, because they're doing the job. */
async function backdrop(page: Page, frame: number) {
  await page.evaluate(() => {
    for (const node of window.nykma.inspected) {
      const parent = node.parentElement;
      // Gradient text paints its letters with the background, so that goes too, or the letters are measured against themselves.
      parent?.setAttribute("data-nykma-hide", parent && getComputedStyle(parent).backgroundClip === "text" ? "clip" : "");
    }
    const style = document.createElement("style");
    style.id = "nykma-hide";
    style.textContent = "[data-nykma-hide]{color:transparent!important;-webkit-text-fill-color:transparent!important;fill:transparent!important;stroke:transparent!important;text-decoration-color:transparent!important}[data-nykma-hide=clip]{background:none!important}";
    document.head.append(style);
  });
  const png = await captureFrame(page, frame);
  await page.evaluate(() => {
    document.getElementById("nykma-hide")?.remove();
    for (const el of document.querySelectorAll("[data-nykma-hide]")) el.removeAttribute("data-nykma-hide");
  });
  return png;
}

const parseColour = (css: string) => {
  const match = css.match(/rgba?\(([^)]+)\)/);
  if (!match) return undefined;
  const [r, g, b, a = 1] = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a };
};

/** Runs in a blank page, so Chromium decodes the PNG and no image library is needed. */
async function measure(tool: Page, png: Buffer, boxes: { x: number; y: number; width: number; height: number; fg: { r: number; g: number; b: number }; alpha: number }[], wantColours: boolean) {
  return tool.evaluate(
    async ({ data, boxes, wantColours }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      const linear = (value: number) => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (r: number, g: number, b: number) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

      const contrasts = boxes.map(({ x, y, width, height, fg, alpha }) => {
        const left = Math.max(0, Math.floor(x));
        const top = Math.max(0, Math.floor(y));
        const w = Math.min(image.width - left, Math.ceil(width));
        const h = Math.min(image.height - top, Math.ceil(height));
        if (w <= 0 || h <= 0) return undefined;
        const pixels = context.getImageData(left, top, w, h).data;
        const step = Math.max(1, Math.floor(pixels.length / 4 / 2000)) * 4;
        const ratios: number[] = [];
        for (let i = 0; i < pixels.length; i += step) {
          const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
          const a = luminance(r, g, b);
          const f = luminance(fg.r * alpha + r * (1 - alpha), fg.g * alpha + g * (1 - alpha), fg.b * alpha + b * (1 - alpha));
          ratios.push((Math.max(a, f) + 0.05) / (Math.min(a, f) + 0.05));
        }
        return ratios.sort((p, q) => p - q)[Math.floor(ratios.length * 0.2)];
      });

      const colours: string[] = [];
      if (wantColours) {
        const small = new OffscreenCanvas(64, 64);
        const shrink = small.getContext("2d", { willReadFrequently: true })!;
        shrink.drawImage(image, 0, 0, 64, 64);
        const pixels = shrink.getImageData(0, 0, 64, 64).data;
        const counts = new Map<number, number>();
        for (let i = 0; i < pixels.length; i += 4) {
          const key = ((pixels[i] >> 4) << 8) | ((pixels[i + 1] >> 4) << 4) | (pixels[i + 2] >> 4);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        for (const [key, count] of counts) {
          if (count / (64 * 64) >= 0.1) colours.push(`rgb(${((key >> 8) & 15) * 17}, ${((key >> 4) & 15) * 17}, ${(key & 15) * 17})`);
        }
      }
      return { contrasts, colours };
    },
    { data: png.toString("base64"), boxes, wantColours },
  );
}

/**
 * Pixels that really differ. Even with --disable-partial-raster, Chromium's anti-aliasing of moving or scaled text and shapes
 * shifts with page history, so a byte match can't be asked for. On the demo ads about 1% of frames differ, nearly always by under
 * 10 pixels past this line, once by 84. A stray Math.random() on one small element scattered 1250-1580. See spec §7.3.
 */
function differingPixels(tool: Page, a: Buffer, b: Buffer) {
  return tool.evaluate(
    async ([first, second]) => {
      const read = async (data: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const [p, q] = [await read(first), await read(second)];
      let count = 0;
      for (let i = 0; i < p.length; i += 4) {
        if (Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])) > 48) count++;
      }
      return count;
    },
    [a.toString("base64"), b.toString("base64")],
  );
}

/** Three random frames, drawn on two fresh pages in opposite orders, must come out the same. */
async function rerenders(session: Session, tool: Page, video: Video) {
  const picks = [...new Set(Array.from({ length: 3 }, () => Math.floor(Math.random() * video.frames)))];
  const [one, two] = await Promise.all([session.open(video), session.open(video)]);
  const shots = new Map<number, Buffer>();
  for (const frame of picks) shots.set(frame, await captureFrame(one, frame));
  for (const frame of picks.reverse()) {
    const shot = await captureFrame(two, frame);
    const pixels = shot.equals(shots.get(frame)!) ? 0 : await differingPixels(tool, shot, shots.get(frame)!);
    if (pixels >= LIMITS.rerender) add("Render", "fail", `frame ${frame} came out differently on a second render (${pixels} pixels): something depends on more than the frame number`, label(video), frame);
  }
  await Promise.all([one.close(), two.close()]);
}

async function samplePage(session: Session, tool: Page, video: Video) {
  const page = await session.open(video);
  const samples: Sample[] = [];
  const frames = quarterFrames(video);
  for (const [i, frame] of frames.entries()) {
    const items = await lineBoxes(page, await inspectFrame(page, frame));
    // Handwriting in `ink` mode is strokes with no text in it, and only its label says what it reads. Truth has to see that too,
    // from the frame the pen starts: an unwritten HandText is mounted, labelled and empty.
    const written = await page.evaluate(() => [...document.querySelectorAll("[data-nykma-stage] svg[role=img][aria-label]:has(path, text)")].map((svg) => svg.getAttribute("aria-label")!));
    const wantColours = i % 4 === 0;
    const measured = items.flatMap((item) => {
      const colour = parseColour(item.color);
      return colour && colour.a > 0 ? [{ item, box: { ...item.box, fg: colour, alpha: colour.a * item.opacity } }] : [];
    });
    if (measured.length || wantColours) {
      const shot = await backdrop(page, frame);
      const { contrasts, colours } = await measure(tool, shot, measured.map(({ box }) => box), wantColours);
      measured.forEach(({ item }, at) => (item.contrast = contrasts[at]));
      samples.push({ frame, items, colours, written });
    } else samples.push({ frame, items, colours: [], written });
  }

  await rerenders(session, tool, video);

  await seek(page, video.frames - 1);
  const marks = await page.evaluate(() => {
    const stage = document.querySelector("[data-nykma-stage]")!;
    const found: string[] = [];
    for (const el of stage.querySelectorAll<HTMLElement>("*")) {
      const image = el.tagName === "IMG" ? (el as HTMLImageElement).src : el.tagName.toLowerCase() === "image" ? ((el as unknown as SVGImageElement).href?.baseVal ?? "") : "";
      found.push(image, el.getAttribute("aria-label") ?? "", el.getAttribute("alt") ?? "", el.hasAttribute("data-logo") ? "logo" : "", el.style?.backgroundImage ?? "");
    }
    return found.filter(Boolean);
  });
  await page.close();
  return { video, samples, marks };
}

type Pass = Awaited<ReturnType<typeof samplePage>>;

// ---- Layout ----

type Problem = { kind: string; text: string; detail: string };

function layoutProblems(video: Video, items: Item[]) {
  const problems: Problem[] = [];
  const safe = SAFE[video.ratio];
  for (const item of items) {
    const sides: string[] = [];
    for (const line of item.lines) {
      if (line.x < safe.left - 1) sides.push(`left by ${Math.round(safe.left - line.x)} px`);
      if (line.y < safe.top - 1) sides.push(`top by ${Math.round(safe.top - line.y)} px`);
      if (line.x + line.width > video.width - safe.right + 1) sides.push(`right by ${Math.round(line.x + line.width - (video.width - safe.right))} px`);
      if (line.y + line.height > video.height - safe.bottom + 1) sides.push(`bottom by ${Math.round(line.y + line.height - (video.height - safe.bottom))} px`);
    }
    if (sides.length) problems.push({ kind: "safe", text: item.text, detail: `"${short(item.text)}" is outside the safe area (${sides[0]})` });
    if (item.clipped) problems.push({ kind: "clipped", text: item.text, detail: `"${short(item.text)}" is clipped` });
    if (video.ratio === "9x16" && item.size < LIMITS.phoneWarnPx) {
      const tiny = item.size < LIMITS.phonePx;
      problems.push({ kind: tiny ? "tiny" : "small", text: item.text, detail: `"${short(item.text)}" is ${Math.round(item.size)} px, ${tiny ? "too small" : "small"} to read on a phone` });
    }
    if (item.contrast !== undefined) {
      const need = item.size < LIMITS.smallPx ? LIMITS.contrastSmall : LIMITS.contrast;
      if (item.contrast < need) problems.push({ kind: item.contrast < LIMITS.contrast ? "contrast" : "contrast-small", text: item.text, detail: `"${short(item.text)}" has ${item.contrast.toFixed(1)}:1 contrast against what's behind it, needs ${need}:1` });
    }
  }

  const solid = items.filter((item) => item.opacity >= 0.5);
  for (const [i, a] of solid.entries()) {
    for (const b of solid.slice(i + 1)) {
      if (a.block === b.block) continue; // One paragraph, split by a <bdi>, can't sit on itself.
      const hit = a.lines.some((p) => b.lines.some((q) => overlap(p, q) > 0.1));
      if (hit) problems.push({ kind: "overlap", text: `${a.text}\n${b.text}`, detail: `"${short(a.text, 24)}" overlaps "${short(b.text, 24)}"` });
    }
  }
  return problems;
}

/** Share of the smaller line covered, with the empty leading of each line trimmed off. */
function overlap(a: Line, b: Line) {
  const trim = (line: Line) => ({ x: line.x, y: line.y + line.height * 0.18, width: line.width, height: line.height * 0.64 });
  const [p, q] = [trim(a), trim(b)];
  const width = Math.min(p.x + p.width, q.x + q.width) - Math.max(p.x, q.x);
  const height = Math.min(p.y + p.height, q.y + q.height) - Math.max(p.y, q.y);
  if (width <= 0 || height <= 0) return 0;
  return (width * height) / Math.min(p.width * p.height, q.width * q.height);
}

/** Typing grows its text, so a problem carries on as long as one string is the start of the other. */
const sameText = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);

/** Joins a problem across samples. Held for long enough, it fails; for a moment, it's part of a move and only warns. */
function checkLayout({ video, samples }: Pass) {
  type Open = Problem & { first: number; last: number; at: number };
  const done: Open[] = [];
  let open: Open[] = [];
  samples.forEach(({ frame, items }, at) => {
    const still: Open[] = [];
    for (const problem of layoutProblems(video, items)) {
      const known = still.find((run) => run.kind === problem.kind && sameText(run.text, problem.text));
      if (known) continue;
      const run = open.find((candidate) => candidate.kind === problem.kind && sameText(candidate.text, problem.text));
      if (run) still.push({ ...run, text: problem.text, detail: problem.detail, last: frame, at }); // The latest reading: a fade starts worse than it settles.
      else still.push({ ...problem, first: frame, last: frame, at });
    }
    done.push(...open.filter((run) => !still.some((next) => next.first === run.first && next.kind === run.kind)));
    open = still;
  });
  done.push(...open);

  for (const run of done.sort((a, b) => a.first - b.first)) {
    const held = (run.last - run.first) / video.fps >= LIMITS.sustained;
    const mild = run.kind === "small" || run.kind === "contrast-small";
    add("Layout", held && !mild ? "fail" : "warn", run.detail, label(video), run.first, run.last);
  }
}

// ---- Brand ----

const hex = ({ r, g, b }: { r: number; g: number; b: number }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const fromHex = (value: string) => {
  const digits = value.length === 4 ? [...value.slice(1)].map((d) => d + d).join("") : value.slice(1);
  return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16) };
};

const familyOf = (stack: string) => stack.split(",")[0].replace(/["']/g, "").trim();

const inKit = (brand: Brand, family: string) => {
  const name = family.toLowerCase();
  return brand.fonts.some((font) => {
    const kit = font.family.toLowerCase();
    return name.includes(kit) || kit.includes(name);
  });
};

/** Once per font or colour per ratio, at the first frame it shows up. */
const once = <T>(values: Iterable<T>, key: (value: T) => string) => [...new Map([...values].map((value) => [key(value), value])).values()];

function checkBrand({ video, samples, marks }: Pass, brand: Brand) {
  const where = label(video);
  const texts = samples.flatMap(({ frame, items }) => items.map((item) => ({ frame, item })));

  if (brand.fonts.length) {
    const reversed = [...texts].reverse();
    for (const { frame, item } of once(reversed, ({ item }) => familyOf(item.font))) {
      if (!inKit(brand, familyOf(item.font))) add("Brand", "fail", `"${short(item.text, 24)}" is set in ${familyOf(item.font)}, which isn't in brand.md`, where, frame);
    }
  } else add("Brand", "skip", "brand.md names no fonts, so fonts weren't checked", where);

  if (brand.colours.length) {
    const palette = brand.colours.map(fromHex);
    const off = (colour: { r: number; g: number; b: number }) => !palette.some((p) => Math.hypot(p.r - colour.r, p.g - colour.g, p.b - colour.b) <= LIMITS.palette);
    const used = [
      ...texts.flatMap(({ frame, item }) => {
        const colour = parseColour(item.color);
        return colour && colour.a > 0 ? [{ frame, colour, what: `text "${short(item.text, 24)}"` }] : [];
      }),
      ...samples.flatMap(({ frame, colours }) => colours.flatMap((css) => [{ frame, colour: parseColour(css)!, what: "a large area" }])),
    ].reverse();
    for (const { frame, colour, what } of once(used.filter(({ colour }) => off(colour)), ({ colour }) => hex({ r: colour.r & 0xe0, g: colour.g & 0xe0, b: colour.b & 0xe0 })).slice(-6)) {
      add("Brand", "warn", `${hex(colour)} on ${what} isn't in the palette`, where, frame);
    }
  } else add("Brand", "skip", "brand.md has no colours, so the palette wasn't checked", where);

  const last = samples.at(-1)!;
  if (brand.url) {
    const host = brand.url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "").toLowerCase().replace(/\s/g, "");
    const shows = ({ items }: Sample) => items.filter((item) => item.opacity >= 0.9).map((item) => item.text).join("").toLowerCase().replace(/\s/g, "").includes(host);
    if (!shows(last)) add("Brand", "fail", `no end card: ${host} isn't on the last frame`, where, last.frame);
    else {
      let from = samples.length - 1;
      while (from > 0 && shows(samples[from - 1])) from--;
      const seconds = (video.frames - samples[from].frame) / video.fps;
      if (seconds < LIMITS.endCard) add("Brand", "fail", `the end card holds ${seconds.toFixed(2)} s, needs ${LIMITS.endCard} s`, where, samples[from].frame, last.frame);
    }
  } else add("Brand", "skip", "brand.md has no URL, so the end card wasn't checked", where);

  if (brand.logos.length) {
    const names = brand.logos.map((logo) => logo.split(/[\\/]/).at(-1)!.toLowerCase());
    const shown = marks.some((mark) => names.some((name) => mark.toLowerCase().includes(name)) || /logo/i.test(mark));
    if (!shown) add("Brand", "fail", `no logo on the last frame. It looks for ${names.join(", ")}, or aria-label="logo" on an inline logo.`, where, last.frame);
  } else add("Brand", "skip", "brand.md names no logo files, so the logo wasn't checked", where);
}

// ---- Truth ----

type Figure = { value: string; currency: string; shown: string; claim: boolean };

const CURRENCIES: Record<string, string> = { "₪": "₪", $: "$", "€": "€", "£": "£", 'ש"ח': "₪", "ש״ח": "₪", שקל: "₪", שקלים: "₪", שח: "₪" };

/** Numbers in text. A price, a percentage, "10k", "3x" or "500+" is a claim; a bare number might be anything. */
function figures(text: string): Figure[] {
  const clean = text.replace(/https?:\/\/\S+/g, " ").replace(/\bwww\.\S+/g, " ").replace(/\butm_\w+=\S+/g, " ");
  const found: Figure[] = [];
  const pattern = /(?<![A-Za-z\d.,/:_-])([₪$€£]\s?)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s?(?:%|₪|\$|€|£|ש"ח|ש״ח|שקלים|שקל|שח|[kKM]\b|[xX]\b|\+))?/gu;
  for (const match of clean.matchAll(pattern)) {
    const [shown, before = "", whole, fraction = "", after = ""] = match;
    const unit = after.trim();
    const currency = CURRENCIES[before.trim()] ?? CURRENCIES[unit] ?? "";
    found.push({ value: `${whole.replace(/,/g, "")}${fraction}`, currency, shown: shown.trim(), claim: !!(currency || unit) });
  }
  return found;
}

const tidy = (text: string) => stripNiqqud(text).toLowerCase().replace(/\s+/g, " ");

function checkTruth(passes: Pass[], brand: Brand | undefined, post: string | undefined) {
  const screen = new Map<string, { ratio: string; frame: number }>();
  const frames: { text: string; ratio: string; frame: number }[] = [];
  for (const { video, samples } of passes) {
    for (const { frame, items, written } of samples) {
      const texts = [...items.map((item) => item.text), ...written];
      for (const text of texts) if (!screen.has(text)) screen.set(text, { ratio: label(video), frame });
      frames.push({ text: texts.join(" "), ratio: label(video), frame });
    }
  }
  if (!brand) return add("Truth", "skip", "no brand, so banned claims and numbers weren't checked");

  const lines = (post ?? "").split(/\r?\n/).filter((line) => !/^\s*\|?[\s:|-]*$/.test(line));
  for (const claim of brand.banned) {
    const needle = tidy(claim);
    const seen = frames.find(({ text }) => tidy(text).includes(needle));
    if (seen) add("Truth", "fail", `banned claim on screen: "${claim}"`, seen.ratio, seen.frame);
    const line = lines.findIndex((text) => tidy(text).includes(needle));
    if (line >= 0) add("Truth", "fail", `banned claim in post.md: "${claim}"`);
  }

  const facts = figures(brand.facts);
  const backed = (figure: Figure) => facts.some((fact) => fact.value === figure.value && (!figure.currency || !fact.currency || fact.currency === figure.currency));
  const seen = new Set<string>();
  const report = (text: string, where: { ratio?: string; frame?: number }, place: string) => {
    for (const figure of figures(text)) {
      if (seen.has(figure.value + figure.currency) || backed(figure)) continue;
      seen.add(figure.value + figure.currency);
      if (figure.claim) add("Truth", "fail", `"${figure.shown}" ${place} isn't in brand.md's facts`, where.ratio, where.frame);
      else add("Truth", "warn", `the number ${figure.shown} ${place} isn't in brand.md's facts`, where.ratio, where.frame);
    }
  };
  for (const [text, where] of screen) report(text, where, "on screen");
  for (const line of lines) report(line, {}, "in post.md");
}

function checkEvidence(folder: string, readme: string, brand?: Brand) {
  const table = tables(readme).find(({ header }) => header.some((cell) => /claim/.test(cell)) && header.some((cell) => /evidence/.test(cell)));
  if (!table) return add("Truth", "fail", "README.md has no claim → evidence table");
  const claim = table.header.findIndex((cell) => /claim/.test(cell));
  const evidence = table.header.findIndex((cell) => /evidence/.test(cell));
  const rows = table.rows.filter((row) => row[claim] && !/^<.*>$/.test(row[claim]));
  if (!rows.length) return add("Truth", "fail", 'the claim → evidence table is empty. An ad with no product action says "none".');

  const places = [folder, brand?.dir, brand && join(brand.dir, "assets"), ...sourceFolders(brand)];
  for (const row of rows) {
    if (/^none\b/i.test(row[claim])) continue;
    const cell = row[evidence] ?? "";
    const quoted = [...cell.matchAll(/`([^`]+)`/g)].map(([, path]) => path);
    const paths = quoted.length ? quoted : cell.split(/[\s,]+/).filter(Boolean);
    if (!paths.length || /^<.*>$/.test(cell)) add("Truth", "fail", `no evidence for "${short(row[claim])}"`);
    for (const path of paths) {
      if (!/^https?:\/\//i.test(path) && !locate(path.replace(/[:#]\d+.*$/, ""), ...places)) add("Truth", "fail", `evidence for "${short(row[claim])}" doesn't exist: ${path}`);
    }
  }
}

// ---- Copy ----

function checkLinks(post: string) {
  const links = [...post.matchAll(/https?:\/\/[^\s)|>"'`]+/g)].map(([link]) => link.replace(/[.,;]+$/, ""));
  const bare = links.filter((link) => ["utm_source=", "utm_medium=", "utm_campaign="].some((key) => !link.includes(key)));
  for (const link of new Set(bare)) add("Copy", "fail", `post.md link has no full UTMs: ${link}`);
  if (!links.length) add("Copy", "warn", "post.md has no links");
}

function checkHebrew({ video, samples }: Pass, brand?: Brand) {
  const where = label(video);
  const texts = samples.flatMap(({ frame, items }) => items.filter((item) => HEBREW.test(item.text)).map((item) => ({ frame, item })));
  for (const { frame, item } of once([...texts].reverse(), ({ item }) => item.text)) {
    if (item.direction !== "rtl") add("Copy", "fail", `"${short(item.text, 30)}" is Hebrew but renders left to right`, where, frame);
  }
  if (!brand) return texts.length > 0; // Without a kit there's nothing to fall outside of.
  const fallbacks = texts.flatMap(({ frame, item }) =>
    (item.rendered ?? []).filter((font) => font.glyphs > 0 && !font.custom && !inKit(brand, font.family)).map((font) => ({ frame, item, family: font.family })),
  );
  for (const { frame, item, family } of once(fallbacks.reverse(), ({ family }) => family)) {
    add("Copy", "fail", `"${short(item.text, 30)}": ${family} drew it, and that's a system font outside the brand kit`, where, frame);
  }
  return texts.length > 0;
}

// ---- Handwriting ----

type HandCheck = { ok: boolean; sheet?: string; entries: { id: string; flags: { code: string; level: string; message: string }[] }[] };

function checkHand(slug: string) {
  const path = join(outDir(slug), "hand-check.json");
  const text = readIf(path);
  if (text === undefined) return add("Handwriting", "skip", `no out/${slug}/hand-check.json. Run bun run hand:check ${slug} if the ad writes by hand.`);
  const report: HandCheck = JSON.parse(text);
  for (const { id, flags } of report.entries) {
    for (const { code, level, message } of flags) add("Handwriting", level === "error" ? "fail" : "warn", `${id}: ${code}: ${message}`);
  }
}

// ---- Deliberate choices, and the report ----

function deliberate(readme: string) {
  const marks = [...readme.matchAll(/^[\s*-]*deliberate:\s*(\w+)\s+(\d+)\s*-\s*(\d+)\s*(.*)$/gim)].map(([, area, from, to, why]) => ({ area: area.toLowerCase(), from: Number(from), to: Number(to), why: why.trim() }));
  for (const finding of findings) {
    if (finding.status !== "fail" || finding.first === undefined || !["Render", "Layout", "Brand"].includes(finding.area)) continue;
    const mark = marks.find(({ area, from, to }) => area === finding.area.toLowerCase() && finding.first! >= from && finding.last! <= to);
    if (mark) {
      finding.status = "warn";
      finding.detail += ` (deliberate: ${mark.why || "no reason given"})`;
    }
  }
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
const frameCell = ({ first, last }: Finding) => (first === undefined ? "" : first === last ? String(first) : `${first}-${last}`);

function report(slug: string, videos: Video[], skipped: string[], folder?: string, areas: readonly Area[] = AREAS, file = "validate.md") {
  const order: Record<Status, number> = { fail: 0, warn: 1, skip: 2, pass: 3 };
  for (const area of areas) if (!findings.some((finding) => finding.area === area)) add(area, "pass", "clean");
  // The same problem in every ratio is one row.
  const merged = new Map<string, Finding>();
  for (const finding of findings) {
    const key = [finding.area, finding.status, finding.first, finding.last, finding.detail].join("|");
    const known = merged.get(key);
    if (known) known.ratio = `${known.ratio}, ${finding.ratio}`;
    else merged.set(key, { ...finding });
  }
  const sorted = [...merged.values()].sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area) || order[a.status] - order[b.status] || (a.first ?? 0) - (b.first ?? 0));
  const count = (status: Status) => findings.filter((finding) => finding.status === status).length;
  const verdict = count("fail") ? `FAIL: ${count("fail")} to fix, ${count("warn")} warnings` : count("warn") ? `PASS with ${count("warn")} warnings` : "PASS";

  const lines = [
    `# Validate: ${slug}`,
    "",
    `**${verdict}.** Checked ${videos.map((video) => video.id).join(", ")}${brand ? ` against brands/${brand.name}` : ""}.`,
    ...(skipped.length ? ["", ...skipped.map((line) => `- Skipped: ${line}`)] : []),
    "",
    "| Area | Status | Ratio | Frame | What |",
    "|---|---|---|---|---|",
    ...sorted.map((finding) => `| ${finding.area} | ${finding.status} | ${finding.ratio ?? ""} | ${frameCell(finding)} | ${cell(finding.detail)} |`),
    "",
  ];
  const path = file === "validate.md" ? join(folder ?? outDir(slug), file) : join(outDir(slug), file);
  writeFileSync(path, lines.join("\n"));

  for (const finding of sorted) {
    if (finding.status !== "pass") console.log(`${finding.status.padEnd(4)} ${finding.area.padEnd(11)} ${(finding.ratio ?? "").padEnd(16)} ${frameCell(finding).padEnd(9)} ${finding.detail}`);
  }
  for (const line of skipped) console.log(`skip ${line}`);
  console.log(`${verdict}\n${path}`);
  return count("fail") > 0;
}

// ---- Run ----

const { target, ratio, values } = cli({ brand: { type: "string" }, layout: { type: "boolean" } });
const layoutOnly = Boolean(values.layout);
const videos = await resolveVideos(target, { ratio: ratio ?? (/-(16x9|1x1|9x16)$/.test(target) ? undefined : "all") });
const slug = videos[0].slug;
const folder = queueFolder(slug);
const { brand, asked } = brandFor(folder, values.brand as string | undefined);
const skipped: string[] = [];

if (!folder) skipped.push(`no queue/<date>-${slug}/ folder, so post.md, the README's claim table and Deliberate lines weren't read. Report goes in out/${slug}/.`);
if (!brand) skipped.push(`${asked ? `brand "${asked}" isn't in brands/` : "no brand named in pitch.md or README.md"}, so Brand and Truth checks that need brand.md didn't run.`);

const scratch = join(outDir(slug), ".validate");
mkdirSync(scratch, { recursive: true });

const started = Date.now();
if (!layoutOnly) await Promise.all(
  videos.map(async (video) => {
    const file = renderFile(video, folder);
    if (!file) return add("Render", "fail", `no render. Run: bun run render ${video.id}`, label(video));
    const facts = await checkFile(video, file);
    await checkPicture(video, file, scratch);
    const hasSound = await checkSound(video, file, facts?.sound);
    if (!hasSound && !video.cues.length) skipped.push(`${video.id} has no sound, so the Sound checks didn't apply.`);
  }),
);
rmSync(scratch, { recursive: true, force: true });

const session = await openSession();
let passes: Pass[];
try {
  const tool = await session.browser.newPage();
  passes = await Promise.all(videos.map((video) => samplePage(session, tool, video)));
} finally {
  await session.close();
}

for (const pass of passes) {
  checkLayout(pass);
  if (brand && !layoutOnly) checkBrand(pass, brand);
  checkHebrew(pass, brand);
}

if (layoutOnly) {
  const readme = folder ? readIf(join(folder, "README.md")) : undefined;
  if (readme) deliberate(readme);
  const failed = report(slug, videos, [], folder, ["Layout", "Copy"], "layout.md");
  console.log(`${((Date.now() - started) / 1000).toFixed(0)} s. Layout and Hebrew only, from the code: not the full check.`);
  process.exit(failed ? 1 : 0);
}

const readme = folder ? readIf(join(folder, "README.md")) : undefined;
const post = folder ? readIf(join(folder, "post.md")) : undefined;
checkTruth(passes, brand, post);
if (folder) {
  if (readme !== undefined) checkEvidence(folder, readme, brand);
  else add("Truth", "warn", "no README.md yet, so the claim → evidence table wasn't checked");
  if (post !== undefined) checkLinks(post);
  else add("Copy", "warn", "no post.md yet, so its links and claims weren't checked");
}
checkHand(slug);
if (readme) deliberate(readme);

const failed = report(slug, videos, [...new Set(skipped)], folder);
console.log(`${((Date.now() - started) / 1000).toFixed(0)} s`);
process.exit(failed ? 1 : 0);
