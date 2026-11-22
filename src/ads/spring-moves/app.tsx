import katex from "katex";
import "katex/dist/katex.min.css";
import { Fragment, type CSSProperties } from "react";
import { asset, useFrame } from "../../engine";
import { clamp, easings, prog } from "../../parts/time";
import { SIM_H, SIM_W, SimBox, SimCard, thumbAt, type Knob, type SimState } from "./sim";
import { Hand, SLUG, SelectionBar, Wordmark, boxOf, type Place } from "./world";

/**
 * MathbookLM as one world of 1920×1000 app pixels: the canvas on the left and the chat panel (360 wide) on the right,
 * as the live app lays them out. The projection in the second half shows this world, and the full-screen shots film it
 * with a camera. The chat is this ad's exchange, in the app's layout: the selection asked about in Hebrew, the step by
 * step answer the live app gave on 2026-11-06 (queue/2026-11-05-mathbooklm-spring-moves/live/1-steps-he.png), then the simulation.
 * Everything here is a function of the frame and of `t`, the app's own clock for this ad (frames since the desk scene
 * started), so the projection and the full-screen shots show the same moment.
 */
export const APP = { w: 1920, h: 1000 };
export const PANEL = { x: 1560, w: 360, header: 57, composer: 96 };
const MSG_TOP = PANEL.header + 12;
const PAD = 14;
const C = { userBg: "#6366f1", text: "#111827", name: "#6366f1", meta: "#6b7280", border: "#e5e7eb" };
const HE = '"Rubik", "Nunito", sans-serif';

/** The app's clock, in frames from the start of the desk scene. */
export const T = {
  write1: [6, 30] as const,
  write2: [30, 46] as const,
  drag: [50, 58] as const,
  bar: 59,
  ask: 66,
  type1: [70, 94] as const,
  send1: 98,
  answer1: 116,
  /** Add to canvas under the answer, then the answer's box on the canvas. */
  answerAdd: 132,
  boxLand: 134,
  type2: [222, 238] as const,
  send2: 240,
  answer2: 262,
  add: 274,
  land: 280,
  /** Three quick edits under "משנים כל ערך בקלות": k 200 → 800, then m 2 → 5 kg, then x₀ 0.10 → 0.20 m. */
  dragK: [315, 339] as const,
  dragM: [345, 369] as const,
  dragX: [375, 399] as const,
} as const;

export const ASK_TEXT = "תסביר לי שלב אחר שלב";
export const SIM_TEXT = "עכשיו תעשה סימולציה";

// ── the canvas ───────────────────────────────────────────────────────────────

export const B1: Place = { x: 260, base: 236, size: 104 };
export const B2: Place = { x: 260, base: 340, size: 72 };
/** The selection around the two lines, in app pixels. */
export const SEL = (() => {
  const a = boxOf("b1", B1);
  const b = boxOf("b2", B2);
  const pad = 18;
  return { x: Math.min(a.left, b.left) - pad, y: a.top - pad, w: Math.max(a.left + a.width, b.left + b.width) - Math.min(a.left, b.left) + pad * 2, h: b.top + b.height - a.top + pad * 2 };
})();
/**
 * The answer as a box on the canvas, as the app's Add to canvas makes it (canvas/markdownBox.ts, .md-box in
 * styles.css): transparent on the grid, padding 10/14, 15 px text, as tall as its content. The app drops it in the
 * middle of the view; the ad shows it where the teacher would put it, right of the writing, clear of the sim. Laid
 * out at the chat's 14 px and scaled to 15 px, so its steps sit where the chat's do.
 */
export const BOX = { x: 1150, y: 110, s: 15 / 14, w: 360, pad: [10, 14] as const };
/** A block's top in the box, in app pixels. */
export const boxY = (id: string) => BOX.y + (BOX.pad[0] + blockTop(ANSWER, id)) * BOX.s;
/** Where the sim lands on the canvas, under the writing: 1.5 canvas pixels to one of the sim's. */
export const SIMBOX = { x: 240, y: 420, s: 1.5 };
const BAR_W = 541;
export const BAR = { left: SEL.x + SEL.w / 2 - BAR_W / 2, bottom: SEL.y - 10 };
/** The Ask button's middle, in app pixels (the bar's items: Solve 61, Explain 72, Ask 50). */
export const ASK_AT = { x: BAR.left + 61 + 72 + 25, y: BAR.bottom - 16 };

function CanvasGrid() {
  const line = (c: string, dir: "right" | "bottom") => `linear-gradient(to ${dir}, ${c} 1px, transparent 1px)`;
  const fine = "rgba(0,0,0,.045)";
  return (
    <div
      style={{
        position: "absolute",
        left: -2000,
        top: -2000,
        width: PANEL.x + 2000,
        height: APP.h + 4000,
        background: "#fff",
        backgroundImage: [line("#e5e5e5", "right"), line("#e5e5e5", "bottom"), line(fine, "right"), line(fine, "bottom")].join(","),
        backgroundSize: "100px 100px, 100px 100px, 20px 20px, 20px 20px",
      }}
    />
  );
}

function Selection({ t }: { t: number }) {
  if (t < T.drag[0]) return null;
  const box = (x: number, y: number, w: number, h: number): CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h, boxSizing: "border-box" });
  if (t < T.drag[1]) {
    const k = easings.inOutQuad(prog(t, T.drag, easings.linear));
    return <div style={{ ...box(SEL.x, SEL.y, SEL.w * k, SEL.h * k), border: "1.2px solid #6965db", background: "rgba(105,101,219,.1)" }} />;
  }
  const hs = 11;
  return (
    <>
      <div style={{ ...box(SEL.x, SEL.y, SEL.w, SEL.h), border: "1px dashed #6965db" }} />
      {[[SEL.x, SEL.y], [SEL.x + SEL.w, SEL.y], [SEL.x, SEL.y + SEL.h], [SEL.x + SEL.w, SEL.y + SEL.h]].map(([x, y], i) => (
        <div key={i} style={{ ...box(x - hs / 2, y - hs / 2, hs, hs), background: "#fff", border: "1px solid #6965db", borderRadius: 3 }} />
      ))}
    </>
  );
}

/** The answer's box on the canvas, selected after it lands, as the app leaves it. */
function AnswerBox({ t, focus, dim }: { t: number; focus: number; dim: number }) {
  const k = easings.outCubic(prog(t, [T.boxLand, T.boxLand + 6], easings.linear));
  const w = BOX.w * BOX.s;
  const h = (BOX.pad[0] * 2 + ANSWER.reduce((a, b) => a + b.h, 0)) * BOX.s;
  const selected = t < T.type2[0];
  const hs = 10;
  return (
    <div style={{ position: "absolute", left: BOX.x, top: BOX.y, width: w, height: h, opacity: k }}>
      <div dir="rtl" style={{ width: BOX.w, padding: `${BOX.pad[0]}px ${BOX.pad[1]}px`, boxSizing: "border-box", transform: `scale(${BOX.s})`, transformOrigin: "0 0", fontFamily: HE, color: "#1e1e1e" }}>
        {ANSWER.map((b) => (
          <BlockView key={b.id} b={b} dim={focus > 0 && b.step !== focus ? dim : 0} />
        ))}
      </div>
      {selected && (
        <>
          <div style={{ position: "absolute", inset: -4, border: "1px solid #6965db", borderRadius: 2 }} />
          {[[-4, -4], [w + 4, -4], [-4, h + 4], [w + 4, h + 4]].map(([x, y], i) => (
            <div key={i} style={{ position: "absolute", left: x - hs / 2, top: y - hs / 2, width: hs, height: hs, background: "#fff", border: "1px solid #6965db", borderRadius: 3, boxSizing: "border-box" }} />
          ))}
        </>
      )}
    </div>
  );
}

function Canvas({ t, sim, simActive, focus, dim }: { t: number; sim: SimState; simActive: boolean; focus: number; dim: number }) {
  const land = easings.outBack(prog(t, [T.land, T.land + 14], easings.linear));
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: PANEL.x, height: APP.h, overflow: "hidden" }}>
      <CanvasGrid />
      <Hand id="b1" p={B1} write={T.write1} />
      <Hand id="b2" p={B2} write={T.write2} />
      {/* The lasso stays until the answer's box lands: the app then selects the box alone. */}
      {t < T.boxLand && <Selection t={t} />}
      {t >= T.bar && t < T.send1 && <SelectionBar left={BAR.left} bottom={BAR.bottom} ui={1} appear={T.bar} loading={2} loadingFrom={T.ask} loadingUntil={T.ask + 6} caretAt={BAR_W / 2} />}
      {t >= T.boxLand && <AnswerBox t={t} focus={focus} dim={dim} />}
      {t >= T.land && (
        <div style={{ position: "absolute", left: SIMBOX.x, top: SIMBOX.y, transform: `scale(${SIMBOX.s * (0.86 + 0.14 * land)})`, transformOrigin: "0 0", opacity: prog(t, [T.land, T.land + 5], easings.linear) }}>
          <SimBox s={sim} active={simActive} />
        </div>
      )}
      <img src={asset(`ads/${SLUG}/toolbar.png`)} alt="" style={{ position: "absolute", left: PANEL.x / 2 - 156, top: 16, width: 313, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,.1)" }} />
      <img src={asset(`ads/${SLUG}/zoom.png`)} alt="" style={{ position: "absolute", left: 16, bottom: 16, width: 202, borderRadius: 8 }} />
    </div>
  );
}

// ── the chat ─────────────────────────────────────────────────────────────────

/** Text with $…$ maths, set the way the app's chat sets it: KaTeX, left to right inside the Hebrew. */
function Md({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$|\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("$")) {
          const html = katex.renderToString(p.slice(1, -1), { throwOnError: false, output: "html" });
          return <span key={i} dir="ltr" style={{ unicodeBidi: "isolate", display: "inline-block" }} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        if (p.startsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

/** One block of an answer, at a fixed place, so where each step sits is a number and not a measurement. */
type Block = { id: string; h: number; kind?: "p" | "h3" | "hr" | "li"; text?: string; step?: number; n?: number };

/** The answer the live app gave, block by block. Steps 1 to 4 are what the ad walks through. */
export const ANSWER: Block[] = [
  { id: "lead", h: 26, text: "פתרון המשוואה הדיפרנציאלית:" },
  { id: "lead-x", h: 30, text: "$x(t)=0.1\\cos(10t)$" },
  { id: "hr0", h: 18, kind: "hr" },
  { id: "h", h: 28, kind: "h3", text: "שלבי הפתרון:" },
  { id: "s1", h: 50, step: 1, text: "**שלב 1: פישוט המשוואה** נתונה המשוואה: $2x''+200x=0$" },
  { id: "s1b", h: 30, step: 1, text: "נחלק ב-$2$: $x''+100x=0$" },
  { id: "hr1", h: 18, kind: "hr" },
  { id: "s2", h: 98, step: 2, text: "**שלב 2: מציאת הפתרון הכללי בעזרת המשוואה האופיינית** נניח פתרון מהצורה $x(t)=e^{rt}$, ונקבל את המשוואה האופיינית: $r^2+100=0 \\implies r^2=-100 \\implies r=\\pm 10i$" },
  { id: "s2b", h: 76, step: 2, text: "השורשים מדומים טהורים ($\\alpha=0,\\beta=10$), ולכן הפתרון הכללי הוא: $x(t)=C_1\\cos(10t)+C_2\\sin(10t)$" },
  { id: "hr2", h: 18, kind: "hr" },
  { id: "s3", h: 52, step: 3, text: "**שלב 3: גזירת הפונקציה עבור תנאי הנגזרת** $x'(t)=-10C_1\\sin(10t)+10C_2\\cos(10t)$" },
  { id: "hr3", h: 18, kind: "hr" },
  { id: "s4", h: 28, step: 4, text: "**שלב 4: הצבת תנאי ההתחלה**" },
  { id: "s4a", h: 54, step: 4, kind: "li", n: 1, text: "נציב $x(0)=0.1$: $x(0)=C_1\\cos(0)+C_2\\sin(0)=C_1=0.1$" },
  { id: "s4b", h: 76, step: 4, kind: "li", n: 2, text: "נציב $x'(0)=0$: $x'(0)=-10C_1\\sin(0)+10C_2\\cos(0)=10C_2=0 \\implies C_2=0$" },
  { id: "end", h: 52, step: 5, text: "**מסקנה:** הפתרון הפרטי של בעיית ההתחלה הוא: $x(t)=0.1\\cos(10t)$" },
];

/** What the live app wrote above its simulation (the part the ad shows). */
const SIM_NOTE: Block[] = [
  { id: "n1", h: 62, kind: "li", text: "**תדירות זוויתית עצמית:** $\\omega_0=\\sqrt{\\frac{k}{m}}=\\sqrt{\\frac{200}{2}}=10\\,\\text{rad/s}$" },
  { id: "n2", h: 40, kind: "li", text: "**זמן מחזור:** $T=\\frac{2\\pi}{\\omega_0}=\\frac{2\\pi}{10}\\approx 0.628\\,\\text{s}$" },
  { id: "n3", h: 40, kind: "li", text: "**תדר תנודה:** $f=\\frac{1}{T}\\approx 1.59\\,\\text{Hz}$" },
  { id: "n4", h: 28, kind: "h3", text: "על הסימולציה:" },
  { id: "n5", h: 46, text: "ההדמיה מציגה בלוק המחובר לקפיץ על משטח אופקי נטול חיכוך:" },
];

const sum = (bs: Block[]) => bs.reduce((s, b) => s + b.h, 0);
const AI_PAD_TOP = 34; // the name line and the space under it
const ACTIONS = 34;

/** Each block's top, in chat content pixels, from the start of the answer's text. */
export const blockTop = (bs: Block[], id: string) => {
  let y = 0;
  for (const b of bs) {
    if (b.id === id) return y;
    y += b.h;
  }
  return y;
};
export const stepSpan = (n: number) => {
  const bs = ANSWER.filter((b) => b.step === n);
  const top = blockTop(ANSWER, bs[0].id);
  return { top, h: sum(bs) };
};

const USER1_H = 118; // the thumbnail, the text and the time under it
const USER2_H = 70;
const GAP = 16;
export const LAYOUT = (() => {
  const user1 = 0;
  const ai1 = user1 + USER1_H + GAP;
  const ai1Text = ai1 + AI_PAD_TOP;
  const ai1End = ai1Text + sum(ANSWER) + ACTIONS;
  const user2 = ai1End + GAP;
  const ai2 = user2 + USER2_H + GAP;
  const ai2Text = ai2 + AI_PAD_TOP;
  const card = ai2Text + sum(SIM_NOTE) + 8;
  return { user1, ai1, ai1Text, ai1End, user2, ai2, ai2Text, card };
})();
export const CARD_W = PANEL.w - PAD * 2 - 32;

function BlockView({ b, dim }: { b: Block; dim: number }) {
  const base: CSSProperties = { height: b.h, fontSize: 14, lineHeight: 1.6, color: C.text, opacity: 1 - 0.72 * dim };
  if (b.kind === "hr") return <div style={{ height: b.h, display: "flex", alignItems: "center" }}><div style={{ height: 1, width: "100%", background: C.border }} /></div>;
  if (b.kind === "h3") return <div style={{ ...base, fontWeight: 700, fontSize: 15 }}>{b.text}</div>;
  if (b.kind === "li")
    return (
      <div style={{ ...base, display: "flex", gap: 6, paddingRight: 4 }}>
        <span style={{ flex: "none" }}>{b.n ? `${b.n}.` : "•"}</span>
        <span>
          <Md text={b.text!} />
        </span>
      </div>
    );
  return (
    <div style={base}>
      <Md text={b.text!} />
    </div>
  );
}

function UserMsg({ text, thumb, time }: { text: string; thumb?: boolean; time: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div style={{ maxWidth: "92%", background: C.userBg, color: "#fff", borderRadius: "18px 4px 18px 18px", padding: "10px 16px 12px", fontSize: 14, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 8 }}>
        {thumb && (
          <div style={{ alignSelf: "flex-start", borderRadius: 8, border: "1px solid rgba(255,255,255,.28)", background: "rgba(255,255,255,.14)", overflow: "hidden", lineHeight: 0 }}>
            <Thumb />
          </div>
        )}
        <div dir="rtl" style={{ fontFamily: HE }}>{text}</div>
      </div>
      <div style={{ fontSize: 11, color: C.meta, paddingRight: 4 }}>{time}</div>
    </div>
  );
}

/** The selection's preview, as the app attaches it (an image of the lasso, up to 88×56). */
function Thumb() {
  const k = 88 / SEL.w;
  return (
    <div style={{ position: "relative", width: 88, height: SEL.h * k, background: "#fff", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: SEL.w, height: SEL.h, transform: `scale(${k})`, transformOrigin: "0 0" }}>
        <div style={{ position: "absolute", left: -SEL.x, top: -SEL.y }}>
          <Hand id="b1" p={B1} write={[-2, -1]} />
          <Hand id="b2" p={B2} write={[-2, -1]} />
        </div>
      </div>
    </div>
  );
}

function AiName() {
  return <div style={{ height: 20, fontSize: 13, fontWeight: 700, color: C.name, fontFamily: '"Nunito", sans-serif' }}>MathbookLM</div>;
}

function Thinking({ t, from }: { t: number; from: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.meta, fontSize: 14, height: 30, fontFamily: '"Nunito", sans-serif' }}>
      <span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(0,0,0,.12)", borderTopColor: C.name, boxSizing: "border-box", transform: `rotate(${(t - from) * 24}deg)` }} />
      Thinking…
    </div>
  );
}

function Actions() {
  return (
    <div style={{ height: ACTIONS, display: "flex", alignItems: "center", gap: 6, direction: "ltr" }}>
      {["Copy", "Redo", "Add to canvas"].map((label) => (
        <span key={label} style={{ fontSize: 12, fontWeight: 600, color: C.meta, padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: '"Nunito", sans-serif' }}>{label}</span>
      ))}
    </div>
  );
}

/** The panel's chat scrolled by `scroll` content pixels, with step `focus` lit and the others dimmed by `dim`. */
function Chat({ t, scroll, focus, dim, sim, addHot }: { t: number; scroll: number; focus: number; dim: number; sim: SimState; addHot: boolean }) {
  const reveal = (at: number) => easings.outCubic(prog(t, [at, at + 6], easings.linear));
  const at = (y: number, style?: CSSProperties): CSSProperties => ({ position: "absolute", left: PAD, right: PAD, top: y, ...style });
  return (
    <div style={{ position: "absolute", left: 0, top: MSG_TOP, width: PANEL.w, height: APP.h - MSG_TOP - PANEL.composer, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: PANEL.w, transform: `translateY(${-scroll}px)` }}>
        {t >= T.send1 && (
          <div style={at(LAYOUT.user1, { opacity: reveal(T.send1) })}>
            <UserMsg text={ASK_TEXT} thumb time="10:12 AM" />
          </div>
        )}
        {t >= T.send1 + 4 && (
          <div style={at(LAYOUT.ai1)}>
            <AiName />
            <div style={{ height: AI_PAD_TOP - 20 }} />
            {t < T.answer1 ? (
              <Thinking t={t} from={T.send1 + 4} />
            ) : (
              <div dir="rtl" style={{ padding: "0 4px", fontFamily: HE, opacity: reveal(T.answer1) }}>
                {ANSWER.map((b) => (
                  <BlockView key={b.id} b={b} dim={focus > 0 && b.step !== focus ? dim : 0} />
                ))}
                <Actions />
              </div>
            )}
          </div>
        )}
        {t >= T.send2 && (
          <div style={at(LAYOUT.user2, { opacity: reveal(T.send2) })}>
            <UserMsg text={SIM_TEXT} time="10:13 AM" />
          </div>
        )}
        {t >= T.send2 + 4 && (
          <div style={at(LAYOUT.ai2)}>
            <AiName />
            <div style={{ height: AI_PAD_TOP - 20 }} />
            {t < T.answer2 ? (
              <Thinking t={t} from={T.send2 + 4} />
            ) : (
              <div style={{ opacity: reveal(T.answer2) }}>
                <div dir="rtl" style={{ padding: "0 4px", fontFamily: HE }}>
                  {SIM_NOTE.map((b) => (
                    <BlockView key={b.id} b={b} dim={0} />
                  ))}
                </div>
                <div style={{ height: 8 }} />
                <div style={{ paddingLeft: 16 }}>
                  <SimCard width={CARD_W} s={sim} addHot={addHot} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({ t }: { t: number }) {
  const frame = useFrame();
  const typing = (span: readonly [number, number], text: string) => text.slice(0, Math.round(prog(t, span, easings.linear) * text.length));
  const text = t >= T.type1[0] && t < T.send1 ? typing(T.type1, ASK_TEXT) : t >= T.type2[0] && t < T.send2 ? typing(T.type2, SIM_TEXT) : "";
  const thumb = t >= T.ask + 2 && t < T.send1;
  const left = t < T.send1 ? 3 : t < T.send2 ? 2 : 1;
  const active = text.length > 0 || thumb;
  return (
    <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, minHeight: PANEL.composer - 26, borderRadius: 18, border: `1px solid ${active ? "#c7c5f2" : C.border}`, boxSizing: "border-box", padding: "10px 16px", display: "flex", flexDirection: "column", gap: 6, background: "#fff", fontFamily: '"Nunito", sans-serif' }}>
      {thumb && (
        <div style={{ alignSelf: "flex-start", borderRadius: 8, border: "1px solid #e5e7eb", overflow: "hidden", lineHeight: 0 }}>
          <Thumb />
        </div>
      )}
      <div dir={text ? "rtl" : "ltr"} style={{ fontSize: 14, color: text ? C.text : "#9ca3af", fontFamily: text ? HE : undefined, minHeight: 20 }}>
        {text || "Chat with MathbookLM..."}
        {text && <span style={{ display: "inline-block", width: 1.5, height: 16, margin: "0 1px", verticalAlign: "-3px", background: C.text, opacity: Math.floor(frame / 8) % 2 ? 0 : 1 }} />}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: left < 3 ? "#c2410c" : C.meta }}>{left} of 3 AI actions left today</span>
        <span style={{ width: 28, height: 28, borderRadius: "50%", background: active ? C.userBg : "#e5e7eb", color: "#fff", display: "grid", placeItems: "center", fontSize: 14 }}>↑</span>
      </div>
    </div>
  );
}

function Panel(props: { t: number; scroll: number; focus: number; dim: number; sim: SimState; addHot: boolean }) {
  return (
    <div style={{ position: "absolute", left: PANEL.x, top: 0, width: PANEL.w, height: APP.h, background: "#fff", borderLeft: `1px solid ${C.border}`, overflow: "hidden" }}>
      <div style={{ height: PANEL.header, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", boxSizing: "border-box" }}>
        <Wordmark size={19} />
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth={1.6}>
          <rect x={3} y={3} width={18} height={18} rx={2} />
          <path d="M12 3v18M3 12h18M6 7.5h3M16.5 6v3M15 7.5h3M6 16.5h3M15 15.5l3 2M18 15.5l-3 2" />
        </svg>
      </div>
      <Chat {...props} />
      <Composer t={props.t} />
    </div>
  );
}

export type AppState = { t: number; scroll: number; focus: number; dim: number; sim: SimState; simActive: boolean; addHot: boolean };

/** The whole app at app clock `t`, in its own 1920×1000 pixels. */
export function AppWorld(s: AppState) {
  return (
    <div dir="ltr" style={{ position: "absolute", left: 0, top: 0, width: APP.w, height: APP.h, background: "#fff" }}>
      <Canvas t={s.t} sim={s.sim} simActive={s.simActive} focus={s.focus} dim={s.dim} />
      <Panel t={s.t} scroll={s.scroll} focus={s.focus} dim={s.dim} sim={s.sim} addHot={s.addHot} />
    </div>
  );
}

/** A chat content y as an app y, for a scroll. */
export const chatY = (contentY: number, scroll: number) => MSG_TOP + contentY - scroll;
/** The answer's Add to canvas (Copy · Redo · Add to canvas, left to right under it), in app pixels, for a scroll. */
export const answerAddAt = (scroll: number) => ({ x: PANEL.x + PAD + 4 + 50 + 6 + 50 + 6 + 50, y: chatY(LAYOUT.ai1End - ACTIONS / 2, scroll) });
/** The card's Add to canvas in app pixels, for a scroll. */
export const addAt = (scroll: number) => ({ x: PANEL.x + PAD + 16 + 46, y: chatY(LAYOUT.card + 15, scroll) });
export const sendAt = { x: PANEL.x + PANEL.w - 14 - 16 - 14, y: APP.h - 14 - 10 - 14 };
export const composerAt = { x: PANEL.x + PANEL.w - 80, y: APP.h - PANEL.composer + 30 };
/** A slider's thumb on the canvas, in app pixels. */
export const simThumb = (knob: Knob, v: number) => {
  const p = thumbAt(knob, v);
  return { x: SIMBOX.x + p.x * SIMBOX.s, y: SIMBOX.y + p.y * SIMBOX.s };
};
export const SIM_ON_CANVAS = { x: SIMBOX.x, y: SIMBOX.y, w: SIM_W * SIMBOX.s, h: SIM_H * SIMBOX.s };
