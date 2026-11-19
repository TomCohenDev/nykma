# Evals: is a prompt change better?

The agent's instructions are code. A rule that sounds sensible can still make the ideas worse, and one great pitch proves nothing. So a change to `ad-agent.md`, the explorers or the pitch template is tested on the same briefs as the version before it, judged blind, before it's trusted. This follows the deep-research report on prompting ad agents (2026-11-08), which found that prompt effects depend on the model and the task and have to be measured, not inferred from how a prompt reads.

## What's here

| Folder | What |
|---|---|
| `briefs/` | 14 fixed briefs across every brand, Hebrew and English, and each layout, including three edge cases (an unsupported claim, a fake testimonial, a single still) and two 10-second ads. Each says what the user would type, plus an "Expected" section that's never sent: it's for judging the hard rules. |
| `prompt-versions/` | Frozen versions of the instructions, each mirroring the repo's paths, with a `VERSION.md` saying what it is. `a-2026-11-08-accumulated` is the baseline: the prompt before the 2026-11-08 rewrite. |
| `results/<label>/<brief>/<run>/` | What a run made: `pitch.md`, the agent's `reply.md`, `trace.md`, and `meta.json` (cost, turns, time, tools, explorers started, old ads it opened, guides it read). The MP4s, MP3s and raw event logs stay on this machine (gitignored, like the queue's renders): `trace.md` is the readable record, and `bun run eval trace` rebuilds it only where the logs are. |

## Running

```bash
bun run eval a-2026-11-08-accumulated --runs 2        # the baseline, every brief twice
bun run eval current --runs 2                         # the working copy as it is now
bun run eval snapshot b-2026-11-08-lean-core          # freeze the live files as a version, then describe it in VERSION.md
bun run eval current --briefs gomlin-claim,mathbooklm-trial   # a few briefs only
bun run eval blind a-2026-11-08-accumulated current-2026-11-08   # a blind sheet of the two (free)
bun run eval score a-2026-11-08-accumulated current-2026-11-08   # tally it once filled in (free)
```

**How they worked, and the ads themselves.** `--build` carries each run on past the pitch: the same session gets "go", builds the ad and stops at the first look, so the result folder also has the MP4s (`ads/`), the code it wrote (`code/`) and the build's reply. The build worktree links to `node_modules`, `.venv` and `.env.local` (linked, never read, and unlinked before the worktree goes), so ElevenLabs runs within what the pitch planned. Free stock, generated media, footage and review stay off for both versions, and the agent makes those shots in code. Every run keeps its full event log and a `trace.md`: each tool call in order with its timing and result, and each explorer's brief and what it returned. `bun run eval compare <a> <b>` (free) puts two versions side by side: cost, time and turns for each stage, tools used, explorers started, old ads and files outside the repo read before the pitch, guides read, the MP4s, and links to the traces. `bun run eval trace <label>` rewrites the traces and those counts from the saved logs.

```bash
bun run eval a-2026-11-08-accumulated --briefs mathbooklm-ten --label ten-build-a --build
bun run eval current --briefs mathbooklm-ten --label ten-build-b --build
bun run eval compare ten-build-a ten-build-b
```

Without `--build`, a run is the pitch stage only. Each one happens in a throwaway git worktree of HEAD with the working copy laid over it and then the version's own files, so every version runs on today's tooling (`history`, `claims`, the brand notes), its own `CLAUDE.md` and agents load, and this checkout isn't touched. It uses the desk's model and effort from `settings.json`, and the same permissions as a desk run. Everything that costs money, needs the desk or takes long (stock, gen, animatic, `mv.py`, render, stills) is switched off, the same for both versions, and the brief says so. Two runs per brief show whether a result repeats.

**It spends Claude tokens.** A pitch run is a few minutes and roughly what a pitch costs on the desk. All 14 briefs × 2 runs × 2 versions is 56 runs, so start with a few briefs when you're trying something out.

## Judging

The sheet shows each brief and two pitches, X and Y, as the idea and the storyboard only (the rest of a pitch follows its template and would give the version away). Which side is which is mixed by a hash, the same every time. For each pair:

- `ship: X`, `ship: Y` or `ship: neither`: the one you'd make. A preference, not a score, because "which would I ship?" is easier to answer honestly than a 1-10.
- `rules X: ok` or what broke: an invented claim, a fake testimonial, a spend nobody approved. A broken rule is a failure on its own and is never averaged away by a good idea.

If you want notes on why, these are the qualities that matter, with the weights to start from (calibrate them against your own picks):

| Quality | Weight | 1 | 3 | 5 |
|---|---|---|---|---|
| Audience relevance | 25% | not about this viewer | plausible | the viewer's own moment |
| Message clarity | 20% | can't say what it's for | clear with the voice-over | clear from the picture |
| Distinctiveness | 20% | a category default or an old ad again | a fresh take on a familiar shape | unlike the category and the history |
| Brand attribution | 15% | could be anyone's | the logo at the end | the brand is inside the idea |
| Emotional impact | 10% | flat | pleasant | a laugh, a jolt, a "huh" |
| Feasibility | 10% | can't be built honestly | costly or risky | buildable within budget |

**A version graduates** when it has no more hard-rule failures than the one before, a preference that holds across different briefs (not one spectacular pitch), and no large cost or time increase without a reason. Otherwise keep the old one. `meta.json` also shows whether the version did what it was meant to: explorers started, old ads left closed, guides read at the right stage.

Don't let a model judge creative quality alone: model judges prefer their own style, the first option and the longer one. They're fine for the hard rules, with the order swapped once.

## Experiments, in order

Change one thing per version, keep the model, effort and briefs the same, and compare blind.

1. **Lean core vs accumulated** (ready now): `a-2026-11-08-accumulated` against the current files. Does the short core with guides read on demand keep the rules and give better ideas?
2. **Explorers vs one context:** the current files with "Explore in parallel" replaced by "think up six ideas yourself on these routes". Does independence give a wider pool and a better pick? Look at the "Other routes" too, after picking.
3. **Old ads visible vs history only:** the current files with "Keep old ads out of it" removed. Do old ads pull new ideas toward them?
4. **Split effort:** `effort: medium` in `concept-explorer.md`'s front matter. Is divergent thinking better or worse at lower effort, and is it cheaper?
5. **Rules with reasons:** strip the reasons from the craft principles. Do the edge-case briefs fare worse?

Later, when there's a set of known faulty renders to test on: a reviewer that has to report evidence (frame, measure, file) against the current one, scored on real defects found and false alarms.

Once a version wins offline, the real test is on a platform: the same audience, budget and placement, judged on the campaign's goal (sign-ups, installs), with click-through, early retention and completion alongside. A handful of conversions is a direction, not a result.

## What the runs so far showed

One run per version each time, so these are leads, not results. Each folder in `results/` has the pitches, traces and MP4s, and `compare-*.md` the side by side.

| Runs | What happened |
|---|---|
| `ten-a`, `ten-b` (2026-11-08, pitch only, mathbooklm 10 s) | The accumulated prompt (A) and the rewrite (B) both pitched. A repeated a past ad's mechanism (a notebook page becoming the canvas, as in `mashal`); B, with explorers and `history`, found a new one. B invented an answer that writes itself stroke by stroke without saying so. |
| `ten-build-a`, `ten-build-b` (2026-11-08, built to MP4) | A read seven old pitches with `head` and `grep`, and two of the assistant's Claude memory files, before pitching. A came up with "writes-back" again. B ran three explorers, in the background, and pitched before one reported. Both builds cost about $3.40; A had a wordmark over a line at 7 s. These led to: no memory in agent runs, explorers in the foreground, `claims`, `validate --layout`, `stills --sheet`, the engine guide, and `stamp` (version `b-2026-11-08-lean-core` is B frozen before them). |
| `gomlin-b`, `gomlin-now` (2026-11-08, built to MP4, gomlin 10 s) | Both found the same idea, a sentence whose last word is a job card that gets swiped, because the brief echoed Gomlin's own tagline. The current prompt used every new tool (read the app's code, `claims` clean, the sheet, `validate --layout` three times) and kept music only and generic company names, but rendered with 9 layout failures it explained rather than fixed, a phone too small to read at 1:1, and no URL on the end card. B's ad was bolder and clearer, with a voice-over, but reused made-up company names from an old ad. About $5.40 each. |

**Open issues the runs found**, not fixed yet:

- Copying brand files into `public/ads/<slug>/` is refused several times a build (`cp` with flags, glob patterns, `cd` then a copy). A `bun run assets <slug> <files>` command would end it.
- `compare`'s "Refused by a permission" undercounts: it matches only one of the wordings Claude Code uses for a refusal, so it read 1 where the traces show several.
- The prompt says to fix what `validate --layout` fails before the first look, and the gomlin run rendered anyway, explaining the failures as deliberate. Either the rule needs to say how a deliberate layout failure is marked at that stage, or the agent needs to be held to it.
- A brief whose wording echoes the brand's tagline steers every version to the same idea. Briefs for evals should describe the problem, not the line.
