import { useEffect, type CSSProperties, type ReactNode } from "react";
import { asset } from "./asset";
import type { Video } from "./ad";
import type { Ratio } from "./ratio";
import { useFrame, useVideo, VideoContext } from "./timing";

/** src/ads/<slug>/<clip>.screen.json, written by py/screen.py: the screen's corners in every frame of the clip. */
export type ScreenTrack = {
  clip: string;
  method: "green" | "corners";
  width: number;
  height: number;
  fps: number;
  frames: number;
  /** The frames with the screen's green light taken out of the room, under the ad. Under public/, ##### from 1. */
  plate: string;
  /**
   * The `box` the screen moves in, cut from each plate frame with a see-through hole where the screen shows, laid over
   * the ad, so a hand or a head in front of the screen stays in front.
   */
  front: string;
  box: [x: number, y: number, width: number, height: number];
  filled: number;
  /** Per clip frame: top-left, top-right, bottom-right, bottom-left, in the clip's pixels. */
  corners: [number, number][][];
};

type ScreenInsertProps = {
  /** `import pc from "./pc.screen.json"`. */
  track: ScreenTrack;
  /** What plays on the screen, laid out at `size`. Inside it, useVideo() says the screen's size and shape. */
  children: ReactNode;
  /** The screen's own pixels: 1920×1080 for a monitor, 1170×2532 for a phone held upright. */
  size?: [width: number, height: number];
  /** Timing, as <Footage>: the trim in, speed, or a clip time for each frame of the ad. */
  from?: number;
  speed?: number;
  at?: (frame: number) => number;
  loop?: boolean;
  /** Framing in the ad's shape, as <Footage> with fit "cover". */
  focus?: [x: number, y: number];
  zoom?: number;
  /** On the screen's picture, to sit it in the shot: `{ filter: "brightness(0.92) blur(0.4px)" }`. */
  screenStyle?: CSSProperties;
  /** Clip pixels the picture reaches past the found edges, so no green edge shows. The front covers the rest. */
  bleed?: number;
  /**
   * More of what useVideo() says inside the screen. A scene borrowed from another ad needs that ad's slug, since its
   * handwriting and files are looked up by slug: `video={{ slug: "bake-nykma" }}`.
   */
  video?: Partial<Video>;
};

/** The corners pushed out from their middle by `px`. */
const grow = (corners: [number, number][], px: number): [number, number][] => {
  const cx = corners.reduce((sum, [x]) => sum + x, 0) / 4;
  const cy = corners.reduce((sum, [, y]) => sum + y, 0) / 4;
  return corners.map(([x, y]) => {
    const length = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / length) * px, y + ((y - cy) / length) * px];
  });
};

/**
 * Maps a size×size rectangle onto four corners, as a CSS matrix3d (Heckbert's square-to-quad, scaled to the size).
 * Corners are top-left, top-right, bottom-right, bottom-left.
 */
export function quadMatrix(corners: [number, number][], [width, height]: [number, number]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const a = (x1 - x0 + g * x1) / width, b = (x3 - x0 + h * x3) / height;
  const d = (y1 - y0 + g * y1) / width, e = (y3 - y0 + h * y3) / height;
  g /= width;
  h /= height;
  return `matrix3d(${[a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, x0, y0, 0, 1].map((n) => +n.toFixed(10)).join(",")})`;
}

const numbered = (pattern: string, index: number) => pattern.replace(/#+/, (run) => String(index + 1).padStart(run.length, "0"));

/**
 * The next frames, fetched ahead while the preview plays, so it doesn't wait on each one. Only the browser's cache:
 * what a frame shows doesn't depend on it, and the render waits for every image anyway. Not decoded here: that decode
 * isn't the one the page paints with, so it would only be done twice.
 */
const AHEAD = 12;
const warm = new Map<string, HTMLImageElement>();
function warmUp(urls: string[]) {
  for (const url of urls) {
    if (warm.has(url)) continue;
    const image = new Image();
    image.src = url;
    warm.set(url, image);
  }
  for (const url of warm.keys()) {
    if (warm.size <= AHEAD * 4) break;
    warm.delete(url);
  }
}

/**
 * A clip with the ad playing on a screen in it (spec.md §6.7): someone at a computer, and the computer showing your
 * scene, frame for frame. The clip's screen was found by py/screen.py. Your scene is laid out at the screen's `size`,
 * warped onto its corners in each frame, over the clip's frame, and the screen's box goes over it with a hole where the
 * screen shows, so a hand or a head in front of the screen stays in front. All images, no CSS mask, so the preview never
 * flashes while a frame loads. It fills the frame, cropped to the ad's shape like <Footage fit="cover">.
 */
export function ScreenInsert({ track, children, size = [1920, 1080], from = 0, speed = 1, at, loop, focus = [0.5, 0.5], zoom = 1, screenStyle, bleed = 2, video: inner }: ScreenInsertProps) {
  const frame = useFrame();
  const video = useVideo();
  const time = at ? at(frame) : from + (frame / video.fps) * speed;
  const raw = Math.floor(time * track.fps + 1e-6);
  const index = loop ? ((raw % track.frames) + track.frames) % track.frames : Math.min(Math.max(raw, 0), track.frames - 1);

  // Cover: scale the clip to fill the ad's frame, keeping `focus` in place, then punch in by `zoom`.
  const scale = Math.max(video.width / track.width, video.height / track.height) * zoom;
  const x = (video.width - track.width * scale) * focus[0];
  const y = (video.height - track.height * scale) * focus[1];
  const fill: CSSProperties = { position: "absolute", left: 0, top: 0, width: track.width, height: track.height };
  // The children see the screen as their video: its size, and the shape nearest it, so any scene lays out for it.
  const shape: Ratio = size[0] > size[1] * 1.2 ? "16x9" : size[1] > size[0] * 1.2 ? "9x16" : "1x1";
  const onScreen: Video = { ...video, width: size[0], height: size[1], ratio: shape, ...inner };
  useEffect(() => {
    const step = Math.max(1, speed);
    const next = Array.from({ length: AHEAD }, (_, k) => Math.round(index + (k + 1) * step)).filter((i) => loop || i < track.frames);
    warmUp(next.flatMap((i) => [asset(numbered(track.plate, i % track.frames)), asset(numbered(track.front, i % track.frames))]));
  }, [index, speed, loop, track]);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{ ...fill, transform: `translate(${x}px, ${y}px) scale(${scale})`, transformOrigin: "0 0" }}>
        <img src={asset(numbered(track.plate, index))} alt="" style={fill} />
        <div style={{ ...fill, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: size[0],
              height: size[1],
              overflow: "hidden",
              transformOrigin: "0 0",
              transform: quadMatrix(grow(track.corners[index], bleed), size),
              ...screenStyle,
            }}
          >
            <VideoContext.Provider value={onScreen}>{children}</VideoContext.Provider>
          </div>
        </div>
        <img
          src={asset(numbered(track.front, index))}
          alt=""
          style={{ position: "absolute", left: track.box[0], top: track.box[1], width: track.box[2], height: track.box[3] }}
        />
      </div>
    </div>
  );
}
