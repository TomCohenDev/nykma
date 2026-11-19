# nykma

A bare-bones local ad maker. One agent (`.claude/agents/ad-agent.md`) has an idea, builds it in code, and hands MP4s and post copy to `queue/`. `spec.md` has the full picture.

## Commands

```bash
bun run dev                                    # the desk: dashboard, board and chat (the scrubbing preview is at /)
bun run animatic <slug>                        # pitch slideshow from pitch.md (free)
bun run stills <id> --frames 0,90,240 [--ratio all]
bun run sheet <id>
bun run render <id> [--ratio all] [--pages 4]
bun run review <slug> [--frames 240,412 | --frames +240,412] [--dry-run]   # reviewer on stills -> queue/<date>-<slug>/review.md (spends tokens)
bun run validate <id> [--brand <brand>]        # free checks -> queue/<date>-<slug>/validate.md
bun run hand <slug> [--force] / bun run hand:check <slug>
bun run footage <slug> [<clip> ...]            # real footage -> frames, sound and sheet.jpg in gen/footage/
bun run footage <slug> <url> --own             # the brand's own video, through yt-dlp
bun run gen <slug> --estimate                  # generated stills and clips in gen.json, priced (free)
bun run gen <slug>                             # makes the stills through the desk, within the budget approved there (videos: the desk)
bun run screen <slug> <clip> [--corners "x,y x,y x,y x,y"]   # finds a (green) screen in a clip, for <ScreenInsert>
bun run stock <slug> "query" [--video|--photo] [--ratio 9x16] [--min-seconds 4]   # free stock (Pexels, Pixabay) through the desk: a numbered sheet
bun run stock <slug> --take pexels:12345 [--name <clip>]   # downloads one to public/ads/<slug>/stock/; a clip is unpacked like footage
bun run stock <slug>                           # downloads the stock in sources.json again after a clone
bun run local:setup                            # video on this PC: ComfyUI + LTX-2.5 (ltx-2.5-q4) in ~/nykma-local (Windows, NVIDIA)
.venv/Scripts/python py/mv.py words <audio> [--lang he] [--text "..."]   # Whisper word times, free, local
bun run brand-check <brand>
bun run typecheck
.venv/Scripts/python py/mv.py build <slug> [--estimate] [--test-line [voice]]
.venv/Scripts/python py/mv.py blender <slug> --scene <file> [--preview --frames ...] [--layer] [--video] [--ratio 1x1|9x16]
```

On a Mac the Python is `.venv/bin/python`. An Intel Mac runs Blender 4.5 LTS, which `kit.py` supports alongside 5.x.

Ids are `<slug>[-<take>]-<ratio>`, and ratios are 16x9, 1x1 and 9x16. A take is one more registry line with `take: "B"`.

## Rules

- **Be original.** Each ad is a new idea. Existing ads and `src/parts/` are a parts bin, not templates.
- **Pitch first:** `pitch.md` and `bun run animatic`, then stop, unless told to skip it.
- **Every value is a function of the frame.** No CSS animation, timers, `Math.random()` or `Date.now()`. Look at stills before rendering it all.
- **1:1 only, unless asked.** A new ad is made in the layouts its brief lists (the desk's settings page sets the default, saved in `settings.json`, gitignored), and that's 1:1 when it lists none. Each ratio is laid out for its own shape, not shrunk.
- **Settings go into the ad.** The brief's voice, word timing and layouts are written into the registry line and spec.json, so changing a setting never changes or re-spends on a built ad.
- **Scenes:** an ad lists `scenes` in the registry, cut where it cuts, and `src/ads/<slug>/story.json` holds their order. The desk's board rewrites it when the user draws arrows or adds their own images (under `images`, files in `public/ads/<slug>/board/`), so read it before rendering and keep what you don't change. Stills are `kind: "asset"`.
- **`gen/` is gitignored.** An ad timed by audio leaves out `frames` and reads its timeline through `useTimeline()`. Never `import` from `gen/`, because a missing import breaks every ad.
- **First look.** Render every ratio, copy the MP4s to the queue folder, reply with the paths, and stop. Run no checks until told to. The user gives notes, says "check it", "skip the checks" or "drop it".
- **Checks run only when asked.** `review` first, on stills, then render, then `validate`. Fix every failure. Warnings and declined adjustments go in the README. A Render, Layout or Brand failure that's the idea gets a `Deliberate: layout 120-300 <why>` line there.
- **Don't lie.** UI must exist in the real app. Facts and numbers must be correct. No made-up testimonials, counts or quotes. Prices come from the pricing page. UTMs go on every link.
- **Brand:** use `brands/<brand>/` as saved, and don't re-derive it. A brand's `knowledge/` holds its own versions of the agent's instructions, edited in the desk's Settings: where a run names one, read it instead of the default. The page and the hand tracer read only `public/`, so copy what an ad uses into `public/ads/<slug>/`. Fonts must be licensed for video, with the licence in `brand.md`. Mention it if `brand-check` reports changes.
- **Free stock before generated.** For a shot code can't make, search `bun run stock` first, and the pitch says "stock: found <id>" or "no fit → generate". A stock person is never a customer, user, testimonial or endorser. No visible third-party logos or brands, and never product UI from stock. Credit each one in `post.md` and the README.
- **Generated media is an addition, not a replacement.** Generate only what code can't make honestly, like a real-looking person reacting, never product UI, logos, brand text, claims or real people. List each shot and its price in the pitch, make them only within what the user approves on the desk, and say in `post.md` what's AI-generated. Stills come first: every video starts from a still, and the user approves the stills and makes the videos on the desk, so `bun run gen` stops at the first video. When the brief says video is on this PC, each video is `"via": "local"`, `"model": "ltx-2.5-q4"`: no money, about 3½ GPU minutes a clip (ad-agent's "Video on this PC").
- **Hebrew** is written in Hebrew from the start, with `lang: "he"` in the registry.
- **Never** post, open `.env` or `.env.local`, or spend credits beyond the pitch without asking.

When you change how nykma works, update `spec.md` and add a dated entry to `CHANGELOG.md`.

Scripts run on Node, not bun, because Playwright hangs under bun on Windows. `scripts/lib/index.ts` says how to write one.
