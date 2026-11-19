import type { CSSProperties } from "react";
import { asset } from "../../engine";
import { SLUG, clamp } from "./fx";
import firsts from "./firsts.json";

/**
 * The local LTX clips (gen.json, made on this PC), keyed on this PC to transparent WebP frames under
 * public/ads/etzba-achat/keyed/<id>/. Each clip started from its still composited onto a key colour, and firsts.json
 * records where: canvas = still × scale + offset. So a clip is placed with the same centre and height as its still,
 * and every ratio's layout carries over. The time is in the clip's seconds, so a scene can slow, loop or reverse it.
 */
const FPS = 24;
const CLIPS = {
  "rival-frenzy-v": { frames: 145, w: 704, h: 704, still: [1254, 1254] },
  "rival-stride-v": { frames: 193, w: 704, h: 1280, still: [941, 1672] },
  "rival-laugh-v": { frames: 73, w: 704, h: 704, still: [941, 1672] },
  "chad-walk-v": { frames: 97, w: 704, h: 1280, still: [941, 1672] },
  "chad-stride-v": { frames: 193, w: 704, h: 1280, still: [940, 1672] },
  "chad-finger-v": { frames: 97, w: 1088, h: 1088, still: [1254, 1254] },
  "chad-blow-v": { frames: 73, w: 1088, h: 1088, still: [1254, 1254] },
} as const;
export type ClipId = keyof typeof CLIPS;

export const clipSeconds = (id: ClipId) => (CLIPS[id].frames - 1) / FPS;

/** Forward and back over [0, len], for a loop with no jump. */
export const pingpong = (t: number, len: number) => {
  const k = ((t % (2 * len)) + 2 * len) % (2 * len);
  return k <= len ? k : 2 * len - k;
};

export function Clip({ id, cx, cy, h, sec, flip = false, rotate = 0, filter, opacity = 1, style }: {
  id: ClipId; cx: number; cy: number; h: number; sec: number; flip?: boolean; rotate?: number; filter?: string; opacity?: number; style?: CSSProperties;
}) {
  const c = CLIPS[id];
  const place = (firsts as Record<string, { canvas: number[]; scale: number; offset: number[] }>)[id];
  const k = h / c.still[1]; // screen px per still px
  const r = c.w / place.canvas[0]; // clip px per canvas px
  const sc = k / (place.scale * r); // screen px per clip px
  const left = cx - (c.still[0] * k) / 2 - (place.offset[0] * k) / place.scale;
  const top = cy - h / 2 - (place.offset[1] * k) / place.scale;
  const index = Math.round(clamp(sec, 0, clipSeconds(id)) * FPS) + 1;
  const file = asset(`ads/${SLUG}/keyed/${id}/${String(index).padStart(5, "0")}.webp`);
  return (
    <div style={{ position: "absolute", inset: 0, transformOrigin: `${cx}px ${cy}px`, transform: `${flip ? "scaleX(-1) " : ""}rotate(${rotate}deg)`, opacity, pointerEvents: "none", ...style }}>
      <img src={file} alt="" style={{ position: "absolute", left, top, width: c.w * sc, height: c.h * sc, filter }} />
    </div>
  );
}
