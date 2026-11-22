import type { CSSProperties, ReactNode } from "react";
import { clamp } from "../../parts/time";

/**
 * The simulation MathbookLM built for "עכשיו תעשה סימולציה" on 2026-11-06 (queue/2026-11-05-mathbooklm-spring-moves/live/), laid
 * out as the live card was: 560×350, the results column on the left because the page is right to left ("מאפייני
 * תנודה": ω = √(k/m), T = 2π/ω, f = 1/T), the stage on the right (a wall, a horizontal spring, the 2 kg block, the
 * F = −kx and v arrows, a live x(t) graph), then the app's own play bar, the Hebrew sliders, "Question values" and the
 * readouts. Each generated sim gets its own slider ranges; this one's run m 0.5 to 6 kg, k 0 to 1000 N/m and x₀ −0.25
 * to 0.25 m, so the ad can take k to 800, m to 5 and x₀ to 0.2. The physics is right: ω = √(k/m), x(t) = x₀ cos ωt,
 * and like the app's runtime the run restarts from t = 0 whenever a slider changes.
 */
export const SIM_W = 560;
export const SIM_H = 350;
export const M_RANGE = [0.5, 6] as const;
export const K_RANGE = [0, 1000] as const;
export const X0_RANGE = [-0.25, 0.25] as const;
export const LOOP_S = 4;
export const SIM_CARD_HEADER = 30;
export const TITLE = "מתנד הרמוני: מסה וקפיץ";

const ACCENT = "#6965db";
const TEAL = "#0ca678";
const RED = "#e03131";
const ORANGE = "#f08c00";
const font = '"Arimo", Arial, sans-serif';
const he = '"Rubik", "Arimo", sans-serif';

/** The sliders' tracks and ranges, in the sim's 560×350 pixels. */
export const TRACKS = {
  m: { x: 393, y: 231, w: 110, range: M_RANGE },
  k: { x: 365, y: 256, w: 110, range: K_RANGE },
  x0: { x: 336, y: 282, w: 110, range: X0_RANGE },
} as const;
export type Knob = keyof typeof TRACKS;
const frac = (knob: Knob, v: number) => clamp((v - TRACKS[knob].range[0]) / (TRACKS[knob].range[1] - TRACKS[knob].range[0]));
/** A slider's thumb at value `v`, in sim pixels. */
export const thumbAt = (knob: Knob, v: number) => ({ x: TRACKS[knob].x + TRACKS[knob].w * frac(knob, v), y: TRACKS[knob].y });

/** A state of the sim: its mass, spring constant and start position, and seconds since its run last (re)started. */
export type SimState = { m: number; k: number; x0: number; t: number; changed: boolean };
export const omega = (s: SimState) => Math.sqrt(s.k / s.m);
export const xAt = (s: SimState) => s.x0 * Math.cos(omega(s) * (s.t % LOOP_S));
export const vAt = (s: SimState) => -s.x0 * omega(s) * Math.sin(omega(s) * (s.t % LOOP_S));

function Slider({ x, y, w, k }: { x: number; y: number; w: number; k: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y - 2, width: w, height: 4, borderRadius: 2, background: "#dcdaf6" }}>
      <div style={{ width: `${k * 100}%`, height: "100%", borderRadius: 2, background: ACCENT }} />
      <div style={{ position: "absolute", left: `calc(${k * 100}% - 6px)`, top: -4, width: 12, height: 12, borderRadius: "50%", background: ACCENT }} />
    </div>
  );
}

/** A slider row, right to left: label at the right, the slider, the value, the unit at the left. */
function Row({ y, right, label, slider, value, unit, k }: { y: number; right: number; label: string; slider: [number, number]; value: string; unit: string; k: number }) {
  const t: CSSProperties = { position: "absolute", top: y - 8, fontSize: 10.5, color: "#555", whiteSpace: "nowrap", fontFamily: he };
  return (
    <>
      <span dir="rtl" style={{ ...t, right: SIM_W - right }}>{label}</span>
      <Slider x={slider[0]} y={y} w={slider[1]} k={k} />
      <span style={{ ...t, left: slider[0] - 62, width: 52, textAlign: "left", color: "#222", fontFamily: font }}>{value}</span>
      <span style={{ ...t, left: slider[0] - 90, fontFamily: font }}>{unit}</span>
    </>
  );
}

function Card({ y, label, value, hot }: { y: number; label: string; value: string; hot?: boolean }) {
  return (
    <div style={{ position: "absolute", left: 23, top: y, width: 165, height: 50, padding: "5px 8px", borderRadius: 6, background: hot ? "#e5e3fb" : "#efeff2", boxSizing: "border-box" }}>
      <div dir="ltr" style={{ fontSize: 8.5, color: hot ? ACCENT : "#666", textAlign: "right" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: hot ? ACCENT : "#222", marginTop: 3 }}>{value}</div>
    </div>
  );
}

/** The mass as the sim's block writes it: "2", "3.5". */
const fmtM = (m: number) => (Math.abs(m - Math.round(m)) < 0.05 ? String(Math.round(m)) : m.toFixed(1));

/** A zigzag spring from x0 to x1 at height y. */
function springPath(x0: number, x1: number, y: number, coils = 9, h = 12) {
  const lead = 6;
  let d = `M${x0} ${y}L${x0 + lead} ${y}`;
  const n = coils * 2;
  for (let i = 1; i < n; i++) d += `L${x0 + lead + ((x1 - x0 - 2 * lead) * i) / n} ${y + (i % 2 ? -h / 2 : h / 2)}`;
  return `${d}L${x1 - lead} ${y}L${x1} ${y}`;
}

/** The sim's page at 560×350. */
export function SpringPage({ s }: { s: SimState }) {
  const w = omega(s);
  const T = (2 * Math.PI) / w;
  const x = xAt(s);
  const v = vAt(s);
  const F = -s.k * x;
  const wall = 222;
  const eq = 380; // x = 0, in sim pixels
  const px = 450; // sim pixels per metre
  // The block grows with its mass, so a heavier one looks heavier.
  const grow = Math.pow(s.m / 2, 0.4);
  const bw = 40 * grow;
  const bh = 30 * grow;
  const left = eq + x * px - bw / 2;
  const ground = 104;
  const tLoop = s.t % LOOP_S;
  // The live x(t) graph: the run so far, from t = 0 at the wall to 4 s at the right.
  // 170 graph pixels per metre: 0.2 m swings 34 px either side.
  const g0 = wall + 6, g1 = 545, gy = 150, gA = 170 * s.x0;
  let trace = "";
  const steps = Math.max(1, Math.round((tLoop / LOOP_S) * 160));
  for (let i = 0; i <= steps; i++) {
    const tt = (tLoop * i) / steps;
    trace += `${i ? "L" : "M"}${(g0 + ((g1 - g0) * tt) / LOOP_S).toFixed(1)} ${(gy - (gA * Math.cos(w * tt))).toFixed(1)}`;
  }
  const dotX = g0 + ((g1 - g0) * tLoop) / LOOP_S;
  const arrow = (from: number, len: number, y: number, color: string) => {
    const to = from + len;
    const dir = Math.sign(len) || 1;
    return (
      <g stroke={color} strokeWidth={2} fill={color}>
        <path d={`M${from} ${y}H${to}`} />
        <path d={`M${to} ${y}l${-6 * dir} -4v8z`} stroke="none" />
      </g>
    );
  };
  return (
    <div dir="ltr" style={{ position: "relative", width: SIM_W, height: SIM_H, fontFamily: font, color: "#222", overflow: "hidden" }}>      {/* results, left */}
      <div style={{ position: "absolute", left: 0, top: 0, width: 197, height: 183, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 4, top: 10, width: 7, height: 64, borderRadius: 4, background: "#8f8f95" }} />
        <div dir="rtl" style={{ position: "absolute", left: 23, top: 8, width: 165, fontSize: 9.5, color: "#777", fontFamily: he }}>מאפייני תנודה</div>
        <Card y={27} label="ω = √(k/m)" value={`${w.toFixed(2)} rad/s`} hot />
        <Card y={83} label="T = 2π/ω" value={`${T.toFixed(3)} s`} />
        <Card y={138} label="f = 1/T" value={`${(1 / T).toFixed(2)} Hz`} />
      </div>
      {/* stage, right */}
      <svg width={SIM_W} height={188} style={{ position: "absolute", left: 0, top: 0 }} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={`M${wall} 22V${ground + 4}`} stroke="#495057" strokeWidth={2} />
        {Array.from({ length: 9 }, (_, i) => <path key={`w${i}`} d={`M${wall} ${28 + i * 9}l-8 8`} stroke="#868e96" strokeWidth={1} />)}
        <path d={`M${wall} ${ground}H548`} stroke="#495057" strokeWidth={2} />
        {Array.from({ length: 30 }, (_, i) => <path key={`g${i}`} d={`M${wall + 6 + i * 11} ${ground + 1}l-7 8`} stroke="#adb5bd" strokeWidth={1} />)}
        <path d={`M${eq} 18V${ground}`} stroke="#adb5bd" strokeWidth={1} strokeDasharray="3 3" />
        <path d={springPath(wall, left, ground - 15)} stroke={ACCENT} strokeWidth={1.8} />
        <rect x={left} y={ground - bh} width={bw} height={bh} fill="#fff" stroke={TEAL} strokeWidth={1.8} />
        {arrow(left + bw / 2, clamp(F * 1.2, -60, 60), 34, RED)}
        {arrow(left + bw / 2, clamp(v * 40, -60, 60), 52, ORANGE)}
        <path d={`M${g0} ${gy}H${g1}`} stroke="#ced4da" strokeWidth={1} />
        <path d={trace} stroke={ACCENT} strokeWidth={1.8} />
        <circle cx={dotX} cy={gy - gA * Math.cos(w * tLoop)} r={3.2} fill={ACCENT} />
      </svg>
      <div style={{ position: "absolute", left: left - 8, top: ground - bh / 2 - 11, width: bw + 16, textAlign: "center", fontSize: 9.5, fontWeight: 700, color: "#222" }}>m = {fmtM(s.m)} kg</div>
      <div dir="rtl" style={{ position: "absolute", left: eq - 60, top: 6, width: 120, textAlign: "center", fontSize: 8.5, color: "#868e96", fontFamily: he }}>
        <bdi dir="ltr">x = 0</bdi> (שיווי משקל)
      </div>
      <div style={{ position: "absolute", left: left + bw / 2 - 40, top: 14, width: 80, textAlign: "center", fontSize: 9, fontWeight: 700, color: RED }}>F = {F.toFixed(1)} N</div>
      <div style={{ position: "absolute", left: left + bw / 2 - 45, top: 40, width: 90, textAlign: "center", fontSize: 9, fontWeight: 700, color: ORANGE }}>v = {v.toFixed(2)} m/s</div>
      <div style={{ position: "absolute", left: 528, top: 160, fontSize: 8.5, color: "#868e96" }}>t [s]</div>
      {/* controls */}
      <div style={{ position: "absolute", left: 10, top: 190, width: 542, height: 26 }}>
        <span style={{ position: "absolute", left: 0, top: 3, width: 55, height: 20, border: "1px solid #ccc", borderRadius: 4, fontSize: 10.5, display: "flex", alignItems: "center", justifyContent: "space-around", boxSizing: "border-box" }}>
          <span>▾</span>
          <span>×1</span>
        </span>
        <span style={{ position: "absolute", left: 61, top: 6, fontSize: 10.5, color: "#666" }}>{tLoop.toFixed(2)} s / {LOOP_S.toFixed(2)} s</span>
        <span style={{ position: "absolute", left: 147, top: 13, width: 323 }}>
          <Slider x={0} y={0} w={323} k={tLoop / LOOP_S} />
        </span>
        <span style={{ position: "absolute", left: 478, top: 0, width: 28, height: 26, borderRadius: 6, border: "1px solid #ddd", display: "grid", placeItems: "center", fontSize: 12, color: "#444" }}>↺</span>
        <span style={{ position: "absolute", left: 512, top: 0, width: 30, height: 26, borderRadius: 6, border: "1px solid #ddd", display: "grid", placeItems: "center", fontSize: 9, color: "#222" }}>❚❚</span>
      </div>
      <Row y={231} right={552} label="מסה m" slider={[TRACKS.m.x, TRACKS.m.w]} value={s.m.toFixed(1)} unit="kg" k={frac("m", s.m)} />
      <Row y={256} right={552} label="קבוע קפיץ k" slider={[TRACKS.k.x, TRACKS.k.w]} value={String(Math.round(s.k))} unit="N/m" k={frac("k", s.k)} />
      <Row y={282} right={552} label="מיקום התחלתי x₀" slider={[TRACKS.x0.x, TRACKS.x0.w]} value={s.x0.toFixed(2)} unit="m" k={frac("x0", s.x0)} />
      <Row y={310} right={552} label="מהירות התחלתית v₀" slider={[318, 110]} value="0.0" unit="m/s" k={0.5} />
      <div style={{ position: "absolute", left: 80, top: 297, width: 109, height: 26, borderRadius: 6, border: "1px solid #e0e0e0", fontSize: 10.5, color: s.changed ? "#333" : "#bbb", display: "grid", placeItems: "center", boxSizing: "border-box" }}>Question values</div>
      <div style={{ position: "absolute", right: 10, top: 330, display: "flex", gap: 14, fontSize: 10, color: "#555", direction: "rtl" }}>
        <bdi dir="ltr">x(t): {(x * 100).toFixed(2)} cm</bdi>
        <bdi dir="ltr">v(t): {v.toFixed(2)} m/s</bdi>
        <bdi dir="ltr">F = -kx: {F.toFixed(1)} N</bdi>
      </div>
    </div>
  );
}

/** The chat's sim card: title on the right (the page is right to left), the app's own icons and Add to canvas. */
export function SimCard({ width, s, addHot }: { width: number; s: SimState; addHot?: boolean }) {
  const k = (width - 2) / SIM_W;
  return (
    <div dir="ltr" style={{ width, borderRadius: 10, background: "#f4f4f6", border: "1px solid #e5e7eb", overflow: "hidden", fontFamily: font }}>
      <div style={{ height: SIM_CARD_HEADER, display: "flex", alignItems: "center", gap: 10, padding: "0 10px", fontSize: 11.5, color: "#333" }}>
        <span style={{ color: addHot ? ACCENT : "#888", border: `1px solid ${addHot ? "#c7c5f2" : "#e5e7eb"}`, borderRadius: 6, padding: "1px 6px", background: addHot ? "#eeedfc" : "transparent" }}>Add to canvas</span>
        <span style={{ color: "#888" }}>⤢</span>
        <span style={{ color: "#888" }}>{"</>"}</span>
        <span dir="rtl" style={{ flex: 1, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: he }}>{TITLE}</span>
      </div>
      <div style={{ width: SIM_W, height: SIM_H, transform: `scale(${k})`, transformOrigin: "0 0", marginBottom: SIM_H * (k - 1) }}>
        <SpringPage s={s} />
      </div>
    </div>
  );
}

/** The sim as a box on the canvas: transparent, with the accent outline while it's selected. */
export function SimBox({ s, active, children }: { s: SimState; active: boolean; children?: ReactNode }) {
  return (
    <div style={{ position: "relative", width: SIM_W, height: SIM_H, background: "rgba(255,255,255,.86)", outline: active ? `1.5px solid ${ACCENT}` : "1px solid rgba(105,101,219,.25)", outlineOffset: 2 }}>
      <SpringPage s={s} />
      {children}
    </div>
  );
}
