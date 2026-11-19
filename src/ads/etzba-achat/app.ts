// @ts-nocheck: strings of markup, ported from madrich/app.ts (checked against the Flutter source) and switched to English.
/**
 * The Gomlin app in its English locale, 390 wide, as markup. Strings are from gomlin/lib/l10n/app_en.arb
 * ("Applied!", Feed / Feedback / Applications / Profile, "Full Time", "{count} days ago", "Description",
 * "Requirements", "{count}-day streak") and job_card.dart ("Swipe apply active"). Every function takes the moment
 * it should draw, so it's a function of the frame.
 */
import { asset } from "../../engine";

const SLUG = "etzba-achat";
export const PURPLE = "#655EE4", INK = "#171923", BG = "#F4F5F9", GREEN = "#22C55E", RED = "#EF4444";
export const banner = asset(`ads/${SLUG}/gomlin-banner.png`);
export const chatHead = asset(`ads/${SLUG}/ui/chat-head.png`);
export const ICONS = ["apply", "resume", "feed-filled", "feed-outline", "chat-filled", "chat-outline", "list-filled", "list-outline", "person-filled", "person-outline"].map((name) => asset(`ads/${SLUG}/ui/${name}.svg`));

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

const mask = (name, size, color, extra = "") => `<span style="display:inline-block;width:${size}px;height:${size}px;flex-shrink:0;background:${color};-webkit-mask:url('${asset(`ads/${SLUG}/ui/${name}.svg`)}') center/contain no-repeat;mask:url('${asset(`ads/${SLUG}/ui/${name}.svg`)}') center/contain no-repeat;${extra}"></span>`;

// Material icon paths, as in gomlin-website/src/components/howItWorks/AppIcons.jsx
const PATHS = {
  close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  tune: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
  work: "M14 6V4h-4v2h4zM4 8v11h16V8H4zm16-2c1.11 0 2 .89 2 2v11c0 1.11-.89 2-2 2H4c-1.11 0-2-.89-2-2l.01-11c0-1.11.88-2 1.99-2h4V4c0-1.11.89-2 2-2h4c1.11 0 2 .89 2 2v2h4z",
  swipeRight: "M15 7l-1.41 1.41L16.17 11h-4.27a4 4 0 1 0 0 2h4.27l-2.58 2.59L15 17l5-5z",
  calendar: "M20 3h-1V1h-2v2H7V1H5v2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 18H4V10h16v11zm0-13H4V5h16v3z",
  location: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z",
  description: "M8 16h8v2H8zm0-4h8v2H8zm6-10H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z",
  language: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.93 6h-2.95a15.65 15.65 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.93 8zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.08 16zm2.95-8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.65 15.65 0 0 0 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z",
  play: "M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302a1 1 0 010 1.38l-2.302 2.302-2.545-2.545 2.545-2.545zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z",
  apple: "M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z",
};
export const icon = (name, size, color) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" style="flex-shrink:0"><path d="${PATHS[name]}" fill-rule="evenodd"/></svg>`;

/** The black store button, as on the website's hero (radius 16). */
export const store = (glyph, name, scale = 1) => `<span style="display:inline-flex;align-items:center;gap:${16 * scale}px;background:#171923;color:#fff;padding:${18 * scale}px ${30 * scale}px;border-radius:${18 * scale}px;box-sizing:border-box">${icon(glyph, 40 * scale, "#fff")}<span style="font-size:${26 * scale}px;font-weight:700;white-space:nowrap">${name}</span></span>`;

// ---- the dock: filter, reject, resume, apply, chat head; the "Applied!" pill above apply ----
const dockSmall = (inner, opacity = 1) => `<span class="dock-small" style="opacity:${opacity}">${inner}</span>`;
const dockLarge = (inner, opacity = 1, scale = 1) => `<span style="width:68px;display:flex;justify-content:center"><span class="dock-large" style="opacity:${opacity};transform:scale(${scale})">${inner}</span></span>`;
const pill = (o = 1, s = 1) => `<span style="position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%) scale(${s});transform-origin:bottom center;opacity:${o};white-space:nowrap;padding:6px 10px;border-radius:20px;background:#fff;font-size:18px;box-shadow:0 0 13px 1px rgba(101,94,228,.35)">Applied!</span>`;
function dock({ apply = 1, reject = 1, side = 1, applyScale = 1, rejectScale = 1, applied = 0 } = {}) {
  return `<div style="position:absolute;bottom:10px;left:0;right:0;z-index:10;display:flex;justify-content:center;align-items:flex-end;gap:20px">
    ${dockSmall(icon("tune", 22, "rgba(23,25,35,.5)"), side)}
    ${dockLarge(icon("close", 34, RED), reject, rejectScale)}
    ${dockSmall(mask("resume", 22, "rgba(23,25,35,.5)"), side)}
    <span style="position:relative;display:flex">${applied > 0 ? pill(clamp(applied * 4), 0.6 + 0.4 * clamp(applied * 3) + 0.12 * Math.sin(clamp(applied * 2) * Math.PI)) : ""}
    ${dockLarge(mask("apply", 34, GREEN, "transform:scaleX(-1);"), apply, applyScale)}</span>
    ${dockSmall(`<img src="${chatHead}" style="width:29px;height:29px;border-radius:50%">`, side)}
  </div>`;
}

// ---- the card: light, radius 10, title 20.8/700, company 14.4/500 with the purple building icon, badges ----
const BUSINESS = "M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z";
const logo = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="rgba(101,94,228,.7)" style="flex-shrink:0"><path d="${BUSINESS}"/></svg>`;
const badge = (name, color, tint, text) => `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:8px;background:${tint}">${icon(name, 14.4, color)}<span style="font-size:12px;font-weight:600">${text}</span></span>`;
const head = (name, text) => `<div style="display:flex;align-items:center;gap:8px;padding:8px 0">${icon(name, 18, PURPLE)}<span style="font-size:17px;font-weight:600">${text}</span></div>`;

// Generic titles at fictional companies (no real company is named), as the pitch says.
export const JOBS = [
  { title: "Full Stack Developer", company: "Fintech startup", place: "Tel Aviv, IL", posted: "2 days ago", about: "A growing fintech team is looking for a Full Stack Developer to build its customer platform.", items: ["Build features end to end in React and Node", "Work with SQL databases", "Ship small, ship often"], need: ["3+ years building web apps", "Experience with a cloud provider"] },
  { title: "Data Analyst", company: "E-commerce company", place: "Ramat Gan, IL", posted: "5 hours ago", about: "The data team is looking for an analyst to work closely with product.", items: ["Build dashboards and reports", "Analyse user behaviour", "Write SQL queries"], need: ["1+ years as an analyst", "Strong SQL and Excel"] },
  { title: "Student Position, Software", company: "Cyber security company", place: "Be'er Sheva, IL", posted: "3 days ago", type: "For Students", about: "The development team is looking for a student for a part-time role.", items: ["Develop internal tools", "Write tests", "Learn from a senior team"], need: ["Studying computer science", "Available 3 days a week"] },
  { title: "Backend Engineer", company: "Health-tech startup", place: "Herzliya, IL", posted: "1 day ago", about: "A small product team is looking for a Backend Engineer.", items: ["Design APIs", "Own services in production", "Work with product and DevOps"], need: ["3+ years server-side", "Docker and CI/CD"] },
  { title: "Product Manager", company: "Software company", place: "Tel Aviv, IL", posted: "4 hours ago", about: "Lead a B2B product from discovery to launch.", items: ["Talk to customers", "Write clear specs", "Work with design and engineering"], need: ["2+ years in product", "B2B experience"] },
];

export const realCard = (job) => `<div style="height:100%;background:${BG};border-radius:10px;border:1px solid rgba(215,218,230,.4);box-shadow:0 6px 20px rgba(0,0,0,.12);overflow:hidden;text-align:left" dir="ltr">
  <div style="padding:10px 16px"><div style="font-size:20.8px;font-weight:700;line-height:1.3">${job.title}</div>
    <div style="display:flex;align-items:center;gap:9px;margin-top:9px">${logo(26)}<span style="font-size:14.4px;font-weight:500;color:rgba(23,25,35,.8)">${job.company}</span></div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${badge("work", "rgba(33,150,243,.8)", "rgba(33,150,243,.1)", job.type ?? "Full Time")}${badge("swipeRight", "rgba(76,175,80,.8)", "rgba(76,175,80,.1)", "Swipe apply active")}</div></div>
  <div style="padding:10px 16px"><div style="display:flex;align-items:center;gap:7px;font-size:13.6px;color:rgba(23,25,35,.7);white-space:nowrap">${icon("calendar", 16, "rgba(23,25,35,.6)")}<span>${job.posted}</span><span style="margin-left:10px;display:inline-flex;align-items:center;gap:5px">${icon("location", 16, "rgba(23,25,35,.6)")}${job.place}</span></div>
    ${head("description", "Description")}
    <div style="font-size:15px;line-height:1.42;color:rgba(23,25,35,.92)">${job.about}</div>
    <ul style="margin:6px 0 0;padding:0 0 0 18px;font-size:15px;line-height:1.42;color:rgba(23,25,35,.92)">${job.items.map((v) => `<li style="margin-bottom:5px">${v}</li>`).join("")}</ul>
    <div style="font-size:15px;font-weight:700;margin:10px 0 6px">Requirements</div>
    <ul style="margin:0;padding:0 0 0 18px;font-size:15px;line-height:1.42;color:rgba(23,25,35,.92)">${job.need.map((v) => `<li style="margin-bottom:5px">${v}</li>`).join("")}</ul>
  </div></div>`;

const topBar = `<div style="flex-shrink:0;height:58px;padding:9px 16px 7px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 3px rgba(23,25,35,.06);position:relative;z-index:3;background:${BG}"><span style="width:38px"></span><img src="${banner}" style="height:40px;object-fit:contain"><span style="width:38px;display:flex;justify-content:center">${icon("language", 22, INK)}</span></div>`;

/** The feed mid-swipe, with the app's numbers: 25 degrees across the screen, back card from 0.96 and -16 px, dock over 80 px. */
export function feed(front: number, back: number, dx = 0, applied = 0) {
  const rot = (dx / 390) * 25, lift = clamp(Math.abs(dx) / 78);
  const l = clamp(-dx / 80), r = clamp(dx / 80), side = 1 - clamp(l + r);
  return `${topBar}<div style="position:relative;flex:1;min-height:0">
    <div style="position:absolute;inset:0;transform:translateY(${-16 + 16 * lift}px) scale(${0.96 + 0.04 * lift})">${realCard(JOBS[back])}</div>
    <div style="position:absolute;inset:0;z-index:1;transform:translateX(${dx}px) rotate(${rot}deg)">${realCard(JOBS[front])}</div>
    ${dock({ apply: 1 - l, reject: 1 - r, side, applyScale: 1 + 0.35 * r, rejectScale: 1 + 0.35 * l, applied })}
  </div>`;
}

function nav(selected) {
  const tabs = [["feed", "Feed"], ["chat", "Feedback"], ["list", "Applications"], ["person", "Profile"]];
  return `<div style="background:${BG};flex-shrink:0;height:52px;display:flex;position:relative;z-index:4">${tabs.map(([tab, label], i) => {
    const on = i === selected;
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center">${mask(`${tab}-${on ? "filled" : "outline"}`, 22, on ? INK : "#5E6272", "margin:2px;")}<span style="font-size:10px;font-weight:${on ? 600 : 400};color:${on ? INK : "#5E6272"}">${label}</span></div>`;
  }).join("")}</div>`;
}

export const SHOT_W = 390, SHOT_H = 836;
const androidNav = `<div style="height:44px;flex-shrink:0;background:#000;display:flex;align-items:center;justify-content:space-around;padding:0 48px;position:relative;z-index:40"><span style="display:flex;gap:3px">${[0, 1, 2].map(() => `<i style="width:2px;height:14px;background:#C8C8CC"></i>`).join("")}</span><i style="width:14px;height:14px;border:2px solid #C8C8CC;border-radius:4px"></i><i style="width:10px;height:10px;border-left:2px solid #C8C8CC;border-bottom:2px solid #C8C8CC;transform:rotate(45deg)"></i></div>`;
const statusBar = (clock) => `<div style="height:30px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:4px 20px 0;font-size:13px;font-weight:500;color:${INK};position:relative;z-index:41"><span>${clock}</span><span style="display:flex;align-items:center;gap:6px"><span style="font-size:11px">78%</span><span style="width:20px;height:10px;border:1px solid ${INK};border-radius:3px;padding:1px;display:flex"><span style="width:75%;background:${INK};border-radius:1px"></span></span></span></div>`;

/** The screen alone, 390 by SHOT_H, for a phone already in the shot (a keyed green screen): Android status bar and punch-hole. */
export function bare(body, selected = 0, clock = "9:41") {
  return `<div class="gomlin-app" style="position:relative;width:${SHOT_W}px;height:${SHOT_H}px;overflow:hidden;background:${BG};display:flex;flex-direction:column;isolation:isolate">
      ${statusBar(clock)}
      <div style="position:relative;flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden">${body}</div>
      ${nav(selected)}
      ${androidNav}
      <span style="position:absolute;top:7px;left:50%;margin-left:-8px;width:16px;height:16px;border-radius:50%;background:#000;z-index:45"></span>
    </div>`;
}

/** The streak badge (streak_badge.dart): 🔥, "{count}-day streak", and the bar from #8B7FF6 to #BB72F8. No daily counter. */
export const streak = (count, fill) => `<div style="width:340px;padding:12px 16px;border-radius:14px;background:${BG};border:1px solid rgba(101,94,228,.35);box-shadow:0 6px 18px rgba(0,0,0,.25);text-align:left">
  <div style="display:flex;align-items:center;gap:8px"><span style="font-size:22px">🔥</span><span style="font-size:18px;font-weight:700;color:${INK}">${count}-day streak</span></div>
  <div style="margin-top:9px;height:11px;border-radius:8px;background:rgba(101,94,228,.12);overflow:hidden"><div style="height:100%;width:${fill * 100}%;border-radius:8px;background:linear-gradient(90deg,#8B7FF6,#BB72F8)"></div></div></div>`;

/** The "Applied!" pill on its own, for the hit sparks and the snow. */
export const appliedPill = (fs = 18) => `<span style="display:inline-block;white-space:nowrap;padding:${fs / 3}px ${fs * 0.56}px;border-radius:${fs * 1.1}px;background:#fff;color:${INK};font-size:${fs}px;font-weight:500;box-shadow:0 0 ${fs * 0.7}px 1px rgba(101,94,228,.45)">Applied!</span>`;
