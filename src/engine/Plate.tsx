import type { CSSProperties } from "react";
import { asset } from "./asset";
import { useFrame } from "./timing";

type PlateProps = {
  /** A still ("ads/x/bg.png"), or a sequence where a run of # is the file number ("ads/x/city/####.png"). */
  src: string;
  /** File number of frame 0. Blender and ffmpeg both start at 1. */
  first?: number;
  /** Files in the sequence. Past the end it holds the last one, or wraps with `loop`. */
  length?: number;
  loop?: boolean;
  style?: CSSProperties;
  className?: string;
};

/** A full-bleed image for the current frame: a Blender layer, an unpacked screen recording, or a still. */
export function Plate({ src, first = 1, length, loop, style, className }: PlateProps) {
  const frame = useFrame();
  const index = length === undefined ? frame : loop ? frame % length : Math.min(frame, length - 1);
  const file = src.replace(/#+/, (run) => String(first + index).padStart(run.length, "0"));
  return (
    <img
      src={asset(file)}
      alt=""
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...style }}
    />
  );
}
