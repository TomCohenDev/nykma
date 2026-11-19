/**
 * The desk's key store (spec.md §10.10): one file per service in ~/.config/nykma/keys/, outside the repo, readable only by
 * you (0600 in a 0700 folder). Keys go in from the Settings page and never come back out of it: the page sees only
 * whether a key is set and its last four characters. The desk makes the paid image and video calls and the stock
 * searches itself, so their keys never reach an agent's process. ElevenLabs is the exception: mv.py reads its key here, because it calls ElevenLabs.
 *
 * Budgets and the spend ledger for generated media live next to it (gen-budgets.json, gen-spend.jsonl), also outside
 * the repo, so an agent editing the project can't raise its own budget. NYKMA_HOME moves all of it, for tests.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const SERVICES = {
  openrouter: { label: "OpenRouter", for: "generated video and images", env: "OPENROUTER_API_KEY" },
  elevenlabs: { label: "ElevenLabs", for: "voice, music and sound effects", env: "ELEVENLABS_API_KEY" },
  pexels: { label: "Pexels", for: "free stock photos and video", env: "PEXELS_API_KEY" },
  pixabay: { label: "Pixabay", for: "free stock photos and video", env: "PIXABAY_API_KEY" },
} as const;
export type Service = keyof typeof SERVICES;

export const home = () => process.env.NYKMA_HOME ?? join(homedir(), ".config", "nykma");
const keyFile = (service: Service) => join(home(), "keys", service);
const KEY = /^[\x21-\x7e]{16,300}$/; // printable, no spaces or newlines

export function ensureHome() {
  mkdirSync(join(home(), "keys"), { recursive: true, mode: 0o700 });
  chmodSync(home(), 0o700);
  chmodSync(join(home(), "keys"), 0o700);
}

/** The key, for the desk's own calls. Never send it to the page. */
export function readKey(service: Service): string | undefined {
  const file = keyFile(service);
  if (!existsSync(file)) return undefined;
  const key = readFileSync(file, "utf8").trim();
  return key || undefined;
}

export function saveKey(service: Service, key: string) {
  const clean = key.trim();
  if (!KEY.test(clean)) throw new Error("That doesn't look like a key: paste it on its own, with no spaces.");
  ensureHome();
  writeFileSync(keyFile(service), `${clean}\n`, { mode: 0o600 });
  chmodSync(keyFile(service), 0o600);
}

export function removeKey(service: Service) {
  rmSync(keyFile(service), { force: true });
}

/** What the page may know: set or not, and the last four characters. */
export function keyHint(service: Service): { set: boolean; last4?: string } {
  const key = readKey(service);
  return key ? { set: true, last4: key.slice(-4) } : { set: false };
}

export const isService = (name: unknown): name is Service => typeof name === "string" && name in SERVICES;

/**
 * The environment variables an agent run must not inherit, whatever the desk was started with. ElevenLabs' stays,
 * since mv.py, which the agent runs, calls ElevenLabs.
 */
export const SECRET_ENV = [
  SERVICES.openrouter.env, SERVICES.pexels.env, SERVICES.pixabay.env,
  "FAL_KEY", "REPLICATE_API_TOKEN", "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY", "RECRAFT_API_KEY", "LUMA_API_KEY", "RUNWAYML_API_SECRET",
];
