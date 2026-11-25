# The picture around a person talking

Read this when you build a talking head. `talking-head.md` has the route; `build.md` and `engine.md` hold for everything else. The brand's `notes.md` wins over every default here.

## The parts

`src/parts/take.tsx`, with the cut imported as data:

```tsx
import cut from "./take.json";
import { SpokenCaptions, TakeCam, cutZoom, punch, saidAt, useTakeData, voiceCues } from "../../parts";

const take = useTakeData(cut);
const s = take.scene("hook");
// registry: { id: "hook", component: Hook, frames: s.frames, cues: voiceCues(take, s) }
<div style={{ position: "absolute", left: 34, top: 1500, width: 384, height: 384, borderRadius: 192, overflow: "hidden" }}>
  <TakeCam take={take} scene={s} w={384} h={384} zoom={cutZoom(s, f) * punch(f, [saidAt(s, "שלב")])} />
</div>
<SpokenCaptions words={s.words} style={{ left: 60, top: 1270, width: 960, height: 220 }} accent="#BF95F9" font={HE} />
```

- `voiceCues` plays each part of the scene from the cleaned voice, trimmed in frames, with 10 ms fades. Picture and sound read the same parts, so lips stay in sync through every cut.
- `TakeCam` frames the face from the cutter's face data: `place` is where the face's centre lands in the box, `face` its height (forehead to chin) as a share of the box. It never shows past the clip's edge, so a close take in a square stays bigger than asked (validate says so). Put it inside the shape that clips it: a circle, a rounded frame.
- `cutZoom` hides the jump cuts inside a line: it alternates the framing between 1 and 1.1 at each cut where the head moved, which reads as a second camera, and leaves it alone where the head held still. `punch` is a short push-in that settles, for a word that lands.
- `SpokenCaptions` sets the person's own words a page at a time, word by word as said, from the cut. `saidAt(scene, "word")` is the frame a word is said, to time anything else to it.
- A bespoke look (the brand's frame, its own caption style) can copy any of these into the ad's kit and change it.

## Framing

- **In a circle over screens** (330 to 400 px at 1080 wide): `place` about `[0.5, 0.44]`, `face` 0.4 to 0.5. The whole head shows, the face in the middle. The circle sits at a bottom corner, almost touching the bottom, partly over the screen and above it, never under it.
- **Filling the frame:** the eyes on the upper third (30 to 38% from the top): `place` about `[0.5, 0.36]`, `face` 0.18 to 0.24. A clip of the frame's own shape can't move without a zoom; `zoom` 1.05 gives it room.
- **Check it on a still,** not in your head: a face too low, too close or cut at the forehead was the most common note before there was a check, and `validate --layout` now fails a forehead or chin outside the camera and warns on a face off-centre, low, too close or too small, or text across it.
- **Zoom limits:** never past about 1.2 in total on a 1080p take, or it softens. Never zoom across a cut to a screen.

## Layout by ratio

- **9:16 tutorial** (the default unless the brand's notes say otherwise): the screen fills the frame inside a little padding (about 36 px a side), the person a circle at a bottom corner, captions just above the circle and beside it, a step label at the top above the screen. Layers, bottom to top: background, screen, step label, circle, captions.
- **9:16 without a screen** (the hook, a story beat, the payoff): the person fills the frame. Two shots in the first five seconds: open on them, then a screen, a sticker or a punch-in.
- **9:16 split**, for a screen that's wide: the screen in the top 55%, the person below it filling the width.
- **1:1:** the screen fills the square, the circle at a bottom corner, about 300 px.
- **16:9:** a circle of 200 to 240 px at 1080p, inset 48 px at the bottom right, or the left when the product's UI lives at the right.
- Every layout keeps text inside the safe areas in `build.md` (9:16: clear of the top 200 px and bottom 320 px).

## Captions

- **The rail is the default:** the spoken words, a page at a time, the same place every scene. 2 to 4 words a page, at most about 22 characters, a new page after punctuation and at a pause. Big and bold: 72 to 92 px at 1080 wide. On a dark backing or with a heavy shadow, so they read over anything.
- **Where:** bottom-aligned in a box whose bottom is above the 320 px safe area, and never over the face (validate checks). With the person filling the frame, below the chin.
- **Highlight one or two words a line** (`hl` in `cut.json`): the number, the product, the payoff. One accent colour, the brand's. A highlight everywhere is a highlight nowhere.
- **An embed** (one huge word on the screen, behind or beside the person) is rare and earned: at most one a scene, never two on screen at once.
- **Hebrew** reads right to left with English kept left to right inside it (`SpokenCaptions` does it). A highlight marks a whole word: a Hebrew prefix (ה־, ב־, ו־) is part of the word it's on.

## Motion: something changes every 2 to 4 seconds

A still screen with a caption under it reads as "not clear enough", and a person talking with nothing moving reads as long. The change can be a cut, a scale (a jump cut zoom, a punch on a beat), a screen springing in, a sticker on a key word, a number counting up, the camera moving across a screen to what the line is about. Time each to the word it belongs to (`saidAt`), entering at most half a second before it. Keep the first half-second of a line clear of new graphics, so the viewer hears it begin. One motion language for the whole video (ad-agent, Craft).

## Screens of real products

- Draw a product's screens in code from its real UI, simplified, and say in the README that they're redrawn. Use the product's own names for its menus, from its current help pages, and tell the user to check their account before posting, since menus change. A screen recording the user made is better still: crop and frame it, don't restyle it.
- In a right-to-left video, give every product UI root `dir="ltr"`, or its layout mirrors. Latin words inside Hebrew text go in `<bdi>`.
- When the camera zooms into a screen, clamp the translate so the edge never shows blank space.
- Data on a screen (businesses, people, numbers) is invented unless the user gave it, and the README says so. Mask phone numbers.
- Another company's public page in a "you don't need to pay for X" hook is commentary: record it at the video's ratio, cross it out, and put no claim on it the page doesn't make.

## Sound

- The voice is the cut's `voice.wav`. `render` normalises the whole mix to -14 LUFS, so judge music against the voice: 12 to 18 dB under it, which is about `volume: 0.03` to `0.06` on a music cue. Listen to the render, not the track. When the cut's length changes, a cached music track is reused at no cost: set the spec's `duration` to the new length and let `fade_out` end it.
- No sound effect on every cut. A soft one on a sticker or a punch is fine when the brand's notes allow it.

## End

- The video ends when the content ends: no end card, CTA, site or teaser unless the brief or the brand's notes ask. Where the link goes is the post copy's job.
- For a blog or a site, render a small copy too (`ffmpeg -vf scale=540:-2 -crf 28`, a few MB) with a still as its poster.
