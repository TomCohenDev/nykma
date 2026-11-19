# <slug>: pitch

brand: <brand>
bpm: <only if the ad has a beat; delete this line otherwise>

## The idea

<First line: the angle and the tension or joke.>
<Second line: the style.>

## Storyboard

| Time | What happens | On-screen text | Voice | Image |
|---|---|---|---|---|
| 0:00-0:03 | <what we see> | <the words on screen> | <the words spoken> | <path, or leave empty for a plain card> |

Time is start-end: `0:03-0:06` or `3-6`. Rows follow on from each other. Image paths are relative to this folder, the repo, `public/` or the brand. Empty cells are fine.

## What the build will take

- Blender shots:
- ElevenLabs credits (`mv.py build --estimate`):
- Free stock (`bun run stock <slug> "query"`), searched first for each shot code can't make: "stock: found pexels:12345" or "no fit → generate":
- Generated media (`bun run gen <slug> --estimate`), only for what code and stock can't give: each shot, its model and price ("this PC, about 3½ min" for a video made locally), and the total money and GPU minutes. You approve it on the desk:
- Needed from you:
