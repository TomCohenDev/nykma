/**
 * Mastodon, and the servers that speak its API, with an access token you make on your own instance: no OAuth app and
 * no review. Each instance sets its own limits, so connecting reads them (/api/v2/instance) and the post is checked
 * against those. Mastodon schedules posts itself (scheduled_at, at least 5 minutes ahead), so a scheduled post is
 * uploaded at once and the PC can be off at post time.
 */
import { basename } from "node:path";
import { call, fileBlob, waitFor } from "../http.ts";
import { PublishError, type Provider } from "../types.ts";

const cleanInstance = (value: string) => {
  const raw = value.trim().replace(/\/+$/, "");
  const url = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(url).origin;
  } catch {
    throw new PublishError("That instance doesn't look like a web address, e.g. https://mastodon.social.");
  }
};

export const provider: Provider = {
  id: "mastodon",
  label: "Mastodon",
  auth: "fields",
  blurb: "Mastodon and compatible servers, with an access token from your instance. Schedules posts itself.",
  console: "https://mastodon.social/settings/applications",
  setup: [
    "On your Mastodon instance, open Preferences → Development and press New application.",
    "Name it nykma. Leave the redirect URI as it is. Under Scopes, tick only write:media, write:statuses and read:accounts (untick read and write).",
    "Submit, open the application, and copy \"Your access token\".",
    "Paste your instance's address (e.g. https://mastodon.social) and the token below, and press Connect.",
  ],
  fields: [
    { key: "instance", label: "Instance", placeholder: "https://mastodon.social" },
    { key: "token", label: "Access token", secret: true },
  ],
  caveat: "Free. Video size and post length are the instance's (mastodon.social: 99 MB, 500 characters).",
  platforms: ["mastodon"],

  async connect(fields) {
    const instance = cleanInstance(fields.instance);
    const auth = { authorization: `Bearer ${fields.token}` };
    const { data: me } = await call(`${instance}/api/v1/accounts/verify_credentials`, { headers: auth });
    // The limits are public. An old server without v2 keeps the defaults.
    const { data: info } = await call(`${instance}/api/v2/instance`).catch(() => ({ data: {} as any }));
    const config = info?.configuration ?? {};
    const host = new URL(instance).host;
    return [
      {
        id: `mastodon:mastodon:${me.id}@${host}`,
        provider: "mastodon",
        platform: "mastodon",
        name: me.display_name || me.username,
        handle: `@${me.acct ?? me.username}@${host}`,
        remoteId: `${me.id}@${host}`,
        tokens: { token: fields.token },
        meta: {
          instance,
          videoLimit: String(config.media_attachments?.video_size_limit ?? ""),
          maxCharacters: String(config.statuses?.max_characters ?? ""),
        },
        connectedAt: Date.now(),
      },
    ];
  },

  options: async () => [
    {
      key: "visibility",
      label: "Who sees it",
      type: "select",
      default: "public",
      choices: [
        { value: "public", label: "Public" },
        { value: "unlisted", label: "Unlisted (quiet public)" },
        { value: "private", label: "Followers only" },
      ],
    },
  ],

  async publish({ job, account, file, video, log, save }) {
    const instance = account.meta!.instance;
    const auth = { authorization: `Bearer ${account.tokens.token}` };
    const videoLimit = Number(account.meta?.videoLimit);
    const maxCharacters = Number(account.meta?.maxCharacters);
    if (videoLimit && video.bytes > videoLimit) throw new PublishError(`${basename(file)} is ${(video.bytes / 1e6).toFixed(0)} MB, and ${new URL(instance).host} takes ${(videoLimit / 1e6).toFixed(0)} MB.`);
    if (maxCharacters && job.caption.length > maxCharacters) throw new PublishError(`The caption is ${job.caption.length} characters, and ${new URL(instance).host} takes ${maxCharacters}.`);

    let mediaId = job.handle.media_id;
    if (!mediaId) {
      log(`Uploading to ${new URL(instance).host}.`);
      const form = new FormData();
      form.append("file", await fileBlob(file), basename(file));
      const { data } = await call(`${instance}/api/v2/media`, { method: "POST", headers: auth, body: form });
      mediaId = String(data.id);
      save({ media_id: mediaId });
    }
    // 202 means the server is still transcoding: the attachment has no url until it's done.
    await waitFor(
      async () => {
        const { data, res } = await call(`${instance}/api/v1/media/${mediaId}`, { headers: auth, okStatus: [206] });
        return res.status === 200 && data.url ? true : undefined;
      },
      { every: 4000, timeout: 20 * 60_000, what: "The Mastodon server" },
    );

    const visibility = ["public", "unlisted", "private"].includes(String(job.options.visibility)) ? String(job.options.visibility) : "public";
    const scheduled = Boolean(job.native && job.at);
    const { data } = await call(`${instance}/api/v1/statuses`, {
      method: "POST",
      // The same key for every try of this job, so a retry after a lost reply doesn't post twice.
      headers: { ...auth, "idempotency-key": job.id },
      body: { status: job.caption, media_ids: [mediaId], visibility, ...(scheduled ? { scheduled_at: new Date(job.at!).toISOString() } : {}) },
    });
    if (scheduled) return { state: "scheduled", remoteId: String(data.id) };
    return { state: "published", url: data.url ?? data.uri, remoteId: String(data.id) };
  },
};
