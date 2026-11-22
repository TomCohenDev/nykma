// What the landing pages say about nykma, in one place, taken from README.md and spec.md. Keep it informative: what
// it does, what it needs and what it won't do, not selling.
import type { Line } from "./components/Terminal.astro";

export const repo = "https://github.com/TomCohenDev/nykma";

export const headline = "nobody knows my app";

export const lede =
  "nykma is the AI-first video tool for builders who want a launch video, demo or ad for their product, that can be self-hosted. Describe what you want, and a team of agents reads your app, pitches you an idea with a storyboard, then builds the video in code with voiceover, music, stock footage, generated footage or 3D, so every frame can be changed and rendered again.";



export const steps = [
  { name: "brand", text: "The first time, point it at what you have: a repo, a URL, screenshots, a logo. It saves a brand kit and reuses it." },
  { name: "pitch", text: "You get the idea in two lines, a rough storyboard and a free slideshow animatic. It stops there until you say go, give notes or ask for another idea." },
  { name: "build", text: "It builds the ad in code and checks its own stills." },
  { name: "first look", text: "It renders every size you asked for, hands you the MP4s and stops for your notes." },
  { name: "checks", text: "If you ask for them, a reviewer suggests fixes on stills and free validators check the final renders." },
  { name: "hand-off", text: "One folder with the MP4s, a README of what to check, and post copy: a caption per platform with UTM links." },
];

export const facts: [string, string][] = [
  ["runs", "in Claude Code on your machine, or in the browser on the desk (bun run dev)"],
  ["desk", "a dashboard of your projects, an editor (timeline, inspector, effects, transitions, history) and Publishing"],
  ["makes", "MP4s in 1:1, 9:16 and 16:9, each with a silent copy and the sound as an MP3"],
  ["copy", "post.md: a caption per platform, with UTM links"],
  ["languages", "English and Hebrew, right to left included"],
  ["first", "a pitch: the idea in two lines, a storyboard and a free animatic"],
  ["posts", "only what you approve: on the desk, or when you ask an agent to (bun run publish)"],
  ["never", "spends money without your go-ahead"],
  ["needs", "Claude Code, bun, Node 22 and ffmpeg"],
  ["price", "free for personal use; companies need a commercial licence"],
];

export const does = [
  "Finds an idea for the ad and pitches it before building",
  "Keeps a brand kit for each app: colours, fonts, logo, facts",
  "Builds the ad as code, so every frame can be changed and re-rendered",
  "Renders 1:1, 9:16 and 16:9, and writes the post copy",
  "Works in English and Hebrew, right to left included",
  "Remembers your notes for each brand's next ads",
  "Lets you change any ad on the desk: timeline, inspector, effects, transitions, undo",
  "Posts or schedules an ad on your accounts once you approve it, on the desk or by asking an agent",
];

export const doesnt = [
  "Post anything you haven't approved: you pick the accounts, the time and the files",
  "Spend on voices or generated video without your go-ahead",
  "Need you to write code: you ask in plain words, and the code is there if you want it",
  "Send your app's files anywhere but Claude Code and the services you connect",
];

export const session: Line[] = [
  { k: "in", t: "use the ad-agent to make an ad about the free plan for myapp" },
  { k: "dim", t: "reading brands/myapp/brand.md and the ideas used before" },
  { k: "out", t: "explored three directions, picked one" },
  { k: "ok", t: "pitch ready: queue/2026-11-19-myapp-free-plan/pitch.md, animatic.mp4" },
  { k: "dim", t: "waiting for your go" },
  { k: "in", t: "go" },
  { k: "dim", t: "building src/ads/free-plan/, checking its own stills" },
  { k: "ok", t: "first look: free-plan-1x1.mp4, free-plan-9x16.mp4" },
  { k: "in", t: "looks good, finish it" },
  { k: "ok", t: "handed off: queue/2026-11-19-myapp-free-plan/ (MP4s, README.md, post.md)" },
];

export const handoff = [
  ["queue/2026-11-19-myapp-free-plan/", ""],
  ["  pitch.md", "the idea, the storyboard, the claims it makes"],
  ["  animatic.mp4", "the free slideshow of the pitch"],
  ["  free-plan-1x1.mp4", "the ad, one file per size"],
  ["  free-plan-9x16.mp4", ""],
  ["  free-plan-1x1-silent.mp4", "a copy without sound"],
  ["  README.md", "what to check before posting"],
  ["  post.md", "a caption per platform, with UTM links"],
];

export const price =
  "Free for personal and noncommercial use, under PolyForm Noncommercial 1.0.0. Every company needs a commercial licence: ask sales for a price.";
