import type { CSSProperties } from "react";
import { asset } from "./asset";
import { useFrame, useVideo } from "./timing";

type FootageProps = {
  /** The frames `bun run footage` wrote: "ads/x/gen/footage/run/#####.jpg". */
  src: string;
  /** The clip's own rate and length, as `bun run footage` printed them. */
  fps: number;
  frames: number;
  /** Seconds into the clip where this starts: the trim in. */
  from?: number;
  /** 0.5 is half speed. Slow motion is smooth up to the clip's own rate over the ad's. */
  speed?: number;
  /** The clip's time in seconds for each frame of the ad, for ramps and freezes. Replaces `from` and `speed`. */
  at?: (frame: number) => number;
  /** Past the end it holds the last frame, or wraps with `loop`. */
  loop?: boolean;
  fit?: "cover" | "contain";
  /** The point that stays in frame when the shape crops the clip: [0.5, 0.5] is the middle, [0.3, 0.4] left of it and up. */
  focus?: [x: number, y: number];
  /** A punch in around `focus`: 1.2 is 20% closer. */
  zoom?: number;
  style?: CSSProperties;
  className?: string;
};

/**
 * Real footage, frame-exact (spec.md §6.5): the frame of the clip that falls on this frame of the ad. The clip keeps its
 * own rate, so the ad's frame is turned into the clip's time and then into its frame.
 */
export function Footage({ src, fps, frames, from = 0, speed = 1, at, loop, fit = "cover", focus = [0.5, 0.5], zoom = 1, style, className }: FootageProps) {
  const frame = useFrame();
  const video = useVideo();
  const time = at ? at(frame) : from + (frame / video.fps) * speed;
  const raw = Math.floor(time * fps + 1e-6);
  const index = loop ? ((raw % frames) + frames) % frames : Math.min(Math.max(raw, 0), frames - 1);
  const file = src.replace(/#+/, (run) => String(index + 1).padStart(run.length, "0"));
  const origin = `${focus[0] * 100}% ${focus[1] * 100}%`;
  return (
    <img
      src={asset(file)}
      alt=""
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: fit,
        objectPosition: origin,
        ...(zoom !== 1 ? { transform: `scale(${zoom})`, transformOrigin: origin } : {}),
        ...style,
      }}
    />
  );
}
