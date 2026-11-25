# A talking-head video

Read this when someone talks to camera: a reel, a tutorial, a founder ad, alone or over screens. It's the route; three guides hold the craft, each read when its moment comes:

| When | Read |
|---|---|
| Writing what they'll say, and how they'll record it | `.claude/guides/talking-head-script.md` |
| The take is in: cutting it | `.claude/guides/talking-head-cut.md` |
| Building the picture: framing, captions, layout, motion, sound | `.claude/guides/talking-head-look.md` |

`.claude/guides/footage.md` covers video in general. The brand's own choices (layout, colours, what to leave out) are in `brands/<brand>/notes.md` and win over the defaults in all four.

## Why it's its own route

A talking head is the person's words and face, so two things change. The script is a promise the person has to keep out loud, and every line has to be sayable. And nobody records a clean take: retakes, false starts and pauses are the material, and cutting them well is most of the work. The user's notes on past ones were almost all about the same few things (the face in the circle, empty space, captions, too little moving), so those now have defaults and checks.

## The stages

They follow ad-agent's stages, with these differences.

1. **Read the brief.** As always. Note what came with it (the desk puts files in `queue/_incoming/`: move them to your folder's `inbox/`): up to three recordings (the phone's take, a separate mic, a screen recording made during the take) and maybe a script of the user's own. Ask which is which when the names don't say; never copy over the user's originals. A screen recording with no sound: say so at once, and ask the user for a slide and the word said with it if the take doesn't make it clear.
2. **No take yet: the script.** Write `script.md` from `queue/_template/script.md` with `talking-head-script.md`. Its scene ids become the cut's and the ad's. Write `pitch.md` too, with the storyboard's Voice column holding the lines, so `bun run claims` and `bun run animatic` work. Skip the explorers when the brief already fixes what the video says (a tutorial of a given task usually does); for an ad, explore as ad-agent says, then write the winning idea as lines. Stop: the user records.
3. **The take is in: cut it** with `talking-head-cut.md`: `bun run take <slug> <take> [--mic <file>] [--screen <file>]`, then read `cut.md`, fix spellings and highlights, and `bun run take <slug> --verify`. When the take came with no script, the cut is the script: the lines are what was said.
4. **Plan the picture.** Unless the brief says "no pitch", update `pitch.md`'s storyboard from the cut (a row per line, its real length, what's on screen) and stop. With a take already in hand, the pitch is quick to read: the words are fixed, only the picture is open.
5. **Build** with `talking-head-look.md`, `build.md` and `engine.md`. Import `take.json` and use `src/parts/take.tsx`, so a recut moves words, lips and captions together.
6. **First look.** `bun run validate <slug> --layout` (it checks the face in every camera: whole, centred, not too close, nothing over it), then `bun run stills <id> --frames <the middle of each scene, and a frame either side of each jump cut> --sheet` and look at the face, the captions and what overlaps what. Render and stop.
7. **Notes.** "Use the other take of the hook" is a pick in `cut.json` (or the desk's Cut tab: the user can do it themselves), then `bun run take <slug>`. A note that should hold for the brand's next videos goes in its `notes.md`.
8. **Checks and hand-off** as ad-agent says. `validate` fails a cut older than `cut.json` and warns when the cut wasn't heard again. The README gets the cut table (from `cut.md`) and says what's real (the person, their words) and what's redrawn.

## Done

- The person's words are their own: captions come from the take, spellings fixed, nothing said that they didn't say, nothing they said that changes the meaning left out.
- `cut.md` has a Verify section, and every place it lists has been looked at.
- `validate --layout` has no face findings, or the README says why one is deliberate.
- It opens on the first spoken line and ends when the content ends, unless the brief or the brand's notes say otherwise.
