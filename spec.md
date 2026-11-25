# nykma: spec

**nykma** (*nobody knows my app*) is a bare-bones ad maker. You ask Claude Code for an ad, and it comes up with an idea, builds it in code, and hands you MP4s with post copy: 1:1 unless you ask for 16:9 or 9:16 too.

**The model is** `mathbooklm-ad` **+ its** `ad-agent`**:** one agent, one short prompt, a box of reusable parts, and a lot of creative freedom. That setup made better ads in one prompt than the Helix pipeline in `ai-ad-and-video-maker` made in hours. Helix is the example of what **not** to do: Product DNA extraction, contracts, a coordinator with eight sub-agents, a studio app, jobs and queues. nykma uses none of its code, structure or ideas.

**The rule for this spec:** when in doubt, leave it out. Every piece of machinery has to earn its place by saving real time or tokens, and none may tell the agent *how* an ad should look.

---

## 1. Goals

1. **Creative freedom.** The agent picks the idea, the visual world, the rhythm and the style: music video, deadpan, 3D, chalk, memes, a single long take. Existing ads are a parts bin, not templates. No schemas for shots and no fixed list of camera moves.
2. **Pitch before building.** A cheap pitch (the idea + a rough storyboard + a free slideshow animatic) comes first, and the agent stops until you say go. That's where tokens are saved (§7).
3. **The frame is the source of truth.** Every value is a function of the frame number, so renders are exact and repeatable.
4. **Local, free and commercial-safe.** No Remotion. Every library has a permissive license. Nothing is published and no money is spent without your go-ahead.
5. **You see it first, then it's checked.** You watch the rendered ad before any checks run, and you decide whether it gets checked, changed or dropped (§7.2). A reviewer agent catches elements that could be adjusted to look better, and free validators catch the mechanical problems (§7.3). The reviewer only suggests adjustments, so it never pushes an idea toward a template.
6. **Bare bones.** A small engine, a few scripts and two short agent prompts. No database, runner or pipeline of stages. The desk (§10) is a UI over the files and keeps no state of its own.
7. **Hebrew works as well as English.** Right-to-left text, motion, handwriting, voice and checks are all supported, and Hebrew copy is written in Hebrew rather than translated (§6.4).
8. **Each ratio is laid out for its own shape, not shrunk.** An ad's component gets the ratio and places things for that shape. A 9:16 is never a 16:9 scaled down or cropped.
9. **Everything can be done from the UI.** Making a brand kit, starting a project, answering the pitch, rearranging the story, rendering and checking all work from the desk (§10), and the same agent does the work. The terminal still does everything too.

## 2. Non-goals or future goals

- A hosted web app, job queue or database. The desk (§10) runs locally on the dev server, and its state is the files: queue folders, `src/ads/<slug>/` and `brands/`.
- Drawing tools (new shapes, new text boxes, keyframes by hand). The agent makes the scenes; the desk changes the values they already have (§10.13) and arranges them on the timeline (§10.4).
- A multi-agent pipeline (brand analyst → copywriter → scene composer → QA). One agent makes the whole ad, and the reviewer only suggests adjustments.
- Schemas or contracts for ads, storyboards or brands. Markdown and code are enough.
- AI-generated images or footage *instead of* code. Every ad is still built in code (React, SVG, Blender). Generated stills and clips are an addition for what code can't make well, such as a real-looking person reacting or the world an idea lives in (§6.6), never the product's UI, the brand or a claim.
- Posting unasked. Ads land in `queue/` for you. They go out when you publish them from the desk's Publishing (§10.12) or by hand, or when you ask an agent to, which posts through the same desk with `bun run publish`.

---

## 3. Stack

| Piece | Choice | License |
|---|---|---|
| Runtime / package manager | bun | MIT |
| Picture | React 19 + TypeScript, DOM/SVG/CSS | MIT |
| Preview / bundler | Vite | MIT |
| Serving `public/` to renders | `sirv` | MIT |
| Frame capture | Playwright (headless Chromium) | Apache-2.0 |
| Audio pipeline | Python 3.13 `.venv`: `elevenlabs`, `librosa`, `soundfile`, `numpy` | MIT / ISC / BSD |
| Word times from recordings | `faster-whisper` on the CPU, with ivrit.ai's Hebrew model | MIT; model Apache-2.0 |
| The brand's own videos | `yt-dlp` in the `.venv`, using Node for YouTube's scripts | Unlicense |
| 3D | Blender 5.x (4.5 LTS on Intel Macs), headless `bpy` scripts | GPL program; renders are ours |
| Encode + mix | ffmpeg CLI | run as a separate program |
| Hand-drawn shapes | `roughjs` | MIT |
| Editing Markdown on the desk (§10.11) | CodeMirror 6 (`@codemirror/*`, `@lezer/highlight`) | MIT |
| Finding a screen in a clip (§6.7) | OpenCV (`opencv-python-headless`) in the `.venv` | Apache-2.0 |

Scripts run on Node with `--experimental-strip-types`, because Playwright hangs under bun on Windows. `bun run <x>` remains the command.

**Connections:**

- **Claude Code** is the agent, used interactively like `ad-agent` in mathbooklm. The desk runs it through the path, model and effort on its settings page (§10.8).
- **ElevenLabs** (optional) is for music, voice and sfx, and forced alignment when it's asked for.
- **Pexels and Pixabay** (optional, free) are for stock photos and clips, searched before anything is generated (§6.8).
- **GitHub** (optional) is used only when you ask: the agent can open an issue or PR with a queue item through `gh`.

Without the optional connections, everything stays local. ElevenLabs output needs a paid plan for commercial use.

---

## 4. Layout

```
nykma/
├─ CLAUDE.md                 # short: commands, code rules, limits (§8)
├─ .claude/agents/ad-agent.md   # the agent prompt (§8): hard rules, stages, finding the idea, craft
├─ .claude/agents/concept-explorer.md   # the three explorers before a pitch (§7.1)
├─ .claude/agents/ad-reviewer.md   # the reviewer prompt (§7.3), short
├─ .claude/guides/           # what the agent reads at each stage: build, footage, stock, generated, hebrew, checks, hand-off, brand-kit (§8)
├─ evals/                    # fixed briefs, frozen prompt versions and their results, for testing a prompt change (§8.1)
├─ package.json, vite.config.ts, tsconfig.json, .env.example
├─ index.html, capture.html  # the two build entries: the preview page, and the bare stage Playwright captures
├─ desk.html, board.html     # the desk (served at /), and one scene for its board (§10.3), dev server only
├─ src/
│  ├─ engine/                # useFrame, Sequence, Stage, Plate, the page API for capture (§5)
│  ├─ desk/                  # the desk (bun run dev): dashboard, viewer, timeline, inspector, chat (§10)
│  ├─ board/                 # an ad in an iframe for the desk: the viewer, a scene alone, filmstrips (§10.3)
│  ├─ preview/               # scrub/play page (/ on the dev server)
│  ├─ parts/                 # the parts bin (§6): reuse, copy, change or ignore
│  ├─ ads/<slug>/            # one folder per ad, structured however the ad needs, plus story.json (§10.4)
│  └─ registry.ts            # one line per ad: id, scenes or component, fps, length, sizes
├─ brands/<brand>/           # saved brand kit (§9), uploads/ for files given in the desk
├─ py/                       # audio pipeline + Blender helpers, ported from mathbooklm-ad/mv (§6.3)
├─ scripts/                  # render, stills, sheet, animatic, review, validate, hand-trace, brand-check, history, eval, audio/*.mjs
├─ public/                   # shared sfx, fonts; public/ads/<slug>/ for an ad's audio, images and copied brand files; gen/ inside it is gitignored
├─ queue/_template/          # the pitch.md, README.md and post.md every ad starts from
├─ queue/<date>-<brand>-<slug>/      # hand-off (§7.4): pitch.md, README.md, post.md, review.md, validate.md, renders (mp4s gitignored)
└─ out/                      # scratch renders and stills (gitignored)
```

---

## 5. The engine (no Remotion)

Small enough to read in one sitting:

- **In the page:** `useFrame()`, `useVideo()` (fps, length, size), and `<Sequence from duration>` to shift time for a scene. `<Stage>` mounts an ad at its exact output size. `window.nykma.seek(frame)` resolves once React has committed, fonts are ready and images have decoded. `window.nykma.inspect()` returns the visible text on the current frame, with each element's box, font, size and colour, for the validators.
- **Desk:** `bun run dev` opens the desk, the UI for the whole flow (§10).
- **Scenes:** an ad can list its scenes instead of one component, and `story.json` sets their order (§10.4). An ad with one `component` is one scene.
- **Trims:** `story.json` can trim a scene (`trim`, §10.4). The scene then starts later or stops sooner, and its code is untouched: `useFrame()` inside it counts from the trim's `in`, and its cues move with it. Renders go through the same engine, so a trim is in the MP4 too.
- **Knobs:** `src/engine/tune.ts`. An ad reads a value by name, with the value in its code as the fallback, so the desk can change it without touching the code:
  - `const { k, nudge, at } = useTune()` inside a component, or `tuneFor({ slug, take, ratio })` outside one, such as in a cue function
  - `k("title.size", 120)` is a number, string or boolean; `at("drop", 90)` is a named time in frames
  - `nudge("logo")` returns CSS `translate`, `scale` and `rotate`, which add to the element's own `transform`, so its motion keeps playing. Don't set those three yourself on a nudged element
  - the values are in `src/ads/<slug>/tune.json` (`tune-<take>.json` for a take with its own): `{ "all": { "title.size": 132 }, "9x16": { "logo": { "dx": 0, "dy": -40, "scale": 1.2 } } }`. A ratio's entry wins over `all`. With no file or no key, a knob is its fallback
  - the desk writes the file through `POST /api/tune`, and a mounted page takes the change without a reload (a new file reloads it once). While you drag, the desk sets `setLiveTune()` values in memory only; renders never see them
  - `knobsSeen()` lists the knobs the ads have read, for the desk's panel. `validate` warns about a tune.json key no code in the ad mentions
- **Transitions:** `story.json`'s `transitions` puts a transition into a scene (`src/engine/transitions.ts`, §10.4). The scenes keep their starts and the video its length; the outgoing scene holds its last frame under the incoming one. `Video.transitions` lists the ones that play, each with `start` and `frames`. Scenes sit in `display: contents` wrappers (`data-nykma-scene`) that become full-frame layers only while a transition plays.
- **Effects:** `src/engine/fx.ts`. Any element can carry `data-fx`, a list of steps `slot:effect[@start][+frames][*amount][~ease]`:
  - `in:fade-up@12+15 loop:float out:fade@80+10`: an entrance, a loop and an exit. `@start` is the scene's own frame, as `useFrame()` counts it, trims included (`in` and `loop` default to 0, `out` to ending with the scene); `+frames` is how long (a loop's cycle), `*amount` how far or strong, `~ease` one of linear, in, out, in-out, expo, back or spring
  - entrances and exits: fade, fade-up/down/left/right, slide-up/down/left/right, pop, zoom-in, zoom-out, blur, drop, spin, wipe (which follows the ad's direction), wipe-up, wipe-down; loops: pulse, float, bounce, sway, shake, wiggle, glow, blink, spin. `EFFECTS` lists them with labels; `parseFx`, `formatFx` and `checkFx` read, write and check the string
  - before its entrance the element waits in its first pose (hidden, for the fades) and after its exit it stays gone
  - `<Stage>` applies them after every commit (a layout effect, and a MutationObserver for commits inside the ad), so the desk and a render draw the same frame. They write only `translate`, `scale`, `rotate`, `filter` and `mask-image`, composed with the ad's own (translate added, scale multiplied, filters appended; an ad's own mask wins). Each scene's frame is on a `display: contents` marker (`data-nykma-frame`, `data-nykma-length`)
  - `validate` warns about transitions that can't play and `data-fx` values that don't parse
- **Preview:** `/` on the dev server has a picker for ad and ratio, a scrubber, play, frame stepping, and the frame in the URL.
- **Render:** `bun run render <id>`:
  1. build with Vite, with `index.html` and `capture.html` as its two entries. Builds don't copy `public/`: `sirv` serves it in place, so a heavy `gen/blender/` doesn't slow any build
  2. Playwright opens a few pages in parallel (`--pages` sets how many), and each one `seek`s and screenshots its share of the frames
  3. ffmpeg mixes the sound and encodes H.264 at the exact length
- **Sound:** an ad exports a list of `{ src, at, volume, fade, trim }` cues built from its own timing. The preview plays the list, and the render mixes it to −14 LUFS with a −2.5 dB true-peak target, because AAC encoding overshoots. An audio-first ad's list is just the pipeline's `mix.wav` (§6.3).
- **Takes:** an ad declares a take with one registry line per take: `defineAd({ slug, take: "B", ... })`. Its ids become `<slug>-B-<ratio>`, and the component gets `take` next to `ratio`. A take can be another cut or another language.
- **Stills:** `bun run stills <id> --frames 0,90,240` (all ratios with `--ratio all`). `bun run sheet` makes a contact sheet.
- **Determinism:**
  - no CSS animations, timers, `Math.random()` or `Date.now()`
  - use a seeded `random(seed)`
  - integrate anything that accumulates up front

---

## 6. The parts bin (`src/parts/`, `py/`, `scripts/`)

Parts are there to save time, not to set a style. Each one is small and documented with a one-line comment. An ad can use a part as is, copy it into its folder and change it, or ignore it.

### 6.1 Picture parts

| Part      | What it is                                                           |
| --------- | -------------------------------------------------------------------- |
| `time`    | `interpolate`, easings, `prog(f, [a, b])`, closed-form `spring`      |
| `morph`   | `morph(from, to, k)`: one closed outline into another as an SVG path, with `rect`, `ellipse`, `star` |
| `camera`  | `camAt(f, keys)` (eased position, log-space zoom) and `<CameraView>` |
| `ratio`   | output sizes, and a `Layout` type for per-ratio framing              |
| `Cursor`  | a keyframed pointer with click ripples                               |
| `Typing`  | typed text with a caret                                              |
| `Rough`   | roughjs shapes, arrows and lassos drawn on over a span               |
| `Caption` | word-by-word kinetic line                                            |
| `EndCard` | logo, tagline and URL, passed in as props from the brand kit         |
| `hand`    | **handwriting that writes itself** (§6.2)                            |

Product UI (toolbars, chat panes, the app's canvas) is rebuilt per ad in nykma's own React, whatever the app itself is written in, either as the app really looks or enhanced and reimagined for the idea (§8), from the best reference available: its source, its live site, or screenshots. Real screenshots can also go in directly as images, and a screen recording can be unpacked to frames with ffmpeg and played with `<Plate>`. When two ads need the same UI, it moves to `brands/<brand>/ui/`.

### 6.2 Handwriting (`scripts/hand-trace.ts` + `src/parts/hand/`)

This is ported from the hero words in `tomcohendev-portfolio` (`scripts/hero-strokes.mjs` → `handStrokes.ts` → `HandwrittenWord.tsx`), so text is actually written stroke by stroke rather than faded or wiped in.

- **Trace:** `bun run hand <slug>` traces the texts listed in the ad's `hand.ts`. It's free and cached by text, font and size, and `--force` redoes them all. It:
  - renders each text in headless Chromium in the brand's hand font
  - thins the letters to centre lines (Zhang–Suen)
  - builds a graph of line ends and crossings, then trims spurs and joins straight-through lines
  - orders the strokes the way a pen would, in the text's direction (LTR or RTL, so Hebrew works)
  - smooths and simplifies, and extends the tips
  - writes Catmull-Rom curves with their lengths and sampled points

  The result goes to `src/ads/<slug>/hand.gen.json`.
- **Write:** `<HandText id write={[a, b]} />` reveals the real font only where the pen has been, using an SVG mask of the strokes with `stroke-dashoffset`. It uses one continuous pen with the portfolio's steady-pen easing.
  - `mode="ink"` makes the strokes themselves the ink (marker or chalk).
  - `pen` puts a stylus on the tip.
  - `erase` runs the pen backwards: `true` runs `write` backwards, and a span `[c, d]` writes first, then unwrites over that span.
  - `handCues()` returns pen-scratch sound cues that match the strokes.
- **Hand-drawn paths** (the portfolio's `HandwritingMVP.tsx` way) also work: single-line SVG paths listed in `hand.ts` and kept in `hand.gen.json`, for logos, arrows and doodles.
- **Fonts:** a name from `HAND_FONTS` (two OFL fonts ship with nykma), or `{ family, src }` for a file under `public/`. A brand's hand font is copied there first (§9).
- **Check:** `bun run hand:check <slug>` makes a sheet with the strokes numbered in writing order, so a wrong order shows up at a glance.

### 6.3 Audio and Blender (`py/`, ported from `mathbooklm-ad/mv`)

- **Audio:** `public/ads/<slug>/spec.json` lists:
  - a music prompt, your own track, or a script that makes the music
  - voice lines with `[emotion]` tags, or your own recording, timed by Whisper on this machine (free) or ElevenLabs' forced alignment (`"align": "eleven"`). A recording with no `text` is transcribed, and its words are what Whisper heard
  - sfx and markers

  `.venv/Scripts/python py/mv.py build <slug>` makes the ElevenLabs audio and a mix at −14 LUFS, with the music ducked under the voice. It also writes `gen/timeline.json` with beats, sections, energy and word timestamps. Items are cached, so only changed ones cost credits, `--estimate` shows the cost first, and `--test-line` makes one voice line to hear before the rest.
- **Length:** an ad timed by audio leaves `frames` out of its registry line and gets its length and fps from `gen/timeline.json`. Until that file exists the ad has no length, so its own commands stop and name the `mv.py build` to run. Other ads aren't affected.
- **Timing helpers** have the same names in TS (`src/parts/timeline.ts`) and Python (`py/blender/tl.py`): `said`, `marker`, `beatPhase`, `pulse`, `energy`, `section`. TS passes the timeline first, as in `said(tl, track, word)`, and Python calls them on it, as in `tl.said(track, word)`. They let you cue picture to words and beats instead of hard-coded seconds.
- **Blender:** a scene script uses `kit.py` (scene setup, world/fog, bloom, chalk and text materials, camera) and bakes motion one key per frame with `tl.bake`.
  - `mv.py blender <slug> --scene … --preview --frames 1,300` renders quick stills.
  - `--layer` renders PNG plates for a composition to show with `<Plate>`. The dev server doesn't watch `gen/`, because plates can run to gigabytes, so it reads `/ads/<slug>/gen/` from disk on each request. That way plates rendered while it runs show in the desk and in the preview without a restart. They're straight-alpha RGBA: `kit.compositor` puts the alpha back after bloom (the render's own, or the glow's brightness past an object's edge), so the page shows through and the glow still lands on it.
  - `--video` renders a standalone 3D cut.
  - `--ratio 1x1` or `9x16` renders that shape instead of 16x9.
- **Whisper** (`py/whisper.py`): `faster-whisper` on the CPU, `large-v3-turbo` or ivrit.ai's Hebrew fine-tune of it. Each model downloads once (about 1.6 GB). Given the script, the words that come back are the script's, laid on what Whisper heard, so `word:` cues and lines behave as they do with forced alignment. Its times lean early, so starts move 50 ms later: against ElevenLabs' own timing on 109 Hebrew words, 78-86% then started within 2 frames and 83-90% within 3. That's close enough for captions, but `"align": "eleven"` is closer for a cut that has to land on a word. A 30 s voice takes about 4 minutes on an Intel Mac. `mv.py words <audio>` writes `words.json` beside any recording, such as a clip's `audio.wav`. Transcripts with no script need reading before they become captions: Whisper writes numbers as digits and mishears the odd word.
- **Synthesized sound:** plain Node scripts (`scripts/audio/*.mjs`) write WAVs with no dependencies and nothing to license.

### 6.4 Hebrew and RTL

An ad sets `lang: "he"` in the registry, and the rest follows from that:

- **Copy:** written in Hebrew from the start, with the idea and the jokes working in Hebrew. It's never an English ad translated afterwards.
- **Layout:** `<Stage>` sets `dir="rtl"` and the language, and every part follows it. `Caption` reveals words from the right, `Typing` moves its caret left, and `EndCard` mirrors. English names, numbers and prices inside Hebrew lines are isolated, so `₪49` or a product name doesn't jump to the wrong end of the line.
- **Motion:** anything that implies reading order, such as wipes, progress bars, timelines and arrows, runs right to left unless the idea calls for something else.
- **Product UI:** keeps the app's own direction, whether it's shown as it is or reimagined. A Hebrew app is RTL, and an English app stays LTR with Hebrew captions around it.
- **Fonts:** many brand fonts have no Hebrew letters, so `brand.md` names a Hebrew font and a Hebrew hand font next to the Latin ones. The files live in the kit's `assets/`, and an ad copies the ones it uses into `public/ads/<slug>/` (§9).
- **Handwriting:** §6.2 writes Hebrew right to left, in the Hebrew hand font.
- **Voice:** uses a current ElevenLabs model with the language code set to `he`, because older models have produced unintelligible Hebrew. `mv.py` refuses a Hebrew voice on anything but the `eleven_v4` and `eleven_v3` model families before it spends credits, because the API silently ignores the language code on other models. The agent generates one test line (`--test-line`) before making the rest. `said()` ignores niqqud when it matches a word.
- **Music:** Hebrew sung lyrics aren't confirmed to work in ElevenLabs. Test them before promising them in a pitch, or use an instrumental or your own track.

### 6.5 Real footage (`scripts/footage.ts`, `<Footage>`)

Video you shot goes into an ad as itself, cut and timed by the ad like everything else.

- **Unpacking:** `bun run footage <slug> <clip>` copies the clip to `public/ads/<slug>/footage/` and unpacks it to `public/ads/<slug>/gen/footage/<name>/`:
  - `00001.jpg` on, one per frame of the clip
  - `audio.wav`, if the clip has sound
  - `sheet.jpg`, a contact sheet of up to 36 frames, so the agent (which can't play video) sees what happens and when
  - `meta.json`, with the rate, the length and the size
- **What the unpacking does:**
  - Frames keep the clip's own rate, up to 120 fps, so slow motion is real frames rather than repeats.
  - Frames are scaled down to 1920 px on the short side, enough for any shape's crop.
  - HDR (PQ or HLG, the default on recent iPhones) is tone-mapped to SDR, or it comes out grey.
  - The original is never changed. Originals and frames are gitignored because they're big, so `bun run footage <slug>` with no clip unpacks the originals again after a clone.
  - `--fps` resamples to another rate, and `--force` unpacks them all again.
- **Showing it:** `<Footage src fps frames />` from the engine shows the frame of the clip that falls on the ad's frame, so it's exact like a `<Plate>`.
  - `from` trims the start, in seconds.
  - `speed` slows it down or speeds it up.
  - `at={(f) => seconds}` does ramps and freezes.
  - `focus` and `zoom` frame it for each shape.
  - Its sound is a cue like any other.
- **The brand's own videos:** `bun run footage <slug> <url> --own` downloads one with yt-dlp (up to 4K, video and sound merged to MP4), then unpacks it like any clip. It refuses without `--own`, because someone else's video can't go in an ad. Its URL, title, channel and date go in `public/ads/<slug>/sources.json`, which is committed while `footage/` isn't, so it records whose video it was, and `bun run footage <slug>` downloads it again after a clone.
- **Speech in a clip:** `mv.py words <clip's audio.wav> [--lang he] [--text "..."]` gives its word times (§6.3). In an ad timed by audio, list the clip's sound as a voice with no `text` and `"mix": false`, and its words land in the timeline.
- **Dropped on the timeline:** a clip dropped on a project's timeline is uploaded, unpacked and placed as a scene (§10.4).
- **Not generated:** this is footage someone shot. Generated clips (§6.6) use the same unpacking and `<Footage>`, but they're a separate source with their own rules.

### 6.6 Generated media (`scripts/gen.ts`, `scripts/lib/gen.ts`, `gen-run.ts`)

Generated stills and clips are **an addition to the flow, not a replacement**: one more source, like Blender or real footage, for what code can't make well: a person, a place, and the idea's own world (a surreal setting, a metaphor's place). Take "a trendy ad of someone looking at their phone with an O mouth, then the app". The person and the reaction are generated. The app is the UI, built in code (real or reimagined). If the phone's screen shows in the clip, it's turned away, blurred, or replaced in code, so the model never draws the app.

- **Free stock first:** a shot is generated only when free stock (§6.8) has nothing that fits, or only something that would look generic next to the idea, and the pitch says so ("no fit → generate", "generic → generate").
- **What may be generated:** a real-looking person and their reaction, a place, a physical thing, a texture. Each shot's `why` says what it shows that code can't.
- **What never is:** product UI, the logo, brand text or fonts, prices, claims, a real or named person, a testimonial or a result. A generated person may be shown using the product (the UI on their screen, put there in code), and `post.md` says they're AI-generated.
- **The spec:** `public/ads/<slug>/gen.json` lists the shots. Each has an `id`, a `kind` (`image` or `video`), an OpenRouter `model` id, a `prompt` and a `why`, plus settings. A still with `"via": "codex"` goes through Codex instead and needs no `model` (below). A video with `"via": "local"` is made on this PC, with `"model": "ltx-2.5-q4"` (§6.9). Video takes `seconds`, `resolution`, `aspect_ratio`, `first`, `last`, `refs`, `audio` (off by default, since the ad's sound is made the usual way) and `seed`. A `first`, `last` or ref of `generated/<id>.png` finds that shot's file whatever format the model chose (Nano Banana answers in JPEG). Images take `aspect_ratio`, `resolution`, `quality`, `background`, `output_format`, `refs` and `seed`.
- **Prices:** `bun run gen <slug> --estimate` is free and needs no key. It reads OpenRouter's public catalogue (cached for six hours in `out/gen-catalog/`), checks each shot against what the model takes (lengths, ratios, frames), and prices it from the model's own price list. Models priced by the token use per-image token counts from the vendors' published prices, or a ceiling, marked as one. The pitch lists each shot, its price and the total.
- **Stills first, then video.** Every video needs a `first` frame, normally a still made earlier in the same gen.json (`--estimate` reports a video without one as a problem). Nothing is paid for on a frame you haven't seen:
  1. **Stills.** The project's **Generated media** panel shows them with their prices. **Approve $x for stills** raises the ad's budget by what the OpenRouter stills still need plus 5%, because real costs come back a little off the estimate (a still estimated at $0.05 cost $0.0504). Codex stills need no money. The agent's `bun run gen <slug>` then makes the stills, and stops with exit code 2 at the first video.
  2. **You look at each still** in the panel. **Approve** it, or **Retake** it with a note. The note goes to the agent's chat, and the agent rewrites the prompt and runs `bun run gen` again. An approval holds the still's file hash, so a retake has to be approved again.
  3. **Videos.** Once every still a video starts from (its `first`, `last` and generated `refs`) is approved, **Make videos** says what they'll cost, approves that plus 5%, and the desk makes them all at once. `bun run gen` never starts a video: `/api/gen/run` answers 409. Run it again afterwards and it prints the made videos' `<Footage>` lines.
  **Take back** returns what's unspent. Approvals of money and of stills (`gen-budgets.json`, `gen-frames.json`) and the ledger live in the key store's folder, outside the repo (§10.10), so an agent can't approve its own spending or its own frames.
- **Making:** the desk makes each call itself, with the OpenRouter key or through Codex. It refuses, spending nothing, if a shot has a problem, has no price, or doesn't fit what's left of the approval. `bun run gen` then exits 2 and the agent stops and asks. A job is written to the ledger at its estimate when sent and at its real cost (`usage.cost`) when done, so a desk that dies mid-job still counts it. Before **Make videos** changes the approval, it checks that every video can be made and that the amount covers them.
- **Codex stills** (`scripts/lib/codex.ts`, Settings → Generated stills): OpenAI's image model on your ChatGPT login, run the way T3 Code and the Codex app run it, through `codex app-server` (JSON-RPC over stdio). There's no key: Codex uses its own login in `~/.codex`. A still costs no money and counts against the plan's image limit, and when that runs out the job fails with the time it resets. Each still is one ephemeral, read-only thread in an empty temp folder. Codex is asked to use its image tool once, any approval it asks for is declined, and the `imageGeneration` item it returns gives the file. References and frames go in as local images. Codex draws a few fixed sizes (1024×1536, for example), so a still is cropped from the centre to its `aspect_ratio` as a PNG, and the record says from what size. It ignores `model`, `resolution`, `quality` and `seed`, takes no SVG, and records Codex's rewritten prompt. The binary is the one in Settings, else `codex` on the PATH, else the Codex desktop app's own copy. Agents may not run `codex` or read `~/.codex`.
- **Caching:** each made shot is kept under a hash of its request (model, prompt, settings and the input images' hashes), as `mv.py` does. The same request is never paid for twice. Any change is a new request, so retakes cost again, and the agent allows one per shot within the pitch.
- **Files:** a made shot is `public/ads/<slug>/generated/<id>.<ext>`, committed. They were paid for and can't be made the same again, since most models don't promise a seed. `generated/generated.json` records each one's model, prompt, settings, why, cost, estimate, job id, date, file hash, terms and `via` (`openrouter`, `codex` or `local`). A video is also unpacked like real footage (§6.5), and `bun run gen` prints its `<Footage>` line and contact sheet. After a clone, `bun run footage <slug>` unpacks it again.
- **Disclosure:** `post.md` says what's AI-generated, and the README lists each shot with its model and cost. This covers platforms' AI labels and the EU AI Act's transparency duty.
- **Not checked yet:** OpenRouter documents frame images as web URLs, and nykma sends them as base64 data URLs, which its image API accepts. Whether video takes them too is unverified until the first real call. A stand-in server tested everything else, end to end.

### 6.7 The ad on a screen in the shot (`py/screen.py`, `<ScreenInsert>`)

"Someone looking at a computer, and the ad showing on its screen" is a clip with a screen in it, plus the ad's own scene put on that screen in every frame, like a mockup or a green screen. The clip is generated (§6.6) or shot by the user. The screen's picture is built in code as always, so it can be the real UI.

- **The clip** has a flat chroma-key green screen. In a generated clip, the prompt asks for "a flat, evenly lit chroma-key green screen filling the display edge to edge, no text, no interface, no reflections", with a locked-off or slow camera and the corners in frame. A phone in a hand works the same way.
- **`bun run screen <slug> <clip>`** runs `py/screen.py` (OpenCV) on a clip unpacked by `footage` or `gen`:
  - **The screen:** each frame's green region is found by how much greener than red and blue each pixel is. Its outline is simplified, and the four longest sides are the screen's edges, refitted as lines. Neighbouring lines meet at the corners, so a corner hidden behind a hand is still where its edges meet.
  - **Misses:** a frame where the screen is missing or jumps takes its corners from its neighbours, and the report counts those frames. A one-frame average takes out sub-pixel jitter.
  - **Writes:**
    - `src/ads/<slug>/<clip>.screen.json`: the corners per clip frame. It's small and committed, so the ad imports it.
    - `gen/footage/<clip>/front/`: the box the screen moves in (`box` in the track), cut from each plate frame as a WebP with a see-through hole where the screen shows. Anything in front of the screen, a hand or a head, isn't in the hole.
    - `gen/footage/<clip>/plate/`: the frames as JPEGs, with the screen's green light taken out of what it lands on: green is held to the larger of red and blue in full to half the screen's diagonal away, fading out by one and a half, and to red and blue's average where green visibly outshines both (lit skin capped at red still reads lime), feathered, so a yellow note on the desk keeps its yellow.
    - `screen-sheet.jpg`: frames with the found outline drawn on, to check by eye.
  - **A screen that isn't green:** `--corners "x,y x,y x,y x,y"` gives its first-frame corners, and optical flow follows them. Nothing in front of it is cut out then.
- **`<ScreenInsert track size>`** from the engine plays the clip frame-exact, as `<Footage>` does, with the same `from`, `speed`, `at`, `focus` and `zoom`:
  - Its children are laid out at the screen's `size` (1920×1080 for a monitor, 1170×2532 for a phone).
  - Each frame they're warped onto that frame's corners with a CSS `matrix3d` (`quadMatrix`, a square-to-quad homography), over that frame's plate, and the front goes over them.
  - The picture reaches 2 clip pixels past the found edge (`bleed`), and the front covers the rest, so no green rim shows. `screenStyle` takes a filter to sit it in the shot.
  - Inside it, `useVideo()` reports the screen's size and nearest shape, so an existing scene lays out for the screen unchanged. `video={{ slug: "other-ad" }}` lends a borrowed scene its own ad's slug, since handwriting and files are looked up by slug.
  - A 16:9 clip can't fill a 9:16 frame and still show the screen, so a 9:16 version needs its own upright clip, as a second shot.
  - It's all `<img>`s, no CSS mask: while the preview plays, an `<img>` keeps its last frame up until the next has loaded, where a mask that hasn't loaded hides the layer, and the screen flashed (dark in 84 of 136 painted frames on the board). The front is only the screen's box because a 1080p WebP with alpha takes ~43 ms to decode, too slow for 30 fps; a JPEG plate and a 670×464 front play every clip frame at 60 fps with no stalls. It fetches the next 12 frames ahead while it plays, which only warms the browser's cache.
- **Checked:**
  - On a made-up clip where the true corners are known (`py/test_screen.py`), the corners are within 1.2 px, and within 0.4 px while a hand covers one.
  - A 1080p clip with a head in front of the screen went through `footage` → `screen` → `<ScreenInsert>` → render in every ratio. The scene sat on the screen, frame-matched, with the head in front and no green edge.
  - A real generated clip (screen-demo, Veo 3.1 Fast): found in all 144 frames, none filled in, never more than 1 px between frames while the camera drifted 16-29 px.
- **After a clone:** `bun run footage <slug>` unpacks the clip again, then `bun run screen <slug> <clip>` remakes the plates and fronts.
- **`screen-demo`**: a generated over-the-shoulder clip of a student at a PC (`public/ads/screen-demo/gen.json`: a Nano Banana still, then 6 s of Veo 3.1 Fast from it, about $0.65), with bake-nykma's "Then there's 14" and "Solve" scenes on the monitor, in 1:1 and 16:9. Its queue folder has the pitch. It finds its track with `import.meta.glob`, so it shows a "waiting for its clip" card instead of breaking until the clip is made. It was rehearsed end to end on a stand-in API and a synthetic clip, then made for real on 2026-11-05 for $0.65.

### 6.8 Free stock (`scripts/stock.ts`, `scripts/lib/stock.ts`, `stock-run.ts`)

A generated clip costs about $2, and a stock clip nothing. So for any shot that code can't make, the agent looks in free stock first. The order is free stock, then code, Blender or the user's footage (as before), then generated (§6.6). The pitch gives each such shot a line: "stock: found pexels:12345", "no fit → generate", or "fits, but generic → generate" when stock has the subject but not the idea's look.

- **Sources:** Pexels (photos and videos) and Pixabay (images and videos), through their APIs. Both are free, with a key each, pasted once under Connections (§10.10). Either one alone is enough: a source with no key is skipped quietly when the other has one. Pexels paused new API keys in November 2026, so Pixabay is the one to connect first. The desk makes the calls, so the keys never reach an agent. `bun run stock` asks the desk with the desk token, as `bun run gen` does, so the desk must be running.
- **Search:** `bun run stock <slug> "query" [--video|--photo] [--ratio 1x1|16x9|9x16] [--min-seconds N] [--source pexels|pixabay] [--page N]` searches both sources, for photos and clips unless one is named, up to 8 results each:
  - `--ratio` asks for landscape or portrait. For 1:1 nothing is filtered, since any shape crops to a square. Clips must be Full HD or larger.
  - `--min-seconds` drops shorter clips.
  - Pixabay results are SafeSearch.
- **What it writes:** small previews and `sheet.jpg` go to `out/stock/<slug>/<query>/` (gitignored). The sheet has a numbered tile per result, made by `py/stock_sheet.py` (OpenCV). A clip's tile is four frames of its smallest file, at 1/8, 3/8, 5/8 and 7/8 of its length, taken by ffmpeg, since the agent can't play video. The command prints the numbered list: id (`pexels:12345`), type, length, size, author, page and the alt text or tags. `results.json` keeps the list, so a take knows a clip from a photo with the same number.
- **Take:** `bun run stock <slug> --take pexels:12345 [--name <clip>] [--ratio 1x1,9x16|all]` makes the desk download one file into `public/ads/<slug>/stock/`:
  - For a clip, that's the smallest file that still covers every ratio asked for after the crop: 1080p for 1:1, but 4K for a landscape clip in 9:16. If none does, it takes the largest and warns.
  - For a photo, it's the largest file there is. Without full API access, a Pixabay photo is 1280 px on its long side, and the list marks a result smaller than the shape.
  - A clip is unpacked like real footage (§6.5), and the command prints its `<Footage>` line and contact sheet. A photo prints its `asset()` path.
  - It also prints the credit line for `post.md` and the README.
- **The record:** `public/ads/<slug>/sources.json` gets an entry under `stock/<file>` with:
  - the source, id, type and author, with their URLs
  - the licence's name and URL
  - which of the source's files it is, its size, length, the query, the date and the file's hash

  The brand's own videos (§6.5) keep their entries by bare file name, in the same format as before.
- **Files and clones:** `stock/` is gitignored, like `footage/`:
  - Clips are big.
  - Pexels' licence forbids redistributing its files.
  - Every file can be fetched again by its id.

  `sources.json` is committed. After a clone, `bun run stock <slug>` downloads what's missing through the desk, picking the same file, and unpacks the clips. If a file's hash has changed it says so, so the agent looks at it again. `bun run footage <slug>` also re-unpacks stock clips that are in `stock/`.
- **The APIs' terms:**
  - **Caching:** every API answer is kept for 24 hours in `out/stock/.cache/` (with no key in it), because Pixabay asks for that. This also spares the rate limits: Pexels allows 200 requests an hour and 20,000 a month, and Pixabay 100 a minute. Taking a result from a search in the last 24 hours makes no request at all.
  - **No hotlinking:** files are downloaded once and served from `public/`, never hotlinked.
  - **Showing the source:** the search output names Pexels and Pixabay with links wherever results are shown.
  - **Rate limits:** a 429 stops with a plain message, and one source failing leaves the other's results.
  - **Testing:** `NYKMA_PEXELS_URL` and `NYKMA_PIXABAY_URL` point the calls at a stand-in server.
- **The licences' rules,** which the agent prompts repeat:
  - Both licences allow commercial use and changes, with no attribution required. nykma credits each file anyway, in `post.md` and the README.
  - Pexels forbids implying endorsement by the people in a picture, and Pixabay forbids commercial use of content with recognisable trademarks, logos or brands. So a stock person is never shown as a customer, user, testimonial or endorser, nothing with a visible third-party logo or brand is used, and product UI never comes from stock.
- **Checked** against a stand-in Pexels and Pixabay with a synthetic photo and synthetic clips:
  - keys saved, tested and removed in the store
  - refused without a key and without the token
  - a search over both sources and both types, with its sheet
  - a filtered search
  - takes from the cache with no request, and a by-id lookup
  - a photo and a clip with the same id told apart
  - the best file picked for 1:1 and 9:16, with the warnings
  - `sources.json` keeping a `--own` entry
  - a fresh clone downloaded again, including a changed file
  - one source failing while the other answered
  - no key anywhere in `out/` or the ad's folder

  **Not checked until real keys exist:** the real response shapes (`/v1/videos/videos/:id`, Pexels' `video_files`, Pixabay's `fullHDURL`) and the real rate-limit headers.

### 6.9 Video on this PC (`scripts/lib/local.ts`, `scripts/local-setup.ts`)

A generated clip through OpenRouter costs about $0.50 to $2. On a Windows PC with an NVIDIA GPU, a clip can be made locally instead: no money, about 3½ minutes of the GPU per clip. Settings → Generated video picks the route for new ads, and the brief tells the agent to write `"via": "local"` and `"model": "ltx-2.5-q4"` on each video shot. Everything else in §6.6 holds: the shot starts from an approved still, it's made from the desk's **Make videos**, kept under its request hash, unpacked like footage and recorded in `generated.json`, here with `via: "local"`, a cost of 0, the seed and the model's licence.

- **The model:** LTX-2.5 distilled (Lightricks, August 2026), 22B, in ComfyUI's own image-to-video template. There are two builds of it. `ltx-2.5-q4` is Unsloth's 14 GB GGUF (`UD-Q4_K_XL`, same licence), loaded through the ComfyUI-GGUF add-on in place of the template's own loader, and it's the one the brief names. `ltx-2.5` is Lightricks' 21.5 GB int8 file, which doesn't fit 16 GB. It was picked from the November 2026 research in `reports/Local video models on 16GB.md`. It's the open model closest to Veo 3.1 Fast on Artificial Analysis's board that also fits a 16 GB card, and the only one there with a licence that's clean for ads. It's still below Veo on faces and hands. Wan 2.2 is the next to try.
- **Licence:** the LTX-2.x Community License. It's free below US$10M a year in revenue, and it bans impersonating people without consent, deceptive content, and commercially using its outputs to train other models. Accepting it on Hugging Face is the user's step, once.
- **Runtime:** ComfyUI portable (v0.44.0) in `~/nykma-local/` (`NYKMA_LOCAL` moves it), outside the repo. It brings its own Python 3.13, PyTorch 2.14 and CUDA 13, so the `.venv` isn't touched. The template uses only ComfyUI's built-in nodes. The one add-on, ComfyUI-GGUF, is for `ltx-2.5-q4`, pinned to a commit in `local.ts`. The desk starts it when a clip needs it, on 127.0.0.1 only and with `--offline` (no paid partner nodes, and the page doesn't reach the internet). It keeps running after the desk stops. Settings has **Start** and **Stop**, and Stop frees the GPU.
- **The workflow:** `scripts/lib/comfy/ltx-2.5-i2v.json`, the template exported to API format by loading it in ComfyUI's own page with Playwright. Per shot, `fillWorkflow` sets only these:
  - the prompt (ComfyUI's prompt enhancer is off, so the clip is made from the prompt as written);
  - the first frame, uploaded to ComfyUI;
  - `seconds` at 24 fps;
  - `aspect_ratio` and `resolution`, as ComfyUI's resolution picker's ratio and megapixels;
  - the seed. It's the shot's own, or one taken from the request hash, so the same request makes the same clip.

  Each node it fills is checked by id and type, so a re-exported template fails loudly instead of filling the wrong node. The template samples at half size and doubles with LTX's latent upscaler. It makes sound too, which is dropped unless the shot says `audio: true`. It takes 2 to 10 s, 1:1, 16:9 or 9:16, and 480p, 720p or 1080p, from a first frame only, with no `last` or `refs`.
- **One at a time:** the desk queues local clips, since the GPU fits one. The panel shows how long the current clip has taken.
- **Setup:** `bun run local:setup` downloads and unpacks ComfyUI (7-Zip), then the model files straight into its `models/` folders with the `.venv`'s `hf` CLI. It clones the add-ons a model needs, then the files. That's about 61 GB in all: the GGUF transformer (14 GB), the int8 transformer (21.5 GB), the Gemma 4 12B text encoder (15.4 GB), the Gemma E2B prompt enhancer (5.2 GB), the video and audio VAEs and the upscaler. Run again, it skips what's there and resumes the rest. Without a Hugging Face login that accepted the licence, it says what to do.
- **This machine:** an RTX 4070 Ti SUPER (16 GB) with 31 GB of RAM. Measured on 6 s at 720p (1280×704) from screen-demo's `pc` still, seed 1, on 2026-11-06:
  - `ltx-2.5`: 29 min 41 s. Its 20 GB doesn't fit the card, so ComfyUI streams it from RAM and the page file, 166 s a sampling step with the GPU mostly idle.
  - `ltx-2.5-q4`: 3 min 22 s, about 4 s a step, peaking at 15.9 GB of VRAM. Its clip is nearly the same as the full model's (SSIM 0.975).

  Both look close to Veo 3.1 Fast's clip from the same still: a little softer, with less detail in the hands.

### 6.10 3D in the page (`src/parts/Three.tsx`, three.js)

Three ways to depth, and `.claude/guides/3d.md` says which when: CSS 3D for the product's UI in space (it stays real DOM, crisp, and readable by `validate`), three.js for real 3D objects and spaces in the page, and Blender for photoreal (§6.3).

- `<Three setup draw>` is a three.js scene that's a function of the frame. `setup` builds it once and returns the objects. `draw(frame, objects, kit)` sets everything that moves, and then the part renders, in the same layout effect that commits the frame, so the seek's paint shows it. There's no clock, animation loop or time-stepped physics, and scattering uses `random(seed)`.
- `texture(src)` and `model(src)` (glTF/GLB) load from `public/` and hold the capture until they're in. That's `holdFrame` in `src/engine/ready.ts`: `seek` waits for fonts, the stage's images, everything held, and then a paint.
- The renderer has a pixel ratio of 1, antialiasing (`antialias={false}` turns it off, for hard pixels when a small canvas is scaled up with `imageRendering: "pixelated"`, as `one-tile` does at 640×360), sRGB output and `preserveDrawingBuffer`. The canvas is the video's size by default, so each ratio moves its camera rather than shrinking the scene. Text a viewer reads stays DOM on top, because words drawn in WebGL are invisible to Layout, Truth and the Hebrew checks.
- It's imported on its own (`../../parts/Three`), so ads without 3D don't load three.js.
- **Tested** with `three-demo` (64 seeded cubes settling into a cube under a DOM headline, 1:1 and 9:16): headless Chromium renders WebGL here, and `validate` passes, including the re-render of random frames on fresh pages. Post-processing through `EffectComposer` isn't wired in yet.

### 6.11 Talking heads (`scripts/take.ts`, `py/take.py`, `src/parts/take.tsx`)

Someone talking to camera, from one take of the whole script, retakes and all. Cutting a take by hand took two or three rounds of notes per video, almost all about the same things: the retakes, the face in the circle, the captions. This makes the cut data, checked, and editable on the desk. The agent's route is `.claude/guides/talking-head.md` and the three guides it points to (script, cut, look).

- **The command.** `bun run take <slug> <take> [--mic <file>] [--script <file>]` copies and unpacks the take like `bun run footage` (§6.5), then cuts it. `bun run take <slug>` cuts again from `cut.json` in seconds (what Whisper heard is cached beside the frames, keyed on the recording, the model and the hint), and `--verify` hears the cut again.
- **The script** is the queue folder's `script.md` (a table with an `id` and a `Line` column, `queue/_template/script.md`), else the pitch's voice lines, else `--script`. With none, the take's own sentences become the lines.
- **The voice.** A separate mic is lined up with the camera's sound by cross-correlating their loudness envelopes, refined to the sample, and checked for drift between the take's first and last thirds. Then high-pass at 80 Hz, `afftdn` only when the room tone is above -60 dBFS (and at 10 dB of reduction, since full-strength denoise sounds gated), a de-esser and 3:1 compression, to `voice.wav`. `"clean": "off"` skips it.
- **Hearing it.** Silero VAD (in faster-whisper) splits the take at pauses of 260 ms or more, and Whisper (ivrit.ai's model for Hebrew, §6.3) hears each piece alone, because heard whole it merges a line said three times into one. The brand's spellings are its hint.
- **Choosing the try.** Every stretch that starts like a line (its first two words, fuzzily: a Hebrew one-letter prefix, a near-spelling with the same three-letter stem) and ends like it or where the speaker stopped is scored: how much of the line it covers and how little else it says. Overlapping stretches are one try. Each line gets its last complete try (covering 75% of it, starting and ending like it), in script order, by dynamic programming over the lines, so a try never overlaps the line before. A line no try finished gets its best partial one, flagged; a line not said at all is listed. `pick` in `cut.json` overrides it. With no script, an utterance whose opening (after a count-in) comes again within 60 s is an earlier try, along with everything up to the new start; the rest, grouped into sentences, become the lines, anchored to where they were said.
- **Inside the try.** A run of words said again straight after (a restart with no pause, a stutter) loses its first saying, unless the line itself repeats it. Non-words (um, uh, אה, אממ) go; habit words never. A pause over 0.5 s (`pause`) becomes a jump cut.
- **Cut points.** 0.10 s before the first word, extended back over a voiced onset up to 0.12 s; 0.16 s after the last word, run on over a voiced tail up to 0.30 s; never within 30 ms of a word that isn't kept; snapped to the ad's frames. Voiced means louder than the room tone + 9 dB, or the voice's level - 45 dB when an export gated the pauses to digital silence. The voice plays each part as a cue with a 10 ms fade at each edge.
- **The face.** OpenCV's YuNet (MIT, 230 KB, downloaded once to `~/.cache/nykma/` and checked against its hash; OpenCV 5 dropped the Haar cascades) finds the face in up to 10 frames of each scene, and the median is the scene's face. Across each jump cut it measures how far the head moved, so `cutZoom` hides only the jumps that show.
- **Files.** `src/ads/<slug>/cut.json` holds the decisions: `lines` (`id`, `line`, and per line `pick`, `hl`, `fix`, `trim`, `pause`, `at`), `fix`, `clip`, `lang`, `mic`, `clean`, `pause`. `src/ads/<slug>/take.json` is the cut, which the ad imports: per scene its parts (`in`, `out`, `at`, `frames`, `jump`), words (`t`, `at`, `end`, `hl`, in scene frames), face and tries, plus what was left out and why. Never edited by hand. `queue/<folder>/cut.md` is the table for people: each scene, where it's from, the try, the words; what was left out and why; the sound; what to check. `brands/<brand>/spelling.json` maps what Whisper hears to how the captions write it, for every take of the brand.
- **Verify.** `--verify` concatenates the parts as the ad plays them, has Whisper hear that, and diffs it word by word with the words kept: a word missing may be clipped, a word extra is a stray syllable or a retake left in. Words a second or longer are flagged on every run.
- **The parts.** `useTakeData(json)` types it and adds `scene(id)` and `start`. `voiceCues(take, scene)`, `takeTime`, `saidAt(scene, word)`. `<TakeCam take scene w h place face zoom>` frames the face (its centre at `place`, its height `face` of the box) without ever showing past the clip's edge, and marks the face's box (`data-take-cam`, `data-face`) for validate. `cutZoom(scene, f)` alternates 1 and 1.1 at the jump cuts where the head moved; `punch(f, beats)` is a push-in on a beat. `<SpokenCaptions words style>` sets the words 3 to a page (at most 22 characters, a new page after punctuation and at a pause of 5 frames), word by word, highlights in the accent colour, Hebrew right to left with English kept in order.
- **Checks.** `validate` (§7.3) reads every `<TakeCam>` on the sampled frames: it fails a forehead or chin outside the camera's clipping box (a circle when its radius says so) held for 0.75 s, and warns on a face more than 12% off centre, more than 10% low, too close (over 66% of a small camera's height, 42% of a large one's, saying when the take's own framing is why) or too small, and on text across the face. The full check fails a `cut.json` newer than `take.json` and warns when `cut.md` has no Verify section, or one that lists differences.
- **Tested** on two Hebrew tutorial takes against the cuts the user had approved by hand. With its script, the first (1:43 of take) got the same try for every line (the hook's and the intro's third of three), its slip left out, and cut points within about 0.1 s of the hand cut. With no script, the second (the speaker improvised, about 5:30 of take) came out as the same 20 stretches, every earlier try and the count-in left out with the reason. Verify on the first found 98% of the words again and flagged the one misspelled one. A test ad of the parts (since removed) rendered at -14.3 LUFS, and validate passed it, then caught a chin pushed out of the circle and a caption moved over the face.

---

## 7. How an ad gets made

```
you: "make an ad about X for <brand>"
 ─▶ read the brief, the kit and the brand's history
 ─▶ three explorers, three routes, six ideas ─▶ pick one
 ─▶ pitch: idea + rough storyboard + the wild one + other routes + free animatic ─▶ stops   (cheap)
you: "go" / "change the opening" / "try another idea"
 ─▶ build ─▶ look at stills ─▶ render ─▶ first look ─▶ stops   (no checks yet)
you: "change the ending" ─▶ the agent fixes ─▶ re-render ─▶ first look again
you: "check it" ─▶ reviewer ─▶ adjust ─▶ re-render ─▶ validate (free) ─▶ queue/<date>-<brand>-<slug>/
you: "skip the checks" ─▶ queue/<date>-<brand>-<slug>/, marked unchecked
you: "drop it" ─▶ stops, nothing more is spent
```

### 7.1 Pitch first (`queue/<date>-<brand>-<slug>/pitch.md`)

**Before the pitch, the idea is looked for in different places.** Language models given the same brief tend to land on the same likely idea, and asking one context for "something original" changes little. Sampling several independent ideas and choosing afterwards does. So:

- **History, not old ads.** `bun run history <brand>` (free) lists the mechanism of each of the brand's past ads, cut short, and the user's standing notes for the brand (`brands/<brand>/notes.md`). The agent doesn't open old ads or pitches while it looks for the idea, because they pull a new one toward them. The parts bin is for the build.
- **Three explorers.** ad-agent starts three `concept-explorer` agents at once (`.claude/agents/concept-explorer.md`, read-only, no files). Each gets the same self-contained brief (the audience and moment, the one message, the proof, the limits, the history to avoid) and a different route: the product as spectacle, a human moment, form, metaphor, anti-ad, or a wild-card constraint, with at least one a kind of idea the brand's history hasn't used lately. None sees another's ideas. Each returns two ideas, the second the bolder, with their mechanism, opening, look (real UI, reimagined, 3D, illustrated, live action), where the product is, what they'd be made with, and their risk.
- **Choosing.** ad-agent lays the six side by side by mechanism, drops near-duplicates and anything close to the history, and picks on: a message the picture carries, a reason to watch from frame 0, the brand inside the idea, truth to `brand.md`, distance from the category and the history, and a build within budget. When two are close, the bolder wins. The boldest idea not picked goes in the pitch in full as "The wild one", and the other runners-up as "Other routes", so "another idea" is cheap.
- It skips the explorers when the brief fixes the idea, for a retake, or for a brief as small as one still, and says so.

The agent writes:

- **The idea in two lines**: the angle, the tension or joke, and the style. A `mechanism:` line above it names what makes the ad work, for the next `history`.
- **The brief, as it read it**: who's watching and when, the one thing they take away, the proof, what they do next, and anything it chose where the brief was open, so you can say no before the build.
- **A rough storyboard**: a markdown table of time, what happens, on-screen text and voice. Each row may point at an image: a product screenshot, a quick SVG sketch, or a still from an existing ad. `animatic` reads the table by these headers, and `queue/_template/pitch.md` has the rest of the file:

  | Time | What happens | On-screen text | Voice | Image |
  |---|---|---|---|---|
  | 0:00-0:03 | what we see | the words on screen | the words spoken | img/sketch.svg |

  Time is start-end, as `0:03-0:06` or `3-6`. An empty cell is fine, and a row with no image is a plain card. A `bpm: 120` line above the table adds the click, and a `brand: <brand>` line sets the font.
- **How it works**: the first two seconds, the one image a viewer would remember, how a viewer who leaves early still knows whose ad it was, the product on screen and where its UI comes from, the product's look (the real UI, or how it's enhanced or reimagined), the sound (whether it's part of the idea, and how the ad reads with the sound off), what it's made with, and the one way it could fail to land.
- **The wild one**: the boldest idea not picked, in full, so you can choose it instead.
- **Other routes**: the explorers' other ideas, one line each.
- **What the build will take**: the shots that need Blender, ElevenLabs credits (from `mv.py build --estimate`), and anything you need to provide.

Then `bun run animatic <slug> --ratio <the brief's first layout>` turns the table into a slideshow MP4 for free (no tokens, a few seconds), in that shape (16:9 when none is given):

- each row's image is shown for its time, with a slow push-in; a row without one shows what happens, as text, in the space above its caption
- the on-screen text is set as captions, in the brand font. The captions take at most 38% of the frame, their text shrinking to fit, and the description shrinks to fit the space left, so neither covers the other. A long cell is split at its sentences, one per line, and each line and each quoted piece keeps its own direction, so Hebrew quoted in an English label (or the other way round) reads whole
- the voice lines are read by the OS speech synthesizer (Windows `System.Speech`, macOS `say`), so the lengths are real. If no Hebrew voice is installed, Hebrew lines are timed from their word count and the animatic says so
- there's a click on every beat when a BPM is given

It also warns when a voice line is longer than its row. That's all the animatic is: a rough cut to judge the idea and the timing, not a template.

**The claims check** runs before you see the pitch. Where the pitch shows the product doing something, the agent first looks at how it really does it (`brand.md`, the kit's screenshots, and the app's own code, from the kit's `sources.txt`), and stages and draws it however the idea wants on top. Then `bun run claims <slug>` reads the pitch against `brand.md` (`.claude/agents/claims-checker.md`, Sonnet, `--safe-mode`, text only, about $0.10 and 45 s) and writes `claims.md`: every claim and product moment, as `backed` (the kit says so), `source` (a named file in the app the build has to check), `staged` (an invented way of showing something real, which the pitch marks as invented) or `unsupported` (a capability, fact, number, price, person or quote nothing backs). The agent fixes what's unsupported before it stops. Invention is welcome in how the product is shown and how it looks (an enlarged, stylised or reimagined UI), never in what it does: a reimagined screen with a button or a number the product lacks is `unsupported`. Its first run, on gomlin's `pag-tokef`, flagged "no more forms" said without the kit's caveat that swipe apply covers only enabled sources.

**The agent stops here** and waits for you. "Go", notes, or "another idea" are all cheap at this point. Skip the pitch by saying "no pitch, just build it".

### 7.2 Build

Once you say go:

- The agent builds in `src/ads/<slug>/` however the idea needs, using the parts bin where it helps.
- It checks its own work with stills and contact sheets (looking at them, as in mathbooklm-ad) before any full render.
- ElevenLabs runs only within the credits shown in the pitch. Anything beyond that, it asks first.

**First look: the agent stops again.** It runs `bun run validate <slug> --layout` first (the Layout and Hebrew checks only, straight from the code with no render, free and a few seconds, written to `out/<slug>/layout.md`) and fixes what fails: text over text, outside the safe area, too small for a phone. Then it renders every ratio, copies the MP4s to `queue/<date>-<brand>-<slug>/`, and replies with their paths. That layout pass is the agent's own look, not the checks: neither the reviewer nor the full validators have run. You watch the real ad before any time goes into checking it, because checks are wasted on an ad you'd change or drop. You answer with one of:

- **Notes** ("change the ending"): the agent fixes the ad, re-renders only the ratios that changed, and stops at a new first look. There's no limit on rounds.
- **"Check it"**: the reviewer and validators run (§7.3), and the ad goes to hand-off (§7.4).
- **"Skip the checks"**: straight to hand-off, with the README saying the ad wasn't checked.
- **"Drop it"**: the agent stops and spends nothing more. The folder stays, with `Dropped` at the top of its README.

Skip the first look by saying "just finish it" when you ask for the ad.

### 7.3 The reviewer and validators

There are two checks, and both run only when you ask for them at the first look. The reviewer catches what could look better, and the validators catch what's broken.

**The reviewer** (`bun run review <slug>`) is one agent with fresh eyes (`.claude/agents/ad-reviewer.md`). It looks for the things you'd notice in a finished ad: an element that works but would look better moved, resized or spaced differently. It runs on stills of the current code, so the reviewer and its recheck need no render. Applied adjustments are rendered once, after the recheck.

- **Frames:** the script captures the ad at low resolution, then picks the last frame before each change of shot, plus one every 2 s while the picture keeps moving. It doesn't depend on how the ad is built, so long takes and Blender plates work too. Those frames are shot at full size in every ratio. `--frames 240,412` limits it to those frames and adds a recheck to the report, `--frames +240,412` adds them to the pick, and `--dry-run` shows the picked frames and spends nothing.
- **What it sees:** those stills and the two-line idea from `pitch.md`, so it can tell a deliberate choice from a mistake. It's a fresh, read-only headless Claude Code run (`claude -p`) with no memory of the build, so it judges what's on screen, not what the builder meant.
- **What it looks for:** things that are almost aligned but not quite, uneven spacing, elements too big or small for their space, crowded edges, awkward overlaps, line breaks that leave one word alone, dead space, no clear focal point, a weak hierarchy, a layout that looks shrunk rather than designed for its ratio, elements that jump between shots when they should hold still, and in Hebrew, mirrored or misplaced punctuation, arrows pointing the wrong way, and left-aligned text that should sit on the right.
- **What it returns:** `queue/<slug>/review.md`, at most 10 adjustments, worst first, each one concrete enough to apply without discussion:
  | Ratio | Frame | Element | What's off | Adjustment |
  |---|---|---|---|---|
  | 9x16 | 240 | "Try it free" button | 30 px left of the headline's centre | centre it under the headline |
  | 1x1 | 412 | logo | competes with the headline | scale to about 70%, move to the top-left corner |

Rules that keep it fast and keep the ad the agent's own:

- **Adjust, don't redirect.** It covers placement, size, spacing, alignment, balance and legibility. It never touches the idea, the copy, the palette or the style, and a weird idea stays weird. An element that's huge, cropped, bleeding off the frame or broken out of its device on purpose, or a UI blown up or restyled, is left alone: ads enhance the product on purpose.
- **The builder decides.** It applies the adjustments it agrees with, and each one it declines gets a line in the README saying why.
- **"Nothing to adjust" is a good result.** The reviewer doesn't pad the list.
- **One pass, plus one recheck.** After the fixes, it looks again only at the frames that changed. Anything still open goes in the README for you.
- **It's cheap.** One vision model, set by `model:` in the prompt's front matter, with the ratios reviewed in parallel. The target is a couple of minutes per review, and a 30 s ad costs about $0.25 a ratio.

Notes you give after the checks have run are fixed the same way, and the reviewer then runs only on the frames that changed.

**Validators** (`bun run validate <id>`) run after the reviewer's adjustments are rendered. They're deterministic scripts that cost no tokens and take seconds, and they write `queue/<slug>/validate.md` with pass / warn / fail and the frame and ratio of each problem:

| Area | What it checks |
|---|---|
| Render | every ratio and take exists at the right size and exact length; no blank, black or accidentally frozen stretches; three random frames re-render the same on two fresh pages, in opposite orders |
| Sound | loudness −14 LUFS ±1, true peak under −1 dB, no clipping, picture and sound the same length, music faded by the end |
| Layout | on frames sampled every ¼ s (from `nykma.inspect()`): text inside each ratio's safe area, not clipped or overlapping other text, not too small to read on a phone in 9x16, and enough contrast against the pixels behind it |
| Brand | fonts are the brand's, the logo and URL are on the end card, and the end card holds at least 1 s. Colours outside the palette are a **warning, never a failure**, because the idea may call for them |
| Truth | every on-screen string and every line in `post.md` is checked against `brand.md`: banned claims, and numbers or prices that aren't in its facts. The README has a claim → evidence row for each product action, and the evidence files exist |
| Copy | every link in `post.md` has UTMs. Hebrew text renders right to left, and no letter falls back to a font outside the brand kit |
| Handwriting | stroke order and coverage flags from `hand:check` |

Render also warns about a `tune.json` key that no code in `src/ads/<slug>/` names, since that knob does nothing (§5).

Where the lines fall:

- **Layout:** a problem held for 0.75 s or more fails, and a shorter one warns, because it's a moment in a move. In 9x16, text under 32 px fails and under 40 px warns. Safe areas in 9x16 keep clear 200 px at the top, 120 px on the right, 320 px at the bottom and 60 px on the left, for the app's own UI.
- **Frozen picture:** 2 s warns and 3 s fails. Up to 6 s is allowed at the very end, because that's an end card.
- **Sound:** music not faded by the end only warns, because a hard stop can be the joke.
- **Numbers:** a bare number that isn't in the facts warns. A price, a percentage, `10k`, `3x` or `500+` fails.
- **Re-render:** three random frames are drawn on two fresh pages, in opposite orders. A frame fails when 256 or more pixels differ by more than 48 levels out of 255. Bytes can't be the test: even with `--disable-partial-raster`, Chromium's anti-aliasing of moving or scaled text and shapes shifts a little with what the page drew before. On the demo ads about 1% of frames differ, nearly always by under 10 pixels past that line and once by 84, and a stray `Math.random()` on 24 small dots gave 1250 to 1580.

Failures must be fixed before the hand-off. Warnings are listed in the README for you.

A failure in Render, Layout or Brand can be the idea rather than a mistake, like a deliberate freeze or type that bleeds off the frame. A `Deliberate: layout 120-300 <why>` line in the queue README, with the area and the frames, turns that failure into a warning that shows the reason. Sound, Truth and Copy can't be waived.

You can run either check yourself at any time, on any ad.

### 7.4 Hand-off (`queue/<date>-<brand>-<slug>/`), as in mathbooklm's `marketing/queue/`

The folder is named for the brand, so ads can be found by brand later: `<date>-<brand>-<slug>`, with the kit's folder name from `brands/` (`2026-11-10-gomlin-madrich`). Work that is no brand's ad takes one plain word for what it is in its place (`2026-11-04-benchmark-bakeoff`). The scripts read the slug back with `folderSlug()` in `scripts/lib/queue.ts`, which matches the longest kit name first, and still find an older `<date>-<slug>` folder.

- **The renders**, every ratio and take, each as `<id>.mp4` with sound and `<id>-silent.mp4` with none, plus the sound alone as `<slug>[-<take>].mp3`. An ad with no sound has no MP3. An ad with a thumbnail adds `<id>-thumbnail.png` and `.jpg` for each (§7.5).
- `README.md`**:**
  - `instructions:`, from `bun run stamp <brand>`: a hash of every instruction file as this brand's run reads them, named after the frozen version in `evals/prompt-versions/` when one matches, and otherwise kept in `evals/stamps/<hash>/`, so a result can always be tied back to the exact instructions
  - the takes
  - a **claim → evidence table** (every product action on screen, with the source file in the app or a live screenshot)
  - **checks**, with the open ones unticked for you: facts correct, end card held, safe areas, claims, and for Hebrew ads, that the copy reads natively
  - **review and validation**: any adjustment the builder declined, with the reason, and the validator warnings left
  - **results**, filled in by you after posting, one row per platform: spend, views, 3 s views, completion, clicks, sign-ups or installs. `bun run stamp --report` lists every ad by its instructions and whether it has results, the start of judging prompts by what ads really do.
- `post.md`**:** the idea in two lines, a caption per platform written natively for that platform, and links with UTMs (`?utm_source=<platform>&utm_medium=social&utm_campaign=<slug>`). Copy in any language is written natively, not translated.

The agent replies in a few lines: what's in the queue, and what you need to do. Notes go back in chat, and the agent fixes and re-renders in the same folder. If GitHub is connected and you ask, it opens an issue or PR with the folder (renders as release assets, the README as the body).


### 7.5 Thumbnails (`thumbnail` on the registry line)

A cover image for each layout, for the platforms that let you choose one: a YouTube video, a Reel's cover, a LinkedIn or Facebook video. It's on when the Thumbnail setting is (§10.8), and it costs nothing, since it's made in code like the ad.

- **In the registry:** `defineAd({ …, thumbnail: Thumb })`. `Thumb` gets each ratio's props, with `useFrame()` at 0, so each layout is composed for its own shape. `<Sequence from={-n}>` shows the ad's frame `n` inside it, three.js included, so a cover can start from the ad's best moment and set its own type over it.
- **Capturing it:** `capture.html?id=<id>&thumbnail` mounts the cover in place of the ad on one frame, with the same fonts, images and held loads as any frame (`session.open(video, { thumbnail: true })`). `bun run stills <id> --thumbnail` captures it to look at. `bun run render` writes `<id>-thumbnail.png` and a `.jpg` (`-q:v 2`, well under YouTube's 2 MB) next to each MP4, and `--thumbnail` renders only those.
- **The agent:** the brief's "Thumbnail:" line sends it to `.claude/guides/thumbnail.md` at the pitch. A cover reads at a thumb's size (one subject, at most four or five words, much larger type than the ad's), makes the same promise as the ad, carries the brand small, and keeps its subject in the middle of a 9:16, which grids crop. Its words go in the pitch's "Thumbnail:" line, so `bun run claims` checks them with the rest. It's copied to the queue folder at the first look, and `post.md` says which file is the cover for which platform.
- **On the desk:** a project with thumbnails shows the 16:9 one (or the first) as its card's poster, and lists them in its files as **Thumbnails**, with each one's JPG to download.
- **Tested** with `three-demo`: its cover is the settled cube from the last frame under one line, in 1:1 and 9:16, and the ad still passes `validate`.

---

## 8. The agent prompt (`.claude/agents/ad-agent.md`)

A short core that's relevant to every run, and guides the agent reads only when their stage comes. It replaced a ~6k-token prompt that carried every stage at once, and a `CLAUDE.md` that repeated it on purpose (2026-11-08, from the deep-research report on prompting ad agents: instruction-following drops as constraints pile up and compete, and context that doesn't bear on the current step crowds out what does).

**The core, in order:**

- **The job:** an ad worth watching that says one true thing about the product and works on a phone. The user approves and posts everything.
- **Hard rules**, first because they hold over everything: post only when asked, spend only what's approved, claims are true, rights, keys stay closed, say only what happened. Each says where code backs it: the desk denies `gh`, `git push`, `curl`, `.env` and the key store (§10.10), so a post goes only through `bun run publish` and the desk (§10.12), holds the generated-media budget (§6.6), and `validate` checks the truth, numbers and UTMs (§7.3). A prompt can't make a model obey perfectly, so the limits that matter most are enforced outside it.
- **Who decides what:** the hard rules, then the brand kit, then the brief, then the stages, then craft. A brand's style or note beats a general principle. A brand's own instructions come before the defaults, except the hard rules.
- **The stages**, each ending in a file you can look at: read the brief (with `brand-check` and `history`), explore, pitch and stop, build, first look and stop, checks when asked, hand-off. The pitch is the contract: the build decides what it leaves open, and a change to the idea, a claim or the cost goes back to you.
- **Finding the idea**: the explorers and the choice (§7.1).
- **Craft**, as principles with their reasons, so the agent can judge cases they don't name: the first frame is the thumbnail, the brand early and inside the idea, one viewer and one thread (the shape is the idea's: a demo, a story, one striking visual, a tease and reveal, a loop), time to read, a new composition every shot, each ratio its own design, one motion language chosen for the ad, picture and sound each carrying it, selling the idea rather than the screenshot (the UI may be enhanced or reimagined, like a Google or Apple product ad, as long as it stays recognisable and only does what the product does), length that follows the idea. Most of these came from HyperFrames' skills after the bake-off (§10.9). The measured limits (text sizes, safe areas) are in the build guide, since `validate` enforces them.
- **Guides**, with when to read each, and **done**: what a finished pitch and a finished ad are.

No emphasis in capitals and no "MUST": current Claude models over-apply emphatic rules, so the force of a rule comes from where it sits (the hard rules) and what backs it.

**The guides** (`.claude/guides/`) hold what's specific to one stage or one kind of ad. They're read when their moment comes, so none of it shapes the idea:

| Guide | Read when |
|---|---|
| `build.md` | the user says go: code, scenes and `story.json`, settings in the ad, commands, what to check on stills (with `validate --layout`), the first-look render |
| `engine.md` | the user says go: what the engine and the parts bin can do (ads, scenes, cues, time, shapes and morphs, camera, cursor, sketches, captions, handwriting, audio timing, `spec.json`), the moves for reimagining a product, so the build starts there instead of learning it from old ads |
| `3d.md` | the idea needs depth: CSS 3D, three.js or Blender, and keeping three.js a function of the frame (§6.10) |
| `thumbnail.md` | the brief asks for a thumbnail: what makes a cover work, and how it's made and rendered (§7.5) |
| `footage.md` | the user gives video (§6.5) |
| `stock.md` | a shot code can't make (§6.8) |
| `generated.md` | stock has nothing: the flow, `gen.json`, the models, Codex and this PC, the ad on a screen (§6.6, §6.7, §6.9) |
| `hebrew.md` | any Hebrew ad, from the first idea: native copy and a second read as a Hebrew editor, bidi done in code, the voice (§6.4) |
| `checks.md` | "check it" (§7.3) |
| `hand-off.md` | the ad is done: the files, README, post.md, notes for next time, the reply (§7.4) |
| `brand-kit.md` | a new brand kit or a refresh (§9) |

**`CLAUDE.md`** holds what every session needs, agent or not: the commands, the code rules (every value a function of the frame, no `import` from `gen/`, the desk's `story.json`), the limits, and how to change nykma. Making an ad points to `ad-agent.md`, which owns that workflow, so each rule has one owner.

**Brand notes** (`brands/<brand>/notes.md`) are the user's standing feedback for a brand's ads ("music only", "no self-writing words"), printed by `history`. The agent adds one at hand-off when a note should hold for the brand's next ads. Agent runs get no Claude Code memory (`CLAUDE_CODE_DISABLE_AUTO_MEMORY`, and the memory folder denied), because a person's own sessions' memory reached the agent outside the instructions in the first eval, so the notes are the one place this feedback lives.

**Working with the tools.** The core prompt asks for plain shell commands (no loops, `$variables`, brace expansion or heredocs, which the permission check refuses, each refusal costing a turn), and allows reading commands in the shell (`cat`, `head`, `tail`, `sed -n`, `grep`, `wc`, `find`). It asks for `bun run stills … --sheet`, one labelled image of the frames, rather than a picture per frame: the first eval's builds read 10 to 13 stills a round.

A brand can have its own version of any of these files (§10.11).

### 8.1 Testing a prompt change (`evals/`)

A rule that reads well can still make the ideas worse, so a change to the prompt is tested before it's trusted (`evals/README.md`):

- **14 fixed briefs** (`evals/briefs/`) across every brand, Hebrew and English, and each layout, including three edge cases (an unsupported claim, a fake testimonial, a single still) and two 10-second ads (`mathbooklm-ten`, `gomlin-ten`). Each has an "Expected" section that's never sent, for judging the hard rules.
- **Versions** (`evals/prompt-versions/`) are frozen copies of the instruction files at their repo paths. `a-2026-11-08-accumulated` is the prompt before the rewrite. `bun run eval snapshot <name>` freezes the live files.
- **`bun run eval <version|current>`** runs the pitch stage on each brief (`--runs 2` to see whether a result repeats) in a throwaway git worktree of HEAD with the working copy laid over it and then the version's own files, so every version runs on today's tooling, its own `CLAUDE.md` loads, and the instructions are the only difference. It has the desk's model, effort and permissions, and stock, gen, animatic, `mv.py`, render and stills are switched off for every version. Each run keeps its `pitch.md`, the reply, its full event log, a step-by-step `trace.md` (every tool call with its timing and result, and each explorer's brief and answer), and `meta.json`: cost, turns, time, tools used, explorers started, old ads and files outside the repo read before the pitch, guides read. It spends Claude tokens.
- **`--build`** carries a run past the pitch: the same session gets "go", builds and stops at the first look, and the run keeps the MP4s and the code it wrote. Its worktree links `node_modules`, `.venv` and `.env.local` (never read, unlinked before removal), so ElevenLabs runs within the pitch's plan. Stock, generated media, footage and review stay off for every version. **`bun run eval compare <a> <b>`** puts two versions side by side, and **`bun run eval trace <label>`** rebuilds traces and counts from the logs.
- **`bun run eval blind <a> <b>`** writes a sheet with each brief's two pitches as X and Y, shown as the idea and storyboard only, sides mixed by a hash. You write `ship: X|Y|neither` and whether each broke a hard rule. **`bun run eval score <a> <b>`** tallies it against the key, with the cost of each version.
- **A version graduates** with no more hard-rule failures, a preference that holds across briefs, and no large cost for nothing. Creative quality is judged by you, not by a model: model judges favour their own style, the first option and the longer one.

---

## 9. Brand kit (`brands/<brand>/`), saved once

A brand is worked out once and reused, so the agent doesn't pay to rediscover it for every ad.

```
brands/<brand>/
├─ brand.md     # colours, fonts (Latin, Hebrew, hand) and their licences, logo files, distinctive assets, tagline, URL, tone, facts (prices, limits), banned claims, where each came from
├─ sources.txt  # the files/URLs the kit was taken from, each with a hash and the date
├─ assets/      # fonts (woff2), logos, screenshots of the real app; ui/ for shared UI mocks
├─ notes.md     # the user's standing notes for the brand's ads, printed by bun run history (§8)
└─ knowledge/   # the brand's own versions of the agent's instructions, edited in Settings (§10.11)
```

- **Making it:** the first time you ask for an ad for a new app, you point the agent at whatever you have: a local repo in any language or framework, a public URL, screenshots, a logo file, or a description. None of them is required, and more gives a better kit. The agent writes `brand.md`, copies the assets and records `sources.txt`, and lists anything it couldn't find instead of guessing. You can also write or edit it by hand. Your edits win.
- **Using it:** every ad reads `brand.md` and the assets and nothing else about the brand. `brand-kit.md` says an ad uses the kit as saved and never re-derives it.
- **Files:** `assets/` is the kit's own copy. The page and the hand tracer read only `public/`, so the agent copies what an ad uses (fonts, logos, screenshots) into `public/ads/<slug>/` and points at it there, as in `ads/<slug>/hand.woff2`. An ad keeps the files it was made with when the kit changes.
- **Distinctive assets:** the colours, shapes, sounds, screens and moments that make the product recognisable even when an ad redraws it. Since ads may reimagine the UI, this list is what keeps it the brand's. A kit made before 2026-11-10 has none yet: the agent names the ones it relies on in the pitch, and a refresh adds the section.
- **Font licences:** fonts in a kit must be licensed for video. The agent records each licence in `brand.md`. When the app's font can't be used (Apple's San Francisco, for example), it picks a licensed substitute and notes that too.
- **Noticing changes:** `bun run brand-check <brand>` re-hashes the sources (free, no tokens, skipping `.env` files) and lists which changed since the kit was made. The agent runs it at the start of an ad and mentions changes, but doesn't act on them by itself.
- **Refreshing:** you ask, at whatever size you want:
  - "refresh the brand": everything
  - "refresh the colours": one part
  - "the logo changed": just that

  The agent updates `brand.md`, the assets and `sources.txt`, and says what changed. Git keeps the history.

---

## 10. The desk (the UI)

`bun run dev` opens the desk, a video editor over the same files and the same agent. Everything in §7 and §9 can be done from it without a terminal. It adds no flow of its own: a button sends the agent the words you'd type.

It has two places: the **dashboard**, with projects and brand kits, and a **project**, laid out like a video editor: the viewer in the middle, the timeline under it, scenes and files on the left, the inspector and the agent on the right. Until 2026-11-21 the project was a Figma-style board where you drew arrows between scenes; the timeline replaced it, because a video is a line, not a graph.

### 10.1 Dashboard

A left rail with **Projects**, **Brand kits**, **Publishing**, **Settings** and the brands.

- **The brief comes first.** The top of Projects is a prompt box ("What should the next ad be about?") with the brand, Video / Asset / Talking head, the layouts, **Pitch first** and **Cover image**. The last three start from the settings (§10.8) and change only this ad. Ctrl+Enter sends it and opens the project with the agent already running. The agent picks the slug and makes the queue folder as usual. **New project** in the header jumps to the box.
- **Talking head** (§6.11) adds **Add the take**: the take of the whole script, and a separate mic recording or a script if there is one. They upload to `queue/_incoming/<batch>/` before the brief is sent (the agent moves them into its folder's `inbox/`), and the brief tells the agent to follow `.claude/guides/talking-head.md`. With no take, the agent writes the script and a sheet to record from, and stops for the recording.
- **The library.** A project is one video or one asset (§10.5). Each card is the ad's own shape, so a 9:16 ad is a tall card: the first layout that has a render, which plays on hover, or else its cover, a still, the animatic, a storyboard image or the live middle scene. On it are the state, the layouts and the length; under it the name, brand and date. The state is read from the files, as before: **Pitch**, **First look**, **Checked** (`validate.md` exists), **Ready** (`post.md` exists) or **Dropped** (`Dropped` at the top of the README). An ad in the registry with no queue folder, like the demos, is **In code**. You can filter by brand and state.
- **Brand kits.** Each card shows the logo on the kit's first colour, the palette as swatches and the font names.
- **New brand kit** has three ways in, and each one opens a chat with the agent to make the kit (§9):
  - **From a local repo:** paste a path.
  - **From a URL.**
  - **Upload files:** drop logos, fonts, screenshots or a PDF. They're saved to `brands/<brand>/uploads/` and listed in `sources.txt`.
- **A brand kit page** renders `brand.md`: colour swatches with hex (click to copy), font specimens set in the kit's own files with their licences, logos, tagline, URL, tone, facts, banned claims and sources. **Check sources** runs `brand-check` and shows what changed. It's a button rather than automatic, because it fetches every URL source and records hashes. The chat sits on the right for "refresh the colours" and the like. **Edit brand.md** opens it as text, and your edits win, as in §9.

### 10.2 A project

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ‹ Projects / mathbooklm / kav-echad   ✓Pitch ✓Build ●First look Checks Post  Render [Check it] │
├────────────┬───────────────────────────────────────────────┬───────────────────┤
│ Scenes Media Files │ 16:9 1:1 9:16 All          Select  Safe areas │ Inspect Effects History Agent │
│ 1 The line…  4.0 s │              ┌────────┐                       │ Headline          │
│ 2 The lasso  2.3 s │              │  the   │                       │ KavEchad.tsx:393  │
│ 3 …                │              │  video │                       │ Text  [כותבים…]   │
│ Not in the video   │              └────────┘                       │ X 0  Y -12  100%  │
│ alt-end   +        │  ━━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━ │ Size 80  ● #111   │
│                    │  00:13:06 / 00:14:15   ⏮ ‹ ▶ › ⏭             │ Effects  Fade up  │
├────────────┴───────────────────────────────────────────────┤                   │
│ Video  [1 the line ▒▒▒▒][2 lasso ▒▒]◆[3 the current ▒▒▒▒▒][4][5 end ▒▒]       │                   │
│ Sound  [music.wav ||||||||||||||||||||||||||||||||||||||||||||||||||||||||]   │                   │
└────────────────────────────────────────────────────────────┴───────────────────┘
```

- **Top bar:** back to the dashboard, the brand and the project name, the take, the **stages** (Pitch, Build, First look, Checks, Post: done ones ticked, the current one lit, from the same state as the dashboard), **Undo** and **Redo** (§10.13, with what they'd undo in their tooltip), **Render** (every ratio, no agent, no tokens), **Publish**, and the stage's next step as the one filled button: **Go** for a pitch, **Check it** at the first look, **Publish** when it's ready.
- **Left panel:** **Scenes** lists the story in order with lengths, then **Not in the video** (the plus puts one back at the end), and **Add an image or a clip**. **Cut**, for a talking head with a `cut.json` (§6.11), lists each line with what it says, its length and jump cuts, and its tries as chips (hover for the try's time and words, click a line to read them all and go to it). Picking a try, **Auto** (the cutter's choice again), **Cut again** and **Hear it again** (`--verify`) run `bun run take` and go in the history as one change to `cut.json` and `take.json`, so Undo puts the cut back. Below, what was left out of the take and why. Not while the agent works on the ad. **Media** is the generated stills and videos (§6.6). **Files** has the idea and the project's files (`pitch.md`, `script.md`, `cut.md`, `README.md`, `post.md`, `review.md`, `validate.md`, the renders, stills, covers and the animatic), each opening in a reader.
- **Viewer (middle):** §10.3. **Timeline (bottom):** §10.4.
- **Right panel:** **Inspect**, **Effects** and **History** (§10.13), and **Agent**, the chat (§10.6). Picking something in the viewer opens Inspect (or keeps Effects open); a run starting opens Agent.
- **Keys:** Space plays, ←/→ step a frame (Shift: ten), ↑/↓ go to the previous or next scene, Home/End, V turns Select on and off, Esc clears the selection, Ctrl+Z undoes the desk's last change and Ctrl+Shift+Z (or Ctrl+Y) puts it back.

### 10.3 The viewer

The whole video in story order, played by the engine, not a render: `board.html?id=…&viewer` in an iframe at the video's exact size, scaled to fit. A broken ad shows its error there and the rest of the desk carries on.

- **Ratios:** 16:9, 1:1, 9:16 or **All**, which shows every layout side by side at one height, playing together, so each is seen in its own shape (Goal 8). The first carries the sound and the clock.
- **Play** plays with the ad's sound (the cue list, as in the preview), from the playhead. Under the picture, a **scrub bar** spans the whole video with a tick where each scene starts: press and drag it to scrub. The transport shows timecode and frame, steps frames and jumps scenes.
- **Live:** when the agent or the desk changes an ad's code, the viewer draws the new code in place, on the same frame with the same selection. The registry accepts the hot update itself (`import.meta.hot.accept` in `src/registry.ts`) and hands the new one to each `board.html` frame, so the desk page never reloads; a page that doesn't listen, like the old scrubbing preview at `/index.html`, reloads only itself. When the story, a trim or a transition changes on disk, the viewer loads the video again.
- **Select (V)** outlines the element under the pointer and selects it on click (§10.13). A click on the canvas round the frames, or on nothing in a frame, lets go of the selection, as Escape does. **Safe areas** shows the margins `validate` checks.
- **Elements behind others.** A click picks the topmost tagged element. A click on the selected element, or a second click on the same spot, picks the one under it, and so on down, back to the top after the last; hovering the selection outlines that one, labelled "Behind". A right click lists every element at that point, top to bottom: hover a line to outline it, click it to select it. So a veil or a glow that covers the frame never hides what's behind it, and one that's see-through on this frame (opacity 0, or hidden) isn't hit at all. The Layers tab (§10.15) lists them all.
- **The margin.** Each frame sits on a dotted canvas with room round it, and only the video is clipped, so the outline, corners and label of an element that fills the whole frame show outside its edge.
- **Moving an element:** drag the selected element to move it (Shift keeps it on one axis), or drag a corner to scale it. The frames show it live, a readout gives the offset or the scale, and on release it's saved as the element's `translate` or `scale` (or its nudge knob, when the code has one), one entry in the history. The drag holds the pointer wherever it goes, over the frames too, and Escape puts the element back. A press on a corner without a drag does nothing. A click inside the selection without a drag picks what's under it (above), after a moment's wait in case it's a double click, which edits its text in the inspector.
- **Snap.** While an element is moved, its edges and centre snap to lines within 7 screen pixels: the frame's edges and centre lines, the safe areas' edges, and the edges and centres of the other elements showing on the frame (not the element's own parents or children, nor a layer that fills the frame). Scaling snaps an edge onto those lines, or the size to 100% of the code's. The lines it sits on show in magenta across the frame. **Snap** in the viewer bar turns it off; ▾ picks what it snaps to; Ctrl held while dragging places freely. The choice is kept in the browser.
- **Before there's code** the viewer plays the animatic, or shows the storyboard row under the playhead.

### 10.4 The timeline, and the story

The story is the timeline: one track of scenes with no gaps, as in Final Cut's storyline. The video plays them left to right.

- **Moving a scene:** drag it. A line shows where it will land, and the scenes after it close up.
- **Trimming a scene:** drag its start or end. A scene's code still runs from its own frame 0, so trimming only chooses which of its frames play (`trim` below). Dragging an end back out shows the frames again, up to the scene's full length. An image's end sets how long it shows.
- **Taking one out:** **Take it out of the video** in the inspector. It waits under **Not in the video** in the left panel, which is where an alternative opening or a cut scene lives. It comes back at the end with the plus, or with **Put it in the video**.
- **Your own images and clips:** drop them on the timeline where you want them, or **Add an image or a clip** (to the list, not the video). Images go to `public/ads/<slug>/board/`, because the video reads only `public/`. Clips (MOV, MP4, M4V, WebM, MKV or AVI, up to 4 GB) go to `public/ads/<slug>/footage/` and are unpacked to frames (§6.5) while the viewer says so, which takes a while for a long or 4K clip. In the inspector: **Shown for**, **Picture** (Fill crops to the frame, Fit shows all of it on black) and, for a clip, **Sound** on or off. **Remove from the project** takes one away; the file stays in `public/`. Trims inside a clip, slow motion and framing per shape are for the agent, through `<Footage>`.
- **Filmstrips:** each scene shows a few of its own frames, drawn by the engine (`board.html?…&scene=…&strip=n&h=px`, one iframe per scene). Each frame is shrunk with CSS `zoom`, not a scale transform, so it's laid out and rasterized at the strip's size: under a transform, Chrome rasterizes a 3D-tilted plane near its full size, and a timeline of them ran the desk out of GPU memory.
- **Sound:** a second track shows the ad's cues where they start, from the registry.
- **The playhead:** press anywhere on the ruler, on the playhead's handle or on an empty part of a track and drag to scrub; a double-click on a scene jumps to its start. Zoom with the slider; **Fit** goes back. Drag the timeline's top edge to make it taller (the filmstrips grow with it); the desk keeps the height.
- **Transitions:** a diamond on a cut marks a transition into the scene after it, with a band over the frames it covers. Clicking it opens the scene's transition in the Effects tab (§10.13).
- **One story for every ratio.** The order and trims apply to 16:9, 1:1 and 9:16.

**The file:** `src/ads/<slug>/story.json` holds the order:

```json
{ "order": ["hook", "demo", "end"] }
```

Images added on the timeline are listed under `images`, by id, and their ids go in `order` like any scene's:

```json
"images": { "image-team-photo": { "src": "ads/launch/board/team-photo.png", "name": "team photo", "seconds": 3, "fit": "contain" } }
```

A video clip is listed there too, with `src` pointing at its frames and `clip` saying how to play them:

```json
"clip-trail-run": { "src": "ads/launch/gen/footage/trail-run/#####.jpg", "name": "trail run",
  "clip": { "fps": 59.94, "frames": 412, "from": 1.5, "sound": "ads/launch/gen/footage/trail-run/audio.wav", "volume": 0 } }
```

`from` (seconds into the clip) and `volume` (0 is muted) are optional. Without `seconds` a clip plays to its end.

A scene can be trimmed, by id, in the scene's own frames:

```json
"trim": { "demo": { "in": 20, "out": 150 } }
```

`in` is the first frame shown (default 0) and `out` the frame it stops before (default the scene's length). The scene plays `out - in` frames, at least one. Its code still runs from its own frame 0, so frame `in` is what shows first. Its cues move with it: one that starts before `in` starts at once, further into its file, and one that starts at or after `out` is dropped. One that runs past `out` plays on, as a cue running past a scene's end always has. Board images and clips aren't trimmed this way (they have `seconds` and `from`), and an asset ignores trims. Trimming an ad with one `component` makes it a scene like any other, with its cues moving with it.

A scene can have a transition into it from the scene before, by id (`src/engine/transitions.ts`):

```json
"transitions": { "demo": { "type": "push-left", "frames": 15 } }
```

The types are cut, fade (a crossfade), fade-black and fade-white (dips), slide-left/right/up/down (the new scene slides over the old, which drifts back and dims), push-left/right/up/down (both move), whip-left/right (a fast push with motion blur), zoom-in, zoom-out, blur, wipe-left/right/up/down (a soft edge) and iris. A type the engine doesn't know, or one on the first scene, plays as a cut. Nothing moves in time: the video's length and every scene's start stay as they are, so cues stay put. For the incoming scene's first `frames` (at most its length), the outgoing scene is held on its last frame and the incoming one plays from its frame 0 with the transition laid over both.

The agent writes it with the order it intends, and the desk rewrites it when you move or trim a scene or set a transition, keeping the fields it doesn't own. `arrows`, `start` and `board` were the old board's: the engine never read them, and the desk drops them when it writes. A take can have its own story as `story-<take>.json`, so take B can be the same scenes in another order. The registry reads it with `import.meta.glob`, so a missing file never breaks an ad. Without one, the order is the registry's.

**Scenes in the registry:**

```ts
defineAd({ slug: "launch", lang: "he", cues, scenes: [
  { id: "hook", name: "The hook", component: Hook, frames: 90 },
  { id: "demo", component: Demo, frames: 180, cues: demoCues },
  { id: "end", component: End, frames: 60 },
] })
```

- **Time:** the engine plays the scenes in story order, each in its own `<Sequence>`, so `useFrame()` inside a scene starts at 0. The ad's length is the sum of the scenes on the story. Every value is still a function of the frame.
- **Sound:** a scene's own `cues` move with it. The ad's `cues`, like a music bed, play from the start of the story whatever the order.
- **An ad timed by audio** takes each scene's length from its timeline. Reordering or trimming it puts the voice out of time, so the viewer shows a warning, and the agent asks before it spends credits on a new mix.
- **An ad with one `component`** is one scene. The ads made before the desk work as they are. Once you add an image to its timeline, the component is a scene named after the ad, and its `cues` move with it: an image before it pushes its sound later too.
- **Board images** are scenes the engine makes from `story.json`: `seconds` long (one image for an asset), with no sound. In an ad with scenes that's timed by audio, an image on the story moves the scenes after it away from the mix, so the viewer shows the same warning as a reorder.
- **Scenes are where the agent chose to cut**, not a schema for shots. A continuous move can span one long scene, and a single long take is one scene.

### 10.5 Projects: videos and assets

- **A video** is what nykma makes today: scenes in story order, rendered to MP4 in every ratio.
- **An asset** is a still, or a set of them, such as a post image or a carousel. It's `kind: "asset"` in the registry, and each scene is one image. Render writes `<id>-<n>.png` for every ratio in story order, so the timeline sets the order of a carousel, and a single image needs none. `validate` doesn't know assets yet: until it does, an asset's checks are the reviewer and your eyes.

### 10.6 The chat

The **Agent** tab on the right is the conversation with `ad-agent` for this project, or with the agent making a brand kit. Opening a project is AI-first: a new project starts with the chat running, and the timeline fills as the agent works.

- **Width:** drag the panel's left edge, from 280 px up to whatever leaves the viewer room. Double-click it to reset. The width is kept for next time.
- **Messages stream:** the desk runs `claude -p --agent ad-agent --output-format stream-json` and shows the text as it comes. Tool steps fold into one line each ("rendered 9x16", "wrote pitch.md") and open to show the details.
- **Same conversation:** each project's session id is kept in `queue/<folder>/.session` (gitignored), so every note continues it.
- **Quick replies** follow the state and send the words you'd type:
  - Pitch: **Go**, **Another idea**
  - First look: **Check it**, **Skip the checks**, **Drop it**

  "Drop it" marks the ad without calling the agent, so it spends nothing.
- **Context chips:** what's selected comes with the message: an element (`@div "מכתב יד…" · f396`, with its source location, box, font and colour), a scene or image on the timeline, or else the frame you're on. **Ask the agent about this element** in the inspector keeps it as a chip. A change to the order since the last message is added too ("it now plays hook → end → demo"), so the agent knows before it renders.
- **Files:** images, recordings or fonts dropped on the chat are saved in `queue/<folder>/inbox/` (or the brand's `uploads/`), and their paths go in the message.
- **Stop** ends the run, and agents stop when the dev server does. A finished run is saved in `.chat.json` next to `.session` (gitignored), so the chat survives a restart.
- **Render** in the top bar runs `bun run render <slug> --ratio all` with no agent and no tokens, shows its progress in the chat, and copies what it wrote to the queue folder.
- **The pitch on the timeline:** while there's only a pitch, each storyboard row is a clip at its times, with its image, and the animatic plays in the viewer.

### 10.7 Look and build

- **Look:** a video editor's: neutral grey around the viewer so an ad's colours read true, 13 px UI type, timecode in a mono face with fixed-width digits, one accent for what's live or selected (the playhead, the selection, the current stage, the one filled button), thin borders, and colour kept for the timeline's tracks. Two themes share the same tokens (`src/desk/desk.css`, `theme.ts`), picked in **Settings → Look** and kept in this browser: **Ink** (the default, `graphite` in code: nykma's own colours from `brands/nykma/brand.md` and nobodyknowsmyapp.com, Ink and the site's deep greys for the panels, Paper for the text and the red Marker `#E8301F` as the accent, with Geist for the UI and JetBrains Mono for timecode, code, page titles and the wordmark) and **Studio** (warm charcoal, brass, IBM Plex, which has a Hebrew cut). Both are OFL. Hebrew projects keep the desk in English and the ads in RTL. The sidebar carries nykma's icon (a play button and the red cursor on a black tile) and the site's wordmark, `nykma_` with the cursor in red; the desk tab's icon is the same drawing.
- **No new services:** it's still a React page on the Vite dev server, with the file reads, writes and agent runs as dev-server endpoints (`scripts/lib/desk.ts`) that only accept POSTs from the desk's own page. The scene list comes from the registry through the dev server's own module loader. The viewer, timeline and pick boxes are hand-written (iframes, CSS and pointer events), with no editor library.
- **Unattended agent:** allowed file tools and the build commands, and denied `.env` files, `gh` and `git push`, as before.

### 10.8 Settings

**Settings** in the left rail sets the defaults for new ads. They're saved in `settings.json` at the repo's root (gitignored) as you change them, and `scripts/lib/settings.ts` falls back to the defaults for anything missing or wrong.

The page (`src/desk/Settings.tsx`, `settings.css`) lists its categories on the left and shows one at a time, each value a row with what it does on the left and its control on the right. A dot on a category means something there needs a look (Claude Code not connected, the chosen generator not ready, a key missing, a tool the desk needs not found). The desk remembers the last category; opened from a brand kit, it goes to Agent with that brand's instructions. A "Saved" mark shows after each change.

- **General:** Layouts (a card per ratio, in its shape), Pitch first and Thumbnail (switches), and the desk's theme (a card with a picture of the desk in each).
- **Agent:** Claude Code's connection, its model and effort, its path under Advanced, and the agent instructions (§10.11).
- **Voice:** Automatic or Always this voice, the voice and its preview, and the saved voices with Add voice.
- **Generated media:** stills, video and word timing as option cards marked Free, Paid or Credits, with the chosen one's readiness under it; Codex's path under Advanced; Start and Stop for ComfyUI.
- **Connections:** each service's key (Connect or Replace opens the field, with Test and Remove), and the logins that need no key (Codex, Claude Code).
- **System:** every tool the desk checks, with Check again.

| Setting | Default | What it does |
|---|---|---|
| Layouts | 1:1 | The ratios a new ad is made in. The agent writes them on the registry line as `ratios`. |
| Pitch first | on | Off adds "No pitch, just build it." to the brief. |
| Thumbnail | on | A designed cover image for each layout of a video ad (§7.5). On, the brief asks the agent for a `thumbnail` on the registry line; off, it says "Thumbnail: none for this ad." The new-ad form has the same checkbox for one ad. An asset has no separate cover, so its brief says nothing about one. |
| Voice | Automatic | Automatic lets the agent pick an ElevenLabs voice for the idea and name it in the pitch. **Always this voice** picks one from the saved voices or the account's list, with its preview. The list comes from `mv.py voices --json`, which is free and needs the key. |
| Saved voices | none | Voices you add by id, such as a clone or one from the ElevenLabs library, with an optional name. Adding one looks it up with `mv.py voices --id` (free) for its name and preview, and saves it even if ElevenLabs doesn't know it, with a warning, since it would then fail when it speaks. They come first in the picker, and in Automatic the brief asks the agent to pick from them first. Up to 50. |
| Word timing | Whisper | Whisper (free, on this machine) or ElevenLabs' forced alignment (exact, paid) for recorded voices (§6.3). |
| Generated stills | OpenRouter | OpenRouter (paid per still) or Codex on your ChatGPT login (no money, uses the plan's image limit) for a new ad's stills (§6.6). With Codex, the brief tells the agent to write `"via": "codex"` on each still. The Codex path is empty by default, which finds it. The page shows whether Codex is there and logged in with ChatGPT, from `codex app-server`'s `account/read`, which is free. |
| Generated video | OpenRouter | OpenRouter (paid per clip) or this PC (LTX-2.5 in ComfyUI, no money, about 3½ minutes a clip, §6.9). With this PC, the brief tells the agent to write `"via": "local"` and `"model": "ltx-2.5-q4"` on each video. The page shows whether ComfyUI and the model files are there and whether ComfyUI is running, with Start and Stop. |
| Claude Code | `claude`, its own model and effort | The path to the binary, and `--model` and `--effort` for every agent run. The page shows whether it's installed and logged in, from `claude --version` and `claude auth status`. Logging in happens in a terminal, with `claude auth login`. |

The page also shows whether the ElevenLabs key, Whisper, yt-dlp, OpenCV and ffmpeg are there. Its **Agent instructions** edits what the agent is told, for every brand or for one (§10.11). These checks spend nothing, and the key is never read out: a one-line Python call says only whether there is one.

**Settings go into the ad, not under it.** The desk puts them at the end of a new ad's brief, and the agent writes them into the ad: `ratios` on the registry line, `voice_id` and `align` in spec.json. `mv.py` never reads `settings.json`, and its own defaults (George, Whisper) don't move. So changing a setting never changes a built ad or spends credits on it again. An agent run outside the desk reads `settings.json` for the layouts when its brief names none.

### 10.9 One engine

Every ad is built with nykma, by `ad-agent`. From 2026-11-05 to 2026-11-08 a brief could also start a second agent that built variation B with HyperFrames (HeyGen's HTML and GSAP renderer). It was removed because the two tests found nothing it did better that a rule couldn't do:

- **A frame-for-frame port** (`queue/2026-11-04-benchmark-hyperframes-vs-nykma/`): the same picture (SSIM 0.99), sound and render time, with 1.4× the code, files 1.8× the size, less deterministic renders and a silent RTL bug. The hardest part, the app's UI, still ran on nykma's function-of-time code inside it.
- **A blind bake-off** (`queue/2026-11-04-benchmark-bakeoff/`): time, tokens, code and render time within about 20%. nykma's ad had the better idea and sound. HyperFrames' had the cleaner layout, because its skills gave it layout rules (safe areas, read times) and it checked them while it built.
- **Outside the desk:** variation B had no board, story, scenes, `review` or `validate`, and it cost about twice the tokens per brief.

So the combination is nykma's engine with HyperFrames' craft rules, which are now in `ad-agent.md` ("Craft"): frame 0 as the thumbnail, one real task from hook to payoff, time to read, nothing dead or piled up, phone-readable sizes and the same safe areas `validate` checks, and motion that lands and holds. The two experiments stay in `queue/` and `experiments/hyperframes/` as the record. The second thing worth taking, a transparent WebM from `render`, waits for an ad that needs it (§13).

### 10.10 Connections

The top of the Settings page connects paid services. Each key is pasted once and saved in the desk's key store, `~/.config/nykma/keys/<service>` (a 0600 file in a 0700 folder, outside the repo; `NYKMA_HOME` moves it). It's never shown again: the page knows only whether a key is set and its last four characters. **Test** asks the service whether it works, for free (OpenRouter's `/key` and `/credits`, which give the key's credit limit and use and the account's balance, and ElevenLabs' subscription). A key's limit isn't money: an OpenRouter account with no credits refuses every paid model with 402, so Test fails on it and says so. **Remove** deletes it.

| Service | For | Who reads the key |
|---|---|---|
| OpenRouter | generated video and images (§6.6) | the desk only, which makes the paid calls |
| ElevenLabs | voice, music, sfx (§6.3) | `eleven.py`, run by `mv.py`. A key in `.env.local` still works, and the store comes first |
| Pexels | free stock photos and clips (§6.8) | the desk only, which searches and downloads. Test runs one search |
| Pixabay | free stock photos and clips (§6.8) | the desk only, as for Pexels. Its key goes in the URL, so the desk hides it in every error |
| Codex | generated stills (§6.6), on the ChatGPT login | no key: Codex keeps its own login in `~/.codex`. Only the desk runs it; agents are denied `codex` and `~/.codex` |

**Keeping keys from the agent.** Deny rules on `.env` files never stopped an agent's `node` or `python` from opening one: Claude Code applies them to its file tools and to the shell commands it recognises, not to a script's own reads. So the keys for paid images and video never enter an agent's process:

- the desk calls OpenRouter, Pexels and Pixabay itself
- agent runs inherit no vendor keys from the desk's environment
- they get `--strict-mcp-config` and `mcp__*` denied, so no vendor MCP server can skip the budget and the cache
- they get no Claude Code memory (`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, and `~/.claude/projects/**` denied), so nothing outside the instructions and the brand kit shapes a run

The lists are in `scripts/lib/permissions.ts`, shared by the desk and `bun run eval`.
- the file tools, `curl` and `security` are denied on the key store

`bun run gen` proves itself to the desk with a token made at each start. Agent runs get it in their environment, and a terminal reads it from `out/.desk.json`. A web page can't send that header.

What this doesn't do: an agent runs as you, so a script it wrote could still open the key store's files. The budget is enforced in the desk, so the real backstop is the OpenRouter key's own credit limit, set at openrouter.ai/keys. ElevenLabs works as before, since `mv.py` makes its own calls.

### 10.11 Agent instructions

The **Agent instructions** section of the Settings page edits what the agent is told, as text. A brand kit's top bar links to it with that brand picked (`#/settings/<brand>`). Its tabs come in three groups:

| Group | Tab | File | What it is |
|---|---|---|---|
| Agents | The agent | `.claude/agents/ad-agent.md` | ad-agent's own prompt (§8) |
| Agents | Concept explorer | `.claude/agents/concept-explorer.md` | the three explorers before a pitch (§7.1) |
| Agents | Claims checker | `.claude/agents/claims-checker.md` | what `bun run claims` asks about a pitch against its brand kit (§7.1) |
| Agents | The reviewer | `.claude/agents/ad-reviewer.md` | what `bun run review` asks about the stills |
| Project | Project rules | `CLAUDE.md` | the commands, code rules and limits Claude Code loads for every session here |
| Project | Pitch template | `queue/_template/pitch.md` | what every pitch starts from |
| Guides | Build, Engine, 3D, Thumbnail, Footage, Free stock, Generated media, Hebrew, Checks, Hand-off, Brand kit | `.claude/guides/*.md` | what the agent reads at each stage (§8) |

The desk reads and writes only these files (`scripts/lib/agents.ts`).

- **The editor** works as Obsidian's does, on CodeMirror 6 (`src/desk/MarkdownEditor.tsx`). **Live**, the default, is one editable page that shows the Markdown formatted as you write: headings large, bold bold, code, links and quotes styled, and list dashes as bullets. The marks themselves (`##`, `**`, backticks, `[](...)`) are hidden except on the lines the cursor or a selection touches, so you edit the real text. Tables, code blocks and an agent's front matter stay as their text, set in a code face. **Source** is the plain Markdown with line numbers. **Reading** is the file rendered, not editable. Lines wrap, Hebrew lines run right to left, ⌘S saves and ⌘Z undoes. Nothing is reformatted: the file is saved exactly as typed. The choice of view is remembered in the browser. **Expand** opens the same editor over the whole window, and Escape closes it.
- **Defaults:** with "Every brand" picked, it edits the repo's own files. Every brand reads them unless it has its own version.
- **A brand's version:** with a brand picked, a file it hasn't edited shows the default. Saving keeps a copy in `brands/<brand>/knowledge/`, at the same path with leading dots dropped (`.claude/agents/ad-agent.md` → `knowledge/claude/agents/ad-agent.md`). **See the default** shows the original, and **Use the default** deletes the copy. A dot on a tab marks what the brand edited.
- **At a run:** the desk works out the run's brand: a kit's own runs, the brief's brand, or `brand:` in the folder's pitch or README. If that brand edited the agent, the project rules or the pitch template, the desk writes `.claude/agents/ad-agent-for-<brand>.md` (gitignored) fresh and starts the run with it. That file is the brand's agent prompt (or the default), plus a closing section that lists the brand's other files to read instead of the defaults. It also says to read the brand's `CLAUDE.md` first if it has one, because Claude Code loads the project's by itself. A brand's concept-explorer edits reach the explorers through ad-agent, which starts each explorer's brief by sending it to the brand's version. A brand with no edits runs plain `ad-agent`, and its old generated file is deleted.
- **Review:** `bun run review` reads the brand's `ad-reviewer.md` when the ad's pitch names a brand that has one.
- Edits reach the next run. An ad already built doesn't change. Git keeps the history of both the defaults and the brands' versions.

---

### 10.12 Publishing (`scripts/lib/publish/`, `src/desk/Publish.tsx`)

**Publishing** in the left rail connects your social accounts, and **Publish** on an ad posts or schedules its MP4s on them. An agent you ask posts the same way, with `bun run publish` (below). Either way the desk posts, and nothing goes out until it's approved, on the page or by that command. Approving is a commitment to exact files: the dialog's approval records each MP4's and cover's SHA-256, and a file that changed since isn't posted ("File changed"). Approvals, logins and app secrets live in the key store, `~/.config/nykma/publish/` (`apps/`, `accounts/`, `jobs/`, 0600 files outside the repo, denied to agents like the rest of it), so an agent never holds a login: it asks the desk to post. What happened to each post is appended to `queue/<folder>/posts.jsonl` (no tokens) as the ad's record.

**The page.** A summary across the top (Needs you, Coming up, Posted, Accounts; each opens its list), the marks of the platforms you've connected, then three tabs. **Posts** lists every post with its platform's mark, account, ad, file, state and time, filtered to all, coming up, needing you or done; a post opens to its link and log, with Post now, Cancel and Clear where they apply. **Accounts** is a card per connected account, with its mark, handle, state and Disconnect. **Connect** is a tile per provider, with the marks of the platforms it reaches and whether it's set up; a tile opens its setup steps, numbered, beside its redirect URI and fields. The Publish dialog shows each account with its platform's mark too. The marks (`src/desk/social.tsx`) are Simple Icons' paths (CC0), copied in so the desk doesn't load the whole set; LinkedIn's, no longer in it, is drawn there, and Google Business Profile uses Google's "G".

**Your own apps.** Each platform posts through a developer app you register once, so your posts depend on no one else's approval and no client secret ships with nykma. The Publishing page shows each provider's setup steps, the redirect URI to register and its fields. For accounts you own, none of these needs a platform review:

| Provider | Gives | How it connects | Notes |
|---|---|---|---|
| YouTube | channels: videos and Shorts | your Google Cloud project's Desktop OAuth client | Resumable upload, `publishAt` scheduling, the cover, and `containsSyntheticMedia` and paid placement set on every upload. 100 uploads a day. Since 2026-11-02 an unverified project's uploads can be public. In Testing, Google ends the login every 7 days, so publish the app to In production |
| Meta | Facebook Pages, Instagram professional accounts | your Meta app in Development mode, with you holding a role on it | Instagram Reels and Stories by resumable upload (no public URL), Facebook Reels (9:16, up to 90 s) and videos, with Facebook's own scheduling. Instagram has none, so the desk posts at the time. Personal profiles can't be posted to. An Instagram account comes through the one Page it's linked to (Meta allows one), and any Page will do; a login that gives no Instagram account says whether the permissions or the link is missing |
| TikTok | your TikTok account | your TikTok developer app (Login Kit for Desktop, Content Posting API) | **Send to inbox** by default: the video lands in the TikTok app to finish there. **Direct Post** follows TikTok's composer rules (creator info, privacy with no default, interactions off by default, the commercial-content toggles, `is_aigc`), but until TikTok audits the app its posts are private, and a personal tool is unlikely to pass the audit |
| LinkedIn | your personal profile | your LinkedIn app with Sign In with LinkedIn using OpenID Connect and Share on LinkedIn | Videos API in 4 MB parts. No refresh: connect again every 60 days. Company Pages need LinkedIn's vetted Community Management API |
| X | your account | your X app, OAuth 2.0 with PKCE | Pay per use: $0.015 a post, $0.20 with a link. The dialog shows the price, and approving the post approves it |
| Tumblr | your blogs | your Tumblr app, OAuth 2 | Native scheduling (`queue` with `publish_on`). 20 videos and 60 minutes of video a day |
| Bluesky | your account | handle and an app password | Video through video.bsky.app, with link and hashtag facets |
| Mastodon | your account | instance and an access token from its Development settings | Native `scheduled_at`, and the instance's own limits |
| Telegram | a channel | a BotFather bot made an admin of it | Up to 50 MB through the hosted Bot API |
| Discord | a channel | its webhook URL | The server's upload cap |
| Upload-Post | whatever its profile has connected | its API key and profile name | Paid. Posts through its own audited apps, so TikTok posts can be public from the start, and Threads, Pinterest and Google Business work, which an app of your own can't do without reviews. It schedules too |

Logins come back to a callback server of the desk's own on a fixed port, `http://127.0.0.1:8723/callback` (`localhost` for Meta, LinkedIn and Tumblr; `NYKMA_CALLBACK_PORT` moves it). It runs only while a login waits, takes only a state it handed out in the last 15 minutes, and exchanges the code itself, so the token never reaches the page. It's separate from the desk because the desk's port can change, and a redirect URI has to match what you registered exactly. Tokens are refreshed before they run out, and every six hours for any that end within a week; a login that's gone marks the account **Connect again**.

**The dialog.** Pick accounts. Each gets a card with the MP4 (the ratio that suits the platform first), the cover, the title where there is one and the caption, from `post.md`'s section for that platform or its fallbacks (Threads takes Instagram's, Bluesky X's), with the platform's limit counted. A section that says the ad isn't for that platform shows as a warning. Then come the platform's own choices, and **Label it as AI-generated** where the API has one, on when the ad's `gen.json` has shots or its files say it's AI-generated. Every check that can fail before posting fails at approval: the caption's and title's length, the file's size and length, the account, the required choices and the provider's own rules (TikTok's). **Post by hand elsewhere** covers every platform with no account: copy the caption, show the file, open the upload page.

**When it posts.** Now, or at a time. Where the platform holds a scheduled post itself (YouTube, Facebook, Mastodon, Tumblr, Upload-Post) and the time is far enough ahead, the desk uploads at once and the platform posts it then, so the PC can be off. Everywhere else the desk checks for due posts every 15 seconds while it runs. A time that passed while it wasn't running waits as **Overdue** for you to post or cancel, so nothing posts hours late. A post the desk was in the middle of when it stopped is marked failed and not retried, since the platform may already have it. A 429 or a 5xx is retried after 1, 5 and 15 minutes; a refusal isn't. There's one clock per machine: a second desk leaves posting to the first, and a Vite config reload swaps the clock instead of starting another.

**`bun run publish`.** The same approval from a terminal or an agent's run, which is how an agent posts when you ask it to (ad-agent's hard rules, CLAUDE.md). Alone, it lists the connected accounts and the latest posts. `bun run publish <slug> --to facebook:mathbooklm,instagram --at "2026-11-23 18:00"` builds each post as the dialog would (the file whose ratio suits the platform, its cover, post.md's caption and title, each option's default, the AI label from the ad's files), prints them, and approves them; `--dry-run` only prints. `--to` takes an account's id, its platform when only one is connected, or its name; `--caption`, `--title`, `--file`, `--cover` and `--set key=value` override, and a required choice with no default (TikTok's privacy) must be set. A post made now is followed until it's out, with its link. `--status`, `--cancel`, `--now` and `--remove` do what the page's buttons do. The desk takes `approve` and `job` from it with the desk's token, which only a script on this machine has (`out/.desk.json`, or the run's environment), and each post's log says "Approved by bun run publish". Setting up a provider and connecting an account stay on the page, since a login is a browser window. `bun run eval` runs get no desk token, so an eval can't post.

**Not done.** Threads and Pinterest directly (Threads takes video only from a public URL, and Pinterest needs a Standard-access review), Snapchat (allowlist only), Reddit (approval, and no documented video upload), and WhatsApp Channels and Lemon8 (no API): those go through Upload-Post or the hand-off. Posting while the desk is off, for a platform with no scheduling of its own. What this doesn't stop: an agent can post wherever an account is connected, so ad-agent's rules and CLAUDE.md say it posts only when you ask, only where and when you said; the code doesn't know what you asked. Disconnect an account to keep agents off it.

### 10.13 Editing an ad's values from its preview (`scripts/lib/source-tag.ts`, `scripts/lib/source.ts`)

On the dev server, every host JSX element in `src/ads/` and `src/parts/` (a lowercase tag: `div`, `span`, `svg`, `path`) gets `data-nk="<file>:<line>:<col>"`, the repo path and the 1-based line and column of its `<` in the source, such as `data-nk="src/ads/kav-echad/end.tsx:30:13"`. An element whose attributes read knobs (`k("id")`, `nudge("id")`, `at("id")`, bare or as `t.k(`) also gets `data-nk-knobs="<id>,<id>"`. Components, fragments and member tags like `motion.div` get none. The tags come from a Vite plugin that runs only on the dev server (`apply: "serve"`), so `vite build`, and so every render and MP4, has none. A file that doesn't parse is passed on untouched.

The desk sends a tag back to read and change that element:

- `GET /api/source/element?loc=[&text=…][&slug=]` gives the element's tag, its component (the nearest named function), the file's hash, and its lists. **Text** is editable when the element holds one piece of text or one string literal. **Style** has a field per property of a `style={{ ... }}` literal, and `styleMode` says whether properties can be added (`object`, `none` for no style yet, or `other` for `style={s}` or spread props). **Props** has the other attributes, leaving out `data-*`, `key`, `ref`, `children` and event handlers; **attrs** has the `data-*` ones but `data-nk`. A field is editable when its value is a plain literal: a number (or minus one), a string or a template with no `${}`. Anything else is shown as its code.
- **Where the text is written.** The desk sends what the element shows, and its parents' text, as repeated `text=` (up to 6). The desk searches the string literals of the ad's folder (strings, plain templates, JSX text and attribute strings, leaving out imports, object keys, types, class names, style values and the like), comparing without bidi marks, zero-width characters or extra spaces, and answers `texts`: up to 6 literals, best first, each with its `loc`, file, line, value, file hash and whether it matched `exact`ly or `contains` the text. That finds a `{title}`, a `LINES[i]`, a prop the parent passes, or a line split into word spans. `slug=` lets an element the parts bin draws find its text in the ad.
- `POST /api/source/edit { loc, hash, edit, label? }` replaces that one literal and nothing else, so the file's line endings, Hebrew and comments stay as they were. `edit` is `{ kind: "text", value }`, `{ kind: "literal", value }` (the request's `loc` and `hash` are one of `texts`; the value is escaped for that literal's quotes, or becomes `{"…"}` in JSX when it needs to), `{ kind: "style", name, value }` (adds the property when it's missing, as the object's last or as a new `style={{ … }}`; `null` takes it out), `{ kind: "prop", name, value }` or `{ kind: "attr", name, value }` (a `data-*` attribute set, replaced or taken out with `null`). Numbers are rounded to 4 decimals. A file that changed since it was read answers 409 with its new hash, and an edit that would break the file isn't written. Only `src/ads/` is editable: `src/parts/` is shared by every ad, so the desk sends you to the agent for it.
- **History** (`scripts/lib/history.ts`). Every write the desk makes to an ad, through `/api/source/edit`, `/api/tune` or `/api/story` (all take an optional `label`), is one entry: what each file was before and after (only the changed stretch, with hashes of the whole). Two writes to the same thing within 2 seconds merge into one ("Size 80 → 96" then "96 → 100" reads "80 → 100"). `GET /api/history?slug=` gives `{ entries, position }` (oldest first, `position` the number applied); `POST /api/history/undo`, `/redo` and `/goto { slug, position }` move through it, 0 being before every entry. A move checks every file first and refuses with 409, naming the file, when the agent or an editor changed it since: nothing is overwritten. Undoing a write that made a file (a new `tune.json`) deletes it. A new change after an undo drops what was undone. It's kept in `out/<slug>/desk-history.json` (gitignored, the last 200), so it survives a restart. `POST /api/source/undo { slug }` is the same as undo.

Both POSTs answer only the desk page itself (`sameOrigin` in desk.ts), like its other actions. Vite's hot reload shows the change.

**The Inspect tab** (`src/desk/Inspector.tsx`) is what you see of this. With **Select** on, the viewer outlines the tagged element under the pointer, and a click selects it: the viewer asks the iframe for the element (`board.html` answers with its tag, text, box, font, colour, a few computed values, its parents' scale and the tagged elements around it with their text, which become a breadcrumb), and the inspector reads its code. Its sections fold:

- **Text:** the words, in a box. When the element holds them itself they're edited there; when they come from a constant, a list or a prop the parent passes, the desk finds where the ad writes them (the `texts` above) and edits that literal, saying which file and line, with **Not this one?** when there are several. A word that's part of a longer line shows the whole line. Text the code puts together goes to the agent.
- **Layout:** X, Y, Scale and Rotate, written as the element's own `translate`, `scale` and `rotate` style (added when the code has none), or its nudge knob when it has one. **Reset position** takes them out. Dragging in the viewer writes the same values (§10.3).
- **Type** (for text) and **Appearance:** size, weight, colour, spacing, line height, alignment, opacity, background and corners. A value the code writes plainly is edited in place; one it doesn't set yet shows the browser's value greyed and is added on save; one the code works out shows as `ƒ` and its code, and a click asks the agent.
- **Effects:** a line about the element's effects and a button to the Effects tab.
- **More from the code:** every other style literal, the computed ones as their code, and the attributes.
- **Knobs:** values the element reads with `useTune()` (§5), written to `tune.json` by `/api/tune`, for every ratio or this one only, while the code's own motion keeps playing.

A number field's label can be dragged sideways (Shift: ten times, Alt: a tenth) and its arrow keys step it; the frames show the value live (a `preview` message to `board.html`, which sets it on the element and puts the old value back if you press Escape), and it's saved once, on release or Enter. A colour swatch opens the picker, live while it's open. Every save is one entry in the history. An element drawn by the parts bin is shown but not edited. With nothing picked, the inspector shows the video; with a scene picked on the timeline, its length, trim, transition, picture and sound.

**The Effects tab** (`src/desk/Effects.tsx`). For a picked element: an **Entrance**, a **Loop** and an **Exit**, each a grid of tiles that play the effect with the engine's own maths when you hover them, then its start (**Here** takes the playhead's frame in that scene), length, strength and easing. It's written to the element's `data-fx` attribute in the ad's code (§5), so the render draws exactly what the viewer does. For a scene (picked on the timeline, or the one under the playhead): the **transition into it** from the scene before, a tile per type previewed the same way, and its length, written to `story.json`'s `transitions` (§10.4).

**The History tab** (`src/desk/History.tsx`) lists every change the desk made to the ad, newest first, labelled in words ("Size 80 → 96", "Moved "the lasso"", "Fade up in on h1"), with what kind it was (code, knob, timeline) and when. Click one to go back to just after it; the ones above it stay, crossed out, until you make a new change, so you can come forward again. **Reset all** goes back to before the first change listed. Undo and Redo in the top bar and Ctrl+Z / Ctrl+Shift+Z step through the same list.

### 10.14 Adding elements (`src/desk/AddPanel.tsx`, `addElement` in `scripts/lib/source.ts`)

The left panel's **Add** tab holds things to drop onto the video. Drag a tile onto a frame in the viewer (a ring shows where it lands) or click it to put it in the middle. It goes into the scene under the playhead, at the playhead.

- **In this ad's style:** **Heading**, **Text**, **Label** (text on a pill) and **Box**. They take the ad's look from the frame under the playhead: `board.html` answers a `sample` message with its biggest text's font, weight, colour and spacing, the most saturated fill (the box) and the lightest one (the label's pill). A heading takes that text's size within 64–160 px, body text half of it within 40–84.
- **Made for this ad:** the ad's ready-made elements, from `export const elements = [{ id, name, component, hint?, props }]` in `src/ads/<slug>/elements.tsx`, read from the code without running it (`GET /api/elements?slug=`). The agent writes them when it builds an ad (`.claude/guides/build.md`): a few pieces of the ad in its look, each a plain component whose props are the values a user would change, the text first. An ad without them offers **Ask the agent to make some**.

**How it's written** (`POST /api/source/add`). The desk finds the scene's component (`{ id: "<scene>", component: X }` in the ad's folder, through one relative import, or the registry's `component` for an ad with one) and the JSX it returns last, and adds the new element as that JSX's last child, on its own line, so it draws on top. A scene that returns one element with no children (`=> <Part start={…} />`) gets it wrapped in a fragment, `<>…</>`, with the new element beside it; one that returns a condition or a value is the agent's to change. The element is a `div` with `position: absolute`, `left` and `top` in percent of the frame (so each ratio places it the same way), `transform: translate(-50%, -50%)` to centre it there, and `zIndex: 50`. Text and labels carry their font, size, weight and colour as literals and `dir="rtl"` in a right-to-left ad; a ready-made element is a wrapper around `<Component prop="…" />`, imported from `./elements`. Its `data-fx` fades it in just before the playhead and out two seconds later, or not at all when the scene ends within two and a half seconds. If its parent isn't the whole frame and it lands more than 3 px off the drop point, one `translate` puts it back. It's one entry in the history.

Once added, it's an element of the ad like any other: it's selected, its text field takes focus, and the inspector, a drag, the Effects tab and undo all work on it. A ready-made element's props show as **Parameters** (a `param` edit changes one). **Remove element**, or Delete, takes the selected element out of the code (a `remove` edit), for any element that's a child in JSX; one the code uses as a value, in a condition or a list, is the agent's to change.

### 10.15 The Layers tab (`src/desk/LayersPanel.tsx`)

The left panel's **Layers** tab lists every selectable element (every tagged one, §10.13) on the frame under the playhead, in the ratio shown, in the order the page draws them and indented by how deep each sits among them. A row shows a thumbnail, the tag and the element's own text, or its file and line when it has none. The thumbnail is what the element itself shows: its fill (colour, gradient or background image, with its corners), its `<img>` or its `<svg>` (as a data URL, up to 30 per frame), and the first two letters of its text in its colour and weight; a container with none of those gets a map of the frame in its shape with the element's box in it; one drawn in a list is one row with ×n. A click selects it as a click in the viewer would (`pickLoc` to `board.html`), so an element behind another, see-through or too small to hit is one row away; hovering a row outlines it in the viewer, and the selection's row stays in view. Elements that don't show on this frame (opacity 0, hidden, off the frame) are left out unless **Show hidden** is on; inside an `<svg>` only the svg is listed, and `<style>` never. The list is read when the playhead stops and every 1.5 s while the tab is open, so changes from the agent or a hot reload show too.

The left panel's five tabs (Scenes, Layers, Add, Media, Files) show their icons, with the open tab's name beside its icon.

## 11. Commands

```bash
bun install && bunx playwright install chromium
py -3.13 -m venv .venv && .venv/Scripts/python -m pip install -r py/requirements.txt   # audio/Blender (optional)
python3.13 -m venv .venv && .venv/bin/python -m pip install -r py/requirements.txt     # the same on a Mac

bun run dev                                    # the desk, at / (the old scrubbing preview is at /index.html)
bun run animatic <slug>                        # pitch slideshow from pitch.md (free)
bun run stills <id> --frames 0,90,240 [--ratio all] [--sheet]   # --sheet: one labelled image of the frames
bun run stills <id> --ratio all --thumbnail    # the ad's cover image, to look at (§7.5)
bun run sheet <id>
bun run render <id> [--ratio all] [--pages 4]
bun run review <slug> [--frames 240,412 | --frames +240,412] [--dry-run]   # reviewer agent on stills → queue/<slug>/review.md
bun run validate <id> [--brand <brand>]        # free checks → queue/<slug>/validate.md
bun run validate <id> --layout                 # Layout and Hebrew only, from the code, no render → out/<slug>/layout.md
bun run claims <slug>                          # the pitch's claims against brand.md → queue/<slug>/claims.md (about $0.10)
bun run stamp [<brand>] / --report             # the instructions an ad is made with; every ad by its instructions and results
bun run hand <slug> [--force] / bun run hand:check <slug>
bun run footage <slug> [<clip> ...] [--fps 60] [--force]   # real footage → frames, sound and a contact sheet (§6.5)
bun run footage <slug> <url> --own                         # one of the brand's own videos, through yt-dlp (§6.5)
bun run take <slug> <take> [--mic <file>] [--script <file>] [--lang he]   # cuts a talking-head take: retakes, pauses, voice, face (§6.11)
bun run take <slug> [--verify] [--fresh]                   # cuts again from cut.json (seconds); --verify hears the cut again
bun run brand-check <brand>
bun run history <brand>                        # a brand's past ideas and the user's notes for it (free, §8)
bun run eval <version|current> [--briefs a,b] [--runs 2] [--label name] [--build]   # a prompt version on the briefs, to the pitch or the MP4 (spends tokens, §8.1)
bun run eval compare <a> <b> / trace <label>                                    # how two versions worked side by side; traces rebuilt (free)
bun run eval snapshot <name> / blind <a> <b> / score <a> <b>              # freeze a version, a blind sheet, its tally (free)
bun run publish [<slug> --to <account>,... [--at <time>] [--dry-run]]   # posts through the desk; alone, accounts and posts (§10.12)
bun run export-public [--to <dir>] [--dry-run]  # the public part of the repo → ../nykma-public, from publish.json (free, §12)
bun run typecheck
.venv/Scripts/python py/mv.py voices [--json] [--id <voice id>]  # the account's ElevenLabs voices, or one (free)
bun run gen <slug> --estimate                  # generated media in gen.json, priced (free, §6.6)
bun run gen <slug> [--only id,id]              # makes them within the budget approved on the desk
bun run screen <slug> <clip> [--corners "x,y x,y x,y x,y"]   # a screen in a clip, for <ScreenInsert> (§6.7)
bun run stock <slug> "query" [--video|--photo] [--ratio 9x16] [--min-seconds 4] [--source pexels|pixabay]   # free stock, a numbered sheet (§6.8)
bun run stock <slug> --take pexels:12345 [--name <clip>] [--ratio 1x1,9x16|all]   # downloads one to stock/; a clip is unpacked
bun run stock <slug>                           # downloads the stock in sources.json again after a clone
bun run local:setup                            # video on this PC: ComfyUI, the ComfyUI-GGUF add-on and LTX-2.5 in ~/nykma-local, about 61 GB (§6.9)
.venv/Scripts/python py/mv.py build <slug> [--estimate] [--test-line [voice]]
.venv/Scripts/python py/mv.py words <audio> [--lang he] [--text "..."]   # Whisper word times → words.json beside it
.venv/Scripts/python py/mv.py blender <slug> --scene <file> [--preview --frames …] [--layer] [--video] [--ratio 1x1|9x16]
```

**Setup:**

- **Keys** go in on the desk's Settings page, under Connections (§10.10). `.env.example` still lists the two settings, `ELEVENLABS_API_KEY` and `BLENDER`. Both are optional, and an empty one is ignored.
- **ElevenLabs key:** copy `.env.example` to `.env.local` and paste the key in, or run `npx -y @elevenlabs/cli@latest onboard init`. `mv.py` reads `.env.local`, then `.env`, then the environment, takes only that one line and never prints it. Those files are gitignored, and the agent never opens them.
- **Blender:** found through `BLENDER` (the environment, then `.env.local`, then `.env`), then `PATH`, then `/Applications/Blender.app` (or `~/Applications/`), then the newest install in `C:\Program Files\Blender Foundation\` or `%LOCALAPPDATA%\Programs\`.
- **On a Mac** the Python is `.venv/bin/python` wherever these docs say `.venv/Scripts/python`. Blender 5 has no Intel Mac build, so an Intel Mac uses Blender 4.5 LTS (fixed until July 2027). `kit.py` handles the names the two differ in: the EEVEE engine id and the compositor (a node group in 5, the scene's own tree ending in a Composite node in 4.5). `py/requirements.txt` holds `numba` and `llvmlite` back on Intel Macs, where their newest versions have no wheels, and holds PyAV below 19 everywhere, because faster-whisper 1.2 passes an argument PyAV 19 removed.
- **A fresh clone** works without any of this. `gen/` is gitignored, so `py-demo` has no length until `mv.py build` has run, and every other ad works as it is.

---

## 12. Going public (`publish.json`, `scripts/export-public.ts`, nobodyknowsmyapp.com)

nykma is source-available: free for personal and noncommercial use under PolyForm Noncommercial 1.0.0 (`LICENSE`), and every company pays for a commercial licence (`COMMERCIAL.md`). There's no payment processor: a company contacts sales, through the form at nobodyknowsmyapp.com/pricing or sales@nobodyknowsmyapp.com, and gets a price by email. Contributors agree to `.github/CLA.md` through a bot, so their code can go into both. It isn't called open source, because that means commercial use is free.

- **New ads stay on this machine.** The ads the private repo already tracks stay in it, and the public repo gets the ones `publish.json` lists, as before. Every ad made from now on is the user's own and is never committed or exported: `.gitignore` leaves out new folders under `src/ads/`, `public/ads/` and `queue/` (not `queue/_template/`), and a new ad's registry line goes in `src/ads/local.ts`, which is gitignored too. `src/registry.ts` adds that file's `ads` after its own through `import.meta.glob`, so a clone or the public export, which have no `local.ts`, build without it. `src/ads/local.example.ts` is the file to start from. A new file in an ad the repo already tracks (like an `elements.tsx`) is ignored as well.
- **The README's showcase** lives in `docs/media/`: `nykma-showcase.mp4` (a 70-second tour), `nykma-showcase.gif` (its 20-second loop at the top of the README, linked to the MP4) and stills of public ads. It's cut from the renders of ads `publish.json` lists and a recording of the desk run from the public export, so no private brand or project shows. GitHub plays an MP4 inline only when it's uploaded through its web editor; the GIF is what plays in the README as it is.
- **This repo stays private** (`TomCohenDev/nykma-private`). It holds client brands, `queue/` and research. The public repo, `TomCohenDev/nykma`, is a separate one with its own history, filled by `bun run export-public`, never by pushing this one. To publish: export, then commit and push in `../nykma-public`, whose commits use the GitHub no-reply address. Its `main` can't be force-pushed or deleted, and it has secret scanning with push protection and private vulnerability reporting.
- **`publish.json` is an allowlist.** It names the brands and ads that go public and the folders that never do. A new brand or ad stays private until it's added there. Public brands lose `notes.md` and `sources.txt` (the user's feedback and local paths). The registry is rewritten to the listed ads.
- **The examples on the home page** are listed in `site/src/examples.json` (title, brand, language, one line, and a poster time when frame 0 isn't a good still). `node site/scripts/examples.mjs` makes them from the ads' 1:1 hand-offs in `queue/`: 720 px MP4s with sound (1 to 7 MB each, under Workers' 25 MB file limit) and JPEG posters in `site/public/examples/`. Only ads from public brands belong there. Spec ads for well-known products (made without the company, labelled as such on the card and the end card) are listed in `site/src/spec-ads.json` and shown in a sideways-scrolling row at their own shapes. Each plays muted while it's on screen, "sound on" plays one with sound, and with reduced motion none plays by itself.
- **The export stops** when an exported text file matches `blocked` (a client's name, a local path), when code still uses an unlisted ad, or when a file is over 50 MB. Docs that only name an unlisted ad are a warning. It writes `../nykma-public` (or `--to`), drops everything there but `.git`, and never commits or pushes.
- **nobodyknowsmyapp.com** is the site: tutorials, a showcase of public brands' ads, the docs, the changelog and pricing. It's English, and says that ads can be in Hebrew. The domain, nobodyknowsmyapp.com (nykma for short), is on Cloudflare, with Email Routing forwarding sales@ to the user's inbox.
- **The site lives in `site/`** (`site/README.md`): a static Astro build served by a Cloudflare Worker. So far it has a home page, with three example ads, and `/pricing`, whose sales form posts to `/api/contact`. The Worker checks the fields, ignores bots that fill a hidden field, and mails the request from form@nobodyknowsmyapp.com to the sales inbox through Email Routing, with the sender as Reply-To. The inbox's address is a Worker secret (`SALES_TO`), so it's not in the public repo. Without JavaScript the form still posts, and lands on `/pricing/sent/` or `/pricing/not-sent/`. For now the Worker runs on its workers.dev preview: the domain itself still has other DNS records and a Cloudflare Access login in front of it, which have to go before `site/wrangler.jsonc` can attach it.

## 13. Later, only if it's needed

- Dragging an element in the viewer to move it, writing a `nudge` knob.
- Comments pinned on a frame and a spot, spoken or typed, collected and sent to the agent as one note (the screening room in `design/redesign/`).
- A text track on the timeline, from `inspect()`, and transitions between scenes.
- Takes side by side in the viewer, swapped in place on the timeline.
- An in-browser pad for recording real handwriting, with its timing.
- Blender curves that write on from `hand.gen.json` (chalk on a 3D board).
- Post-processing (bloom and the like) in `<Three>` (§6.10).
- Streaming frames straight into ffmpeg for faster renders.
- A transparent WebM or MOV from `render`, for an overlay another editor puts on top (an idea from HyperFrames, §10.9).

## 14. Open questions

- Should the pitch be the default, or only for ads above a certain size?
- Should the ads made before the desk be split into scenes, or stay one scene each?
- When a new order or a trim makes a story longer or shorter than the platform's limit, should the timeline warn?
