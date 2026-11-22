/**
 * X (spec.md §10.12), through your own X developer app. OAuth 2.0 with PKCE and `offline.access`: access tokens last
 * two hours and the refresh token changes on every refresh, so the new one is saved each time. X's API is pay per use,
 * so every post costs money (PLATFORM_INFO.x.cost); the publish dialog shows the price, and approving is paying.
 *
 * A video is the v2 chunked upload (initialize, append ≤ 5 MB segments, finalize, then STATUS until it's processed),
 * then POST /2/tweets with the media id. docs.x.com/x-api/media/quickstart/media-upload-chunked
 */
import { call, query, readChunk, sleep } from "../http.ts";
import { PublishError, type Account, type Provider, type PublishContext } from "../types.ts";

const API = "https://api.x.com";
const SCOPES = "tweet.read tweet.write users.read media.write offline.access";
/** X takes up to 8 MB a segment and asks for 5 MB or less. */
const SEGMENT = 4 * 1024 * 1024;

/** The token call: a confidential client (Web App, Automated App or Bot) authenticates with Basic; a public one sends only its id. */
function tokenCall(app: Record<string, string>, form: Record<string, string>) {
  const headers: Record<string, string> = {};
  if (app.clientSecret) headers.Authorization = `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}`;
  return call(`${API}/2/oauth2/token`, { method: "POST", headers, form: { ...form, client_id: app.clientId } });
}

const tokens = (data: any, before?: Account) => ({
  tokens: { access: data.access_token as string, refresh: (data.refresh_token as string | undefined) ?? before?.tokens.refresh ?? "" },
  expiresAt: Date.now() + Number(data.expires_in ?? 7200) * 1000,
});

async function publish({ job, account, file, video, log, save }: PublishContext) {
  const auth = { Authorization: `Bearer ${account.tokens.access}` };
  const username = account.handle?.replace(/^@/, "") ?? account.meta?.username ?? "i";
  // A retry after the post went through must not post (and pay) twice.
  if (job.handle.post) return { state: "published" as const, url: `https://x.com/${username}/status/${job.handle.post}`, remoteId: job.handle.post };

  let media = job.handle.media;
  // A media id lasts 24 hours; an older one is uploaded again.
  if (!media || Date.now() - Number(job.handle.mediaAt ?? 0) > 23 * 3600_000) {
    const { data: init } = await call(`${API}/2/media/upload/initialize`, { method: "POST", headers: auth, body: { media_type: "video/mp4", total_bytes: video.bytes, media_category: "tweet_video" } });
    media = init?.data?.id as string;
    if (!media) throw new PublishError("X didn't start the upload.", { retry: true });
    save({ media, mediaAt: String(Date.now()) });
    const segments = Math.ceil(video.bytes / SEGMENT);
    log(`Uploading ${segments} segment${segments === 1 ? "" : "s"} to X.`);
    for (let index = 0; index < segments; index++) {
      const chunk = await readChunk(file, index * SEGMENT, SEGMENT);
      const form = new FormData();
      form.set("segment_index", String(index));
      form.set("media", new Blob([new Uint8Array(chunk)], { type: "application/octet-stream" }), "chunk.mp4");
      await call(`${API}/2/media/upload/${media}/append`, { method: "POST", headers: auth, body: form });
    }
    const { data: done } = await call(`${API}/2/media/upload/${media}/finalize`, { method: "POST", headers: auth });
    let info = done?.data?.processing_info;
    // processing_info means X is still transcoding; none means it's ready.
    const until = Date.now() + 15 * 60_000;
    while (info && info.state !== "succeeded") {
      if (info.state === "failed") throw new PublishError(`X couldn't process the video: ${info.error?.message ?? info.error?.name ?? "no reason given"}.`);
      if (Date.now() > until) throw new PublishError("X was still processing the video after 15 minutes.", { retry: true });
      await sleep(Math.max(1, Number(info.check_after_secs ?? 2)) * 1000);
      const { data } = await call(`${API}/2/media/upload?${query({ command: "STATUS", media_id: media })}`, { headers: auth });
      info = data?.data?.processing_info;
    }
  }

  let posted: any;
  try {
    ({ data: posted } = await call(`${API}/2/tweets`, { method: "POST", headers: auth, body: { text: job.caption, media: { media_ids: [media] } } }));
  } catch (error) {
    // Pay per use with no credits left answers 402.
    if (error instanceof PublishError && / said 402 /.test(error.message)) throw new PublishError(`${error.message} Buy API credits in the X developer console (console.x.com), then post it again.`);
    throw error;
  }
  const id = posted?.data?.id as string | undefined;
  if (!id) throw new PublishError("X took the post but gave no id back. Check the account before posting it again.");
  save({ post: id });
  return { state: "published" as const, url: `https://x.com/${username}/status/${id}`, remoteId: id };
}

export const provider: Provider = {
  id: "x",
  label: "X",
  auth: "oauth",
  blurb: "Video posts to your X account, through your own X developer app.",
  console: "https://console.x.com",
  caveat: "Pay per use: about $0.015 a post, or $0.20 when the text has a link, from prepaid API credits. Videos up to 20 minutes (longer with Premium).",
  redirectHost: "127.0.0.1",
  platforms: ["x"],
  setup: [
    "Open the X developer console (console.x.com, or developer.x.com) signed in as any X account, and accept the developer agreement.",
    "Create a project and an app in it, or open the app you have.",
    "In the app, open User authentication settings and press Set up.",
    "App permissions: Read and write. Type of App: \"Web App, Automated App or Bot\" (it gives a client secret; \"Native App\" works too, with no secret).",
    "Callback URI / Redirect URL: exactly {redirect} (127.0.0.1, not localhost). Website URL: any page of yours. Save.",
    "On Keys and tokens, under OAuth 2.0 Client ID and Client Secret, copy both into the fields below and save. The secret is shown once.",
    "Buy API credits under Billing: X charges per post, and a post with no credits is refused.",
    "Press Connect and sign in as the account you want to post as. The account you connect doesn't have to be the developer account.",
  ],
  fields: [
    { key: "clientId", label: "OAuth 2.0 Client ID", placeholder: "From Keys and tokens" },
    { key: "clientSecret", label: "OAuth 2.0 Client Secret", secret: true, optional: true, placeholder: "Leave empty for a Native App" },
  ],

  authorizeUrl: (app, start) =>
    `https://x.com/i/oauth2/authorize?${query({
      response_type: "code",
      client_id: app.clientId,
      redirect_uri: start.redirectUri,
      scope: SCOPES,
      state: start.state,
      code_challenge: start.challenge,
      code_challenge_method: "S256",
    })}`,

  async exchange(app, code, start) {
    const { data } = await tokenCall(app, { code, grant_type: "authorization_code", redirect_uri: start.redirectUri, code_verifier: start.verifier });
    if (!data?.access_token) throw new Error("X gave no access token.");
    const { data: me } = await call(`${API}/2/users/me`, { headers: { Authorization: `Bearer ${data.access_token}` } });
    const user = me?.data;
    if (!user?.id) throw new Error("X didn't say whose account this is.");
    const account: Account = {
      id: `x:x:${user.id}`,
      provider: "x",
      platform: "x",
      name: user.name ?? user.username,
      handle: `@${user.username}`,
      remoteId: user.id,
      ...tokens(data),
      meta: { username: user.username },
      connectedAt: Date.now(),
    };
    if (!account.tokens.refresh) throw new Error("X gave no refresh token, so the login would end in two hours. Check that the app asks for offline.access.");
    return [account];
  },

  async refresh(app, account) {
    if (!account.tokens.refresh) throw new PublishError("There's no refresh token.", { reconnect: true });
    try {
      const { data } = await tokenCall(app, { grant_type: "refresh_token", refresh_token: account.tokens.refresh });
      return { ...account, ...tokens(data, account) };
    } catch (error) {
      // A refresh token that's used up or revoked answers 400: only a new login helps.
      if (error instanceof PublishError && !error.retry) throw new PublishError(error.message, { reconnect: true });
      throw error;
    }
  },

  publish,
};
