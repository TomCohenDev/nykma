import type { CSSProperties, ReactNode } from "react";
import { asset, useFrame } from "../../engine";
import { easings, prog } from "../../parts/time";
import { SIM_CARD_HEADER, SIM_H, SIM_W, SimCard, type SimState } from "./sim";
import { ACCENT, PRIMARY, SLUG, Wordmark } from "./world";

/**
 * The app's own UI in screen pixels, at `ui` video pixels to one app pixel. From mathbooklm-website/src:
 * SelectionActionBar.tsx and styles.css (the split Solve and Explain buttons, their menu with the ✓ and "Remembered
 * for next time", the bar's 8/14 padding, Arial 13 px as measured live), the "Writing … on the canvas" pill
 * (.canvas-write-status), and the chat panel as the spring ad rebuilt it from the live app.
 */

const ARIAL = '"Arimo", Arial, sans-serif';

function Pencil({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flex: "none", opacity: 0.7 }}>
      <path d="M11.2 2.3a1.5 1.5 0 0 1 2.1 0l.4.4a1.5 1.5 0 0 1 0 2.1L6 12.5l-3.2.8.8-3.2 7.6-7.8Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function Bubble({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flex: "none", opacity: 0.7 }}>
      <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function Chevron({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10">
      <path d="M2 3.8 5 6.6l3-2.8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The bar's segments in app pixels: the split ones are 14 + icon 13 + 6 + label + 6, then the 20 px chevron. */
const SEGS = [
  { label: "Solve", w: 72, more: 20 },
  { label: "Explain", w: 83, more: 20 },
  { label: "Ask", w: 50 },
  { label: "Pin", w: 47 },
  { label: "Reference", w: 90 },
  { label: "Calc", w: 55 },
  { label: "Cut", w: 49 },
  { label: "Copy", w: 59 },
  { label: "More", w: 58 },
] as const;
export const BAR_W = SEGS.reduce((a, s) => a + s.w + ("more" in s ? s.more : 0), 0) + SEGS.length - 1;
export const BAR_H = 33;
/** A segment's x range in app pixels: its main button, and its chevron if it has one. */
export function segAt(label: "Solve" | "Explain") {
  let x = 0;
  for (const s of SEGS) {
    const more = "more" in s ? s.more : 0;
    if (s.label === label) return { main: [x, x + s.w] as const, more: [x + s.w, x + s.w + more] as const };
    x += s.w + more + 1;
  }
  throw new Error(label);
}

export type BarState = { loading?: "Solve" | "Explain"; loadingFrom?: number; hot?: "Solve" | "Explain" | "SolveMore" };

export function SelectionBar({ left, top, ui, appear, st }: { left: number; top: number; ui: number; appear: number; st: BarState }) {
  const g = useFrame();
  const pop = easings.outBack(prog(g, [appear, appear + 7], easings.linear));
  return (
    <div dir="ltr" style={{ position: "absolute", left, top, height: BAR_H * ui, opacity: prog(g, [appear, appear + 3], easings.linear), transform: `translateY(${(1 - pop) * 10}px)`, filter: "drop-shadow(0 2px 8px rgba(0,0,0,.12))" }}>
      <div style={{ display: "flex", height: "100%", background: "#fff", border: `${ui}px solid rgba(0,0,0,.08)`, borderRadius: 10 * ui, overflow: "hidden", fontFamily: ARIAL, fontSize: 13 * ui, fontWeight: 500, color: "#1a1a1a", boxSizing: "border-box" }}>
        {SEGS.map((s, i) => {
          const split = "more" in s;
          const loading = st.loading === s.label && g >= (st.loadingFrom ?? 0);
          return (
            <div key={s.label} style={{ display: "flex", alignItems: "stretch" }}>
              {i > 0 && <span style={{ width: ui, margin: `${6 * ui}px 0`, background: "rgba(0,0,0,.1)" }} />}
              <div style={{ width: s.w * ui, display: "flex", alignItems: "center", justifyContent: split ? "flex-start" : "center", gap: 6 * ui, paddingLeft: split ? 14 * ui : 0, boxSizing: "border-box", background: st.hot === s.label ? "rgba(0,0,0,.05)" : "transparent" }}>
                {split && (loading ? <span style={{ width: 12 * ui, height: 12 * ui, flex: "none", borderRadius: "50%", border: `${1.5 * ui}px solid rgba(0,0,0,.15)`, borderTopColor: PRIMARY, boxSizing: "border-box", transform: `rotate(${(g - (st.loadingFrom ?? 0)) * 26}deg)` }} /> : <Pencil size={13 * ui} />)}
                {s.label}
              </div>
              {split && (
                <div style={{ width: s.more * ui, display: "flex", alignItems: "center", paddingLeft: 3 * ui, boxSizing: "border-box", opacity: st.hot === "SolveMore" && s.label === "Solve" ? 1 : 0.55, background: st.hot === "SolveMore" && s.label === "Solve" ? "rgba(0,0,0,.05)" : "transparent" }}>
                  <Chevron size={10 * ui} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The target menu under the Solve chevron. `hover` 0 is "on canvas", 1 "in chat". */
export function TargetMenu({ left, top, ui, appear, hover }: { left: number; top: number; ui: number; appear: number; hover?: number }) {
  const g = useFrame();
  const k = easings.outCubic(prog(g, [appear, appear + 5], easings.linear));
  const item = (i: number, icon: ReactNode, text: string, current: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 * ui, padding: `${8 * ui}px ${10 * ui}px`, borderRadius: 7 * ui, background: hover === i ? "rgba(0,0,0,.05)" : "transparent", fontSize: 13 * ui, fontWeight: 500, color: "#1a1a1a" }}>
      {icon}
      <span style={{ flex: 1, whiteSpace: "nowrap" }}>{text}</span>
      <span style={{ width: 12 * ui, color: "#1971c2" }}>{current ? "✓" : ""}</span>
    </div>
  );
  return (
    <div dir="ltr" style={{ position: "absolute", left, top, minWidth: 180 * ui, padding: 4 * ui, background: "#fff", border: `${ui}px solid rgba(0,0,0,.08)`, borderRadius: 10 * ui, fontFamily: ARIAL, opacity: k, transform: `translateY(${(1 - k) * -6}px)`, filter: "drop-shadow(0 2px 8px rgba(0,0,0,.12))", display: "flex", flexDirection: "column" }}>
      {item(0, <Pencil size={13 * ui} />, "Solve on canvas", true)}
      {item(1, <Bubble size={13 * ui} />, "Solve in chat", false)}
      <span style={{ fontSize: 11 * ui, color: "rgba(0,0,0,.45)", padding: `${4 * ui}px ${10 * ui}px` }}>Remembered for next time</span>
    </div>
  );
}

/** The "Writing … on the canvas…" pill with Stop, top centre. */
export function WritePill({ text, from, until, ui, top, w }: { text: string; from: number; until: number; ui: number; top: number; w: number }) {
  const g = useFrame();
  if (g < from || g > until + 6) return null;
  const k = easings.outCubic(prog(g, [from, from + 6], easings.linear)) * (1 - prog(g, [until, until + 6], easings.linear));
  return (
    <div style={{ position: "absolute", left: w / 2, top, transform: `translate(-50%, ${(1 - k) * -8}px)`, opacity: k, display: "inline-flex", alignItems: "center", gap: 10 * ui, padding: `${7 * ui}px ${8 * ui}px ${7 * ui}px ${14 * ui}px`, borderRadius: 999, background: "#fff", color: "#1a1a1a", border: `${ui}px solid rgba(0,0,0,.08)`, fontFamily: '"Nunito", sans-serif', fontWeight: 500, fontSize: 13 * ui, filter: "drop-shadow(0 2px 8px rgba(0,0,0,.12))", whiteSpace: "nowrap" }}>
      <span style={{ width: 12 * ui, height: 12 * ui, borderRadius: "50%", border: `${1.5 * ui}px solid rgba(0,0,0,.15)`, borderTopColor: PRIMARY, boxSizing: "border-box", transform: `rotate(${(g - from) * 24}deg)` }} />
      {text}
      <span style={{ background: "rgba(0,0,0,.06)", padding: `${4 * ui}px ${10 * ui}px`, borderRadius: 999 }}>Stop</span>
    </div>
  );
}

/** A drag rectangle, then the dashed selection with its handles, in screen pixels. */
export function Selection({ x, y, w, h, ui, drag, until }: { x: number; y: number; w: number; h: number; ui: number; drag: readonly [number, number]; until: number }) {
  const g = useFrame();
  if (g < drag[0] || g >= until) return null;
  const box = (bx: number, by: number, bw: number, bh: number): CSSProperties => ({ position: "absolute", left: bx, top: by, width: bw, height: bh, boxSizing: "border-box" });
  if (g < drag[1]) {
    const k = easings.inOutQuad(prog(g, drag, easings.linear));
    return <div style={{ ...box(x, y, w * k, h * k), border: `${1.2 * ui}px solid ${ACCENT}`, background: "rgba(105,101,219,.1)" }} />;
  }
  const hs = 10 * ui;
  return (
    <>
      <div style={{ ...box(x, y, w, h), border: `${ui}px dashed ${ACCENT}` }} />
      {[[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([cx, cy], i) => (
        <div key={i} style={{ ...box(cx - hs / 2, cy - hs / 2, hs, hs), background: "#fff", border: `${ui}px solid ${ACCENT}`, borderRadius: 3 * ui }} />
      ))}
    </>
  );
}

/** The real toolbar and zoom control from the live canvas (brands/mathbooklm/assets/ui). */
export function Chrome({ ui, w, top, zoomBottom }: { ui: number; w: number; top: number; zoomBottom?: number }) {
  const tw = 313 * ui;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <img src={asset(`ads/${SLUG}/toolbar.png`)} alt="" style={{ position: "absolute", left: w / 2 - tw / 2, top, width: tw, borderRadius: 12 * ui, boxShadow: "0 2px 12px rgba(0,0,0,.1)" }} />
      {zoomBottom !== undefined && <img src={asset(`ads/${SLUG}/zoom.png`)} alt="" style={{ position: "absolute", left: 22 * ui, bottom: zoomBottom, width: 202 * ui, borderRadius: 8 * ui }} />}
    </div>
  );
}

// ── the chat panel ───────────────────────────────────────────────────────────

const C = { userBg: "#6366f1", text: "#111827", name: "#6366f1", meta: "#6b7280", border: "#e5e7eb" };
export const PANEL_W = 360;
export const ASK = "Simulate this circuit, with sliders for L, C and R";
const REPLY = "Here's the LC circuit from the lesson. I added a resistor slider, so you can see the damping too.";
const HEADER = 57;
const COMPOSER = 96;
/** The sim card's top in the panel, in app pixels (fixed layout: header, user bubble, name, two lines of reply). */
export const CARD_TOP = HEADER + 12 + 92 + 16 + 20 + 14 + 48 + 8;
export const CARD_W = PANEL_W - 28;

export type ChatState = { typed: number; sent: number; thinkingFrom: number; answer: number; addHot: boolean; sim: SimState; left: number };

export function ChatPanel({ x, h, ui, st }: { x: number; h: number; ui: number; st: ChatState }) {
  const g = useFrame();
  const typed = ASK.slice(0, Math.round(st.typed * ASK.length));
  const sent = g >= st.sent;
  const reveal = (at: number) => easings.outCubic(prog(g, [at, at + 6], easings.linear));
  return (
    <div style={{ position: "absolute", left: x, top: 0, width: PANEL_W * ui, height: h, background: "#fff", borderLeft: `${ui}px solid ${C.border}`, boxShadow: "-8px 0 30px rgba(0,0,0,.06)", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: PANEL_W, height: h / ui, transform: `scale(${ui})`, transformOrigin: "0 0", fontFamily: '"Nunito", sans-serif' }}>
        <div style={{ height: HEADER, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 18px", boxSizing: "border-box" }}>
          <Wordmark size={19} />
        </div>
        <div style={{ position: "absolute", left: 14, right: 14, top: HEADER + 12 }}>
          {sent && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, opacity: reveal(st.sent), height: 92 }}>
              <div style={{ maxWidth: "88%", background: C.userBg, color: "#fff", borderRadius: "18px 4px 18px 18px", padding: "10px 16px 12px", fontSize: 14, lineHeight: 1.5 }}>{ASK}</div>
              <div style={{ fontSize: 11, color: C.meta, paddingRight: 4 }}>10:41 AM</div>
            </div>
          )}
          {g >= st.thinkingFrom && (
            <div style={{ marginTop: 16 }}>
              <div style={{ height: 20, fontSize: 13, fontWeight: 700, color: C.name }}>MathbookLM</div>
              <div style={{ height: 14 }} />
              {g < st.answer ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.meta, fontSize: 14, height: 30 }}>
                  <span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(0,0,0,.12)", borderTopColor: C.name, boxSizing: "border-box", transform: `rotate(${(g - st.thinkingFrom) * 24}deg)` }} />
                  Building the simulation…
                </div>
              ) : (
                <div style={{ opacity: reveal(st.answer) }}>
                  <div style={{ fontSize: 14, lineHeight: 1.6, color: C.text, height: 48, padding: "0 4px" }}>{REPLY}</div>
                  <div style={{ height: 8 }} />
                  <SimCard width={CARD_W} s={st.sim} addHot={st.addHot} />
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, minHeight: COMPOSER - 26, borderRadius: 18, border: `1px solid ${typed && !sent ? "#c7c5f2" : C.border}`, boxSizing: "border-box", padding: "10px 16px", display: "flex", flexDirection: "column", gap: 6, background: "#fff" }}>
          <div style={{ fontSize: 14, color: typed && !sent ? C.text : "#9ca3af", minHeight: 20, lineHeight: 1.4 }}>
            {typed && !sent ? (
              <>
                {typed}
                <span style={{ display: "inline-block", width: 1.5, height: 16, margin: "0 1px", verticalAlign: "-3px", background: C.text }} />
              </>
            ) : (
              "Chat with MathbookLM..."
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.meta }}>{st.left} of 10 AI actions left today</span>
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: typed && !sent ? C.userBg : "#e5e7eb", color: "#fff", display: "grid", placeItems: "center", fontSize: 14 }}>↑</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The card's Add to canvas button, and the card's sim area, in screen pixels for a panel at `x`. */
export const panelPoints = (x: number, ui: number) => ({
  add: { x: x + (14 + CARD_W - 50) * ui, y: (HEADER + 12 + CARD_TOP - HEADER - 12 + SIM_CARD_HEADER / 2) * ui },
  sim: { x: x + 15 * ui, y: (CARD_TOP + SIM_CARD_HEADER) * ui, w: (CARD_W - 2) * ui, h: ((CARD_W - 2) / SIM_W) * SIM_H * ui },
  send: { x: x + (PANEL_W - 14 - 16 - 14) * ui, y: 0 },
});
