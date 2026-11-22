# nykma

*nobody knows my app*

A bare-bones ad maker. You ask Claude Code for an ad, and it comes up with an idea, builds it in code, and hands you MP4s with post copy, 1:1 unless you ask for 16:9 or 9:16 too. Everything runs locally. Nothing is published unless you post it from the desk or ask Claude to, and no money is spent without your go-ahead. Ads can be in English or Hebrew, right to left included.

## Setup

You need [bun](https://bun.sh), Node 22, ffmpeg on your PATH and [Claude Code](https://claude.com/claude-code).

```bash
bun install && bunx playwright install chromium
```

Optional, for ElevenLabs audio, Whisper word times, downloading the brand's own videos (yt-dlp), and Blender:

```bash
py -3.13 -m venv .venv && .venv/Scripts/python -m pip install -r py/requirements.txt
```

The desk's **Settings** page connects paid services (an OpenRouter key for generated video and images, and ElevenLabs), keeping the keys outside the repo. It also sets the defaults for new ads: layouts, pitch first, the ElevenLabs voice (or automatic), Whisper or ElevenLabs for word times, and how Claude Code runs. It shows what's installed and connected, and its **Agent instructions** section edits what the agent is told, for every brand or for one.

`.env.example` lists two settings, `ELEVENLABS_API_KEY` and `BLENDER`. Both are optional.

- **ElevenLabs key:** copy `.env.example` to `.env.local` and paste the key in, or run `npx -y @elevenlabs/cli@latest onboard init`. `.env.local` is gitignored. ElevenLabs output needs a paid plan for commercial use.
- **Blender:** found through `BLENDER` (the environment, then `.env.local`, then `.env`), then `PATH`, then the newest install in `C:\Program Files\Blender Foundation\` or `%LOCALAPPDATA%\Programs\`.

A fresh clone works without either. `gen/` is gitignored, so `py-demo` has no length until you run `mv.py build py-demo`, and needs `mv.py blender` for its plates. Every other ad works as it is.

## The flow

In Claude Code, inside this folder:

```
> use the ad-agent to make an ad about X for <brand>
```

1. **Brand.** The first time, point the agent at what you have: a repo, a URL, screenshots, a logo. It saves `brands/<brand>/` once and reuses it.
2. **Pitch.** You get the idea in two lines, a rough storyboard and a free slideshow animatic at `queue/<date>-<brand>-<slug>/`. The agent stops there. Say "go", give notes, or say "another idea". Skip this with "no pitch, just build it".
3. **Build.** The agent builds in `src/ads/<slug>/` and checks its own stills.
4. **First look.** The agent renders every ratio, gives you the MP4s and stops, before any checks run. Give notes for another round, or say "check it", "skip the checks" or "drop it". Skip this with "just finish it".
5. **Checks.** If you ask for them, the reviewer suggests adjustments on stills and the validators check the final renders.
6. **Hand-off.** `queue/<date>-<brand>-<slug>/` holds the renders, `README.md` with what to check, and `post.md` with a caption per platform and UTM links.

Send notes in chat. The agent fixes and re-renders in the same folder.

## Commands

| Command | What it does | Writes |
|---|---|---|
| `bun run dev` | Opens the desk: ask for an ad, watch every ratio, answer the agent. The scrubbing preview is at `/` | |
| `bun run animatic <slug> [--ratio 9x16]` | Slideshow of the pitch: free, takes seconds | `queue/<date>-<brand>-<slug>/animatic.mp4` |
| `bun run stills <id> --frames 0,90 [--ratio all]` | PNGs of frames | `out/<slug>/stills/` |
| `bun run sheet <id>` | Contact sheet | `out/<slug>/<id>-sheet.png` |
| `bun run render <id> [--ratio all] [--pages 4]` | Final MP4, mixed to -14 LUFS, plus a silent copy and the sound as an MP3. `--pages` sets how many pages capture side by side | `out/<slug>/<id>.mp4`, `<id>-silent.mp4`, `<slug>[-<take>].mp3` |
| `bun run review <slug> [--frames 240,412] [--dry-run]` | Fresh reviewer per ratio on stills. Spends tokens: about $0.25 a ratio on a 30 s ad of 20 picked frames. `--frames 240` limits it to those frames and adds a recheck to the report, `--frames +240` adds them to the pick, `--dry-run` only shows the picked frames | `queue/<date>-<brand>-<slug>/review.md` |
| `bun run validate <id> [--brand <brand>]` | Free checks on renders, sound, layout, brand, truth, copy and handwriting. Exits 1 on failure. `--brand` names the kit when the queue folder doesn't | `queue/<date>-<brand>-<slug>/validate.md`, or `out/<slug>/` with no queue folder |
| `bun run hand <slug> [--force]`, `bun run hand:check <slug>` | Trace handwriting (cached, `--force` redoes it), and check its stroke order | `src/ads/<slug>/hand.gen.json`, `out/<slug>/hand-check.*` |
| `bun run brand-check <brand>` | Re-hash the brand's sources and list what changed | `brands/<brand>/sources.txt`, new hashes only |
| `.venv/Scripts/python py/mv.py build <slug> [--estimate] [--test-line]` | ElevenLabs audio, mix and timeline. `--estimate` shows the credits, `--test-line` makes one voice line to hear first | `public/ads/<slug>/gen/` |
| `.venv/Scripts/python py/mv.py blender <slug> --scene <file>` | Blender stills (`--preview --frames 1,300`), plates (`--layer`) or a 3D cut (`--video`). `--ratio 1x1` or `9x16` renders that shape | `out/<slug>/blender/`, `public/ads/<slug>/gen/blender/` |

A failure in Render, Layout or Brand that's the idea rather than a mistake gets a `Deliberate: layout 120-300 <why>` line in the queue README, and `validate` then shows it as a warning with that reason.

The animatic speaks through Windows `System.Speech` or macOS `say`. With no Hebrew voice installed, Hebrew lines stay silent, are timed from their word count and appear on screen. To hear them, install a Hebrew voice that `System.Speech` can see. Windows' own speech packs often aren't visible to it.

## Where things live

| Path | What |
|---|---|
| `.claude/agents/` | The ad agent and the reviewer |
| `src/engine/` | Frame-accurate React engine and capture API |
| `src/parts/` | The parts bin: reuse, copy, change or ignore |
| `src/ads/<slug>/` | One folder per ad, and one line in `src/registry.ts` |
| `brands/<brand>/` | Saved brand kit. `brands/_template/` shows the format. Fonts must be licensed for video, and `brand.md` records each licence |
| `public/` | What the page can read: shared fonts and sfx, and `public/ads/<slug>/` for each ad, including the brand files it uses, copied from the kit. Builds don't copy it, so plates under `gen/` don't slow them |
| `queue/<date>-<brand>-<slug>/` | Pitches and hand-offs. `queue/_template/` shows the format |
| `out/` | Scratch renders and stills, gitignored |

`spec.md` has the reasoning.

## Licence

Free for personal and noncommercial use under the [PolyForm Noncommercial License 1.0.0](LICENSE). Every company needs a paid commercial licence: see [COMMERCIAL.md](COMMERCIAL.md) or [nobodyknowsmyapp.com/pricing](https://nobodyknowsmyapp.com/pricing). Contributions are welcome under [CONTRIBUTING.md](CONTRIBUTING.md).
