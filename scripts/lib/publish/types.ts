/**
 * Publishing (spec.md §10.12): the shapes every provider shares. A provider is what you connect (a Meta app, a Google
 * project, a Bluesky app password); a platform is where a post lands (Facebook, Instagram, YouTube). One provider can
 * connect accounts on several platforms: a Meta app gives Facebook Pages and Instagram accounts, and Upload-Post gives
 * whichever networks its profile has connected.
 *
 * Only the desk imports this. Tokens and app secrets live in the key store (store.ts), and the page sees an account's
 * name and state, never a token.
 */
import type { Ratio } from "../settings.ts";

export const PLATFORMS = [
  "youtube", "facebook", "instagram", "tiktok", "linkedin", "x", "threads", "pinterest",
  "bluesky", "mastodon", "telegram", "discord", "tumblr", "reddit", "snapchat", "google_business",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PROVIDERS = ["youtube", "meta", "tiktok", "linkedin", "x", "tumblr", "bluesky", "mastodon", "telegram", "discord", "uploadpost"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

/** A field you fill in on the Publishing page: an app's client id, a bot token, an instance URL. */
export type Field = {
  key: string;
  label: string;
  /** Saved like a key: never shown again, only its last four characters. */
  secret?: boolean;
  placeholder?: string;
  help?: string;
  optional?: boolean;
};

/** A per-post choice on the publish dialog: a privacy level, a title, a toggle TikTok requires. */
export type Option = {
  key: string;
  label: string;
  type: "select" | "toggle" | "text";
  choices?: { value: string; label: string }[];
  /** No default on a required select means you must pick one (TikTok's privacy level). */
  default?: string | boolean;
  required?: boolean;
  help?: string;
  /** Shown only when another option has this value, e.g. the brand toggles under "Commercial content". */
  when?: { key: string; is: string | boolean };
};

/** What the publish dialog needs to know about a platform. */
export type PlatformInfo = {
  label: string;
  /** Best first: a 9:16 for TikTok and Reels, a square or wide one for LinkedIn and X. */
  ratios: Ratio[];
  /** post.md sections to take the caption from, best first. */
  sections: string[];
  /** Characters in the caption (JavaScript string length, near enough for every platform's own count). */
  captionLimit: number;
  /** A separate title, as YouTube and Pinterest have, with its limit. */
  titleLimit?: number;
  maxBytes?: number;
  maxSeconds?: number;
  /** The platform holds a scheduled post itself, so the desk uploads at once and the PC can be off at post time. */
  nativeSchedule?: { minMinutes: number; maxDays: number };
  /** Money per post, for X. The publish dialog shows it, and publishing it is approving it. */
  cost?: (caption: string) => number;
  /** Where to upload by hand, for the hand-off. */
  uploadUrl?: string;
};

/** A connected account, as stored. `tokens` never leaves the desk. */
export type Account = {
  /** `<provider>:<platform>:<remote id>`, also its file name in the key store. */
  id: string;
  provider: ProviderId;
  platform: Platform;
  /** The page, channel or profile name to show. */
  name: string;
  handle?: string;
  remoteId: string;
  tokens: Record<string, string>;
  /** When the access token runs out (ms). The desk refreshes before it does, where the provider can. */
  expiresAt?: number;
  /** When you must connect again, for a provider with no refresh (LinkedIn's 60 days) or a refresh token that ends. */
  reconnectBy?: number;
  /** Anything else the provider needs later: a Page id, an instance URL, a Bluesky PDS. Not secret. */
  meta?: Record<string, string>;
  connectedAt: number;
  /** Set when a refresh or a publish was refused for the login: the page shows Connect again. */
  needsReconnect?: string;
};

/** What the page sees of an account. */
export type AccountView = Omit<Account, "tokens"> & { label: string };

export type JobState =
  | "approved" // waiting for its time
  | "running" // uploading or processing now
  | "scheduled" // the platform holds it and publishes at `at`
  | "published"
  | "inbox" // in the TikTok app's inbox: you finish it there
  | "overdue" // its time passed while the desk was off: you say post now or cancel
  | "changed" // the file changed after you approved it, so it won't post
  | "failed"
  | "cancelled";

export type Job = {
  id: string;
  folder: string;
  slug: string;
  accountId: string;
  provider: ProviderId;
  platform: Platform;
  /** The MP4 in the queue folder, and its cover. */
  file: string;
  thumbnail?: string;
  caption: string;
  title?: string;
  options: Record<string, string | boolean>;
  /** When to post (ms). Missing is now. */
  at?: number;
  /**
   * The platform holds it: the desk uploads at once with `at` as the platform's own schedule (YouTube's publishAt,
   * Facebook's scheduled_publish_time, Mastodon's scheduled_at, Tumblr's queue). Otherwise the desk posts at `at`.
   */
  native?: boolean;
  /** What you approved: the file's and the cover's SHA-256. A different file isn't posted. */
  fileHash: string;
  thumbnailHash?: string;
  approvedAt: number;
  state: JobState;
  attempts: number;
  nextTry?: number;
  /** What the platform gave back mid-way (a container id, an upload id), so a restart polls instead of posting twice. */
  handle: Record<string, string>;
  url?: string;
  remoteId?: string;
  error?: string;
  log: { at: number; text: string }[];
  updated: number;
};

/** A failure with what to do about it. `retry` comes back later; `reconnect` marks the account. */
export class PublishError extends Error {
  retry: boolean;
  reconnect: boolean;
  constructor(message: string, { retry = false, reconnect = false }: { retry?: boolean; reconnect?: boolean } = {}) {
    super(message);
    this.retry = retry;
    this.reconnect = reconnect;
  }
}

/** What a provider's publish gets. */
export type PublishContext = {
  job: Job;
  account: Account;
  app: Record<string, string>;
  /** Absolute paths. */
  file: string;
  thumbnail?: string;
  /** Video facts from ffprobe. */
  video: { bytes: number; seconds: number; width: number; height: number };
  log: (text: string) => void;
  /** Keeps a platform handle on the job at once, before the next step can fail. */
  save: (handle: Record<string, string>) => void;
  /** Saves new tokens (a rotated refresh token) on the account. */
  saveAccount: (account: Account) => void;
};

export type PublishResult = { state: "published" | "scheduled" | "inbox"; url?: string; remoteId?: string };

/** What a login connected, with a note when it gave less than expected (Meta's Pages but no Instagram account). */
export type Connected = Account[] & { note?: string };

/** One login in progress. `challenge` is the S256 PKCE challenge in base64url, `challengeHex` the same digest in hex. */
export type OAuthStart = { provider: ProviderId; redirectUri: string; state: string; verifier: string; challenge: string; challengeHex: string; started: number };

/** One provider: how it connects, and how it posts to each platform it gives. */
export type Provider = {
  id: ProviderId;
  label: string;
  /** "oauth": you save an app's credentials, then Connect opens the platform's login. "fields": the fields are the login. */
  auth: "oauth" | "fields";
  /** What it covers, in a line. */
  blurb: string;
  /** Where you register the app or make the token. */
  console?: string;
  /** Numbered setup steps, plain text. `{redirect}` is replaced with the redirect URI to register. */
  setup: string[];
  /** The app's credentials (oauth) or the account's own login (fields). */
  fields: Field[];
  /** The host the redirect URI uses. Google, TikTok and X want 127.0.0.1; Meta and LinkedIn localhost. */
  redirectHost?: "localhost" | "127.0.0.1";
  /** What it costs and what's limited, in a line, for the page. */
  caveat?: string;
  platforms: Platform[];

  /** oauth: the login URL to open. */
  authorizeUrl?: (app: Record<string, string>, start: OAuthStart) => string;
  /** oauth: the code from the redirect, for the accounts it connects (Meta gives Pages and Instagram accounts). */
  exchange?: (app: Record<string, string>, code: string, start: OAuthStart) => Promise<Connected>;
  /** fields: checks the login and names the accounts it gives. */
  connect?: (fields: Record<string, string>) => Promise<Account[]>;
  /** New tokens before they run out. Throws PublishError({ reconnect: true }) when the login is gone. */
  refresh?: (app: Record<string, string>, account: Account) => Promise<Account>;
  /** The per-post choices for this account. May ask the platform (TikTok's creator_info). */
  options?: (account: Account, app: Record<string, string>) => Promise<Option[]>;
  /** A rule only this provider knows (TikTok's brand toggles), checked at approval so it fails then and not at its time. */
  validate?: (post: { caption: string; title?: string; options: Record<string, string | boolean> }, account: Account) => string | undefined;
  /** Overrides the platform's own: Upload-Post holds a scheduled post for every network it posts to. */
  nativeSchedule?: { minMinutes: number; maxDays: number };
  /** False where the platform's per-post price isn't what you pay (Upload-Post strips X links and bills its own). */
  platformCost?: boolean;
  publish: (context: PublishContext) => Promise<PublishResult>;
};
