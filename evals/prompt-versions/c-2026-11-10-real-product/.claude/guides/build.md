# Building an ad

Read this once the user says go, with `.claude/guides/engine.md`, which says what the engine and the parts bin can do. The approved pitch is what you build.

## Code

Build in `src/ads/<slug>/` however the idea needs, and add one line to `src/registry.ts` per take (`take: "B"` gives `<slug>-B-<ratio>`). Register only the ratios the brief lists, as `ratios: ["1x1"]`. Lay each ratio out for its own shape rather than shrinking one: a 9:16 with an empty lower half isn't laid out for its shape. `src/parts/` and other ads' code are a parts bin now that the idea is chosen: reuse, copy or change what helps.

The page and the hand tracer read only `public/`, so copy what the ad uses from the brand kit's `assets/` into `public/ads/<slug>/` and point at it there, as in `{ family: "Brand Hand", src: "ads/<slug>/hand.woff2" }`.

Everything is built in code, apart from real footage the user gives you, free stock, and the generated shots the pitch lists.

CLAUDE.md's code rules apply: every value is a function of the frame (use `random(seed)`, and integrate anything that accumulates up front), and an ad timed by audio leaves out `frames` and reads `gen/timeline.json` through `useTimeline()`, never with an `import` of `gen/`.

**Scenes.** Split the ad into scenes where it cuts, and list them in the registry instead of one component: `defineAd({ slug, scenes: [{ id: "hook", name: "The hook", component: Hook, frames: 90 }, ...] })`. Inside a scene `useFrame()` starts at 0, and a scene's own `cues` move with it. Write `src/ads/<slug>/story.json` as `{ "order": ["hook", "demo", "end"] }` in the order you'd play them. The user can rearrange the story by drawing arrows on the desk's board, so read `story.json` before you render and keep its order. The user can also add their own images and video clips there, listed under `images` and placed in `order` like scenes. Images play as stills, and clips (with `clip` set) play their frames and sound. When you rewrite `story.json`, change only what you mean to and keep `images`, `arrows` and `board`. A single long take is one scene. Stills (a post image, a carousel) are `kind: "asset"`, one image per scene, and render writes PNGs.

**Settings go into the ad.** The brief's layouts, voice and word timing are written into the registry line and spec.json (a fixed voice as its `voice_id`, ElevenLabs timing as `"align": "eleven"` on each recorded voice), so the ad keeps them when the settings change later.

## Commands

```bash
bun run stills <id> --frames 0,30,60,90 --sheet        # one labelled image of those frames: Read it
bun run stills <id> --frames 240                       # one frame at full size, to look closely
bun run sheet <id>
bun run hand <slug>; bun run hand:check <slug>
.venv/Scripts/python py/mv.py build <slug> [--estimate]
.venv/Scripts/python py/mv.py blender <slug> --scene <file> --preview --frames 1,300
.venv/Scripts/python py/mv.py words <audio> [--lang he] # Whisper word times -> words.json beside it
bun run render <id> [--ratio all]
```

On a Mac the Python is `.venv/bin/python`. Run ElevenLabs only within the credits in the pitch. Beyond that, ask.

Footage, stock, generated shots and Hebrew have their own guides, listed in your prompt.

## Look before you render

Look at your own stills of every ratio (a `--sheet` each) before any full render, and look for these. `bun run validate <slug> --layout` measures the first four from the code in seconds and costs nothing, so run it too, and fix what fails:

- **Readable on a phone.** Text meant to be read is at least 32 px on a 1080-wide 9:16, and 40 px to be safe.
- **Safe areas.** In 9:16, clear of the top 200 px, the bottom 320 px (the platform's caption and buttons), 60 px on the left and 120 px on the right (the action rail). In 1:1 and 16:9, 54 px top and bottom, and 54 or 96 px at the sides. These are the platforms' own overlays, so the message has to sit inside them, however the layout is composed.
- **Nothing piled up.** Text never sits on other text or on UI the viewer has to read. The bake-off's two faults were a caption over a row in 16:9 and a toolbar over a row in 9:16.
- **Contrast** against the pixels behind the text, frame by frame where the background moves.
- **The end card** holds with the logo and the URL.

Stills can't show motion. Check it on a contact sheet (`bun run sheet <id>`): one layout held across shots, or a frame where nothing has changed for 3 s, shows there.

## First look

When the build looks right on stills and `validate --layout` passes, run `bun run render <slug> --ratio all` (every ratio the registry line lists), copy everything it wrote (the MP4s, the `-silent.mp4` videos, the MP3, and the thumbnails when the ad has them) to `queue/<YYYY-MM-DD>-<slug>/`, reply with the paths, and stop.
