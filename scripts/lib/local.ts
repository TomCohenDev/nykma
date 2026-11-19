/**
 * Video made on this PC (spec.md §6.9): ComfyUI portable in ~/nykma-local, running LTX-2.5 from a fixed workflow.
 * No money and no key, just the GPU's time. `bun run local:setup` installs it; the desk starts ComfyUI when a shot
 * needs it, on 127.0.0.1 only and with ComfyUI's paid cloud nodes off, and makes one clip at a time.
 *
 * The workflow is ComfyUI's own LTX-2.5 image-to-video template, exported to API format in comfy/. Only its inputs
 * change per shot: the prompt, the first frame, the length, the shape and size, and the seed. Nodes are found by id and
 * checked by type, so an export from a newer template fails loudly instead of filling the wrong node.
 */
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

export const LOCAL_HOME = process.env.NYKMA_LOCAL ?? join(homedir(), "nykma-local");
export const COMFY_DIR = join(LOCAL_HOME, "ComfyUI_windows_portable");
export const COMFY_PYTHON = join(COMFY_DIR, "python_embeded", "python.exe");
export const MODELS_DIR = join(COMFY_DIR, "ComfyUI", "models");
const URL_BASE = process.env.NYKMA_COMFY_URL ?? "http://127.0.0.1:8188";
const PID_FILE = join(LOCAL_HOME, "comfyui.pid");
const LOG_FILE = join(LOCAL_HOME, "comfyui.log");
const TIMEOUT_MS = 60 * 60_000;

export const COMFY_RELEASE = {
  version: "v0.44.0",
  url: "https://github.com/Comfy-Org/ComfyUI/releases/download/v0.44.0/ComfyUI_windows_portable_nvidia.7z",
  bytes: 2_054_382_457,
};

/** A file in a Hugging Face repo, downloaded to models/<into>/<path> (into is "" when the repo mirrors ComfyUI's folders). */
export type ModelFile = { repo: string; path: string; bytes: number; into?: string };
export const modelPath = (file: ModelFile) => join(MODELS_DIR, file.into ?? "", file.path);

/** A ComfyUI add-on a model needs, cloned into custom_nodes at a fixed commit. */
export type Addon = { name: string; repo: string; commit: string };

export type LocalModel = {
  id: string;
  name: string;
  workflow: string;
  files: ModelFile[];
  /** A GGUF build of the main model, loaded through ComfyUI-GGUF in place of the workflow's own loader. */
  gguf?: string;
  addons?: Addon[];
  /** Whole seconds it takes. */
  seconds: [number, number];
  fps: number;
  aspects: string[];
  /** Resolution names to the short side in pixels. */
  sizes: Record<string, number>;
  licence: string;
  /** Minutes for a 6 s clip at 720p, measured on a 4070 Ti SUPER (16 GB) with 32 GB of RAM. */
  minutes: number;
};

export const LOCAL_MODELS: LocalModel[] = [
  {
    id: "ltx-2.5",
    name: "LTX-2.5 distilled (Lightricks)",
    workflow: "ltx-2.5-i2v.json",
    files: [
      { repo: "Lightricks/LTX-2.5", path: "diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors", bytes: 21_500_000_000 },
      { repo: "Lightricks/LTX-2.5", path: "text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors", bytes: 15_370_000_000 },
      { repo: "Lightricks/LTX-2.5", path: "vae/ltx-2.5-video-vae-bf16.safetensors", bytes: 1_470_000_000 },
      { repo: "Lightricks/LTX-2.5", path: "vae/ltx-2.5-audio-vae-bf16.safetensors", bytes: 360_000_000 },
      { repo: "Lightricks/LTX-2.5", path: "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors", bytes: 1_000_000_000 },
      { repo: "Comfy-Org/gemma-4", path: "text_encoders/gemma4_e2b_it_int8_convrot.safetensors", bytes: 5_200_000_000 },
    ],
    seconds: [2, 10],
    fps: 24,
    aspects: ["1:1", "16:9", "9:16"],
    sizes: { "480p": 480, "720p": 720, "1080p": 1080 },
    licence: "https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x",
    minutes: 30, // 20 GB doesn't fit 16 GB, so ComfyUI streams it from RAM: 166 s a step
  },
  {
    // The same model in 14 GB (Unsloth's dynamic 4-bit), so it fits a 16 GB card instead of streaming from RAM.
    id: "ltx-2.5-q4",
    name: "LTX-2.5 distilled, 14 GB (Unsloth GGUF)",
    workflow: "ltx-2.5-i2v.json",
    gguf: "distilled/ltx-2.5-22b-distilled-UD-Q4_K_XL.gguf",
    addons: [{ name: "ComfyUI-GGUF", repo: "https://github.com/city96/ComfyUI-GGUF.git", commit: "6ea2651e7df66d7585f6ffee804b20e92fb38b8a" }],
    files: [
      { repo: "unsloth/LTX-2.5-GGUF", path: "distilled/ltx-2.5-22b-distilled-UD-Q4_K_XL.gguf", into: "diffusion_models", bytes: 14_000_000_000 },
      { repo: "Lightricks/LTX-2.5", path: "text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors", bytes: 15_370_000_000 },
      { repo: "Lightricks/LTX-2.5", path: "vae/ltx-2.5-video-vae-bf16.safetensors", bytes: 1_470_000_000 },
      { repo: "Lightricks/LTX-2.5", path: "vae/ltx-2.5-audio-vae-bf16.safetensors", bytes: 360_000_000 },
      { repo: "Lightricks/LTX-2.5", path: "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors", bytes: 1_000_000_000 },
      { repo: "Comfy-Org/gemma-4", path: "text_encoders/gemma4_e2b_it_int8_convrot.safetensors", bytes: 5_200_000_000 },
    ],
    seconds: [2, 10],
    fps: 24,
    aspects: ["1:1", "16:9", "9:16"],
    sizes: { "480p": 480, "720p": 720, "1080p": 1080 },
    licence: "https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x",
    minutes: 3.5, // fits: 4 s a step, and its clip came out SSIM 0.975 against the full model's
  },
];

const addonThere = (addon: Addon) => existsSync(join(COMFY_DIR, "ComfyUI", "custom_nodes", addon.name));

export const localModel = (id: string) => LOCAL_MODELS.find((model) => model.id === id);

/** A model file is there if it's at least 99% of its listed size (the listed sizes are rounded). */
const fileThere = (file: ModelFile) => {
  const path = modelPath(file);
  return existsSync(path) && statSync(path).size >= file.bytes * 0.99;
};

/** What a model still needs: missing files by name, and missing add-ons. */
export const missingFor = (model: LocalModel) => [
  ...model.files.filter((file) => !fileThere(file)).map((file) => basename(file.path)),
  ...(model.addons ?? []).filter((addon) => !addonThere(addon)).map((addon) => `the ${addon.name} add-on`),
];

export type LocalStatus = { installed: boolean; running: boolean; models: { id: string; name: string; missing: string[] }[]; detail: string; ok: boolean };

export async function localStatus(): Promise<LocalStatus> {
  const installed = existsSync(COMFY_PYTHON);
  const running = installed && (await alive());
  const models = LOCAL_MODELS.map((model) => ({ id: model.id, name: model.name, missing: missingFor(model) }));
  const ready = models.filter((model) => !model.missing.length);
  const ok = installed && ready.length > 0;
  const detail = !installed
    ? "Not installed. Run: bun run local:setup"
    : !ready.length
      ? `ComfyUI is installed, but ${models[0].name} is missing ${models[0].missing.join(", ")}. Run: bun run local:setup`
      : `${ready.map((model) => model.name).join(", ")} ready, ${running ? "ComfyUI running" : "ComfyUI starts when a clip needs it"}`;
  return { installed, running, models, detail, ok };
}

/** What stops a local video shot from being made as written. */
export function localProblems(shot: { model: string; seconds?: number; aspect_ratio?: string; resolution?: string; last?: string; refs?: string[] }): string[] {
  const model = localModel(shot.model);
  if (!model) return [`"${shot.model}" isn't a local model. It's one of ${LOCAL_MODELS.map((item) => item.id).join(", ")}`];
  const problems: string[] = [];
  if (!existsSync(COMFY_PYTHON)) problems.push("local video isn't installed on this PC. Run: bun run local:setup");
  else {
    const missing = missingFor(model);
    if (missing.length) problems.push(`${model.name} is missing ${missing.join(", ")}. Run: bun run local:setup`);
  }
  const [min, max] = model.seconds;
  if (shot.seconds !== undefined && (shot.seconds < min || shot.seconds > max)) problems.push(`${model.id} makes ${min} to ${max} seconds`);
  if (shot.aspect_ratio && !model.aspects.includes(shot.aspect_ratio)) problems.push(`aspect_ratio ${shot.aspect_ratio} isn't one of ${model.aspects.join(", ")}`);
  if (shot.resolution && !(shot.resolution in model.sizes)) problems.push(`resolution ${shot.resolution} isn't one of ${Object.keys(model.sizes).join(", ")}`);
  if (shot.last) problems.push(`the local workflow takes a first frame only, so leave out "last"`);
  if (shot.refs?.length) problems.push(`the local workflow takes no reference images`);
  return problems;
}

/* ── ComfyUI ───────────────────────────────────────────────────────────────────────────────────────── */

async function alive() {
  try {
    return (await fetch(`${URL_BASE}/system_stats`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

/** Starts ComfyUI if it isn't running, and waits until it answers. It keeps running after the desk stops. */
export async function startComfy(say: (message: string) => void = () => {}) {
  if (await alive()) return;
  if (!existsSync(COMFY_PYTHON)) throw new Error("Local video isn't installed on this PC. Run: bun run local:setup");
  say("Starting ComfyUI");
  const log = openSync(LOG_FILE, "a");
  const child = spawn(COMFY_PYTHON, ["-s", "ComfyUI/main.py", "--windows-standalone-build", "--listen", "127.0.0.1", "--port", new URL(URL_BASE).port || "8188", "--offline"], {
    cwd: COMFY_DIR,
    detached: true,
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));
  const until = Date.now() + 180_000;
  while (Date.now() < until) {
    if (await alive()) return;
    if (child.exitCode !== null) break;
    await sleep(2000);
  }
  throw new Error(`ComfyUI didn't start. Its log is ${LOG_FILE}.`);
}

/** Stops the ComfyUI this desk started, and frees the GPU's memory. */
export async function stopComfy() {
  if (!existsSync(PID_FILE)) return false;
  const pid = readFileSync(PID_FILE, "utf8").trim();
  rmSync(PID_FILE, { force: true });
  if (!/^\d+$/.test(pid)) return false;
  if (process.platform === "win32") await run("taskkill", ["/PID", pid, "/T", "/F"]).catch(() => {});
  else
    try {
      process.kill(Number(pid));
    } catch {}
  return true;
}

const run = (bin: string, args: string[]) =>
  new Promise<string>((done, fail) => execFile(bin, args, { timeout: 120_000 }, (error, stdout, stderr) => (error ? fail(new Error(`${bin}: ${stderr || error.message}`)) : done(String(stdout)))));

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function comfy(path: string, init?: RequestInit) {
  const res = await fetch(`${URL_BASE}${path}`, init);
  if (!res.ok) throw new Error(`ComfyUI said ${res.status} to ${path}: ${(await res.text()).slice(0, 600)}`);
  return res;
}

/* ── Making a clip ─────────────────────────────────────────────────────────────────────────────────── */

export type LocalRequest = { model: string; prompt: string; first?: string; seconds: number; aspect_ratio?: string; resolution?: string; seed: number; name: string };
export type LocalResult = { bytes: Buffer; promptId: string; seconds: number; width?: number; height?: number };

const ASPECT_OPTION: Record<string, string> = { "1:1": "1:1 (Square)", "16:9": "16:9 (Widescreen)", "9:16": "9:16 (Portrait Widescreen)" };

/** The template with this request's inputs, checking each node is the one expected. */
export function fillWorkflow(request: LocalRequest, image?: string) {
  const model = localModel(request.model)!;
  const graph = JSON.parse(readFileSync(join(import.meta.dirname, "comfy", model.workflow), "utf8"));
  const node = (id: string, type: string) => {
    if (graph[id]?.class_type !== type) throw new Error(`The ${model.workflow} workflow has no ${type} at ${id}. Was it exported again?`);
    return graph[id].inputs;
  };
  const aspect = request.aspect_ratio ?? "16:9";
  const [w, h] = aspect.split(":").map(Number);
  const short = model.sizes[request.resolution ?? "720p"];
  node("398:376", "PrimitiveStringMultiline").value = request.prompt;
  node("398:362", "PrimitiveInt").value = request.seconds;
  node("398:361", "PrimitiveInt").value = model.fps;
  node("398:383", "PrimitiveBoolean").value = false; // no prompt enhancer: the shot is made from its prompt as written
  node("398:363", "PrimitiveBoolean").value = !image; // text to video when there's no first frame
  node("398:339", "RandomNoise").noise_seed = request.seed;
  const resolution = node("403", "ResolutionSelector");
  resolution.aspect_ratio = ASPECT_OPTION[aspect];
  resolution.megapixels = Math.round(((short * short * Math.max(w, h)) / Math.min(w, h) / 1e6) * 100) / 100;
  node("395", "LoadImage").image = image ?? "example.png";
  if (model.gguf) {
    // Same model, smaller file: swap the loader, keep everything it feeds. ComfyUI names files in subfolders with the
    // system's separator.
    node("398:384", "UNETLoader");
    graph["398:384"] = { ...graph["398:384"], class_type: "UnetLoaderGGUF", inputs: { unet_name: model.gguf.split("/").join(process.platform === "win32" ? "\\" : "/") } };
  }
  node("75", "SaveVideo").filename_prefix = `nykma/${request.name}`;
  return graph;
}

let queue: Promise<unknown> = Promise.resolve();

/** Makes one clip. Clips wait their turn, since the GPU fits one at a time. */
export function makeLocal(request: LocalRequest, say: (message: string) => void): Promise<LocalResult> {
  const waiting = queue.then(() => makeNow(request, say));
  queue = waiting.catch(() => {});
  say("Waiting for the clip before it");
  return waiting;
}

async function makeNow(request: LocalRequest, say: (message: string) => void): Promise<LocalResult> {
  const started = Date.now();
  await startComfy(say);
  let image: string | undefined;
  if (request.first) {
    say("Sending the first frame");
    const form = new FormData();
    form.append("image", new Blob([readFileSync(request.first)]), `nykma-${request.name}${request.first.slice(request.first.lastIndexOf("."))}`);
    form.append("overwrite", "true");
    const uploaded: any = await (await comfy("/upload/image", { method: "POST", body: form })).json();
    image = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
  }
  const graph = fillWorkflow(request, image);
  const queued: any = await (await comfy("/prompt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: graph, client_id: "nykma" }) })).json();
  const promptId = String(queued.prompt_id);
  if (queued.node_errors && Object.keys(queued.node_errors).length) throw new Error(`ComfyUI refused the workflow: ${JSON.stringify(queued.node_errors).slice(0, 600)}`);

  while (true) {
    if (Date.now() - started > TIMEOUT_MS) throw new Error(`The clip took over an hour. ComfyUI's log is ${LOG_FILE}.`);
    const history: any = await (await comfy(`/history/${promptId}`)).json();
    const entry = history[promptId];
    if (entry?.status?.status_str === "error") {
      const error = (entry.status.messages ?? []).find((message: any) => message[0] === "execution_error")?.[1];
      throw new Error(`ComfyUI failed${error ? ` in ${error.node_type}: ${String(error.exception_message).trim()}` : ""}. Its log is ${LOG_FILE}.`);
    }
    if (entry?.status?.completed) {
      const file = Object.values<any>(entry.outputs ?? {})
        .flatMap((output) => [...(output.images ?? []), ...(output.videos ?? []), ...(output.gifs ?? [])])
        .find((item: any) => /\.(mp4|webm|mov|mkv)$/i.test(item.filename));
      if (!file) throw new Error("ComfyUI finished without a video.");
      say("Downloading the clip");
      const params = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder ?? "", type: file.type ?? "output" });
      const bytes = Buffer.from(await (await comfy(`/view?${params}`)).arrayBuffer());
      return { bytes, promptId, seconds: Math.round((Date.now() - started) / 1000) };
    }
    const queueState: any = await (await comfy("/queue")).json().catch(() => ({}));
    const ahead = (queueState.queue_pending ?? []).length;
    say(`Making the clip on this PC (${Math.round((Date.now() - started) / 1000)} s${ahead ? `, ${ahead} waiting in ComfyUI` : ""})`);
    await sleep(3000);
  }
}

/** Drops the sound ComfyUI made, since nykma makes its own, without re-encoding the picture. */
export async function withoutSound(bytes: Buffer, dir: string): Promise<Buffer> {
  mkdirSync(dir, { recursive: true });
  const input = join(dir, "local-in.mp4");
  const output = join(dir, "local-out.mp4");
  writeFileSync(input, bytes);
  try {
    await run("ffmpeg", ["-v", "error", "-y", "-i", input, "-map", "0:v:0", "-c:v", "copy", "-an", "-movflags", "+faststart", output]);
    return readFileSync(output);
  } finally {
    rmSync(input, { force: true });
    rmSync(output, { force: true });
  }
}
