/**
 * Upload-Post (docs.upload-post.com): one API key posts to the networks its profile has connected, through
 * Upload-Post's own approved apps. That's the way to the platforms nykma can't reach on an app of your own: TikTok
 * posts that are public from the start, Threads, Pinterest and Google Business. Upload-Post holds those logins; nykma
 * keeps only the API key.
 *
 * One job is one network, so each upload names one platform[]. It runs async with the job's id as its request_id
 * and Idempotency-Key, so a reply lost to a timeout is polled, not uploaded again.
 */
import { basename } from "node:path";
import { call, fileBlob, query, waitFor } from "../http.ts";
import { PublishError, type Account, type Option, type Platform, type Provider } from "../types.ts";

const API = "https://api.upload-post.com/api";

/** Upload-Post's names for networks, to nykma's. Ones nykma has no platform for (wordpress) are left out. */
const NETWORKS: Record<string, Platform> = {
  tiktok: "tiktok", instagram: "instagram", youtube: "youtube", facebook: "facebook", linkedin: "linkedin", x: "x", twitter: "x",
  threads: "threads", pinterest: "pinterest", bluesky: "bluesky", reddit: "reddit", discord: "discord", telegram: "telegram",
  google_business: "google_business", mastodon: "mastodon",
};

const headers = (key: string) => ({ authorization: `Apikey ${key}` });
const yes = (value: unknown) => (value === true ? "true" : "false");
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** A 429 here is the month's upload limit on the plan, which waiting a few minutes doesn't fix. */
async function up<T = any>(url: string, init: Parameters<typeof call>[1]) {
  try {
    return (await call<T>(url, init)).data;
  } catch (error) {
    if (error instanceof PublishError && /monthly limit|Free plan/i.test(error.message)) throw new PublishError(error.message);
    throw error;
  }
}

const OPTIONS: Partial<Record<Platform, Option[]>> = {
  tiktok: [
    {
      key: "post_mode",
      label: "Post",
      type: "select",
      default: "DIRECT_POST",
      choices: [
        { value: "DIRECT_POST", label: "Publish on TikTok now" },
        { value: "MEDIA_UPLOAD", label: "Send to TikTok drafts, to finish in the app (the caption isn't sent)" },
      ],
    },
    {
      key: "privacy_level",
      label: "Who can see it",
      type: "select",
      default: "",
      choices: [
        { value: "", label: "The account's default" },
        { value: "PUBLIC_TO_EVERYONE", label: "Everyone" },
        { value: "MUTUAL_FOLLOW_FRIENDS", label: "Friends" },
        { value: "FOLLOWER_OF_CREATOR", label: "Followers" },
        { value: "SELF_ONLY", label: "Only me" },
      ],
      help: "TikTok decides which of these each account has: a private account has no Everyone.",
    },
    { key: "disable_comment", label: "Turn off comments", type: "toggle", default: false },
    { key: "disable_duet", label: "Turn off duets", type: "toggle", default: false },
    { key: "disable_stitch", label: "Turn off stitches", type: "toggle", default: false },
    { key: "brand_organic_toggle", label: "Promotes your own business", type: "toggle", default: false, help: "TikTok's \"Your brand\" label." },
    { key: "brand_content_toggle", label: "Paid partnership with another brand", type: "toggle", default: false, help: "TikTok's \"Branded content\" label." },
  ],
  instagram: [
    { key: "media_type", label: "Post as", type: "select", default: "REELS", choices: [{ value: "REELS", label: "Reel" }, { value: "STORIES", label: "Story" }] },
    { key: "share_to_feed", label: "Also show the Reel in the feed", type: "toggle", default: true, when: { key: "media_type", is: "REELS" } },
  ],
  youtube: [
    { key: "privacyStatus", label: "Visibility", type: "select", default: "public", choices: [{ value: "public", label: "Public" }, { value: "unlisted", label: "Unlisted" }, { value: "private", label: "Private" }] },
    { key: "hasPaidProductPlacement", label: "Paid product placement", type: "toggle", default: false, help: "On only when someone paid for the product in it to be shown." },
  ],
  facebook: [
    { key: "facebook_page_id", label: "Page id", type: "text", help: "Needed only when the profile has more than one Page connected." },
    { key: "facebook_media_type", label: "Post as", type: "select", default: "", choices: [{ value: "", label: "A Reel if it's vertical, a video if not" }, { value: "REELS", label: "Reel" }, { value: "VIDEO", label: "Page video" }, { value: "STORIES", label: "Story" }] },
  ],
  linkedin: [
    { key: "visibility", label: "Who sees it", type: "select", default: "PUBLIC", choices: [{ value: "PUBLIC", label: "Anyone" }, { value: "CONNECTIONS", label: "Connections only" }] },
    { key: "target_linkedin_page_id", label: "Company Page id", type: "text", help: "Empty posts as you. A Page id posts as that Page." },
  ],
  pinterest: [
    { key: "pinterest_board_id", label: "Board id", type: "text", required: true, help: "From the board's settings, or Upload-Post's board list." },
    { key: "pinterest_link", label: "Link", type: "text", help: "Where the Pin takes people." },
  ],
  reddit: [{ key: "subreddit", label: "Subreddit", type: "text", required: true, help: "Without r/. Upload-Post's Reddit posting was down (503) in November 2026." }],
  google_business: [{ key: "gbp_location_id", label: "Location id", type: "text", help: "Needed only when the account has more than one location. Videos up to 30 s." }],
  mastodon: [{ key: "mastodon_visibility", label: "Who sees it", type: "select", default: "public", choices: [{ value: "public", label: "Public" }, { value: "unlisted", label: "Unlisted" }, { value: "private", label: "Followers only" }] }],
};

/** The upload's fields for one network: the caption where that network reads it, and its own options. */
function fields(form: FormData, account: Account, job: Parameters<Provider["publish"]>[0]["job"], video: { width: number; height: number }) {
  const network = account.meta!.network;
  const o = job.options;
  const caption = job.caption;
  const title = job.title || caption.split("\n")[0].slice(0, 100);
  // `title` is required by YouTube and Reddit and the fallback for every network's own `<network>_title`.
  form.append("title", title);
  if (["youtube", "facebook", "linkedin", "pinterest"].includes(network)) form.append("description", caption);
  if (["tiktok", "instagram", "x", "threads", "bluesky", "discord", "telegram", "mastodon"].includes(network)) form.append(`${network}_title`, caption);
  if (typeof o.ai === "boolean") form.append("is_ai_generated", yes(o.ai));
  if (network === "tiktok") {
    form.append("post_mode", o.post_mode === "MEDIA_UPLOAD" ? "MEDIA_UPLOAD" : "DIRECT_POST");
    if (text(o.privacy_level)) form.append("privacy_level", text(o.privacy_level));
    for (const key of ["disable_comment", "disable_duet", "disable_stitch", "brand_organic_toggle", "brand_content_toggle"]) if (typeof o[key] === "boolean") form.append(key, yes(o[key]));
  }
  if (network === "instagram") {
    form.append("media_type", o.media_type === "STORIES" ? "STORIES" : "REELS");
    if (o.media_type !== "STORIES" && typeof o.share_to_feed === "boolean") form.append("share_to_feed", yes(o.share_to_feed));
  }
  if (network === "youtube") {
    form.append("privacyStatus", ["public", "unlisted", "private"].includes(String(o.privacyStatus)) ? String(o.privacyStatus) : "public");
    form.append("hasPaidProductPlacement", yes(o.hasPaidProductPlacement === true));
  }
  if (network === "facebook") {
    if (text(o.facebook_page_id)) form.append("facebook_page_id", text(o.facebook_page_id));
    const type = text(o.facebook_media_type) || (video.height > video.width ? "REELS" : "VIDEO");
    form.append("facebook_media_type", type);
  }
  if (network === "linkedin") {
    form.append("visibility", o.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC");
    if (text(o.target_linkedin_page_id)) form.append("target_linkedin_page_id", text(o.target_linkedin_page_id));
  }
  if (network === "pinterest") {
    form.append("pinterest_board_id", text(o.pinterest_board_id));
    if (text(o.pinterest_link)) form.append("pinterest_link", text(o.pinterest_link));
  }
  if (network === "reddit") form.append("subreddit", text(o.subreddit).replace(/^\/?r\//, ""));
  if (network === "google_business" && text(o.gbp_location_id)) form.append("gbp_location_id", text(o.gbp_location_id));
  if (network === "mastodon" && text(o.mastodon_visibility)) form.append("mastodon_visibility", text(o.mastodon_visibility));
}

/** The cover, under the field name each network reads it from. TikTok's needs the account's cover_image capability. */
async function cover(form: FormData, account: Account, thumbnail: string) {
  const network = account.meta!.network;
  const type = /\.png$/i.test(thumbnail) ? "image/png" : "image/jpeg";
  const field =
    network === "youtube" || network === "linkedin" ? "thumbnail"
    : network === "facebook" ? "facebook_thumbnail"
    : network === "instagram" && type === "image/jpeg" ? "cover_image"
    : network === "tiktok" && account.meta?.capabilities?.split(",").includes("cover_image") ? "tiktok_cover_image"
    : undefined;
  if (field) form.append(field, await fileBlob(thumbnail, type), basename(thumbnail));
}

/** This network's entry in a result, whether `results` is keyed by network (sync) or a list (status). */
function entryOf(data: any, network: string) {
  const results = data?.results;
  if (Array.isArray(results)) return results.find((item: any) => item?.platform === network);
  return results?.[network];
}

export const provider: Provider = {
  id: "uploadpost",
  label: "Upload-Post",
  auth: "fields",
  blurb: "One API key for the networks nykma can't reach on its own: public TikTok posts, Threads, Pinterest, Google Business, and the rest.",
  console: "https://app.upload-post.com",
  setup: [
    "Sign up at upload-post.com.",
    "In its dashboard, create a profile (Manage Users), then connect the social accounts you want to that profile. Upload-Post's own login pages do this, so you make no developer apps.",
    "Open API Keys and create a key. Copy it.",
    "Paste the key and the profile's name below and press Connect. Each network connected to that profile shows up as its own account here.",
    "Connected more networks there later? Press Connect again to pick them up.",
  ],
  fields: [
    { key: "apiKey", label: "API key", secret: true },
    { key: "profile", label: "Profile", placeholder: "the profile's username in Upload-Post" },
  ],
  caveat: "Paid service: free for 2 profiles and 10 uploads a month (no TikTok), about $16–24 a month for 5 profiles. Upload-Post holds the social logins. It takes URLs out of X posts.",
  platforms: ["tiktok", "instagram", "youtube", "facebook", "linkedin", "x", "threads", "pinterest", "bluesky", "reddit", "google_business", "mastodon", "telegram", "discord"],
  // Upload-Post holds a scheduled post (scheduled_date, up to 365 days), so the PC can be off at its time.
  nativeSchedule: { minMinutes: 10, maxDays: 365 },
  // It strips URLs from X posts and bills its own plan, so X's per-post price isn't what you pay.
  platformCost: false,

  async connect(fields) {
    const key = fields.apiKey.trim();
    const profileName = fields.profile.trim();
    const data = await up(`${API}/uploadposts/users/${encodeURIComponent(profileName)}`, { headers: headers(key) });
    const profile = data?.profile;
    if (!profile) throw new PublishError(`Upload-Post has no profile called ${profileName}.`);
    const accounts: Account[] = [];
    for (const [network, social] of Object.entries<any>(profile.social_accounts ?? {})) {
      const platform = NETWORKS[network];
      // An empty string or null is a network added to the profile but never connected.
      if (!platform || !social || typeof social !== "object") continue;
      accounts.push({
        id: `uploadpost:${platform}:${profile.username}:${network}`,
        provider: "uploadpost",
        platform,
        name: social.display_name || social.handle || social.username || network,
        handle: social.handle ? `@${String(social.handle).replace(/^@/, "")}` : undefined,
        remoteId: `${profile.username}:${network}`,
        tokens: { apiKey: key },
        meta: { profile: profile.username, network, capabilities: Array.isArray(social.capabilities) ? social.capabilities.join(",") : "" },
        connectedAt: Date.now(),
        needsReconnect: social.reauth_required || profile.reauth_required ? `Upload-Post says ${network} needs reconnecting: do it in Upload-Post's dashboard, then press Connect here again.` : undefined,
      });
    }
    if (!accounts.length) throw new PublishError(`The profile ${profileName} has no social accounts connected yet. Connect them in Upload-Post's dashboard first.`);
    return accounts;
  },

  options: async (account) => OPTIONS[account.platform] ?? [],

  async publish({ job, account, file, thumbnail, video, log, save }) {
    const key = account.tokens.apiKey;
    const network = account.meta!.network;
    if (network === "reddit") log("Upload-Post's Reddit posting was down (503 reddit_unavailable) when this was written; its error will say if it still is.");

    // A scheduled post Upload-Post already holds.
    if (job.handle.schedule_job) return { state: "scheduled", remoteId: job.handle.schedule_job };

    let requestId = job.handle.request_id;
    const scheduled = Boolean(job.native && job.at);
    if (!requestId) {
      const form = new FormData();
      form.append("user", account.meta!.profile);
      form.append("platform[]", network);
      fields(form, account, job, video);
      form.append("external_id", job.id);
      if (scheduled) form.append("scheduled_date", new Date(job.at!).toISOString());
      else {
        form.append("async_upload", "true");
        form.append("request_id", job.id);
      }
      if (thumbnail) await cover(form, account, thumbnail);
      form.append("video", await fileBlob(file), basename(file));
      log(`Uploading to Upload-Post for ${network}.`);
      // Saved before the upload: if the reply is lost, the next try polls this id instead of posting twice.
      if (!scheduled) save({ request_id: job.id });
      const data = await up(`${API}/upload`, { method: "POST", headers: { ...headers(key), "idempotency-key": job.id }, body: form });
      if (data?.success === false) throw new PublishError(`Upload-Post said: ${data.message ?? data.error ?? "no"}`);
      if (data?.job_id) {
        save({ schedule_job: String(data.job_id) });
        return { state: "scheduled", remoteId: String(data.job_id) };
      }
      const sync = entryOf(data, network);
      if (sync && !data.request_id) return finish(sync, job.options.post_mode);
      requestId = String(data.request_id ?? job.id);
      save({ request_id: requestId });
    }

    log(`Upload-Post is posting to ${network}.`);
    const entry = await waitFor(
      async () => {
        const { data } = await call(`${API}/uploadposts/status?${query({ request_id: requestId })}`, { headers: headers(key), okStatus: [404] });
        const mine = entryOf(data, network);
        if (mine && ["completed", "failed", "skipped"].includes(mine.status ?? "")) return mine;
        if (mine && mine.status === undefined && (mine.success === false || mine.url || mine.post_url)) return mine;
        if (data?.status === "failed") throw new PublishError(`Upload-Post: ${data.message ?? "the upload failed"}.`);
        if (data?.status === "completed") return mine ?? { success: true };
        return undefined;
      },
      { every: 10_000, timeout: 45 * 60_000, what: "Upload-Post" },
    );
    return finish(entry, job.options.post_mode);
  },
};

/** One network's result, as the desk's. TikTok drafts, and a direct post TikTok pushed to the inbox, are "inbox". */
function finish(entry: any, postMode: unknown): Awaited<ReturnType<Provider["publish"]>> {
  if (entry?.skipped) throw new PublishError("Upload-Post says that network isn't connected to the profile any more. Connect it there, then press Connect here again.");
  if (entry?.success === false || entry?.status === "failed") throw new PublishError(`Upload-Post: ${entry.error ?? entry.message ?? "it failed"}${entry.error_code ? ` (${entry.error_code})` : ""}.`);
  const url = [entry?.post_url, entry?.url].find((value) => typeof value === "string" && /^https?:\/\//.test(value));
  const remoteId = String(entry?.platform_post_id ?? entry?.post_id ?? entry?.video_id ?? entry?.publish_id ?? "") || undefined;
  if (postMode === "MEDIA_UPLOAD" || entry?.fallback_to_inbox) return { state: "inbox", remoteId };
  return { state: "published", url, remoteId };
}
