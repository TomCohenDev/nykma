// @ts-nocheck: strings of markup, ported from the preview and checked against the Flutter source and real footage.
/**
 * The Gomlin app at its own size, 390 wide, as markup. Sizes and behaviour come from gomlin/lib, and the look was
 * checked against assets/intro-video.mp4. Every function takes the moment it should draw, so it's a function of the frame.
 */
import { asset } from "../../engine";

const SLUG = "lo-maamin";
const PURPLE = "#655EE4", INK = "#171923", BG = "#F4F5F9", RED = "#EF4444";
export const banner = asset(`ads/${SLUG}/gomlin-banner.png`);
export const chatHead = asset(`ads/${SLUG}/ui/chat-head.png`);
export const ICONS = ["apply", "resume", "feed-filled", "feed-outline", "chat-filled", "chat-outline", "list-filled", "list-outline", "person-filled", "person-outline"].map((name) => asset(`ads/${SLUG}/ui/${name}.svg`));

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const p = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, x) => a + (b - a) * x;
const out3 = (x) => 1 - (1 - x) ** 3;
const inOut = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

const mask = (name, size, color, extra = "") => `<span style="display:inline-block;width:${size}px;height:${size}px;flex-shrink:0;background:${color};-webkit-mask:url('${asset(`ads/${SLUG}/ui/${name}.svg`)}') center/contain no-repeat;${extra}"></span>`;

// Material icon paths, as in gomlin-website/src/components/howItWorks/AppIcons.jsx
const PATHS = {
  close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  tune: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
  language: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7 6h-3a15 15 0 0 0-1.4-3.6A8 8 0 0 1 19 8zm-7-4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4zM4.3 14a8 8 0 0 1 0-4h3.4a16 16 0 0 0 0 4H4.3zm.8 2h3a15 15 0 0 0 1.3 3.6A8 8 0 0 1 5 16zm3-8H5a8 8 0 0 1 4.4-3.6A15 15 0 0 0 8 8zm4 12c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4zm2.3-6H9.7a14 14 0 0 1 0-4h4.6a14 14 0 0 1 0 4zm.3 5.600c.6-1.100 1-2.300 1.400-3.600h3a8 8 0 0 1-4.400 3.600zM16.400 14a16 16 0 0 0 0-4h3.400a8 8 0 0 1 0 4h-3.400z",
  work: "M14 6V4h-4v2h4zM4 8v11h16V8H4zm16-2c1.110 0 2 .89 2 2v11c0 1.110-.89 2-2 2H4c-1.110 0-2-.89-2-2l.01-11c0-1.110.88-2 1.990-2h4V4c0-1.110.89-2 2-2h4c1.110 0 2 .89 2 2v2h4z",
  swipeRight: "M15 7l-1.410 1.410L16.170 11h-4.270a4 4 0 1 0 0 2h4.270l-2.580 2.590L15 17l5-5z",
  calendar: "M20 3h-1V1h-2v2H7V1H5v2H4c-1.100 0-2 .9-2 2v16c0 1.100.9 2 2 2h16c1.100 0 2-.9 2-2V5c0-1.100-.9-2-2-2zm0 18H4V10h16v11zm0-13H4V5h16v3z",
  location: "M12 2C8.130 2 5 5.130 5 9c0 5.250 7 13 7 13s7-7.750 7-13c0-3.870-3.130-7-7-7zM7 9c0-2.760 2.240-5 5-5s5 2.240 5 5c0 2.880-2.880 7.190-5 9.880C9.920 16.210 7 11.850 7 9zM12 6.500a2.500 2.500 0 1 0 0 5 2.500 2.500 0 0 0 0-5z",
  description: "M8 16h8v2H8zm0-4h8v2H8zm6-10H6c-1.100 0-2 .9-2 2v16c0 1.100.89 2 1.990 2H18c1.100 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z",
  assignment: "M19 3h-4.180C14.400 1.840 13.300 1 12 1s-2.400.84-2.820 2H5c-1.100 0-2 .9-2 2v14c0 1.100.9 2 2 2h14c1.100 0 2-.9 2-2V5c0-1.100-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 16H5V5h14v14zM7 7h10v2H7zm0 4h10v2H7zm0 4h7v2H7z",
  psychology: "M13 3a7 7 0 0 0-7 6.6L4.1 12.2c-.25.33 0 .8.4.8H6v3a2 2 0 0 0 2 2h1v3h7v-4.68A7 7 0 0 0 13 3zm0 2a5 5 0 0 1 2.1 9.54l-1.1.51V19h-3v-3H8v-5h-.5l.5-.67V10a5 5 0 0 1 5-5zm-1 2v2h-2v2h2v2h2v-2h2V9h-2V7z",
  play: "M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302a1 1 0 010 1.38l-2.302 2.302-2.545-2.545 2.545-2.545zM5.864 2.658L16.8 8.99l-2.302 2.302-8.635-8.635z",
  apple: "M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z",
  search: "M15.500 14h-.79l-.28-.27C15.410 12.590 16 11.110 16 9.500 16 5.910 13.090 3 9.500 3S3 5.910 3 9.500 5.910 16 9.500 16c1.610 0 3.090-.59 4.230-1.570l.27.28v.79l5 4.990L20.490 19l-4.990-5zm-6 0C7.010 14 5 11.990 5 9.500S7.010 5 9.500 5 14 7.010 14 9.500 11.990 14 9.500 14z",
  send: "M2.010 21 23 12 2.010 3 2 10l15 2-15 2z",
};
const icon = (name, size, color) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" style="flex-shrink:0"><path d="${PATHS[name]}" fill-rule="evenodd"/></svg>`;


const dockSmall = (inner, opacity = 1) => `<span class="dock-small" style="opacity:${opacity}">${inner}</span>`;
const dockLarge = (inner, opacity = 1, scale = 1) => `<span style="width:68px;display:flex;justify-content:center"><span class="dock-large" style="opacity:${opacity};transform:scale(${scale})">${inner}</span></span>`;
function dock({ apply = 1, reject = 1, side = 1, applyScale = 1, rejectScale = 1, applied = false } = {}) {
  return `<div dir="ltr" style="position:absolute;bottom:10px;left:0;right:0;z-index:10;display:flex;justify-content:center;align-items:flex-end;gap:20px">
    ${dockSmall(icon("tune", 22, "rgba(23,25,35,.5)"), side)}
    ${dockLarge(icon("close", 34, "#EF4444"), reject, rejectScale)}
    ${dockSmall(mask("resume", 22, "rgba(23,25,35,.5)"), side)}
    <span style="position:relative;display:flex">${applied ? `<span dir="auto" style="position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);white-space:nowrap;padding:6px 10px;border-radius:20px;background:#fff;font-size:18px;box-shadow:0 0 13px 1px rgba(101,94,228,.35)">הוגש!</span>` : ""}
    ${dockLarge(mask("apply", 34, "#22C55E", "transform:scaleX(-1);"), apply, applyScale)}</span>
    ${dockSmall(`<img src="${chatHead}" style="width:29px;height:29px;border-radius:50%">`, side)}
  </div>`;
}

const chips = (items, tint = true) => items.map((t) => `<span style="padding:6px 12px;border-radius:16px;background:rgba(101,94,228,.1);border:1px solid rgba(101,94,228,.3);font-size:14px;font-weight:500">${t}</span>`).join("");
const purpleButton = (text) => `<div style="height:54px;border-radius:27px;background:#655EE4;color:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700">${text}</div>`;
const store = (glyph, top, name) => `<span style="display:inline-flex;width:280px;align-items:center;gap:14px;background:#171923;color:#fff;padding:20px 30px;border-radius:18px">${icon(glyph, 40, "#fff")}<span style="text-align:left"><span style="display:block;font-size:12px;opacity:.7">${top}</span><span style="display:block;font-size:24px;font-weight:600">${name}</span></span></span>`;

// ---- the app, 390 wide, as it renders on Android ----
const BUSINESS = "M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z";
const logo = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="rgba(101,94,228,.7)" style="flex-shrink:0"><path d="${BUSINESS}"/></svg>`;
const badge = (name, color, tint, text) => `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:8px;background:${tint}">${icon(name, 14.4, color)}<span style="font-size:12px;font-weight:600">${text}</span></span>`;
const head = (name, text) => `<div style="display:flex;align-items:center;gap:8px;padding:8px 0">${icon(name, 18, PURPLE)}<span style="font-size:17px;font-weight:600">${text}</span></div>`;

const JOBS = [
  { title: "מפתח/ת Backend", company: "חברת פינטק", place: "תל אביב, IL", posted: "פורסם לפני 2 ימים", about: "לחברת פינטק צומחת דרוש/ה מפתח/ת Backend לצוות הפלטפורמה", items: ["פיתוח שירותים ב-Python וב-Go", "עבודה עם מסדי נתונים SQL", "תכנון ממשקים שמשרתים מיליוני משתמשים", "עבודה מול צוותי מוצר ו-DevOps", "שיפור ביצועים ואמינות המערכת"], need: ["3+ שנות ניסיון בפיתוח צד שרת", "ניסיון בענן, AWS או GCP", "ניסיון עם Docker ו-CI/CD"] },
  { title: "אנליסט/ית נתונים", company: "חברת מסחר מקוון", place: "רמת גן, IL", posted: "פורסם לפני 5 שעות", about: "לצוות הדאטה דרוש/ה אנליסט/ית נתונים לעבודה צמודה עם המוצר", items: ["בניית דשבורדים ודוחות", "ניתוח התנהגות משתמשים", "כתיבת שאילתות SQL", "עבודה מול מנהלי מוצר ושיווק", "הגדרת מדדים וניסויים"], need: ["שנה+ ניסיון כאנליסט/ית", "שליטה ב-SQL וב-Excel", "היכרות עם Tableau או Looker"] },
  { title: "מהנדס/ת Full Stack", company: "סטארט-אפ בתחום הבריאות", place: "הרצליה, IL", posted: "פורסם לפני יום", about: "לצוות מוצר קטן דרוש/ה מהנדס/ת Full Stack עם אחריות מלאה", items: ["פיתוח פיצ'רים מקצה לקצה", "בניית ממשקים ב-React", "פיתוח שירותים ב-Node.js", "עבודה צמודה עם מעצבים ומנהלי מוצר", "השתתפות בהחלטות ארכיטקטורה"], need: ["3+ שנות ניסיון ב-React ו-Node.js", "הבנה מוצרית", "יכולת תקשורת מצוינת"] },
  { title: "סטודנט/ית לפיתוח תוכנה", company: "חברת סייבר", place: "באר שבע, IL", posted: "פורסם לפני 3 ימים", type: "לסטודנטים", about: "לצוות הפיתוח דרוש/ה סטודנט/ית למשרה חלקית לצד הלימודים", items: ["פיתוח פיצ'רים בצוות מוצר", "כתיבת בדיקות ושיפור קוד קיים", "עבודה עם מנטור צמוד", "גמישות בתקופת מבחנים", "אפשרות להמשך קליטה"], need: ["סטודנט/ית למדעי המחשב או תחום דומה", "היכרות עם Python או JavaScript", "זמינות של 3 ימים בשבוע"] },
  { title: "מנהל/ת מוצר", company: "חברת תוכנה", place: "תל אביב, IL", posted: "פורסם לפני 4 שעות", about: "דרוש/ה מנהל/ת מוצר להובלת מוצר B2B משלב הרעיון ועד ההשקה", items: ["הגדרת אפיונים ודרישות", "עבודה עם פיתוח ועיצוב", "שיחות עם לקוחות", "ניתוח נתוני שימוש", "תעדוף רודמפ"], need: ["2+ שנות ניסיון בניהול מוצר", "רקע טכני", "אנגלית ברמה גבוהה"] },
];
const realCard = (job) => `<div style="height:100%;background:${BG};border-radius:10px;border:1px solid rgba(215,218,230,.4);box-shadow:0 6px 20px rgba(0,0,0,.12);overflow:hidden" dir="rtl">
  <div style="padding:10px 16px"><div style="font-size:20.8px;font-weight:700;line-height:1.3">${job.title}</div>
    <div style="display:flex;align-items:center;gap:9px;margin-top:9px">${logo(26)}<span style="font-size:14.4px;font-weight:500;color:rgba(23,25,35,.8)">${job.company}</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${badge("work", "rgba(33,150,243,.8)", "rgba(33,150,243,.1)", job.type ?? "משרה מלאה")}${badge("swipeRight", "rgba(76,175,80,.8)", "rgba(76,175,80,.1)", "החלקה להגשה פעילה")}</div></div>
  <div style="padding:10px 16px"><div style="display:flex;align-items:center;gap:7px;font-size:13.6px;color:rgba(23,25,35,.7);white-space:nowrap">${icon("calendar", 16, "rgba(23,25,35,.6)")}<span>${job.posted}</span><span style="width:6px"></span>${icon("location", 16, "rgba(23,25,35,.6)")}<span dir="auto">${job.place}</span></div>
    ${head("description", "תיאור")}
    <div style="font-size:15px;font-weight:700;margin:2px 0 6px">קצת על התפקיד</div>
    <div style="font-size:15px;line-height:1.42;color:rgba(23,25,35,.92)">${job.about}</div>
    <ul style="margin:6px 0 0;padding:0 18px 0 0;font-size:15px;line-height:1.42;color:rgba(23,25,35,.92)">${job.items.map((v) => `<li style="margin-bottom:5px">${v}</li>`).join("")}</ul>
    <div style="font-size:15px;font-weight:700;margin:10px 0 6px">דרישות</div>
    <ul style="margin:0;padding:0 18px 0 0;font-size:15px;line-height:1.42;color:rgba(23,25,35,.92)">${job.need.map((v) => `<li style="margin-bottom:5px">${v}</li>`).join("")}</ul>
    <div style="font-size:15px;font-weight:700;margin:10px 0 6px">יתרון</div>
    <ul style="margin:0;padding:0 18px 0 0;font-size:15px;line-height:1.42;color:rgba(23,25,35,.92)">${["ניסיון בעבודה בסביבת ענן בקנה מידה גדול", "היכרות עם מערכות מבוזרות", "ניסיון בהובלה טכנית של פרויקטים", "עבודה בצוותים חוצי ארגון", "אנגלית ברמה גבוהה"].map((v) => `<li style="margin-bottom:5px">${v}</li>`).join("")}</ul>
  </div></div>`;

const topBar = `<div dir="ltr" style="flex-shrink:0;height:58px;padding:9px 16px 7px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 3px rgba(23,25,35,.06);position:relative;z-index:3;background:${BG}"><span style="width:38px"></span><img src="${banner}" style="height:40px;object-fit:contain"><span style="width:38px;display:flex;justify-content:center">${icon("language", 22, INK)}</span></div>`;
const touch = (x, y, s = 1, o = 1) => `<span style="position:absolute;left:${x}px;top:${y}px;width:46px;height:46px;margin:-23px;border-radius:50%;background:rgba(23,25,35,.22);box-shadow:0 0 0 1px rgba(255,255,255,.75) inset;transform:scale(${s});opacity:${o};z-index:25"></span>`;

// The swipe, with the app's numbers: 25 degrees across the screen, back card from 0.96 and -16 px, dock over 80 px.
function feed(front: number, back: number, dx = 0, opts: { applied?: boolean; over?: string; spin?: number | false; finger?: string | null } = {}) {
  const { applied = false, over = "", spin = false, finger = null } = opts;
  const rot = (dx / 390) * 25, lift = clamp(Math.abs(dx) / 78);
  const l = clamp(-dx / 80), r = clamp(dx / 80), side = 1 - clamp(l + r);
  return `${topBar}<div style="position:relative;flex:1;min-height:0">
    <div style="position:absolute;inset:0;transform:translateY(${-16 + 16 * lift}px) scale(${0.96 + 0.04 * lift})">${realCard(JOBS[back])}</div>
    <div style="position:absolute;inset:0;z-index:1;transform:translateX(${dx}px) rotate(${rot}deg)">${realCard(JOBS[front])}</div>
    ${dock({ apply: 1 - l, reject: 1 - r, side, applyScale: 1 + 0.35 * r, rejectScale: 1 + 0.35 * l, applied })}
    ${spin ? `<span style="position:absolute;left:50%;bottom:21px;margin-left:-12px;width:24px;height:24px;border-radius:50%;border:2px solid rgba(101,94,228,.25);border-top-color:${PURPLE};transform:rotate(${spin}deg);z-index:12;background:#fff"></span>` : ""}
    ${over}${finger ?? ""}
  </div>`;
}

function nav(selected) {
  const tabs = [["feed", "פיד"], ["chat", "משוב"], ["list", "פניות"], ["person", "פרופיל"]];
  return `<div dir="ltr" style="background:${BG};flex-shrink:0;height:52px;display:flex;position:relative;z-index:4">${tabs.map(([tab, label], i) => {
    const on = i === selected;
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center">${mask(`${tab}-${on ? "filled" : "outline"}`, 22, on ? INK : "#5E6272", "margin:2px;")}<span dir="rtl" style="font-size:10px;font-weight:${on ? 600 : 400};color:${on ? INK : "#5E6272"}">${label}</span></div>`;
  }).join("")}</div>`;
}

const SHOT_W = 390, SHOT_H = 836;
const androidNav = `<div dir="ltr" style="height:44px;flex-shrink:0;background:#000;display:flex;align-items:center;justify-content:space-around;padding:0 48px;position:relative;z-index:40"><span style="display:flex;gap:3px">${[0, 1, 2].map(() => `<i style="width:2px;height:14px;background:#C8C8CC"></i>`).join("")}</span><i style="width:14px;height:14px;border:2px solid #C8C8CC;border-radius:4px"></i><i style="width:10px;height:10px;border-left:2px solid #C8C8CC;border-bottom:2px solid #C8C8CC;transform:rotate(45deg)"></i></div>`;
const statusBar = (clock, dark = false) => { const c = dark ? "#fff" : INK; return `<div dir="ltr" style="height:30px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:4px 20px 0;font-size:13px;font-weight:500;color:${c};position:relative;z-index:41"><span>${clock}</span><span style="display:flex;align-items:center;gap:6px"><span style="font-size:11px">78%</span><span style="width:20px;height:10px;border:1px solid ${c};border-radius:3px;padding:1px;display:flex"><span style="width:75%;background:${c};border-radius:1px"></span></span></span></div>`; };

function phone(body, { selected = 0, showNav = true, modal = "", scrim = 0, clock = "15:08", top = BG } = {}) {
  return `<div style="position:relative;width:${SHOT_W + 22}px;height:${SHOT_H + 22}px;padding:11px;box-sizing:border-box;background:#101114;border-radius:44px;box-shadow:inset 0 0 0 2px #34353C,0 60px 90px -30px rgba(23,25,35,.5),0 18px 40px -14px rgba(23,25,35,.4)">
    <div style="position:relative;width:${SHOT_W}px;height:${SHOT_H}px;border-radius:33px;overflow:hidden;background:${top};display:flex;flex-direction:column;isolation:isolate">
      ${statusBar(clock)}
      <div style="position:relative;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden">${body}</div>
      ${showNav ? nav(selected) : ""}
      ${androidNav}
      ${scrim ? `<div style="position:absolute;inset:0 0 44px;background:rgba(0,0,0,${0.54 * scrim});z-index:30"></div>` : ""}${modal}
      <span style="position:absolute;top:7px;left:50%;margin-left:-8px;width:16px;height:16px;border-radius:50%;background:#000;z-index:45"></span>
    </div></div>`;
}

/** The screen alone, at 390 by h, for a phone already in the shot (a green screen). */
function bare(body, { h = SHOT_H, selected = 0, clock = "15:08" } = {}) {
  return `<div style="position:relative;width:${SHOT_W}px;height:${h}px;overflow:hidden;background:${BG};display:flex;flex-direction:column;isolation:isolate">
      ${statusBar(clock)}
      <div style="position:relative;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden">${body}</div>
      ${nav(selected)}
      ${androidNav}
      <span style="position:absolute;top:7px;left:50%;margin-left:-8px;width:16px;height:16px;border-radius:50%;background:#000;z-index:45"></span>
    </div>`;
}

const sheet = (rise_, html, top = "auto") => `<div dir="rtl" style="position:absolute;left:0;right:0;bottom:44px;top:${top};z-index:35;background:${BG};border-radius:18px 18px 0 0;transform:translateY(${(1 - rise_) * 110}%);box-shadow:0 -8px 26px rgba(23,25,35,.18)">${html}</div>`;
const filters = (student = false) => `<div style="padding:12px 18px 20px"><div style="width:36px;height:4px;border-radius:2px;background:#D7DAE6;margin:0 auto 14px"></div><div style="font-size:20px;font-weight:700">סינון משרות</div>
  <div style="font-size:15px;font-weight:700;margin-top:16px">רמת ניסיון</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"><span style="padding:6px 12px;border-radius:16px;background:${student ? PURPLE : "rgba(101,94,228,.1)"};color:${student ? "#fff" : INK};border:1px solid rgba(101,94,228,.3);font-size:14px;font-weight:${student ? 700 : 500}">לסטודנטים</span>${chips(["רמת מתחילים", "רמת ביניים", "רמת מומחה"])}</div>
  <div style="font-size:15px;font-weight:700;margin-top:16px">תוכנה</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${chips(["Backend", "Full Stack", "ענן"])}</div>
  <div style="margin-top:18px">${purpleButton("החל סינון")}</div></div>`;

const STREAK_GOAL = 5;
const streak = (y, fill, count, today) => `<div dir="rtl" style="position:absolute;top:${y}px;left:16px;right:16px;z-index:20;padding:10px 14px;border-radius:14px;background:${BG};border:1px solid rgba(101,94,228,.35);box-shadow:0 3px 10px rgba(0,0,0,.08)">
  <div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">🔥</span><span style="font-size:14px;font-weight:700">רצף של <bdi>${count}</bdi> ימים</span><span style="margin-inline-start:auto;font-size:12px;font-weight:600;color:rgba(23,25,35,.65)"><bdi>${today}/${STREAK_GOAL}</bdi> היום</span></div>
  <div style="margin-top:8px;height:10px;border-radius:8px;background:rgba(101,94,228,.12);overflow:hidden"><div style="height:100%;width:${fill * 100}%;border-radius:8px;background:linear-gradient(270deg,#8B7FF6,#BB72F8)"></div></div></div>`;

const bubble = (text, user, o = 1, y = 0) => `<div style="display:flex;justify-content:${user ? "flex-end" : "flex-start"};margin-bottom:8px;opacity:${o};transform:translateY(${y}px)"><div style="max-width:265px;padding:9px 12px;border-radius:16px;background:${user ? PURPLE : "#fff"};color:${user ? "#fff" : INK};font-size:15px;line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,.18)">${text}</div></div>`;
const actionChip = (t, tapped = false) => `<span style="display:inline-block;padding:7px 12px;border-radius:9px;background:${tapped ? "rgba(101,94,228,.18)" : "#fff"};border:1px solid #D7DAE6;font-size:13px;font-weight:500;margin:0 0 6px 6px">${t}</span>`;

function chatScreen(t) {
  const open = out3(p(t, 0.35, 0.65));
  const q = "האם אני מתאים למשרה הזו?";
  const a = "נראה שכן: יש לך ניסיון ב-Python וב-SQL. כדאי להדגיש גם את הניסיון שלך בענן.";
  const typed = a.slice(0, Math.floor(p(t, 1.7, 2.9) * a.length));
  const sent = t > 1.25;
  return `${topBar}<div style="position:relative;flex:1;min-height:0">
    ${realCard(JOBS[0])}
    <div style="position:absolute;inset:0;background:rgba(255,255,255,${0.52 * open});backdrop-filter:blur(${6 * open}px);z-index:5"></div>
    <div dir="rtl" style="position:absolute;left:16px;right:16px;top:16px;z-index:6;opacity:${open}">
      ${bubble("היי! אני כאן לעזור לך להתכונן למשרה של &quot;מפתח/ת Backend&quot; ב-Nova Labs. אפשר לשאול אותי על התאמה, דגשים לקורות חיים וניסוח פנייה.", false)}
      ${sent ? bubble(q, true, p(t, 1.25, 1.4), lerp(14, 0, out3(p(t, 1.25, 1.45)))) : `<div>${actionChip(q, t > 1.05)}${actionChip("מה כדאי לי להדגיש בקורות החיים למשרה הזו?")}${actionChip("אני רוצה לדעת יותר על החברה")}</div>`}
      ${typed ? bubble(typed, false) : sent && t > 1.45 ? bubble("...", false) : ""}
    </div>
    ${open > 0 ? `<div dir="ltr" style="position:absolute;bottom:10px;right:17px;width:${lerp(46, 356, open)}px;height:46px;border-radius:999px;background:${BG};border:.5px solid rgba(101,94,228,.5);box-shadow:0 4px 14px rgba(0,0,0,.15);display:flex;align-items:center;justify-content:space-between;padding:0 12px;z-index:7;overflow:hidden">${icon("close", 20, "rgba(23,25,35,.6)")}<span dir="rtl" style="flex:1;padding:0 10px;font-size:14px;color:rgba(23,25,35,.45);text-align:right;white-space:nowrap">שאל אותי על המשרה...</span>${icon("send", 22, PURPLE)}</div>` : dock({})}
    ${t < 0.42 ? touch(342, 625, 1 - 0.2 * p(t, 0.2, 0.35), p(t, 0.05, 0.2)) : ""}
    ${t > 0.85 && t < 1.2 ? touch(280, 196, 1, 1 - p(t, 1.1, 1.2)) : ""}
  </div>`;
}

const tailoredSheet = (t) => {
  const rows = [[100, 0], [92, 1], [78, 1], [96, 0], [84, 1], [64, 0]];
  const lines = rows.map(([w, hit], i) => { const on = p(t, 1.6 + i * 0.12, 1.8 + i * 0.12) * hit; return `<div style="height:7px;border-radius:4px;margin:8px 0 0 auto;width:${w}%;background:#D7DAE6;overflow:hidden"><div style="height:100%;width:${on * 100}%;margin-inline-start:auto;background:${PURPLE}"></div></div>`; }).join("");
  const press = 1 - 0.05 * Math.sin(p(t, 2.7, 2.95) * Math.PI);
  return `<div dir="ltr" style="height:100%;padding:18px 18px 14px;box-sizing:border-box;display:flex;flex-direction:column">
    <div style="font-size:21px;font-weight:700">Tailored Resume</div>
    <div dir="rtl" style="font-size:14px;line-height:1.45;color:rgba(23,25,35,.8);margin-top:8px">הודגשו הניסיון ב-Python וב-AWS והעבודה עם SQL, בהתאם לדרישות המשרה.</div>
    <div dir="rtl" style="flex:1;min-height:0;margin:14px 26px;background:#fff;border:1px solid #D7DAE6;border-radius:6px;padding:16px;overflow:hidden"><div style="font-size:18px;font-weight:800">דנה לוי</div><div style="font-size:12px;color:#5E6272">מהנדסת תוכנה</div><div style="font-size:12px;font-weight:700;margin-top:12px">ניסיון</div>${lines}</div>
    <div style="display:flex;gap:10px"><div style="flex:1;height:46px;border-radius:23px;border:1px solid ${PURPLE};color:${PURPLE};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600">Save to my resumes</div><div style="flex:1;height:46px;border-radius:23px;background:${PURPLE};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;transform:scale(${press})">Apply with this</div></div></div>`;
};

const appliedCard = (job, chipsList, date, o, y) => `<div dir="rtl" style="background:${BG};border-radius:18px;padding:16px;margin-bottom:10px;border:1px solid rgba(215,218,230,.16);box-shadow:0 5px 14px rgba(0,0,0,.12);opacity:${o};transform:translateY(${y}px)">
  <div dir="ltr" style="font-size:11px;font-weight:600;color:rgba(23,25,35,.45);text-align:left">${date}</div><div style="margin-top:6px;font-size:16px;font-weight:700">${job.title}</div>
  <div style="margin-top:6px;display:flex;align-items:center;gap:6px">${logo(22)}<span style="font-size:14px;font-weight:500;color:rgba(23,25,35,.68)">${job.company}</span></div>
  <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">${chipsList.map((c) => `<span style="padding:3px 8px;border-radius:8px;background:rgba(101,94,228,.1);font-size:11px;font-weight:600;color:${PURPLE}">${c}</span>`).join("")}</div></div>`;
const applicationsScreen = (t) => `<div dir="rtl" style="flex-shrink:0;padding:12px 16px 8px"><div style="height:44px;border-radius:12px;background:#E7E8F0;display:flex;align-items:center;gap:10px;padding:0 12px;color:#5E6272;font-size:15px">${icon("search", 22, "#5E6272")}חיפוש בקשות...</div></div>
  <div style="flex:1;padding:4px 16px 0;overflow:hidden">${[[JOBS[0], ["Full-time", "Swipe apply", "תל אביב"], "Nov 1, 2026"], [JOBS[1], ["Full-time", "Swipe apply", "Remote"], "Oct 30, 2026"], [JOBS[2], ["Full-time", "Swipe apply", "חיפה"], "Oct 28, 2026"]].map(([j, c, d], i) => appliedCard(j, c, d, p(t, 0.35 + i * 0.14, 0.6 + i * 0.14), lerp(24, 0, out3(p(t, 0.35 + i * 0.14, 0.7 + i * 0.14))))).join("")}</div>`;

const browserField = (label, value, caret = false) => `<div style="font-size:13px;font-weight:600;color:#555;margin:13px 0 5px">${label}</div><div style="min-height:40px;border:1px solid #BFC2C8;border-radius:4px;background:#fff;display:flex;align-items:center;padding:0 10px;font-size:14px;color:#222">${value}${caret ? `<i style="width:1px;height:18px;background:#222;margin:0 1px"></i>` : ""}</div>`;
function browser(t) {
  const name = "דנה לוי", phoneNo = "050-0000000", job = "מהנדסת תוכנה, 3 שנים";
  const type = (s, a, b) => s.slice(0, Math.floor(p(t, a, b) * s.length));
  const scroll = inOut(p(t, 0.95, 1.25)) * 230;
  const err = out3(p(t, 1.32, 1.5)), wiped = t > 1.68;
  return `<div style="height:44px;flex-shrink:0;background:#E8E9EC;display:flex;align-items:center;padding:0 12px"><div dir="ltr" style="flex:1;height:30px;border-radius:15px;background:#fff;font-size:12px;color:#666;display:flex;align-items:center;padding:0 12px">careers.example.com/apply</div></div>
    <div dir="rtl" style="position:relative;flex:1;min-height:0;overflow:hidden;background:#fff">
      <div style="position:absolute;left:0;right:0;top:${-scroll}px;padding:14px 18px">
        <div style="font-size:19px;font-weight:700;color:#222">טופס הגשת מועמדות</div><div style="font-size:12px;color:#777;margin-top:2px">שלב <bdi>${t < 1 ? 2 : 7}</bdi> מתוך <bdi>7</bdi></div>
        ${browserField("קורות חיים", wiped ? "" : `<bdi style="color:#16A34A">Resume.pdf ✓</bdi>`)}
        ${browserField("שם מלא", wiped ? "" : type(name, 0.1, 0.35), t > 0.1 && t < 0.35)}
        ${browserField("טלפון", wiped ? "" : `<bdi>${type(phoneNo, 0.35, 0.65)}</bdi>`, t > 0.35 && t < 0.65)}
        ${browserField("ניסיון תעסוקתי (כפי שמופיע בקורות החיים)", wiped ? "" : type(job, 0.65, 0.95), t > 0.65 && t < 0.95)}
        ${browserField("השכלה", wiped ? "" : "תואר ראשון")}
        ${browserField("למה דווקא אנחנו? (עד 500 מילים)", "")}
        ${browserField("תאריך תחילת עבודה", "")}
        <div style="height:44px;border-radius:4px;background:#6B7280;color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;margin-top:18px">שליחה</div>
      </div>
      <div style="position:absolute;left:0;right:0;top:${lerp(-80, 0, err)}px;background:#B00020;color:#fff;font-size:14px;font-weight:700;padding:12px 16px;z-index:4;text-align:center">פג תוקף החיבור. יש להתחיל מחדש.</div>
    </div>`;
}

function onboarding(t) {
  const confirm = t > 1.25;
  if (!confirm) return `<div dir="rtl" style="flex:1;padding:22px 18px 16px;display:flex;flex-direction:column">
    <div style="font-size:26px;font-weight:800">העלה קורות חיים</div><div style="font-size:14px;color:#5E6272;margin-top:6px;line-height:1.4">זה כל מה שצריך כדי לבנות את הפרופיל שלך במהירות</div>
    <div style="margin-top:22px;border:1px solid rgba(101,94,228,.45);border-radius:14px;background:#fff;padding:14px;display:flex;align-items:center;gap:12px;opacity:${p(t, 0.25, 0.45)};transform:translateY(${lerp(16, 0, out3(p(t, 0.25, 0.5)))}px)">${logo(30)}<div dir="ltr" style="font-size:14px;font-weight:600;flex:1;text-align:right">Dana_Levi_Resume.pdf</div></div>
    <div style="flex:1"></div>${purpleButton(t > 0.8 ? `<span style="display:inline-block;width:20px;height:20px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;transform:rotate(${t * 500}deg)"></span>` : "המשך")}<div style="height:18px"></div></div>`;
  const chip = (i) => out3(p(t, 1.4 + i * 0.12, 1.7 + i * 0.12));
  const group = (title, items, base) => `<div style="font-size:15px;font-weight:700;margin-top:22px">${title}</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${items.map((label, i) => `<span style="opacity:${chip(base + i)};transform:scale(${lerp(0.7, 1, chip(base + i))});display:inline-block">${chips([label])}</span>`).join("")}</div>`;
  return `<div dir="rtl" style="flex:1;padding:22px 18px 16px;display:flex;flex-direction:column"><div style="font-size:26px;font-weight:800">אישור העדפות</div><div style="font-size:14px;color:#5E6272;margin-top:6px;line-height:1.4">בדוק/י אזור חיפוש ותפקידים מוצעים לפני שמתחילים להחליק</div>
    ${group("מדינות", ["ישראל"], 0)}${group("תוכנה", ["Backend", "Full Stack", "ענן"], 1)}${group("דאטה", ["הנדסת נתונים", "אנליטיקה"], 4)}<div style="flex:1"></div>${purpleButton("המשך")}<div style="height:18px"></div></div>`;
}


export { bare, icon, store, JOBS, feed, phone, sheet, filters, streak, touch, chatScreen, tailoredSheet, applicationsScreen, browser, onboarding, SHOT_W, SHOT_H };
