import type { CSSProperties, ReactNode } from "react";
import { random, useFrame, useVideo, type AdProps, type Cue, type Ratio, type Scene } from "../../engine";
import { useTimeline, type Timeline } from "../../parts/timeline";
import { ICONS, JOBS, PURPLE, SHOT_H, SHOT_W, appliedPill, banner, bare, feed, realCard, store, streak } from "./app";
import { Aura, Balloon, FONT_CSS, FPS, Img, Katakana, NameCard, Narration, SLUG, SpeedLines, clamp, cut, growQuad, in3, inOut, lerp, out3, out5, outBack, p, quadMatrix, shake } from "./fx";
import { Mascot } from "./Mascot";
import { Clip, clipSeconds, pingpong } from "./Clip";
import screens from "./screens.json";

/**
 * "One Finger" (etzba-achat). An English-dub anime showdown: a twelve-armed rival in a server farm types the same four
 * fields into forty screens, a calm hero walks in, the two close in a manga "menacing approach", and he beats the whole
 * setup with one finger: a right swipe in the rebuilt Gomlin app. Painted stills (generated through Codex) moved in
 * 2.5D, the anime staging in code, the Gomlin character redrawn from the app icon. Times are the ad's seconds, fixed by
 * spec.json and read back from gen/timeline.json for the voice lines.
 */
export const cues: Cue[] = [{ src: `ads/${SLUG}/gen/mix.wav` }];

// ── the story's clock ──
// Scene starts in the ad's first cut's seconds. The first look cut the opening (the glasses, 0-3.6 s), so the ad now
// starts SHIFT seconds in: 14 bars at 152 bpm, which keeps the stomps, the music's cut-in and the impact on their beats.
// Code keeps the original times; anything read from the timeline gets SHIFT added (spec.json moved by the same).
const SHIFT = 3.543;
const CUTS = { farm: SHIFT, frenzy: 6.95, door: 10.25, approach: 13.3, scanner: 22.1, finger: 26.3, impact: 30.2, swipe: 31.0, rush: 32.6, blow: 37.3, trueline: 39.9, end: 46.0 } as const;
const TOTAL = 49.5;
type Id = keyof typeof CUTS;
const ORDER = Object.keys(CUTS) as Id[];
const frameOf = (s: number) => Math.round(s * FPS);
const startOf = (id: Id) => frameOf(CUTS[id] - SHIFT);
const LEN = Object.fromEntries(ORDER.map((id, i) => [id, frameOf((i + 1 < ORDER.length ? CUTS[ORDER[i + 1]] : TOTAL) - SHIFT) - startOf(id)])) as Record<Id, number>;
const STOMPS = [13.805, 14.989, 16.173, 17.357, 18.541, 19.726];

function useClock(id: Id) {
  const f = useFrame();
  const t = f / FPS;
  return { t, g: startOf(id) / FPS + t + SHIFT, f };
}

/** A voice clip's span, from the timeline. */
function clipOf(tl: Timeline, id: string) {
  const c = tl.clips.find((x) => x.id === id);
  return c ? { start: c.start + SHIFT, end: c.end + SHIFT } : { start: -10, end: -10 };
}
/** 0..1 for a balloon: pops in at the line, out a beat after it ends (or at `until`). */
function said(tl: Timeline, id: string, g: number, until?: number) {
  const c = clipOf(tl, id);
  const end = until ?? c.end + 0.35;
  return p(g, c.start - 0.08, c.start + 0.14) * (1 - p(g, end, end + 0.12));
}

const pick = <T,>(ratio: Ratio, wide: T, square: T, tall: T): T => (ratio === "16x9" ? wide : ratio === "1x1" ? square : tall);
const BAL = { "16x9": 52, "1x1": 48, "9x16": 54 } as const;

// ── the stage ──
function Stage({ children, bg, cam }: { children: ReactNode; bg: string; cam?: CSSProperties }) {
  const { width, height } = useVideo();
  return (
    <>
      <style>{FONT_CSS}</style>
      <div style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
        {ICONS.map((src: string) => <img key={src} src={src} alt="" />)}
      </div>
      <div className="ea" style={{ width, height, background: bg }}>
        <div style={{ position: "absolute", inset: 0, ...cam }}>{children}</div>
      </div>
    </>
  );
}

/** The server farm: the wide painting, or the vertical one in 9:16. Cold flicker on the screens. */
function Farm({ ratio, t, zoom = 1, dark = 0, ox = 0, oy = 0 }: { ratio: Ratio; t: number; zoom?: number; dark?: number; ox?: number; oy?: number }) {
  const src = cut(ratio === "9x16" ? "farm-bg-v.jpg" : "farm-bg.jpg");
  const flick = 0.06 + 0.06 * random(`flick-${Math.floor(t * 10)}`);
  return (
    <>
      <img src={src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `translate(${ox}px, ${oy}px) scale(${zoom})` }} />
      <div style={{ position: "absolute", inset: 0, background: "#3DFFB0", mixBlendMode: "overlay", opacity: flick }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 35%, rgba(0,0,0,.55) 100%)" }} />
      {dark > 0 ? <div style={{ position: "absolute", inset: 0, background: "#050A08", opacity: dark }} /> : null}
    </>
  );
}

/** The rival's red counter: his own count, in his world only. */
function Counter({ value, x, y, size, glitch = 0, t = 0 }: { value: number; x: number; y: number; size: number; glitch?: number; t?: number }) {
  const digits = Math.floor(value).toLocaleString("en-US");
  return (
    <div style={{ position: "absolute", left: x, top: y, padding: `${size * 0.18}px ${size * 0.36}px`, background: "rgba(40,0,0,.72)", border: `${Math.max(3, size * 0.05)}px solid #FF3B3B`, boxShadow: "0 0 30px rgba(255,59,59,.5)", color: "#FF5050", fontWeight: 900, fontStretch: "75%", lineHeight: 1, zIndex: 40 }}>
      <div style={{ fontSize: Math.max(34, size * 0.42), letterSpacing: "0.12em", color: "#FFD6D6" }}>APPLICATIONS</div>
      <div style={{ fontSize: size, fontVariantNumeric: "tabular-nums", display: "flex" }}>
        {[...digits].map((ch, i) => {
          const fall = glitch > 0 ? clamp(glitch - i * 0.12) : 0;
          return <span key={i} style={{ display: "inline-block", transform: `translate(${fall * (random(`dx${i}`) - 0.5) * 200}px, ${fall * fall * 900}px) rotate(${fall * (random(`dr${i}`) - 0.5) * 300}deg)`, opacity: 1 - clamp(fall * 1.4 - 0.4) }}>{ch}</span>;
        })}
      </div>
    </div>
  );
}

/** The rebuilt Gomlin screen fitted into a keyed phone still (the still sits on top, the green cut out). */
function PhoneStill({ name, cx, cy, h, screen, flip = false, ghost = 0, style }: { name: "hand-phone" | "chad-swipe"; cx: number; cy: number; h: number; screen: string; flip?: boolean; ghost?: number; style?: CSSProperties }) {
  const info = (screens as Record<string, { size: number[]; corners: number[][] }>)[name];
  const [iw, ih] = info.size;
  const s = h / ih;
  return (
    <div style={{ position: "absolute", left: cx - (iw * s) / 2, top: cy - h / 2, width: iw, height: ih, transform: `scale(${flip ? -s : s}, ${s})`, transformOrigin: "0 0", ...style }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: SHOT_W, height: SHOT_H, transformOrigin: "0 0", transform: quadMatrix(SHOT_W, SHOT_H, growQuad(info.corners, 1.04)) }} dangerouslySetInnerHTML={{ __html: screen }} />
      <img src={cut(`${name}.png`)} alt="" style={{ position: "absolute", left: 0, top: 0, width: iw, height: ih }} />
      {ghost > 0 ? <div style={{ position: "absolute", inset: 0, background: "rgba(139,127,246,.0)" }} /> : null}
    </div>
  );
}

// ── 2. the farm: the rival in full, the same four fields on every screen ──
const FIELDS = [["Name", "Alex Cohen"], ["Email", "alex@mail.com"], ["Phone", "050-000-0000"], ["Resume", "resume_FINAL_v12.pdf"]];
function FormPanel({ x, y, w, size, t, seed }: { x: number; y: number; w: number; size: number; t: number; seed: number }) {
  const cycle = (t * 1.6 + seed * 0.37) % 1;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, padding: size * 0.5, background: "rgba(4,30,20,.78)", border: "3px solid #5CFFB7", boxShadow: "0 0 24px rgba(92,255,183,.45)", borderRadius: 10, zIndex: 30 }}>
      {FIELDS.map(([label, value], i) => {
        const shown = value.slice(0, Math.floor(clamp(cycle * 4 - i) * value.length));
        return (
          <div key={label} style={{ display: "flex", gap: size * 0.4, alignItems: "baseline", marginTop: i ? size * 0.25 : 0, fontSize: size, color: "#B9FFE0", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden" }}>
            <span style={{ width: size * 3.6, flexShrink: 0, color: "#5CFFB7" }}>{label}</span>
            <span style={{ borderBottom: "2px solid rgba(92,255,183,.5)", flex: 1, minHeight: size * 1.1 }}>{shown}{cycle * 4 > i && cycle * 4 < i + 1 ? "▌" : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function FarmScene({ ratio }: AdProps) {
  const { t, g } = useClock("farm");
  const tl = useTimeline();
  const { width: W, height: H } = useVideo();
  const L = pick(ratio,
    { r: { cx: 1020, cy: 640, h: 900 }, card: { x: 110, y: 820 }, form: { x: 110, y: 250, w: 560, s: 34 }, bal: { x: 1240, y: 90, w: 600, tail: [1120, 330] as [number, number] }, kk: { x: 1180, y: 640 } },
    { r: { cx: 560, cy: 650, h: 820 }, card: { x: 64, y: 880 }, form: { x: 64, y: 330, w: 440, s: 32 }, bal: { x: 520, y: 70, w: 500, tail: [560, 300] as [number, number] }, kk: { x: 540, y: 760 } },
    { r: { cx: 540, cy: 1080, h: 1080 }, card: { x: 70, y: 1130 }, form: { x: 70, y: 1360, w: 620, s: 34 }, bal: { x: 330, y: 220, w: 680, tail: [560, 560] as [number, number] }, kk: { x: 90, y: 470 } });
  const sh = shake(t, [0, 0.9, 1.7, 2.5], 6, 0.12, "farm");
  const bob = Math.sin(t * 38) * 4;
  return (
    <Stage bg="#06140E" cam={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
      <Farm ratio={ratio} t={t} zoom={1.04 + 0.06 * t / 3.35} />
      <Clip id="rival-frenzy-v" sec={pingpong(t * 1.1, 1.45)} cx={L.r.cx} cy={L.r.cy} h={L.r.h * (1.08 - 0.08 * out3(p(t, 0, 0.6)))} />
      <FormPanel x={L.form.x} y={L.form.y} w={L.form.w} size={L.form.s} t={t} seed={1} />
      <Katakana text="カタカタカタ" x={L.kk.x} y={L.kk.y} size={pick(ratio, 96, 70, 70)} t={t} color="#EFFFF7" stroke="#0B5E3C" rotate={-14} seed="kata" />
      <NameCard title="THE RIVAL" stats="12 ARMS · 40 SCREENS · 0 SLEEP" x={L.card.x} y={L.card.y} size={pick(ratio, 86, 72, 84)} appear={p(t, 0.05, 0.45) * (1 - p(t, 3.15, 3.3))} accent="#E5322D" />
      <Balloon text="Apply! Apply! APPLY!" x={L.bal.x} y={L.bal.y} w={L.bal.w} size={BAL[ratio]} tail={L.bal.tail} appear={t < 3.2 ? 1 : said(tl, "r1", g, 6.95)} shout />
    </Stage>
  );
}

// ── 3. the frenzy in detail, then the Gomlin character gulps ──
function Frenzy({ ratio }: AdProps) {
  const { t, g } = useClock("frenzy");
  const tl = useTimeline();
  const { width: W, height: H } = useVideo();
  const gulp = t > 2.65;
  const sh = shake(t, [0.2, 0.7, 1.2, 1.7, 2.2], 9, 0.1, "fr");
  const count = 2481 + Math.floor(t * 487);
  const L = pick(ratio,
    { r: { cx: 1080, cy: 900, h: 2000 }, ctr: { x: 110, y: 90, s: 110 }, bal: { x: 110, y: 640, w: 640, tail: [900, 470] as [number, number] }, m: { s: 1050, x: 960, y: 560 } },
    { r: { cx: 540, cy: 860, h: 1500 }, ctr: { x: 64, y: 64, s: 90 }, bal: { x: 64, y: 760, w: 620, tail: [520, 600] as [number, number] }, m: { s: 860, x: 540, y: 560 } },
    { r: { cx: 540, cy: 1180, h: 1700 }, ctr: { x: 70, y: 230, s: 110 }, bal: { x: 70, y: 1240, w: 760, tail: [520, 1050] as [number, number] }, m: { s: 1000, x: 540, y: 960 } });
  if (gulp) {
    const tt = t - 2.65;
    const lens = (
      <g>
        <rect x="140" y="390" width="640" height="260" fill="#2A0606" />
        <text x="450" y="560" fill="#FF4040" fontSize="80" fontWeight="900" fontFamily="Noto Sans">{count.toLocaleString("en-US")}</text>
        <text x="170" y="560" fill="#FF4040" fontSize="80" fontWeight="900" fontFamily="Noto Sans">{(count % 1000).toString().padStart(3, "0")}</text>
      </g>
    );
    return (
      <Stage bg="#1A0F2A">
        <SpeedLines w={W} h={H} t={t} color="#FF6060" opacity={0.25} seed="gulp" />
        <Mascot size={L.m.s * (1 + tt * 0.06)} sweat={p(tt, 0, 0.6)} mouth="gulp" pupils={0.6} lens={lens} lensOpacity={0.7} style={{ position: "absolute", left: L.m.x - (L.m.s * (1 + tt * 0.06)) / 2, top: L.m.y - (L.m.s * (1 + tt * 0.06)) / 2 }} />
        <Katakana text="ゴクッ" x={pick(ratio, 1400, 640, 560)} y={pick(ratio, 150, 90, 300)} size={pick(ratio, 130, 100, 120)} t={t} color="#fff" stroke="#111" rotate={10} seed="gulp" />
        <Balloon text="Nobody out-applies Twelve-Arms-sama!" x={L.bal.x} y={L.bal.y} w={L.bal.w} size={BAL[ratio]} tail={[L.bal.x + L.bal.w * 0.9, L.bal.y - 40]} appear={said(tl, "r2", g)} shout />
      </Stage>
    );
  }
  return (
    <Stage bg="#06140E" cam={{ transform: `translate(${sh.x}px, ${sh.y}px) scale(${1 + t * 0.03})` }}>
      <Farm ratio={ratio} t={t} zoom={1.25} dark={0.25} />
      <SpeedLines w={W} h={H} t={t} cx={L.r.cx} cy={L.r.cy - L.r.h * 0.3} color="#C8FFE6" opacity={0.22} seed="fr" />
      <Clip id="rival-frenzy-v" sec={pingpong(t * 1.25 + 0.6, 1.45)} cx={L.r.cx} cy={L.r.cy} h={L.r.h} />
      {Array.from({ length: 7 }, (_, i) => {
        const age = ((t * 0.9 + i / 7) % 1);
        const x = L.r.cx + (random(`smk${i}`) - 0.5) * L.r.h * 0.6, y = L.r.cy + L.r.h * 0.08 - age * 260;
        return <div key={i} style={{ position: "absolute", left: x - 70, top: y - 70, width: 140 + age * 120, height: 140 + age * 120, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(200,200,200,.55), rgba(200,200,200,0))", opacity: 1 - age }} />;
      })}
      <Counter value={count} x={L.ctr.x} y={L.ctr.y} size={L.ctr.s} />
      <Balloon text="Nobody out-applies Twelve-Arms-sama!" x={L.bal.x} y={L.bal.y} w={L.bal.w} size={BAL[ratio]} tail={L.bal.tail} appear={said(tl, "r2", g)} shout />
    </Stage>
  );
}

// ── 4. the door blasts open on purple, and he walks in ──
function Door({ ratio }: AdProps) {
  const { t, g } = useClock("door");
  const tl = useTimeline();
  const { width: W, height: H } = useVideo();
  const doorY = H * pick(ratio, 0.48, 0.48, 0.44);
  const k = inOut(p(t, 0.3, 3.05));
  const hh = lerp(H * 0.16, H * pick(ratio, 0.95, 0.92, 0.78), k);
  const cy = lerp(doorY + H * 0.03, H * pick(ratio, 0.6, 0.6, 0.62), k);
  const sh = shake(t, [0], 26, 0.2, "door");
  const flash = 1 - p(t, 0, 0.45);
  const step = Math.sin(t * Math.PI * 2 * 1.3) * 6;
  const box = pick(ratio, { x: 110, y: 70, w: 720, s: 54 }, { x: 64, y: 70, w: 640, s: 50 }, { x: 70, y: 230, w: 760, s: 56 });
  return (
    <Stage bg="#06140E" cam={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
      <Farm ratio={ratio} t={t} zoom={1.08 + 0.05 * k} dark={0.15} />
      <div style={{ position: "absolute", left: W / 2 - W, top: doorY - W, width: 2 * W, height: 2 * W, background: `conic-gradient(from 0deg at 50% 50%, ${Array.from({ length: 24 }, (_, i) => `rgba(155,140,255,${i % 2 ? 0 : 0.35}) ${i * 15}deg ${(i + 1) * 15}deg`).join(",")})`, transform: `rotate(${t * 6}deg)`, opacity: 0.55 + 0.45 * flash, mixBlendMode: "screen", maskImage: "radial-gradient(circle, #000 0%, rgba(0,0,0,0) 55%)", WebkitMaskImage: "radial-gradient(circle, #000 0%, rgba(0,0,0,0) 55%)" }} />
      <div style={{ position: "absolute", left: W / 2 - 400, top: doorY - 500, width: 800, height: 1000, background: "radial-gradient(closest-side, rgba(200,190,255,.95), rgba(101,94,228,.6) 45%, rgba(101,94,228,0))", mixBlendMode: "screen" }} />
      <Aura cx={W / 2} cy={cy} rx={hh * 0.26} ry={hh * 0.52} t={t} power={0.4 * k} seed="door" bolts={6} />
      <Clip id="chad-walk-v" sec={t * 1.2} cx={W / 2} cy={cy} h={hh} filter={`brightness(${lerp(0.12, 0.85, p(t, 0.8, 2.8))}) drop-shadow(0 0 ${18 + 20 * flash}px #8B7FF6)`} />
      <div style={{ position: "absolute", inset: 0, background: "#E4DEFF", opacity: 0.9 * flash }} />
      <Katakana text="バァン" x={pick(ratio, 1210, 560, 390)} y={pick(ratio, 140, 120, 330)} size={pick(ratio, 150, 110, 140)} t={t} color="#fff" stroke="#3B2FA8" rotate={8} grow={0.8 + 0.4 * out5(p(t, 0, 0.3))} opacity={1 - p(t, 1.6, 2.1)} seed="ban" />
      <Narration text="Until... he walked in." x={box.x} y={box.y + pick(ratio, 0, 0, 0)} w={box.w} size={box.s} appear={said(tl, "n2", g, 13.25)} style={{ top: pick(ratio, 900, 900, 1450) }} />
    </Stage>
  );
}

// ── 5. the menacing approach ──
function Approach({ ratio }: AdProps) {
  const { t, g } = useClock("approach");
  const tl = useTimeline();
  const { width: W, height: H } = useVideo();
  const steps = STOMPS.filter((s) => g >= s).length;
  const lastStep = STOMPS.filter((s) => g >= s).pop() ?? -10;
  const thud = Math.exp(-(g - lastStep) / 0.15);
  const sh = shake(g, STOMPS, 16, 0.12, "app");
  const walk = out3(p(t, 0, 8.8));
  const L = pick(ratio,
    {
      rival: { cx: lerp(1500, 1360, walk), cy: 560, h: 1180 }, hero: { cx: lerp(430, 590, walk), cy: 590, h: 1120 },
      split: "polygon(56% 0, 100% 0, 100% 100%, 42% 100%)", angle: -62,
      go: { x: 1170, y: 110 }, dodo: { x: 150, y: 200 }, kk: 120,
      bR: { x: 1180, y: 600, w: 640, tail: [1390, 330] as [number, number] }, bH: { x: 110, y: 640, w: 600, tail: [560, 330] as [number, number] },
      focusR: [1380, 420], focusH: [560, 420],
    },
    {
      rival: { cx: lerp(820, 760, walk), cy: 450, h: 860 }, hero: { cx: lerp(250, 330, walk), cy: 700, h: 880 },
      split: "polygon(62% 0, 100% 0, 100% 100%, 30% 100%)", angle: -58,
      go: { x: 600, y: 650 }, dodo: { x: 80, y: 84 }, kk: 84,
      bR: { x: 300, y: 380, w: 520, tail: [700, 230] as [number, number] }, bH: { x: 64, y: 760, w: 560, tail: [300, 420] as [number, number] },
      focusR: [780, 320], focusH: [320, 480],
    },
    {
      rival: { cx: lerp(700, 650, walk), cy: lerp(660, 700, walk), h: 1020 }, hero: { cx: lerp(330, 400, walk), cy: lerp(1420, 1360, walk), h: 1080 },
      split: "polygon(0 0, 100% 0, 100% 46%, 0 64%)", angle: -28,
      go: { x: 170, y: 380 }, dodo: { x: 410, y: 860 }, kk: 96,
      bR: { x: 60, y: 520, w: 560, tail: [560, 420] as [number, number] }, bH: { x: 450, y: 1130, w: 520, tail: [420, 1000] as [number, number] },
      focusR: [650, 520], focusH: [400, 1180],
    });
  // the camera leans toward whoever speaks
  const toR = inOut(p(g, 13.9, 15.0)) * (1 - inOut(p(g, 18.2, 18.9)));
  const toH = inOut(p(g, 18.3, 19.2));
  const zoom = 1 + 0.12 * toR + 0.14 * toH;
  const fx = toH > 0 ? L.focusH[0] : L.focusR[0], fy = toH > 0 ? L.focusH[1] : L.focusR[1];
  const r3 = said(tl, "r3", g, 18.38), h1 = said(tl, "h1", g, 22.05);
  return (
    <Stage bg="#2A1F5C" cam={{ transform: `translate(${sh.x}px, ${sh.y}px) rotate(${sh.r}deg)` }}>
      <div style={{ position: "absolute", inset: 0, transformOrigin: `${fx}px ${fy}px`, transform: `scale(${zoom})` }}>
        {/* the hero's half: Gomlin purple */}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(${pick(ratio, 120, 125, 160)}deg, #3A2E8F, ${PURPLE} 60%, #8B7FF6)` }} />
        <SpeedLines w={W} h={H} t={t} mode="parallel" angle={L.angle} color="#C9C3FF" opacity={0.35} count={70} seed="apH" />
        {/* the rival's half: server green and red */}
        <div style={{ position: "absolute", inset: 0, clipPath: L.split, background: "linear-gradient(200deg, #0B2A1E, #0E3B2A 50%, #3A0C10)" }}>
          <SpeedLines w={W} h={H} t={t} mode="parallel" angle={L.angle + 180} color="#5CFFB7" opacity={0.3} count={70} seed="apR" />
        </div>
        <div style={{ position: "absolute", inset: 0, clipPath: L.split, boxShadow: "inset 0 0 0 0 #000", outline: "none" }} />
        <Clip id="rival-stride-v" sec={clipSeconds("rival-stride-v") * (1 - p(t, 0, 8.8))} cx={L.rival.cx} cy={L.rival.cy - 6 * thud} h={L.rival.h} filter="drop-shadow(0 0 22px rgba(92,255,183,.45))" />
        <Aura cx={L.hero.cx} cy={L.hero.cy} rx={L.hero.h * 0.24} ry={L.hero.h * 0.5} t={g} power={0.75 + 0.25 * thud} seed="ap" bolts={10} />
        <Clip id="chad-stride-v" sec={clipSeconds("chad-stride-v") * p(t, 0, 8.8)} cx={L.hero.cx} cy={L.hero.cy - 5 * thud} h={L.hero.h} flip filter="drop-shadow(0 0 26px #8B7FF6)" />
      </div>
      <Katakana text="ゴゴゴゴ" x={L.go.x} y={L.go.y} size={L.kk} t={g} color="#fff" stroke="#B3121A" halo="rgba(0,0,0,.88)" rotate={pick(ratio, 5, -10, 8)} grow={0.75 + 0.07 * steps + 0.06 * thud} seed="go" gap={0.92} />
      <Katakana text="ドドドド" x={L.dodo.x} y={L.dodo.y} size={L.kk} t={g} color="#fff" stroke="#3B2FA8" rotate={pick(ratio, -10, 3, -8)} grow={0.75 + 0.07 * steps + 0.06 * thud} seed="do" gap={0.92} />
      <Balloon text={<>Nani?! ONE hand?!<br />In MY farm?!</>} x={L.bR.x} y={L.bR.y} w={L.bR.w} size={BAL[ratio]} tail={L.bR.tail} appear={r3} shout />
      <Balloon text={<>One hand is generous...<br />Twelve-chan.</>} x={L.bH.x} y={L.bH.y} w={L.bH.w} size={BAL[ratio]} tail={L.bH.tail} appear={h1} />
    </Stage>
  );
}

// ── 6. the scanner reads one number, and the rival laughs ──
function Scanner({ ratio }: AdProps) {
  const { t, g } = useClock("scanner");
  const tl = useTimeline();
  const { width: W, height: H } = useVideo();
  const bal = pick(ratio, { x: 110, y: 90, w: 600, tail: [960, 380] as [number, number] }, { x: 64, y: 64, w: 520, tail: [560, 320] as [number, number] }, { x: 70, y: 240, w: 620, tail: [560, 600] as [number, number] });
  if (t < 1.5) {
    const M = pick(ratio, 2100, 1500, 1560);
    const s = M / 1024;
    const lock = out5(p(t, 0.45, 0.75));
    const lens = (
      <g>
        <rect x="140" y="390" width="640" height="260" fill="#160F33" />
        <image href={cut("chad-walk.png")} x="200" y="405" width="130" height="230" opacity="0.9" />
        <g stroke="#8B7FF6" strokeWidth="6" fill="none">
          <path d={`M${190 + 20 * (1 - lock)} 420 h-20 v30 M${340 - 20 * (1 - lock)} 420 h20 v30 M${190 + 20 * (1 - lock)} 625 h-20 v-30 M${340 - 20 * (1 - lock)} 625 h20 v-30`} />
        </g>
        <text x="440" y="455" fill="#C9C3FF" fontSize="30" fontWeight="800" letterSpacing="2" fontFamily="Noto Sans">FINGERS IN USE:</text>
        <text x="520" y="610" fill="#fff" fontSize="150" fontWeight="900" fontFamily="Noto Sans" opacity={lock}>1</text>
        {lock < 1 ? <text x="520" y="610" fill="#8B7FF6" fontSize="150" fontWeight="900" fontFamily="Noto Sans" opacity={1 - lock}>{Math.floor(random(`scan${Math.floor(t * 20)}`) * 9) + 1}</text> : null}
      </g>
    );
    return (
      <Stage bg="#120B1E" cam={{ transform: `scale(${1 + 0.05 * t})` }}>
        <SpeedLines w={W} h={H} t={t} color="#8B7FF6" opacity={0.25} seed="sc" />
        <Mascot size={M} sweat={p(t, 0, 1.5)} mouth="open" pupils={0.55} lens={lens} lensOpacity={0.95} style={{ position: "absolute", left: W / 2 - 455 * s, top: H * 0.5 - 520 * s }} />
      </Stage>
    );
  }
  const tt = t - 1.5;
  const bounce = Math.abs(Math.sin(tt * 14)) * 22;
  const R = pick(ratio, { cx: 1180, cy: 1150, h: 2200 }, { cx: 600, cy: 1020, h: 1900 }, { cx: 560, cy: 1760, h: 2300 });
  return (
    <Stage bg="#0B2A1E" cam={{ transform: `rotate(${Math.sin(tt * 9) * 1.2}deg)` }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 60% 40%, #1F6B4C, #06140E 70%)" }} />
      <SpeedLines w={W} h={H} t={t} cx={R.cx} cy={H * 0.3} color="#C8FFE6" opacity={0.3} seed="laugh" />
      <Clip id="rival-laugh-v" sec={tt} cx={R.cx} cy={R.cy - bounce * 0.3} h={R.h} rotate={-4} />
      <Katakana text="ハハハハ" x={pick(ratio, 1300, 560, 440)} y={pick(ratio, 760, 760, 1120)} size={pick(ratio, 120, 96, 120)} t={t} color="#fff" stroke="#0B2A1E" rotate={-16} seed="haha" />
      <Balloon text="One finger?! Baka!" x={bal.x} y={bal.y} w={bal.w} size={BAL[ratio]} tail={bal.tail} appear={said(tl, "r4", g)} shout />
    </Stage>
  );
}

// ── 7. one finger ──
function Finger({ ratio }: AdProps) {
  const { t, g } = useClock("finger");
  const tl = useTimeline();
  const { width: W, height: H } = useVideo();
  const F = pick(ratio, { cx: 1060, cy: 610, h: 1120 }, { cx: 560, cy: 640, h: 960 }, { cx: 560, cy: 1345, h: 1180 });
  const z = 1 + 0.08 * t / 3.9;
  // the fingertip sits at about (0.74, 0.30) of the image
  const fx = F.cx + (0.74 - 0.5) * F.h, fy = F.cy + (0.30 - 0.5) * F.h;
  const glint = p(t, 1.1, 1.55);
  const bal = pick(ratio, { x: 110, y: 120, w: 620, tail: [880, 420] as [number, number] }, { x: 64, y: 64, w: 560, tail: [470, 330] as [number, number] }, { x: 70, y: 250, w: 760, tail: [500, 620] as [number, number] });
  return (
    <Stage bg="#0C0718" cam={{ transformOrigin: `${fx}px ${fy}px`, transform: `scale(${z})` }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at ${fx}px ${fy}px, #3A2E8F, #0C0718 60%)` }} />
      <SpeedLines w={W} h={H} t={t} cx={fx} cy={fy} color="#8B7FF6" opacity={0.22} speed={0.3} seed="fi" />
      <Aura cx={F.cx} cy={F.cy + F.h * 0.05} rx={F.h * 0.42} ry={F.h * 0.46} t={t} power={0.35 + 0.65 * p(t, 0.8, 2.5)} seed="fi" bolts={12} />
      <Clip id="chad-finger-v" sec={t} cx={F.cx} cy={F.cy} h={F.h} filter="drop-shadow(0 0 24px rgba(139,127,246,.8))" />
      {glint > 0 && glint < 1 ? (
        <div style={{ position: "absolute", left: fx - 14, top: fy - 14 + glint * F.h * 0.16, width: 28, height: 28, borderRadius: "50%", background: "#fff", boxShadow: "0 0 30px 14px #fff, 0 0 80px 30px #B9B0FF", opacity: Math.sin(glint * Math.PI) }} />
      ) : null}
      <Balloon text="One finger... is all I need." x={bal.x} y={bal.y} w={bal.w} size={BAL[ratio]} tail={bal.tail} appear={said(tl, "h2", g, 30.15)} />
    </Stage>
  );
}

// ── 8. the impact frame, in negative ──
function Impact({ ratio }: AdProps) {
  const { t, f } = useClock("impact");
  const { width: W, height: H } = useVideo();
  const neg = !(f >= 4 && f <= 5) && !(f >= 14 && f <= 15);
  const sh = shake(t, [0], 30, 0.15, "imp");
  const S = pick(ratio, { cx: 1100, cy: 560, h: 1300 }, { cx: 560, cy: 560, h: 1100 }, { cx: 540, cy: 1180, h: 1500 });
  return (
    <Stage bg={neg ? "#fff" : "#120B1E"} cam={{ transform: `translate(${sh.x}px, ${sh.y}px) scale(${1.04 + 0.1 * out5(p(t, 0, 0.8))})` }}>
      <SpeedLines w={W} h={H} t={t} cx={S.cx - S.h * 0.05} cy={S.cy + S.h * 0.1} color={neg ? "#111" : "#8B7FF6"} opacity={0.85} count={120} inner={0.12} seed="imp" />
      <Img src={cut("chad-swipe.png")} cx={S.cx} cy={S.cy} h={S.h} filter={neg ? "grayscale(1) invert(1) contrast(1.6)" : "drop-shadow(0 0 30px #8B7FF6)"} />
      {neg ? <div style={{ position: "absolute", inset: 0, background: PURPLE, mixBlendMode: "screen", opacity: 0.45 }} /> : null}
      <Katakana text="ドン" x={pick(ratio, 150, 70, 120)} y={pick(ratio, 120, 90, 260)} size={pick(ratio, 300, 230, 280)} t={t} color={neg ? "#111" : "#fff"} stroke={neg ? "#fff" : "#3B2FA8"} halo={neg ? "rgba(255,255,255,.75)" : "rgba(0,0,0,.6)"} rotate={-10} grow={0.7 + 0.3 * out5(p(t, 0, 0.2))} seed="don" />
    </Stage>
  );
}

// ── 9. RIGHT... SWIPE! The real move, at normal speed ──
function Swipe({ ratio }: AdProps) {
  const { t, g } = useClock("swipe");
  const tl = useTimeline();
  const { width: W, height: H } = useVideo();
  const sw = tl.words.find((w) => w.track === "h3" && /SWIPE/i.test(w.text));
  const right = tl.words.find((w) => w.track === "h3" && /RIGHT/i.test(w.text));
  const tSwipe = sw ? sw.start + SHIFT : 32.04;
  const tRight = right ? right.start + SHIFT : 31.42;
  const dx = 470 * out3(p(g, tSwipe - 0.65, tSwipe + 0.05));
  const applied = g > tSwipe + 0.02 ? (g - tSwipe - 0.02) / 0.5 : 0;
  const P = pick(ratio, { cx: 560, cy: 610, h: 1240 }, { cx: 330, cy: 600, h: 1080 }, { cx: 540, cy: 1230, h: 1420 });
  const T = pick(ratio, { x: 1000, y: 260, s: 170 }, { x: 600, y: 170, s: 112 }, { x: 70, y: 260, s: 150 });
  const sh = shake(g, [tSwipe], 14, 0.15, "sw");
  const screen = bare(feed(0, 1, dx, applied));
  return (
    <Stage bg="#2A1F5C" cam={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at ${P.cx}px ${P.cy}px, #8B7FF6, #3A2E8F 45%, #120B1E)` }} />
      <SpeedLines w={W} h={H} t={t} mode="parallel" angle={0} color="#fff" opacity={0.25 + 0.4 * p(g, tSwipe - 0.4, tSwipe)} count={80} speed={2} seed="sw" />
      <PhoneStill name="hand-phone" cx={P.cx} cy={P.cy} h={P.h} screen={screen} />
      <div style={{ position: "absolute", left: T.x, top: T.y, lineHeight: 0.95, zIndex: 40 }}>
        <div style={{ fontFamily: '"Dela Gothic One"', fontSize: T.s * 0.55, color: "#22C55E", WebkitTextStroke: `${T.s * 0.05}px #111`, paintOrder: "stroke fill", opacity: p(g, tRight, tRight + 0.1), transform: "skewX(-10deg)" }}>スワイプ</div>
        <div style={{ fontSize: T.s, fontWeight: 900, fontStretch: "70%", fontStyle: "italic", color: "#fff", WebkitTextStroke: `${T.s * 0.045}px #111`, paintOrder: "stroke fill", opacity: p(g, tRight, tRight + 0.08), transform: `scale(${0.8 + 0.2 * out5(p(g, tRight, tRight + 0.2))})`, transformOrigin: "left center" }}>RIGHT...</div>
        <div style={{ fontSize: T.s * 1.25, fontWeight: 900, fontStretch: "70%", fontStyle: "italic", color: "#22C55E", WebkitTextStroke: `${T.s * 0.055}px #111`, paintOrder: "stroke fill", opacity: p(g, tSwipe, tSwipe + 0.06), transform: `scale(${0.6 + 0.4 * outBack(p(g, tSwipe, tSwipe + 0.25))})`, transformOrigin: "left center" }}>SWIPE!</div>
      </div>
    </Stage>
  );
}

// ── 10. the rush: cards off the phone, pills like snow, the farm buried ──
const PILLS = Array.from({ length: 170 }, (_, i) => ({ born: 0.15 + (i / 170) * 3.9 + random(`pb${i}`) * 0.1, x: random(`px${i}`), drift: (random(`pd${i}`) - 0.5) * 0.15, rot: (random(`pr${i}`) - 0.5) * 60, size: 0.75 + random(`ps${i}`) * 0.6 }));
// Where each pill lands: the pile grows where pills fall, in 12 columns, in order of landing.
const LAND = (() => {
  const cols = new Array(12).fill(0);
  return PILLS.map((pl) => {
    const c = Math.min(11, Math.floor((pl.x + pl.drift + 0.075) * 12 / 1.15));
    const h = cols[Math.max(0, c)];
    cols[Math.max(0, c)] += 1;
    return h;
  });
})();

function Rush({ ratio }: AdProps) {
  const { t, g } = useClock("rush");
  const tl = useTimeline();
  const { width: W, height: H } = useVideo();
  const P = pick(ratio, { cx: 330, cy: 640, h: 900 }, { cx: 230, cy: 700, h: 800 }, { cx: 300, cy: 1450, h: 1000 });
  const ctr = pick(ratio, { x: 1340, y: 70, s: 100 }, { x: 600, y: 64, s: 80 }, { x: 560, y: 230, s: 90 });
  const flick = Math.floor(t / 0.22);
  const ft = (t % 0.22) / 0.22;
  const dx = 470 * out3(clamp(ft * 1.6));
  const screen = bare(feed(flick % 5, (flick + 1) % 5, dx, ft > 0.6 ? (ft - 0.6) * 2.5 : 0));
  const pileH = (row: number) => H - 30 - row * pick(ratio, 30, 30, 34);
  const pillFs = pick(ratio, 28, 26, 30);
  const sh = shake(t, Array.from({ length: 20 }, (_, i) => i * 0.22), 6, 0.08, "rush");
  const hand = p(t, 3.0, 3.5);
  const bal = pick(ratio, { x: 1080, y: 330, w: 640, tail: [1420, 760] as [number, number] }, { x: 470, y: 250, w: 560, tail: [520, 640] as [number, number] }, { x: 330, y: 560, w: 680, tail: [760, 1240] as [number, number] });
  return (
    <Stage bg="#06140E" cam={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
      <Farm ratio={ratio} t={t} zoom={1.1} dark={0.35} />
      <SpeedLines w={W} h={H} t={t} mode="parallel" angle={-20} color="#fff" opacity={0.3} count={70} speed={2.5} seed="ru" />
      {/* cards leave the phone and cut across the farm on green arcs, growing to building size */}
      {Array.from({ length: 22 }, (_, i) => {
        const born = 0.1 + i * 0.2;
        const k = (t - born) / 1.1;
        if (k < 0 || k > 1) return null;
        const e = in3(k) * 0.4 + k * 0.6;
        const x = lerp(P.cx, W * (1.1 + random(`cx${i}`) * 0.3), e);
        const y = lerp(P.cy - P.h * 0.1, H * (0.05 + random(`cy${i}`) * 0.6), e) - Math.sin(k * Math.PI) * H * 0.25;
        const sc = lerp(0.3, 2.6 + random(`cs${i}`), e);
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, width: 300, height: 380, transform: `translate(-50%,-50%) rotate(${lerp(-5, 25, k)}deg) scale(${sc})`, filter: `drop-shadow(0 0 18px rgba(34,197,94,.9)) blur(${k * 1.5}px)`, opacity: 1 - p(k, 0.75, 1), zIndex: 20 }}>
            <div className="gomlin-app" style={{ width: 300, height: 380, overflow: "hidden", borderRadius: 10 }} dangerouslySetInnerHTML={{ __html: realCard(JOBS[i % 5]) }} />
            <div style={{ position: "absolute", left: "50%", top: -40, transform: "translateX(-50%)" }} dangerouslySetInnerHTML={{ __html: appliedPill(22) }} />
          </div>
        );
      })}
      {/* the pills fall like snow and pile up */}
      {PILLS.map((pl, i) => {
        if (t < pl.born) return null;
        const up = said(tl, "r5", g) > 0;
        const fall = (t - pl.born) * pick(ratio, 900, 900, 1300);
        const x = (pl.x + pl.drift * Math.min(1, (t - pl.born))) * W * 1.1 - W * 0.05;
        const yLand = pileH(LAND[i]);
        const y = Math.min(-60 + fall, yLand);
        if (up && x > bal.x - 140 && x < bal.x + bal.w + 140 && y > bal.y - 60 && y < bal.y + 330) return null;
        return <div key={i} style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) rotate(${pl.rot}deg) scale(${pl.size})`, zIndex: 25 }} dangerouslySetInnerHTML={{ __html: appliedPill(pillFs) }} />;
      })}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: Math.max(0, (H - pileH(Math.floor(p(t, 0.8, 4.4) * 9)))), background: "linear-gradient(180deg, rgba(255,255,255,0), #F4F5F9 40%)", zIndex: 24 }} />
      {/* the phone, with afterimage thumbs */}
      {[3, 2, 1].map((n) => (
        <div key={n} style={{ position: "absolute", inset: 0, opacity: 0.18, transform: `translateX(${n * 26 * Math.sin(t * 40 + n)}px)`, zIndex: 28 }}>
          <Img src={cut("hand-phone.png")} cx={P.cx} cy={P.cy} h={P.h} filter="brightness(1.6) sepia(1) hue-rotate(210deg) saturate(3)" />
        </div>
      ))}
      <div style={{ position: "absolute", inset: 0, zIndex: 30 }}>
        <Aura cx={P.cx} cy={P.cy} rx={P.h * 0.3} ry={P.h * 0.5} t={t} power={0.6} seed="rush" bolts={7} />
        <PhoneStill name="hand-phone" cx={P.cx} cy={P.cy} h={P.h} screen={screen} />
      </div>
      <div style={{ position: "absolute", inset: 0, zIndex: 35 }}>
        <Counter value={3907 + Math.floor(t * 211)} x={ctr.x} y={ctr.y} size={ctr.s} glitch={p(t, 0.9, 3.4) * 2.2} t={t} />
      </div>
      {/* the Gomlin character's lenses fill with pills */}
      {t > 2.2 && t < 3.3 ? (
        <div style={{ position: "absolute", left: pick(ratio, 720, 600, 560), top: pick(ratio, 560, 580, 1080), width: pick(ratio, 440, 400, 440), height: pick(ratio, 440, 400, 440), borderRadius: 30, overflow: "hidden", border: "8px solid #111", background: "#1A0F2A", zIndex: 45, transform: `scale(${outBack(p(t, 2.2, 2.4)) * (1 - p(t, 3.15, 3.3))})` }}>
          <Mascot size={pick(ratio, 640, 580, 640)} mouth="open" pupils={0.5} sweat={0.6} lensOpacity={1} style={{ position: "absolute", left: pick(ratio, -125, -110, -125), top: pick(ratio, -115, -105, -115) }}
            lens={<g><rect x="140" y="390" width="640" height="260" fill="#fff" />{Array.from({ length: 26 }, (_, i) => <rect key={i} x={150 + (i % 6) * 104 + (Math.floor(i / 6) % 2) * 40} y={400 + Math.floor(i / 6) * 52} width="92" height="36" rx="18" fill="#fff" stroke="#8B7FF6" strokeWidth="5" />)}</g>} />
        </div>
      ) : null}
      {/* one tired hand above the pile, graded to sit with the painted stills */}
      {hand > 0 ? <Img src={cut("rival-defeat.png")} cx={pick(ratio, 1500, 830, 820)} cy={lerp(H + 200, H - pick(ratio, 260, 250, 380), out3(hand))} h={pick(ratio, 520, 440, 560)} filter="saturate(.72) sepia(.22) hue-rotate(-8deg) brightness(.88) contrast(1.12) drop-shadow(0 10px 20px rgba(0,0,0,.4))" style={{ zIndex: 26 }} /> : null}
      <Balloon text="M-masaka... my counter can't keep up!" x={bal.x} y={bal.y} w={bal.w} size={BAL[ratio]} tail={bal.tail} appear={said(tl, "r5", g)} shout />
    </Stage>
  );
}

// ── 11. he blows on his fingertip; the streak floats by ──
function Blow({ ratio }: AdProps) {
  const { t, g } = useClock("blow");
  const tl = useTimeline();
  const { width: W, height: H } = useVideo();
  const B = pick(ratio, { cx: 1180, cy: 600, h: 1040 }, { cx: 600, cy: 640, h: 900 }, { cx: 540, cy: 1360, h: 1150 });
  const k = inOut(p(t, 0.2, 2.5));
  const st = pick(ratio, { x0: 1900, x1: 640, y: 760 }, { x0: 1100, x1: 380, y: 860 }, { x0: 1100, x1: 220, y: 1440 });
  const bal = pick(ratio, { x: 110, y: 110, w: 620, tail: [900, 420] as [number, number] }, { x: 64, y: 64, w: 560, tail: [500, 360] as [number, number] }, { x: 70, y: 240, w: 760, tail: [520, 640] as [number, number] });
  return (
    <Stage bg="#2A1F5C" cam={{ transform: `scale(${1.02 + 0.04 * t / 2.6})` }}>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, #3A2E8F, ${PURPLE} 55%, #8B7FF6)` }} />
      <SpeedLines w={W} h={H} t={t} mode="parallel" angle={-70} color="#fff" opacity={0.18} count={50} speed={0.4} seed="bl" />
      <Clip id="chad-blow-v" sec={t * 1.1} cx={B.cx} cy={B.cy} h={B.h} filter="drop-shadow(0 0 24px rgba(20,10,40,.5))" />
      <div style={{ position: "absolute", left: lerp(st.x0, st.x1, k), top: st.y, transform: `scale(${pick(ratio, 1.8, 1.8, 1.9)}) rotate(${-4 + 4 * k}deg)`, transformOrigin: "0 0", zIndex: 30 }} dangerouslySetInnerHTML={{ __html: streak(3, 0.6) }} />
      <Balloon text="Mine fits in a pocket, Twelve-kun." x={bal.x} y={bal.y} w={bal.w} size={BAL[ratio]} tail={bal.tail} appear={said(tl, "h4", g)} />
    </Stage>
  );
}

// ── 12. the true line: what the swipe sends ──
function TrueLine({ ratio }: AdProps) {
  const { t, g } = useClock("trueline");
  const tl = useTimeline();
  const { width: W, height: H } = useVideo();
  const words = tl.words.filter((w) => w.track === "n3");
  const at = (i: number, fallback: number) => (words[i] ? words[i].start + SHIFT : fallback);
  const four = ["Name,", "email,", "phone,", "resume."];
  const S = pick(ratio, { x: 140, y: 150, s: 120, gap: 140 }, { x: 70, y: 90, s: 96, gap: 110 }, { x: 90, y: 260, s: 128, gap: 140 });
  const tOne = at(4, 44.3), tSwipe = at(5, 45.46);
  const C = pick(ratio, { cx: 1340, cy: 560, s: 1.35 }, { cx: 820, cy: 690, s: 0.95 }, { cx: 640, cy: 1340, s: 1.1 });
  const dx = 520 * out3(p(g, tSwipe - 0.55, tSwipe + 0.1));
  const one = pick(ratio, { x: 140, y: 760, s: 150 }, { x: 70, y: 620, s: 104 }, { x: 90, y: 860, s: 150 });
  const flood = p(t, 0, 3.5);
  return (
    <Stage bg="#120B1E">
      <Farm ratio={ratio} t={t} zoom={1.12} dark={0.55} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${flood * 100}%`, background: `linear-gradient(0deg, ${PURPLE}, #7A74EA)` }} />
      <SpeedLines w={W} h={H} t={t} mode="parallel" angle={-90} color="#fff" opacity={0.2 * flood} count={40} speed={0.5} seed="tl" />
      {four.map((w, i) => {
        const a = at(i, 40.47 + i * 0.9);
        const k = p(g, a - 0.04, a + 0.16);
        if (k <= 0) return null;
        return (
          <div key={w} style={{ position: "absolute", left: S.x, top: S.y + i * S.gap, fontSize: S.s, fontWeight: 900, fontStretch: "75%", lineHeight: 1, color: "#fff", WebkitTextStroke: `${S.s * 0.03}px #171923`, paintOrder: "stroke fill", textShadow: "6px 6px 0 #171923", transform: `translateX(${(1 - out5(k)) * -80}px) scale(${0.85 + 0.15 * out5(k)})`, transformOrigin: "left center", opacity: clamp(k * 2) }}>{w}</div>
        );
      })}
      {g > tOne - 0.3 ? (
        <div style={{ position: "absolute", left: C.cx, top: C.cy, transform: `translate(-50%,-50%) scale(${C.s * outBack(p(g, tOne - 0.3, tOne + 0.1))})`, zIndex: 10 }}>
          <div style={{ position: "relative", width: 360, height: 470, transform: `translateX(${dx}px) rotate(${(dx / 390) * 25}deg)`, opacity: 1 - p(dx, 380, 520) }}>
            <div className="gomlin-app" style={{ width: 360, height: 470, overflow: "hidden", borderRadius: 10 }} dangerouslySetInnerHTML={{ __html: realCard(JOBS[0]) }} />
          </div>
          {g > tSwipe + 0.05 ? <div style={{ position: "absolute", left: "50%", top: -20, transform: `translateX(-50%) scale(${2 * outBack(p(g, tSwipe + 0.05, tSwipe + 0.3))})` }} dangerouslySetInnerHTML={{ __html: appliedPill(22) }} /> : null}
        </div>
      ) : null}
      <div style={{ position: "absolute", left: one.x, top: one.y, fontSize: one.s, fontWeight: 900, fontStretch: "70%", fontStyle: "italic", lineHeight: 1, color: "#fff", WebkitTextStroke: `${one.s * 0.04}px #171923`, paintOrder: "stroke fill", textShadow: "6px 6px 0 #171923", zIndex: 20, whiteSpace: "nowrap", borderBottom: `${one.s * 0.09}px solid rgba(34,197,94,${p(g, tSwipe, tSwipe + 0.1)})`, paddingBottom: one.s * 0.06 }}>
        <span style={{ opacity: p(g, tOne, tOne + 0.1) }}>One </span>
        <span style={{ display: "inline-block", opacity: p(g, tSwipe, tSwipe + 0.08), transform: `scale(${0.6 + 0.4 * outBack(p(g, tSwipe, tSwipe + 0.25))})`, transformOrigin: "left center" }}>swipe.</span>
      </div>
    </Stage>
  );
}

// ── 13. the end card: the banner big on purple ──
function End({ ratio }: AdProps) {
  const { t } = useClock("end");
  const { width: W, height: H } = useVideo();
  const L = pick(ratio,
    { banner: { x: 140, y: 170, w: 860 }, line: { x: 150, y: 600, s: 96 }, stores: { x: 150, y: 850, s: 1.3, dir: "row" }, m: { s: 760, x: 1240, y: 380 } },
    { banner: { x: 120, y: 90, w: 680 }, line: { x: 120, y: 470, s: 80 }, stores: { x: 120, y: 650, s: 1.25, dir: "row" }, m: { s: 420, x: 760, y: 780 } },
    { banner: { x: 110, y: 330, w: 860 }, line: { x: 110, y: 820, s: 104 }, stores: { x: 110, y: 1130, s: 1.4, dir: "column" }, m: { s: 560, x: 620, y: 1500 } });
  const k = out5(p(t, 0, 0.45));
  const peek = outBack(p(t, 0.5, 1.0));
  return (
    <Stage bg={PURPLE}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 30% 30%, #7A74EA, ${PURPLE} 55%, #544BD0)` }} />
      <SpeedLines w={W} h={H} t={t} mode="parallel" angle={-30} color="#fff" opacity={0.08} count={30} speed={0.3} seed="end" />
      <Mascot size={L.m.s} mouth="smile" style={{ position: "absolute", left: L.m.x, top: L.m.y + (1 - peek) * L.m.s * 0.6, transform: "rotate(-12deg)" }} />
      <img src={banner} alt="Gomlin" style={{ position: "absolute", left: L.banner.x, top: L.banner.y, width: L.banner.w, transform: `scale(${0.9 + 0.1 * k})`, transformOrigin: "left top", opacity: k }} />
      <div style={{ position: "absolute", left: L.line.x, top: L.line.y, fontSize: L.line.s, fontWeight: 900, fontStretch: "75%", lineHeight: 1.02, color: "#fff", opacity: p(t, 0.15, 0.4), transform: `translateY(${(1 - out5(p(t, 0.15, 0.6))) * 30}px)` }}>
        ONE FINGER.<br />ONE SWIPE.
      </div>
      <div style={{ position: "absolute", left: L.stores.x, top: L.stores.y, display: "flex", flexDirection: L.stores.dir as "row" | "column", gap: 22, opacity: p(t, 0.35, 0.6) }}>
        <span dangerouslySetInnerHTML={{ __html: store("play", "Google Play", L.stores.s) }} />
        <span dangerouslySetInnerHTML={{ __html: store("apple", "App Store", L.stores.s) }} />
      </div>
    </Stage>
  );
}

/** The cover: purple, the banner big, one raised finger against twelve arms. */
export function Thumb({ ratio }: AdProps) {
  const { width: W, height: H } = useVideo();
  const L = pick(ratio,
    { banner: { x: 90, y: 90, w: 560 }, words: { x: 90, y: 560, s: 120 }, rival: { cx: 1420, cy: 560, h: 1150 }, hero: { cx: 1120, cy: 640, h: 1000 } },
    { banner: { x: 60, y: 60, w: 460 }, words: { x: 60, y: 760, s: 100 }, rival: { cx: 780, cy: 470, h: 900 }, hero: { cx: 640, cy: 650, h: 880 } },
    { banner: { x: 270, y: 420, w: 540 }, words: { x: 150, y: 680, s: 120 }, rival: { cx: 680, cy: 900, h: 1300 }, hero: { cx: 560, cy: 1350, h: 1180 } });
  return (
    <Stage bg={PURPLE}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at 60% 45%, #8B7FF6, ${PURPLE} 50%, #3A2E8F)` }} />
      <SpeedLines w={W} h={H} t={0} cx={L.hero.cx} cy={L.hero.cy} color="#fff" opacity={0.2} seed="th" />
      <Img src={cut("rival-stride.png")} cx={L.rival.cx} cy={L.rival.cy} h={L.rival.h} filter="brightness(.25) saturate(0) drop-shadow(0 0 20px rgba(0,0,0,.4))" opacity={0.85} />
      <Aura cx={L.hero.cx} cy={L.hero.cy} rx={L.hero.h * 0.4} ry={L.hero.h * 0.44} t={0} power={1} seed="th" bolts={12} />
      <Img src={cut("chad-finger.png")} cx={L.hero.cx} cy={L.hero.cy} h={L.hero.h} />
      <img src={banner} alt="Gomlin" style={{ position: "absolute", left: L.banner.x, top: L.banner.y, width: L.banner.w }} />
      <div style={{ position: "absolute", left: L.words.x, top: L.words.y, fontSize: L.words.s, fontWeight: 900, fontStretch: "70%", lineHeight: 0.98, color: "#fff", WebkitTextStroke: `${L.words.s * 0.035}px #171923`, paintOrder: "stroke fill", textShadow: "6px 6px 0 #171923" }}>
        12 ARMS<br /><span style={{ color: "#22C55E" }}>vs 1 FINGER</span>
      </div>
    </Stage>
  );
}

export const scenes: Scene[] = [
  { id: "farm", name: "The farm: twelve arms", component: FarmScene, frames: LEN.farm },
  { id: "frenzy", name: "The frenzy, and a gulp", component: Frenzy, frames: LEN.frenzy },
  { id: "door", name: "The door: he walks in", component: Door, frames: LEN.door },
  { id: "approach", name: "The menacing approach", component: Approach, frames: LEN.approach },
  { id: "scanner", name: "Fingers in use: 1", component: Scanner, frames: LEN.scanner },
  { id: "finger", name: "One finger", component: Finger, frames: LEN.finger },
  { id: "impact", name: "The impact frame", component: Impact, frames: LEN.impact },
  { id: "swipe", name: "RIGHT... SWIPE!", component: Swipe, frames: LEN.swipe },
  { id: "rush", name: "The rush", component: Rush, frames: LEN.rush },
  { id: "blow", name: "Mine fits in a pocket", component: Blow, frames: LEN.blow },
  { id: "trueline", name: "Name, email, phone, resume. One swipe.", component: TrueLine, frames: LEN.trueline },
  { id: "end", name: "The end card", component: End, frames: LEN.end },
];
