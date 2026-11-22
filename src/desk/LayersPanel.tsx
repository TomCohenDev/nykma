/**
 * The Layers tab (spec.md §10.15): every selectable element on the frame under the playhead, in the order the page
 * draws them, indented by how deep each sits. A click selects it, as a click on it in the viewer would, so one hidden
 * behind another or too small to hit is one row away; hovering a row outlines it in the viewer. An element drawn in a
 * list is one row (×n). Elements that aren't showing on this frame are left out, or shown dimmed.
 */
import { useEffect, useRef, useState } from "react";
import type { Layer, Look } from "./Viewer";

type Props = {
  layers: Layer[] | null;
  /** The frame's width over its height, for the little maps. */
  aspect: number;
  selectedLoc?: string;
  onPick: (loc: string) => void;
  onHover: (loc: string | null) => void;
};

/** Light text needs a dark chip behind it, and dark text a light one. */
function lightness(color: string) {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(color);
  return m ? (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255 : 0.5;
}

/**
 * A small picture of the element: its fill, its image or drawing, its first letters in its own colour; or, for a
 * container with nothing of its own, where its box sits in the frame.
 */
function Thumb({ look, aspect }: { look: Look; aspect: number }) {
  const { fill, src, glyph, box } = look;
  if (!fill && !src && !glyph) {
    // The frame in its own shape, and the element's box in it.
    const h = 22;
    const w = Math.max(10, Math.round(h * aspect));
    const clip = (v: number) => Math.min(Math.max(v, 0), 1);
    const x0 = clip(box.x), y0 = clip(box.y), x1 = clip(box.x + box.w), y1 = clip(box.y + box.h);
    return (
      <span className="layer-thumb map" aria-hidden>
        <span className="map-frame" style={{ width: w, height: h }}>
          <span className="map-box" style={{ left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${Math.max((x1 - x0) * 100, 4)}%`, height: `${Math.max((y1 - y0) * 100, 4)}%` }} />
        </span>
      </span>
    );
  }
  const ground = glyph && !fill && !src ? (lightness(glyph.color) > 0.6 ? "#2a2a2a" : "#f1f0f6") : undefined;
  return (
    <span className="layer-thumb" aria-hidden style={{ background: ground }}>
      {fill && <span className="thumb-fill" style={{ backgroundColor: fill.color, backgroundImage: fill.image, borderRadius: `${(fill.radius ?? 0) * 100}%` }} />}
      {src && <img className="thumb-img" src={src} alt="" loading="lazy" draggable={false} />}
      {glyph && !src && (
        <span className="thumb-glyph" dir="auto" style={{ color: glyph.color, fontWeight: Number(glyph.weight) || 600 }}>
          {glyph.text}
        </span>
      )}
    </span>
  );
}

const where = (loc: string) => loc.replace(/^src\/(ads\/[^/]+|parts)\//, "").replace(/\.tsx?:(\d+):\d+$/, ":$1");

export function LayersPanel({ layers, aspect, selectedLoc, onPick, onHover }: Props) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem("nykma.layers.hidden") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("nykma.layers.hidden", hidden ? "1" : "0");
    } catch {
      /* fine without it */
    }
  }, [hidden]);
  const list = useRef<HTMLOListElement>(null);
  // The selected row stays in view when the selection comes from the viewer.
  useEffect(() => {
    list.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  }, [selectedLoc]);

  if (!layers) return <p className="panel-empty">Open a scene of the ad to see its elements.</p>;
  const rows = hidden ? layers : layers.filter((layer) => layer.shown);
  const off = layers.length - layers.filter((layer) => layer.shown).length;
  return (
    <div className="layers">
      <div className="layers-head">
        <span>
          {rows.length} on this frame{off > 0 && !hidden ? ` · ${off} not showing` : ""}
        </span>
        {off > 0 && (
          <label className="layers-toggle">
            <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} />
            Show hidden
          </label>
        )}
      </div>
      {rows.length === 0 && <p className="panel-empty">Nothing on this frame can be selected.</p>}
      <ol className="layer-tree" ref={list} onPointerLeave={() => onHover(null)}>
        {rows.map((layer) => (
          <li key={layer.loc}>
            <button
              className={`${layer.loc === selectedLoc ? "on" : ""}${layer.shown ? "" : " off"}${layer.loc.startsWith("src/parts/") ? " parts" : ""}`}
              style={{ paddingInlineStart: 8 + Math.min(layer.depth, 10) * 12 }}
              title={`${layer.loc}${layer.shown ? "" : " · not showing on this frame"}`}
              onPointerEnter={() => onHover(layer.loc)}
              onClick={() => onPick(layer.loc)}
            >
              <Thumb look={layer.look} aspect={aspect} />
              <span className="layer-tag">{layer.tag}</span>
              <span className="layer-text" dir="auto">
                {layer.text || <span className="layer-where">{where(layer.loc)}</span>}
              </span>
              {layer.count > 1 && <span className="layer-count">×{layer.count}</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
