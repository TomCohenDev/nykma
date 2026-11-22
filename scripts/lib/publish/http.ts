/**
 * What every provider uses to talk to its platform: JSON calls that turn an HTTP failure into a PublishError with the
 * platform's own message, and reading a video in chunks. No tokens in any message: `call` strips query strings from
 * the URL it names, since some platforms take the token there.
 */
import { createHash, randomBytes } from "node:crypto";
import { openAsBlob } from "node:fs";
import { open } from "node:fs/promises";
import { PublishError } from "./types.ts";

export const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

const where = (url: string) => url.replace(/\?.*$/, "");

/** The platform's own words for an error, from the usual JSON shapes. */
function messageOf(body: any, text: string) {
  const e = body?.error;
  const parts = [
    typeof e === "string" ? e : e?.message ?? e?.error_user_msg,
    e?.error_user_title,
    body?.error_description,
    body?.message,
    body?.detail,
    body?.title,
    Array.isArray(body?.errors) ? body.errors.map((item: any) => item?.message ?? item?.detail ?? JSON.stringify(item)).join("; ") : undefined,
    e?.code && typeof e.code === "string" ? e.code : undefined,
  ].filter((part) => typeof part === "string" && part.trim());
  return [...new Set(parts)].join(" · ") || text.slice(0, 300);
}

export type CallOptions = Omit<RequestInit, "body"> & { body?: BodyInit | object; form?: Record<string, string>; okStatus?: number[] };

/**
 * fetch, with JSON in and out. A 401 or 403 marks the login as the problem (reconnect), a 429 or 5xx can be retried,
 * and anything else is the post's problem, said in the platform's words.
 */
export async function call<T = any>(url: string, { body, form, headers, okStatus, ...init }: CallOptions = {}): Promise<{ data: T; res: Response }> {
  const head = new Headers(headers);
  let payload: BodyInit | undefined;
  if (form) {
    payload = new URLSearchParams(form);
    head.set("content-type", "application/x-www-form-urlencoded");
  } else if (body !== undefined && body !== null && typeof body === "object" && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof URLSearchParams) && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body) && !(body instanceof ReadableStream)) {
    payload = JSON.stringify(body);
    if (!head.has("content-type")) head.set("content-type", "application/json");
  } else payload = body as BodyInit | undefined;
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: head, body: payload, ...(payload instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);
  } catch (error) {
    throw new PublishError(`Couldn't reach ${new URL(url).host}: ${(error as Error).message}`, { retry: true });
  }
  const text = await res.text();
  let data: any = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {}
  if (!res.ok && !okStatus?.includes(res.status)) {
    const said = messageOf(data, text);
    const message = `${new URL(url).host} said ${res.status} at ${where(url).replace(/^https?:\/\/[^/]+/, "")}: ${said}`;
    throw new PublishError(message, { retry: res.status === 429 || res.status >= 500, reconnect: res.status === 401 });
  }
  return { data, res };
}

/** The whole file as a Blob that streams from disk, for multipart uploads. */
export const fileBlob = (path: string, type = "video/mp4") => openAsBlob(path, { type });

/** Reads `length` bytes from `offset`. For chunked uploads, one chunk in memory at a time. */
export async function readChunk(path: string, offset: number, length: number): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Polls `check` until it returns a value, every `every` ms, for up to `timeout` ms. */
export async function waitFor<T>(check: () => Promise<T | undefined>, { every = 5000, timeout = 15 * 60_000, what = "the platform" } = {}): Promise<T> {
  const until = Date.now() + timeout;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > until) throw new PublishError(`${what} was still processing after ${Math.round(timeout / 60_000)} minutes. It may still finish there.`, { retry: true });
    await sleep(every);
  }
}

/** PKCE: a verifier, and its S256 challenge in base64url (RFC 7636) and in hex (TikTok's Desktop Login Kit). */
export function pkce() {
  const verifier = randomBytes(48).toString("base64url");
  const digest = createHash("sha256").update(verifier).digest();
  return { verifier, challenge: digest.toString("base64url"), hex: digest.toString("hex") };
}

export const query = (params: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString();
