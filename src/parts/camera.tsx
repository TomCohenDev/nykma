import type { CSSProperties, ReactNode } from "react";
import { useVideo } from "../engine";
import { between, lerp, type Ease } from "./time";

/** A camera: world point (cx, cy) sits at the centre of the view, at zoom z. */
export type Cam = { cx: number; cy: number; z: number };
export type CamKey = Cam & { f: number; ease?: Ease };

/** The camera at frame `f`: eased position, with zoom in log space so pushes feel even. */
export function camAt(f: number, keys: readonly CamKey[]): Cam {
  const [a, b, k] = between(f, keys);
  return { cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)) };
}

/** Films its children, placed in world pixels, through `cam`. Sized to the video unless told otherwise. */
export function CameraView({ cam, width, height, style, children }: { cam: Cam; width?: number; height?: number; style?: CSSProperties; children: ReactNode }) {
  const video = useVideo();
  const w = width ?? video.width;
  const h = height ?? video.height;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, overflow: "hidden", ...style }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, transformOrigin: "0 0", transform: `translate(${w / 2}px, ${h / 2}px) scale(${cam.z}) translate(${-cam.cx}px, ${-cam.cy}px)` }}>
        {children}
      </div>
    </div>
  );
}
