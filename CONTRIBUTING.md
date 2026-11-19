# Contributing

Thanks for helping. Issues, ideas and pull requests are all welcome.

## Before a pull request

- Read `CLAUDE.md`. Its code rules hold for everyone: every value is a function of the frame, nothing imports from `gen/`, and the board owns `story.json`.
- Run `bun run typecheck`, and render the ad your change touches (`bun run render <id>`).
- When you change how nykma works, update `spec.md` and add a dated entry to `CHANGELOG.md`.
- A change to the agent's instructions (`.claude/agents/`, `.claude/guides/`) is code. Compare it with `bun run eval` (`evals/README.md`) and say what changed.

## The contributor licence agreement

nykma is free for personal use and sold to companies (`COMMERCIAL.md`). For that to work, the maintainer needs the right to include your contribution in both. The first time you open a pull request, a bot asks you to agree to [`.github/CLA.md`](.github/CLA.md) with one comment. You keep the copyright in your work.
