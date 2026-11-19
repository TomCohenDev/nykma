/**
 * What an agent run may and may not do: the desk's runs (desk.ts) and `bun run eval` (eval.ts) use the same lists, so
 * an eval tests the prompt under the same limits the real runs have. The hard rules in ad-agent.md say these limits
 * exist; this is where they're enforced (spec.md §10.10).
 */
export const ALLOWED = [
  "Read", "Write", "Edit", "Glob", "Grep",
  // ad-agent's concept explorers (its own tools line allows only that one agent).
  "Agent",
  "Bash(bun:*)", "Bash(bunx:*)", "Bash(node:*)", "Bash(ffmpeg:*)", "Bash(ffprobe:*)",
  "Bash(.venv/Scripts/python:*)", "Bash(.venv/bin/python:*)", "Bash(mkdir:*)", "Bash(cp:*)", "Bash(mv:*)", "Bash(ls:*)",
  // Reading in the shell. Without these, a chained command with one of them in it is refused and costs a turn.
  "Bash(cat:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(sed -n:*)", "Bash(grep:*)", "Bash(wc:*)", "Bash(find:*)", "Bash(echo:*)", "Bash(pwd)",
];

/**
 * An agent run gets no Claude Code memory: the auto-memory a person's own sessions keep would otherwise reach the agent
 * as an index it can open, outside the instructions (the 2026-11-08 eval caught it reading two memory files before a
 * pitch). Standing feedback for ads goes in brands/<brand>/notes.md instead. Set in an agent run's environment.
 */
export const AGENT_ENV = { CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" };

// The key store, budgets and spend ledger are outside the repo (keys.ts). These rules stop the file tools and the shell
// commands Claude Code recognises; the keys for paid images and video never enter an agent's process at all. No MCP:
// a vendor's server would skip the budget and the cache.
const KEY_STORE = "~/.config/nykma/**";
// Codex's ChatGPT login is the desk's to use for stills, not an agent's: no reading it and no running Codex.
const CODEX_HOME = "~/.codex/**";

export const DENIED = [
  "Read(**/.env)", "Read(**/.env.*)", `Read(${KEY_STORE})`, `Edit(${KEY_STORE})`, `Write(${KEY_STORE})`,
  `Read(${CODEX_HOME})`, `Edit(${CODEX_HOME})`, `Write(${CODEX_HOME})`,
  // Claude Code's per-project memory, as a backstop to AGENT_ENV.
  "Read(~/.claude/projects/**)", "Edit(~/.claude/projects/**)", "Write(~/.claude/projects/**)",
  "Bash(gh:*)", "Bash(git push:*)", "Bash(curl:*)", "Bash(security:*)", "Bash(codex:*)", "mcp__*",
];
