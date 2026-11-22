/**
 * Bluesky, with an app password: no developer app, no review. The video goes to Bluesky's video service first
 * (docs.bsky.app "Uploading Video", the recommended method), which processes it and saves it to your PDS, so the post
 * never shows a missing video. Then the post is a plain app.bsky.feed.post record with the video embedded.
 *
 * The app password stays in the key store, so a session that can't be refreshed is made again from it.
 */
import { basename } from "node:path";
import { call, fileBlob, query, waitFor } from "../http.ts";
import { PublishError, type Account, type Provider } from "../types.ts";

const VIDEO_SERVICE = "https://video.bsky.app";

/** When a JWT runs out (ms), from its own `exp`. Bluesky's access tokens last about two hours. */
function expiry(jwt: string) {
  try {
    const exp = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")).exp;
    if (typeof exp === "number") return exp * 1000;
  } catch {}
  return Date.now() + 90 * 60_000;
}

/** The PDS that holds the repo, from the DID document: uploads and records go there, not to the entryway. */
function pdsOf(session: any, fallback: string) {
  const service = (session?.didDoc?.service ?? []).find((item: any) => item?.id === "#atproto_pds" || item?.type === "AtprotoPersonalDataServer");
  return typeof service?.serviceEndpoint === "string" ? service.serviceEndpoint.replace(/\/$/, "") : fallback;
}

const cleanService = (value?: string) => {
  const raw = (value || "https://bsky.social").trim().replace(/\/$/, "");
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
};

async function createSession(service: string, identifier: string, password: string) {
  const { data } = await call(`${service}/xrpc/com.atproto.server.createSession`, { method: "POST", body: { identifier, password } });
  return data;
}

function accountFrom(session: any, service: string, password: string): Account {
  const handle = String(session.handle ?? "");
  return {
    id: `bluesky:bluesky:${session.did}`,
    provider: "bluesky",
    platform: "bluesky",
    name: handle || session.did,
    handle: handle ? `@${handle}` : undefined,
    remoteId: session.did,
    tokens: { password, accessJwt: session.accessJwt, refreshJwt: session.refreshJwt },
    expiresAt: expiry(session.accessJwt),
    meta: { did: session.did, handle, service, pds: pdsOf(session, service) },
    connectedAt: Date.now(),
  };
}

/** Links and #tags as facets, with UTF-8 byte offsets, so they're clickable (Bluesky doesn't find them itself). */
function facets(text: string) {
  const bytes = (upTo: number) => Buffer.byteLength(text.slice(0, upTo), "utf8");
  const found: any[] = [];
  for (const match of text.matchAll(/https?:\/\/[^\s<>"]+/g)) {
    const uri = match[0].replace(/[.,;:!?)\]'"]+$/, "");
    const start = match.index!;
    found.push({ index: { byteStart: bytes(start), byteEnd: bytes(start + uri.length) }, features: [{ $type: "app.bsky.richtext.facet#link", uri }] });
  }
  for (const match of text.matchAll(/(^|\s)#([^\s#.,;:!?()[\]{}'"]+)/gu)) {
    const tag = match[2];
    if (/^\d+$/.test(tag) || tag.length > 64) continue;
    const start = match.index! + match[1].length;
    found.push({ index: { byteStart: bytes(start), byteEnd: bytes(start + 1 + tag.length) }, features: [{ $type: "app.bsky.richtext.facet#tag", tag }] });
  }
  return found;
}

/** A short-lived token the PDS signs for one call on another service (the video service). */
async function serviceAuth(account: Account, aud: string, lxm: string) {
  const exp = Math.floor(Date.now() / 1000) + 30 * 60;
  const { data } = await call(`${account.meta!.pds}/xrpc/com.atproto.server.getServiceAuth?${query({ aud, lxm, exp: String(exp) })}`, {
    headers: { authorization: `Bearer ${account.tokens.accessJwt}` },
  });
  return String(data.token);
}

export const provider: Provider = {
  id: "bluesky",
  label: "Bluesky",
  auth: "fields",
  blurb: "Bluesky posts with video, from an app password. No developer app and no review.",
  console: "https://bsky.app/settings/app-passwords",
  setup: [
    "In Bluesky, open Settings → Privacy and security → App passwords, and press Add App Password.",
    "Name it nykma and create it. Leave \"Allow access to your direct messages\" off. Copy the password it shows (xxxx-xxxx-xxxx-xxxx).",
    "Make sure your email is verified in Settings → Account: Bluesky only takes video from accounts with a verified email.",
    "Paste your handle (yourname.bsky.social) and the app password below, and press Connect.",
    "Only on a self-hosted PDS: put its URL in Service. Otherwise leave it empty.",
  ],
  fields: [
    { key: "handle", label: "Handle", placeholder: "yourname.bsky.social" },
    { key: "password", label: "App password", secret: true, placeholder: "xxxx-xxxx-xxxx-xxxx", help: "An app password, not your account password." },
    { key: "service", label: "Service", optional: true, placeholder: "https://bsky.social" },
  ],
  caveat: "Free. Videos up to 10 minutes and 300 MB, about 25 videos a day. Posts are 300 characters.",
  platforms: ["bluesky"],

  async connect(fields) {
    const service = cleanService(fields.service);
    const identifier = fields.handle.trim().replace(/^@/, "");
    const session = await createSession(service, identifier, fields.password);
    if (session.emailConfirmed === false) throw new PublishError("Bluesky only takes video from accounts with a verified email. Verify it in Bluesky's Settings → Account, then connect again.");
    return [accountFrom(session, service, fields.password)];
  },

  async refresh(_app, account) {
    const service = account.meta?.service ?? "https://bsky.social";
    try {
      const { data } = await call(`${account.meta?.pds ?? service}/xrpc/com.atproto.server.refreshSession`, { method: "POST", headers: { authorization: `Bearer ${account.tokens.refreshJwt}` } });
      return { ...account, tokens: { ...account.tokens, accessJwt: data.accessJwt, refreshJwt: data.refreshJwt }, expiresAt: expiry(data.accessJwt) };
    } catch (error) {
      if (error instanceof PublishError && error.retry) throw error;
      // The refresh token ran out or was revoked: a new session from the app password, which is kept for this.
      const session = await createSession(service, account.meta?.handle || account.remoteId, account.tokens.password);
      return { ...accountFrom(session, service, account.tokens.password), connectedAt: account.connectedAt };
    }
  },

  options: async () => [
    { key: "lang", label: "Language", type: "text", help: "A language code such as en or he, so feeds in that language show it. Empty leaves it unset." },
  ],

  async publish({ job, account, file, video, log, save }) {
    const pds = account.meta!.pds;
    const did = account.meta!.did;
    const auth = { authorization: `Bearer ${account.tokens.accessJwt}` };
    if (job.handle.uri) return { state: "published", url: job.url, remoteId: job.handle.uri };

    let blob = job.handle.blob ? JSON.parse(job.handle.blob) : undefined;
    if (!blob) {
      // The video service's own count of what's left today, so a 26th video fails here and not after uploading.
      try {
        const token = await serviceAuth(account, "did:web:video.bsky.app", "app.bsky.video.getUploadLimits");
        const { data } = await call(`${VIDEO_SERVICE}/xrpc/app.bsky.video.getUploadLimits`, { headers: { authorization: `Bearer ${token}` } });
        if (data.canUpload === false) throw new PublishError(`Bluesky won't take more video today: ${data.message ?? data.error ?? "the daily limit is reached"}.`);
        if (typeof data.remainingDailyBytes === "number" && data.remainingDailyBytes < video.bytes) throw new PublishError("Bluesky won't take a video this big today: the daily limit is nearly used.");
      } catch (error) {
        if (error instanceof PublishError && !/getUploadLimits|getServiceAuth/.test(error.message)) throw error;
      }
      log("Uploading to Bluesky's video service.");
      const token = await serviceAuth(account, `did:web:${new URL(pds).host}`, "com.atproto.repo.uploadBlob");
      const { data: uploaded } = await call(`${VIDEO_SERVICE}/xrpc/app.bsky.video.uploadVideo?${query({ did, name: basename(file) })}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "video/mp4" },
        body: await fileBlob(file),
        // A video the service already processed comes back as an error with its blob, which is as good.
        okStatus: [409],
      });
      const first = uploaded.jobStatus ?? uploaded;
      blob = first.blob;
      if (!blob && !first.jobId) throw new PublishError(`Bluesky's video service didn't take it: ${first.message ?? first.error ?? "no job came back"}.`);
      if (!blob) {
        log("Bluesky is processing the video.");
        blob = await waitFor(
          async () => {
            const { data } = await call(`${VIDEO_SERVICE}/xrpc/app.bsky.video.getJobStatus?${query({ jobId: first.jobId })}`, { okStatus: [400] });
            const status = data.jobStatus ?? data;
            if (status.blob) return status.blob;
            if (status.state === "JOB_STATE_FAILED") throw new PublishError(`Bluesky couldn't process the video: ${status.error ?? status.message ?? "it failed"}.`);
            return undefined;
          },
          { every: 3000, timeout: 20 * 60_000, what: "Bluesky's video service" },
        );
      }
      save({ blob: JSON.stringify(blob) });
    }

    const text = job.caption;
    const lang = typeof job.options.lang === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(job.options.lang) ? job.options.lang : undefined;
    const record = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
      ...(lang ? { langs: [lang] } : {}),
      ...(facets(text).length ? { facets: facets(text) } : {}),
      embed: { $type: "app.bsky.embed.video", video: blob, ...(video.width && video.height ? { aspectRatio: { width: video.width, height: video.height } } : {}) },
    };
    const { data } = await call(`${pds}/xrpc/com.atproto.repo.createRecord`, { method: "POST", headers: auth, body: { repo: did, collection: "app.bsky.feed.post", record } });
    save({ uri: data.uri });
    const rkey = String(data.uri).split("/").pop();
    return { state: "published", url: `https://bsky.app/profile/${account.meta!.handle || did}/post/${rkey}`, remoteId: data.uri };
  },
};
