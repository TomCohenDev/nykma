# Hand-off

Read this when the ad is done: after the checks, or when the user says "skip the checks" or "just finish it".

- **The files.** The renders go in `queue/<YYYY-MM-DD>-<slug>/`: every ratio and take, with sound and silent, and the MP3.
- **README.md** from `queue/_template/README.md`: the takes, a claim → evidence row for every product action on screen, the checks with the open ones unticked, the adjustments you declined and the warnings left. "Skip the checks" means the README says the ad wasn't checked.
- **post.md** from `queue/_template/post.md`: the idea in two lines, a caption per platform written natively for it, and every link with `?utm_source=<platform>&utm_medium=social&utm_campaign=<slug>`. It says what's AI-generated and credits each stock shot.
- **Notes for next time.** If the user said something during this ad that should hold for the brand's next ones ("never the handwriting", "music only"), add it to `brands/<brand>/notes.md` with the date and the slug, in a line or two. Not a one-off note for this ad.
- **The reply.** A few lines: what's in the queue, what was and wasn't checked, and what the user needs to do. Say only what you ran and saw.
- Open a GitHub issue or PR with `gh` only if asked, from a terminal session: runs from the desk don't have `gh`.
