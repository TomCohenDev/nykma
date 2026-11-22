/**
 * The viewer (spec.md §10.2): the whole video in story order, in board.html?viewer iframes at their exact size, scaled
 * to fit. "All" shows every ratio side by side at one height, playing together; the first carries the sound and the
 * clock. With picking on, hovering outlines a tagged element and clicking selects it (§10.13). The selected element
 * can be dragged to move it, or by a corner to scale it: the frames show it live, and on release the project saves it.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { Picked } from "../board/frame";
import { SIZES, ratioLabel, type Ratio, type TakeInfo } from "./api";

export type { Picked };
export type Box = Picked["box"];

/** What the project can do to the frames directly: show style values before they're saved, and end that. */
export type ViewerApi = { preview: (loc: string, style: Record<string, string>) => void; endPreview: (restore: boolean) => void };
/** Where the selected element sits now, from its code or its knob, so a drag starts from there. */
export type Placement = { x: number; y: number; scale: number };
export type Transform = { translate: [number, number] } | { scale: number };

type Props = {
  take: TakeInfo;
  ratios: Ratio[];
  frame: number;
  playing: boolean;
  picking: boolean;
  safe: boolean;
  /** Changes when the video itself changes (story, trims), so the frames load it again. */
  reloadKey: string;
  selectedLoc?: string;
  onFrame: (frame: number) => void;
  onEnded: () => void;
  onPick: (el: Picked | null, ratio: Ratio) => void;
  /** The selected element as the viewer last drew it. */
  onSelected?: (el: Picked, ratio: Ratio) => void;
  /** A key pressed while the viewer had focus, so the desk's shortcuts still work after a click in it. */
  onKey?: (key: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: Element; preventDefault: () => void }) => void;
  onError?: (message: string | null) => void;
  banner?: ReactNode;
  api?: MutableRefObject<ViewerApi | null>;
  /** The selected element's placement, or why it can't be dragged. */
  placement?: Placement | string;
  onTransform?: (el: Picked, change: Transform) => Promise<unknown>;
  /** A double click on the selected element: its text, if it has any, is edited in the inspector. */
  onEditText?: () => void;
};

type Dragging = { mode: "move" | "scale"; ratio: Ratio; dx: number; dy: number; factor: number; moved: boolean };

type Shown = { ratio: Ratio; id: string; scale: number; w: number; h: number };

const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

/** Safe areas as validate checks them: 6% at the sides, more at the bottom of a 9:16 for the feed's caption. */
const SAFE: Record<Ratio, { x: number; top: number; bottom: number }> = {
  "16x9": { x: 0.05, top: 0.06, bottom: 0.06 },
  "1x1": { x: 0.06, top: 0.06, bottom: 0.08 },
  "9x16": { x: 0.06, top: 0.1, bottom: 0.2 },
};

export function Viewer({ take, ratios, frame, playing, picking, safe, reloadKey, selectedLoc, onFrame, onEnded, onPick, onSelected, onKey, onError, banner, api, placement, onTransform, onEditText }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const frames = useRef<Map<Ratio, HTMLIFrameElement | null>>(new Map());
  const ready = useRef<Set<Ratio>>(new Set());
  const [hover, setHover] = useState<{ ratio: Ratio; el: Picked } | null>(null);
  const [boxes, setBoxes] = useState<Partial<Record<Ratio, Picked | null>>>({});
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  // After a drop the box stays where it was dropped until the frame reports the saved one.
  const settling = useRef(false);
  const live = useRef({ frame, playing, picking, selectedLoc, onFrame, onEnded, onPick, onSelected, onKey, onError });
  live.current = { frame, playing, picking, selectedLoc, onFrame, onEnded, onPick, onSelected, onKey, onError };

  useLayoutEffect(() => {
    const el = area.current!;
    const fit = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // One height for every ratio shown, as large as the area allows.
  const gap = 28;
  const pad = 28;
  const aspect = ratios.reduce((sum, ratio) => sum + SIZES[ratio].width / SIZES[ratio].height, 0);
  const height = Math.max(60, Math.min(size.h - pad * 2 - 22, (size.w - pad * 2 - gap * (ratios.length - 1)) / aspect));
  const shown: Shown[] = ratios.map((ratio) => {
    const { width, height: h } = SIZES[ratio];
    const scale = height / h;
    return { ratio, id: take.ratios.find((item) => item.ratio === ratio)?.id ?? "", scale, w: width * scale, h: height };
  });
  const lead = shown[0]?.ratio;

  const send = (ratio: Ratio, message: object) => frames.current.get(ratio)?.contentWindow?.postMessage(message, location.origin);
  const sendAll = (message: object) => shown.forEach((item) => send(item.ratio, message));

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.data?.nykma !== "board") return;
      const entry = [...frames.current.entries()].find(([, iframe]) => iframe?.contentWindow === event.source);
      if (!entry) return;
      const [ratio] = entry;
      const data = event.data;
      const now = live.current;
      if (data.type === "ready") {
        ready.current.add(ratio);
        setError(null);
        now.onError?.(null);
        send(ratio, { nykma: "frame", frame: now.frame });
        send(ratio, { nykma: "pick", on: now.picking });
        send(ratio, { nykma: "select", loc: now.selectedLoc ?? null });
        if (now.playing && ratio === lead) send(ratio, { nykma: "play", from: now.frame });
      } else if (data.type === "error") {
        setError(data.message);
        now.onError?.(data.message);
      } else if (data.type === "frame" && ratio === lead) now.onFrame(data.frame);
      else if (data.type === "ended" && ratio === lead) now.onEnded();
      else if (data.type === "hover") setHover(data.el ? { ratio, el: data.el } : null);
      else if (data.type === "pick") now.onPick(data.el, ratio);
      else if (data.type === "box") {
        setBoxes((current) => ({ ...current, [ratio]: data.el }));
        if (settling.current) (settling.current = false), setDragging(null);
        if (data.el && data.el.loc === now.selectedLoc) now.onSelected?.(data.el, ratio);
      } else if (data.type === "key") now.onKey?.({ ...data.event, target: document.body, preventDefault: () => {} });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead, ratios.join()]);

  // The frame goes to every view; while playing, the lead keeps its own clock and the others follow it.
  useEffect(() => {
    shown.forEach((item) => {
      if (!(playing && item.ratio === lead)) send(item.ratio, { nykma: "frame", frame });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);
  useEffect(() => {
    if (!lead) return;
    send(lead, playing ? { nykma: "play", from: live.current.frame } : { nykma: "pause" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, lead]);
  useEffect(() => {
    sendAll({ nykma: "pick", on: picking });
    if (!picking) setHover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking]);
  useEffect(() => {
    sendAll({ nykma: "select", loc: selectedLoc ?? null });
    if (!selectedLoc) setBoxes({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLoc]);
  useEffect(() => {
    ready.current.clear();
    setBoxes({});
  }, [reloadKey]);

  if (api)
    api.current = {
      preview: (loc, style) => sendAll({ nykma: "preview", loc, style }),
      endPreview: (restore) => sendAll({ nykma: "preview", loc: null, restore }),
    };

  /* Dragging the selected element: the body moves it (Shift keeps it on one axis), a corner scales it. */
  const grab = (event: ReactPointerEvent, item: Shown, el: Picked, mode: Dragging["mode"]) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const frameBox = (event.currentTarget as HTMLElement).closest(".viewer-frame")!.getBoundingClientRect();
    const x0 = event.clientX;
    const y0 = event.clientY;
    const cx = frameBox.left + (el.box.x + el.box.width / 2) * item.scale;
    const cy = frameBox.top + (el.box.y + el.box.height / 2) * item.scale;
    const d0 = Math.max(4, Math.hypot(x0 - cx, y0 - cy));
    const base = typeof placement === "object" ? placement : null;
    let last: Dragging = { mode, ratio: item.ratio, dx: 0, dy: 0, factor: 1, moved: false };
    const onMove = (e: PointerEvent) => {
      let dx = e.clientX - x0;
      let dy = e.clientY - y0;
      if (e.shiftKey && mode === "move") Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      const moved = last.moved || Math.hypot(dx, dy) > 3;
      const factor = mode === "scale" ? Math.max(0.05, Math.hypot(e.clientX - cx, e.clientY - cy) / d0) : 1;
      last = { mode, ratio: item.ratio, dx, dy, factor, moved };
      if (!moved || !base) return;
      setDragging(last);
      if (mode === "move") {
        const k = item.scale * el.local;
        send(item.ratio, { nykma: "preview", loc: el.loc, style: { translate: `${round(base.x + dx / k)}px ${round(base.y + dy / k)}px` } });
        shown.forEach((other) => other.ratio !== item.ratio && send(other.ratio, { nykma: "preview", loc: el.loc, style: { translate: `${round(base.x + dx / k)}px ${round(base.y + dy / k)}px` } }));
      } else sendAll({ nykma: "preview", loc: el.loc, style: { scale: String(round(base.scale * factor, 3)) } });
    };
    const onUp = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!last.moved) {
        // A click, not a drag: pick whatever is under the pointer, as a click in the frame would.
        setDragging(null);
        return send(item.ratio, { nykma: "pickAt", x: (e.clientX - frameBox.left) / item.scale, y: (e.clientY - frameBox.top) / item.scale });
      }
      if (!base || !onTransform) {
        setDragging(null);
        return;
      }
      const k = item.scale * el.local;
      const change: Transform = mode === "move" ? { translate: [Math.round(base.x + last.dx / k), Math.round(base.y + last.dy / k)] } : { scale: round(base.scale * last.factor, 2) };
      settling.current = true;
      onTransform(el, change).then(
        () => sendAll({ nykma: "preview", loc: null, restore: false }),
        () => {
          settling.current = false;
          setDragging(null);
          sendAll({ nykma: "preview", loc: null, restore: true });
        },
      );
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const outline = (item: Shown, el: Picked, kind: "hover" | "selected", key: string) => {
    const drag = kind === "selected" && dragging ? dragging : null;
    const movable = kind === "selected" && typeof placement === "object" && Boolean(onTransform);
    const box = { left: el.box.x * item.scale, top: el.box.y * item.scale, width: el.box.width * item.scale, height: el.box.height * item.scale };
    if (drag?.mode === "move") (box.left += drag.dx), (box.top += drag.dy);
    if (drag?.mode === "scale") {
      const w = box.width * drag.factor;
      const h = box.height * drag.factor;
      box.left -= (w - box.width) / 2;
      box.top -= (h - box.height) / 2;
      box.width = w;
      box.height = h;
    }
    return (
    <div
      key={key}
      className={`pick-box ${kind}${movable ? " movable" : ""}${drag ? " dragging" : ""}`}
      style={box}
      title={kind === "selected" ? (movable ? "Drag to move (Shift: one axis) · drag a corner to scale · double-click to edit its text" : typeof placement === "string" ? placement : undefined) : undefined}
      onPointerDown={kind === "selected" ? (event) => grab(event, item, el, "move") : undefined}
      onDoubleClick={kind === "selected" ? () => onEditText?.() : undefined}
    >
      {kind === "selected" && (
        <>
          {[0, 1, 2, 3].map((corner) => (
            <i key={corner} onPointerDown={movable ? (event) => grab(event, item, el, "scale") : undefined} />
          ))}
          <span className="pick-tag">
            {el.tag}
            {el.text ? ` · ${el.text.slice(0, 24)}` : ""}
          </span>
          {drag && <span className="pick-readout">{drag.mode === "move" ? `${Math.round(drag.dx / item.scale)}, ${Math.round(drag.dy / item.scale)}` : `${Math.round(drag.factor * 100)}%`}</span>}
        </>
      )}
    </div>
    );
  };

  return (
    <div className="viewer-area" ref={area}>
      {banner && <div className="viewer-banner">{banner}</div>}
      <div className="viewer-row" style={{ gap }}>
        {shown.map((item) => {
          const selected = boxes[item.ratio];
          const hovered = !dragging && hover && hover.ratio === item.ratio && hover.el.loc !== selectedLoc ? hover.el : null;
          const s = SAFE[item.ratio];
          return (
            <figure key={item.ratio} className="viewer-mon">
              {ratios.length > 1 && <figcaption>{ratioLabel(item.ratio)}</figcaption>}
              <div className={`viewer-frame${picking ? " picking" : ""}`} style={{ width: item.w, height: item.h }}>
                <iframe
                  key={`${item.id}:${reloadKey}`}
                  ref={(el) => void frames.current.set(item.ratio, el)}
                  title={`${take.name} ${item.ratio}`}
                  src={`/board.html?id=${encodeURIComponent(item.id)}&viewer`}
                  style={{ width: SIZES[item.ratio].width, height: SIZES[item.ratio].height, transform: `scale(${item.scale})` }}
                />
                {safe && <div className="safe-area" style={{ left: `${s.x * 100}%`, right: `${s.x * 100}%`, top: `${s.top * 100}%`, bottom: `${s.bottom * 100}%` }} />}
                {hovered && outline(item, hovered, "hover", "hover")}
                {selected && outline(item, selected, "selected", "selected")}
              </div>
            </figure>
          );
        })}
      </div>
      {error && <div className="viewer-error">This ad didn't draw: {error}</div>}
    </div>
  );
}
