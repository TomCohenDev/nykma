/**
 * The desk's settings (spec.md §10.8), saved in settings.json at the repo's root (gitignored). They're defaults for new
 * ads: the desk writes them into the brief, and the agent writes them into the ad (its registry line, its spec.json).
 * So changing one never changes, or re-spends on, an ad that's already built. A missing or broken file is the defaults.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const RATIOS = ["16x9", "1x1", "9x16"] as const;
export type Ratio = (typeof RATIOS)[number];

export type Settings = {
  /** The layouts a new ad is made in. */
  ratios: Ratio[];
  /** A pitch and an animatic before the build. Off is "no pitch, just build it". */
  pitch: boolean;
  /** A designed cover image for each layout of a video ad, made in code with it (.claude/guides/thumbnail.md). */
  thumbnail: boolean;
  /** The ElevenLabs voice for a voice-over. "auto" lets the agent pick one for the idea. */
  voice: { mode: "auto" | "fixed"; id?: string; name?: string };
  /** Voices you added by id (a clone, one from the library): offered first, and preferred when the agent picks. */
  savedVoices: SavedVoice[];
  /** Word times for a recorded voice: Whisper on this machine (free), or ElevenLabs' forced alignment (exact, paid). */
  align: "whisper" | "eleven";
  /** How the desk runs Claude Code. Empty model and effort are Claude Code's own defaults. */
  claude: { bin: string; model: string; effort: string };
  /** Where generated stills are made: OpenRouter (paid per image) or Codex on your ChatGPT login. */
  images: ImageRoute;
  /** Where generated video is made: OpenRouter (paid per clip) or this PC (local.ts: free, slower). */
  video: VideoRoute;
  /** The Codex binary the desk runs for stills. Empty finds it: on the PATH, then the Codex desktop app's own. */
  codex: { bin: string };
};

export const IMAGE_ROUTES = ["openrouter", "codex"] as const;
export type ImageRoute = (typeof IMAGE_ROUTES)[number];
export const VIDEO_ROUTES = ["openrouter", "local"] as const;
export type VideoRoute = (typeof VIDEO_ROUTES)[number];

export type SavedVoice = { id: string; name: string };

export const DEFAULTS: Settings = {
  ratios: ["1x1"],
  pitch: true,
  thumbnail: true,
  voice: { mode: "auto" },
  savedVoices: [],
  align: "whisper",
  claude: { bin: "claude", model: "", effort: "" },
  images: "openrouter",
  video: "openrouter",
  codex: { bin: "" },
};

export const MODELS = ["", "opus", "sonnet", "haiku", "fable"];
export const EFFORTS = ["", "low", "medium", "high", "xhigh", "max"];

const FILE = join(resolve(import.meta.dirname, "../.."), "settings.json");
export const VOICE_ID = /^[A-Za-z0-9]{8,40}$/;
const voiceName = (name: unknown, id: string) => (typeof name === "string" && name.trim() ? name.trim().replace(/[\r\n`]/g, " ").slice(0, 80) : id);

/** Only what makes sense survives. Anything else falls back to the default, so a bad edit can't break the desk. */
export function clean(input: any): Settings {
  const s = input && typeof input === "object" ? input : {};
  const ratios = Array.isArray(s.ratios) ? RATIOS.filter((ratio) => s.ratios.includes(ratio)) : [];
  const voice = s.voice && typeof s.voice === "object" ? s.voice : {};
  const fixed = voice.mode === "fixed" && typeof voice.id === "string" && VOICE_ID.test(voice.id);
  const claude = s.claude && typeof s.claude === "object" ? s.claude : {};
  const safe = (path: unknown): path is string => typeof path === "string" && Boolean(path.trim()) && !/[\n;&|`$<>]/.test(path);
  const bin = safe(claude.bin) ? claude.bin.trim() : DEFAULTS.claude.bin;
  const codex = s.codex && typeof s.codex === "object" ? s.codex : {};
  return {
    ratios: ratios.length ? ratios : DEFAULTS.ratios,
    pitch: typeof s.pitch === "boolean" ? s.pitch : DEFAULTS.pitch,
    thumbnail: typeof s.thumbnail === "boolean" ? s.thumbnail : DEFAULTS.thumbnail,
    voice: fixed ? { mode: "fixed", id: voice.id, name: typeof voice.name === "string" ? voiceName(voice.name, voice.id) : undefined } : { mode: "auto" },
    savedVoices: (Array.isArray(s.savedVoices) ? s.savedVoices : [])
      .filter((item: any) => item && typeof item.id === "string" && VOICE_ID.test(item.id))
      .filter((item: any, i: number, all: any[]) => all.findIndex((other) => other.id === item.id) === i)
      .slice(0, 50)
      .map((item: any) => ({ id: item.id, name: voiceName(item.name, item.id) })),
    align: s.align === "eleven" ? "eleven" : "whisper",
    claude: {
      bin,
      model: MODELS.includes(claude.model) ? claude.model : "",
      effort: EFFORTS.includes(claude.effort) ? claude.effort : "",
    },
    images: IMAGE_ROUTES.includes(s.images) ? s.images : DEFAULTS.images,
    video: VIDEO_ROUTES.includes(s.video) ? s.video : DEFAULTS.video,
    codex: { bin: safe(codex.bin) ? codex.bin.trim() : "" },
  };
}

export function readSettings(): Settings {
  if (!existsSync(FILE)) return DEFAULTS;
  try {
    return clean(JSON.parse(readFileSync(FILE, "utf8")));
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(input: unknown): Settings {
  const settings = clean(input);
  writeFileSync(FILE, `${JSON.stringify(settings, null, 2)}\n`);
  return settings;
}

const LABEL: Record<Ratio, string> = { "16x9": "16:9", "1x1": "1:1", "9x16": "9:16" };

/**
 * What a new ad's brief says about the settings. `ratios` and `pitch` are this ad's own choices from the new-project
 * form, which can differ from the saved defaults.
 */
export function briefFor(settings: Settings, { ratios, pitch = settings.pitch, thumbnail = settings.thumbnail, asset = false }: { ratios: Ratio[]; pitch?: boolean; thumbnail?: boolean; asset?: boolean }) {
  const lines: string[] = [];
  const only = ratios.length === 1 ? ` only` : "";
  lines.push(`Layouts: ${ratios.map((ratio) => LABEL[ratio]).join(", ")}${only}. Register it with \`ratios: [${ratios.map((ratio) => `"${ratio}"`).join(", ")}]\`, and lay out only those.`);
  if (settings.voice.mode === "fixed")
    lines.push(`Voice: if the ad has a voice-over, use the ElevenLabs voice ${settings.voice.name ? `"${settings.voice.name}" ` : ""}(\`"voice_id": "${settings.voice.id}"\`), unless the idea needs more than one voice.`);
  else if (settings.savedVoices.length)
    lines.push(
      `Voice: if the ad has a voice-over, pick the one of these saved ElevenLabs voices that suits the idea: ${settings.savedVoices.map((voice) => `"${voice.name}" (\`${voice.id}\`)`).join(", ")}. Only if none fits, pick another (\`mv.py voices\` lists the account's). Say which in the pitch.`,
    );
  else lines.push(`Voice: if the ad has a voice-over, pick the ElevenLabs voice that suits the idea (\`mv.py voices\` lists them), and say which in the pitch.`);
  lines.push(
    settings.align === "eleven"
      ? `Word timing: a recorded voice is timed by ElevenLabs' forced alignment, so write \`"align": "eleven"\` on it in spec.json. It isn't priced, so list it in the pitch.`
      : `Word timing: a recorded voice is timed by Whisper on this machine (free, the default in spec.json).`,
  );
  lines.push(
    settings.images === "codex"
      ? `Generated stills: through Codex on the user's ChatGPT login, so write \`"via": "codex"\` on every image shot in gen.json and leave out \`model\`. They cost no money but count against the ChatGPT plan, so list them in the pitch.`
      : "Generated stills: through OpenRouter, gen.json's default.",
  );
  lines.push(
    settings.video === "local"
      ? `Generated video: on this PC, so write \`"via": "local"\` and \`"model": "ltx-2.5-q4"\` on every video shot in gen.json: 2 to 10 s, 1:1, 16:9 or 9:16, 480p, 720p or 1080p, from a first frame, with no last frame or refs. It costs no money, but each clip takes the GPU about 3 to 4 minutes, so list the clips in the pitch. Give each a \`seed\`: the same seed makes the same clip, so a retake is a new seed.`
      : "Generated video: through OpenRouter, gen.json's default.",
  );
  // An asset is stills already, so it has no separate cover.
  if (!asset)
    lines.push(
      thumbnail
        ? "Thumbnail: design a cover image for each layout, as `thumbnail` on the registry line (`.claude/guides/thumbnail.md`). It's made in code like the ad and costs nothing."
        : "Thumbnail: none for this ad.",
    );
  if (!pitch) lines.push("No pitch, just build it.");
  return lines.join("\n");
}
