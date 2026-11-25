import type { CSSProperties, ReactNode } from "react";
import { Footage, useFrame, type Cue } from "../engine";
import { against, runs, type Dir } from "./bidi";
import { clamp, easings, lerp, prog, spring } from "./time";

/**
 * A talking-head take, cut by `bun run take` (spec.md §6.11): the person's own words and picture, one scene per line.
 *
 *   import cut from "./take.json";                  // src/ads/<slug>/take.json, made from cut.json
 *   const take = useTakeData(cut);                  // typed, with each scene's start
 *   const s = take.scene("hook");
 *   { id: "hook", component: Hook, frames: s.frames, cues: voiceCues(take, s) }   // a registry scene
 *   <TakeCam take={take} scene={s} w={384} h={384} />                             // the face, framed, lips in sync
 *   <SpokenCaptions words={s.words} style={{ left: 60, top: 1300, width: 960 }} />
 *
 * Every value is a function of the scene's frame, and the cut is data: a recut moves the words and the picture together.
 */

export type TakeWord = { t: string; at: number; end: number; hl: boolean };
/** A stretch of the take: `in`/`out` seconds in the clip, `at` the scene frame it starts on. `jump`: how far the head moves across the cut into it. */
export type TakePart = { in: number; out: number; at: number; frames: number; jump?: number | null };
/** The face as fractions of the clip's frame: centre x, centre y, width, height. */
export type Face = [cx: number, cy: number, w: number, h: number];
export type TakeScene = { id: string; line: string; frames: number; parts: TakePart[]; words: TakeWord[]; face?: Face | null };
export type TakeFile = {
  fps: number;
  clip: { name: string; src: string; fps: number; frames: number; width: number; height: number };
  voice: string;
  face: Face | null;
  frames: number;
  scenes: TakeScene[];
  /**
   * A screen recording made during the take (`bun run take --screen`): `at` is the take's second it starts at, lined up
   * by its sound, or set by hand in cut.json when it had none. Null until it's lined up.
   */
  screen?: { name: string; src: string; fps: number; frames: number; width: number; height: number; at: number | null; by: string } | null;
};
export type Take = TakeFile & {
  /** The scene with this id; throws if the cut has none, so a renamed line fails loudly. */
  scene(id: string): TakeScene;
  /** Where a scene starts in the cut as recorded, for timing across scenes. */
  start: Record<string, number>;
};

/** take.json, typed, with its lookups. The JSON import's own type is wider, so it goes through here. */
export function useTakeData(file: unknown): Take {
  const take = file as TakeFile;
  const start: Record<string, number> = {};
  let at = 0;
  for (const s of take.scenes) {
    start[s.id] = at;
    at += s.frames;
  }
  const scene = (id: string) => {
    const found = take.scenes.find((s) => s.id === id);
    if (!found) throw new Error(`The cut has no scene "${id}". Is it in cut.json, and was bun run take run since?`);
    return found;
  };
  return { ...take, scene, start };
}

/** The part of the scene playing at frame f. */
export const partAt = (scene: TakeScene, f: number) => {
  let k = 0;
  for (let i = 0; i < scene.parts.length; i++) if (f >= scene.parts[i].at) k = i;
  return k;
};

/** The clip's time, in seconds, at the scene's frame f: lips and voice match across every cut. */
export function takeTime(take: TakeFile, scene: TakeScene, f: number) {
  const p = scene.parts[partAt(scene, f)];
  return p.in + clamp((f - p.at) / take.fps, 0, p.out - p.in - 0.5 / take.fps);
}

/**
 * The scene's voice: one cue per part, trimmed from the cleaned voice, with a 2-frame fade at each edge (`fade`, in
 * frames). The cut points sit in the quiet before and after the words, so the fade runs over room tone, not speech; 2 to
 * 3 frames is what the user's approved tutorials used.
 */
export function voiceCues(take: TakeFile, scene: TakeScene, { volume = 1, fade = 2, src = take.voice }: { volume?: number; fade?: number; src?: string } = {}): Cue[] {
  return scene.parts.map((p) => ({
    src,
    at: p.at,
    trim: [Math.round(p.in * take.fps), Math.round(p.in * take.fps) + p.frames] as [number, number],
    volume,
    fade: [fade, fade] as [number, number],
  }));
}

/** The frame of the scene where the n-th word containing `needle` is said: time a graphic to the word. */
export function saidAt(scene: TakeScene, needle: string, nth = 0) {
  const found = scene.words.filter((w) => w.t.includes(needle));
  if (!found[nth]) throw new Error(`"${needle}" isn't said in ${scene.id}`);
  return found[nth].at;
}

/**
 * The scale at a jump cut. Inside a line, where the head jumps across a cut, the framing alternates between 1 and
 * 1 + amount, which reads as a second camera; where the head held still there's nothing to hide and the framing holds.
 * An unknown jump (no face found) counts as a jump.
 */
export function cutZoom(scene: TakeScene, f: number, { amount = 0.1, visible = 0.012 }: { amount?: number; visible?: number } = {}) {
  let close = false;
  const k = partAt(scene, f);
  for (let i = 1; i <= k; i++) {
    const jump = scene.parts[i].jump;
    if (jump === undefined || jump === null || jump >= visible) close = !close;
  }
  return close ? 1 + amount : 1;
}

/** A quick punch-in on a beat that settles back: 1 -> 1 + amount -> 1. For a word that lands. */
export const punch = (f: number, beats: readonly number[], amount = 0.06) =>
  1 + beats.reduce((m, at) => Math.max(m, f >= at ? amount * Math.exp(-(f - at) / 7) * Math.min(1, (f - at + 1) / 2) : 0), 0);

/**
 * Seconds into the screen recording at the scene's frame f: what was on screen as this word was said, through every cut.
 * Throws when the recording isn't lined up yet (cut.md says how).
 */
export function screenTime(take: TakeFile, scene: TakeScene, f: number) {
  const at = take.screen?.at;
  if (at == null) throw new Error("The screen recording isn't lined up with the take: set screen.at in cut.json (cut.md says how) and run bun run take again.");
  return takeTime(take, scene, f) - at;
}

/**
 * The screen recording, playing in step with the person: the frame of it that was on screen as each word was said. It
 * fills its parent (`fit`, `focus` and `zoom` as on `<Footage>`); before the recording starts it holds its first frame.
 */
export function TakeScreen({ take, scene, f: given, fit = "cover", focus, zoom, style }: { take: TakeFile; scene: TakeScene; f?: number; fit?: "cover" | "contain"; focus?: [number, number]; zoom?: number; style?: CSSProperties }) {
  const local = useFrame();
  const f = given ?? local;
  const screen = take.screen;
  if (!screen) throw new Error("This take has no screen recording: bun run take <slug> --screen <file>.");
  return <Footage src={screen.src} fps={screen.fps} frames={screen.frames} at={() => Math.max(0, screenTime(take, scene, f))} fit={fit} focus={focus} zoom={zoom} style={style} />;
}

type CamProps = {
  take: TakeFile;
  scene: TakeScene;
  /** The box the camera fills, in px: a circle's diameter, a frame's size. */
  w: number;
  h: number;
  /** Where the face's centre lands in the box, as fractions. The eyes sit a little above the face's centre. */
  place?: [x: number, y: number];
  /**
   * The face's height (forehead to chin) as a fraction of the box's. A circle reads well at 0.4-0.5, a full frame at
   * 0.18-0.24. The clip always covers the box, so a phone take framed close can't go smaller in a square: the face
   * stays as big as covering needs (validate says so).
   */
  face?: number;
  /** A scale on top, about the face: cutZoom(), punch(), a slow push. */
  zoom?: number;
  /** The frame, if not the scene's own (a camera that plays a stretch of another scene). */
  f?: number;
  style?: CSSProperties;
  children?: ReactNode;
};

/**
 * The person, framed on their face: the face's centre at `place` and its height `face` of the box, whatever the clip's
 * shape, and never past the clip's edge (the framing gives way before blank shows). It fills its parent: put it inside a
 * circle or a frame of w x h. Marks the face for `bun run validate`, which checks it sits whole and centred in the box.
 */
export function TakeCam({ take, scene, w, h, place = [0.5, 0.44], face: faceSize = 0.4, zoom = 1, f: given, style, children }: CamProps) {
  const local = useFrame();
  const f = given ?? local;
  const { clip } = take;
  const [cx, cy, , fh] = scene.face ?? take.face ?? [0.5, 0.4, 0.3, 0.3];
  // Big enough that the face is `faceSize` of the box, and that the clip covers the box; `zoom` on top, always, so a
  // cut zoom or a punch shows even where covering decides the size.
  const cover = Math.max(w / clip.width, h / clip.height);
  const wanted = (faceSize * h) / (fh * clip.height);
  const s = Math.max(cover, wanted) * zoom;
  const iw = clip.width * s;
  const ih = clip.height * s;
  const left = clamp(place[0] * w - cx * iw, w - iw, 0);
  const top = clamp(place[1] * h - cy * ih, h - ih, 0);
  const fx = left + cx * iw;
  const fy = top + cy * ih;
  const fhPx = fh * ih;
  return (
    <div data-take-cam={scene.id} style={{ position: "absolute", inset: 0, overflow: "hidden", ...style }}>
      <Footage
        src={clip.src}
        fps={clip.fps}
        frames={clip.frames}
        at={() => takeTime(take, scene, f)}
        style={{ inset: "auto", left, top, width: iw, height: ih, objectFit: "fill" }}
      />
      {/* The face's box, for validate: the face is about as wide as 0.78 of its height. */}
      <div data-face={scene.face ? "seen" : "guessed"} data-face-forced={cover > wanted * 1.02 ? "" : undefined} style={{ position: "absolute", left: fx - fhPx * 0.39, top: fy - fhPx / 2, width: fhPx * 0.78, height: fhPx, pointerEvents: "none" }} />
      {children}
    </div>
  );
}

// ── moving the person and the screens ───────────────────────────────────────

/** A box on the frame, in px: x, y, width, height, corner radius (a circle is a square with radius w / 2). */
export type Box = readonly [x: number, y: number, w: number, h: number, r: number];
export const lerpBox = (a: Box, b: Box, k: number): Box => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k), lerp(a[4], b[4], k)];

/**
 * A box that springs from one place to the next at each key (scene frame, box): the person going from filling the frame
 * to a circle over the screen and back, a screen growing to full. Two keys at frame 0 spring from the first into the
 * second as the scene starts, which carries the move over the cut: `[[0, FULL], [0, CIRCLE]]`.
 */
export function boxAt(f: number, keys: readonly (readonly [at: number, box: Box])[], { stiffness = 170, damping = 19 } = {}): Box {
  let b = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [at, next] = keys[i];
    if (f >= at) b = lerpBox(b, next, spring(f - at, { stiffness, damping }));
  }
  return b;
}

/**
 * The person in a moving box (`boxAt`): clipped to it, framed on the face. The framing follows the box's size unless
 * `place` and `face` are given: about the eyes on the upper third and the face a fifth of the height when it fills the
 * frame, the whole head centred and the face over two fifths of it in a small circle, and in between as it moves.
 */
export function TakeFrame({ take, scene, box, place, face, zoom = 1, f, style, children }: { take: TakeFile; scene: TakeScene; box: Box; place?: [number, number]; face?: number; zoom?: number; f?: number; style?: CSSProperties; children?: ReactNode }) {
  const [x, y, w, h, r] = box;
  const small = clamp((700 - Math.min(w, h)) / 400);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: r, overflow: "hidden", ...style }}>
      <TakeCam take={take} scene={scene} w={w} h={h} place={place ?? [0.5, lerp(0.36, 0.44, small)]} face={face ?? lerp(0.2, 0.42, small)} zoom={zoom} f={f}>
        {children}
      </TakeCam>
    </div>
  );
}

/** A rectangle of a source (a screen recording, a redrawn page), in the source's own px: x, y, width, height. */
export type Crop = readonly [x: number, y: number, w: number, h: number];
export const lerpCrop = (a: Crop, b: Crop, k: number): Crop => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];

/**
 * A camera moving across a screen: crop keys (scene frame, crop, frames the move takes, 24 by default), each eased into
 * the next. Start a move a few frames before the word it's about, so it lands as the word does.
 */
export function cropAt(f: number, keys: readonly (readonly [at: number, crop: Crop, dur?: number])[]): Crop {
  let c = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [at, next, dur = 24] = keys[i];
    c = lerpCrop(c, next, prog(f, [at, at + dur], easings.inOutCubic));
  }
  return c;
}

/** How a crop of a sw x sh source fills a w x h box: the scale and the source's top-left, never showing past its edge. */
function cropFit(crop: Crop, [sw, sh]: readonly [number, number], w: number, h: number) {
  const [cx, cy, cw, ch] = crop;
  const s = Math.max(w / cw, h / ch, w / sw, h / sh);
  const left = clamp(-cx * s + (w - cw * s) / 2, w - sw * s, 0);
  const top = clamp(-cy * s + (h - ch * s) / 2, h - sh * s, 0);
  return { s, left, top };
}

/**
 * A crop of a source filling a w x h box: the camera on a screen (`cropAt` moves it). The children are the source at
 * its own size, `source` px: a `<TakeScreen>`, a `<Footage>`, a redrawn page. It covers the box and never shows past the
 * source's edge, so a crop near an edge gives way instead of showing blank.
 */
export function CropView({ crop, source, w, h, style, children }: { crop: Crop; source: readonly [w: number, h: number]; w: number; h: number; style?: CSSProperties; children: ReactNode }) {
  const { s, left, top } = cropFit(crop, source, w, h);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", ...style }}>
      <div style={{ position: "absolute", left, top, width: source[0], height: source[1], transform: `scale(${s})`, transformOrigin: "0 0" }}>{children}</div>
    </div>
  );
}

/** Where a point of the source (its px) lands in a CropView's box: for a tap, a highlight or an arrow on the screen. */
export function cropPoint(crop: Crop, source: readonly [number, number], w: number, h: number, px: number, py: number) {
  const { s, left, top } = cropFit(crop, source, w, h);
  return { x: left + px * s, y: top + py * s, s };
}

// ── captions of what's said ──────────────────────────────────────────────────

export type CaptionPage = { words: TakeWord[]; from: number; to: number };

/**
 * The words in pages, the way reels set them: up to `words` words and `chars` characters a page, a new page after
 * punctuation and at a pause of `gap` frames or more. A page shows from its first word until the next page starts, or
 * `hold` frames after its last word ends, whichever is first, so nothing hangs over a pause.
 */
export function captionPages(words: readonly TakeWord[], { words: max = 3, chars = 22, gap = 5, hold = 14 }: { words?: number; chars?: number; gap?: number; hold?: number } = {}): CaptionPage[] {
  const pages: TakeWord[][] = [];
  let cur: TakeWord[] = [];
  const len = (ws: TakeWord[]) => ws.reduce((n, w) => n + w.t.length + 1, -1);
  words.forEach((w, i) => {
    if (cur.length && (cur.length >= max || len([...cur, w]) > chars || w.at - cur[cur.length - 1].end >= gap)) {
      pages.push(cur);
      cur = [];
    }
    cur.push(w);
    if (/[.,?!:;]$/.test(w.t) && i < words.length - 1) {
      pages.push(cur);
      cur = [];
    }
  });
  if (cur.length) pages.push(cur);
  return pages.map((ws, i) => {
    const next = pages[i + 1]?.[0].at ?? Infinity;
    return { words: ws, from: ws[0].at, to: Math.min(next, ws[ws.length - 1].end + hold) };
  });
}

type CaptionProps = {
  words: readonly TakeWord[];
  /** Where the caption sits: a box (left, top, width; height optional) it's set in, centred, bottom-aligned. */
  style: CSSProperties;
  size?: number;
  font?: string;
  weight?: number;
  color?: string;
  /** Highlighted words (`hl` in cut.json). */
  accent?: string;
  /** A backing behind the page, or none. */
  backing?: string;
  /** "word": each word lands as it's said, the rest of the page dim until then. "page": the page lands whole. */
  reveal?: "word" | "page";
  pages?: Parameters<typeof captionPages>[1];
  /** The frame, if not the scene's own. */
  f?: number;
  /** Stops showing after this frame (a scene that cuts away early). */
  until?: number;
};

/**
 * What the person says, a few words at a time, from the cut's own words, so a recut moves the captions with it. Hebrew
 * reads right to left with English (product names, prompts) kept left to right inside it. Big and bold by default:
 * 80 px at 1080 wide. Marked for validate's text checks like any text.
 */
export function SpokenCaptions({ words, style, size = 80, font = "inherit", weight = 700, color = "#fff", accent = "#ffd400", backing = "rgba(0,0,0,.72)", reveal = "word", pages: opts, f: given, until }: CaptionProps) {
  const local = useFrame();
  const f = given ?? local;
  if (until !== undefined && f > until) return null;
  const page = captionPages(words, opts).find((p) => f >= p.from && f < p.to);
  if (!page) return null;
  const dir: Dir = page.words.some((w) => /[֐-׿]/.test(w.t)) ? "rtl" : "ltr";
  const k = spring(f - page.from, { stiffness: 420, damping: 22 });
  const word = (w: TakeWord) => {
    const on = reveal === "page" || f >= w.at;
    const pop = spring(f - w.at, { stiffness: 520, damping: 17 });
    const over = w.hl ? 0.28 : 0.12;
    return {
      display: "inline-block",
      color: w.hl ? accent : color,
      opacity: on ? 1 : 0.45,
      transform: reveal === "word" && on ? `scale(${1 + over * (1 - pop)})` : undefined,
    } satisfies CSSProperties;
  };
  // Words grouped into runs of one direction, so "Google Sheets" reads left to right inside a Hebrew line.
  const groups: { island: boolean; words: TakeWord[] }[] = [];
  for (const w of page.words) {
    const island = runs(w.t, dir).every((r) => r.island || !r.text.trim());
    const last = groups[groups.length - 1];
    if (last && last.island && island) last.words.push(w);
    else groups.push({ island, words: [w] });
  }
  return (
    <div dir={dir} style={{ position: "absolute", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 9, ...style }}>
      <div
        style={{
          maxWidth: "100%",
          textAlign: "center",
          fontFamily: font,
          fontWeight: weight,
          fontSize: size,
          lineHeight: 1.12,
          padding: backing === "none" ? 0 : `${size * 0.12}px ${size * 0.34}px ${size * 0.2}px`,
          borderRadius: size * 0.32,
          background: backing === "none" ? undefined : backing,
          textShadow: "0 4px 18px rgba(0,0,0,.55)",
          transform: `translateY(${(1 - k) * 20}px) scale(${0.94 + 0.06 * k})`,
          transformOrigin: "50% 100%",
        }}
      >
        {groups.map((g, i) => {
          const inner = g.words.map((w, j) => (
            <span key={j}>
              {j > 0 ? " " : ""}
              <span style={word(w)}>{g.island ? w.t : isolateWord(w.t, dir)}</span>
            </span>
          ));
          return (
            <span key={i}>
              {i > 0 ? " " : ""}
              {g.island ? <bdi dir={against(dir)}>{inner}</bdi> : inner}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** A Hebrew word with an English part (ב־Claude): the English part isolated so it keeps its order. */
function isolateWord(text: string, dir: Dir) {
  const parts = runs(text, dir);
  return parts.length === 1 ? text : parts.map((r, i) => (r.island ? <bdi key={i} dir={against(dir)}>{r.text}</bdi> : r.text));
}
