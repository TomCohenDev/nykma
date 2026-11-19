import type { CSSProperties } from "react";
import { useFrame } from "../../engine";
import { easings, prog } from "../../parts/time";
import { ACCENT } from "./world";

/**
 * The selection bar as SelectionActionBar.tsx draws it since 2026-11-10: ten buttons, Solve and Explain as split
 * buttons with the pencil ("on canvas") and a chevron, then Simulate and the plain ones. White, Arial 13 px (Arimo has
 * the same metrics), thin dividers, as on the live canvas (assets/live-selection-2026-11-09.png). In app pixels.
 */

const ARIAL = '"Arimo", Arial, sans-serif';

function Pencil({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ flex: "none", opacity: 0.7 }}>
      <path d="M11.2 2.3a1.5 1.5 0 0 1 2.1 0l.4.4a1.5 1.5 0 0 1 0 2.1L6 12.5l-3.2.8.8-3.2 7.6-7.8Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
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

const SEGS = [
  { label: "Solve", w: 72, more: 20 },
  { label: "Explain", w: 83, more: 20 },
  { label: "Simulate", w: 78 },
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

/** Simulate's button, as an x range from the bar's left edge, in app pixels. */
export const SIMULATE_X = (() => {
  let x = 0;
  for (const s of SEGS) {
    const more = "more" in s ? s.more : 0;
    if (s.label === "Simulate") return [x, x + s.w] as const;
    x += s.w + more + 1;
  }
  throw new Error("Simulate");
})();

export function SelectionBar({ left, top, appear, until, hot }: { left: number; top: number; appear: number; until: number; hot?: number }) {
  const g = useFrame();
  if (g < appear || g >= until) return null;
  const pop = easings.outBack(prog(g, [appear, appear + 7], easings.linear));
  const ui = 1;
  return (
    <div dir="ltr" style={{ position: "absolute", left, top, height: BAR_H * ui, opacity: prog(g, [appear, appear + 3], easings.linear), transform: `translateY(${(1 - pop) * 10}px)`, filter: "drop-shadow(0 2px 8px rgba(0,0,0,.12))" }}>
      <div style={{ display: "flex", height: "100%", background: "#fff", border: `${ui}px solid rgba(0,0,0,.08)`, borderRadius: 10 * ui, overflow: "hidden", fontFamily: ARIAL, fontSize: 13 * ui, fontWeight: 500, color: "#1a1a1a", boxSizing: "border-box" }}>
        {SEGS.map((s, i) => {
          const split = "more" in s;
          const isHot = s.label === "Simulate" && hot !== undefined && g >= hot;
          return (
            <div key={s.label} style={{ display: "flex", alignItems: "stretch" }}>
              {i > 0 && <span style={{ width: ui, margin: `${6 * ui}px 0`, background: "rgba(0,0,0,.1)" }} />}
              <div style={{ width: s.w * ui, display: "flex", alignItems: "center", justifyContent: split ? "flex-start" : "center", gap: 6 * ui, paddingLeft: split ? 14 * ui : 0, boxSizing: "border-box", background: isHot ? "rgba(0,0,0,.06)" : "transparent" }}>
                {split && <Pencil size={13 * ui} />}
                {s.label}
              </div>
              {split && (
                <div style={{ width: s.more * ui, display: "flex", alignItems: "center", paddingLeft: 3 * ui, boxSizing: "border-box", opacity: 0.55 }}>
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

/** A drag rectangle that follows the pointer, then the dashed selection with its corner handles. */
export function Selection({ x, y, w, h, drag, until }: { x: number; y: number; w: number; h: number; drag: readonly [number, number]; until: number }) {
  const g = useFrame();
  if (g < drag[0] || g >= until) return null;
  const box = (bx: number, by: number, bw: number, bh: number): CSSProperties => ({ position: "absolute", left: bx, top: by, width: bw, height: bh, boxSizing: "border-box" });
  if (g < drag[1]) {
    const k = easings.inOutQuad(prog(g, drag, easings.linear));
    return <div style={{ ...box(x, y, w * k, h * k), border: `1.2px solid ${ACCENT}`, background: "rgba(105,101,219,.1)" }} />;
  }
  const hs = 10;
  return (
    <>
      <div style={{ ...box(x, y, w, h), border: `1px dashed ${ACCENT}` }} />
      {[[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([cx, cy], i) => (
        <div key={i} style={{ ...box(cx - hs / 2, cy - hs / 2, hs, hs), background: "#fff", border: `1px solid ${ACCENT}`, borderRadius: 3 }} />
      ))}
    </>
  );
}
