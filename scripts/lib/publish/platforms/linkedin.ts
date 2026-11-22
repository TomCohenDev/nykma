/**
 * LinkedIn, to your own profile (spec.md §10.12). The self-serve products, "Sign In with LinkedIn using OpenID
 * Connect" and "Share on LinkedIn", give `openid profile w_member_social`: enough to post as yourself, not as a Company
 * Page (that's the vetted Community Management API). Self-serve tokens last 60 days and have no refresh token, so the
 * account says when to connect again.
 *
 * A video post is the Videos API (initializeUpload, a PUT per 4 MB part keeping each ETag, finalizeUpload, then wait
 * for AVAILABLE) and then the Posts API, both of which accept w_member_social for a person's own URN.
 * learn.microsoft.com/linkedin/marketing/community-management/shares/videos-api and .../posts-api
 */
import { call, query, readChunk, waitFor } from "../http.ts";
import { PublishError, type Account, type Provider, type PublishContext } from "../types.ts";

/** Versions are retired about a year after release; 202601 ends on 15 January 2027. Move this forward each year. */
const VERSION = "202610";
const API = "https://api.linkedin.com";
const SCOPES = "openid profile w_member_social";

const rest = (token: string) => ({ Authorization: `Bearer ${token}`, "Linkedin-Version": VERSION, "X-Restli-Protocol-Version": "2.0.0" });

/**
 * Commentary is "little text": these characters are markup and must be escaped to show as typed. A `#` before a
 * word stays unescaped, so hashtags stay hashtags.
 * learn.microsoft.com/linkedin/marketing/community-management/shares/little-text-format
 */
export function littleText(text: string) {
  return text.replace(/[\\|{}@[\]()<>*_~#]/g, (char, at: number) => (char === "#" && /[\p{L}\p{N}]/u.test(text[at + 1] ?? "") ? char : `\\${char}`));
}

async function publish({ job, account, file, thumbnail, video, log, save }: PublishContext) {
  const token = account.tokens.access;
  const owner = `urn:li:person:${account.remoteId}`;
  // A retry after the post went through must not post it twice.
  if (job.handle.post) return { state: "published" as const, url: `https://www.linkedin.com/feed/update/${job.handle.post}/`, remoteId: job.handle.post };

  let videoUrn = job.handle.video;
  if (!videoUrn || !job.handle.finalized) {
    const { data } = await call(`${API}/rest/videos?action=initializeUpload`, {
      method: "POST",
      headers: rest(token),
      body: { initializeUploadRequest: { owner, fileSizeBytes: video.bytes, uploadCaptions: false, uploadThumbnail: Boolean(thumbnail) } },
    });
    const value = data?.value ?? {};
    const parts: { uploadUrl: string; firstByte: number; lastByte: number }[] = value.uploadInstructions ?? [];
    if (!value.video || !parts.length) throw new PublishError("LinkedIn didn't give an upload address for the video.", { retry: true });
    videoUrn = value.video as string;
    save({ video: videoUrn });
    log(`Uploading ${parts.length} part${parts.length === 1 ? "" : "s"} to LinkedIn.`);
    const etags: string[] = [];
    for (const part of parts) {
      const chunk = await readChunk(file, part.firstByte, part.lastByte - part.firstByte + 1);
      const { res } = await call(part.uploadUrl, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body: chunk });
      const etag = res.headers.get("etag");
      if (!etag) throw new PublishError("LinkedIn took a part of the video but gave no ETag for it.", { retry: true });
      etags.push(etag.replace(/^"|"$/g, ""));
    }
    if (thumbnail && value.thumbnailUploadUrl) {
      const { readFile } = await import("node:fs/promises");
      await call(value.thumbnailUploadUrl, { method: "PUT", headers: { "content-type": "application/octet-stream", "media-type-family": "STILLIMAGE" }, body: await readFile(thumbnail) });
    }
    await call(`${API}/rest/videos?action=finalizeUpload`, {
      method: "POST",
      headers: rest(token),
      body: { finalizeUploadRequest: { video: videoUrn, uploadToken: value.uploadToken ?? "", uploadedPartIds: etags } },
    });
    save({ finalized: "yes" });
  }

  log("LinkedIn is processing the video.");
  await waitFor(
    async () => {
      const { data } = await call(`${API}/rest/videos/${encodeURIComponent(videoUrn!)}`, { headers: rest(token) });
      if (data?.status === "PROCESSING_FAILED") throw new PublishError(`LinkedIn couldn't process the video: ${data.processingFailureReason ?? "no reason given"}.`);
      return data?.status === "AVAILABLE" ? true : undefined;
    },
    { every: 5000, timeout: 20 * 60_000, what: "LinkedIn" },
  );

  const { res } = await call(`${API}/rest/posts`, {
    method: "POST",
    headers: rest(token),
    body: {
      author: owner,
      commentary: littleText(job.caption),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: videoUrn, ...(job.title ? { title: job.title } : {}) } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    },
  });
  const post = res.headers.get("x-restli-id") ?? "";
  if (post) save({ post });
  return { state: "published" as const, url: post ? `https://www.linkedin.com/feed/update/${post}/` : undefined, remoteId: post || undefined };
}

export const provider: Provider = {
  id: "linkedin",
  label: "LinkedIn",
  auth: "oauth",
  blurb: "Video posts to your own LinkedIn profile, through your own LinkedIn app.",
  console: "https://www.linkedin.com/developers/apps",
  caveat: "Your personal profile only: a Company Page needs LinkedIn's vetted Community Management API. Free. The login lasts 60 days with no refresh, so you connect again then.",
  redirectHost: "localhost",
  platforms: ["linkedin"],
  setup: [
    "Open linkedin.com/developers/apps and press Create app.",
    "Name it (for example \"nykma\"), and under LinkedIn Page pick a Page you admin. LinkedIn asks for one even for posting to your own profile; any of yours works, or make a small one.",
    "Add a logo, tick the legal agreement and press Create app.",
    "On the Products tab, press Request access on \"Sign In with LinkedIn using OpenID Connect\" and on \"Share on LinkedIn\". Both are self-serve and granted at once.",
    "On the Auth tab, under Authorized redirect URLs for your app, add exactly {redirect} and press Update.",
    "Still on the Auth tab, copy the Client ID and the Primary Client Secret into the fields below and save.",
    "Press Connect and sign in to LinkedIn as the profile you want to post as.",
  ],
  fields: [
    { key: "clientId", label: "Client ID", placeholder: "From the Auth tab" },
    { key: "clientSecret", label: "Client secret", secret: true, placeholder: "Primary Client Secret, from the Auth tab" },
  ],

  authorizeUrl: (app, start) =>
    `https://www.linkedin.com/oauth/v2/authorization?${query({ response_type: "code", client_id: app.clientId, redirect_uri: start.redirectUri, state: start.state, scope: SCOPES })}`,

  async exchange(app, code, start) {
    const { data: token } = await call("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      form: { grant_type: "authorization_code", code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: start.redirectUri },
    });
    if (!token?.access_token) throw new Error("LinkedIn gave no access token.");
    const { data: me } = await call(`${API}/v2/userinfo`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!me?.sub) throw new Error("LinkedIn didn't say whose account this is.");
    const ends = Date.now() + Number(token.expires_in ?? 5_184_000) * 1000;
    const account: Account = {
      id: `linkedin:linkedin:${me.sub}`,
      provider: "linkedin",
      platform: "linkedin",
      name: me.name || [me.given_name, me.family_name].filter(Boolean).join(" ") || "LinkedIn profile",
      remoteId: me.sub,
      tokens: { access: token.access_token },
      expiresAt: ends,
      reconnectBy: ends,
      connectedAt: Date.now(),
    };
    return [account];
  },

  publish,
};
