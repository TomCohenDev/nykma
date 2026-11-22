/**
 * Telegram: a bot you make with @BotFather, made an admin of your channel, sends the video there (Bot API sendVideo).
 * No review. The hosted Bot API takes uploads up to 50 MB.
 *
 * The bot token is in every Bot API URL, so every error is said again here without it.
 */
import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { call, fileBlob } from "../http.ts";
import { PublishError, type Provider } from "../types.ts";

const API = "https://api.telegram.org";
const TOKEN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

/** A Bot API call, with the token taken out of any error it gives. */
async function bot(token: string, method: string, body?: FormData | object) {
  try {
    const { data } = await call(`${API}/bot${token}/${method}`, body ? { method: "POST", body } : {});
    if (data?.ok === false) throw new PublishError(`Telegram said: ${data.description ?? "no"}`);
    return data.result;
  } catch (error) {
    const said = String((error as Error).message).replaceAll(token, "<token>").replace(/\/bot[^/\s]+\//g, "/bot<token>/");
    if (error instanceof PublishError) throw new PublishError(said, { retry: error.retry, reconnect: error.reconnect });
    throw new PublishError(said);
  }
}

/**
 * Telegram takes a thumbnail only as a JPEG of at most 200 kB and 320 px a side, and nykma's covers are 1080 px. So
 * the cover is scaled down with ffmpeg; without ffmpeg, the video goes without one and Telegram picks a frame.
 */
const smallCover = (cover: string, id: string) =>
  new Promise<string | undefined>((done) => {
    const out = join(tmpdir(), `nykma-tg-${id}.jpg`);
    execFile("ffmpeg", ["-y", "-v", "error", "-i", cover, "-vf", "scale=320:320:force_original_aspect_ratio=decrease", "-q:v", "6", out], { timeout: 30_000 }, (error) =>
      done(!error && existsSync(out) && statSync(out).size <= 200_000 ? out : undefined),
    );
  });

export const provider: Provider = {
  id: "telegram",
  label: "Telegram",
  auth: "fields",
  blurb: "A Telegram channel or group, through a bot you make. No review.",
  console: "https://t.me/BotFather",
  setup: [
    "In Telegram, open @BotFather, send /newbot, and follow it: a name, then a username ending in bot. It replies with the bot's token.",
    "Open your channel → Administrators → Add Admin, find your bot by its username, and allow it to post messages.",
    "Paste the token and the channel below: @yourchannel for a public channel, or its numeric id (-100…) for a private one. Press Connect.",
    "For a private channel's id: forward one of its posts to @userinfobot, or open the channel in Telegram Web and read the number in the address.",
  ],
  fields: [
    { key: "token", label: "Bot token", secret: true, placeholder: "123456789:AA…" },
    { key: "chat", label: "Channel or chat", placeholder: "@yourchannel or -100…" },
  ],
  caveat: "Free. Videos up to 50 MB, captions up to 1024 characters. No scheduling: the desk posts at the time.",
  platforms: ["telegram"],

  async connect(fields) {
    const token = fields.token.trim();
    if (!TOKEN.test(token)) throw new PublishError("That doesn't look like a bot token. @BotFather gives one like 123456789:AA…");
    const chatInput = fields.chat.trim();
    const me = await bot(token, "getMe");
    const chat = await bot(token, "getChat", { chat_id: chatInput });
    const member = await bot(token, "getChatMember", { chat_id: chat.id, user_id: me.id });
    if (chat.type === "channel" && (member.status !== "administrator" || member.can_post_messages === false))
      throw new PublishError(`@${me.username} isn't an admin of ${chat.title ?? chatInput} that can post. Add it under the channel's Administrators, then connect again.`);
    if (!["administrator", "creator", "member"].includes(member.status)) throw new PublishError(`@${me.username} isn't in ${chat.title ?? chatInput}. Add it, then connect again.`);
    return [
      {
        id: `telegram:telegram:${chat.id}`,
        provider: "telegram",
        platform: "telegram",
        name: chat.title ?? chat.username ?? String(chat.id),
        handle: chat.username ? `@${chat.username}` : undefined,
        remoteId: String(chat.id),
        tokens: { token },
        meta: { chat: String(chat.id), username: chat.username ?? "", bot: me.username ?? "" },
        connectedAt: Date.now(),
      },
    ];
  },

  options: async () => [{ key: "silent", label: "Send without a notification", type: "toggle", default: false }],

  async publish({ job, account, file, thumbnail, video, log }) {
    const form = new FormData();
    form.append("chat_id", account.meta!.chat);
    form.append("video", await fileBlob(file), basename(file));
    if (job.caption) form.append("caption", job.caption);
    form.append("supports_streaming", "true");
    if (video.width && video.height) {
      form.append("width", String(video.width));
      form.append("height", String(video.height));
    }
    if (video.seconds) form.append("duration", String(Math.round(video.seconds)));
    if (job.options.silent === true) form.append("disable_notification", "true");
    const cover = thumbnail ? await smallCover(thumbnail, job.id) : undefined;
    if (cover) {
      // A thumbnail can't be reused, so it goes up as its own part and is named with attach://.
      form.append("thumb", await fileBlob(cover, "image/jpeg"), "thumb.jpg");
      form.append("thumbnail", "attach://thumb");
    }
    log("Sending the video to Telegram.");
    const message = await bot(account.tokens.token, "sendVideo", form);
    const id = message.message_id;
    const username = account.meta?.username;
    const chat = account.meta!.chat;
    const url = username ? `https://t.me/${username}/${id}` : chat.startsWith("-100") ? `https://t.me/c/${chat.slice(4)}/${id}` : undefined;
    return { state: "published", url, remoteId: String(id) };
  },
};
