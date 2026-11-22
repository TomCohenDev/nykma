/**
 * TikTok, through your own TikTok developer app with Login Kit for Desktop (spec.md §10.12). Desktop allows a
 * loopback redirect (localhost or 127.0.0.1 with a port) and needs PKCE, with the challenge as the SHA-256 in hex
 * rather than RFC 7636's base64url (developers.tiktok.com/doc/login-kit-desktop).
 *
 * Two ways to post:
 *   inbox   (video.upload)  the video lands in the TikTok app's inbox, and you finish and post it there. The default:
 *                           it needs no audit, and the post can be public.
 *   direct  (video.publish) posts at once. Until TikTok audits the app, a post is private (SELF_ONLY), only to a
 *                           private account, for at most 5 users a day, and it stays private after an audit. TikTok's
 *                           audit wants an app for "a wide audience", which a personal tool won't be.
 *
 * Direct Post must follow TikTok's composer rules (content-sharing-guidelines): the creator's nickname from a fresh
 * creator_info, a privacy choice with no default, comment/duet/stitch off unless you turn them on, and the
 * commercial-content disclosure. The options below are that composer. The desk never adds its own branding to a post.
 */
import { stat } from "node:fs/promises";
import { call, query, readChunk, waitFor } from "../http.ts";
import { PublishError, type Account, type Option, type Provider } from "../types.ts";

const AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";
const SCOPES = "user.info.basic,video.upload,video.publish";
const MB = 1024 * 1024;

type Tokens = { access_token: string; expires_in: number; refresh_token: string; refresh_expires_in: number; open_id: string; scope: string; error?: string; error_description?: string };
type Creator = {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
};

const PRIVACY_LABEL: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

/** TikTok's API answers 200 with `error.code` other than "ok" for some failures, so both are checked. */
async function api<T>(account: Account, path: string, body: unknown): Promise<T> {
  let data: any;
  try {
    ({ data } = await call(`${API}${path}`, { method: "POST", headers: { Authorization: `Bearer ${account.tokens.access_token}`, "Content-Type": "application/json; charset=UTF-8" }, body: body as object }));
  } catch (error) {
    throw explain(error as Error);
  }
  const code = data?.error?.code;
  if (code && code !== "ok") throw explain(new Error(`TikTok said ${code}: ${data.error.message ?? ""}`));
  return data?.data as T;
}

/** TikTok's error codes, in words, with whether trying again helps. spam_risk_* never does. */
function explain(error: Error): PublishError {
  const message = String(error.message);
  if (/access_token_invalid|token.*expired/.test(message)) return new PublishError("TikTok refused the login. Connect TikTok again.", { reconnect: true });
  if (/scope_not_authorized/.test(message)) return new PublishError("The login doesn't allow this kind of post. Connect TikTok again and allow every permission it asks for, or add the scope to the app in TikTok's developer portal.", { reconnect: true });
  if (/unaudited_client_can_only_post_to_private_accounts/.test(message)) return new PublishError("TikTok hasn't audited this app, so Direct Post works only to a private account. Make the TikTok account private, or send it to the inbox instead.");
  if (/spam_risk_too_many_posts/.test(message)) return new PublishError("TikTok's daily post limit for this account is reached (about 15 a day across all apps). Try tomorrow.");
  if (/spam_risk_too_many_pending_share/.test(message)) return new PublishError("Too many videos are waiting in the TikTok inbox. Post or delete some in the TikTok app, then try again.");
  if (/spam_risk/.test(message)) return new PublishError(`TikTok refused it as spam risk: ${message}`);
  if (/reached_active_user_cap/.test(message)) return new PublishError("This TikTok app has reached its daily limit of posting users (5 a day before an audit).");
  if (/rate_limit_exceeded/.test(message)) return new PublishError("TikTok's rate limit: it takes a few requests a minute.", { retry: true });
  return error instanceof PublishError ? error : new PublishError(message);
}

/** The token endpoint answers errors in the body. invalid_grant means the refresh token is gone or was used twice. */
async function token(form: Record<string, string>): Promise<Tokens> {
  const { data } = await call<Tokens>(`${API}/oauth/token/`, { method: "POST", form, headers: { "Cache-Control": "no-cache" } }).catch((error) => {
    throw /invalid_grant|invalid_client/.test(String(error.message)) ? new PublishError("TikTok refused the login. Connect TikTok again.", { reconnect: true }) : error;
  });
  if (data.error || !data.access_token) {
    const reconnect = /invalid_grant|invalid_client|expired/.test(`${data.error} ${data.error_description}`);
    throw new PublishError(`TikTok refused the login: ${data.error_description || data.error || "no token"}.`, { reconnect });
  }
  return data;
}

const withTokens = (account: Account, tokens: Tokens): Account => ({
  ...account,
  tokens: { access_token: tokens.access_token, refresh_token: tokens.refresh_token },
  expiresAt: Date.now() + tokens.expires_in * 1000,
  reconnectBy: Date.now() + tokens.refresh_expires_in * 1000,
  meta: { ...account.meta, scope: tokens.scope },
});

const creatorInfo = (account: Account) => api<Creator>(account, "/post/publish/creator_info/query/", {});

/**
 * Chunks as TikTok's Media Transfer Guide wants them: one chunk up to 64 MB, otherwise 20 MB chunks with the rest in
 * the last one (at most 128 MB), and total_chunk_count = floor(size / chunk_size).
 */
function chunking(size: number) {
  if (size <= 64 * MB) return { chunk: size, count: 1 };
  const chunk = 20 * MB;
  return { chunk, count: Math.floor(size / chunk) };
}

export const provider: Provider = {
  id: "tiktok",
  label: "TikTok",
  auth: "oauth",
  blurb: "Videos to your TikTok inbox to finish in the app, or posted directly once TikTok audits the app.",
  console: "https://developers.tiktok.com/apps",
  redirectHost: "127.0.0.1",
  caveat: "Free. Until TikTok audits the app, Direct Post is private-only, to a private account, for 5 users a day; the inbox needs no audit. About 15 posts a day per account across all apps. No scheduling: the desk posts at the time, if it's running.",
  platforms: ["tiktok"],
  setup: [
    "Go to developers.tiktok.com, log in, and under Manage apps press Connect an app (an individual developer account is fine).",
    "Fill in the app's name, icon, category and description. TikTok asks for a terms of service and privacy policy URL: use pages you control (a GitHub page works).",
    "Platforms: choose Desktop.",
    "Add products: Login Kit and Content Posting API. In Content Posting API, turn on Direct Post if you want it (it stays private until an audit).",
    "Login Kit → Redirect URI (Desktop): add {redirect} exactly.",
    "Scopes: user.info.basic, video.upload and video.publish.",
    "Submit the app for review. While it's in review or sandbox, add your TikTok account as a target user under Sandbox to test.",
    "Copy the Client key and Client secret from the app's page into the fields below and save, then press Connect.",
    "To post: pick Send to inbox, then open the TikTok app, tap the notification, and post it from there (TikTok's inbox upload takes no caption, so paste it in the app). Drafts left in the inbox are reported to vanish after about a day.",
  ],
  fields: [
    { key: "clientKey", label: "Client key", placeholder: "aw…" },
    { key: "clientSecret", label: "Client secret", secret: true },
  ],

  authorizeUrl: (app, start) =>
    `${AUTH}?${query({
      client_key: app.clientKey,
      scope: SCOPES,
      response_type: "code",
      redirect_uri: start.redirectUri,
      state: start.state,
      // Desktop Login Kit wants the S256 digest hex-encoded.
      code_challenge: start.challengeHex,
      code_challenge_method: "S256",
    })}`,

  async exchange(app, code, start) {
    const tokens = await token({ client_key: app.clientKey, client_secret: app.clientSecret, code, grant_type: "authorization_code", redirect_uri: start.redirectUri, code_verifier: start.verifier });
    const now = Date.now();
    const base: Account = {
      id: `tiktok:tiktok:${tokens.open_id}`,
      provider: "tiktok",
      platform: "tiktok",
      name: "TikTok",
      remoteId: tokens.open_id,
      tokens: {},
      connectedAt: now,
    };
    const account = withTokens(base, tokens);
    const { data } = await call<{ data?: { user?: { display_name?: string; avatar_url?: string } } }>(`${API}/user/info/?${query({ fields: "open_id,display_name,avatar_url" })}`, { headers: { Authorization: `Bearer ${tokens.access_token}` } }).catch(() => ({ data: {} as { data?: { user?: { display_name?: string } } } }));
    account.name = data.data?.user?.display_name || "TikTok";
    // The username needs creator_info, which needs video.publish; without it the account still posts to the inbox.
    const creator = await creatorInfo(account).catch(() => undefined);
    if (creator?.creator_username) account.handle = creator.creator_username;
    if (creator?.creator_nickname) account.name = creator.creator_nickname;
    return [account];
  },

  /** Every refresh gives a new refresh token, and the old one stops working, so the whole account is returned to save. */
  async refresh(app, account) {
    const tokens = await token({ client_key: app.clientKey, client_secret: app.clientSecret, grant_type: "refresh_token", refresh_token: account.tokens.refresh_token });
    return withTokens(account, tokens);
  },

  /** TikTok's composer: asked fresh each time the dialog opens, as its guidelines require. */
  async options(account): Promise<Option[]> {
    const music = "By posting, you agree to TikTok's Music Usage Confirmation (tiktok.com/legal/page/global/music-usage-confirmation).";
    let creator: Creator | undefined;
    let why = "";
    try {
      creator = await creatorInfo(account);
    } catch (error) {
      why = String((error as Error).message);
    }
    const who = creator?.creator_nickname ? `${creator.creator_nickname}${creator.creator_username ? ` (@${creator.creator_username})` : ""}` : account.name;
    if (!creator)
      return [
        { key: "mode", label: `Post to ${who}`, type: "select", default: "inbox", choices: [{ value: "inbox", label: "Send to the TikTok inbox, finish in the app" }], help: `Direct Post isn't available for this login${why ? ` (${why})` : ""}. ${music}` },
      ];
    const opts: Option[] = [
      {
        key: "mode",
        label: `Post to ${who}`,
        type: "select",
        default: "inbox",
        choices: [
          { value: "inbox", label: "Send to the TikTok inbox, finish in the app" },
          { value: "direct", label: "Post directly (private until TikTok audits the app)" },
        ],
        help: `${music}${creator.max_video_post_duration_sec ? ` This account can post videos up to ${creator.max_video_post_duration_sec} s.` : ""} Processing can take a few minutes after the upload.`,
      },
      {
        key: "privacy",
        label: "Who can watch",
        type: "select",
        required: true,
        choices: (creator.privacy_level_options ?? []).map((value) => ({ value, label: PRIVACY_LABEL[value] ?? value })),
        help: "Until TikTok audits the app, only \"Only me\" works. Branded content can't be private.",
        when: { key: "mode", is: "direct" },
      },
    ];
    const allow = (key: string, label: string, disabled?: boolean) =>
      disabled ? [] : [{ key, label, type: "toggle" as const, default: false, when: { key: "mode", is: "direct" } }];
    opts.push(...allow("allowComments", "Allow comments", creator.comment_disabled));
    opts.push(...allow("allowDuet", "Allow Duet", creator.duet_disabled));
    opts.push(...allow("allowStitch", "Allow Stitch", creator.stitch_disabled));
    opts.push(
      { key: "commercial", label: "Commercial content", type: "toggle", default: false, help: "Turn on if this promotes yourself, a brand, product or service. Then pick at least one below.", when: { key: "mode", is: "direct" } },
      { key: "brandOrganic", label: "Your brand: you're promoting yourself or your own business (labelled \"Promotional content\")", type: "toggle", default: false, when: { key: "commercial", is: true } },
      { key: "brandContent", label: "Branded content: you're promoting another brand or a third party (labelled \"Paid partnership\"; see TikTok's Branded Content Policy)", type: "toggle", default: false, when: { key: "commercial", is: true } },
    );
    return opts;
  },

  /** TikTok's composer rules, checked when you approve so they fail on the dialog and not at the post's time. */
  validate({ options }) {
    if (options.mode !== "direct" || options.commercial !== true) return undefined;
    if (options.brandOrganic !== true && options.brandContent !== true) return "You need to indicate if your content promotes yourself, a third party, or both: turn on Your brand or Branded content.";
    if (options.brandContent === true && options.privacy === "SELF_ONLY") return "Branded content visibility cannot be set to private.";
    return undefined;
  },

  async publish({ job, account, file, video, log, save }) {
    const mode = job.options.mode === "direct" ? "direct" : "inbox";
    const finalState = mode === "inbox" ? ("inbox" as const) : ("published" as const);

    // A retry after the bytes went up: only ask how it's going, never upload twice.
    let publishId = job.handle.uploaded === "1" ? job.handle.publishId : undefined;
    if (!publishId) {
      const size = (await stat(file)).size;
      const { chunk, count } = chunking(size);
      const source_info = { source: "FILE_UPLOAD", video_size: size, chunk_size: chunk, total_chunk_count: count };
      let init: { publish_id: string; upload_url: string };
      if (mode === "inbox") {
        init = await api(account, "/post/publish/inbox/video/init/", { source_info });
      } else {
        // TikTok wants the composer checked against a fresh creator_info at post time.
        const creator = await creatorInfo(account);
        const privacy = String(job.options.privacy ?? "");
        if (!creator.privacy_level_options?.includes(privacy)) throw new PublishError(`TikTok doesn't offer "${PRIVACY_LABEL[privacy] ?? (privacy || "no privacy level")}" for this account now. Approve it again and pick one it offers.`);
        if (creator.max_video_post_duration_sec && video.seconds > creator.max_video_post_duration_sec) throw new PublishError(`The video is ${Math.round(video.seconds)} s, and this TikTok account can post up to ${creator.max_video_post_duration_sec} s.`);
        const commercial = job.options.commercial === true;
        const organic = commercial && job.options.brandOrganic === true;
        const branded = commercial && job.options.brandContent === true;
        if (commercial && !organic && !branded) throw new PublishError("You need to indicate if your content promotes yourself, a third party, or both. Approve it again with Your brand or Branded content on.");
        if (branded && privacy === "SELF_ONLY") throw new PublishError("Branded content visibility cannot be set to private.");
        init = await api(account, "/post/publish/video/init/", {
          post_info: {
            title: job.caption.slice(0, 2200),
            privacy_level: privacy,
            disable_comment: creator.comment_disabled || job.options.allowComments !== true,
            disable_duet: creator.duet_disabled || job.options.allowDuet !== true,
            disable_stitch: creator.stitch_disabled || job.options.allowStitch !== true,
            brand_content_toggle: branded,
            brand_organic_toggle: organic,
            is_aigc: job.options.ai === true,
          },
          source_info,
        });
      }
      publishId = init.publish_id;
      save({ publishId, uploaded: "" });
      log(`Uploading ${(size / 1e6).toFixed(0)} MB to TikTok in ${count} part${count > 1 ? "s" : ""}.`);
      for (let i = 0; i < count; i++) {
        const first = i * chunk;
        const last = i === count - 1 ? size - 1 : first + chunk - 1;
        const bytes = await readChunk(file, first, last - first + 1);
        await call(init.upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Range": `bytes ${first}-${last}/${size}` }, body: bytes, okStatus: [201, 206] }).catch((error) => {
          // The upload address lasts an hour, so a failed part starts again from a new init next time.
          throw new PublishError(`The upload to TikTok stopped at part ${i + 1} of ${count}: ${(error as Error).message}`, { retry: true });
        });
      }
      save({ uploaded: "1" });
    } else log("Checking on the upload sent earlier.");

    // Status: at most 30 requests a minute per token, so every 10 s. Processing has no guaranteed time.
    const status = await waitFor(
      async () => {
        const data = await api<{ status: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] }>(account, "/post/publish/status/fetch/", { publish_id: publishId });
        if (data.status === "FAILED") throw new PublishError(`TikTok couldn't process it: ${data.fail_reason ?? "no reason given"}.`);
        if (mode === "inbox" && (data.status === "SEND_TO_USER_INBOX" || data.status === "PUBLISH_COMPLETE")) return data;
        if (mode === "direct" && data.status === "PUBLISH_COMPLETE") return data;
        return undefined;
      },
      // Still processing after 10 minutes: waitFor's error is a retry, and since `uploaded` is saved, a retry only
      // checks again.
      { every: 10_000, timeout: 10 * 60_000, what: "TikTok" },
    );
    const postId = status.publicaly_available_post_id?.[0];
    const url = postId && account.handle ? `https://www.tiktok.com/@${account.handle}/video/${postId}` : undefined;
    return { state: finalState, url, remoteId: postId ? String(postId) : publishId };
  },
};
