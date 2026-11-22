import { createElement, Fragment, useId, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { asset } from "./asset";
import { Footage } from "./Footage";
import type { Cue } from "./cue";
import { RATIOS, SIZES, type Ratio } from "./ratio";
import { stories } from "./stories";
import { FrameContext, useFrame, useVideo } from "./timing";
import { transitionLook, transitionSpans, type StoryTransition, type TransitionSpan } from "./transitions";

/** What an ad's component receives, so each ratio can lay out for its own shape. */
export type AdProps = { ratio: Ratio; take?: string };

/** The start of public/ads/<slug>/gen/timeline.json. `src/parts/timeline.ts` knows the rest. */
export type TimelineFile = { fps: number; frames: number; [key: string]: unknown };

/** What `cues` gets when it's a function: everything about the video it's building sound for. */
export type CueInput = { ratio: Ratio; take?: string; fps: number; frames: number; timeline?: TimelineFile };

/**
 * One scene of an ad: a frame on the desk's board (spec.md §10.4). `useFrame()` inside it starts at 0.
 * `frames` can come from the timeline for an ad timed by audio. An asset's scene is one image, so it needs none.
 */
export type Scene = {
  id: string;
  name?: string;
  component: ComponentType<AdProps>;
  frames?: number | ((timeline?: TimelineFile) => number);
  cues?: Cue[] | ((video: CueInput) => Cue[]);
};

/** An image the user put on the board (spec.md §10.4). It plays as a still for `seconds`, filling the frame or fitted inside it. */
export type StoryImage = { src: string; name?: string; seconds?: number; fit?: "cover" | "contain"; clip?: StoryClip };

/**
 * A video clip put on the board (spec.md §6.5). `src` is then its frames ("ads/x/gen/footage/run/#####.jpg"), and it
 * plays from `from` seconds for `seconds`, or to its end. `sound` is its audio under public/, at `volume` (0 is muted).
 */
export type StoryClip = { fps: number; frames: number; from?: number; sound?: string; volume?: number };

/**
 * Where a scene starts and stops playing, in its own frames: `in` is the first frame shown (default 0) and `out` the
 * frame it stops before (default its length). The scene's code is untouched: it plays from `in`, its cues move with it.
 */
export type StoryTrim = { in?: number; out?: number };

/** src/ads/<slug>/story.json (or story-<take>.json). The desk writes it when you draw arrows; the agent may too. */
export type Story = {
  /** The scenes the video plays, in order. The only part the engine reads. */
  order?: string[];
  /** The arrows on the board. Kept so arrows between scenes off the story survive. */
  arrows?: [from: string, to: string][];
  start?: string;
  /** Where each scene sits on the board, in 16:9 board units. Has no effect on the video. */
  board?: Record<string, [x: number, y: number]>;
  /** Images added on the board, by id. Files are under public/ads/<slug>/board/. They're scenes like any other. */
  images?: Record<string, StoryImage>;
  /** Scene trims, by scene id. Board images have `seconds` and `from` instead, and an asset ignores them. */
  trim?: Record<string, StoryTrim>;
  /**
   * The transition INTO a scene from the one before it in `order`, by scene id (transitions.ts). The first scene's is
   * ignored, an unknown type is a cut, and `frames` is clamped to the scene's length. Timing doesn't change: the
   * outgoing scene holds its last frame under the incoming one's first `frames`.
   */
  transitions?: Record<string, StoryTransition>;
};

/** One registry entry. Give `scenes`, or one `component` and `frames`. Leave out `frames` to take them from gen/timeline.json. */
export type Ad = {
  slug: string;
  take?: string;
  /** "asset" is stills: each scene is one image, and render writes PNGs (spec.md §10.5). */
  kind?: "video" | "asset";
  component?: ComponentType<AdProps>;
  scenes?: Scene[];
  fps?: number; // default 30
  frames?: number;
  ratios?: Ratio[]; // default all three
  lang?: string; // default "en"
  /** The ad's own sound, like a music bed: it plays from the start of the story whatever the order. */
  cues?: Cue[] | ((video: CueInput) => Cue[]);
  /**
   * A cover image, designed for the platforms that let you upload one (YouTube, Reels, LinkedIn). It gets each ratio's
   * props and `useFrame()` is 0. `render` writes <id>-thumbnail.png and .jpg; `stills --thumbnail` shows it.
   */
  thumbnail?: ComponentType<AdProps>;
};

/**
 * A scene as the story places it. `from` is its first frame in the video and `frames` how long it plays. `full` is its
 * length before a trim, and `trimIn` the scene frame it starts on (0 untrimmed). `component` plays the trimmed scene, so
 * its frame 0 is `trimIn`; `whole` is the scene untrimmed, for showing what a trim cut. `image` marks one added on the board.
 */
export type SceneSpan = {
  id: string;
  name: string;
  from: number;
  frames: number;
  full: number;
  trimIn: number;
  component: ComponentType<AdProps>;
  whole: ComponentType<AdProps>;
  image?: StoryImage;
};

/** One output file: an ad in one ratio. This is what the engine, preview and scripts pass around. */
export type Video = {
  id: string;
  slug: string;
  take?: string;
  kind: "video" | "asset";
  ratio: Ratio;
  width: number;
  height: number;
  fps: number;
  frames: number; // 0 until the timeline it takes its length from has been built
  lang: string;
  dir: "ltr" | "rtl";
  /** Every cue, `at` from the start of the video. A scene's cues carry its id as `scene`. */
  cues: (Cue & { scene?: string })[];
  timeline?: TimelineFile;
  component: ComponentType<AdProps>;
  /** Every scene, in registry order, with `from` set for the ones on the story. An ad with one component has one. */
  scenes: (SceneSpan & { onStory: boolean })[];
  /** The scene ids the video plays, in order. */
  order: string[];
  story?: Story;
  /** Its length comes from gen/timeline.json, so reordering scenes puts the voice out of order. */
  audioTimed: boolean;
  /** The ad's cover image, if it has one (`Ad.thumbnail`). */
  thumbnail?: ComponentType<AdProps>;
  /** The story's transitions that play, in order, each over video frames [start, start + frames). Empty for one component or an asset. */
  transitions: TransitionSpan[];
};

const timelines = import.meta.glob<TimelineFile>("/public/ads/*/gen/timeline.json", { eager: true, import: "default" });

const RTL_LANGS = ["he", "ar", "fa", "ur"];

export const defineAd = (ad: Ad): Ad => ad;

export const storyPath = (slug: string, take?: string) => `/src/ads/${slug}/story${take ? `-${take}` : ""}.json`;

/** The order the video plays: story.json's, minus ids that aren't scenes. Without one, every scene in registry order. */
export function storyOrder(ids: string[], story?: Story) {
  if (!story?.order) return ids;
  const known = new Set(ids);
  return [...new Set(story.order)].filter((id) => known.has(id));
}

/** A board image as a scene: the picture over black, the same in every ratio. */
function stillOf(image: StoryImage): ComponentType<AdProps> {
  const fill = { position: "absolute", inset: 0, width: "100%", height: "100%" } as const;
  return () => createElement("div", { style: { ...fill, background: "#000" } }, createElement("img", { src: asset(image.src), alt: "", style: { ...fill, objectFit: image.fit ?? "cover" } }));
}

/** A board clip as a scene: its frames over black. */
function clipOf(image: StoryImage, clip: StoryClip): ComponentType<AdProps> {
  const fill = { position: "absolute", inset: 0, width: "100%", height: "100%" } as const;
  return () => createElement("div", { style: { ...fill, background: "#000" } }, createElement(Footage, { src: image.src, fps: clip.fps, frames: clip.frames, from: clip.from, fit: image.fit }));
}

/** How long a board image or clip plays: its `seconds`, or for a clip what's left of it after `from`. */
export const imageSeconds = (image: StoryImage) =>
  image.seconds ?? (image.clip ? Math.max(image.clip.frames / image.clip.fps - (image.clip.from ?? 0), 0.1) : 2);

/** A board clip's own sound, from where its picture starts. A short fade at each end, so a cut doesn't click. */
function clipCues(clip: StoryClip | undefined, fps: number): Cue[] {
  if (!clip?.sound || clip.volume === 0) return [];
  return [{ src: clip.sound, trim: Math.round((clip.from ?? 0) * fps), volume: clip.volume ?? 1, fade: [1, 2] }];
}

/** Plays a trimmed scene from its `in`: the scene's own frame is the Sequence's plus `in`. */
function trimmed(component: ComponentType<AdProps>, from: number): ComponentType<AdProps> {
  return (props: AdProps) => createElement(FrameContext.Provider, { value: useFrame() + from }, createElement(component, props));
}

/**
 * Marks a scene's frame on the page for `data-fx` (fx.ts): a box-less wrapper holding the scene's own frame, the one
 * `useFrame()` gives its code, and its length. It goes inside a trim, so a trimmed scene counts as its code does.
 */
function marked(component: ComponentType<AdProps>, length: number): ComponentType<AdProps> {
  return (props: AdProps) =>
    createElement("div", { "data-nykma-frame": useFrame(), "data-nykma-length": length, style: CONTENTS }, createElement(component, props));
}

const CONTENTS: CSSProperties = { display: "contents" };
/** A scene inside a transition: a full-frame layer over black, as it would be on the stage alone. */
const LAYER: CSSProperties = { position: "absolute", inset: 0, overflow: "hidden", background: "#000" };

/** A trim as frames: `in` and `out` inside the scene, at least one frame apart. */
function trimOf(trim: StoryTrim | undefined, full: number) {
  if (!trim || full <= 0) return { trimIn: 0, out: full };
  const whole = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback);
  const trimIn = Math.min(Math.max(whole(trim.in, 0), 0), full - 1);
  const out = Math.min(Math.max(whole(trim.out, full), trimIn + 1), full);
  return { trimIn, out };
}

/**
 * A trimmed scene's cues, in its trimmed frames. One that starts before `in` starts at 0, later into its source; one
 * whose known end (a `trim` range) is before `in`, or that starts at or after `out`, is dropped. One that runs past
 * `out` plays on, as a cue running past an untrimmed scene's end always has.
 */
function trimCues(cues: Cue[], trimIn: number, out: number): Cue[] {
  return cues.flatMap((cue) => {
    const at = cue.at ?? 0;
    if (at >= out) return [];
    const late = trimIn - at;
    if (late <= 0) return [{ ...cue, at: at - trimIn }];
    const [from, to] = typeof cue.trim === "number" ? [cue.trim, undefined] : (cue.trim ?? [0, undefined]);
    if (to !== undefined && from + late >= to) return [];
    return [{ ...cue, at: 0, trim: to === undefined ? from + late : ([from + late, to] as [number, number]) }];
  });
}

function cuesOf(cues: Ad["cues"], input: CueInput | undefined): Cue[] {
  if (typeof cues !== "function") return cues ?? [];
  return input ? cues(input) : [];
}

/** One `Video` per ratio of an ad. */
export function videosOf(ad: Ad): Video[] {
  const { slug, take, ratios = RATIOS, lang = "en", kind = "video" } = ad;
  const timeline = timelines[`/public/ads/${slug}/gen/timeline.json`];
  const story = stories[storyPath(slug, take)] ?? stories[storyPath(slug)]; // A take without its own story plays the ad's.
  const audioTimed = ad.frames === undefined && kind === "video" && (ad.scenes ?? []).every((scene) => typeof scene.frames !== "number");
  const fps = (audioTimed ? timeline?.fps : undefined) ?? ad.fps ?? 30;

  // An ad that is one component is one scene named after the ad, and its cues move with it once images go around it.
  const code: Scene[] = ad.scenes?.length
    ? ad.scenes
    : ad.component
      ? [{ id: slug, name: slug, component: ad.component, frames: ad.frames ?? timeline?.frames ?? 0, cues: ad.cues }]
      : [];
  if (!code.length) throw new Error(`${slug}: give the ad \`scenes\` or a \`component\``);
  const codeIds = new Set(code.map((scene) => scene.id));
  const images = Object.entries(story?.images ?? {})
    .filter(([id, image]) => !codeIds.has(id) && typeof image?.src === "string")
    .map(([id, image]) => ({
      id,
      name: image.name ?? id,
      component: image.clip ? clipOf(image, image.clip) : stillOf(image),
      frames: Math.max(1, Math.round(imageSeconds(image) * fps)),
      cues: clipCues(image.clip, fps),
      image,
    }));
  const declared: (Scene & { image?: StoryImage })[] = [...code, ...images];
  // Scenes, a component with board images or a trimmed component: the story decides. A component alone plays as it
  // always has.
  const trims = kind === "asset" ? {} : (story?.trim ?? {});
  const storied = Boolean(ad.scenes?.length) || images.length > 0 || (!ad.scenes?.length && Boolean(trims[slug]));
  const adCues = ad.scenes?.length ? ad.cues : storied ? undefined : ad.cues;

  const fullOf = (scene: Scene) => {
    if (kind === "asset") return 1;
    const frames = typeof scene.frames === "function" ? scene.frames(timeline) : scene.frames;
    return Math.max(0, Math.round(frames ?? 0));
  };
  // A code scene's trim. Board images and clips aren't trimmed here: they have `seconds` and `from`.
  const trimFor = (scene: Scene & { image?: StoryImage }) => (scene.image ? undefined : trims[scene.id]);
  const lengthOf = (scene: Scene & { image?: StoryImage }) => {
    const { trimIn, out } = trimOf(trimFor(scene), fullOf(scene));
    return out - trimIn;
  };
  const order = storied ? storyOrder(declared.map((scene) => scene.id), story) : [declared[0].id];
  const byId = new Map(declared.map((scene) => [scene.id, scene]));

  let at = 0;
  const placed = new Map<string, number>();
  for (const id of order) {
    placed.set(id, at);
    at += lengthOf(byId.get(id)!);
  }
  // An ad that is one component keeps its own length, as before.
  const frames = storied ? at : (ad.frames ?? timeline?.frames ?? 0);

  const scenes = declared.map((scene) => {
    const full = storied ? fullOf(scene) : frames;
    const { trimIn } = storied ? trimOf(trimFor(scene), full) : { trimIn: 0 };
    const length = storied ? lengthOf(scene) : frames;
    // An ad that is one component plays on the stage's own frame, which the stage marks, so it isn't wrapped.
    const own = storied ? marked(scene.component, trimIn + length) : scene.component;
    return {
      id: scene.id,
      name: scene.name ?? scene.id,
      from: placed.get(scene.id) ?? 0,
      frames: length,
      full,
      trimIn,
      component: trimIn ? trimmed(own, trimIn) : own,
      whole: storied ? marked(scene.component, full) : scene.component,
      onStory: placed.has(scene.id),
      ...(scene.image ? { image: scene.image } : {}),
    };
  });
  const playing = order.map((id) => scenes.find((scene) => scene.id === id)!);
  const transitions = storied && kind === "video" ? transitionSpans(playing, story?.transitions).filter((span) => span.frames > 0) : [];

  const component: ComponentType<AdProps> = ad.component && !storied ? ad.component : storyPlayer(playing, transitions);

  return ratios.map((ratio) => {
    // With no timeline yet there's nothing to cue from, and one ad's unbuilt audio mustn't break the registry for the rest.
    const input = frames ? { ratio, take, fps, frames, timeline } : undefined;
    const sceneCues = (storied ? playing : []).flatMap((scene) => {
      const declaredScene = byId.get(scene.id)!;
      // A cue function builds from the scene's own, untrimmed timing; the trim then cuts its list.
      const own = cuesOf(declaredScene.cues, scene.full ? { ratio, take, fps, frames: scene.full, timeline } : undefined);
      const trim = trimFor(declaredScene);
      const cues = trim ? trimCues(own, scene.trimIn, scene.trimIn + scene.frames) : own;
      return cues.map((cue) => ({ ...cue, at: (cue.at ?? 0) + scene.from, scene: scene.id }));
    });
    return {
      id: [slug, take, ratio].filter(Boolean).join("-"),
      slug,
      take,
      kind,
      ratio,
      ...SIZES[ratio],
      fps,
      frames,
      lang,
      dir: RTL_LANGS.includes(lang.split("-")[0]) ? "rtl" : "ltr",
      cues: [...cuesOf(adCues, input), ...sceneCues],
      timeline,
      component,
      scenes,
      order,
      story,
      audioTimed,
      thumbnail: ad.thumbnail,
      transitions,
    };
  });
}

/**
 * Plays the story's scenes in order, each in a box-less wrapper (`data-nykma-scene`), so a scene lays out as it would
 * on the stage alone. Inside a transition the two scenes become full-frame layers: the outgoing one held on its last
 * frame, the incoming one playing from its frame 0, each with the transition's look.
 */
function storyPlayer(playing: SceneSpan[], transitions: TransitionSpan[]): ComponentType<AdProps> {
  return function Story(props: AdProps) {
    const frame = useFrame();
    const { width, height } = useVideo();
    const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    // The transition playing now, if any, and how far through it is: never all of either scene.
    const active = transitions.find((span) => frame >= span.start && frame < span.start + span.frames);
    const look = active ? transitionLook(active.type, (frame - active.start + 1) / (active.frames + 1), { width, height }) : null;
    const smear = look?.smear && look.smear > 0.3 ? `nykma-smear-${uid}` : undefined;

    const layers: ReactNode[] = playing.map((scene, i) => {
      const local = frame - scene.from;
      const leaving = Boolean(active && look && active.prev === scene.id && playing[i + 1]?.id === active.scene);
      const at = local >= 0 && local < scene.frames ? local : leaving ? scene.frames - 1 : undefined;
      if (at === undefined) return null;
      let style = CONTENTS;
      if (look && (leaving || active!.scene === scene.id)) {
        const own = leaving ? look.out : look.in;
        const filter = [own.filter, smear && `url(#${smear})`].filter(Boolean).join(" ") || undefined;
        style = { ...LAYER, ...own, filter, zIndex: leaving === Boolean(look.outOnTop) ? 2 : 1 };
      }
      return createElement(
        "div",
        { key: scene.id, "data-nykma-scene": scene.id, style },
        createElement(FrameContext.Provider, { value: at }, createElement(scene.component, props)),
      );
    });
    if (look?.overlay) layers.push(createElement("div", { key: "nykma-overlay", style: { position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none", ...look.overlay } }));
    if (smear)
      layers.push(
        createElement(
          "svg",
          { key: "nykma-smear", width: 0, height: 0, style: { position: "absolute" }, "aria-hidden": true },
          createElement(
            "filter",
            { id: smear, x: "-5%", y: "0%", width: "110%", height: "100%", colorInterpolationFilters: "sRGB" },
            createElement("feGaussianBlur", { stdDeviation: `${+look!.smear!.toFixed(2)} 0`, edgeMode: "duplicate" }),
          ),
        ),
      );
    return createElement(Fragment, null, ...layers);
  };
}
