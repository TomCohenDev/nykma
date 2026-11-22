/**
 * YouTube, through your own Google Cloud project (spec.md §10.12). A Desktop-app OAuth client logs in with a loopback
 * redirect and PKCE: Google says a desktop client "cannot keep secrets confidential", so its secret is only a label.
 * Since 2026-11-02, uploads from unverified projects are no longer forced to private, and since 2026-06-01 uploads
 * have their own quota of 100 a day (developers.google.com/youtube/v3/revision_history).
 *
 * A post is a resumable videos.insert. A square or vertical video of 3 minutes or less becomes a Short by itself, so
 * there's no separate path. Scheduling is YouTube's own: private plus status.publishAt, so the PC can be off then.
 */
import { stat } from "node:fs/promises";
import { call, fileBlob, query, sleep } from "../http.ts";
import { PublishError, type Account, type Option, type Provider, type PublishContext } from "../types.ts";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
const SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

type Tokens = { access_token: string; expires_in: number; refresh_token?: string; scope?: string };

/** A token call. Google's invalid_grant means the refresh token is gone (revoked, or a Testing app's 7 days ran out). */
async function token(form: Record<string, string>): Promise<Tokens> {
  try {
    return (await call<Tokens>(TOKEN, { method: "POST", form })).data;
  } catch (error) {
    const message = String((error as Error).message);
    if (/invalid_grant|unauthorized_client|invalid_client/.test(message))
      throw new PublishError(`Google refused the login (${message.match(/invalid_\w+|unauthorized_client/)?.[0]}). Connect YouTube again. If it keeps happening every week, the app is still in Testing: publish it to production on the consent screen.`, { reconnect: true });
    throw error;
  }
}

/** YouTube refuses `<` and `>` in a title or description, so they become look-alikes. */
const clean = (text: string) => text.replace(/</g, "‹").replace(/>/g, "›");

/** The description is limited in bytes (5,000), not characters, so Hebrew counts double. Cut at a whole character. */
function bytesUpTo(text: string, limit: number) {
  if (Buffer.byteLength(text) <= limit) return text;
  let out = "";
  for (const char of text) {
    if (Buffer.byteLength(out + char) > limit) break;
    out += char;
  }
  return out;
}

const bearer = (account: Account) => ({ Authorization: `Bearer ${account.tokens.access_token}` });

/** Where the video is, once its id exists: a Short's link for a vertical or square one of 3 minutes or less. */
const linkFor = (id: string, video: PublishContext["video"]) => (video.height >= video.width && video.seconds > 0 && video.seconds <= 180 ? `https://youtube.com/shorts/${id}` : `https://youtu.be/${id}`);

/**
 * Sends the bytes to an upload session, from `from`. A session lives about a week, so a retry asks where it got to
 * (Content-Range: bytes * /size) and sends the rest.
 */
async function sendBytes(session: string, file: string, size: number, account: Account, resume: boolean): Promise<{ id?: string }> {
  let from = 0;
  if (resume) {
    // Where the session got to: 308 with a Range header means some bytes are in, 200/201 means it's all there.
    const probe = await fetch(session, { method: "PUT", headers: { ...bearer(account), "Content-Range": `bytes */${size}` } }).catch(() => undefined);
    if (probe && (probe.status === 200 || probe.status === 201)) return (await probe.json().catch(() => ({}))) as { id?: string };
    if (probe && (probe.status === 404 || probe.status === 410)) throw new PublishError("The upload session expired.", { retry: true });
    const range = probe?.status === 308 ? probe.headers.get("range") : null;
    from = range ? Number(range.split("-")[1]) + 1 : 0;
  }
  const headers: Record<string, string> = { ...bearer(account), "Content-Type": "video/mp4" };
  if (from > 0) headers["Content-Range"] = `bytes ${from}-${size - 1}/${size}`;
  // A Blob from disk streams and carries its own length.
  const whole = await fileBlob(file);
  const { data } = await call<{ id?: string }>(session, { method: "PUT", headers, body: from > 0 ? whole.slice(from) : whole });
  return data;
}

/** A custom cover. Only logged when it fails: the video is up either way. Shorts take one after processing ends. */
async function setThumbnail(context: PublishContext, id: string) {
  const { thumbnail, account, log } = context;
  if (!thumbnail) return;
  const type = /\.png$/i.test(thumbnail) ? "image/png" : "image/jpeg";
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await call(`${UPLOAD}/thumbnails/set?${query({ videoId: id })}`, { method: "POST", headers: { ...bearer(account), "Content-Type": type }, body: await fileBlob(thumbnail, type) });
      log("Set the cover.");
      return;
    } catch (error) {
      const message = String((error as Error).message);
      // Not processed yet, or a Short whose processing hasn't finished: wait and try again, for up to about 5 minutes.
      if (attempt < 5 && /processing|not.*ready|409/i.test(message)) {
        await sleep(60_000);
        continue;
      }
      log(`The video is up, but the cover wasn't set: ${message} (custom covers need a phone-verified channel). Set it in YouTube Studio.`);
      return;
    }
  }
}

export const provider: Provider = {
  id: "youtube",
  label: "YouTube",
  auth: "oauth",
  blurb: "Videos and Shorts on your channel, public, unlisted or scheduled.",
  console: "https://console.cloud.google.com/apis/credentials",
  redirectHost: "127.0.0.1",
  caveat: "Free. 100 uploads a day per Google project. Since 2026-11-02 uploads from your own unverified project can be public. While the app is in Testing, Google ends the login every 7 days.",
  platforms: ["youtube"],
  setup: [
    "Go to console.cloud.google.com and create a project (any name, e.g. nykma).",
    "APIs & Services → Library: search for YouTube Data API v3 and press Enable.",
    "APIs & Services → OAuth consent screen (Google Auth Platform): choose External, give it a name and your email, and save.",
    "Under Audience → Test users, add the Google account that owns your channel.",
    "Optional but recommended: under Audience, press Publish app so it's In production. You'll see an \"unverified app\" warning when you connect (Advanced → Go to …), but the login then lasts. In Testing it ends every 7 days and you connect again.",
    "APIs & Services → Credentials → Create credentials → OAuth client ID. Application type: Desktop app. No redirect URI is needed: Google takes {redirect} for a Desktop client.",
    "Copy the Client ID and Client secret into the fields below and save, then press Connect and pick the channel.",
  ],
  fields: [
    { key: "clientId", label: "Client ID", placeholder: "1234-abc.apps.googleusercontent.com" },
    { key: "clientSecret", label: "Client secret", secret: true, placeholder: "GOCSPX-…" },
  ],

  authorizeUrl: (app, start) =>
    `${AUTH}?${query({
      client_id: app.clientId,
      redirect_uri: start.redirectUri,
      response_type: "code",
      scope: SCOPES,
      state: start.state,
      code_challenge: start.challenge,
      code_challenge_method: "S256",
      // A refresh token every time, so a reconnect replaces a dead one.
      access_type: "offline",
      prompt: "consent",
    })}`,

  async exchange(app, code, start) {
    const tokens = await token({ code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: start.redirectUri, grant_type: "authorization_code", code_verifier: start.verifier });
    if (!tokens.refresh_token) throw new Error("Google gave no refresh token, so the login wouldn't last. Remove the app's access at myaccount.google.com/permissions and connect again.");
    const { data } = await call<{ items?: { id: string; snippet: { title: string; customUrl?: string } }[] }>(`${API}/channels?${query({ part: "snippet", mine: "true" })}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const channels = data.items ?? [];
    if (!channels.length) throw new Error("That Google account has no YouTube channel. Make one at youtube.com, or log in with the account that owns it.");
    const now = Date.now();
    return channels.map((channel) => ({
      id: `youtube:youtube:${channel.id}`,
      provider: "youtube" as const,
      platform: "youtube" as const,
      name: channel.snippet.title,
      handle: channel.snippet.customUrl,
      remoteId: channel.id,
      tokens: { access_token: tokens.access_token, refresh_token: tokens.refresh_token! },
      expiresAt: now + tokens.expires_in * 1000,
      connectedAt: now,
    }));
  },

  async refresh(app, account) {
    const tokens = await token({ client_id: app.clientId, client_secret: app.clientSecret, refresh_token: account.tokens.refresh_token, grant_type: "refresh_token" });
    return { ...account, tokens: { ...account.tokens, access_token: tokens.access_token, ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}) }, expiresAt: Date.now() + tokens.expires_in * 1000 };
  },

  async options(): Promise<Option[]> {
    return [
      { key: "privacy", label: "Visibility", type: "select", default: "public", choices: [{ value: "public", label: "Public" }, { value: "unlisted", label: "Unlisted" }, { value: "private", label: "Private" }], help: "A scheduled video is private until its time, then public." },
      { key: "madeForKids", label: "Made for kids", type: "toggle", default: false, help: "YouTube requires an answer. An ad for adults is not." },
      { key: "paidPlacement", label: "Paid product placement", type: "toggle", default: false, help: "On when someone paid you to feature it. Your own product's ad is off. YouTube asks for an explicit answer since 2026-11-16." },
    ];
  },

  async publish(context) {
    const { job, account, file, video, log, save } = context;
    const scheduled = Boolean(job.native && job.at);
    // A retry after the insert finished: don't upload twice, just finish the cover.
    if (job.handle.videoId) {
      await setThumbnail(context, job.handle.videoId);
      return { state: scheduled ? "scheduled" : "published", url: linkFor(job.handle.videoId, video), remoteId: job.handle.videoId };
    }
    const size = (await stat(file)).size;
    let session: string | undefined = job.handle.session || undefined;
    const resume = Boolean(session);
    if (!session) {
      const status: Record<string, unknown> = {
        privacyStatus: scheduled ? "private" : String(job.options.privacy ?? "public"),
        selfDeclaredMadeForKids: job.options.madeForKids === true,
        containsSyntheticMedia: job.options.ai === true,
        embeddable: true,
      };
      if (scheduled) status.publishAt = new Date(job.at!).toISOString();
      const body = {
        snippet: { title: clean(job.title ?? "").slice(0, 100), description: bytesUpTo(clean(job.caption), 5000), categoryId: "22" },
        status,
        paidProductPlacementDetails: { hasPaidProductPlacement: job.options.paidPlacement === true },
      };
      const { res } = await call(`${UPLOAD}/videos?${query({ uploadType: "resumable", part: "snippet,status,paidProductPlacementDetails" })}`, {
        method: "POST",
        headers: { ...bearer(account), "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(size), "X-Upload-Content-Type": "video/mp4" },
        body,
      });
      session = res.headers.get("location") ?? undefined;
      if (!session) throw new PublishError("YouTube gave no upload address.", { retry: true });
      save({ session });
      log(`Uploading ${(size / 1e6).toFixed(0)} MB to YouTube.`);
    } else log("Picking the upload up where it stopped.");
    let result: { id?: string };
    try {
      result = await sendBytes(session, file, size, account, resume);
    } catch (error) {
      // A session YouTube no longer knows: start a new one next time.
      if (error instanceof PublishError && /expired/.test(error.message)) save({ session: "" });
      throw error;
    }
    if (!result.id) throw new PublishError("YouTube took the file but gave no video id.", { retry: true });
    save({ videoId: result.id });
    await setThumbnail(context, result.id);
    return { state: scheduled ? "scheduled" : "published", url: linkFor(result.id, video), remoteId: result.id };
  },
};
