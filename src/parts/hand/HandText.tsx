import { useId, type CSSProperties, type ReactNode } from "react";
import { asset, useFrame, useVideo } from "../../engine";
import type { HandGen, HandEntry } from "./types";
import { handEntry } from "./gen";
import { penAt, penBusy, penPlan, penProgress, type PenRun, type PenTip } from "./timeline";

export type HandTextProps = PenRun & {
  /** The id in the ad's hand.ts. */
  id: string;
  /** `mask` reveals the real font where the pen has been. `ink` makes the strokes the ink: marker, chalk. Paths are always ink. */
  mode?: "mask" | "ink";
  /** A stylus on the tip, or your own: it gets the tip, and draws around (0, 0) in output pixels. */
  pen?: boolean | ((tip: PenTip) => ReactNode);
  /** Font size in output pixels. Default: the size it was traced at. */
  size?: number;
  /** Or the box width in output pixels. This is how to size a path. */
  width?: number;
  /** Default: inherited. */
  color?: string;
  /** Multiplies the line width in `ink` mode. */
  weight?: number;
  /** Default: the strokes of the ad on the stage. */
  gen?: HandGen;
  style?: CSSProperties;
  className?: string;
};

const fontFace = ({ family, src }: { family: string; src: string }) =>
  `@font-face{font-family:"${family}";font-weight:1 1000;font-display:block;src:url("${asset(src)}")}`;

/** A fineliner held the way a right hand holds one. Drawn in output pixels, nib at (0, 0). */
function Stylus({ size, tip }: { size: number; tip: PenTip }) {
  const w = size * 0.1;
  const l = size * 1.7;
  const lean = 30 + 4 * Math.sin(tip.angle);
  return (
    <g transform={`translate(0 ${-tip.air * size * 0.09}) rotate(${lean})`}>
      <path d={`M0 0L${-w * 0.16} ${-w * 0.5}L${-w / 2} ${-w * 1.7}L${w / 2} ${-w * 1.7}L${w * 0.16} ${-w * 0.5}Z`} fill="#20242c" />
      <rect x={-w * 0.58} y={-w * 2.5} width={w * 1.16} height={w * 0.9} rx={w * 0.12} fill="#8d95a3" />
      <rect x={-w / 2} y={-l} width={w} height={l - w * 2.5} rx={w * 0.22} fill="#1c3f8f" />
      <rect x={-w * 0.17} y={-l} width={w * 0.34} height={l - w * 2.5} fill="#fff" opacity={0.18} />
    </g>
  );
}

function Pen({ entry, progress, frame, run, scale, size, pen }: {
  entry: HandEntry;
  progress: number;
  frame: number;
  run: PenRun;
  scale: number;
  size: number;
  pen: NonNullable<HandTextProps["pen"]>;
}) {
  const [start, end] = penBusy(run);
  const HOVER = 6;
  if (frame < start - HOVER || frame > end + HOVER) return null;
  const tip = penAt(entry, progress);
  const hovering = frame < start ? (start - frame) / HOVER : frame > end ? (frame - end) / HOVER : 0;
  const away = { ...tip, air: Math.max(tip.air, hovering) };
  return (
    <g transform={`translate(${tip.x} ${tip.y}) scale(${1 / scale})`} opacity={1 - hovering}>
      {pen === true ? <Stylus size={size} tip={away} /> : typeof pen === "function" ? pen(away) : null}
    </g>
  );
}

/**
 * Text that writes itself, stroke by stroke, off the strokes in the ad's hand.gen.json. Everything comes from the frame.
 *
 * Before the pen starts it draws nothing; after it stops it's the plain font, so the last frame is exact. It keeps its
 * box throughout, so it can sit in normal layout. Set where it goes with `style`.
 */
export function HandText({ id, write, erase, mode = "mask", pen = false, size, width, color = "currentColor", weight = 1, gen, style, className }: HandTextProps) {
  const frame = useFrame();
  const video = useVideo();
  const mask = `hand${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const entry = handEntry(gen ?? video.slug, id);
  const run: PenRun = { write, erase };
  const progress = penProgress(entry, frame, run);
  const { total, spans } = penPlan(entry);
  const [vx, vy, vw, vh] = entry.viewBox;

  const scale = width ? width / vw : size && entry.size ? size / entry.size : 1;
  const inked = mode === "ink" || entry.kind === "path";
  const started = progress > 0;
  const finished = progress >= total;

  const strokes = entry.strokes.map((stroke, i) => {
    const done = progress - spans[i].from;
    if (done <= 0) return null;
    const whole = done >= stroke.len;
    if (inked) {
      const share = Math.min(done / stroke.len, 1);
      return (
        <path
          key={i}
          d={stroke.core}
          pathLength={1}
          fill="none"
          stroke={color}
          strokeWidth={entry.ink * weight}
          strokeLinecap="round"
          strokeLinejoin="round"
          {...(whole ? {} : { strokeDasharray: "1 2", strokeDashoffset: 1 - share })}
        />
      );
    }
    return (
      <path
        key={i}
        d={stroke.d}
        pathLength={stroke.len}
        fill="none"
        stroke="#fff"
        strokeWidth={stroke.reveal}
        // Flat ends grow in smoothly; a round end would pop in as a dot at the start of every stroke.
        strokeLinecap="butt"
        strokeLinejoin="round"
        {...(whole ? {} : { strokeDasharray: `${stroke.len} ${stroke.len + 1}`, strokeDashoffset: stroke.len - done })}
      />
    );
  });

  return (
    <>
      {entry.font && <style href={`hand-font-${entry.font.family}`} precedence="hand">{fontFace(entry.font)}</style>}
      <svg
        viewBox={`${vx} ${vy} ${vw} ${vh}`}
        width={vw * scale}
        height={vh * scale}
        role="img"
        aria-label={entry.text ?? id}
        className={className}
        style={{ display: "block", overflow: "visible", ...style }}
      >
        {inked ? (
          strokes
        ) : (
          <>
            {started && !finished && (
              <defs>
                <mask id={mask} maskUnits="userSpaceOnUse" x={vx - entry.reveal} y={vy - entry.reveal} width={vw + entry.reveal * 2} height={vh + entry.reveal * 2}>
                  {strokes}
                </mask>
              </defs>
            )}
            {started && (
              <text
                x={entry.x}
                y={entry.y}
                direction={entry.dir}
                textAnchor="start"
                fontFamily={entry.font!.family}
                fontWeight={entry.font!.weight}
                fontSize={entry.size}
                fill={color}
                textRendering="geometricPrecision"
                style={{ whiteSpace: "pre", letterSpacing: 0, wordSpacing: 0, fontStyle: "normal" }}
                mask={finished ? undefined : `url(#${mask})`}
              >
                {entry.text}
              </text>
            )}
          </>
        )}
        {pen && <Pen entry={entry} progress={progress} frame={frame} run={run} scale={scale} size={size ?? (entry.size ? entry.size * scale : 160)} pen={pen} />}
      </svg>
    </>
  );
}
