/**
 * Discord: a channel's webhook posts the video as a message. No bot, no login, no review. The webhook URL is the
 * login (its token is in the path), so it lives in the key store and is taken out of every error.
 */
import { basename } from "node:path";
import { call, fileBlob } from "../http.ts";
import { PublishError, type Provider } from "../types.ts";

const WEBHOOK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d+)\/([\w-]+)\/?$/;

async function hook(url: string, init?: Parameters<typeof call>[1]) {
  try {
    return (await call(url, init)).data;
  } catch (error) {
    const said = String((error as Error).message).replace(/\/webhooks\/\d+\/[\w-]+/g, "/webhooks/<id>/<token>");
    if (error instanceof PublishError) throw new PublishError(said, { retry: error.retry, reconnect: error.reconnect });
    throw new PublishError(said);
  }
}

export const provider: Provider = {
  id: "discord",
  label: "Discord",
  auth: "fields",
  blurb: "A Discord channel, through its webhook. No bot and no review.",
  console: "https://support.discord.com/hc/en-us/articles/228383668",
  setup: [
    "In Discord, open the channel's settings (the gear next to its name) → Integrations → Webhooks → New Webhook.",
    "Name it (the name posts appear under), check the channel, and press Copy Webhook URL.",
    "Paste the URL below and press Connect. Anyone with that URL can post to the channel, so keep it here only.",
  ],
  fields: [{ key: "webhook", label: "Webhook URL", secret: true, placeholder: "https://discord.com/api/webhooks/…" }],
  caveat: "Free. Files up to the server's limit (10 MB without a boost), messages up to 2000 characters.",
  platforms: ["discord"],

  async connect(fields) {
    const webhook = fields.webhook.trim().replace(/\?.*$/, "");
    const match = webhook.match(WEBHOOK);
    if (!match) throw new PublishError("That isn't a Discord webhook URL. It looks like https://discord.com/api/webhooks/<numbers>/<token>.");
    const data = await hook(webhook);
    return [
      {
        id: `discord:discord:${data.id ?? match[1]}`,
        provider: "discord",
        platform: "discord",
        name: data.name ?? "Discord webhook",
        remoteId: String(data.id ?? match[1]),
        tokens: { webhook },
        meta: { guild: String(data.guild_id ?? ""), channel: String(data.channel_id ?? "") },
        connectedAt: Date.now(),
      },
    ];
  },

  async publish({ job, account, file, log }) {
    const name = basename(file);
    const form = new FormData();
    form.append("payload_json", JSON.stringify({ content: job.caption, attachments: [{ id: 0, filename: name }] }));
    form.append("files[0]", await fileBlob(file), name);
    log("Posting to Discord.");
    // wait=true returns the message, for its link.
    const message = await hook(`${account.tokens.webhook}?wait=true`, { method: "POST", body: form });
    const guild = account.meta?.guild;
    const channel = message.channel_id ?? account.meta?.channel;
    return { state: "published", url: guild && channel && message.id ? `https://discord.com/channels/${guild}/${channel}/${message.id}` : undefined, remoteId: String(message.id ?? "") };
  },
};
