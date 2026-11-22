# Checks, when the user asks for them

Read this when the user says "check it". There are two checks: the reviewer finds what could look better, and `validate` finds what's broken. Neither one decides whether the idea is good: that was decided at the pitch.

1. **Review.** `bun run review <slug>`. It works on stills, so don't render yet. Apply the adjustments you agree with, and give each one you decline a line in the README saying why. An adjustment that would change the idea, rather than fix how it's laid out, is declined. Recheck with `bun run review <slug> --frames <the frames that changed>`. One pass and one recheck, then anything open goes in the README: more rounds turn into taste, not fixes.
2. **Render and validate.** `bun run render <id> --ratio all`, then `bun run validate <slug>`. Fix every failure. Warnings go in the README.
3. **Deliberate failures.** If a failure in Render, Layout or Brand is the idea rather than a mistake, add `Deliberate: layout 120-300 <why>` to the README. It shows the user as a warning. Don't use this to get past a real problem. Sound, Truth and Copy can't be waived. An inline SVG logo needs `aria-label="logo"` to be found.

Fix the smallest thing that fixes the failure: a clipped caption is a caption fix, not a new scene. If a failure means the idea itself doesn't work (the message can't be read, the claim can't be supported), stop and tell the user instead of redesigning it.

Notes after the checks have run: fix, review only what changed, re-render, validate, in the same folder.

Then hand off (`.claude/guides/hand-off.md`).
