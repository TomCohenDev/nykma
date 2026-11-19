import type { CSSProperties, ReactNode } from "react";
import { useFrame } from "../../engine";
import { HandText } from "../../parts/hand";
import { clamp, easings, prog } from "../../parts/time";
import { SIM_ADD_FROM_RIGHT, SIM_CARD_HEADER, SIM_H, SIM_W, SimCard } from "./sim";
import { Wordmark } from "./world";

/**
 * The app's side panel in chat mode, rebuilt from ResultsPanel.tsx, ChatPanel.tsx and the light theme in styles.css.
 * Explain sends "Explain this expression step by step." with the selection (App.tsx); the answer below is written for
 * the ad, not captured from a live run, and the README says so. Every block has a fixed height, so the chat's own
 * scroll-to-bottom is a function of the frame.
 */
const C = {
  bg: "#ffffff",
  userBg: "#6366f1",
  aiText: "#111827",
  aiName: "#6366f1",
  meta: "#6b7280",
  border: "#e5e7eb",
};

const HEADER = 57;
const COMPOSER = 96;
const PAD = 14;

const serif = '"Times New Roman", "Cambria Math", serif';
const italic: CSSProperties = { fontFamily: '"KaTeX_Math", serif', fontStyle: "italic" };

function Frac({ n, d, size }: { n: ReactNode; d: ReactNode; size: number }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", verticalAlign: "middle", margin: "0 0.15em", fontSize: size }}>
      <span style={{ lineHeight: 1.1, padding: "0 0.1em" }}>{n}</span>
      <span style={{ alignSelf: "stretch", height: 1.2, background: "currentColor" }} />
      <span style={{ lineHeight: 1.1, padding: "0 0.1em" }}>{d}</span>
    </span>
  );
}
const F = <span style={italic}>F</span>;

/** Display maths the way KaTeX centres it in a chat bubble. */
function Display({ children, h }: { children: ReactNode; h: number }) {
  return <div style={{ height: h, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: serif, fontSize: 17, gap: 6 }}>{children}</div>;
}

type Block = { h: number; at: number; node: ReactNode; text?: string };

/** The assistant's answer, in order, with when each block streams in (frames after `t0`). */
function answer(): Block[] {
  return [
    { h: 30, at: 0, text: "This is a proportion. Solve it for F.", node: null },
    { h: 28, at: 6, node: <b>1. Simplify the left side</b> },
    { h: 50, at: 10, node: <Display h={50}><Frac n="200" d="4" size={17} /> = 50</Display> },
    { h: 28, at: 16, node: <b>2. So the right side is 50 too</b> },
    { h: 50, at: 20, node: <Display h={50}><Frac n={F} d="100" size={17} /> = 50</Display> },
    { h: 28, at: 26, node: <b>3. Multiply both sides by 100</b> },
    { h: 36, at: 30, node: <Display h={36}>{F} = 50 · 100 = 5000</Display> },
  ];
}

const USER_H = 168;
const NAME_H = 27;
const ACTIONS_H = 34;
const GAP = 20;

/** Frames after `t0` when each part appears. */
export const PANEL_T = { user: 3, thinking: 14, answer: 24, actions: 64 } as const;
/** Frames after the follow-up is sent: "Simulate this press", then the sim card. */
export const FOLLOW_T = { user: 0, thinking: 4, sim: 16, actions: 26 } as const;
export const FOLLOW_TEXT = "Simulate this press";

const USER2_H = 46;
const simCardW = (baseW: number) => baseW - PAD * 2 - 32;
const simCardH = (baseW: number) => SIM_CARD_HEADER + (simCardW(baseW) - 2) * (SIM_H / SIM_W) + 2;

function layout(baseW: number, baseH: number, f: number, g: number) {
  const blocks = answer();
  const shown = blocks.filter((b) => f >= PANEL_T.answer + b.at);
  const thinking = f >= PANEL_T.thinking && f < PANEL_T.answer;
  let contentH = f >= PANEL_T.user ? USER_H + GAP : 0;
  if (f >= PANEL_T.thinking) contentH += NAME_H + 11;
  if (thinking) contentH += 44;
  contentH += shown.reduce((s, b) => s + b.h, 0) + (shown.length ? 14 : 0);
  if (f >= PANEL_T.actions) contentH += ACTIONS_H;
  let simTop = 0;
  if (g >= FOLLOW_T.user) contentH += GAP + USER2_H + GAP;
  if (g >= FOLLOW_T.thinking) contentH += NAME_H + 11;
  if (g >= FOLLOW_T.thinking && g < FOLLOW_T.sim) contentH += 44;
  if (g >= FOLLOW_T.sim) {
    simTop = contentH;
    contentH += simCardH(baseW) + 14;
  }
  if (g >= FOLLOW_T.actions) contentH += ACTIONS_H;
  const avail = baseH - HEADER - COMPOSER - 12;
  // Follow the bottom, but never past the top of the sim card: its header holds "Add to canvas".
  const bottom = Math.max(0, contentH - avail);
  return { blocks, contentH, simTop, scroll: g >= FOLLOW_T.sim ? Math.min(bottom, simTop) : bottom };
}

const smoothScroll = (baseW: number, baseH: number, f: number, g: number) => [0, 1, 2, 3, 4, 5].reduce((s, j) => s + layout(baseW, baseH, f - j, g - j).scroll, 0) / 6;

/** Where things the cursor goes for sit, in the panel's own (unscaled) pixels, at follow-up frame `g`. */
export function panelSpots(baseW: number, baseH: number, g: number) {
  const { simTop } = layout(baseW, baseH, 1e9, Math.max(g, FOLLOW_T.sim));
  const scroll = smoothScroll(baseW, baseH, 1e9, g);
  return {
    composer: { x: 40, y: baseH - COMPOSER + 26 },
    send: { x: baseW - 14 - 16 - 14, y: baseH - 14 - 12 - 14 },
    addSim: { x: PAD + 16 + simCardW(baseW) - SIM_ADD_FROM_RIGHT, y: HEADER + 12 + simTop + 11 + SIM_CARD_HEADER / 2 - scroll },
  };
}

/**
 * The panel at scale `k`: it's laid out at the app's own sizes in a box of `w / k` by `h / k`, then scaled.
 * `t0` is the frame Explain was pressed. `follow` is the frame the follow-up was sent, `typed` what's in the composer.
 */
export function ChatPanelView({ w, h, k, t0, nums, follow = Infinity, typed = "", sim }: { w: number; h: number; k: number; t0: number; nums: { id: string; width: number }; follow?: number; typed?: string; sim?: { f1: number; t: number; addHot: boolean } }) {
  const frame = useFrame();
  const f = frame - t0;
  const g = frame - follow;
  const baseW = w / k;
  const baseH = h / k;
  const { blocks } = layout(baseW, baseH, f, g);
  // The chat scrolls smoothly to the bottom: the average of where it's heading over the last few frames.
  const scroll = smoothScroll(baseW, baseH, f, g);
  const revealG = (at: number) => easings.outCubic(prog(g, [at, at + 6]));
  const reveal = (at: number) => easings.outCubic(prog(f, [at, at + 6]));
  const text = (s: string, at: number) => s.slice(0, Math.round(clamp((f - at) / 10) * s.length));
  const thumbW = 150;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: baseW, height: baseH, transform: `scale(${k})`, transformOrigin: "0 0", background: C.bg, fontFamily: '"Nunito", sans-serif', color: C.aiText, overflow: "hidden", borderLeft: `1px solid ${C.border}` }}>
      <div style={{ height: HEADER, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", boxSizing: "border-box" }}>
        <Wordmark size={19} />
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth={1.6}>
          <rect x={3} y={3} width={18} height={18} rx={2} />
          <path d="M12 3v18M3 12h18M6 7.5h3M16.5 6v3M15 7.5h3M6 16.5h3M15 15.5l3 2M18 15.5l-3 2" />
        </svg>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: HEADER, bottom: COMPOSER, overflow: "hidden" }}>
        <div style={{ padding: `12px ${PAD}px`, transform: `translateY(${-scroll}px)` }}>
          {f >= PANEL_T.user && (
            <div style={{ height: USER_H + GAP, display: "flex", justifyContent: "flex-end", opacity: reveal(PANEL_T.user) }}>
              <div style={{ height: USER_H, maxWidth: "92%", boxSizing: "border-box", background: C.userBg, color: "#fff", borderRadius: "18px 4px 18px 18px", padding: "10px 16px 12px", display: "flex", flexDirection: "column", gap: 8, fontSize: 14, lineHeight: 1.5 }}>
                <div style={{ width: thumbW, height: 50, borderRadius: 8, border: "1px solid rgba(255,255,255,.28)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <HandText id={nums.id} write={[-3, -2]} width={thumbW - 18} color="#1e1e1e" />
                </div>
                <div>Explain this expression step by step.</div>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", fontFamily: serif, fontSize: 17, gap: 4 }}>
                  <Frac n="200" d="4" size={17} /> = <Frac n={F} d="100" size={17} />
                </div>
              </div>
            </div>
          )}
          {f >= PANEL_T.thinking && (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <div style={{ height: NAME_H, display: "flex", alignItems: "center", fontSize: 13, fontWeight: 700, color: C.aiName, letterSpacing: "-0.01em" }}>MathbookLM</div>
              <div style={{ padding: "11px 16px 14px", fontSize: 14, lineHeight: 1.6 }}>
                {f < PANEL_T.answer ? (
                  <div style={{ height: 30, display: "flex", alignItems: "center", gap: 8, color: C.meta }}>
                    <span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(0,0,0,.12)", borderTopColor: C.aiName, boxSizing: "border-box", transform: `rotate(${f * 24}deg)` }} />
                    Thinking…
                  </div>
                ) : (
                  blocks.map((b, i) =>
                    f >= PANEL_T.answer + b.at ? (
                      <div key={i} style={{ height: b.h, display: "flex", alignItems: "center", opacity: reveal(PANEL_T.answer + b.at) }}>
                        {b.text ? text(b.text, PANEL_T.answer + b.at) : b.node}
                      </div>
                    ) : null,
                  )
                )}
              </div>
              {f >= PANEL_T.actions && (
                <div style={{ height: ACTIONS_H, display: "flex", alignItems: "center", gap: 4, paddingLeft: 16, opacity: reveal(PANEL_T.actions) }}>
                  {["Copy", "Redo", "Add to canvas"].map((label) => (
                    <span key={label} style={{ fontSize: 12, fontWeight: 600, color: C.meta, padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.border}` }}>
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {g >= FOLLOW_T.user && (
            <>
              <div style={{ height: GAP }} />
              <div style={{ height: USER2_H + GAP, display: "flex", justifyContent: "flex-end", opacity: revealG(FOLLOW_T.user) }}>
                <div style={{ height: USER2_H, boxSizing: "border-box", background: C.userBg, color: "#fff", borderRadius: "18px 4px 18px 18px", padding: "11px 16px", fontSize: 14, lineHeight: 1.5 }}>{FOLLOW_TEXT}</div>
              </div>
            </>
          )}
          {g >= FOLLOW_T.thinking && (
            <div>
              <div style={{ height: NAME_H, display: "flex", alignItems: "center", fontSize: 13, fontWeight: 700, color: C.aiName }}>MathbookLM</div>
              <div style={{ padding: "11px 16px 14px" }}>
                {g < FOLLOW_T.sim ? (
                  <div style={{ height: 30, display: "flex", alignItems: "center", gap: 8, color: C.meta, fontSize: 14 }}>
                    <span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(0,0,0,.12)", borderTopColor: C.aiName, boxSizing: "border-box", transform: `rotate(${g * 24}deg)` }} />
                    Thinking…
                  </div>
                ) : (
                  <div style={{ opacity: revealG(FOLLOW_T.sim) }}>
                    <SimCard width={simCardW(baseW)} f1={sim?.f1 ?? 200} t={sim?.t ?? 0} addHot={sim?.addHot} />
                  </div>
                )}
              </div>
              {g >= FOLLOW_T.actions && (
                <div style={{ height: ACTIONS_H, display: "flex", alignItems: "center", gap: 4, paddingLeft: 16, opacity: revealG(FOLLOW_T.actions) }}>
                  {["Copy", "Redo", "Add to canvas"].map((label) => (
                    <span key={label} style={{ fontSize: 12, fontWeight: 600, color: C.meta, padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.border}` }}>
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, height: COMPOSER - 26, borderRadius: 18, border: `1px solid ${typed ? "#c7c5f2" : C.border}`, boxSizing: "border-box", padding: "12px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fff" }}>
        <div style={{ fontSize: 14, color: typed ? C.aiText : "#9ca3af" }}>
          {typed || "Chat with MathbookLM..."}
          {typed && <span style={{ display: "inline-block", width: 1.5, height: 16, marginLeft: 1, verticalAlign: "-3px", background: C.aiText, opacity: Math.floor(frame / 8) % 2 ? 0 : 1 }} />}
        </div>
        <div style={{ alignSelf: "flex-end", width: 28, height: 28, borderRadius: "50%", background: typed ? C.userBg : "#f3f4f6", display: "grid", placeItems: "center", color: typed ? "#fff" : "#9ca3af", fontSize: 14 }}>↑</div>
      </div>
    </div>
  );
}

/** The same answer as a Markdown box on the canvas: text and maths only, no card, as the canvas export draws it. */
export function CanvasAnswer({ opacity = 1 }: { opacity?: number }) {
  return (
    <div style={{ width: 360, fontFamily: '"Nunito", sans-serif', fontSize: 14, lineHeight: 1.6, color: "#1e1e1e", opacity }}>
      {answer().map((b, i) => (
        <div key={i} style={{ height: b.h, display: "flex", alignItems: "center" }}>
          {b.text ?? b.node}
        </div>
      ))}
    </div>
  );
}
