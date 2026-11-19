# <slug>: pitch

brand: <brand>
mechanism: <what makes the ad work, in a phrase: `bun run history` lists it for the next ad>
bpm: <only if the ad has a beat; delete this line otherwise>

## The idea

<First line: the angle and the tension or joke.>
<Second line: the style.>

## The brief, as I read it

- Who's watching, and when: <the person and the moment>
- The one thing they take away: <one sentence>
- The proof: <the facts in brand.md, or the real feature, that back it>
- What they do next: <the action, and the link>
- Where the brief was open, I chose: <anything you decided, so the user can say no now>

## Storyboard

| Time | What happens | On-screen text | Voice | Image |
|---|---|---|---|---|
| 0:00-0:03 | <what we see> | <the words on screen> | <the words spoken> | <path, or leave empty for a plain card> |

Time is start-end: `0:03-0:06` or `3-6`. Rows follow on from each other. Image paths are relative to this folder, the repo, `public/` or the brand. Empty cells are fine.

## How it works

- The first two seconds: <what makes someone stay>
- The brand: <how a viewer who leaves early still knows whose ad it was>
- The product on screen: <what it really does, and where that comes from (brand.md, a screenshot, the app's code)>
- Invented: <how the ad stages it that the app doesn't really do, such as an answer that writes itself. `bun run claims` lists these in claims.md>
- Sound: <music, voice, effects, and how the ad reads with the sound off>
- Made with: <code, the real UI, footage, stock or generated shots>
- The risk: <the one way this could fail to land>
- Thumbnail: <when the brief asks for one: the cover's picture and its few words. Delete this line otherwise>

## Other routes

The ideas the explorers found that weren't picked, one line each with their mechanism, so "another idea" can start here. If there were no explorers, say why.

- <title>: <mechanism>. <one line>

## What the build will take

- Blender shots:
- ElevenLabs credits (`mv.py build --estimate`):
- Free stock (`bun run stock <slug> "query"`), searched first for each shot code can't make: "stock: found pexels:12345" or "no fit → generate":
- Generated media (`bun run gen <slug> --estimate`), only for what code and stock can't give: each shot, its model and price ("this PC, about 3½ min" for a video made locally), and the total money and GPU minutes. You approve it on the desk:
- Needed from you:
