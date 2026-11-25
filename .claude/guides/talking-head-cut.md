# Cutting the take

Read this when the take is in. `talking-head.md` has the route. You can't listen to the take, so the cut is made from what Whisper hears, checked by hearing the cut again, and listened to by the user.

## bun run take

```bash
bun run take <slug> queue/<folder>/inbox/<take>.mov [--mic inbox/<mic>.wav] [--screen inbox/<screen>.mp4] [--script <file>]   # first time
bun run take <slug>              # again, after changing cut.json (seconds: what Whisper heard is cached)
bun run take <slug> --verify     # hear the cut again: words a cut clipped, or a retake left in
```

It copies and unpacks the take like `bun run footage`, then:

1. **The voice.** A separate mic (`--mic`) is lined up with the camera's sound and becomes the voice; `cut.md` gives the offset and any drift. Then a gentle chain: high-pass at 80 Hz, denoise only if the room is audibly noisy (and part way: full-strength denoise sounds gated), a de-esser and 3:1 compression, to `voice.wav`. `"clean": "off"` in `cut.json` keeps the voice as recorded.
2. **What was said.** The take is split at its pauses and Whisper hears each piece on its own. Heard whole, Whisper merges a line said three times into one and the retakes vanish.
3. **Which try.** Each line of the script gets its **last complete try**, in order: the way an editor and Descript do it, because a speaker starts again when they didn't like the last one. A try is complete when it covers most of the line and starts and ends like it. With no script (`script.md`, the pitch's voice lines or `--script`), it cuts the way an editor would: a sentence whose opening comes again within a minute is an earlier try, and so is everything up to the new start. The sentences left become the lines, anchored where they were said.
4. **Inside the try.** A restart with no pause loses its first half, a stutter its repeat, and um, uh, אה and אממ go. A pause longer than `pause` (0.5 s) becomes a jump cut that keeps about a quarter of a second of air. Habit words that carry meaning (כאילו, בעצם, like, so) are never cut by the tool.
5. **Cut points** sit 0.1 s before the first word and after the last word's tail (Whisper ends words early), never inside another word, on the ad's frames. Each part's sound fades over 2 frames at its edges (`voiceCues`' `fade`), which runs over the quiet the cut points leave around the words: what the user's approved tutorials used.
6. **The screen recording** (`--screen`), when one was made during the take, is unpacked and lined up with the take by its sound, so `<TakeScreen>` shows what was on screen as each word was said, through every cut. A recording with no sound can't line itself up: `cut.md` says so, and you set `"screen": { "at": <the take's second it starts at>, "by": "hand" }` in `cut.json` by matching a slide the speaker flips to with the word they say as they do (a slide they flip back to at a retake is the surest match), then run it again. Never guess it.
7. **The face**, found in every scene, so the ad frames it (`talking-head-look.md`), and how far the head jumps across each cut, so a zoom hides only the jumps that show.

It writes `src/ads/<slug>/cut.json` (the decisions), `src/ads/<slug>/take.json` (what the ad imports) and `queue/<folder>/cut.md` (the cut as a table, what was left out and why, the sound, and what to check).

## Reading cut.md

Read all of it before building. The things that go wrong, and what to do:

- **A misheard word.** Whisper writes product names in the speaker's alphabet (Claude as קלוד), mishears a word now and then, and drops punctuation. Fix it in `cut.json`: `"fix": { "heard": "written" }` for this video, a line's own `fix` for one place, or the brand's `brands/<brand>/spelling.json` for a name that will come up again (a word with two meanings, like גוגל, stays out of the brand's file). A one-letter Hebrew prefix joins its English word with a maqaf on its own: ב + Claude is ב־Claude.
- **Left out but meant.** Under "Left out", anything "not in the script" was said and dropped. People improvise, and the improvised line is often the best one: add it to `cut.json`'s lines where it belongs (its words as said).
- **Not found.** A line said very differently from the script: put what was said in its line in `cut.json`, or take the line out.
- **A partial try** is the best of a line no try finished. Say so in your reply; the user may want to record it again.
- **The wrong try.** `"pick": 2` on a line plays its second try. Tries are listed in `take.json` and on the desk's Cut tab, where the user can pick one.
- **A deliberate repeat** ("לא, לא, לא") is kept when the line has it. When it was cut, put it in the line.
- **A word a second or longer** usually hides a pause or a retake inside it: look at that stretch.
- **The sound.** A room tone above about -50 dBFS is noisy even after the chain: say so. A mic that drifts more than 40 ms over the take slips the lips late in it.

Then set the highlights: `"hl": ["word", ...]` on a line, one or two words that carry it (the number, the product, the payoff), never more than one per caption page. Run `bun run take <slug>` again.

## Verify, every time the cut changes

`bun run take <slug> --verify` plays the cut as the ad will, part after part, and has Whisper hear it again. Every kept word should come back, and nothing else. A word missing is one a cut may have clipped; a word extra is a stray syllable or a retake left in; the Verify section lists each place. Whisper mishears too, so a difference is a place to look, not a fact: compare it with the take's words around that time in `cut.md`, nudge the line's `"trim": [in, out]` (seconds, + is later) when a cut is too tight, and verify again. `validate` warns when the cut was never verified.

## By hand

The cutter is a first cut. You can always:

- change a line's words, ids or order in `cut.json` (order is the script's; `story.json` can still reorder scenes for the picture);
- set `"pause"` on a line (0.8 keeps a dramatic pause, 0.3 cuts tighter), or for the whole take;
- drop a line by taking it out of `cut.json`.

Never edit `take.json`: the next run replaces it. The README gets the cut as a table: each scene, where it's from in the take, and what was left out (from `cut.md`).
