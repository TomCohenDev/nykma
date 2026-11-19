import { Plate, Sequence, random, useFrame, useVideo, type AdProps, type Cue, type Layout } from "../../engine";

/**
 * The engine's test ad: 3 s, a Hebrew ad in all three ratios. It proves text, motion, a Sequence, a sound
 * cue (public/ads/smoke/blip.wav, from scripts/audio/smoke-blip.mjs), <Plate>, and RTL with isolated Latin.
 */
const HIT = 45; // The second scene starts here, and the sound hits with it.

export const cues: Cue[] = [
  { src: "ads/smoke/blip.wav", volume: 0.5, fade: [2, 12] },
  { src: "ads/smoke/blip.wav", at: HIT, volume: 1, trim: [0, 24], fade: 8 },
];

const L: Layout<{ title: number; price: number; pad: number; plate: number }> = {
  "16x9": { title: 118, price: 300, pad: 120, plate: 240 },
  "1x1": { title: 96, price: 260, pad: 90, plate: 200 },
  "9x16": { title: 104, price: 280, pad: 120, plate: 220 }, // Hebrew starts at the right, so it needs the action rail's 120 px.
};

const font = '"Segoe UI", Arial, sans-serif';
const out = (t: number) => 1 - (1 - Math.min(Math.max(t, 0), 1)) ** 3;

function Dust() {
  const frame = useFrame();
  const { width, height } = useVideo();
  return Array.from({ length: 24 }, (_, i) => (
    <div
      key={i}
      style={{
        position: "absolute",
        left: random(`x${i}`) * width,
        top: (random(`y${i}`) * height + frame * (2 + 6 * random(`v${i}`))) % height,
        width: 10,
        height: 10,
        borderRadius: 5,
        background: "#f5c542",
        opacity: 0.35,
      }}
    />
  ));
}

function Opening({ ratio }: AdProps) {
  const frame = useFrame();
  const { width } = useVideo();
  const { title, pad } = L[ratio];
  const inX = out((frame + 5) / 15); // Already partly in on frame 0, so the first still has text.
  return (
    <>
      <h1
        style={{
          position: "absolute",
          top: "30%",
          insetInline: pad,
          margin: 0,
          color: "#fff",
          fontSize: title,
          fontWeight: 700, // Segoe UI's heavier cuts have no Hebrew letters.
          lineHeight: 1.15,
          opacity: inX,
          transform: `translateX(${(inX - 1) * 80}px)`, // Enters from the left, travels toward the reading start.
        }}
      >
        אף אחד לא מכיר את האפליקציה שלי
      </h1>
      {/* Runs right to left, like reading. */}
      <div
        style={{
          position: "absolute",
          top: "70%",
          right: pad,
          width: ((width - pad * 2) * frame) / (HIT - 1),
          height: 16,
          background: "#f5c542",
        }}
      />
    </>
  );
}

function Hit({ ratio }: AdProps) {
  const frame = useFrame();
  const { price, title, pad } = L[ratio];
  const pop = out(frame / 10);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: pad, color: "#fff" }}>
      <div style={{ fontSize: title * 0.8, fontWeight: 600 }}>
        עכשיו ב־<bdi>nykma</bdi> רק <bdi>₪49</bdi> לחודש
      </div>
      <div style={{ fontSize: price, fontWeight: 900, color: "#f5c542", transform: `scale(${0.8 + 0.2 * pop})`, transformOrigin: "right center" }}>
        <bdi>₪49</bdi>
      </div>
      <div dir="ltr" style={{ fontSize: title * 0.45, opacity: 0.8 }}>
        nobody knows my app
      </div>
    </div>
  );
}

export function Smoke({ ratio }: AdProps) {
  const size = L[ratio].plate;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#16202c", fontFamily: font }}>
      <Dust />
      <Sequence duration={HIT}>
        <Opening ratio={ratio} />
      </Sequence>
      <Sequence from={HIT}>
        <Hit ratio={ratio} />
      </Sequence>
      <div style={{ position: "absolute", left: 40, bottom: 40, width: size, height: (size * 9) / 16, overflow: "hidden" }}>
        <Plate src="ads/smoke/plate/##.png" length={12} loop />
      </div>
    </div>
  );
}
