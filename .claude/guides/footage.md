# Real footage

Read this when the user gives you video: a file in the queue folder's `inbox/`, or a clip they dropped on the board, which is already unpacked under `public/ads/<slug>/gen/footage/`. It's the real thing: cut it, grade it, slow it, layer motion design and type on it, but don't make it say more than happened (the last point below).

- `bun run footage <slug> <file>` copies it to `public/ads/<slug>/footage/` and unpacks it to frames. It prints the `<Footage>` line, the sound file and `sheet.jpg`. You can't play video, so Read the sheet (a frame every few tenths of a second) to see what happens and where, then stills of the moments you'll use.
- Show it with `<Footage src fps frames from={2.4} speed={0.5} focus={[0.4, 0.5]} />` from `../../engine`, inside a scene. `from` is the trim in, in seconds. `speed` below 1 is slow motion, smooth down to the clip's rate over the ad's (a 60 fps clip slows to half without repeating frames). `at={(f) => seconds}` does ramps and freezes. Frame each shape with `focus` (the point that stays in frame) and `zoom`, so a 9:16 isn't just the middle of the 16:9.
- Only the brand's own videos come from a URL (`bun run footage <slug> <url> --own`): its channel, its posts, footage it owns. Pass `--own` only when that's true. A competitor's video, a news clip or a creator's post doesn't go in an ad, so ask if you aren't sure. The channel it came from goes in `sources.json`. Say it in the README.
- A person talking to camera has its own route, `.claude/guides/talking-head.md`, and its own cutter, `bun run take`: use it rather than cutting a spoken take by hand.
- If someone speaks in a clip, `mv.py words` on its `audio.wav` gives word times for captions. Read the transcript before you use it, since Whisper writes numbers as digits and mishears the odd word.
- Its sound (`audio.wav` next to the frames) is a cue: `{ src, at, trim, volume }`. Use it when it helps (footsteps, a breath, the place), or leave it out under the music.
- Originals and frames are gitignored. After a fresh clone, `bun run footage <slug>` unpacks the originals again.
- The footage is evidence of what happened, so don't make it say more: a person on screen is who the user says they are, and a clip of a run isn't a client's result unless the user says it is.
