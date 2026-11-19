import type { CSSProperties, ReactNode } from "react";
import { clamp } from "../../parts/time";

/**
 * The LC simulation as MathbookLM's sim page lays it out since 2026-11-10 (mathbooklm-website/src/sim/
 * simDocumentTemplate.ts BASE_STYLE and mblSimRuntime.js): a title bar; the stage; the info row with the legend and
 * the live caption; the transport (filled round play/pause button, restart, the scrubber with moment ticks, the time,
 * the speed select, and moment chips); and the side panel, 272 px wide in an 880 px frame (clamp(176px, 32vw, 272px)),
 * with result cards (the answer highlighted across the grid), live values and controls (sliders with a filled track,
 * value and unit beside the label). Light theme: accent #6d4aff, accent2 #0e9f9a, accent3 #e08a00, fg #1f2430,
 * muted #6b7280, grid #e4e6eb, on a transparent background so the canvas grid shows through. Everything below is in
 * the page's own pixels; the canvas places the page at 880 × 550 (SIM_LAYOUT) and the camera films it.
 *
 * The drawing is this ad's: the circuit and the q / i plot as the prompt's design rules ask (one clean drawing of the
 * setup, a plot beside the mechanism, labels with a halo). Physics: q = C·V₀·cos ωt, i = V₀·√(C/L)·sin ωt,
 * ω = 1/√(LC). The page's time runs slowed (2.6 ms of the circuit to a second on screen) so the swing can be seen.
 */

export const SIM_W = 880;
export const SIM_H = 550;

const TH = { paper: "#ffffff", fg: "#1f2430", muted: "#6b7280", grid: "#e4e6eb", accent: "#6d4aff", accent2: "#0e9f9a", accent3: "#e08a00" };
/** The app's sim uses the system stack (Segoe UI on Windows), which isn't licensed for video: Arimo stands in, as brand.md's chrome substitute. */
const UI_FONT = '"Arimo", Arial, sans-serif';

// ── the page's layout, in page pixels (grid areas of #mbl-app) ───────────────

const TITLE_H = 35; // 12 px top padding, 15 px type at 1.4, 2 px bottom
const SIDE_W = 272;
const STAGE_W = SIM_W - SIDE_W; // 608
const TRANSPORT_H = 82; // .mbl-reserve-moments #mbl-transport
const INFO_H = 26;
const STAGE_H = SIM_H - TITLE_H - INFO_H - TRANSPORT_H; // 407
export const STAGE = { x: 0, y: TITLE_H, w: STAGE_W, h: STAGE_H };
export const SIDE = { x: STAGE_W, y: TITLE_H, w: SIDE_W, h: SIM_H - TITLE_H };
const SIDE_IN = { x: STAGE_W + 14, w: SIDE_W - 28 };

/** The circuit's parameters, as the sim's controls hold them. */
export type Params = { L: number; C: number; V: number }; // mH, µF, V
export const QUESTION: Params = { L: 10, C: 100, V: 9 };

/** One moment of the simulation, from the ad's frame. */
export type SimState = { p: Params; t: number; playing: boolean; active: boolean; land: number; hover?: "C" };

/** The loop's duration, in ms of the circuit. */
export const DURATION_MS = 20;

export function physics(p: Params) {
  const L = p.L / 1000;
  const C = p.C / 1e6;
  const w = 1 / Math.sqrt(L * C);
  const f = w / (2 * Math.PI);
  const Q0 = C * p.V;
  const Imax = p.V * Math.sqrt(C / L);
  return { L, C, w, f, Q0, Imax, T: (1000 * 2 * Math.PI) / w };
}

// ── the controls (mbl.params) ────────────────────────────────────────────────

const CONTROLS = [
  { id: "L", label: "Inductance L", min: 1, max: 50, step: 1, unit: "mH" },
  { id: "C", label: "Capacitance C", min: 10, max: 500, step: 10, unit: "µF" },
  { id: "V", label: "Initial voltage V₀", min: 1, max: 20, step: 0.5, unit: "V" },
] as const;

// Side panel rows, top to bottom (gap 14 between sections, 12 px top padding).
const RES_Y = SIDE.y + 12;
const HL_H = 58;
const CARD_H = 54;
const READ_Y = RES_Y + HL_H + 6 + CARD_H + 14;
const CTRL_Y = READ_Y + 22 + 2 * 20 + 14;
const PARAM_H = 42;
const PARAM_GAP = 10;
const paramY = (i: number) => CTRL_Y + 22 + i * (PARAM_H + PARAM_GAP);
/** The range input's box for a control, in page pixels. */
const rangeBox = (i: number) => ({ x: SIDE_IN.x, y: paramY(i) + 22, w: SIDE_IN.w, h: 18 });

/** Where a slider's thumb sits for a value, in page pixels: the centre of the 14 px thumb along the track. */
export function thumbAt(id: "L" | "C" | "V", value: number) {
  const i = CONTROLS.findIndex((c) => c.id === id);
  const c = CONTROLS[i];
  const b = rangeBox(i);
  const k = (value - c.min) / (c.max - c.min);
  return { x: b.x + 7 + k * (b.w - 14), y: b.y + b.h / 2 };
}
/** Where the highlighted result card sits, in page pixels. */
export const RESULT_BOX = { x: SIDE_IN.x, y: RES_Y, w: SIDE_IN.w, h: HL_H + 6 + CARD_H };

// ── pieces ───────────────────────────────────────────────────────────────────

const box = (x: number, y: number, w: number, h: number, extra?: CSSProperties): CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h, boxSizing: "border-box", ...extra });

function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: TH.muted }}>{children}</div>
      {right}
    </div>
  );
}

function ResultCard({ label, value, highlight, style }: { label: ReactNode; value: string; highlight?: boolean; style: CSSProperties }) {
  return (
    <div
      style={{
        ...style,
        padding: "7px 10px 8px",
        borderRadius: 10,
        background: highlight ? "rgba(109,74,255,.11)" : "rgba(31,36,48,.05)",
        border: `1px solid ${highlight ? "rgba(109,74,255,.30)" : "rgba(31,36,48,.07)"}`,
      }}
    >
      <div style={{ fontSize: 11.5, color: highlight ? TH.accent : TH.muted }}>{label}</div>
      <div style={{ marginTop: 1, fontSize: highlight ? 19 : 16, fontWeight: 650, fontVariantNumeric: "tabular-nums", color: highlight ? TH.accent : TH.fg }}>{value}</div>
    </div>
  );
}

function Range({ i, value, hover }: { i: number; value: number; hover?: boolean }) {
  const c = CONTROLS[i];
  const b = rangeBox(i);
  const k = clamp((value - c.min) / (c.max - c.min));
  const fill = 7 + k * (b.w - 14);
  return (
    <div style={box(b.x, b.y, b.w, b.h)}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 7, height: 4, borderRadius: 2, background: `linear-gradient(to right, ${TH.accent} ${fill}px, ${TH.grid} ${fill}px)` }} />
      <div
        style={{
          position: "absolute",
          left: fill - 7,
          top: 2,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: TH.paper,
          border: `2px solid ${TH.accent}`,
          boxSizing: "border-box",
          boxShadow: hover ? `0 1px 3px rgba(0,0,0,.18), 0 0 0 4px rgba(109,74,255,.25)` : "0 1px 3px rgba(0,0,0,.18)",
        }}
      />
    </div>
  );
}

const fmt = (v: number, step: number) => (step >= 1 ? String(Math.round(v)) : String(Math.round(v / step) * step));

function SidePanel({ st }: { st: SimState }) {
  const ph = physics(st.p);
  const tt = st.t / 1000;
  const q = ph.Q0 * Math.cos(ph.w * tt);
  const i = ph.Imax * Math.sin(ph.w * tt);
  const fText = ph.f >= 100 ? `${ph.f.toFixed(0)} Hz` : `${ph.f.toFixed(1)} Hz`;
  const half = (SIDE_IN.w - 6) / 2;
  return (
    <>
      <div style={box(SIDE.x, SIDE.y, SIDE.w, SIDE.h, { borderLeft: `1px solid ${TH.grid}`, background: "rgba(255,255,255,.55)" })} />
      <ResultCard label="Frequency f" value={fText} highlight style={box(SIDE_IN.x, RES_Y, SIDE_IN.w, HL_H)} />
      <ResultCard label="Angular freq. ω" value={`${ph.w.toFixed(0)} rad/s`} style={box(SIDE_IN.x, RES_Y + HL_H + 6, half, CARD_H)} />
      <ResultCard label="Peak current" value={`${ph.Imax.toFixed(2)} A`} style={box(SIDE_IN.x + half + 6, RES_Y + HL_H + 6, half, CARD_H)} />

      <div style={box(SIDE_IN.x, READ_Y, SIDE_IN.w, 22)}>
        <SectionTitle>Live values</SectionTitle>
      </div>
      {[
        ["Charge q", `${(q * 1e6).toFixed(0)} µC`],
        ["Current i", `${i.toFixed(2)} A`],
      ].map(([label, value], k) => (
        <div key={label} style={box(SIDE_IN.x, READ_Y + 22 + k * 20, SIDE_IN.w, 20, { display: "flex", justifyContent: "space-between", alignItems: "baseline" })}>
          <span style={{ color: TH.muted }}>{label}</span>
          <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: TH.fg }}>{value}</span>
        </div>
      ))}

      <div style={box(SIDE_IN.x, CTRL_Y, SIDE_IN.w, 22)}>
        <SectionTitle right={<span style={{ fontSize: 11.5, color: st.p.C === QUESTION.C && st.p.L === QUESTION.L ? TH.muted : TH.accent, opacity: st.p.C === QUESTION.C ? 0.6 : 1 }}>Question values</span>}>Controls</SectionTitle>
      </div>
      {CONTROLS.map((c, k) => (
        <div key={c.id}>
          <div style={box(SIDE_IN.x, paramY(k), SIDE_IN.w, 22, { display: "flex", justifyContent: "space-between", alignItems: "baseline" })}>
            <span style={{ color: "rgba(31,36,48,.85)" }}>{c.label}</span>
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 3 }}>
              <span style={{ width: "4.6em", padding: "1px 4px", textAlign: "end", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: TH.fg, display: "inline-block", boxSizing: "border-box" }}>{fmt(st.p[c.id], c.step)}</span>
              <span style={{ color: TH.muted, fontSize: 12 }}>{c.unit}</span>
            </span>
          </div>
          <Range i={k} value={st.p[c.id]} hover={st.hover === c.id} />
        </div>
      ))}
    </>
  );
}

// ── the stage ────────────────────────────────────────────────────────────────

const CIR = { l: 86, r: 256, t: 66, b: 336, plateTop: 186, plateBot: 226, plateW: 76, coilTop: 136, coilBot: 276 };
const PLOT = { x0: 340, x1: 588, y: 206, amp: 96 };

/** A label as mbl.label paints it: system-ui on a halo, beside its point. */
function Label({ x, y, text, color = TH.fg, size = 14, anchor = "start", weight = 600, italic }: { x: number; y: number; text: string; color?: string; size?: number; anchor?: "start" | "middle" | "end"; weight?: number; italic?: boolean }) {
  return (
    <text x={x} y={y} textAnchor={anchor} dominantBaseline="central" fontFamily={UI_FONT} fontSize={size} fontWeight={weight} fontStyle={italic ? "italic" : undefined} fill={color} stroke="#fff" strokeWidth={4} paintOrder="stroke" strokeLinejoin="round">
      {text}
    </text>
  );
}

/** The point at distance `p` around the loop, clockwise from the top-left corner. */
function loopPoint(p: number) {
  const w = CIR.r - CIR.l;
  const h = CIR.b - CIR.t;
  const P = 2 * (w + h);
  let d = ((p % P) + P) % P;
  if (d < w) return { x: CIR.l + d, y: CIR.t };
  d -= w;
  if (d < h) return { x: CIR.r, y: CIR.t + d };
  d -= h;
  if (d < w) return { x: CIR.r - d, y: CIR.b };
  d -= w;
  return { x: CIR.l, y: CIR.b - d };
}

function Stage({ st }: { st: SimState }) {
  const ph = physics(st.p);
  const tt = st.t / 1000;
  const qn = Math.cos(ph.w * tt); // q / Q0
  const inn = Math.sin(ph.w * tt); // i / Imax
  const { l, r, t, b, plateTop, plateBot, plateW, coilTop, coilBot } = CIR;
  const cx = l;
  const coilN = 5;
  const loopH = (coilBot - coilTop) / coilN;
  const coil = `M${r} ${t}V${coilTop}` + Array.from({ length: coilN }, () => `a${loopH / 2} ${loopH / 2} 0 0 1 0 ${loopH}`).join("") + `V${b}`;

  // Current: the charge carriers move by the charge that has flowed, so they swing back and forth with q.
  const P = 2 * (r - l + b - t);
  const shift = 150 * (1 - qn);
  const dots = Array.from({ length: 24 }, (_, k) => loopPoint((k * P) / 24 + shift)).filter((d) => !(Math.abs(d.x - cx) < 2 && d.y > plateTop - 4 && d.y < plateBot + 4));
  const ia = Math.abs(inn);
  const dir = Math.sign(inn) || 1;

  const sign = (plus: boolean, x: number, y: number, k: number) => (
    <g key={`${x}-${y}`} opacity={Math.abs(qn)} stroke={plus ? "#e5484d" : "#3b82f6"} strokeWidth={2.2} strokeLinecap="round">
      <path d={`M${x - 5} ${y}h10`} />
      {plus && <path d={`M${x} ${y - 5}v10`} />}
      <title>{k}</title>
    </g>
  );
  const topPlus = qn >= 0;
  const signsX = [-28, -14, 0, 14, 28].map((dx) => cx + dx);

  // The plot: q and i across the whole loop (faint) and up to now (bright), normalised to their peaks.
  const N = 220;
  const curve = (fn: (x: number) => number, until: number) => {
    let d = "";
    for (let k = 0; k <= N; k++) {
      const u = k / N;
      const tm = u * DURATION_MS;
      if (tm > until + 1e-9) break;
      const x = PLOT.x0 + u * (PLOT.x1 - PLOT.x0);
      d += `${k ? "L" : "M"}${x.toFixed(1)} ${(PLOT.y - fn(tm / 1000) * PLOT.amp).toFixed(1)}`;
    }
    return d;
  };
  const qf = (x: number) => Math.cos(ph.w * x);
  const iF = (x: number) => Math.sin(ph.w * x);
  const nowX = PLOT.x0 + (st.t / DURATION_MS) * (PLOT.x1 - PLOT.x0);

  return (
    <svg width={STAGE.w} height={STAGE.h} style={{ position: "absolute", left: STAGE.x, top: STAGE.y, overflow: "visible" }}>
      {/* the circuit */}
      <path d={`M${cx} ${plateTop}V${t}H${r}`} fill="none" stroke={TH.fg} strokeWidth={2.4} strokeLinejoin="round" />
      <path d={`M${cx} ${plateBot}V${b}H${r}`} fill="none" stroke={TH.fg} strokeWidth={2.4} strokeLinejoin="round" />
      <path d={coil} fill="none" stroke={TH.fg} strokeWidth={2.4} strokeLinejoin="round" />
      {/* the coil's magnetic field */}
      {[52, 74, 96].map((rx, k) => (
        <ellipse key={rx} cx={r + 6} cy={(coilTop + coilBot) / 2} rx={rx} ry={rx + 36} fill="none" stroke={TH.accent2} strokeWidth={2} strokeDasharray="6 6" strokeDashoffset={-dir * shift * (0.6 + k * 0.2)} opacity={ia * (0.85 - k * 0.2)} />
      ))}
      {/* the plates, their charge and the field between them */}
      <rect x={cx - plateW / 2} y={plateTop - 3} width={plateW} height={6} rx={2} fill={TH.fg} />
      <rect x={cx - plateW / 2} y={plateBot - 3} width={plateW} height={6} rx={2} fill={TH.fg} />
      {signsX.map((x, k) => sign(topPlus, x, plateTop - 16, k))}
      {signsX.map((x, k) => sign(!topPlus, x, plateBot + 16, k + 5))}
      {[-24, -8, 8, 24].map((dx) => {
        const x = cx + dx;
        const down = qn >= 0;
        const y0 = down ? plateTop + 7 : plateBot - 7;
        const y1 = down ? plateBot - 9 : plateTop + 9;
        return (
          <g key={dx} opacity={Math.abs(qn) * 0.95} stroke={TH.accent} fill={TH.accent}>
            <path d={`M${x} ${y0}L${x} ${y1}`} strokeWidth={1.8} />
            <path d={down ? `M${x - 4} ${y1 - 5}L${x} ${y1 + 1}L${x + 4} ${y1 - 5}Z` : `M${x - 4} ${y1 + 5}L${x} ${y1 - 1}L${x + 4} ${y1 + 5}Z`} strokeWidth={0} />
          </g>
        );
      })}
      {/* the moving charge */}
      {dots.map((d, k) => (
        <circle key={k} cx={d.x} cy={d.y} r={4.2} fill={TH.accent2} opacity={0.35 + 0.65 * ia} />
      ))}
      {/* the current's arrow on the top wire */}
      <g opacity={ia} transform={`translate(${(l + r) / 2}, ${t - 22}) scale(${dir}, 1)`}>
        <path d="M-26 0H22" stroke={TH.accent2} strokeWidth={2.4} strokeLinecap="round" />
        <path d="M18 -6L28 0L18 6Z" fill={TH.accent2} />
      </g>
      <Label x={(l + r) / 2 + 40} y={t - 22} text="i" color={TH.accent2} italic />
      <Label x={cx - plateW / 2 - 12} y={(plateTop + plateBot) / 2} text="C" anchor="end" size={16} />
      <Label x={r + 26} y={coilTop - 18} text="L" size={16} />

      {/* the plot beside it */}
      <path d={`M${PLOT.x0} ${PLOT.y - PLOT.amp - 14}V${PLOT.y + PLOT.amp + 14}`} stroke={TH.grid} strokeWidth={1.5} />
      <path d={`M${PLOT.x0} ${PLOT.y}H${PLOT.x1 + 6}`} stroke={TH.grid} strokeWidth={1.5} />
      <path d={curve(qf, DURATION_MS)} fill="none" stroke={TH.accent} strokeWidth={2} opacity={0.22} />
      <path d={curve(iF, DURATION_MS)} fill="none" stroke={TH.accent2} strokeWidth={2} opacity={0.22} />
      <path d={curve(qf, st.t)} fill="none" stroke={TH.accent} strokeWidth={2.6} strokeLinejoin="round" />
      <path d={curve(iF, st.t)} fill="none" stroke={TH.accent2} strokeWidth={2.6} strokeLinejoin="round" />
      <path d={`M${nowX} ${PLOT.y - PLOT.amp - 10}V${PLOT.y + PLOT.amp + 10}`} stroke={TH.muted} strokeWidth={1} strokeDasharray="3 3" />
      <circle cx={nowX} cy={PLOT.y - qn * PLOT.amp} r={5} fill={TH.accent} stroke="#fff" strokeWidth={2} />
      <circle cx={nowX} cy={PLOT.y - inn * PLOT.amp} r={5} fill={TH.accent2} stroke="#fff" strokeWidth={2} />
      <PlotLabels x={nowX + 12} yq={PLOT.y - qn * PLOT.amp} yi={PLOT.y - inn * PLOT.amp} />
      <Label x={PLOT.x1 + 10} y={PLOT.y + 16} text="t" color={TH.muted} italic weight={500} />
    </svg>
  );
}

/** q and i beside their dots, kept apart the way mbl.label keeps labels off each other. */
function PlotLabels({ x, yq, yi }: { x: number; yq: number; yi: number }) {
  const gap = 24;
  let a = yq - 12;
  let b = yi + 12;
  if (Math.abs(a - b) < gap) {
    const mid = (a + b) / 2;
    const up = yq <= yi ? -1 : 1;
    a = mid + (up * gap) / 2;
    b = mid - (up * gap) / 2;
  }
  return (
    <>
      <Label x={x} y={a} text="q" color={TH.accent} italic />
      <Label x={x} y={b} text="i" color={TH.accent2} italic />
    </>
  );
}

// ── info row and transport ───────────────────────────────────────────────────

function captionFor(st: SimState) {
  if (st.t <= 0.0001) return "C is charged to V₀. The switch closes.";
  const ph = physics(st.p);
  const a = (ph.w * (st.t / 1000)) % (2 * Math.PI);
  const near = (x: number) => Math.abs(a - x) < 0.3;
  if (near(Math.PI / 2) || near((3 * Math.PI) / 2)) return "C is empty: all the energy is in the coil's magnetic field";
  if (near(Math.PI)) return "C is fully charged the other way round";
  if (a < Math.PI / 2) return "C discharges through the coil, and the current builds";
  if (a < Math.PI) return "The coil keeps the current flowing and charges C the other way";
  if (a < (3 * Math.PI) / 2) return "C discharges again, the other way round";
  return "The coil charges C back: one full swing";
}

const ICON_PLAY = "M5.2 3.3v9.4a.6.6 0 0 0 .9.5l7.3-4.7a.6.6 0 0 0 0-1L6.1 2.8a.6.6 0 0 0-.9.5Z";

function Info({ st }: { st: SimState }) {
  const y = STAGE.y + STAGE.h;
  const swatch = (c: string) => <span style={{ width: 20, height: 10, flex: "none", display: "inline-flex", alignItems: "center" }}><span style={{ width: 20, height: 2.4, background: c, borderRadius: 2 }} /></span>;
  return (
    <div style={box(0, y, STAGE_W, INFO_H, { display: "flex", alignItems: "center", gap: 16, padding: "4px 16px 0" })}>
      <div style={{ display: "flex", gap: 12, color: TH.muted, fontSize: 12, flex: "none" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{swatch(TH.accent)}charge q on C</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{swatch(TH.accent2)}current i</span>
      </div>
      <div style={{ flex: 1, minWidth: 0, color: "rgba(31,36,48,.82)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{captionFor(st)}</div>
    </div>
  );
}

function Transport({ st }: { st: SimState }) {
  const y = STAGE.y + STAGE.h + INFO_H;
  const ph = physics(st.p);
  const timeText = `${st.t.toFixed(2)} ms / ${DURATION_MS.toFixed(2)} ms`;
  const tlX = 16 + 34 + 8 + 30 + 8;
  const tlW = STAGE_W - 16 - tlX - 8 - 122 - 8 - 40;
  const k = clamp(st.t / DURATION_MS);
  const moments = [
    { label: "C empty", t: ph.T / 4 },
    { label: "Reversed", t: ph.T / 2 },
    { label: "One period", t: ph.T },
  ];
  return (
    <div style={box(0, y, STAGE_W, TRANSPORT_H, { padding: "6px 16px 12px", display: "flex", flexDirection: "column", gap: 6 })}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 34 }}>
        <div style={{ width: 34, height: 34, borderRadius: 999, background: TH.accent, color: "#fff", display: "grid", placeItems: "center", flex: "none" }}>
          <svg width={15} height={15} viewBox="0 0 16 16">
            {st.playing ? (
              <>
                <rect x="3.8" y="3" width="3" height="10" rx="1" fill="currentColor" />
                <rect x="9.2" y="3" width="3" height="10" rx="1" fill="currentColor" />
              </>
            ) : (
              <path d={ICON_PLAY} fill="currentColor" />
            )}
          </svg>
        </div>
        <div style={{ width: 30, height: 30, borderRadius: 999, border: `1px solid ${TH.grid}`, display: "grid", placeItems: "center", flex: "none", color: TH.fg }}>
          <svg width={15} height={15} viewBox="0 0 16 16">
            <path d="M3.3 8.6A4.8 4.8 0 1 0 4.9 4.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M4.6 1.9v2.8h2.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ position: "relative", width: tlW, height: 18, flex: "none" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 7, height: 4, borderRadius: 2, background: `linear-gradient(to right, ${TH.accent} ${7 + k * (tlW - 14)}px, ${TH.grid} ${7 + k * (tlW - 14)}px)` }} />
          {moments.map((m) => {
            const u = m.t / DURATION_MS;
            if (u > 1) return null;
            return <div key={m.label} style={{ position: "absolute", left: 7 + u * (tlW - 14) - 1, top: 3, width: 2, height: 12, borderRadius: 1, background: st.t >= m.t ? TH.accent : TH.muted, opacity: st.t >= m.t ? 1 : 0.7 }} />;
          })}
          <div style={{ position: "absolute", left: k * (tlW - 14), top: 2, width: 14, height: 14, borderRadius: "50%", background: TH.paper, border: `2px solid ${TH.accent}`, boxSizing: "border-box", boxShadow: "0 1px 3px rgba(0,0,0,.18)" }} />
        </div>
        <span style={{ width: 122, fontSize: 12, fontVariantNumeric: "tabular-nums", color: TH.muted, whiteSpace: "nowrap", textAlign: "right" }}>{timeText}</span>
        <span style={{ width: 40, fontSize: 12, padding: "2px 4px", border: `1px solid ${TH.grid}`, borderRadius: 6, color: TH.fg, boxSizing: "border-box", textAlign: "center" }}>1×</span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {moments.map((m) => {
          const passed = st.t >= m.t;
          return (
            <span key={m.label} style={{ height: 24, padding: "0 10px", borderRadius: 999, border: `1px solid ${passed ? "rgba(109,74,255,.45)" : TH.grid}`, color: passed ? TH.accent : TH.muted, fontSize: 12, display: "inline-flex", alignItems: "center", boxSizing: "border-box", whiteSpace: "nowrap" }}>
              {m.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── the page ─────────────────────────────────────────────────────────────────

/** The sim element on the canvas: transparent, with the active outline (#6d4aff) once it's clicked to interact. */
export function SimPage({ st }: { st: SimState }) {
  return (
    <div
      dir="ltr"
      style={{
        position: "relative",
        width: SIM_W,
        height: SIM_H,
        borderRadius: 8,
        border: `1px solid ${st.active ? "#6d4aff" : "transparent"}`,
        boxShadow: st.active ? "0 0 0 1px #6d4aff" : "none",
        boxSizing: "border-box",
        overflow: "hidden",
        fontFamily: UI_FONT,
        fontSize: 13,
        lineHeight: 1.4,
        color: TH.fg,
      }}
    >
      <div style={box(16, 12, STAGE_W - 32, 21, { fontSize: 15, fontWeight: 650, letterSpacing: "-0.01em", whiteSpace: "nowrap" })}>LC circuit: the energy swings between C and L</div>
      <Stage st={st} />
      <Info st={st} />
      <Transport st={st} />
      <SidePanel st={st} />
    </div>
  );
}
