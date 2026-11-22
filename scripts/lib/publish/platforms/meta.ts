/**
 * Meta: Facebook Pages and Instagram professional accounts, through one app you make yourself (spec.md §10.12).
 *
 * It uses Facebook Login, not Instagram Login, because only Facebook Login apps may push a local file through
 * rupload.facebook.com. Instagram Login would need every MP4 at a public URL. So the Instagram account must be linked
 * to a Facebook Page, and every call uses that Page's token.
 *
 * Kept in Development mode, the app needs no App Review and no Business Verification: Standard Access covers the
 * accounts of people who hold a role on the app, and Meta allows http://localhost redirects automatically while in
 * Development mode (Meta's own error text, quoted by developers; register the URI anyway if Meta asks for it).
 *
 * Tokens: the login's code gives a short-lived user token, exchanged for a long-lived one (about 60 days). A Page token
 * fetched with a long-lived user token doesn't expire, so accounts have no expiresAt and no refresh. One is revoked if
 * you change your password or remove the app, and the next post then says to connect again.
 */
import { call, fileBlob, readChunk, sleep, waitFor, query } from "../http.ts";
import { PublishError, type Account, type Job, type Option, type Provider, type PublishContext, type PublishResult, type Connected } from "../types.ts";

/** Pinned, and bumped about once a year: a Graph version lives about two years. */
const VERSION = "v27.0";
const GRAPH = `https://graph.facebook.com/${VERSION}`;
const SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish", "business_management"];

const ERRORS = Array.from({ length: 200 }, (_, i) => 400 + i);

/**
 * A Graph call that reads Meta's error codes: 190 is a dead token (connect again); 4, 17, 32 and 613 are rate limits
 * and 1, 2 and 5xx are Meta's side (try later); anything else is this post's problem, in Meta's words.
 */
async function graph<T = any>(url: string, init: Parameters<typeof call>[1] = {}): Promise<T> {
  const { data, res } = await call(url, { ...init, okStatus: ERRORS });
  const error = data?.error ?? (res.ok ? undefined : { message: typeof data === "string" ? data.slice(0, 300) : `HTTP ${res.status}` });
  if (!error) return data as T;
  const code = Number(error.code);
  const said = [error.error_user_title, error.error_user_msg ?? error.message].filter(Boolean).join(": ") || `HTTP ${res.status}`;
  const message = `Meta said ${res.status}${code ? ` (code ${code}${error.error_subcode ? `/${error.error_subcode}` : ""})` : ""}: ${said}`;
  const retry = [1, 2, 4, 17, 32, 341, 613].includes(code) || error.is_transient === true || res.status === 429 || res.status >= 500;
  throw new PublishError(message, { retry, reconnect: code === 190 || res.status === 401 });
}

const auth = (token: string) => ({ Authorization: `OAuth ${token}` });

/* ── Connecting ─────────────────────────────────────────────────────────────────────────────────────── */

async function exchange(app: Record<string, string>, code: string, start: { redirectUri: string }): Promise<Connected> {
  const short = await graph<{ access_token: string }>(`${GRAPH}/oauth/access_token?${query({ client_id: app.appId, client_secret: app.appSecret, redirect_uri: start.redirectUri, code })}`);
  const long = await graph<{ access_token: string; expires_in?: number }>(
    `${GRAPH}/oauth/access_token?${query({ grant_type: "fb_exchange_token", client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: short.access_token })}`,
  );
  const pages: any[] = [];
  let next: string | undefined = `${GRAPH}/me/accounts?${query({ fields: "id,name,access_token,tasks,instagram_business_account{id,username,name}", limit: "100", access_token: long.access_token })}`;
  while (next) {
    const reply: any = await graph(next);
    pages.push(...(reply.data ?? []));
    next = reply.paging?.next;
  }
  if (!pages.length) throw new Error("The login worked, but it gave no Facebook Page. Pick the Pages (and their Instagram accounts) when Facebook asks, and check you have a role on the app.");
  const now = Date.now();
  const accounts: Account[] = [];
  for (const page of pages) {
    if (!page.access_token) continue;
    accounts.push({
      id: `meta:facebook:${page.id}`,
      provider: "meta",
      platform: "facebook",
      name: page.name,
      remoteId: page.id,
      tokens: { page: page.access_token },
      meta: { pageId: page.id },
      connectedAt: now,
    });
    const ig = page.instagram_business_account;
    if (ig?.id)
      accounts.push({
        id: `meta:instagram:${ig.id}`,
        provider: "meta",
        platform: "instagram",
        name: ig.username ? `@${ig.username}` : (ig.name ?? page.name),
        handle: ig.username,
        remoteId: ig.id,
        tokens: { page: page.access_token },
        meta: { pageId: page.id, pageName: page.name },
        connectedAt: now,
      });
  }
  const connected: Connected = accounts;
  if (!accounts.some((account) => account.platform === "instagram")) connected.note = await noInstagram(long.access_token);
  return connected;
}

/**
 * Why a login gave Pages but no Instagram account. An Instagram professional account links to one Page at a time, and
 * it comes through whichever Page that is, so the cause is the permissions or the link, never which Page.
 */
async function noInstagram(token: string): Promise<string> {
  const reply = await graph<{ data?: { permission: string; status: string }[] }>(`${GRAPH}/me/permissions?${query({ access_token: token })}`).catch(() => undefined);
  const granted = new Set((reply?.data ?? []).filter((row) => row.status === "granted").map((row) => row.permission));
  const missing = ["instagram_basic", "instagram_content_publish"].filter((permission) => !granted.has(permission));
  if (reply && missing.length)
    return `No Instagram account: Facebook didn't grant ${missing.join(" and ")}. Add the Instagram product to your Meta app (API setup with Facebook login) or those permissions to its configuration, then Connect again and tick the Instagram account when Facebook asks.`;
  return "No Instagram account: none of these Pages has one linked. Link your Instagram professional account to any one of them (in Instagram, Edit profile → Page; or the Page's Settings → Linked accounts → Instagram), then Connect again. One Instagram account links to one Page, and any of them will do: the desk posts every brand's ads to it.";
}

/* ── Instagram ──────────────────────────────────────────────────────────────────────────────────────── */

/** Meta enforces about 100 posts a day per account (one part of its docs says 50), so ask before uploading. */
async function checkQuota(igId: string, token: string) {
  const reply = await graph<any>(`${GRAPH}/${igId}/content_publishing_limit?${query({ fields: "quota_usage,config", access_token: token })}`).catch(() => undefined);
  const row = reply?.data?.[0];
  const total = Number(row?.config?.quota_total ?? 0);
  if (total && Number(row?.quota_usage ?? 0) >= total) throw new PublishError(`This Instagram account has used all ${total} of its API posts for the last 24 hours. Post it again later.`);
}

async function instagram({ job, account, file, video, log, save }: PublishContext): Promise<PublishResult> {
  const token = account.tokens.page;
  const igId = account.remoteId;
  const story = job.options.kind === "story";
  // A retry after media_publish worked only fetches the link: posting twice is worse than a missing link.
  if (job.handle.igMedia) return { state: "published", remoteId: job.handle.igMedia, url: job.handle.igUrl };
  await checkQuota(igId, token);

  let container: string | undefined = job.handle.igContainer;
  if (container) {
    const status = await graph<any>(`${GRAPH}/${container}?${query({ fields: "status_code", access_token: token })}`).catch(() => undefined);
    // An upload that never finished, or a container past its 24 hours, starts again.
    if (!status || ["ERROR", "EXPIRED"].includes(status.status_code) || !job.handle.igUploaded) container = undefined;
  }
  if (!container) {
    const params: Record<string, string> = { media_type: story ? "STORIES" : "REELS", upload_type: "resumable" };
    if (!story) {
      params.caption = job.caption;
      params.share_to_feed = String(job.options.feed !== false);
      // cover_url must be a public image, and the cover is on this PC, so the cover is the video's first frame
      // (thumb_offset 0), which nykma makes to work as one (spec.md §10.9's "frame 0 as the thumbnail").
      params.thumb_offset = "0";
    }
    if (job.options.ai === true) params.is_ai_generated = "true";
    const created = await graph<{ id: string; uri?: string }>(`${GRAPH}/${igId}/media`, { method: "POST", form: { ...params, access_token: token } });
    container = created.id;
    save({ igContainer: container, igUri: created.uri ?? `https://rupload.facebook.com/ig-api-upload/${VERSION}/${container}`, igUploaded: "" });
    log(`Made the Instagram ${story ? "story" : "reel"} container, uploading ${(video.bytes / 1e6).toFixed(0)} MB.`);
    const uploaded = await call<any>(job.handle.igUri, {
      method: "POST",
      headers: { ...auth(token), offset: "0", file_size: String(video.bytes), "content-type": "application/octet-stream" },
      body: await fileBlob(file, "application/octet-stream"),
      okStatus: ERRORS,
    });
    if (!uploaded.res.ok || uploaded.data?.success === false) {
      const info = uploaded.data?.debug_info ?? uploaded.data?.error ?? {};
      throw new PublishError(`Instagram's upload said ${uploaded.res.status}: ${info.message ?? JSON.stringify(uploaded.data).slice(0, 300)}`, { retry: info.retriable !== false && (uploaded.res.status >= 500 || info.retriable === true) });
    }
    save({ igUploaded: "yes" });
  }

  log("Uploaded. Waiting for Instagram to process it.");
  await waitFor(
    async () => {
      const status = await graph<any>(`${GRAPH}/${container}?${query({ fields: "status_code,status", access_token: token })}`);
      if (status.status_code === "FINISHED" || status.status_code === "PUBLISHED") return true;
      if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
        save({ igContainer: "", igUploaded: "" });
        throw new PublishError(`Instagram couldn't process the video: ${status.status ?? status.status_code}. Check it's H.264 with AAC audio and faststart.`);
      }
      return undefined;
    },
    { every: 10_000, timeout: 20 * 60_000, what: "Instagram" },
  );

  const published = await graph<{ id: string }>(`${GRAPH}/${igId}/media_publish`, { method: "POST", form: { creation_id: container, access_token: token } });
  save({ igMedia: published.id });
  const link = await graph<{ permalink?: string }>(`${GRAPH}/${published.id}?${query({ fields: "permalink", access_token: token })}`).catch(() => ({}) as { permalink?: string });
  if (link.permalink) save({ igUrl: link.permalink });
  return { state: "published", remoteId: published.id, url: link.permalink };
}

/* ── Facebook Pages ─────────────────────────────────────────────────────────────────────────────────── */

/** Facebook's schedule is Unix seconds, between 10 minutes and 29 days (Reels) or 6 months (videos) ahead. */
const when = (job: Job) => (job.native && job.at ? String(Math.floor(job.at / 1000)) : undefined);

/** A 9:16 of 90 seconds or less goes up as a Reel, through rupload from disk. */
async function reel({ job, account, file, video, log, save }: PublishContext): Promise<PublishResult> {
  const token = account.tokens.page;
  const pageId = account.remoteId;
  const scheduled = when(job);
  let videoId = job.handle.fbReel;
  if (!videoId || !job.handle.fbReelUploaded) {
    const started = await graph<{ video_id: string; upload_url?: string }>(`${GRAPH}/${pageId}/video_reels`, { method: "POST", form: { upload_phase: "start", access_token: token } });
    videoId = started.video_id;
    save({ fbReel: videoId, fbReelUploaded: "" });
    log(`Uploading the Reel, ${(video.bytes / 1e6).toFixed(0)} MB.`);
    const uploaded = await call<any>(started.upload_url ?? `https://rupload.facebook.com/video-upload/${VERSION}/${videoId}`, {
      method: "POST",
      headers: { ...auth(token), offset: "0", file_size: String(video.bytes), "content-type": "application/octet-stream" },
      body: await fileBlob(file, "application/octet-stream"),
      okStatus: ERRORS,
    });
    if (!uploaded.res.ok || uploaded.data?.success === false) {
      const info = uploaded.data?.debug_info ?? uploaded.data?.error ?? {};
      throw new PublishError(`Facebook's upload said ${uploaded.res.status}: ${info.message ?? JSON.stringify(uploaded.data).slice(0, 300)}`, { retry: uploaded.res.status >= 500 || info.retriable === true });
    }
    save({ fbReelUploaded: "yes" });
  }
  const finish: Record<string, string> = { upload_phase: "finish", video_id: videoId, video_state: scheduled ? "SCHEDULED" : "PUBLISHED", description: job.caption, access_token: token };
  if (job.title) finish.title = job.title;
  if (scheduled) finish.scheduled_publish_time = scheduled;
  await graph(`${GRAPH}/${pageId}/video_reels`, { method: "POST", form: finish });
  save({ fbVideo: videoId });
  return { state: scheduled ? "scheduled" : "published", remoteId: videoId, url: `https://www.facebook.com/reel/${videoId}` };
}

/**
 * Any other video goes to /videos in chunks (upload_phase start, transfer, finish), which takes files of a gigabyte
 * and more without holding them in memory. Nothing appears on the Page until finish.
 */
async function pageVideo({ job, account, file, video, log, save }: PublishContext): Promise<PublishResult> {
  const token = account.tokens.page;
  const pageId = account.remoteId;
  const scheduled = when(job);
  const url = `https://graph-video.facebook.com/${VERSION}/${pageId}/videos`;
  const started = await graph<{ upload_session_id: string; video_id: string; start_offset: string; end_offset: string }>(url, {
    method: "POST",
    form: { upload_phase: "start", file_size: String(video.bytes), access_token: token },
  });
  log(`Uploading the video, ${(video.bytes / 1e6).toFixed(0)} MB, in chunks.`);
  let start = Number(started.start_offset);
  let end = Number(started.end_offset);
  while (start < end) {
    const chunk = await readChunk(file, start, end - start);
    const body = new FormData();
    body.set("upload_phase", "transfer");
    body.set("upload_session_id", started.upload_session_id);
    body.set("start_offset", String(start));
    body.set("access_token", token);
    body.set("video_file_chunk", new Blob([new Uint8Array(chunk)], { type: "application/octet-stream" }), "chunk");
    let next: { start_offset: string; end_offset: string } | undefined;
    for (let attempt = 0; !next; attempt++) {
      try {
        next = await graph(url, { method: "POST", body });
      } catch (error) {
        // A chunk can fail on its own; Meta asks for that chunk again, not the whole file.
        if (!(error instanceof PublishError) || !error.retry || attempt >= 3) throw error;
        await sleep(5000 * (attempt + 1));
      }
    }
    start = Number(next.start_offset);
    end = Number(next.end_offset);
  }
  const finish: Record<string, string> = { upload_phase: "finish", upload_session_id: started.upload_session_id, description: job.caption, access_token: token };
  if (job.title) finish.title = job.title;
  if (scheduled) Object.assign(finish, { published: "false", scheduled_publish_time: scheduled });
  await graph(url, { method: "POST", form: finish });
  save({ fbVideo: started.video_id });
  const link = await graph<{ permalink_url?: string }>(`${GRAPH}/${started.video_id}?${query({ fields: "permalink_url", access_token: token })}`).catch(() => ({}) as { permalink_url?: string });
  const permalink = link.permalink_url ? (link.permalink_url.startsWith("http") ? link.permalink_url : `https://www.facebook.com${link.permalink_url}`) : `https://www.facebook.com/${pageId}/videos/${started.video_id}`;
  return { state: scheduled ? "scheduled" : "published", remoteId: started.video_id, url: permalink };
}

async function facebook(context: PublishContext): Promise<PublishResult> {
  const { job, video } = context;
  // Posted already: a retry must not post it again.
  if (job.handle.fbVideo) return { state: job.native && job.at && job.at > Date.now() ? "scheduled" : "published", remoteId: job.handle.fbVideo };
  const vertical = video.height > video.width;
  const asReel = job.options.kind !== "video" && vertical && video.seconds > 0 && video.seconds <= 90;
  return asReel ? reel(context) : pageVideo(context);
}

/* ── The provider ───────────────────────────────────────────────────────────────────────────────────── */

export const provider: Provider = {
  id: "meta",
  label: "Meta (Facebook and Instagram)",
  auth: "oauth",
  blurb: "Facebook Pages, and the Instagram professional accounts linked to them, through a Meta app you make.",
  console: "https://developers.facebook.com/apps",
  redirectHost: "localhost",
  caveat: "Free. Instagram can't hold a scheduled post, so the desk posts it at the time; about 100 Instagram posts a day. Personal profiles can't be posted to.",
  platforms: ["facebook", "instagram"],
  setup: [
    "Make the Instagram account a professional one (Business or Creator) in the Instagram app, and link it to one of your Facebook Pages (Page settings → Linked accounts). An Instagram account links to one Page at a time, and any of yours will do: it's still the one account the desk posts to.",
    "Go to developers.facebook.com/apps and press Create app. Pick the Business type (under \"Other\" if asked), with no business portfolio needed.",
    "Add the Facebook Login for Business product (Facebook Login works too) and the Instagram product, set to \"API setup with Facebook login\".",
    "Leave the app in Development mode. Development mode needs no App Review: the app can post for anyone with a role on it.",
    "Under App roles → Roles, make sure you're an admin. Add anyone else who manages one of the Pages as a developer or tester, and have them accept.",
    "Under Facebook Login → Settings, add {redirect} to Valid OAuth Redirect URIs if Meta asks for it (Development mode allows localhost on its own).",
    "If you use Facebook Login for Business, make a Configuration with the permissions pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic, instagram_content_publish and business_management, and paste its ID below. With plain Facebook Login, leave it empty.",
    "Copy the App ID and App Secret from App settings → Basic into the fields below, save, and press Connect. Pick every Page and Instagram account you want the desk to post to.",
  ],
  fields: [
    { key: "appId", label: "App ID", placeholder: "1234567890123456" },
    { key: "appSecret", label: "App Secret", secret: true },
    { key: "configId", label: "Configuration ID", optional: true, help: "Only for Facebook Login for Business: the configuration with the permissions above." },
  ],

  authorizeUrl: (app, start) =>
    `https://www.facebook.com/${VERSION}/dialog/oauth?${query({
      client_id: app.appId,
      redirect_uri: start.redirectUri,
      state: start.state,
      response_type: "code",
      ...(app.configId ? { config_id: app.configId, override_default_response_type: "true" } : { scope: SCOPES.join(",") }),
    })}`,

  exchange,

  options: async (account): Promise<Option[]> =>
    account.platform === "instagram"
      ? [
          { key: "kind", label: "Post as", type: "select", choices: [{ value: "reel", label: "Reel" }, { value: "story", label: "Story (3 to 60 s, no caption)" }], default: "reel" },
          { key: "feed", label: "Also show it in the feed", type: "toggle", default: true, when: { key: "kind", is: "reel" } },
        ]
      : [
          { key: "kind", label: "Post as", type: "select", choices: [{ value: "auto", label: "A Reel if it's 9:16 and 90 s or less, else a video" }, { value: "video", label: "A video" }], default: "auto" },
        ],

  publish: (context) => (context.account.platform === "instagram" ? instagram(context) : facebook(context)),
};
