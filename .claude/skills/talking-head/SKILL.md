---
name: talking-head
description: Make, cut or fix a talking-head video in nykma (someone talking to camera, a reel or tutorial, alone or over screens). Use when the user gives a take to cut, asks for a script to record, wants another try of a line, or has notes on the face, captions or layout of a talking head.
---

# Talking head

nykma's talking-head method lives in its guides, which the desk's agent runs read too, so this skill only routes you there.

1. Read `CLAUDE.md`, then `.claude/agents/ad-agent.md` (the stages, the stops and the hard rules), then `.claude/guides/talking-head.md` (the route). Read the script, cut and look guides it names when their moment comes.
2. Read the brand's `brands/<brand>/notes.md` (`bun run history <brand>`): its layout and look win over the guides' defaults.
3. Where you are decides the step:
   - **No take yet:** write `script.md` from `queue/_template/script.md` and stop for the recording.
   - **A take:** `bun run take <slug> <take> [--mic <file>] [--screen <file>]`, read `cut.md`, fix spellings and highlights in `src/ads/<slug>/cut.json`, then `bun run take <slug> --verify`.
   - **A note about the cut** ("use the other take of the hook", "you cut my last word"): change `cut.json` (`pick`, `trim`, the line's words) and run `bun run take <slug>` again. The user can also pick tries on the desk's Cut tab.
   - **A note about the picture:** `.claude/guides/talking-head-look.md`, then `bun run validate <slug> --layout` and a stills sheet before you show it.
4. A note that should hold for the brand's next videos goes in `brands/<brand>/notes.md`, not in memory: agent runs don't read memory.

$ARGUMENTS
