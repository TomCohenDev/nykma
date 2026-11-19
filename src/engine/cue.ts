/**
 * A sound cue. Everything is in frames of the ad, so sound and picture read from the same timing.
 *
 *   src     file under public/, e.g. "ads/smoke/blip.wav"
 *   at      frame it starts on (default 0)
 *   volume  linear gain (default 1)
 *   fade    frames of fade-out, or [in, out]
 *   trim    frames of the source to skip, or [from, to] to use only that part
 *
 * The preview plays the list and the render mixes it. This file imports nothing, so Node scripts can load it directly.
 */
export type Cue = {
  src: string;
  at?: number;
  volume?: number;
  fade?: number | [fadeIn: number, fadeOut: number];
  trim?: number | [from: number, to: number];
};

/** Where a cue lands, in seconds. */
export type CueSpan = { start: number; offset: number; length: number; fadeIn: number; fadeOut: number; volume: number };

/** Works out a cue against its source file and the ad's end. `null` if there's nothing to play. */
export function cueSpan(cue: Cue, fps: number, frames: number, sourceSeconds: number): CueSpan | null {
  const [from, to] = typeof cue.trim === "number" ? [cue.trim, Infinity] : (cue.trim ?? [0, Infinity]);
  const [fadeIn, fadeOut] = typeof cue.fade === "number" ? [0, cue.fade] : (cue.fade ?? [0, 0]);
  const start = (cue.at ?? 0) / fps;
  const offset = from / fps;
  const length = Math.min(Math.min(to / fps, sourceSeconds) - offset, frames / fps - start);
  if (length <= 0) return null;
  return {
    start,
    offset,
    length,
    fadeIn: Math.min(fadeIn / fps, length),
    fadeOut: Math.min(fadeOut / fps, length),
    volume: cue.volume ?? 1,
  };
}
