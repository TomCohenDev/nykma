/**
 * Each platform's limits, as the publish dialog and the checks before a post use them. From the research of
 * 2026-11-21 (reports/Social media auto publishing.md); a platform can change them, and its own error then says so.
 */
import type { Platform, PlatformInfo } from "./types.ts";

const MB = 1_000_000;
const MIB = 1024 * 1024;

export const PLATFORM_INFO: Record<Platform, PlatformInfo> = {
  youtube: {
    label: "YouTube",
    ratios: ["16x9", "9x16", "1x1"],
    sections: ["YouTube"],
    captionLimit: 5000,
    titleLimit: 100,
    maxSeconds: 12 * 3600,
    nativeSchedule: { minMinutes: 15, maxDays: 365 },
    uploadUrl: "https://studio.youtube.com",
  },
  facebook: {
    label: "Facebook",
    ratios: ["9x16", "1x1", "16x9"],
    sections: ["Facebook", "Instagram", "LinkedIn"],
    captionLimit: 63_206,
    titleLimit: 255,
    nativeSchedule: { minMinutes: 15, maxDays: 29 },
    uploadUrl: "https://business.facebook.com/latest/content_calendar",
  },
  instagram: {
    label: "Instagram",
    ratios: ["9x16", "1x1", "16x9"],
    sections: ["Instagram", "TikTok"],
    captionLimit: 2200,
    maxBytes: 300 * MB,
    maxSeconds: 15 * 60,
    uploadUrl: "https://www.instagram.com",
  },
  tiktok: {
    label: "TikTok",
    ratios: ["9x16", "1x1", "16x9"],
    sections: ["TikTok", "Instagram"],
    captionLimit: 2200,
    maxBytes: 4 * 1000 * MB,
    maxSeconds: 10 * 60,
    uploadUrl: "https://www.tiktok.com/tiktokstudio/upload",
  },
  linkedin: {
    label: "LinkedIn",
    ratios: ["1x1", "16x9", "9x16"],
    sections: ["LinkedIn"],
    captionLimit: 3000,
    maxBytes: 500 * MB,
    maxSeconds: 30 * 60,
    uploadUrl: "https://www.linkedin.com/feed/?shareActive=true",
  },
  x: {
    label: "X",
    ratios: ["1x1", "16x9", "9x16"],
    sections: ["X"],
    // The API takes 20 min and 8 GB, but an account without Premium posts up to 2 min 20 s: X's own error says which.
    captionLimit: 280,
    // X's pay-per-use API: $0.015 a post, $0.20 when the text has a URL (docs.x.com pricing, Nov 2026).
    cost: (caption) => (/https?:\/\/|\b[a-z0-9-]+\.(com|app|io|dev|co|org|net|ai)\b/i.test(caption) ? 0.2 : 0.015),
    uploadUrl: "https://x.com/compose/post",
  },
  threads: {
    label: "Threads",
    ratios: ["9x16", "1x1", "16x9"],
    sections: ["Threads", "Instagram", "X"],
    captionLimit: 500,
    maxBytes: 1000 * MB,
    maxSeconds: 5 * 60,
    uploadUrl: "https://www.threads.com",
  },
  pinterest: {
    label: "Pinterest",
    ratios: ["9x16", "1x1", "16x9"],
    sections: ["Pinterest", "Instagram"],
    captionLimit: 800,
    titleLimit: 100,
    uploadUrl: "https://www.pinterest.com/pin-creation-tool/",
  },
  bluesky: {
    label: "Bluesky",
    ratios: ["1x1", "16x9", "9x16"],
    sections: ["Bluesky", "X", "Threads"],
    captionLimit: 300,
    maxBytes: 300 * MB,
    maxSeconds: 10 * 60,
    uploadUrl: "https://bsky.app",
  },
  mastodon: {
    label: "Mastodon",
    ratios: ["1x1", "16x9", "9x16"],
    sections: ["Mastodon", "Bluesky", "X"],
    captionLimit: 500,
    maxBytes: 99 * MIB,
    nativeSchedule: { minMinutes: 6, maxDays: 365 },
  },
  telegram: {
    label: "Telegram",
    ratios: ["9x16", "1x1", "16x9"],
    sections: ["Telegram", "LinkedIn", "Instagram"],
    captionLimit: 1024,
    maxBytes: 50 * MB,
  },
  discord: {
    label: "Discord",
    ratios: ["16x9", "1x1", "9x16"],
    sections: ["Discord", "LinkedIn", "X"],
    // The cap is the server's (10 MiB with no boost, more with one), so the webhook's own error says when it's over.
    captionLimit: 2000,
  },
  tumblr: {
    label: "Tumblr",
    ratios: ["1x1", "9x16", "16x9"],
    sections: ["Tumblr", "Instagram", "LinkedIn"],
    captionLimit: 4096,
    maxBytes: 500 * MB,
    maxSeconds: 10 * 60,
    nativeSchedule: { minMinutes: 6, maxDays: 365 },
    uploadUrl: "https://www.tumblr.com/new/video",
  },
  reddit: {
    label: "Reddit",
    ratios: ["16x9", "1x1", "9x16"],
    sections: ["Reddit", "LinkedIn"],
    captionLimit: 40_000,
    titleLimit: 300,
    uploadUrl: "https://www.reddit.com/submit",
  },
  snapchat: {
    label: "Snapchat",
    ratios: ["9x16"],
    sections: ["Snapchat", "TikTok"],
    captionLimit: 160,
    maxSeconds: 60,
    uploadUrl: "https://my.snapchat.com",
  },
  google_business: {
    label: "Google Business Profile",
    ratios: ["1x1", "16x9", "9x16"],
    sections: ["Google Business", "LinkedIn"],
    captionLimit: 1500,
    maxSeconds: 30,
    uploadUrl: "https://business.google.com",
  },
};
