import { useFrame, type AdProps, type Layout, type Scene } from "../../engine";

/**
 * The desk's test ad for scenes and stories (spec.md §10.4): three 2 s scenes, each a colour and a number, so the
 * order the arrows make is plain on the board and in the render. Drag 1 → 3 and 3 → 2, and it plays 1, 3, 2.
 */
const L: Layout<{ size: number; label: number }> = {
  "16x9": { size: 520, label: 64 },
  "1x1": { size: 460, label: 56 },
  "9x16": { size: 560, label: 64 },
};

const font = '"Segoe UI", Arial, sans-serif';
const ease = (t: number) => 1 - (1 - Math.min(Math.max(t, 0), 1)) ** 3;

function card(n: number, name: string, ground: string, ink: string) {
  return function Card({ ratio }: AdProps) {
    const frame = useFrame();
    const { size, label } = L[ratio];
    const pop = ease(frame / 14);
    return (
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: ground, fontFamily: font, color: ink }}>
        <div style={{ textAlign: "center", transform: `translateY(${(1 - pop) * 80}px)`, opacity: pop }}>
          <div style={{ fontSize: size, fontWeight: 800, lineHeight: 0.9 }}>{n}</div>
          <div style={{ marginTop: 30, fontSize: label, fontWeight: 600, opacity: 0.8 }}>{name}</div>
          <div style={{ width: 600 * (frame / 59), height: 10, margin: "40px auto 0", background: ink, opacity: 0.5 }} />
        </div>
      </div>
    );
  };
}

export const scenes: Scene[] = [
  { id: "one", name: "One", component: card(1, "the first scene", "#0d99ff", "#ffffff"), frames: 60 },
  { id: "two", name: "Two", component: card(2, "the second scene", "#ffa629", "#1e1e1e"), frames: 60 },
  { id: "three", name: "Three", component: card(3, "the third scene", "#14ae5c", "#ffffff"), frames: 60 },
];
