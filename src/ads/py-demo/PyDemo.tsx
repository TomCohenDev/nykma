import { Plate, Sequence, useFrame, useVideo, type AdProps, type Cue, type Layout } from "../../engine";
import { beatPhase, count, energy, marker, pulse, section, useTimeline } from "../../parts/timeline";

/**
 * The audio and Blender pipeline's test ad. Its length, fps and every cue come from public/ads/py-demo/gen/timeline.json,
 * so nothing here is a hard-coded time. Build it with:
 *
 *   .venv/Scripts/python py/mv.py build py-demo
 *   .venv/Scripts/python py/mv.py blender py-demo --scene src/ads/py-demo/scene.py --preview --layer
 */
export const cues: Cue[] = [{ src: "ads/py-demo/gen/mix.wav" }];

const L: Layout<{ title: number; label: number; pad: number; bottom: number; top: number; dial: number }> = {
  "16x9": { title: 210, label: 40, pad: 96, bottom: 84, top: 72, dial: 92 },
  "1x1": { title: 170, label: 38, pad: 72, bottom: 84, top: 72, dial: 84 },
  "9x16": { title: 180, label: 44, pad: 72, bottom: 300, top: 250, dial: 96 },
};

const font = '"Segoe UI", Arial, sans-serif';
const AMBER = "#ffb46b";
const ICE = "#7cc4ff";

/** A ring that sweeps once per beat. */
function BeatDial({ size }: { size: number }) {
  const tl = useTimeline();
  const t = useFrame() / tl.fps;
  const r = size / 2 - 7;
  const around = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flex: "none" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ffffff22" strokeWidth={8} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={AMBER}
        strokeWidth={8}
        strokeDasharray={around}
        strokeDashoffset={around * (1 - beatPhase(tl, t))}
      />
    </svg>
  );
}

/** One cell per beat of the track, lit as it passes, standing as tall as the music is loud. */
function BeatStrip({ ratio }: { ratio: AdProps["ratio"] }) {
  const tl = useTimeline();
  const frame = useFrame();
  const { pad, bottom } = L[ratio];
  const passed = count(tl.beats, frame / tl.fps);
  const level = energy(tl, "rms", frame);
  return (
    <div style={{ position: "absolute", insetInline: pad, bottom, height: 96, display: "flex", alignItems: "flex-end", gap: 6 }}>
      {tl.beats.map((beat, i) => (
        <div
          key={beat}
          style={{
            flex: 1,
            height: i < passed ? 14 + 82 * level * (i === passed - 1 ? 1 : 0.5) : 10,
            background: tl.downbeats.includes(beat) ? AMBER : ICE,
            opacity: i < passed ? 1 : 0.24,
          }}
        />
      ))}
    </div>
  );
}

export function PyDemo({ ratio }: AdProps) {
  const tl = useTimeline();
  const { fps, width, height } = useVideo();
  const frame = useFrame();
  const t = frame / fps;
  const { title, label, pad, top, dial } = L[ratio];

  const now = section(tl, t);
  const drop = marker(tl, "drop");
  const kick = pulse(tl.beats, t, 0.14);
  const flash = t >= drop ? Math.exp(-(t - drop) / 0.12) : 0;

  // The plates are the second section, as scene.py renders it. A file's number is the ad's frame + 1.
  const plates = tl.sections[1];
  const plateFrom = Math.round(plates.start * fps);
  const plateFrames = Math.round(plates.end * fps) - plateFrom;

  return (
    <div style={{ position: "absolute", inset: 0, background: "#05060f", overflow: "hidden", fontFamily: font, color: "#fff" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 55%, #1c2a5a ${10 + 24 * energy(tl, "low", frame)}%, #05060f ${Math.max(width, height) * 0.05}%)`,
        }}
      />
      {now.index !== 1 && (
        <h1
          style={{
            position: "absolute",
            insetInline: 0,
            top: "50%",
            margin: 0,
            textAlign: "center",
            fontSize: title,
            fontWeight: 800,
            letterSpacing: -4,
            lineHeight: 1,
            transform: `translateY(-50%) scale(${1 + 0.07 * kick})`,
          }}
        >
          nykma
        </h1>
      )}
      {/* Transparent plates: the page's glow shows through the Blender render. */}
      <Sequence from={plateFrom} duration={plateFrames}>
        <Plate src="ads/py-demo/gen/blender/scene-preview/####.png" first={plateFrom + 1} length={plateFrames} />
      </Sequence>
      <div
        style={{
          position: "absolute",
          top,
          insetInline: pad,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: label,
          fontWeight: 600,
        }}
      >
        <span>
          {Math.round(tl.bpm)} BPM · {now.section.name}
        </span>
        <BeatDial size={dial} />
      </div>
      <BeatStrip ratio={ratio} />
      <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: flash * 0.65 }} />
    </div>
  );
}
