# Desk redesign: proposal and mockups (2026-11-21)

Mockups are static HTML at 1440×900. Open one in a browser, or add `?theme=graphite|studio|riso`.
Screenshots: `node shoot.mjs editor:riso home …` writes `shots/<name>[-theme].png`.

| File | Screen | Theme shown |
|---|---|---|
| `home.html` | Projects: prompt composer, "your move" strip, true-ratio library | Graphite |
| `pitch.html` | Pitch stage: the idea as a document, animatic, storyboard on the timeline, Go gate | Studio |
| `build.html` | Build stage: the storyboard develops into the film, agent checkpoints, queued notes | Graphite |
| `editor.html` | First look: preview, timeline, element inspector | all three |
| `review.html` | Checks: screening room with three ratios in sync, reviewer pins, check lights, spoken notes | Graphite |
| `script.html` | Script view: the ad as words; edit text, reorder scenes, re-voice one line | Riso |
| `publish.html` | Post: feed previews, captions per platform, week schedule, approve | Studio |

## The structure

- **Arrows go.** One gapless scene track, as in Final Cut Pro or Canva: drag to reorder, drag an edge to trim. Scenes not in the video wait in the Scenes panel under "Not in the video". The track still writes `story.json` `order`.
- **One project screen, with stages across the top**: Pitch, Build, First look, Checks, Post. The middle changes with the stage, and the top-right button is always the current stage's next action (Go, Check it, Send fixes, Approve). Only the pitch and publishing block. Build and checks run on their own (the "no approval stops" note).
- **Fixed regions, not docking:** Scenes/Media/Brand/Files on the left, the viewer in the middle, Inspect/Agent/Notes on the right, the timeline at the bottom. Panels resize but don't move.
- **Timeline tracks read from the ad:** Scenes (filmstrip), Text (from `inspect()`), Voice and Music (from cues and `timeline.json`), Sound fx, Generated, and Notes.
- **Pro transport:** Space, J/K/L, ←/→ for a frame, ↑/↓ for a scene, I/O, S split, M note, and timecode with frames.

## Editing elements: three tiers

These follow from 11 ads sampled in `src/ads/`. About 35–40% of style values are literals, 20–25% are constants, and about 25% are computed from the frame. A further 15–20% come from helpers like `<Say>`, and about 15% from data arrays.

1. **Direct (writes the code).** Literal text, sizes and colours, plus a `prog(f,[a,b])` timing range with literal numbers. A dev-only Vite plugin tags host JSX in `src/ads/**` with `data-nk="file:line:col"`. The desk then patches the literal through the AST, guarded by a hash, and hot reload redraws the scene.
2. **Tune (a knob, saved to `tune.json`).** For anything computed, the ad reads named knobs: `k("headline.size", 86)` for a value, `kx("headline")` for an offset on x/y/scale/colour, and `at("headline.in", 30)` for a named time. The desk writes `src/ads/<slug>/tune.json`, with values per ratio. It is static JSON, so renders stay deterministic. This follows the Theatre.js and Motion Canvas model. `validate` lists knob overrides that no element uses any more.
3. **Ask (staged for the agent).** Everything else becomes a note: the element, frame, ratio and a frame grab, staged and sent together as one turn.

Generated media, canvas or three.js text, and `dangerouslySetInnerHTML` content can only be replaced, regenerated, trimmed, or set to fit or fill.

The inspector labels every row with the tier that edits it (Direct / Tune / Ask), so nothing is greyed out without a reason.

Engine changes this needs:
- `story.json` `scenes[id] = {in, out}` for trims
- the `data-nk` plugin
- `k`/`kx`/`at`
- an `ad-agent.md` rule to give on-screen elements knob ids. Per CLAUDE.md, save the current prompt as a version in `evals/prompt-versions/` and run `bun run eval` before changing it.

## Themes

The tokens are in `base.css`. Body text is 13 px (it's 11–12 today), and text-3 passes AA. The viewer stays neutral in every theme.
- **Graphite**: neutral greys, with tally-yellow for live and selected things. Geist and Geist Mono.
- **Studio**: warm charcoal, brass and cream. IBM Plex, which has a Hebrew cut.
- **Riso**: light storyboard paper with cobalt, fluoro pink and yellow, offset shadows. Bricolage Grotesque.
