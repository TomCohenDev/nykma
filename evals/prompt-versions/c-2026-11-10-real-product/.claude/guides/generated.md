# Generated media: an addition, not a replacement

Read this before you propose a generated still or video. Generated video and images are one more source, like Blender or the user's footage. Use them for what code can't make honestly, and only after free stock (`.claude/guides/stock.md`) came up empty.

- **Generate** only what has no honest source in free stock, code, Blender or real footage: a real-looking person and their reaction, a place, a physical thing in the world, a texture.
- **Don't generate** product UI, the logo, brand text or fonts, prices, claims, a real or named person, a testimonial or a result. Those come from `brands/` and the real app, built in code as always.
- **A generated person may use the product** on screen (a teacher with the app on the projector, a student at a laptop). What's on their screen is still the real UI, put there in code, and `post.md` says they're AI-generated.
- **Example:** "a trendy ad of someone looking at their phone with an O mouth, then the app". The person and the reaction are generated: a still first, then image-to-video from it. The cut to the app is the real UI, built in code. If the phone's screen shows in the clip, turn it away, blur it, or put the real UI on it in code. The model never draws the app.
- **Cheapest shot that works:** a still with a push-in done in code beats a clip, and 4-6 s beats 8. Generate without audio, since the ad's sound is made the usual way. A 1:1 ad can crop a 1080p 16:9 clip, or use a model that makes 1:1.
- **Each shot says why** in its `why`: what it shows that code can't.
- **Where it's made is the user's setting.** The brief says where stills and videos are made (from the desk's settings). Follow it: when it says Codex or this PC, don't swap in a paid model for quality. If a shot really needs another model (resolution, a last frame, over 10 s), say why in the pitch and offer it as an option, not the default.

## The flow

1. **Pitch.** Write `public/ads/<slug>/gen.json` and run `bun run gen <slug> --estimate` (free). Under "What the build will take", list each shot with its model and price (for a video on this PC, "this PC, about 3½ min"), and the total. Mark the storyboard rows that use one. Fix any problem it reports, such as a length or ratio the model doesn't take. Every video needs a `first` frame, a still made earlier in gen.json, so the user sees the frame before the video is paid for.
2. **Approval.** The user approves the stills' amount on the desk, in the project's Generated media panel, when they say go. Without it nothing is made. Stills with `"via": "codex"` cost no money (they use the user's ChatGPT plan), but still only after go.
3. **Stills.** `bun run gen <slug>` makes the stills not made yet, through the desk, which holds the keys. Then it stops with exit code 2 at the first video: Read the stills, tell the user they're ready to approve in the Generated media panel, and stop. If the approved budget doesn't cover a still it also stops with exit code 2: tell the user how much more and why, and stop. Both stops are the budget working: don't work around either.
4. **Retake notes.** If the user sends a still back with a note, change its prompt or settings in gen.json to match, run `bun run gen <slug>` again, and stop. They approve the new still before anything is made from it.
5. **Videos.** Once the user approves the stills, they press Make videos on the desk, and the desk makes them. You don't start a video. When they tell you to carry on, run `bun run gen <slug>` again: it makes nothing new and prints each video's `<Footage>` line and contact sheet.
6. **Use.** A made still is `public/ads/<slug>/generated/<id>.png`. A made video is unpacked like footage (`.claude/guides/footage.md`): Read the sheet, then cut it as you would real footage. A shot already made for the same request costs nothing again.
7. **Retakes** cost again, since any change to a prompt or setting is a new request. Allow one per shot within the pitch's amount, then ask.
8. **Disclosure.** `post.md` says what in the ad is AI-generated ("AI-generated: the person in the opening shot"), and the README lists each generated shot with its model and cost, from `generated/generated.json`. Platforms (TikTok, Meta, YouTube) and the EU require a label on realistic AI media, so the user needs this line to post it.

## gen.json

`gen.json` lists shots in the order they're made, so a still made first can be a video's first frame:

```json
{ "shots": [
  { "id": "gasp-still", "kind": "image", "model": "google/gemini-nano-banana-2.1", "prompt": "...", "why": "...",
    "aspect_ratio": "16:9", "resolution": "2K", "refs": [] },
  { "id": "gasp", "kind": "video", "model": "google/veo-3.1-fast", "prompt": "...", "why": "...",
    "seconds": 6, "resolution": "1080p", "aspect_ratio": "16:9", "first": "generated/gasp-still.png" }
] }
```

Video takes `seconds`, `resolution`, `aspect_ratio`, `first`, `last`, `refs`, `audio` (off) and `seed`. Image takes `aspect_ratio`, `resolution`, `quality`, `background` (`transparent` for a cut-out), `output_format`, `refs` and `seed`. Paths are from `public/ads/<slug>/`. Models are OpenRouter ids, and `--estimate` checks them against its live catalogue, except for a still through Codex and a video on this PC (below), which the brief picks:

- **Video:** `google/veo-3.1-fast` (16:9 and 9:16, 4, 6 or 8 s, first and last frame, about $0.10/s silent at 1080p), `kwaivgi/kling-v3.0-std` (1:1 too, 3-15 s, about $0.08/s), `minimax/hailuo-3-max` (1:1 too, 5-15 s, up to 768p, about $0.05-0.08/s).
- **Images:** `google/gemini-nano-banana-2.1` (people, products and first frames, up to 14 references, about $0.03-0.05), `openai/gpt-image-2.5-flare` (transparent backgrounds), `recraft/recraft-v4.1` and `recraft/recraft-v4.1-vector` (illustration, SVG), `black-forest-labs/flux-3-image-klein` (cheap drafts, about $0.01).
- **Images through Codex:** when the brief says so, write `"via": "codex"` on a still and leave out `model`. It's OpenAI's image model on the user's ChatGPT login: no money, but it counts against their plan. It takes `prompt`, `aspect_ratio` (it's cropped to fit from the centre, so compose with room at the edges), `background` and up to 10 `refs`, and ignores `resolution`, `quality` and `seed`. Video can't go through Codex.
- **Video on this PC:** when the brief says so, write `"via": "local"` and `"model": "ltx-2.5-q4"` on every video. It's LTX-2.5 running on this machine's GPU: no money, about 3½ minutes per 6 s clip at 720p, one clip at a time, and close to Veo 3.1 Fast (a little softer, with less detail in hands). It takes `seconds` 2-10, `aspect_ratio` `1:1`, `16:9` or `9:16` (1:1 made directly, no crop), `resolution` `480p`, `720p` (the default; 1280×704) or `1080p` (slower), a `first` frame, `audio` and `seed`. It takes no `last` and no `refs`. The same seed makes the same clip, so give each shot a `seed` and a retake a new one. The flow doesn't change: the video still waits for its approved still and the user's Make videos on the desk. In the pitch, put "this PC, about 3½ min" where the price goes, and add up the minutes. The prompt is used as written (no enhancer): describe the motion and the camera in one or two plain sentences. A locked-off camera with a flat green screen works for `bun run screen`. For a shot that's above 10 s or needs a last frame, use OpenRouter and say why in the pitch.

## The ad on a screen in the shot

"Someone at a computer, and the ad playing on it" is a generated clip with a green screen, and your own scene put on that screen in every frame, like a mockup:

1. Generate the clip with the screen as a flat chroma-key green. Put this in the prompt: "the monitor shows a flat, evenly lit chroma-key green screen filling the display edge to edge, no text, no interface, no reflections". Keep the camera locked off or slow, and keep the screen's corners in frame, though a hand or head may cover one. The same works for a phone in someone's hand. Footage the user shot with a green screen works too.
2. `bun run screen <slug> <clip>` finds the screen in every frame. It writes `src/ads/<slug>/<clip>.screen.json` (the corners, committed) and the plates and front images (the screen's box from each frame, with a hole where the screen shows), then prints a sheet. Read the sheet: the magenta outline must sit on the screen's edges. If the screen isn't green, give its first-frame corners with `--corners "x,y x,y x,y x,y"` (top-left, top-right, bottom-right, bottom-left). Then nothing in front of it is cut out, so avoid anything crossing it.
3. `<ScreenInsert track={pc} size={[1920, 1080]}>` (from `../../engine`, with `import pc from "./<clip>.screen.json"`) plays the clip and lays your scene on the screen at that size, frame for frame. Hands and heads stay in front, and it crops to each shape with `focus` and `zoom` like `<Footage>`. What's on the screen is the real UI or your ad's own scene, built in code as always. Use `size={[1170, 2532]}` for a phone, and `screenStyle={{ filter: "brightness(0.9)" }}` to sit it in the shot.
