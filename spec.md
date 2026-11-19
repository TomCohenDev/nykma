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
- Editing tools on the board (text, shapes, properties) for now. The agent makes the scenes, and the board shows and arranges them (§10.3).
- A multi-agent pipeline (brand analyst → copywriter → scene composer → QA). One agent makes the whole ad, and the reviewer only suggests adjustments.
- Schemas or contracts for ads, storyboards or brands. Markdown and code are enough.
- AI-generated images or footage *instead of* code. Every ad is still built in code (React, SVG, Blender). Generated stills and clips are an addition for what code can't make well, such as a real-looking person reacting or the world an idea lives in (§6.6), never the product's UI, the brand or a claim.
- Auto-posting. Ads land in `queue/` for you. 

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
├─ desk.html, board.html     # the desk, and one scene for its board (§10.3), dev server only
├─ src/
│  ├─ engine/                # useFrame, Sequence, Stage, Plate, the page API for capture (§5)
│  ├─ desk/                  # the desk (bun run dev): dashboard, board, chat (§10)
│  ├─ board/                 # one scene alone, for the board's iframes (§10.3)
│  ├─ preview/               # scrub/play page (/ on the dev server)
│  ├─ parts/                 # the parts bin (§6): reuse, copy, change or ignore
│  ├─ ads/<slug>/            # one folder per ad, structured however the ad needs, plus story.json (§10.4)
│  └─ registry.ts            # one line per ad: id, scenes or component, fps, length, sizes
├─ brands/<brand>/           # saved brand kit (§9), uploads/ for files given in the desk
├─ py/                       # audio pipeline + Blender helpers, ported from mathbooklm-ad/mv (§6.3)
├─ scripts/                  # render, stills, sheet, animatic, review, validate, hand-trace, brand-check, history, eval, audio/*.mjs
├─ public/                   # shared sfx, fonts; public/ads/<slug>/ for an ad's audio, images and copied brand files; gen/ inside it is gitignored
├─ queue/_template/          # the pitch.md, README.md and post.md every ad starts from
├─ queue/<date>-<slug>/      # hand-off (§7.4): pitch.md, README.md, post.md, review.md, validate.md, renders (mp4s gitignored)
└─ out/                      # scratch renders and stills (gitignored)
```

---

## 5. The engine (no Remotion)

Small enough to read in one sitting:

- **In the page:** `useFrame()`, `useVideo()` (fps, length, size), and `<Sequence from duration>` to shift time for a scene. `<Stage>` mounts an ad at its exact output size. `window.nykma.seek(frame)` resolves once React has committed, fonts are ready and images have decoded. `window.nykma.inspect()` returns the visible text on the current frame, with each element's box, font, size and colour, for the validators.
- **Desk:** `bun run dev` opens the desk, the UI for the whole flow (§10).
- **Scenes:** an ad can list its scenes instead of one component, and `story.json` sets their order (§10.4). An ad with one `component` is one scene.
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
  - `--layer` renders PNG plates for a composition to show with `<Plate>`. The dev server doesn't watch `gen/`, because plates can run to gigabytes, so it reads `/ads/<slug>/gen/` from disk on each request. That way plates rendered while it runs show on the board and in the preview without a restart. They're straight-alpha RGBA: `kit.compositor` puts the alpha back after bloom (the render's own, or the glow's brightness past an object's edge), so the page shows through and the glow still lands on it.
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
- **Dropped on the board:** a clip dropped on a project's board is uploaded, unpacked and placed as a scene (§10.3).
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
- The renderer has a pixel ratio of 1, antialiasing, sRGB output and `preserveDrawingBuffer`. The canvas is the video's size by default, so each ratio moves its camera rather than shrinking the scene. Text a viewer reads stays DOM on top, because words drawn in WebGL are invisible to Layout, Truth and the Hebrew checks.
- It's imported on its own (`../../parts/Three`), so ads without 3D don't load three.js.
- **Tested** with `three-demo` (64 seeded cubes settling into a cube under a DOM headline, 1:1 and 9:16): headless Chromium renders WebGL here, and `validate` passes, including the re-render of random frames on fresh pages. Post-processing through `EffectComposer` isn't wired in yet.

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
you: "check it" ─▶ reviewer ─▶ adjust ─▶ re-render ─▶ validate (free) ─▶ queue/<date>-<slug>/
you: "skip the checks" ─▶ queue/<date>-<slug>/, marked unchecked
you: "drop it" ─▶ stops, nothing more is spent
```

### 7.1 Pitch first (`queue/<date>-<slug>/pitch.md`)

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

Then `bun run animatic <slug>` turns the table into a slideshow MP4 for free (no tokens, a few seconds):

- each row's image is shown for its time, with a slow push-in
- the on-screen text is set as captions, in the brand font
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

**First look: the agent stops again.** It runs `bun run validate <slug> --layout` first (the Layout and Hebrew checks only, straight from the code with no render, free and a few seconds, written to `out/<slug>/layout.md`) and fixes what fails: text over text, outside the safe area, too small for a phone. Then it renders every ratio, copies the MP4s to `queue/<date>-<slug>/`, and replies with their paths. That layout pass is the agent's own look, not the checks: neither the reviewer nor the full validators have run. You watch the real ad before any time goes into checking it, because checks are wasted on an ad you'd change or drop. You answer with one of:

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

Where the lines fall:

- **Layout:** a problem held for 0.75 s or more fails, and a shorter one warns, because it's a moment in a move. In 9x16, text under 32 px fails and under 40 px warns. Safe areas in 9x16 keep clear 200 px at the top, 120 px on the right, 320 px at the bottom and 60 px on the left, for the app's own UI.
- **Frozen picture:** 2 s warns and 3 s fails. Up to 6 s is allowed at the very end, because that's an end card.
- **Sound:** music not faded by the end only warns, because a hard stop can be the joke.
- **Numbers:** a bare number that isn't in the facts warns. A price, a percentage, `10k`, `3x` or `500+` fails.
- **Re-render:** three random frames are drawn on two fresh pages, in opposite orders. A frame fails when 256 or more pixels differ by more than 48 levels out of 255. Bytes can't be the test: even with `--disable-partial-raster`, Chromium's anti-aliasing of moving or scaled text and shapes shifts a little with what the page drew before. On the demo ads about 1% of frames differ, nearly always by under 10 pixels past that line and once by 84, and a stray `Math.random()` on 24 small dots gave 1250 to 1580.

Failures must be fixed before the hand-off. Warnings are listed in the README for you.

A failure in Render, Layout or Brand can be the idea rather than a mistake, like a deliberate freeze or type that bleeds off the frame. A `Deliberate: layout 120-300 <why>` line in the queue README, with the area and the frames, turns that failure into a warning that shows the reason. Sound, Truth and Copy can't be waived.

You can run either check yourself at any time, on any ad.

### 7.4 Hand-off (`queue/<date>-<slug>/`), as in mathbooklm's `marketing/queue/`

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
- **Hard rules**, first because they hold over everything: publishing is the user's, spend only what's approved, claims are true, rights, keys stay closed, say only what happened. Each says where code backs it: the desk denies `gh`, `git push`, `curl`, `.env` and the key store (§10.10), holds the generated-media budget (§6.6), and `validate` checks the truth, numbers and UTMs (§7.3). A prompt can't make a model obey perfectly, so the limits that matter most are enforced outside it.
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

**`CLAUDE.md`** holds what every session needs, agent or not: the commands, the code rules (every value a function of the frame, no `import` from `gen/`, the board's `story.json`), the limits, and how to change nykma. Making an ad points to `ad-agent.md`, which owns that workflow, so each rule has one owner.

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

`bun run dev` opens the desk, a Figma-style app over the same files and the same agent. Everything in §7 and §9 can be done from it without a terminal. It adds no flow of its own: a button sends the agent the words you'd type.

It has two places: the **dashboard**, with projects and brand kits, and a **project**, with the board in the middle and the chat on the right.

### 10.1 Dashboard

A left rail with **Projects** and **Brand kits**, and a grid of cards on the right, like Figma's file browser.

- **Projects.** A project is one video or one asset (§10.5). Each card shows the render, which plays on hover, or else the stills, the animatic, a storyboard image or the live middle scene. Then the name, brand, state and date. The state is read from the files, as before: **Pitch**, **First look**, **Checked** (`validate.md` exists), **Ready** (`post.md` exists) or **Dropped** (`Dropped` at the top of the README). An ad in the registry with no queue folder, like the demos, is **In code**. You can filter by brand and state.
- **New project** is AI-first: one prompt box ("what's the ad about?"), a brand picker, Video / Asset, the layouts (1:1 unless you pick more) and **Pitch first**. The last two start from the settings (§10.8) and change only this ad. Sending it opens the project with the chat already running. The agent picks the slug and makes the queue folder as usual.
- **Brand kits.** Each card shows the logo on the kit's first colour, the palette as swatches and the font names.
- **New brand kit** has three ways in, and each one opens a chat with the agent to make the kit (§9):
  - **From a local repo:** paste a path.
  - **From a URL.**
  - **Upload files:** drop logos, fonts, screenshots or a PDF. They're saved to `brands/<brand>/uploads/` and listed in `sources.txt`.
- **A brand kit page** renders `brand.md`: colour swatches with hex (click to copy), font specimens set in the kit's own files with their licences, logos, tagline, URL, tone, facts, banned claims and sources. **Check sources** runs `brand-check` and shows what changed. It's a button rather than automatic, because it fetches every URL source and records hashes. The chat sits on the right for "refresh the colours" and the like. **Edit brand.md** opens it as text, and your edits win, as in §9.

### 10.2 A project

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ‹ Projects  achuzim · First look   16:9 1:1 9:16 All   ▶ Play  Render  62% │
├────────────┬──────────────────────────────────────────┬──────────────────┤
│ Scenes     │                                          │ Chat             │
│ 1 hook     │   ┌──────┐     ┌──────┐     ┌──────┐     │                  │
│ 2 demo     │   │ hook │ ──▶ │ demo │ ──▶ │ end  │     │  agent messages  │
│ 3 end      │   └──────┘     └──────┘     └──────┘     │  tool steps      │
│ ── off ──  │                                          │                  │
│ alt-hook   │        ┌──────────┐                      │ [Check it] [Skip │
│            │        │ alt-hook │  (dimmed)            │  the checks] ... │
│ Files      │        └──────────┘                      │ ┌──────────────┐ │
│ pitch.md   │                                          │ │ @demo  note… │ │
│ README.md  │        [ V  H  ↗  ⤢ ]                    │ └──────────────┘ │
└────────────┴──────────────────────────────────────────┴──────────────────┘
```

- **Top bar:** back to the dashboard, the project name, brand and state, the ratio switch (16:9, 1:1, 9:16, or All), **Play** (the whole story in an overlay player with the scrubber, the sound and the frame in the URL), **Render** (every ratio, the same as the first look), and the zoom level.
- **Left panel:** the scenes in story order with their numbers, then the ones off the story. Below them are the project's files (`pitch.md`, `README.md`, `post.md`, `review.md`, `validate.md` and the renders), each opening in a reader. Clicking a scene centres it on the board.
- **Board (middle):** §10.3.
- **Chat (right):** §10.6.

### 10.3 The board

An infinite canvas, like a Figma page, where each scene of the ad is a frame. They're called **scenes** here because "frame" already means one video frame.

- **Pan and zoom:** scroll or drag with space held, the middle button or the Hand tool (H). Zoom with Ctrl+wheel, a pinch, + and −, from 2% to 400% (a row of 1920 px scenes needs far below 10% to fit). Shift+1 fits everything, Shift+2 fits the selection, and Shift+0 is 100%.
- **A scene** is drawn at its real pixel size for the chosen ratio, with its name and length above it (`hook · 3.0 s`) and its story number in a badge. It's the real component through the engine, not a picture: each is `board.html?id=…&scene=…` in an iframe, so a broken scene shows its error on its own frame and the rest of the desk carries on. Each scene opens on its middle frame. The selected one has a scrubber under it and plays in place (K). Scenes well off screen, or too small to read, unload, so a big board stays fast.
- **All ratios:** each scene shows as three frames side by side, 16:9, 1:1 and 9:16, so each layout is seen in its own shape (Goal 8).
- **Live:** when the agent edits a scene, Vite's hot reload redraws it on the board. When it adds one, the new scene lands to the right of the last, or in the row below if it's off the story. Writing `story.json` doesn't reload the scenes: the module that reads it accepts its own updates.
- **Right-click** a scene for **Start here**, **Ask about this scene**, **Zoom to scene** and **Remove its arrows**.
- **Your own video clips:** drop a clip (MOV, MP4, M4V, WebM, MKV or AVI, up to 4 GB) on the board, or add it with the image button (I). It goes to `public/ads/<slug>/footage/` and is unpacked to frames (§6.5) while the board says so, which takes a while for a long or 4K clip. Then it's a scene like an image: off the story until an arrow takes it in. On the board it shows the frame under its scrubber, cropped for each shape, and it plays in place (K). In the video it plays from the start to its end with its own sound. Right-click it for **Shown for** (shorter than the clip, or **All**), **Picture** (Fill or Fit) and **Sound** (On or Off). Trims inside a clip, slow motion and framing per shape are for the agent, through `<Footage>`.
- **Your own images:** drop image files on the board, paste one (Ctrl+V), or press the image button (I). Each is uploaded to `public/ads/<slug>/board/`, because the video reads only `public/`, and lands where it was dropped, or in the first free spot below the middle of the view. It starts off the story, so nothing changes until you draw an arrow to or from it. Then it's a scene like the others: it plays as a still, the same picture in every ratio. Right-click it to set **Shown for** (1, 2, 3, 5 or 8 s, 2 by default) and **Picture**: **Fill** crops the picture to the frame, and **Fit** shows all of it on black. **Take off the board** (or Delete) removes it and closes the gap in the story, so A → image → B becomes A → B. The file stays in `public/`. It works on any ad in the registry, including one with a single component. The pitch board doesn't take images, because there's no ad yet.
- **Selecting** scenes (click, Shift+click, or drag a box) attaches them to your next chat message (§10.6).
- **Bottom toolbar:** Move (V), Hand (H), Arrow (A), Add image (I), Auto layout (L) and Fit. There are no tools for making or editing anything yet. The agent makes the scenes, and the board shows and arranges them, along with the images you add.
- **Layout:** you can drag scenes anywhere. Their places on the board are saved in `story.json` and have no effect on the video.
- **Auto layout (L):** puts the story in one row in the order it plays, each chain off the story in a row below it, and scenes with no arrows in a last row, then fits the view. Only the places change, so the video doesn't.

### 10.4 The story: arrows between scenes

Arrows between scenes are the story. The video plays the scenes in the order the arrows go.

- **Drawing one:** drag from the handle on a scene's edge, or use the Arrow tool (A) and drag from anywhere on a scene, onto another scene. The arrow turns green over a scene it can go to and red over one that would make a loop.
- **How they're drawn:** side to side when nothing is in the way. An arrow that would cross another scene arcs over the top, and one that runs backwards loops under the bottom, so the order reads at a glance. Arrows between scenes off the story are grey and dashed.
- **Example:** with scenes 1, 2 and 3, an arrow from 1 to 3 and another from 3 to 2 make a video that plays 1, then 3, then 2.
- **The start** is the scene with an outgoing arrow and none coming in. Right-click a scene → **Start here** to choose when there's more than one chain. A board with no arrows plays only the start scene.
- **One way through:** each scene has at most one arrow out and one in. Dragging a second arrow out of a scene replaces the first. An arrow that would close a loop isn't allowed, and the cursor shows it.
- **Off the story:** scenes that the chain doesn't reach stay on the board, dimmed, and aren't in the video. That's where an alternative opening or a cut scene waits.
- **Removing one:** click it and press Delete, or right-click a scene → **Remove its arrows**. Cutting the arrow out of the start makes the scene it pointed at the start, so the rest of the story still plays.
- **One story for every ratio.** The arrows are drawn once and apply to 16:9, 1:1 and 9:16.

**The file:** `src/ads/<slug>/story.json` holds the order and the board places:

```json
{ "order": ["hook", "demo", "end"], "board": { "hook": [0, 0], "demo": [2200, 0], "end": [4400, 0], "alt-hook": [0, 1400] } }
```

Images added on the board are listed under `images`, by id, and their ids go in `order`, `arrows` and `board` like any scene's:

```json
"images": { "image-team-photo": { "src": "ads/launch/board/team-photo.png", "name": "team photo", "seconds": 3, "fit": "contain" } }
```

A video clip on the board is listed there too, with `src` pointing at its frames and `clip` saying how to play them:

```json
"clip-trail-run": { "src": "ads/launch/gen/footage/trail-run/#####.jpg", "name": "trail run",
  "clip": { "fps": 59.94, "frames": 412, "from": 1.5, "sound": "ads/launch/gen/footage/trail-run/audio.wav", "volume": 0 } }
```

`from` (seconds into the clip) and `volume` (0 is muted) are optional. Without `seconds` a clip plays to its end.

The agent writes it with the order it intends, and the board rewrites it when you change an arrow. A take can have its own story as `story-<take>.json`, so take B can be the same scenes in another order. The registry reads it with `import.meta.glob`, so a missing file never breaks an ad. Without one, the order is the registry's.

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
- **An ad timed by audio** takes each scene's length from its timeline. Reordering it puts the voice out of order, so the board shows a warning, and the agent asks before it spends credits on a new mix.
- **An ad with one `component`** is one scene with no arrows. The ads made before the desk work as they are. Once you add an image to its board, the component is a scene named after the ad, and its `cues` move with it: an image before it pushes its sound later too.
- **Board images** are scenes the engine makes from `story.json`: `seconds` long (one image for an asset), with no sound. In an ad with scenes that's timed by audio, an image on the story moves the scenes after it away from the mix, so the board shows the same warning as a reorder.
- **Scenes are where the agent chose to cut**, not a schema for shots. A continuous move can span one long scene, and a single long take is one scene.

### 10.5 Projects: videos and assets

- **A video** is what nykma makes today: scenes in story order, rendered to MP4 in every ratio.
- **An asset** is a still, or a set of them, such as a post image or a carousel. It's `kind: "asset"` in the registry, and each scene is one image. Render writes `<id>-<n>.png` for every ratio in story order, so the arrows set the order of a carousel, and a single image needs none. `validate` doesn't know assets yet: until it does, an asset's checks are the reviewer and your eyes.

### 10.6 The chat

The right panel is the conversation with `ad-agent` for this project, or with the agent making a brand kit. Opening a project is AI-first: a new project starts with the chat running, and the board fills as the agent works.

- **Width:** drag the panel's left edge, from 280 px up to whatever leaves the board room. Double-click it to reset. The width is kept for next time.
- **Messages stream:** the desk runs `claude -p --agent ad-agent --output-format stream-json` and shows the text as it comes. Tool steps fold into one line each ("rendered 9x16", "wrote pitch.md") and open to show the details.
- **Same conversation:** each project's session id is kept in `queue/<folder>/.session` (gitignored), so every note continues it.
- **Quick replies** follow the state and send the words you'd type:
  - Pitch: **Go**, **Another idea**
  - First look: **Check it**, **Skip the checks**, **Drop it**

  "Drop it" marks the ad without calling the agent, so it spends nothing.
- **Context chips:** selected scenes and the current frame are attached to the message as `@demo frame 40`, so "make this bigger" means something. A change to the story since the last message is added too ("story is now hook → end → demo"), so the agent knows before it renders.
- **Files:** images, recordings or fonts dropped on the chat are saved in `queue/<folder>/inbox/` (or the brand's `uploads/`), and their paths go in the message.
- **Stop** ends the run, and agents stop when the dev server does. A finished run is saved in `.chat.json` next to `.session` (gitignored), so the chat survives a restart.
- **Render** in the top bar runs `bun run render <slug> --ratio all` with no agent and no tokens, shows its progress in the chat, and copies what it wrote to the queue folder.
- **Pitch on the board:** while there's only a pitch, each storyboard row is a card on the board with its image, text and time, and the arrows follow the table. The animatic plays with **Play**.

### 10.7 Look and build

- **Look:** Figma's: dark panels, a neutral grey board so an ad's colours read true, small 11–13 px UI type in Inter (OFL), one accent colour, thin borders and a lot of space around the scenes. Hebrew projects keep the desk in English and the scenes in RTL. The tools are reached by keyboard as in Figma.
- **No new services:** it's still a React page on the Vite dev server, with the file reads, writes and agent runs as dev-server endpoints (`scripts/lib/desk.ts`) that only accept POSTs from the desk's own page. The scene list comes from the registry through the dev server's own module loader. Pan, zoom and arrows are hand-written (CSS transforms and SVG), with no canvas library. The only new package is the Inter font.
- **Unattended agent:** allowed file tools and the build commands, and denied `.env` files, `gh` and `git push`, as before.

### 10.8 Settings

**Settings** in the left rail sets the defaults for new ads. They're saved in `settings.json` at the repo's root (gitignored) as you change them, and `scripts/lib/settings.ts` falls back to the defaults for anything missing or wrong.

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

The page also shows whether the ElevenLabs key, Whisper and yt-dlp are there. Its **Agent instructions** section edits what the agent is told, for every brand or for one (§10.11). These checks spend nothing, and the key is never read out: a one-line Python call says only whether there is one.

**Settings go into the ad, not under it.** The desk puts them at the end of a new ad's brief, and the agent writes them into the ad: `ratios` on the registry line, `voice_id` and `align` in spec.json. `mv.py` never reads `settings.json`, and its own defaults (George, Whisper) don't move. So changing a setting never changes a built ad or spends credits on it again. An agent run outside the desk reads `settings.json` for the layouts when its brief names none.

### 10.9 One engine

Every ad is built with nykma, by `ad-agent`. From 2026-11-05 to 2026-11-08 a brief could also start a second agent that built variation B with HyperFrames (HeyGen's HTML and GSAP renderer). It was removed because the two tests found nothing it did better that a rule couldn't do:

- **A frame-for-frame port** (`queue/2026-11-04-hyperframes-vs-nykma/`): the same picture (SSIM 0.99), sound and render time, with 1.4× the code, files 1.8× the size, less deterministic renders and a silent RTL bug. The hardest part, the app's UI, still ran on nykma's function-of-time code inside it.
- **A blind bake-off** (`queue/2026-11-04-bakeoff/`): time, tokens, code and render time within about 20%. nykma's ad had the better idea and sound. HyperFrames' had the cleaner layout, because its skills gave it layout rules (safe areas, read times) and it checked them while it built.
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

## 11. Commands

```bash
bun install && bunx playwright install chromium
py -3.13 -m venv .venv && .venv/Scripts/python -m pip install -r py/requirements.txt   # audio/Blender (optional)
python3.13 -m venv .venv && .venv/bin/python -m pip install -r py/requirements.txt     # the same on a Mac

bun run dev                                    # the desk (the scrubbing preview is at /)
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
bun run brand-check <brand>
bun run history <brand>                        # a brand's past ideas and the user's notes for it (free, §8)
bun run eval <version|current> [--briefs a,b] [--runs 2] [--label name] [--build]   # a prompt version on the briefs, to the pitch or the MP4 (spends tokens, §8.1)
bun run eval compare <a> <b> / trace <label>                                    # how two versions worked side by side; traces rebuilt (free)
bun run eval snapshot <name> / blind <a> <b> / score <a> <b>              # freeze a version, a blind sheet, its tally (free)
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

- **This repo stays private** (`TomCohenDev/nykma-private`). It holds client brands, `queue/` and research. The public repo, `TomCohenDev/nykma`, is a separate one with its own history, filled by `bun run export-public`, never by pushing this one. To publish: export, then commit and push in `../nykma-public`, whose commits use the GitHub no-reply address. Its `main` can't be force-pushed or deleted, and it has secret scanning with push protection and private vulnerability reporting.
- **`publish.json` is an allowlist.** It names the brands and ads that go public and the folders that never do. A new brand or ad stays private until it's added there. Public brands lose `notes.md` and `sources.txt` (the user's feedback and local paths). The registry is rewritten to the listed ads.
- **The export stops** when an exported text file matches `blocked` (a client's name, a local path), when code still uses an unlisted ad, or when a file is over 50 MB. Docs that only name an unlisted ad are a warning. It writes `../nykma-public` (or `--to`), drops everything there but `.git`, and never commits or pushes.
- **nobodyknowsmyapp.com** is the site: tutorials, a showcase of public brands' ads, the docs, the changelog and pricing. It's English, and says that ads can be in Hebrew. The domain, nobodyknowsmyapp.com (nykma for short), is on Cloudflare, with Email Routing forwarding sales@ to the user's inbox.
- **The site lives in `site/`** (`site/README.md`): a static Astro build served by a Cloudflare Worker. So far it has a home page and `/pricing`, whose sales form posts to `/api/contact`. The Worker checks the fields, ignores bots that fill a hidden field, and mails the request from form@nobodyknowsmyapp.com to the sales inbox through Email Routing, with the sender as Reply-To. The inbox's address is a Worker secret (`SALES_TO`), so it's not in the public repo. Without JavaScript the form still posts, and lands on `/pricing/sent/` or `/pricing/not-sent/`. For now the Worker runs on its workers.dev preview: the domain itself still has other DNS records and a Cloudflare Access login in front of it, which have to go before `site/wrangler.jsonc` can attach it.

## 13. Later, only if it's needed

- Making and editing on the board: text, shapes, moving an element, and an Inspect tab next to the chat with an element's size, font and colour, as in Figma.
- Comments pinned on a scene and frame, sent to the agent as notes.
- Transitions set on an arrow, and branching stories for A/B cuts.
- An in-browser pad for recording real handwriting, with its timing.
- Blender curves that write on from `hand.gen.json` (chalk on a 3D board).
- Post-processing (bloom and the like) in `<Three>` (§6.10).
- Streaming frames straight into ffmpeg for faster renders.
- A transparent WebM or MOV from `render`, for an overlay another editor puts on top (an idea from HyperFrames, §10.9).

## 14. Open questions

- Should the pitch be the default, or only for ads above a certain size?
- Should the ads made before the desk be split into scenes, or stay one scene each?
- When an arrow change makes a story longer or shorter than the platform's limit, should the board warn?
