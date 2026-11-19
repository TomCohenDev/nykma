import { asset, useFrame, type AdProps, type Cue, type Layout, type Ratio } from "../../engine";
import { clamp, lerp } from "../../parts/time";
import {
  ICONS, JOBS, SHOT_H, SHOT_W, applicationsScreen, banner, browser, chatScreen, feed, filters, hero, onboarding, phone, sheet, store, streak, tailoredSheet, touch,
} from "./app";
import words from "./words.json";

/**
 * "פג תוקף". One Android phone stays on screen for the whole ad, and the Gomlin app runs inside it at its own size: swipe,
 * upload, filters, streak, the job chat, the tailored resume and the applications tab. The phone glides, tilts and zooms
 * between shots, the background opens from behind it, and the words move around it. Picture cues come from when Danit says
 * each word (scripts/audio/pag-tokef-voice.mjs writes words.json), over ElevenLabs music with no sound effects.
 */
const SLUG = "pag-tokef";
export const FRAMES = 915;
export const cues: Cue[] = [{ src: `ads/${SLUG}/mix.wav` }];

const FPS = 30;
const PURPLE = "#655EE4", INK = "#171923", BG = "#F4F5F9", DARK = "#141414", WHITE = "#fff", SOFT = "rgba(255,255,255,.85)";

/** When a word of a voice line is said, in seconds. */
const said = (line: keyof typeof words, word: string) => {
  const hit = words[line].words.find(([w]) => String(w).startsWith(word));
  if (!hit) throw new Error(`"${word}" isn't in the line "${line}"`);
  return (hit[1] as number) / FPS;
};
const start = (line: keyof typeof words) => words[line].at / FPS;

const S = { market: 2.1, form: 10.55, resume: 12.65, filter: 15.8, sheet: 17.85, streak: 19.75, chat: 20.95, tailored: 23.65, list: 25.75, end: 27.4, stop: FRAMES / FPS };

const p = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const out3 = (x: number) => 1 - (1 - x) ** 3;
const in3 = (x: number) => x ** 3;
const inOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

type Spot = { x: number; y: number; s: number; rz?: number; ry?: number };
type Place = [x: number, y: number, ax: 0 | -50 | -100, scale?: number];
type EndLayout = { banner: [y: number, h: number]; line: [y: number, size: number]; url: [y: number, size: number]; stores: [y: number, scale: number]; note: [y: number, size: number] };
type G = { W: number; H: number; spots: Record<keyof typeof SPOT_TIMES, Spot>; at: Record<Key, Place>; end: EndLayout };

const SPOT_TIMES = { swipe: 0, market: S.market, form: S.form, resume: S.resume, filter: S.filter, zoom: S.sheet, streak: S.streak, chat: S.chat, tailored: S.tailored, list: S.list, end: S.end };

type Key = keyof typeof WORDS;

const num = (text: string, size: number) => `<bdi style="display:block;font-size:${size}px;font-weight:900;color:#fff;letter-spacing:-.02em;line-height:1.1">${text}</bdi>`;
const he = (html: string, size: number, color: string = INK, weight = 900) => `<div dir="rtl" style="font-size:${size}px;font-weight:${weight};color:${color};line-height:1.12">${html}</div>`;

// [start, end, text, its size at full scale]. Spoken words appear as they're said.
const WORDS = {
  swipe1: [0.2, S.market, (s: number) => he("מחליקים ימינה.", s), 118],
  swipe2: [said("swipe", "והוגש"), S.market, (s: number) => he("הוגש.", s, PURPLE), 118],
  rateLabel: [2.4, S.form, (s: number) => he("אבטלה בישראל", s, SOFT, 700), 56],
  brandNum: [said("market", "יותר"), S.form, (s: number) => num("203.8", s), 150],
  broad1: [said("market", "אלף") - 0.2, S.form, (s: number) => he("אלף ישראלים", s, WHITE, 800), 62],
  broad2: [said("market", "במדד"), S.form, (s: number) => he("במדד האבטלה הרחב, <bdi>4.4%</bdi>", s, SOFT, 600), 38],
  openNum: [said("market", "ומאה"), S.form, (s: number) => num("148", s), 150],
  open1: [said("market", "משרות") - 0.3, S.form, (s: number) => he("אלף משרות פנויות", s, WHITE, 800), 62],
  have1: [said("market", "פנויות"), S.form, (s: number) => he("יש משרות.", s, WHITE), 96],
  form1: [said("form", "עוד"), S.resume, (s: number) => he("עוד טופס", s), 128],
  form2: [said("form", "מההתחלה"), S.resume, (s: number) => he("מההתחלה?", s), 128],
  form3: [said("form", "לא"), S.resume, (s: number) => he("לא צריך.", s, PURPLE), 128],
  resume1: [said("resume", "קורות"), S.filter, (s: number) => he("קורות חיים", s), 124],
  resume2: [said("resume", "פעם"), S.filter, (s: number) => he("פעם אחת.", s, PURPLE), 124],
  resume3: [said("resume", "והתחומים"), S.filter, (s: number) => he("התחומים שלך מזוהים.", s, INK, 800), 72],
  feed1: [said("feed", "פיד"), S.streak, (s: number) => he("פיד שמתאים לך.", s, WHITE), 92],
  feed2: [said("feed", "הרבה"), S.streak, (s: number) => he("הרבה משרות הייטק,", s, WHITE, 800), 72],
  feed3: [said("feed", "וגם"), S.streak, (s: number) => he("וגם משרות לסטודנטים.", s, WHITE, 800), 72],
  streak1: [S.streak + 0.1, S.chat, (s: number) => he("כל הגשה", s, WHITE), 96],
  streak2: [S.streak + 0.25, S.chat, (s: number) => he("מאריכה את הרצף.", s, WHITE), 96],
  chat1: [said("chat", "לפני"), S.tailored, (s: number) => he("לפני", s), 104],
  chat2: [said("chat", "שמגישים"), S.tailored, (s: number) => he("שמגישים,", s), 104],
  chat3: [said("chat", "שואלים"), S.tailored, (s: number) => he("שואלים", s, PURPLE), 104],
  chat4: [said("chat", "סוכן"), S.tailored, (s: number) => he("את סוכן <bdi>AI</bdi>.", s, PURPLE), 104],
  tailored1: [said("tailored", "קורות"), S.list, (s: number) => he("קורות חיים", s, WHITE), 118],
  tailored2: [said("tailored", "מותאמים"), S.list, (s: number) => he("מותאמים לכל משרה.", s, WHITE, 800), 92],
  list1: [said("list", "וכל"), S.end, (s: number) => he("כל ההגשות", s), 100],
  list2: [said("list", "במקום"), S.end, (s: number) => he("במקום אחד.", s, PURPLE), 100],
} as const;

const L: Layout<G> = {
  "16x9": {
    W: 1920, H: 1080,
    spots: {
      swipe: { x: 1360, y: 545, s: 1.2 }, market: { x: 960, y: 560, s: 1.13 }, form: { x: 540, y: 560, s: 1.18, rz: -5, ry: 16 }, resume: { x: 1420, y: 550, s: 1.17, rz: 4, ry: -16 },
      filter: { x: 500, y: 555, s: 1.18 }, zoom: { x: 500, y: 250, s: 1.62 }, streak: { x: 500, y: 555, s: 1.18 }, chat: { x: 960, y: 550, s: 1.2 }, tailored: { x: 1420, y: 555, s: 1.18, rz: 5, ry: -18 }, list: { x: 960, y: 550, s: 1.15 }, end: { x: 960, y: 1900, s: 1, rz: 10 },
    },
    at: {
      swipe1: [110, 440, 0], swipe2: [110, 580, 0], rateLabel: [1740, 215, -100], brandNum: [150, 285, 0], broad1: [150, 410, 0], broad2: [150, 485, 0], openNum: [150, 660, 0], open1: [150, 785, 0], have1: [1740, 790, -100],
      form1: [1800, 420, -100], form2: [1800, 570, -100], form3: [1800, 720, -100], resume1: [130, 270, 0], resume2: [130, 420, 0], resume3: [130, 790, 0], feed1: [1810, 330, -100], feed2: [1810, 520, -100], feed3: [1810, 640, -100],
      streak1: [1810, 470, -100], streak2: [1810, 600, -100], chat1: [1840, 400, -100], chat2: [1840, 530, -100], chat3: [90, 540, 0], chat4: [90, 670, 0], tailored1: [120, 430, 0], tailored2: [120, 575, 0], list1: [80, 190, 0], list2: [1850, 900, -100],
    },
    end: { banner: [300, 330], line: [600, 104], url: [705, 44], stores: [850, 1], note: [985, 34] },
  },
  "1x1": {
    W: 1080, H: 1080,
    spots: {
      swipe: { x: 760, y: 720, s: 0.98 }, market: { x: 540, y: 790, s: 0.8 }, form: { x: 330, y: 760, s: 0.98, rz: -5, ry: 14 }, resume: { x: 760, y: 760, s: 0.98, rz: 4, ry: -14 },
      filter: { x: 300, y: 760, s: 0.98 }, zoom: { x: 300, y: 330, s: 1.36 }, streak: { x: 300, y: 760, s: 0.98 }, chat: { x: 540, y: 760, s: 0.92 }, tailored: { x: 760, y: 760, s: 0.98, rz: 5, ry: -14 }, list: { x: 540, y: 790, s: 0.92 }, end: { x: 540, y: 1700, s: 0.9, rz: 10 },
    },
    at: {
      swipe1: [60, 120, 0, 0.85], swipe2: [60, 235, 0, 0.85], rateLabel: [1030, 60, -100, 0.7], brandNum: [50, 110, 0, 0.72], broad1: [50, 205, 0, 0.7], broad2: [50, 262, 0, 0.72], openNum: [50, 540, 0, 0.72], open1: [50, 635, 0, 0.5], have1: [1040, 590, -100, 0.5],
      form1: [1040, 340, -100, 0.6], form2: [1040, 440, -100, 0.6], form3: [1040, 550, -100, 0.6], resume1: [50, 330, 0, 0.7], resume2: [50, 440, 0, 0.7], resume3: [50, 760, 0, 0.55], feed1: [1045, 330, -100, 0.6], feed2: [1045, 440, -100, 0.55], feed3: [1045, 515, -100, 0.5],
      streak1: [1040, 450, -100, 0.62], streak2: [1040, 540, -100, 0.56], chat1: [1045, 400, -100, 0.52], chat2: [1045, 470, -100, 0.52], chat3: [40, 560, 0, 0.5], chat4: [40, 625, 0, 0.5], tailored1: [50, 380, 0, 0.72], tailored2: [50, 500, 0, 0.52], list1: [50, 110, 0, 0.9], list2: [1030, 245, -100, 0.9],
    },
    end: { banner: [270, 280], line: [535, 84], url: [630, 38], stores: [760, 0.85], note: [900, 30] },
  },
  "9x16": {
    W: 1080, H: 1920,
    spots: {
      swipe: { x: 620, y: 1240, s: 1.35 }, market: { x: 540, y: 1340, s: 1.05 }, form: { x: 420, y: 1300, s: 1.3, rz: -4, ry: 10 }, resume: { x: 660, y: 1300, s: 1.3, rz: 3, ry: -10 },
      filter: { x: 540, y: 1280, s: 1.3 }, zoom: { x: 540, y: 1280, s: 1.34 }, streak: { x: 540, y: 1280, s: 1.34 }, chat: { x: 540, y: 1290, s: 1.3 }, tailored: { x: 640, y: 1290, s: 1.3, rz: 4, ry: -10 }, list: { x: 540, y: 1300, s: 1.25 }, end: { x: 540, y: 2900, s: 1, rz: 10 },
    },
    at: {
      swipe1: [60, 310, 0, 0.92], swipe2: [60, 450, 0, 0.92], rateLabel: [960, 245, -100, 0.85], brandNum: [60, 250, 0, 0.82], broad1: [60, 355, 0, 0.72], broad2: [60, 425, 0, 0.9], openNum: [60, 560, 0, 0.82], open1: [60, 665, 0, 0.72], have1: [960, 660, -100, 0.82],
      form1: [960, 290, -100, 0.85], form2: [960, 415, -100, 0.85], form3: [960, 550, -100, 0.85], resume1: [60, 300, 0, 0.9], resume2: [60, 425, 0, 0.9], resume3: [60, 560, 0, 0.85], feed1: [960, 280, -100, 0.95], feed2: [960, 420, -100, 0.95], feed3: [960, 530, -100, 0.95],
      streak1: [960, 320, -100, 0.95], streak2: [960, 445, -100, 0.95], chat1: [960, 280, -100, 0.9], chat2: [960, 395, -100, 0.9], chat3: [60, 530, 0, 0.9], chat4: [60, 640, 0, 0.9], tailored1: [60, 330, 0, 0.9], tailored2: [60, 470, 0, 0.85], list1: [60, 320, 0, 1], list2: [960, 490, -100, 1],
    },
    end: { banner: [640, 340], line: [960, 92], url: [1075, 44], stores: [1250, 0.92], note: [1420, 34] },
  },
};

function spotAt(g: G, t: number): Required<Spot> {
  const keys = Object.keys(SPOT_TIMES) as (keyof typeof SPOT_TIMES)[];
  let i = 0;
  while (i + 1 < keys.length && SPOT_TIMES[keys[i + 1]] <= t) i++;
  const from = g.spots[keys[Math.max(0, i - 1)]], to = g.spots[keys[i]];
  const m = inOut(p(t, SPOT_TIMES[keys[i]], SPOT_TIMES[keys[i]] + 0.55));
  return {
    x: lerp(from.x, to.x, m),
    y: lerp(from.y, to.y, m) + Math.sin(t * 1.1) * 6,
    s: lerp(from.s, to.s, m),
    rz: lerp(from.rz ?? 0, to.rz ?? 0, m) + Math.sin(t * 0.8) * 0.5,
    ry: lerp(from.ry ?? 0, to.ry ?? 0, m),
  };
}

/** Cards swiped in order: [when, -1 left or 1 right]. The drag and fling are the app's own, a little quicker. */
function deck(a: number, swipes: [number, 1 | -1][], first = 0, opts: { over?: string } = {}) {
  const done = swipes.filter(([at]) => a >= at + 0.5);
  const now = swipes.find(([at]) => a >= at && a < at + 0.5);
  const index = first + done.length;
  const job = (i: number) => i % JOBS.length;
  let dx = 0;
  if (now) {
    const b = a - now[0];
    dx = now[1] * (b < 0.33 ? 100 * inOut(b / 0.33) : 100 + 620 * in3((b - 0.33) / 0.17));
  }
  const lastRight = [...done].reverse().find(([, dir]) => dir === 1);
  return feed(job(index), job(index + 1), dx, { applied: !!lastRight && a < lastRight[0] + 1.6, finger: now && a - now[0] < 0.33 ? touch(195 + dx, 320, 1, 1) : "", over: opts.over ?? "" });
}

function screen(t: number) {
  if (t < S.market) {
    const dx = t < 0.5 ? 0 : t < 1 ? 100 * inOut(p(t, 0.5, 1)) : 100 + 620 * in3(p(t, 1, 1.18));
    return phone(feed(0, 1, dx, { applied: t > 1.2, finger: t > 0.4 && t < 1.05 ? touch(195 + Math.min(dx, 120), 320, 1, p(t, 0.4, 0.5)) : "" }));
  }
  if (t < S.form) return phone(deck(t - S.market, [[1.2, -1], [3.2, 1], [5.6, -1], [7.4, 1]], 1));
  if (t < S.resume) return phone(browser(t - S.form), { showNav: false });
  if (t < S.filter) return phone(onboarding(t - S.resume), { showNav: false });
  if (t < S.streak) {
    const up = out3(p(t, S.sheet + 0.05, S.sheet + 0.4));
    return phone(deck(t - S.filter, [[0.4, 1], [1.2, -1]], 0), { scrim: up, modal: sheet(up, filters(t >= said("feed", "לסטודנטים"))) });
  }
  if (t < S.chat) {
    const a = t - S.streak, dx = a < 0.32 ? 100 * inOut(a / 0.32) : 100 + 620 * in3(p(a, 0.32, 0.46));
    const y = lerp(-110, 8, out3(p(a, 0.5, 0.8)));
    return phone(feed(a < 0.46 ? 3 : 0, a < 0.46 ? 0 : 1, a < 0.46 ? dx : 0, { applied: a > 0.46, over: streak(y, lerp(0.4, 0.6, out3(p(a, 0.6, 1.15))), 4, a > 0.6 ? 3 : 2) }));
  }
  if (t < S.tailored) return phone(chatScreen((t - S.chat) * 1.1));
  if (t < S.list) {
    const a = (t - S.tailored) * 1.55, up = out3(p(a, 1.05, 1.4));
    return phone(feed(0, 1, 0, { spin: a > 0.4 && a < 1.05 ? a * 700 : false, finger: a < 0.5 ? touch(195, 642, 1, p(a, 0.1, 0.2)) : "" }), { scrim: up, modal: sheet(up, tailoredSheet(a), "96px") });
  }
  return phone(applicationsScreen(t - S.list), { selected: 2 });
}

const BACKS: [number, string][] = [[0, BG], [S.market, PURPLE], [S.form, BG], [S.filter, PURPLE], [S.streak, DARK], [S.chat, BG], [S.tailored, PURPLE], [S.list, BG]];
function background(g: G, t: number) {
  let i = 0;
  while (i + 1 < BACKS.length && BACKS[i + 1][0] <= t) i++;
  const before = BACKS[Math.max(0, i - 1)][1], [at, color] = BACKS[i], m = inOut(p(t, at, at + 0.7)), c = spotAt(g, t);
  return `<div style="position:absolute;inset:0;background:${before}"></div><div style="position:absolute;inset:0;background:${color};clip-path:circle(${m * 150}% at ${c.x}px ${clamp(c.y, 0, g.H)}px)"></div>`;
}

/** Text rises out of a mask, and leaves with a short fade. */
function rise(place: Place, t: number, from: number, until: number, html: string) {
  const [x, y, ax] = place, m = out3(p(t, from, from + 0.4)), o = 1 - p(t, until - 0.2, until);
  return `<div style="position:absolute;left:${x}px;top:${y}px;transform:translate(${ax}%,-50%);overflow:hidden;padding:12px 16px;margin:0 -16px;opacity:${o};z-index:6;white-space:nowrap"><div style="transform:translateY(${lerp(120, 0, m)}%)">${html}</div></div>`;
}

/** The unemployment number rolls through the months and lands as she says it. */
function rate(g: G, r: Ratio, t: number) {
  if (t < 2.45 || t > S.form) return "";
  const land = said("rate", "שלוש");
  const value = t < 3.1 ? 3.3 : t < 3.7 ? lerp(3.3, 2.9, inOut(p(t, 3.1, 3.5))) : lerp(2.9, 3.2, inOut(p(t, land - 0.5, land)));
  const month = t < 3.3 ? "יולי" : t < land - 0.25 ? "אוגוסט" : "ספטמבר";
  const [x, labelY, ax] = g.at.rateLabel;
  const k = { "16x9": 1, "1x1": 0.62, "9x16": 0.8 }[r];
  return rise([x, labelY + 150 * k, ax], t, 2.5, S.form, `<bdi style="display:block;font-size:${210 * k}px;font-weight:900;color:#fff;letter-spacing:-.02em;line-height:1.1">${value.toFixed(1)}%</bdi>`) +
    rise([x, labelY + 315 * k, ax], t, 2.6, S.form, he(`${month} <bdi>2026</bdi>`, 62 * Math.max(k, 0.7), WHITE, 700));
}

function ending(g: G, t: number) {
  const a = t - S.end;
  if (a < 0) return "";
  const m = inOut(p(a, 0, 0.6)), e = g.end, x = g.W / 2, logo = said("end", "גומלין") - S.end, line = said("end", "מחליקים") - S.end;
  const center = (y: number, o: number, html: string, s = 1) => `<div style="position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%) scale(${s});opacity:${o};white-space:nowrap;z-index:3">${html}</div>`;
  return `<div style="position:absolute;inset:0;z-index:20;background:#000;clip-path:circle(${m * 130}% at ${x}px ${g.H}px)">
    <img src="${hero}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(${lerp(1.12, 1.03, out3(p(a, 0, 3.1)))})"><div style="position:absolute;inset:0;background:rgba(0,0,0,.68)"></div>
    ${center(e.banner[0], p(a, logo - 0.05, logo + 0.3), `<img src="${banner}" alt="Gomlin logo" aria-label="logo" style="height:${e.banner[1]}px">`, lerp(0.88, 1, out3(p(a, logo - 0.05, logo + 0.5))))}
    ${center(e.line[0], p(a, line, line + 0.3), he("מחליקים, ומגישים.", e.line[1], WHITE))}
    ${center(e.url[0], p(a, line + 0.2, line + 0.5), `<bdi style="font-size:${e.url[1]}px;color:rgba(255,255,255,.88)">gomlinjobs.com</bdi>`)}
    ${center(e.stores[0], p(a, line + 0.3, line + 0.7), `<div dir="ltr" style="display:flex;gap:22px">${store("play", "GET IT ON", "Google Play")}${store("apple", "GET IT ON", "App Store")}</div>`, e.stores[1])}
    ${center(e.note[0], p(a, line + 0.5, line + 0.8), he("במשרות עם החלקה להגשה פעילה", e.note[1], "rgba(255,255,255,.72)", 500))}</div>`;
}

const CSS = `
@font-face{font-family:"Noto Sans Hebrew";src:url("${asset(`ads/${SLUG}/NotoSansHebrew-wdth-wght.ttf`)}");font-weight:100 900}
@font-face{font-family:"Noto Sans";src:url("${asset(`ads/${SLUG}/NotoSans-wdth-wght.ttf`)}");font-weight:100 900}
.gomlin{position:absolute;inset:0;overflow:hidden;background:${BG};color:${INK};font-family:"Noto Sans","Noto Sans Hebrew",Arial,sans-serif;line-height:1.3}
.gomlin *{box-sizing:border-box}
.dock-small{width:46px;height:46px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;border:.5px solid rgba(101,94,228,.5)}
.dock-large{width:58px;height:58px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;border:1px solid rgba(23,25,35,.51);box-shadow:0 4px 15px rgba(0,0,0,.18);transform-origin:bottom center}
`;

export function PagTokef({ ratio }: AdProps) {
  const t = useFrame() / FPS;
  const g = L[ratio];
  const c = spotAt(g, t);
  const text = (Object.keys(WORDS) as Key[]).map((key) => {
    const [from, until, make, size] = WORDS[key];
    if (t < from - 0.05 || t > until) return "";
    const place = g.at[key];
    return rise(place, t, from, until, make(size * (place[3] ?? 1)));
  }).join("");
  const html = `${background(g, t)}
    <div style="position:absolute;left:${c.x}px;top:${c.y}px;width:${SHOT_W + 22}px;height:${SHOT_H + 22}px;transform:translate(-50%,-50%) perspective(2400px) rotateY(${c.ry}deg) rotateZ(${c.rz}deg) scale(${c.s});z-index:3">${screen(t)}</div>
    ${text}${rate(g, ratio, t)}${ending(g, t)}`;
  return (
    <>
      <style>{CSS}</style>
      <div style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
        {ICONS.map((src: string) => <img key={src} src={src} alt="" />)}
      </div>
      <div className="gomlin" style={{ width: g.W, height: g.H }} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
