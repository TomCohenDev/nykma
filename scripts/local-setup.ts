/**
 * bun run local:setup — installs video generation on this PC (spec.md §6.9): ComfyUI portable in ~/nykma-local and
 * the LTX-2.5 model files (about 47 GB, and 14 GB more for the smaller build, which needs the ComfyUI-GGUF add-on). Run it again to pick up where it stopped; it skips what's there.
 *
 * Windows with an NVIDIA GPU only. It needs 7-Zip for ComfyUI's archive, and a Hugging Face login that has accepted
 * the LTX-2.x licence at huggingface.co/Lightricks/LTX-2.5 (the setup says how).
 */
import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Addon, COMFY_DIR, COMFY_PYTHON, COMFY_RELEASE, LOCAL_HOME, LOCAL_MODELS, localStatus, MODELS_DIR, modelPath } from "./lib/local.ts";

const ROOT = resolve(import.meta.dirname, "..");
const HF = join(ROOT, process.platform === "win32" ? ".venv/Scripts/hf.exe" : ".venv/bin/hf");

const capture = (bin: string, args: string[]) =>
  new Promise<{ ok: boolean; out: string }>((done) => execFile(bin, args, { timeout: 60_000 }, (error, stdout, stderr) => done({ ok: !error, out: `${stdout}${stderr}`.trim() })));

/** Runs a command with its output on this terminal, so downloads show their progress. */
const loud = (bin: string, args: string[], cwd?: string) =>
  new Promise<void>((done, fail) => spawn(bin, args, { cwd, stdio: "inherit" }).on("exit", (code) => (code ? fail(new Error(`${bin} exited with ${code}`)) : done())).on("error", fail));

function stop(message: string): never {
  console.error(`\n${message}`);
  process.exit(1);
}

if (process.platform !== "win32") stop("Local video is set up for Windows with an NVIDIA GPU. On a Mac, use OpenRouter for video.");
const gpu = await capture("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader"]);
if (!gpu.ok) stop("No NVIDIA GPU found (nvidia-smi didn't run). Local video needs one with 16 GB or more.");
console.log(`GPU: ${gpu.out}`);
mkdirSync(join(LOCAL_HOME, "downloads"), { recursive: true });

// 1. ComfyUI portable, which brings its own Python, PyTorch and CUDA, so the repo's .venv isn't touched.
if (!existsSync(COMFY_PYTHON)) {
  const archive = join(LOCAL_HOME, "downloads", COMFY_RELEASE.url.split("/").pop()!);
  if (!existsSync(archive) || statSync(archive).size !== COMFY_RELEASE.bytes) {
    console.log(`Downloading ComfyUI ${COMFY_RELEASE.version} (${(COMFY_RELEASE.bytes / 1e9).toFixed(1)} GB)`);
    await loud("curl", ["-L", "--fail", "-C", "-", "-o", archive, COMFY_RELEASE.url]);
  }
  const sevenZip = ["C:/Program Files/7-Zip/7z.exe", "C:/Program Files (x86)/7-Zip/7z.exe"].find(existsSync) ?? ((await capture("7z", ["i"])).ok ? "7z" : undefined);
  if (!sevenZip) stop("ComfyUI comes as a .7z archive. Install 7-Zip (winget install 7zip.7zip), then run this again.");
  console.log("Unpacking ComfyUI");
  await loud(sevenZip, ["x", "-y", `-o${LOCAL_HOME}`, archive, "-bso0", "-bsp1"]);
  if (!existsSync(COMFY_PYTHON)) stop(`Unpacked, but ${COMFY_PYTHON} isn't there.`);
}
const torch = await capture(COMFY_PYTHON, ["-c", "import torch; print(torch.__version__, torch.cuda.is_available())"]);
console.log(`ComfyUI in ${COMFY_DIR}, PyTorch ${torch.out}`);
if (!torch.out.endsWith("True")) stop("ComfyUI's PyTorch doesn't see the GPU. Update the NVIDIA driver, then run this again.");

// 2. Add-ons a model needs, at the commit it was tested with, with their Python packages in ComfyUI's own Python.
const addons = new Map<string, Addon>(LOCAL_MODELS.flatMap((model) => model.addons ?? []).map((addon) => [addon.name, addon]));
for (const addon of addons.values()) {
  const dir = join(COMFY_DIR, "ComfyUI", "custom_nodes", addon.name);
  if (existsSync(dir)) continue;
  console.log(`Installing the ${addon.name} add-on`);
  await loud("git", ["clone", "-q", addon.repo, dir]);
  await loud("git", ["-C", dir, "checkout", "-q", addon.commit]);
  if (existsSync(join(dir, "requirements.txt"))) await loud(COMFY_PYTHON, ["-s", "-m", "pip", "install", "-q", "--no-warn-script-location", "-r", join(dir, "requirements.txt")]);
}

// 3. The model files, straight into ComfyUI's models folder, in the folders the workflow looks in.
for (const model of LOCAL_MODELS) {
  const missing = model.files.filter((file) => {
    const path = modelPath(file);
    return !existsSync(path) || statSync(path).size < file.bytes * 0.99;
  });
  if (!missing.length) continue;
  if (!existsSync(HF)) stop("The Hugging Face CLI isn't in .venv. Run: .venv/Scripts/pip install -r py/requirements.txt");
  if (missing.some((file) => file.repo.startsWith("Lightricks/")) && !(await capture(HF, ["auth", "whoami"])).ok)
    stop(
      [
        `${model.name}'s files need a Hugging Face login that has accepted its licence. Once:`,
        "  1. Open https://huggingface.co/Lightricks/LTX-2.5 logged in, and accept the LTX-2.x Community License.",
        "  2. Make a Read token at https://huggingface.co/settings/tokens and run:",
        `     ${HF} auth login`,
        "Then run bun run local:setup again.",
      ].join("\n"),
    );
  const gb = missing.reduce((sum, file) => sum + file.bytes, 0) / 1e9;
  console.log(`Downloading ${model.name}: ${missing.length} file(s), about ${gb.toFixed(1)} GB`);
  for (const file of missing) await loud(HF, ["download", file.repo, file.path, "--local-dir", join(MODELS_DIR, file.into ?? "")]);
}

const status = await localStatus();
console.log(`\n${status.ok ? "Ready" : "Not ready"}: ${status.detail}`);
if (status.ok) console.log("Choose \"This PC\" for generated video in the desk's Settings. A video shot is then \"via\": \"local\" with a model from: " + LOCAL_MODELS.map((model) => model.id).join(", "));
