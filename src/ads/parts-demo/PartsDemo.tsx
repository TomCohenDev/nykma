import { Sequence, useFrame, useVideo, type AdProps, type Layout } from "../../engine";
import {
  beatPhase,
  camAt,
  CameraView,
  Caption,
  Cursor,
  EndCard,
  energy,
  interpolate,
  marker,
  prog,
  pulse,
  Rough,
  said,
  section,
  spring,
  Typing,
  type CamKey,
  type CursorKey,
} from "../../parts";
import { tl } from "./timeline";

/** Proves the parts bin: every part, in an English and a Hebrew take, each ratio laid out for its shape. */
const INK = "#1b1a18";
const PAPER = "#f3ede2";
const HOT = "#ff4b2b";
const DEEP = "#c5331a"; // The same red, dark enough to read as small text on the paper.
const FONT = '"Segoe UI", Arial, sans-serif'; // Bold at most: Segoe UI's heavier cuts have no Hebrew letters.

const COPY = {
  en: {
    title: "What should we make?",
    prompt: "Make me an ad for nykma Pro at $49",
    button: "Go",
    note: "press this",
    caption: "A whole ad from Claude Code for just $49.",
    track: "vo-en",
    sections: ["Intro", "Part one", "Outro"],
    tagline: "Nobody knows nykma. Yet.",
  },
  he: {
    title: "מה נכין היום?",
    prompt: "תכין לי מודעה ל־nykma Pro ב־₪49 לחודש",
    button: "יאללה",
    note: "לוחצים כאן",
    caption: "מודעה שלמה מ־Claude Code ב־₪49 בלבד.",
    track: "vo-he",
    sections: ["פתיחה", "חלק ראשון", "סיום"],
    tagline: "אף אחד לא מכיר את nykma. בינתיים.",
  },
};

type Box = { x: number; y: number; w: number; h: number };
const L: Layout<{
  card: Box;
  title: number;
  input: Box;
  type: number;
  button: Box;
  note: { x: number; y: number; size: number };
  arrowFrom: [number, number];
  bend: number;
  push: number;
  settle: number; // Where the camera rests after the click.
  caption: Box & { size: number };
  chip: { top: number; inset: number; size: number };
  end: { layout: "row" | "stack"; align: "start" | "center"; tagline: number; url: number; logo: number; pad: number };
}> = {
  "16x9": {
    card: { x: 260, y: 200, w: 1400, h: 680 },
    title: 76,
    input: { x: 330, y: 350, w: 1260, h: 140 },
    type: 60,
    button: { x: 1240, y: 620, w: 350, h: 130 },
    note: { x: 340, y: 640, size: 64 },
    arrowFrom: [760, 680],
    bend: -60,
    push: 1.32,
    settle: 1.1,
    caption: { x: 140, y: 340, w: 1640, h: 280, size: 112 },
    chip: { top: 70, inset: 110, size: 40 },
    end: { layout: "row", align: "start", tagline: 84, url: 56, logo: 260, pad: 120 },
  },
  "1x1": {
    card: { x: 60, y: 170, w: 960, h: 740 },
    title: 68,
    input: { x: 110, y: 300, w: 860, h: 220 },
    type: 58,
    button: { x: 650, y: 650, w: 320, h: 130 },
    note: { x: 120, y: 670, size: 58 },
    arrowFrom: [420, 710],
    bend: -36,
    push: 1.12,
    settle: 1,
    caption: { x: 90, y: 280, w: 900, h: 440, size: 112 },
    chip: { top: 70, inset: 90, size: 40 },
    end: { layout: "stack", align: "center", tagline: 62, url: 46, logo: 220, pad: 90 },
  },
  "9x16": {
    card: { x: 60, y: 420, w: 960, h: 980 },
    title: 68,
    input: { x: 140, y: 590, w: 800, h: 360 },
    type: 76,
    button: { x: 140, y: 1170, w: 800, h: 150 },
    note: { x: 140, y: 990, size: 72 },
    arrowFrom: [500, 1050],
    bend: -30,
    push: 1.05,
    settle: 1,
    caption: { x: 120, y: 620, w: 840, h: 480, size: 124 },
    chip: { top: 220, inset: 130, size: 48 },
    end: { layout: "stack", align: "start", tagline: 96, url: 60, logo: 280, pad: 120 },
  },
};

const TIMES = { arrive: 30, type: [38, 96], leave: 100, click: 122, cut: marker(tl, "caption") * tl.fps, end: marker(tl, "end") * tl.fps } as const;

function useMirror() {
  const { width, dir } = useVideo();
  const x = (v: number) => (dir === "rtl" ? width - v : v);
  const left = (b: Box) => (dir === "rtl" ? width - b.x - b.w : b.x);
  return { x, left };
}

function Prompt({ ratio, take }: AdProps) {
  const frame = useFrame();
  const { width, height } = useVideo();
  const { x, left } = useMirror();
  const copy = COPY[take as "en" | "he"];
  const { card, title, input, type, button, note, arrowFrom, bend, push, settle } = L[ratio];
  const mid = { x: x(input.x + input.w / 2), y: input.y + input.h / 2 };
  const hit = { x: x(button.x + button.w / 2), y: button.y + button.h / 2 };

  const cam: CamKey[] = [
    { f: 12, cx: width / 2, cy: height / 2, z: 1 },
    { f: 60, cx: mid.x, cy: mid.y, z: push },
    { f: 100, cx: mid.x, cy: mid.y, z: push },
    { f: 132, cx: width / 2 + (hit.x - width / 2) * (settle - 1) * 2.5, cy: height / 2 + (hit.y - height / 2) * (settle - 1) * 2.5, z: settle },
  ];
  const pointer: CursorKey[] = [
    { f: 0, x: x(card.x + card.w + 20), y: card.y + card.h + 60 },
    { f: TIMES.arrive, x: x(input.x + input.w * 0.86), y: input.y + input.h - 14, click: true },
    { f: TIMES.leave, x: x(input.x + input.w * 0.86), y: input.y + input.h - 14 },
    { f: TIMES.click, x: hit.x + button.w * 0.2, y: hit.y + button.h * 0.12, click: true },
  ];
  const noted = prog(frame, [88, 100]);
  const pressed = prog(frame, [TIMES.click, TIMES.click + 8]);

  return (
    <CameraView cam={camAt(frame, cam)}>
      <div style={{ position: "absolute", left: left(card), top: card.y, width: card.w, height: card.h, background: "#fff", borderRadius: 28, boxShadow: `0 ${8}px 0 ${INK}`, border: `4px solid ${INK}`, boxSizing: "border-box" }} />
      <div style={{ position: "absolute", left: left(input), top: card.y + 44, width: input.w, fontSize: title, fontWeight: 700, color: INK }}>{copy.title}</div>
      <div style={{ position: "absolute", left: left(input), top: input.y, width: input.w, height: input.h, boxSizing: "border-box", padding: "24px 30px", background: PAPER, borderRadius: 16, fontSize: type, lineHeight: 1.25, color: INK }}>
        <Typing text={copy.prompt} typed={TIMES.type} reserve caretColor={HOT} />
      </div>
      <div style={{ position: "absolute", left: left(button), top: button.y, width: button.w, height: button.h, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 16, background: pressed > 0 ? HOT : INK, color: "#fff", fontSize: button.h * 0.46, fontWeight: 700 }}>
        {copy.button}
      </div>
      <div style={{ position: "absolute", left: left({ ...note, w: 500, h: 0 }), width: 500, top: note.y, fontSize: note.size, fontWeight: 600, color: HOT, opacity: noted }}>{copy.note}</div>
      <Rough shape={{ kind: "arrow", from: [x(arrowFrom[0]), arrowFrom[1]], to: [x(button.x + (ratio === "9x16" ? 300 : -66)), button.y + (ratio === "9x16" ? -58 : button.h / 2)], bend: x(bend) === bend ? bend : -bend }} draw={[92, 110]} stroke={HOT} strokeWidth={6} seed={7} />
      <Rough shape={{ kind: "lasso", cx: hit.x, cy: hit.y, w: button.w + 90, h: button.h + 80, loops: 1 }} draw={[106, 130]} stroke={HOT} strokeWidth={6} seed={5} />
      <Cursor keys={pointer} size={64} color="#fff" outline={INK} rippleColor={HOT} rippleSize={190} />
    </CameraView>
  );
}

function Line({ ratio, take }: AdProps) {
  const frame = useFrame();
  const { fps, width } = useVideo();
  const { x, left } = useMirror();
  const copy = COPY[take as "en" | "he"];
  const { caption: box, chip: label } = L[ratio];
  const now = TIMES.cut + frame; // Absolute frame: the timeline counts from the start of the ad.
  const t = now / fps;
  const at = copy.caption.split(" ").map((w) => said(tl, copy.track, w) * fps - TIMES.cut);
  const part = section(tl, t);
  const chip = spring(frame, { fps, stiffness: 180, damping: 14 });
  const level = energy(tl, "rms", now);
  const glow = 1 + 0.07 * pulse(tl.beats, t, 0.25);
  const wash = interpolate(frame, [0, 20, 90], [0, 1, 0.75]);
  const size = Math.min(width, 1200);
  const row = box.y + box.h + 110;

  return (
    <div style={{ position: "absolute", inset: 0, color: INK }}>
      <div style={{ position: "absolute", left: x(width / 2) - size / 2, top: box.y + box.h / 2 - size / 2, width: size, height: size, borderRadius: "50%", background: "#ffd9b0", opacity: wash, transform: `scale(${glow})` }} />
      <div style={{ position: "absolute", top: label.top, insetInlineStart: label.inset, display: "flex", alignItems: "center", gap: 20, fontSize: label.size, fontWeight: 600, transform: `scale(${chip})`, transformOrigin: "center" }}>
        <div style={{ width: 28, height: 28, borderRadius: 14, background: HOT, opacity: 0.35 + 0.65 * pulse(tl.beats, t) }} />
        {copy.sections[part.index]}
        <div style={{ width: 120, height: 10, background: "#0002" }}>
          <div style={{ width: `${beatPhase(tl, t) * 100}%`, height: "100%", background: INK }} />
        </div>
      </div>
      <Caption text={copy.caption} at={at} duration={12} style={{ position: "absolute", left: left(box), top: box.y, width: box.w, fontSize: box.size, fontWeight: 700, lineHeight: 1.16 }} />
      <Rough shape={{ kind: "line", from: [x(box.x), box.y + box.h + 30], to: [x(box.x + box.w), box.y + box.h + 18] }} draw={[30, 70]} stroke={HOT} strokeWidth={9} seed={3} />
      <div style={{ position: "absolute", insetInlineStart: box.x, top: box.y + box.h + 64, width: box.w * 0.6 * level, height: 14, background: INK, opacity: 0.2 }} />
      <Rough shape={{ kind: "rect", x: left({ ...box, x: box.x + box.w - 300, w: 300 }), y: row, w: 300, h: 110 }} draw={[40, 85]} stroke={INK} strokeWidth={4} fill={HOT} options={{ hachureGap: 14, fillWeight: 3 }} seed={11} />
      <Rough shape={{ kind: "ellipse", cx: x(box.x + box.w - 480), cy: row + 55, w: 180, h: 110 }} draw={[50, 80]} stroke={INK} fill={HOT} fillStyle="solid" seed={13} />
      <Rough shape={{ kind: "path", d: `M${x(box.x + box.w - 620)} ${row + 80} L${x(box.x + box.w - 700)} ${row + 20} L${x(box.x + box.w - 780)} ${row + 80} L${x(box.x + box.w - 860)} ${row + 20}` }} draw={[55, 90]} stroke={INK} strokeWidth={5} seed={17} />
    </div>
  );
}

function Logo({ size }: { size: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", color: PAPER, background: INK, borderRadius: size * 0.22, fontSize: size * 0.62, fontWeight: 700, lineHeight: 1, paddingBottom: size * 0.06, boxSizing: "border-box" }}>
      n
      <Rough shape={{ kind: "ellipse", cx: size / 2, cy: size / 2, w: size * 0.8, h: size * 0.8 }} draw={[6, 28]} stroke={HOT} strokeWidth={size / 40} seed={9} />
    </div>
  );
}

function Close({ ratio, take }: AdProps) {
  const { layout, align, tagline, url, logo, pad } = L[ratio].end;
  return (
    <EndCard
      logo={<Logo size={logo} />}
      tagline={COPY[take as "en" | "he"].tagline}
      url="nykma.example"
      at={4}
      layout={layout}
      align={align}
      gap={56}
      style={{ padding: pad, boxSizing: "border-box", color: INK, justifyContent: "center" }}
      taglineStyle={{ fontSize: tagline, fontWeight: 700, lineHeight: 1.15 }}
      urlStyle={{ fontSize: url, color: DEEP, fontWeight: 600 }}
    />
  );
}

export function PartsDemo(props: AdProps) {
  return (
    <div style={{ position: "absolute", inset: 0, background: PAPER, fontFamily: FONT }}>
      <Sequence duration={TIMES.cut}>
        <Prompt {...props} />
      </Sequence>
      <Sequence from={TIMES.cut} duration={TIMES.end - TIMES.cut}>
        <Line {...props} />
      </Sequence>
      <Sequence from={TIMES.end}>
        <Close {...props} />
      </Sequence>
    </div>
  );
}
