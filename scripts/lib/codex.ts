/**
 * Generated stills through Codex on your ChatGPT login (spec.md §6.6), the way T3 Code and the Codex app talk to it:
 * `codex app-server`, JSON-RPC over stdio, one line per message. No API key: Codex uses the login in ~/.codex, and a
 * still counts against the ChatGPT plan's limits instead of costing money.
 *
 * Each still is one ephemeral thread in an empty temp folder, read-only, that may not run commands or ask for approval.
 * The turn asks for the image tool once; the `imageGeneration` item that comes back has the file (`savedPath`) or the
 * bytes (`result`). Only the desk runs this, like the OpenRouter calls, so no agent drives Codex itself.
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";

export const CODEX_TERMS = "https://openai.com/policies/row-terms-of-use/";
const IMAGE_TIMEOUT_MS = Number(process.env.NYKMA_CODEX_TIMEOUT_MS ?? 6 * 60_000);

/**
 * The Codex binary: the one in Settings, else `codex` on the PATH, else the Codex desktop app's own copy (on Windows
 * in %LOCALAPPDATA%\OpenAI\Codex\bin\<build>\, the newest build). NYKMA_CODEX swaps it, for tests.
 */
export function findCodex(configured = ""): string | undefined {
  if (process.env.NYKMA_CODEX) return process.env.NYKMA_CODEX;
  if (configured.trim()) return existsSync(configured.trim()) || !/[\\/]/.test(configured) ? configured.trim() : undefined;
  const names = process.platform === "win32" ? ["codex.exe", "codex.cmd"] : ["codex"];
  for (const dir of (process.env.PATH ?? "").split(delimiter))
    for (const name of names) if (dir && existsSync(join(dir, name))) return join(dir, name);
  const apps =
    process.platform === "win32"
      ? [join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "OpenAI", "Codex", "bin")]
      : process.platform === "darwin"
        ? ["/Applications/Codex.app/Contents/Resources", join(homedir(), "Applications", "Codex.app", "Contents", "Resources")]
        : [];
  for (const dir of apps) {
    if (!existsSync(dir)) continue;
    if (existsSync(join(dir, names[0]))) return join(dir, names[0]);
    const builds = readdirSync(dir)
      .map((build) => join(dir, build, names[0]))
      .filter((path) => existsSync(path))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (builds[0]) return builds[0];
  }
  return undefined;
}

type Pending = { done: (value: any) => void; fail: (error: Error) => void };

/** A `codex app-server` process: requests with ids, notifications to a handler, and any request from Codex declined. */
class AppServer {
  private child: ChildProcess;
  private shell = false;
  private next = 1;
  private pending = new Map<number, Pending>();
  private buffer = "";
  private stderr = "";
  onNotification: (method: string, params: any) => void = () => {};
  closed: Promise<void>;

  constructor(bin: string) {
    // An npm-installed codex on Windows is a .cmd, which only runs through a shell.
    const shell = (this.shell = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin));
    this.child = spawn(shell ? `"${bin}"` : bin, ["app-server"], { stdio: ["pipe", "pipe", "pipe"], shell, windowsHide: true });
    this.child.stdout!.setEncoding("utf8");
    this.child.stdout!.on("data", (chunk: string) => {
      this.buffer += chunk;
      let end: number;
      while ((end = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, end).trim();
        this.buffer = this.buffer.slice(end + 1);
        if (line) this.receive(line);
      }
    });
    this.child.stderr!.on("data", (chunk) => (this.stderr = `${this.stderr}${chunk}`.slice(-2000)));
    this.closed = new Promise((done) => {
      const fail = (why: string) => {
        for (const pending of this.pending.values()) pending.fail(new Error(why));
        this.pending.clear();
        done();
      };
      this.child.on("error", (error) => fail(`Codex didn't start (${bin}): ${error.message}`));
      this.child.on("exit", (code) => fail(`Codex stopped (exit ${code}).${this.stderr ? ` ${this.stderr.trim().split("\n").pop()}` : ""}`));
    });
  }

  private receive(line: string) {
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id !== undefined && message.method) {
      // Codex asking us something (an approval, a question): nykma answers no to all of it.
      this.write({ id: message.id, error: { code: -32601, message: "nykma's desk doesn't allow this." } });
      return;
    }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (!pending) return;
      if (message.error) pending.fail(new Error(String(message.error.message ?? JSON.stringify(message.error))));
      else pending.done(message.result);
      return;
    }
    if (message.method) this.onNotification(message.method, message.params);
  }

  private write(message: unknown) {
    this.child.stdin!.write(`${JSON.stringify(message)}\n`);
  }

  request<T = any>(method: string, params: unknown): Promise<T> {
    const id = this.next++;
    return new Promise<T>((done, fail) => {
      this.pending.set(id, { done, fail });
      this.write({ id, method, params });
    });
  }

  notify(method: string, params?: unknown) {
    this.write(params === undefined ? { method } : { method, params });
  }

  async start() {
    await this.request("initialize", { clientInfo: { name: "nykma", title: "nykma desk", version: "0.1.0" } });
    this.notify("initialized");
  }

  close() {
    this.child.stdin?.end();
    // Through a shell, kill() stops only cmd.exe, so the whole tree goes.
    if (this.shell && this.child.pid && this.child.exitCode === null) execFile("taskkill", ["/pid", String(this.child.pid), "/T", "/F"], () => {});
    else this.child.kill();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, fail) => (timer = setTimeout(() => fail(new Error(`${what} took over ${Math.round(ms / 1000)} s.`)), ms)));
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

export type CodexAccount = { ok: boolean; detail: string; email?: string; plan?: string; images?: boolean };

/** Whether Codex is there, logged in to ChatGPT, and can make images. Free: no turn is started. */
export async function codexAccount(bin: string | undefined): Promise<CodexAccount> {
  if (!bin) return { ok: false, detail: "Codex isn't installed. Install the Codex app or CLI and log in with ChatGPT, or set its path below." };
  const server = new AppServer(bin);
  try {
    await withTimeout(server.start(), 20_000, "Starting Codex");
    const [account, caps] = await withTimeout(
      Promise.all([server.request("account/read", { refreshToken: false }), server.request("modelProvider/capabilities/read", {}).catch(() => ({ imageGeneration: undefined }))]),
      20_000,
      "Asking Codex for its login",
    );
    const who = account?.account;
    if (!who) return { ok: false, detail: "Codex is installed, but not logged in. Run codex login, or log in in the Codex app." };
    if (who.type !== "chatgpt") return { ok: false, detail: `Codex is logged in with ${who.type === "apiKey" ? "an API key" : who.type}, not ChatGPT. Log in with ChatGPT so stills use the plan, not paid API calls.` };
    if (caps?.imageGeneration === false) return { ok: false, email: who.email, plan: who.planType, images: false, detail: "Logged in, but this Codex can't make images. Update it." };
    return { ok: true, email: who.email, plan: who.planType, images: caps?.imageGeneration, detail: "Connected" };
  } catch (error) {
    return { ok: false, detail: (error as Error).message };
  } finally {
    server.close();
  }
}

export type CodexImage = { bytes: Buffer; ext: string; revisedPrompt?: string; generationId?: string };

/**
 * One still. `refs` are absolute paths of images to work from. `progress` hears what Codex is doing. Throws with
 * Codex's own reason when it makes nothing, including the plan's limit and when it resets.
 */
export async function codexImage(bin: string, shot: { prompt: string; aspect_ratio?: string; background?: string; refs: string[] }, progress: (message: string) => void = () => {}): Promise<CodexImage> {
  const cwd = mkdtempSync(join(tmpdir(), "nykma-codex-"));
  const server = new AppServer(bin);
  try {
    await withTimeout(server.start(), 30_000, "Starting Codex");
    const ask = [
      "Make exactly one image with your image generation tool, from the brief below, and nothing else.",
      "Don't run commands, write code, edit files or ask questions. Don't add text, captions, logos or watermarks unless the brief asks for them.",
      shot.aspect_ratio ? `Aspect ratio: ${shot.aspect_ratio}. Compose for that frame with a little room at the edges, since it may be cropped to exactly ${shot.aspect_ratio}.` : "",
      shot.background === "transparent" ? "Background: transparent." : "",
      shot.refs.length ? `The ${shot.refs.length === 1 ? "attached image is a reference" : `${shot.refs.length} attached images are references`}: match what the brief says to take from them.` : "",
      "",
      "Brief:",
      shot.prompt,
    ]
      .filter((line, i, all) => line || all[i - 1])
      .join("\n");
    const thread = await server.request("thread/start", {
      cwd,
      sandbox: "read-only",
      approvalPolicy: "never",
      ephemeral: true,
      serviceName: "nykma",
      developerInstructions: "You are making a single image for a video ad. Use only the image generation tool. Never run shell commands or edit files.",
    });
    const threadId = thread?.thread?.id ?? thread?.threadId;
    if (!threadId) throw new Error("Codex didn't start a thread.");

    let image: any;
    let drawing = false;
    const finished = new Promise<any>((done) => {
      server.onNotification = (method, params) => {
        if (params?.threadId && params.threadId !== threadId) return;
        if (method === "item/started" && params?.item?.type === "imageGeneration" && !drawing) {
          drawing = true;
          progress("Codex is drawing the still");
        }
        if (method === "item/completed" && params?.item?.type === "imageGeneration") image = params.item;
        if (method === "turn/completed") done(params.turn);
      };
    });
    progress("Codex is reading the brief");
    await server.request("turn/start", {
      threadId,
      input: [{ type: "text", text: ask }, ...shot.refs.map((path) => ({ type: "localImage", path }))],
    });
    const turn = await withTimeout(Promise.race([finished, server.closed.then(() => Promise.reject(new Error("Codex stopped before the still was made.")))]), IMAGE_TIMEOUT_MS, "The still");

    if (image?.failure?.type === "usageLimitExceeded") {
      const when = image.failure.resetsAt ? ` It resets ${new Date(image.failure.resetsAt * 1000).toLocaleString()}.` : "";
      throw new Error(`The ChatGPT plan's image limit is used up.${when}`);
    }
    if (!image) throw new Error(turn?.error?.message ? `Codex made no image: ${turn.error.message}` : "Codex finished without making an image.");
    if (image.savedPath && existsSync(image.savedPath)) {
      const ext = (image.savedPath.match(/\.(png|jpe?g|webp)$/i)?.[1] ?? "png").toLowerCase().replace("jpeg", "jpg");
      return { bytes: readFileSync(image.savedPath), ext, revisedPrompt: image.revisedPrompt ?? undefined, generationId: image.generationId ?? undefined };
    }
    if (typeof image.result === "string" && image.result.length > 100) {
      const bytes = Buffer.from(image.result.replace(/^data:[^,]+,/, ""), "base64");
      const ext = bytes[0] === 0xff ? "jpg" : bytes.subarray(8, 12).toString() === "WEBP" ? "webp" : "png";
      return { bytes, ext, revisedPrompt: image.revisedPrompt ?? undefined, generationId: image.generationId ?? undefined };
    }
    throw new Error(`Codex said the image was ${image.status ?? "made"}, but sent neither the file nor its bytes.`);
  } finally {
    server.close();
    // On Windows Codex can still hold its working folder for a moment after it exits. A temp folder left behind is
    // harmless; losing the still because of it isn't, so retry and then let it go.
    try {
      rmSync(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch (error) {
      progress(`left ${cwd} behind (${(error as Error).message.split(":")[0]})`);
    }
  }
}
