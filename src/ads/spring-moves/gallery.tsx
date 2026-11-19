import type { CSSProperties, ReactNode } from "react";
import { clamp } from "../../parts/time";
import { SIM_H, SIM_W, SpringPage, type SimState } from "./sim";

/**
 * The end card's other simulations. MathbookLM builds a simulation for any physics question (the server's prompt:
 * "All of physics is in scope"; three.js, JSXGraph and uPlot), so these are examples of what it makes, drawn here in
 * the same card as the live spring sim: the title on the right, Add to canvas, the play bar, a slider and a readout.
 * They weren't run live. Every number is worked out from the physics each frame.
 */

const ACCENT = "#6965db";
const INK = "#343a40";
const font = '"Arimo", Arial, sans-serif';
const he = '"Rubik", "Arimo", sans-serif';
const g = 9.81;

function Slider({ x, y, w, k }: { x: number; y: number; w: number; k: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y - 3, width: w, height: 6, borderRadius: 3, background: "#dcdaf6" }}>
      <div style={{ width: `${clamp(k) * 100}%`, height: "100%", borderRadius: 3, background: ACCENT }} />
      <div style={{ position: "absolute", left: `calc(${clamp(k) * 100}% - 9px)`, top: -6, width: 18, height: 18, borderRadius: "50%", background: ACCENT }} />
    </div>
  );
}

/** The bottom of a card: play bar, one slider row (label right, value left), a readout. Big enough to read small. */
function Controls({ t, loop, label, value, k, readout }: { t: number; loop: number; label: string; value: string; k: number; readout: string }) {
  const tl = t % loop;
  const row: CSSProperties = { position: "absolute", fontSize: 19, color: "#444", whiteSpace: "nowrap" };
  return (
    <>
      <span style={{ ...row, left: 14, top: 250, color: "#666", fontFamily: font }}>
        {tl.toFixed(2)} s / {loop.toFixed(2)} s
      </span>
      <span style={{ position: "absolute", left: 200, top: 262, width: 270 }}>
        <Slider x={0} y={0} w={270} k={tl / loop} />
      </span>
      <span style={{ position: "absolute", left: 494, top: 246, width: 50, height: 32, borderRadius: 8, border: "1px solid #ddd", display: "grid", placeItems: "center", fontSize: 14, color: "#222" }}>❚❚</span>
      <span dir="rtl" style={{ ...row, right: 14, top: 290, fontFamily: he }}>{label}</span>
      <span style={{ position: "absolute", left: 200, top: 304, width: 200 }}>
        <Slider x={0} y={0} w={200} k={k} />
      </span>
      <span style={{ ...row, left: 14, top: 290, color: "#222", fontFamily: font }}>{value}</span>
      <span style={{ ...row, left: 14, top: 320, fontSize: 18, color: ACCENT, fontWeight: 700, fontFamily: font }}>{readout}</span>
    </>
  );
}

const Page = ({ children }: { children: ReactNode }) => (
  <div dir="ltr" style={{ position: "relative", width: SIM_W, height: SIM_H, fontFamily: font, color: "#222", overflow: "hidden" }}>{children}</div>
);

/** A simple pendulum: L = 1 m, θ₀ = 20°. Small-angle θ(t) = θ₀ cos ωt, ω = √(g/L), T = 2.01 s. */
function Pendulum({ t }: { t: number }) {
  const L = 1, th0 = (20 * Math.PI) / 180;
  const w = Math.sqrt(g / L);
  const T = (2 * Math.PI) / w;
  const th = th0 * Math.cos(w * t);
  const px = 190, x0 = 280, y0 = 30;
  const bx = x0 + px * L * Math.sin(th), by = y0 + px * L * Math.cos(th);
  return (
    <Page>
      <svg width={SIM_W} height={240} style={{ position: "absolute", left: 0, top: 0 }} fill="none" strokeLinecap="round">
        <path d={`M200 ${y0}H360`} stroke="#495057" strokeWidth={4} />
        <path d={`M${x0} ${y0}V${y0 + px}`} stroke="#adb5bd" strokeWidth={2} strokeDasharray="5 5" />
        <path d={`M${x0 - px * Math.sin(th0)} ${y0 + px * Math.cos(th0)}A${px} ${px} 0 0 0 ${x0 + px * Math.sin(th0)} ${y0 + px * Math.cos(th0)}`} stroke="#dee2e6" strokeWidth={2} />
        <path d={`M${x0} ${y0}L${bx} ${by}`} stroke={INK} strokeWidth={3} />
        <circle cx={bx} cy={by} r={18} fill="#fff" stroke="#0ca678" strokeWidth={3} />
      </svg>
      <Controls t={t} loop={4} label="אורך החוט L" value="1.00 m" k={0.4} readout={`T = 2π√(L/g) = ${T.toFixed(2)} s`} />
    </Page>
  );
}

/** A projectile: v₀ = 20 m/s at 45°. Flight time 2.88 s, range 40.8 m, top 10.2 m. */
function Projectile({ t }: { t: number }) {
  const v0 = 20, a = Math.PI / 4;
  const vx = v0 * Math.cos(a), vy = v0 * Math.sin(a);
  const tf = (2 * vy) / g;
  const R = vx * tf, Hm = (vy * vy) / (2 * g);
  const loop = 3.6;
  const tt = Math.min(t % loop, tf);
  const sx = 11.5, sy = 15, gx = 40, gy = 210;
  const P = (s: number) => ({ x: gx + vx * s * sx, y: gy - (vy * s - 0.5 * g * s * s) * sy });
  let trail = "";
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const p = P((tt * i) / n);
    trail += `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  const ball = P(tt);
  return (
    <Page>
      <svg width={SIM_W} height={240} style={{ position: "absolute", left: 0, top: 0 }} fill="none" strokeLinecap="round">
        <path d={`M20 ${gy}H545`} stroke="#495057" strokeWidth={3} />
        <path d={`M${gx} ${gy}L${gx + 46} ${gy - 46}`} stroke="#e03131" strokeWidth={3} />
        <path d={trail} stroke={ACCENT} strokeWidth={3} strokeDasharray="2 7" />
        <circle cx={ball.x} cy={ball.y} r={11} fill="#f08c00" />
      </svg>
      <Controls t={t} loop={loop} label="זווית הזריקה α" value="45°" k={0.5} readout={`R = ${R.toFixed(1)} m · H = ${Hm.toFixed(1)} m`} />
    </Page>
  );
}

/** A satellite 400 km up: r = 6771 km, v = √(GM/r) = 7.67 km/s, T = 2πr/v = 92.4 min. Shown ×1000. */
function Orbit({ t }: { t: number }) {
  const GM = 3.986e14, r = 6.771e6;
  const v = Math.sqrt(GM / r);
  const T = (2 * Math.PI * r) / v;
  const ang = (2 * Math.PI * t * 1000) / T;
  const cx = 280, cy = 120, R = 100;
  return (
    <Page>
      <svg width={SIM_W} height={240} style={{ position: "absolute", left: 0, top: 0 }} fill="none">
        <circle cx={cx} cy={cy} r={R} stroke="#ced4da" strokeWidth={2} strokeDasharray="6 6" />
        <circle cx={cx} cy={cy} r={(R * 6371) / 6771} fill="#d0ebff" stroke="#1971c2" strokeWidth={3} />
        <circle cx={cx + R * Math.cos(ang)} cy={cy - R * Math.sin(ang)} r={10} fill={ACCENT} />
        <path d={`M${cx + R * Math.cos(ang)} ${cy - R * Math.sin(ang)}l${-34 * Math.sin(ang)} ${-34 * Math.cos(ang)}`} stroke="#f08c00" strokeWidth={3} />
      </svg>
      <span style={{ position: "absolute", left: 14, top: 14, fontSize: 18, color: "#666" }}>×1000</span>
      <Controls t={t} loop={T / 1000} label="גובה המסלול h" value="400 km" k={0.25} readout={`v = ${(v / 1000).toFixed(2)} km/s · T = ${(T / 60).toFixed(1)} min`} />
    </Page>
  );
}

/** A capacitor charging: 9 V through R = 1 kΩ into C = 1000 µF, τ = RC = 1.00 s, V(t) = 9(1 − e^(−t/τ)). */
function Capacitor({ t }: { t: number }) {
  const V0 = 9, tau = 1, loop = 5;
  const tl = t % loop;
  const gx = 60, gy = 210, sx = 92, sy = 20;
  let curve = "";
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const s = (tl * i) / n;
    curve += `${i ? "L" : "M"}${(gx + s * sx).toFixed(1)} ${(gy - V0 * (1 - Math.exp(-s / tau)) * sy).toFixed(1)}`;
  }
  const V = V0 * (1 - Math.exp(-tl / tau));
  return (
    <Page>
      <svg width={SIM_W} height={240} style={{ position: "absolute", left: 0, top: 0 }} fill="none" strokeLinecap="round">
        <path d={`M${gx} 20V${gy}H540`} stroke="#495057" strokeWidth={2} />
        <path d={`M${gx} ${gy - V0 * sy}H540`} stroke="#ced4da" strokeWidth={2} strokeDasharray="6 6" />
        <path d={`M${gx + tau * sx} ${gy}V${gy - V0 * (1 - Math.exp(-1)) * sy}`} stroke="#ced4da" strokeWidth={2} strokeDasharray="4 4" />
        <path d={curve} stroke={ACCENT} strokeWidth={3.5} />
      </svg>
      <span style={{ position: "absolute", left: gx + tau * sx - 8, top: gy + 4, fontSize: 18, color: "#666" }}>τ</span>
      <Controls t={t} loop={loop} label="קיבול C" value="1000 µF" k={0.5} readout={`τ = RC = ${tau.toFixed(2)} s · V = ${V.toFixed(2)} V`} />
    </Page>
  );
}

/** Light from air (n₁ = 1.00) into glass (n₂ = 1.50): the angle sweeps 20° to 60°, and θ₂ = asin(sin θ₁ / 1.5). */
function Refraction({ t }: { t: number }) {
  const n1 = 1, n2 = 1.5;
  const th1d = 40 + 20 * Math.sin((2 * Math.PI * t) / 4);
  const th1 = (th1d * Math.PI) / 180;
  const th2 = Math.asin((n1 * Math.sin(th1)) / n2);
  const cx = 280, cy = 120, L = 130;
  return (
    <Page>
      <div style={{ position: "absolute", left: 0, top: cy, width: SIM_W, height: 240 - cy, background: "#e7f5ff" }} />
      <svg width={SIM_W} height={240} style={{ position: "absolute", left: 0, top: 0 }} fill="none" strokeLinecap="round">
        <path d={`M20 ${cy}H540`} stroke="#495057" strokeWidth={2} />
        <path d={`M${cx} 10V230`} stroke="#adb5bd" strokeWidth={2} strokeDasharray="5 5" />
        <path d={`M${cx - L * Math.sin(th1)} ${cy - L * Math.cos(th1)}L${cx} ${cy}`} stroke="#f08c00" strokeWidth={4} />
        <path d={`M${cx} ${cy}L${cx + L * Math.sin(th2)} ${cy + L * Math.cos(th2)}`} stroke="#e8590c" strokeWidth={4} />
      </svg>
      <span style={{ position: "absolute", left: 20, top: 92, fontSize: 18, color: "#666" }}>n₁ = 1.00</span>
      <span style={{ position: "absolute", left: 20, top: 130, fontSize: 18, color: "#1971c2" }}>n₂ = 1.50</span>
      <Controls t={t} loop={4} label="זווית הפגיעה θ₁" value={`${th1d.toFixed(0)}°`} k={(th1d - 0) / 90} readout={`θ₂ = ${((th2 * 180) / Math.PI).toFixed(1)}°`} />
    </Page>
  );
}

export type Kind = "spring" | "pendulum" | "projectile" | "orbit" | "capacitor" | "refraction";
export const TITLES: Record<Kind, string> = {
  spring: "מתנד הרמוני: מסה וקפיץ",
  pendulum: "מטוטלת מתמטית",
  projectile: "זריקה משופעת",
  orbit: "לוויין במסלול מעגלי",
  capacitor: "טעינת קבל במעגל RC",
  refraction: "שבירת אור: חוק סנל",
};

/** One card as the chat shows a simulation: the title on the right, Add to canvas on the left, the page under it. */
export function SimTile({ kind, t, width, spring }: { kind: Kind; t: number; width: number; spring: SimState }) {
  const k = width / SIM_W;
  const head = Math.round(width * 0.1);
  const page =
    kind === "spring" ? <SpringPage s={spring} /> : kind === "pendulum" ? <Pendulum t={t} /> : kind === "projectile" ? <Projectile t={t} /> : kind === "orbit" ? <Orbit t={t} /> : kind === "capacitor" ? <Capacitor t={t} /> : <Refraction t={t} />;
  return (
    <div dir="ltr" style={{ width, borderRadius: 12, background: "#fff", border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 10px 34px rgba(0,0,0,.1)", fontFamily: font }}>
      <div style={{ height: head, display: "flex", alignItems: "center", gap: head * 0.3, padding: `0 ${head * 0.35}px`, background: "#f4f4f6", borderBottom: "1px solid #eceef1" }}>
        <span style={{ fontSize: head * 0.36, color: "#888", border: "1px solid #e5e7eb", borderRadius: 6, padding: "1px 6px", whiteSpace: "nowrap" }}>Add to canvas</span>
        <span dir="rtl" style={{ flex: 1, fontSize: head * 0.44, fontWeight: 700, color: "#333", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: he }}>{TITLES[kind]}</span>
      </div>
      <div style={{ width: SIM_W, height: SIM_H, transform: `scale(${k})`, transformOrigin: "0 0", marginBottom: SIM_H * (k - 1), marginRight: SIM_W * (k - 1) }}>{page}</div>
    </div>
  );
}
