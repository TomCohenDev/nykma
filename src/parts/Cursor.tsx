import type { CSSProperties, ReactNode } from "react";
import { useFrame } from "../engine";
import { between, easings, lerp, prog, type Ease } from "./time";

/** One stop of a pointer's path, in the parent's pixels. `click` fires when it arrives at frame `f`. */
export type CursorKey = { f: number; x: number; y: number; click?: boolean; ease?: Ease };

export function cursorAt(f: number, keys: readonly CursorKey[]) {
  const [a, b, k] = between(f, keys);
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) };
}

type Props = {
  keys: readonly CursorKey[];
  size?: number; // Pointer height in pixels.
  color?: string;
  outline?: string;
  rippleColor?: string;
  rippleSize?: number; // Largest ripple diameter.
  rippleFrames?: number;
  children?: ReactNode; // Your own pointer, tip at (0, 0).
  style?: CSSProperties;
};

/** A keyframed pointer with click ripples. */
export function Cursor({ keys, size = 40, color = "#fff", outline = "#000", rippleColor = "currentColor", rippleSize = 120, rippleFrames = 18, children, style }: Props) {
  const f = useFrame();
  const { x, y } = cursorAt(f, keys);
  const clicks = keys.filter((key) => key.click);
  const press = Math.max(0, ...clicks.map((key) => 1 - Math.abs(f - key.f) / 4)); // Dips for a few frames around each click.
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, pointerEvents: "none", transform: `translate(${x}px, ${y}px)`, ...style }}>
      {clicks.map((key) => {
        if (f < key.f || f >= key.f + rippleFrames) return null;
        const p = prog(f, [key.f, key.f + rippleFrames], easings.outCubic);
        const d = rippleSize * p;
        return (
          <div
            key={key.f}
            style={{ position: "absolute", left: key.x - x - d / 2, top: key.y - y - d / 2, width: d, height: d, borderRadius: "50%", boxSizing: "border-box", border: `${Math.max(rippleSize / 24, 1)}px solid ${rippleColor}`, opacity: 1 - p }}
          />
        );
      })}
      <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `scale(${1 - 0.14 * press})` }}>
        {children ?? (
          <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", overflow: "visible" }}>
            <path d="M1 1 L1 19.5 L6 15 L9.5 22.5 L13 21 L9.6 13.6 L16.2 13.6 Z" fill={color} stroke={outline} strokeWidth={1.4} strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  );
}
