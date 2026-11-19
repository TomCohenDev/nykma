import type { CSSProperties, ReactNode } from "react";
import { clamp } from "../../parts/time";

/**
 * A MathbookLM simulation of the hydraulic press. The frame around it is the app's own: the chat's sim card
 * (ChatSimulation.tsx: title, </>, ⤢, Add to canvas) and the canvas box (SimCanvasBox.tsx, laid out at 560×350 and
 * scaled). The runtime's parts match the live captures in mathbooklm-ad/evidence/stop-switching-tabs/: the play bar
 * with time and speed, labelled sliders with value and unit, readout cards with the highlighted one in lavender, and
 * "Question values". The press inside is drawn for this ad, the way a sim asked for it would draw it. The physics
 * is right: p = F₁ / A₁ and F₂ = p · A₂.
 */
export const SIM_W = 560;
export const SIM_H = 350;

const A1 = 4;
const A2 = 100;
const ACCENT = "#6965db";
const RED = "#e03131";
const font = '"Arimo", Arial, sans-serif';

export const simOut = (f1: number) => ({ p: f1 / A1, f2: (f1 / A1) * A2 });

/** Where the Force F₁ slider's thumb sits for a value, in the sim's own 560×350 pixels. */
export const F1_RANGE = [0, 400] as const;
export const sliderAt = (f1: number) => ({ x: 70 + 90 * clamp((f1 - F1_RANGE[0]) / (F1_RANGE[1] - F1_RANGE[0])), y: 287 });

function Slider({ x, y, w, k }: { x: number; y: number; w: number; k: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y - 2, width: w, height: 4, borderRadius: 2, background: "#dcdaf6" }}>
      <div style={{ width: `${k * 100}%`, height: "100%", borderRadius: 2, background: ACCENT }} />
      <div style={{ position: "absolute", left: `calc(${k * 100}% - 6px)`, top: -4, width: 12, height: 12, borderRadius: "50%", background: ACCENT }} />
    </div>
  );
}

function Row({ y, x, label, value, unit, k, w = 90 }: { y: number; x: number; label: string; value: string; unit: string; k: number; w?: number }) {
  const t: CSSProperties = { position: "absolute", top: y - 7, fontSize: 10.5, color: "#555", whiteSpace: "nowrap" };
  return (
    <>
      <span style={{ ...t, left: x }}>{label}</span>
      <Slider x={x + 58} y={y} w={w} k={k} />
      <span style={{ ...t, left: x + 58 + w + 14, color: "#222" }}>{value}</span>
      <span style={{ ...t, left: x + 58 + w + 64 }}>{unit}</span>
    </>
  );
}

function Card({ y, label, value, hot }: { y: number; label: string; value: string; hot?: boolean }) {
  return (
    <div style={{ position: "absolute", left: 360, top: y, width: 180, padding: "6px 8px", borderRadius: 6, background: hot ? "#e5e3fb" : "#efeff2", boxSizing: "border-box" }}>
      <div style={{ fontSize: 8.5, color: hot ? ACCENT : "#666" }}>{label}</div>
      <div style={{ fontSize: hot ? 19 : 15, fontWeight: 700, color: hot ? ACCENT : "#222", marginTop: 1 }}>{value}</div>
    </div>
  );
}

/** The sim's page at 560×350: the press on the left, readouts on the right, controls below. `t` is its clock in seconds. */
export function SimPage({ f1, t }: { f1: number; t: number }) {
  const { p, f2 } = simOut(f1);
  // The load rides up with the output force; the small piston goes down by what the fluid moves.
  const lift = clamp((f2 - 4000) / 4000) * 34 + 2 * Math.sin(t * 3);
  const sink = lift * 0.9;
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US").replace(",", "");
  return (
    <div style={{ position: "relative", width: SIM_W, height: SIM_H, fontFamily: font, color: "#222" }}>
      <svg width={340} height={225} style={{ position: "absolute", left: 4, top: 6 }} fill="none" strokeLinecap="round">
        <path d={`M44 ${102 + sink}H76V190H196V${118 - lift}H276V206H44Z`} fill="#dbe7fb" />
        <path d="M40 70V210H280V96M80 70V186H192V96" stroke="#495057" strokeWidth={2.4} />
        <rect x={43} y={94 + sink} width={34} height={8} fill="#868e96" />
        <rect x={195} y={110 - lift} width={82} height={8} fill="#868e96" />
        <rect x={208} y={78 - lift} width={56} height={32} fill="#fff" stroke="#495057" strokeWidth={1.6} />
        <text x={236} y={98 - lift} fontSize={9} fill="#495057" textAnchor="middle">load</text>
        <path d={`M60 ${30 + sink}V${90 + sink}M54 ${82 + sink}L60 ${91 + sink}L66 ${82 + sink}`} stroke={RED} strokeWidth={2} />
        <text x={70} y={44 + sink} fontSize={9} fill={RED}>F₁ = {fmt(f1)} N</text>
        <path d={`M236 ${74 - lift}V${26 - lift}M230 ${34 - lift}L236 ${25 - lift}L242 ${34 - lift}`} stroke={ACCENT} strokeWidth={2} />
        <text x={246} y={38 - lift} fontSize={9} fill={ACCENT}>F₂ = {fmt(f2)} N</text>
        <text x={44} y={222} fontSize={8.5} fill="#868e96">A₁ = 4 cm²</text>
        <text x={204} y={222} fontSize={8.5} fill="#868e96">A₂ = 100 cm²</text>
      </svg>
      <div style={{ position: "absolute", left: 360, top: 6, fontSize: 8.5, color: "#777" }}>Forces &amp; Pressure</div>
      <Card y={22} label="Output force F₂ = p · A₂" value={`${fmt(f2)} N`} hot />
      <Card y={78} label="Pressure p = F₁ / A₁" value={`${fmt(p)} N/cm²`} />
      <Card y={128} label="Force ratio A₂ / A₁" value="25" />
      <div style={{ position: "absolute", left: 10, top: 240, width: 540, height: 22, display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: "#444" }}>
        <span style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid #ccc", display: "grid", placeItems: "center", fontSize: 8 }}>❚❚</span>
        <span style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid #ccc", display: "grid", placeItems: "center", fontSize: 10 }}>↺</span>
        <span style={{ position: "relative", width: 250, height: 18 }}>
          <Slider x={0} y={9} w={250} k={clamp(t / 10)} />
        </span>
        <span style={{ marginLeft: 6 }}>{t.toFixed(2)} s / 10.00 s</span>
        <span style={{ marginLeft: "auto", border: "1px solid #ccc", borderRadius: 3, padding: "0 6px" }}>1×</span>
      </div>
      <Row y={287} x={12} label="Force F₁" value={fmt(f1)} unit="N" k={(f1 - F1_RANGE[0]) / (F1_RANGE[1] - F1_RANGE[0])} />
      <Row y={287} x={290} label="Area A₁" value="4" unit="cm²" k={0.2} />
      <Row y={311} x={12} label="Area A₂" value="100" unit="cm²" k={0.5} />
      <div style={{ position: "absolute", left: 290, top: 302, fontSize: 10.5, color: "#555", border: "1px solid #d0d0d0", borderRadius: 4, padding: "2px 7px" }}>Question values</div>
    </div>
  );
}

/** The chat's sim card: header, then the page scaled to the card's width. */
export function SimCard({ width, f1, t, addHot }: { width: number; f1: number; t: number; addHot?: boolean }) {
  const s = (width - 2) / SIM_W;
  return (
    <div style={{ width, borderRadius: 10, background: "#f4f4f6", border: "1px solid #e5e7eb", overflow: "hidden", fontFamily: font }}>
      <div style={{ height: 30, display: "flex", alignItems: "center", gap: 10, padding: "0 10px", fontSize: 11.5, color: "#333" }}>
        <span style={{ fontWeight: 700 }}>Hydraulic Press</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: "#888" }}>{"</>"}</span>
        <span style={{ color: "#888" }}>⤢</span>
        <span style={{ color: addHot ? ACCENT : "#888" }}>Add to canvas</span>
      </div>
      <div style={{ width: SIM_W, height: SIM_H, transform: `scale(${s})`, transformOrigin: "0 0", marginBottom: SIM_H * (s - 1) }}>
        <SimPage f1={f1} t={t} />
      </div>
    </div>
  );
}
export const SIM_CARD_HEADER = 30;
/** Where "Add to canvas" sits in the card header, from the card's top-right corner. */
export const SIM_ADD_FROM_RIGHT = 48;

/** The sim as a box on the canvas: transparent, with the accent outline it keeps while active. */
export function SimBox({ f1, t, active, children }: { f1: number; t: number; active: boolean; children?: ReactNode }) {
  return (
    <div style={{ position: "relative", width: SIM_W, height: SIM_H, outline: active ? `1.5px solid ${ACCENT}` : "1px solid rgba(105,101,219,.25)", outlineOffset: 2 }}>
      <SimPage f1={f1} t={t} />
      {children}
    </div>
  );
}
