import type { CSSProperties, ReactNode } from "react";
import { asset, useFrame, useVideo } from "../engine";
import { isolate } from "./bidi";
import { easings, prog, type Ease } from "./time";

type Props = {
  logo?: ReactNode; // An element, or an image path under public/.
  tagline?: string;
  url?: string;
  at?: number;
  stagger?: number;
  duration?: number;
  ease?: Ease;
  layout?: "stack" | "row"; // Row puts the logo at the reading start, beside the text.
  align?: "start" | "center";
  gap?: number;
  shift?: number; // Slide along the reading direction, in pixels.
  kinetic?: (p: number, item: number) => CSSProperties; // Replaces the default fade and slide. Items: 0 logo, 1 tagline, 2 URL.
  style?: CSSProperties;
  logoStyle?: CSSProperties;
  taglineStyle?: CSSProperties;
  urlStyle?: CSSProperties;
};

/** Logo, tagline and URL, arriving in turn from frame `at`. Follows the video's direction, so a Hebrew card mirrors. */
export function EndCard({ logo, tagline, url, at = 0, stagger = 8, duration = 14, ease = easings.outCubic, layout = "stack", align = "center", gap = 32, shift = 40, kinetic, style, logoStyle, taglineStyle, urlStyle }: Props) {
  const frame = useFrame();
  const { dir } = useVideo();
  const from = dir === "rtl" ? shift : -shift;
  const look = (item: number) => {
    const p = prog(frame, [at + item * stagger, at + item * stagger + duration], ease);
    return kinetic?.(p, item) ?? { opacity: p, transform: `translateX(${from * (1 - p)}px)` };
  };
  const place = align === "center" ? "center" : "flex-start";
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: layout === "row" ? "row" : "column", alignItems: layout === "row" ? "center" : place, justifyContent: layout === "row" ? place : "center", gap, ...style }}>
      {logo && (
        <div style={{ ...logoStyle, ...look(0) }}>
          {typeof logo === "string" ? <img src={asset(logo)} alt="" style={{ display: "block", width: "100%" }} /> : logo}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", alignItems: place, gap: gap / 2, textAlign: align }}>
        {tagline && <div style={{ ...taglineStyle, ...look(1) }}>{isolate(tagline, dir)}</div>}
        {url && <bdi dir="ltr" style={{ display: "block", ...urlStyle, ...look(2) }}>{url}</bdi>}
      </div>
    </div>
  );
}
