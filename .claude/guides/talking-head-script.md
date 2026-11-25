# The script and the recording

Read this when you write what someone will say to camera, and the sheet they record from. `talking-head.md` has the route.

## Lines that can be said

- **One line per scene,** in the language the person speaks. A line is one thought, 8 to 15 words, said in one breath. A longer thought is two lines: the person will pause between them anyway, and the cut needs that pause.
- **Write it the way they talk,** not the way they write: short words, spoken order, contractions. Read it aloud at their pace; anything you stumble on, they will too. When you have their past takes (`bun run history <brand>`, the queue's `cut.md` files), borrow their phrasing: what they improvised last time is how they talk.
- **Length:** about 150 words a minute for a relaxed tutorial, 170 for a punchy reel; the speaker's past takes give their own pace. Count words, not seconds.
- **The hook is the first line, said in the first three seconds,** and it carries the whole proposition: the claim, the contrast or the question. It opens on the person already talking: no wave, no "hi", no silent shot, unless the user asks.
- **One idea per line, one thread through the video:** the same rules as any ad (ad-agent, Craft). A tutorial's steps are numbered lines ("שלב אחד…"), so the viewer can count.
- **Anything a viewer copies stays in the product's language** (prompts, menu names, code, header rows), usually English, also inside a Hebrew line. Name menus as the product's current help pages do.
- **Claims are spoken claims.** A number or a result in a line needs its source in `brand.md` like on-screen text. "It saves me hours" is the person's own experience; "it saves you hours" needs proof.
- **End on the last thing worth saying.** The link and the call to action go in the post copy unless the brief asks for them out loud.

## script.md

From `queue/_template/script.md`: a table with an `id` (a short slug, `hook`, `sheet`, `run`), the line to say, and what's on screen. `bun run take` reads it, so the ids become the scenes. Below the table, the recording sheet.

## The recording sheet

What the person needs to record a take that cuts well. Put it under the script, short, in their language:

- **One take of the whole script,** in order, retakes allowed. "If you slip, pause, then say the whole line again from its start" gives the best take: the cutter finds a retake by its opening words, and a line restarted mid-sentence is harder to place. Don't stop the recording between lines.
- **Five seconds of silence first,** not moving. It gives the room's sound, so a cut never jumps in noise. A count-in ("1, 2, 3") is fine; it's cut.
- **The phone at eye level, on something steady,** the lens at the eyes, a window or soft light in front, not behind or above. Look at the lens, not the screen.
- **Framing:** vertical, from the chest up, with room above the head. For a video where they'll be a circle over screens, step back a little (face about a quarter of the frame's height): a take framed close can't be shown smaller in a square without cutting the head.
- **1080p or 4K at a constant frame rate,** so a punch-in stays sharp. Phones: turn off "auto frame rate" or "cinematic" modes.
- **Sound:** a clip-on or USB mic close to the mouth beats the phone's own. A mic recorded separately is fine: hand over both files, and `bun run take --mic` lines them up.
- **Hold still for half a second** before the first line and after the last.
- **Screens they'll show:** record them at the video's ratio (9:16 on a phone, or a window sized for it), with the real account, after the take, following the same steps.
