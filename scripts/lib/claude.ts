/**
 * One headless `claude -p` call, for the scripts that ask a model something on the side (review, claims). It returns
 * stdout, which with `--output-format json` is the reply, even for a run that failed.
 */
import { spawn } from "node:child_process";

export function askClaude(args: string[], input: string, cwd: string, timeout = 5 * 60 * 1000) {
  return new Promise<string>((done, fail) => {
    const child = spawn("claude", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    const timer = setTimeout(() => {
      child.kill();
      fail(new Error(`no answer after ${timeout / 60000} minutes`));
    }, timeout);
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (errors += chunk));
    child.stdin.on("error", () => {}); // If it dies at once, "close" reports it.
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      fail(new Error(error.code === "ENOENT" ? "`claude` isn't on PATH. Install Claude Code and log in, then run this again." : error.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // With --output-format json a failed run still reports on stdout, and that's the better message.
      if (code === 0 || output.trim().startsWith("{")) done(output);
      else fail(new Error(`claude exited ${code}: ${(errors || output).trim().slice(-600) || "no output"}`));
    });
    child.stdin.end(input);
  });
}

/** The front matter's `model:` and the prompt below it, from an agent file's text. */
export function promptParts(text: string, file: string) {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  const model = front?.[1].match(/^model:\s*(\S+)/m)?.[1];
  if (!front || !model) throw new Error(`${file} needs front matter with model:`);
  return { model, system: front[2].trim() };
}
