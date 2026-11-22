/**
 * Tumblr (spec.md §10.12), through your own Tumblr app. OAuth 2 with `offline_access`: an access token lasts about 42
 * minutes and the refresh gives a new refresh token too. One login can post to every blog you own, so each blog is an
 * account, and they share the login: a refresh saves the new tokens on all of them, or the others would hold a used-up
 * refresh token.
 *
 * A post is one multipart request in the Neue Post Format: a `json` part with a video block naming the file part by
 * its identifier, and the caption as text blocks. `state: "queue"` with `publish_on` lets Tumblr hold a scheduled post.
 * github.com/tumblr/docs/blob/master/api.md#posts---createreblog-a-post-neue-post-format
 */
import { call, fileBlob, query } from "../http.ts";
import { listAccounts, saveAccount } from "../store.ts";
import { PublishError, type Account, type Provider, type PublishContext } from "../types.ts";

const API = "https://api.tumblr.com/v2";
const SCOPES = "basic write offline_access";

const tokens = (data: any, before?: Account) => ({
  tokens: { access: data.access_token as string, refresh: (data.refresh_token as string | undefined) ?? before?.tokens.refresh ?? "" },
  expiresAt: Date.now() + Number(data.expires_in ?? 2520) * 1000,
});

async function publish({ job, account, file, video, log, save }: PublishContext) {
  const blog = account.meta?.blog ?? account.remoteId;
  if (job.handle.post) return { state: job.native ? ("scheduled" as const) : ("published" as const), url: `https://www.tumblr.com/${blog}/${job.handle.post}`, remoteId: job.handle.post };

  // Hashtags in the caption become Tumblr tags too, since Tumblr's tags are separate from the text.
  const tags = [...new Set([...job.caption.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)].map((match) => match[1]))];
  const content: object[] = [{ type: "video", media: { type: "video/mp4", identifier: "video0", ...(video.width ? { width: video.width, height: video.height } : {}) } }];
  // A text block is one paragraph.
  for (const paragraph of job.caption.split(/\n+/).map((line) => line.trim()).filter(Boolean)) content.push({ type: "text", text: paragraph });
  const body: Record<string, unknown> = { content, ...(tags.length ? { tags: tags.join(",") } : {}) };
  if (job.native && job.at) Object.assign(body, { state: "queue", publish_on: new Date(job.at).toISOString() });

  const form = new FormData();
  form.set("json", new Blob([JSON.stringify(body)], { type: "application/json" }));
  form.set("video0", await fileBlob(file), job.file);
  log("Uploading the video to Tumblr.");
  let data: any;
  try {
    ({ data } = await call(`${API}/blog/${encodeURIComponent(blog)}/posts`, { method: "POST", headers: { Authorization: `Bearer ${account.tokens.access}` }, body: form }));
  } catch (error) {
    const message = String((error as Error).message);
    // 8010: an earlier video is still transcoding. 8011 and 8004: today's video allowance (20 videos, 60 minutes) is used.
    if (/8010/.test(message)) throw new PublishError(`${message} An earlier video is still transcoding on Tumblr.`, { retry: true });
    if (/8011|8004/.test(message)) throw new PublishError(`${message} Tumblr takes 20 videos and 60 minutes of video a day; try again tomorrow.`);
    throw error;
  }
  const id = String(data?.response?.id ?? "");
  if (!id) throw new PublishError("Tumblr took the post but gave no id back. Check the blog before posting it again.");
  save({ post: id });
  return { state: job.native ? ("scheduled" as const) : ("published" as const), url: `https://www.tumblr.com/${blog}/${id}`, remoteId: id };
}

export const provider: Provider = {
  id: "tumblr",
  label: "Tumblr",
  auth: "oauth",
  blurb: "Video posts to your Tumblr blogs, through your own Tumblr app. Tumblr can hold a scheduled post itself.",
  console: "https://www.tumblr.com/oauth/apps",
  caveat: "Free. Tumblr takes 20 videos and 60 minutes of video a day per account, and 250 posts.",
  redirectHost: "localhost",
  platforms: ["tumblr"],
  setup: [
    "Open tumblr.com/oauth/apps, signed in to Tumblr, and press Register application.",
    "Fill in the name, website and description (any page of yours for the URLs).",
    "Set Default callback URL and OAuth2 redirect URLs both to exactly {redirect}, and register.",
    "Copy the OAuth Consumer Key and the Secret Key into the fields below and save.",
    "Press Connect and allow the app. Every blog you own becomes an account to post to.",
  ],
  fields: [
    { key: "clientId", label: "OAuth Consumer Key", placeholder: "From your app at tumblr.com/oauth/apps" },
    { key: "clientSecret", label: "Secret Key", secret: true, placeholder: "Shown next to the consumer key" },
  ],

  authorizeUrl: (app, start) =>
    `https://www.tumblr.com/oauth2/authorize?${query({ client_id: app.clientId, response_type: "code", scope: SCOPES, state: start.state, redirect_uri: start.redirectUri })}`,

  async exchange(app, code, start) {
    const { data } = await call(`${API}/oauth2/token`, {
      method: "POST",
      form: { grant_type: "authorization_code", code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: start.redirectUri },
    });
    if (!data?.access_token) throw new Error("Tumblr gave no access token.");
    const { data: info } = await call(`${API}/user/info`, { headers: { Authorization: `Bearer ${data.access_token}` } });
    const user = info?.response?.user;
    const blogs: any[] = (user?.blogs ?? []).filter((blog: any) => blog?.name && blog.admin !== false);
    if (!blogs.length) throw new Error("This Tumblr account has no blog to post to.");
    const login = tokens(data);
    return blogs.map(
      (blog): Account => ({
        id: `tumblr:tumblr:${blog.uuid ?? blog.name}`,
        provider: "tumblr",
        platform: "tumblr",
        name: blog.title ? `${blog.title} (${blog.name})` : blog.name,
        handle: blog.name,
        remoteId: blog.uuid ?? blog.name,
        ...login,
        meta: { blog: blog.uuid ?? blog.name, user: user?.name ?? "" },
        connectedAt: Date.now(),
      }),
    );
  },

  async refresh(app, account) {
    if (!account.tokens.refresh) throw new PublishError("There's no refresh token.", { reconnect: true });
    let data: any;
    try {
      ({ data } = await call(`${API}/oauth2/token`, {
        method: "POST",
        form: { grant_type: "refresh_token", refresh_token: account.tokens.refresh, client_id: app.clientId, client_secret: app.clientSecret },
      }));
    } catch (error) {
      if (error instanceof PublishError && !error.retry) throw new PublishError(error.message, { reconnect: true });
      throw error;
    }
    const login = tokens(data, account);
    // The other blogs on the same login get the new tokens too.
    for (const other of listAccounts()) {
      if (other.provider === "tumblr" && other.id !== account.id && other.tokens.refresh === account.tokens.refresh) saveAccount({ ...other, ...login, needsReconnect: undefined });
    }
    return { ...account, ...login };
  },

  publish,
};
