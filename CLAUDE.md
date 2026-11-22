# nykma

A bare-bones local ad maker. One agent (`.claude/agents/ad-agent.md`) has an idea, builds it in code, and hands MP4s and post copy to `queue/`. `spec.md` has the full picture.

**Making or changing an ad** follows `ad-agent.md`, which owns that workflow: the stages and their stops, how the idea is found, the craft, and the guides in `.claude/guides/` it reads at each stage. In a session that isn't ad-agent, read it first.

**The user's feedback about ads** ("music only", "no handwriting") that should hold for a brand's next ads goes in `brands/<brand>/notes.md`, which `bun run history` prints. Agent runs get no Claude Code memory (`scripts/lib/permissions.ts`), so feedback saved only to memory never reaches them.

## Commands

```bash
bun run dev                                    # the desk: dashboard, viewer, timeline, inspector and chat (the scrubbing preview is at /)
bun run history <brand>                        # the ideas a brand's ads have used, and the user's notes for it (free)
bun run animatic <slug>                        # pitch slideshow from pitch.md (free)
bun run claims <slug>                          # the pitch's claims against brand.md -> queue/<date>-<brand>-<slug>/claims.md (a few cents)
bun run stills <id> --frames 0,90,240 [--ratio all] [--sheet]   # --sheet: one labelled image of those frames
bun run stills <id> --ratio all --thumbnail    # the ad's cover image (`thumbnail` on its registry line)
bun run sheet <id>
bun run render <id> [--ratio all] [--pages 4] [--thumbnail]   # MP4s, plus <id>-thumbnail.png/.jpg; --thumbnail: only those
bun run review <slug> [--frames 240,412 | --frames +240,412] [--dry-run]   # reviewer on stills -> queue/<date>-<brand>-<slug>/review.md (spends tokens)
bun run validate <id> [--brand <brand>]        # free checks -> queue/<date>-<brand>-<slug>/validate.md
bun run validate <id> --layout                 # layout and Hebrew only, from the code, no render -> out/<slug>/layout.md
bun run stamp [<brand>] / bun run stamp --report   # which instructions make an ad, for its README; ads by instructions with their results
bun run hand <slug> [--force] / bun run hand:check <slug>
bun run footage <slug> [<clip> ...]            # real footage -> frames, sound and sheet.jpg in gen/footage/
bun run footage <slug> <url> --own             # the brand's own video, through yt-dlp
bun run gen <slug> --estimate                  # generated stills and clips in gen.json, priced (free)
bun run gen <slug>                             # makes the stills through the desk, within the budget approved there (videos: the desk)
bun run screen <slug> <clip> [--corners "x,y x,y x,y x,y"]   # finds a (green) screen in a clip, for <ScreenInsert>
bun run stock <slug> "query" [--video|--photo] [--ratio 9x16] [--min-seconds 4]   # free stock (Pexels, Pixabay) through the desk: a numbered sheet
bun run stock <slug> --take pexels:12345 [--name <clip>]   # downloads one to public/ads/<slug>/stock/; a clip is unpacked like footage
bun run stock <slug>                           # downloads the stock in sources.json again after a clone
bun run publish [<slug> --to <account>,... [--at <time>] [--dry-run]]   # posts through the desk; alone, lists accounts and posts
bun run local:setup                            # video on this PC: ComfyUI + LTX-2.5 (ltx-2.5-q4) in ~/nykma-local (Windows, NVIDIA)
bun run eval <version> [--briefs <a,b>] [--build]   # runs of a prompt version on evals/briefs/, pitch or to the MP4 (spends tokens; evals/README.md)
bun run eval compare <a> <b>                   # how two versions worked: tools, cost, traces, MP4s (free)
.venv/Scripts/python py/mv.py words <audio> [--lang he] [--text "..."]   # Whisper word times, free, local
bun run brand-check <brand>
bun run typecheck
bun run export-public [--dry-run]           # the public part -> ../nykma-public, from publish.json (free; never commits)
.venv/Scripts/python py/mv.py build <slug> [--estimate] [--test-line [voice]]
.venv/Scripts/python py/mv.py blender <slug> --scene <file> [--preview --frames ...] [--layer] [--video] [--ratio 1x1|9x16]
```

On a Mac the Python is `.venv/bin/python`. An Intel Mac runs Blender 4.5 LTS, which `kit.py` supports alongside 5.x.

Ids are `<slug>[-<take>]-<ratio>`, and ratios are 16x9, 1x1 and 9x16. A take is one more registry line with `take: "B"`.

## Code rules

These hold for anyone touching `src/`, agent or not, because breaking them breaks every render.

- **Every value is a function of the frame.** No CSS animation, timers, `Math.random()` or `Date.now()`: renders must come out the same twice. Use `random(seed)`.
- **`gen/` is gitignored.** An ad timed by audio leaves out `frames` and reads its timeline through `useTimeline()`. Never `import` from `gen/`, because a missing import breaks every ad.
- **The desk writes `story.json`, `tune.json` and literals.** An ad lists `scenes` in the registry; `src/ads/<slug>/story.json` holds their order, trims and transitions, and `tune.json` the knobs (`useTune()`). The desk rewrites them when the user moves, trims or adds a scene, sets a transition or turns a knob, and it can change a literal (text, a number or string in a style or attribute) in an ad's code, add or remove a style property (`translate`, `scale`, a colour) and set an element's `data-fx` effects. So read them, and the file you're about to edit, before changing or rendering, and keep what you don't change.

## Limits for every session

- Post or schedule only when the user asks, and only with `bun run publish` (spec.md §10.12), which posts through the desk on the accounts connected on its Publishing page. Don't open `.env` or `.env.local`, and never read `~/.config/nykma/`.
- Don't spend ElevenLabs credits or generated-media budget beyond what the user approved.

## Changing nykma

- When you change how nykma works, update `spec.md` and add a dated entry to `CHANGELOG.md`.
- The agent's instructions are code: one owner for each rule, and a change worth making is worth testing. Before a big change to `ad-agent.md`, the pitch template or the explorers, save the current files as a version in `evals/prompt-versions/` and compare with `bun run eval` (`evals/README.md`).
- Scripts run on Node, not bun, because Playwright hangs under bun on Windows. `scripts/lib/index.ts` says how to write one.
