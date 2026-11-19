import { createContext, useContext, type ReactNode } from "react";
import type { Video } from "./ad";

export const FrameContext = createContext(0);
export const VideoContext = createContext<Video | null>(null);

/** The current frame, counted from the start of the enclosing `<Sequence>`. */
export const useFrame = () => useContext(FrameContext);

/** The video being shown: id, ratio, fps, frames, width, height, lang, dir, timeline. */
export function useVideo(): Video {
  const video = useContext(VideoContext);
  if (!video) throw new Error("useVideo() needs a <Stage> above it");
  return video;
}

/** Shows children for `duration` frames from `from`, with `useFrame()` starting at 0. Adds no DOM. */
export function Sequence({ from = 0, duration = Infinity, children }: { from?: number; duration?: number; children: ReactNode }) {
  const frame = useFrame();
  if (frame < from || frame >= from + duration) return null;
  return <FrameContext.Provider value={frame - from}>{children}</FrameContext.Provider>;
}
