# The engine and the parts bin

Read this with the build guide once the user says go. It's what the engine and `src/parts/` can do, so the build can start from here instead of reading old ads to learn how things are wired. Old ads are still there to copy from when one has exactly the piece you need, but they're one way of doing things, not the way. Each section names the file that has the rest.

## An ad

```tsx
// src/ads/<slug>/Launch.tsx
import { useFrame, useVideo, type AdProps, type Layout } from "../../engine";
import { easings, interpolate, prog } from "../../parts";

const L: Layout<{ size: number; pad: number }> = {          // one entry per ratio: each shape laid out for itself
  "16x9": { size: 120, pad: 120 }, "1x1": { size: 110, pad: 90 }, "9x16": { size: 120, pad: 80 },
};

export function Hook({ ratio }: AdProps) {
  const f = useFrame();                                       // frames from the start of this scene
  const { width, height, fps, dir } = useVideo();
  const k = prog(f, [0, 20], easings.outCubic);               // 0..1 over frames 0-20
  return <div style={{ position: "absolute", inset: 0, fontSize: L[ratio].size, opacity: k }}>…</div>;
}
```

In `src/registry.ts`, one line per take, with only the brief's ratios:

```ts
defineAd({ slug: "launch", ratios: ["1x1"], scenes: [{ id: "hook", name: "The hook", component: Hook, frames: 90 }, …] })
defineAd({ slug: "launch", ratios: ["1x1"], scenes: [...], cues: [{ src: "ads/launch/gen/mix.wav" }] })   // timed by audio: no frames
defineAd({ slug: "post", kind: "asset", ratios: ["1x1"], scenes: [{ id: "a", component: A }] })           // stills, one PNG each
```

A scene's `frames` can be a function of the timeline, `(tl) => …`. A scene's `cues` (or the ad's) are sounds: `{ src, at, volume, fade, trim }` in frames (`src/engine/cue.ts`). `story.json` orders the scenes (the build guide). All of an ad's fields: `src/engine/ad.ts`.

## The engine (`src/engine/`)

- `useFrame()`, `useVideo()`: the frame, and the video (id, ratio, width, height, fps, frames, lang, dir).
- `<Sequence from duration>`: a stretch inside a scene, with `useFrame()` starting at 0 again.
- `random(seed)`: a number in [0, 1) from the seed alone. In a loop, `random(\`star-${i}\`)`.
- `asset("ads/<slug>/x.png")`: the URL of a file under `public/`.
- `<Plate src first length loop>`: a numbered image sequence (Blender layers, unpacked recordings) for the current frame.
- `<Footage>` and `<ScreenInsert>`: real or generated video, and your scene on a screen in it (the footage and generated guides).
- `holdFrame(promise)`: makes captures wait for something loading that the page can't see, like a WebGL texture (`src/engine/ready.ts`).
- `useTune()`: knobs the user can turn on the desk without asking you. `k("headline.size", 86)` is a value, `nudge("headline")` an offset to spread into a style (`translate`/`scale`, so your own `transform` still plays), `at("headline.in", 30)` a named frame. The values live in `src/ads/<slug>/tune.json`; read it before you change a value it overrides, and fold it into the code if you'd rather own it. Give the few things a person would want to adjust a knob: the headline's size and place, the moment the end card lands.
- `data-fx="in:fade-up@12+15 loop:float out:fade@80+10"` on any element: a stock entrance, emphasis loop and exit, counted in the scene's own frames (`slot:effect[@start][+frames][*amount][~ease]`; the list is `EFFECTS` in `src/engine/fx.ts`). Good for the plain moves you'd otherwise hand-write, and the desk can edit them. It writes `translate`/`scale`/`rotate`/`filter`/`mask-image` and composes with your own values for those, so keep your `transform` and `opacity` motion as it is.
- Transitions between scenes are story.json's `transitions` (`{ "two": { "type": "push-left", "frames": 15 } }`, the list is `TRANSITIONS` in `src/engine/transitions.ts`). They don't move anything in time: the outgoing scene holds its last frame under the incoming one's first frames, so a scene that a transition comes into should open on something worth seeing from frame 0, and the one before it should end on a frame that can be held.

**The desk edits your code too.** The user can click an element in the viewer and change plain literals in place: JSX text, and numbers or strings in a `style={{ … }}` object or an attribute. So write the copy and the sizes people tweak as literals on the element where it's natural, keep `isolate()` and `dir` around Hebrew text, and expect the file to have changed since you last read it.

## The parts bin (`src/parts/`)

Import from `../../parts`, except `Three` (below).

- **Shapes** (`morph.ts`): `morph(from, to, k)` gives an SVG path between two closed outlines, with `rect`, `ellipse` and `star` to make them.
- **Time** (`time.ts`): `prog(f, [a, b], ease)`, `interpolate(f, input, output, { ease })`, `between(f, keys)`, `spring(f, { stiffness, damping })` solved exactly, `easings.*`, `clamp`, `lerp`. Everything is numbers in and out, so it works for DOM, SVG, canvas and three.js alike.
- **Camera** (`camera.tsx`): `<CameraView cam={camAt(f, keys)}>` films children laid out in world pixels: pans and pushes over a big canvas, zoom eased in log space so pushes feel even.
- **Pointer and typing** (`Cursor.tsx`, `Typing.tsx`): a keyframed cursor with click ripples, and typed text with a caret that follows the text's direction.
- **Sketches** (`Rough.tsx`): hand-drawn shapes (rough.js) that draw on over a span, the same wobble for the same seed.
- **Words** (`Caption.tsx`, `EndCard.tsx`): a word-by-word kinetic line that builds in reading order, and a logo, tagline and URL card that mirrors for Hebrew.
- **Bidi** (`bidi.tsx`): `isolate(text, dir)` wraps English, numbers and prices inside Hebrew in `<bdi>`.
- **Handwriting** (`hand/`): list texts and SVG paths in the ad's `hand.ts`, run `bun run hand <slug>`, then `<HandText id write={[a, b]} pen />` writes them stroke by stroke, with `erase`, `mode="ink"` and `handCues` for pen sounds. `bun run hand:check` numbers the strokes. Details in `hand/index.ts`.
- **Audio timing** (`timeline.ts`): `useTimeline()` reads `gen/timeline.json`, and `said(tl, track, word)`, `marker`, `beatPhase`, `pulse`, `energy`, `section` cue the picture to words, beats and sections instead of hard-coded seconds. Never `import` the file.
- **3D** (`Three.tsx`): a three.js scene drawn from the frame. Read `.claude/guides/3d.md` first.

## Reimagining the product

When the pitch enhances or reimagines the product rather than showing the app 1:1, these are the usual moves, and all of them are frame math:

- **Pull it apart.** Build the UI as separate layers (the card, its title, its button) and move them apart in depth with CSS 3D (`perspective`, `translateZ`), so one screen becomes an exploded view.
- **Blow up the part that matters.** `<CameraView>` pushes into one element of a big canvas until it fills the frame, then pulls out to reveal where it sits.
- **Strip it to its moment.** Redraw only the element the shot is about, large, in the brand's colours and shapes, with the rest of the screen gone.
- **Reveal through it.** SVG masks and `clip-path` grow a shape (the app's icon, a card's corners) to open the next shot.
- **Morph one shape into the next** (`morph.ts`): `<path d={morph(rect(0, 0, 300, 600, 40), ellipse(150, 300, 120), k)} />` turns a phone-shaped card into a disc. `rect`, `ellipse` and `star` make outlines, and any list of points works, so a logo's outline can become a button.
- **Words as objects.** Kinetic type that builds, scales and moves with the shot (`Caption`), set big.
- **Into the world.** three.js for UI pieces as physical objects (`.claude/guides/3d.md`).

## Sound (`public/ads/<slug>/spec.json`, `py/mv.py`)

```json
{ "fps": 30, "lang": "en", "duration": 10,
  "music": { "prompt": "…", "instrumental": true, "length_s": 10 },
  "mix": { "fade_out": 0.4 },
  "voices": [{ "id": "hook", "at": 0.3, "voice_id": "…", "text": "…" }] }
```

`mv.py build <slug> --estimate` prices it, `mv.py build <slug>` makes it within the pitch's credits, and writes `gen/mix.wav` and `gen/timeline.json`. Music can also be your own file or a script, and voices your own recording (spec.md §6.3). `mv.py voices` lists the account's voices.

## Not only DOM

Everything on the page is fair game as long as it's a function of the frame: SVG (paths, masks, filters, `pathLength` draw-ons), a 2D `<canvas>` you redraw from the frame in a layout effect, CSS 3D transforms (`perspective`, `rotateY`, `matrix3d`), blend modes, clip paths, WebGL through `Three`. What's off limits is anything that keeps its own time: CSS animations and transitions, `requestAnimationFrame` loops, timers, `Date.now()`, video elements playing on their own, and physics stepped by elapsed time. If an effect needs history (a trail, a simulation), compute it from frame 0 up to the current frame on each frame, or bake it into data first.
