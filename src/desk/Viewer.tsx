/**
 * The viewer (spec.md §10.2): the whole video in story order, in board.html?viewer iframes at their exact size, scaled
 * to fit. "All" shows every ratio side by side at one height, playing together; the first carries the sound and the
 * clock. With picking on, hovering outlines a tagged element and clicking selects it (§10.13). The selected element
 * can be dragged to move it, or by a corner to scale it: the frames show it live, and on release the project saves it.
 * A click on the selection picks what's under it, and a right click lists everything at that point, so an element
 * covering the frame never hides the ones behind it. The frame sits in a margin, so a full-frame element's outline shows.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { Layer, Look, Picked, Sample } from "../board/frame";
import { SIZES, ratioLabel, type Ratio, type TakeInfo } from "./api";

export type { Layer, Look, Picked, Sample };
export type Box = Picked["box"];

/** What the project can do to the frames directly: show style values before they're saved, end that, and read the ad's look. */
export type ViewerApi = {
  preview: (loc: string, style: Record<string, string>) => void;
  endPreview: (restore: boolean) => void;
  /** The ad's font and colours on the frame shown in that ratio (the Add tab starts new elements from it). */
  sample: (ratio?: Ratio) => Promise<Sample | null>;
  /** Every tagged element on that ratio's frame, for the Layers tab. */
  layers: (ratio?: Ratio) => Promise<Layer[] | null>;
  /** Selects an element by its tag, as a click on it would; or outlines it (null: none). */
  pickLoc: (loc: string, ratio?: Ratio) => void;
  hoverLoc: (loc: string | null, ratio?: Ratio) => void;
};
/** What a drag snaps to: the frame's edges and centre lines, the safe areas, and the other elements on the frame. */
export type Snap = { on: boolean; frame: boolean; safe: boolean; elements: boolean };
/** How close, in screen pixels, a drag comes to a line before it snaps to it. */
const SNAP_PX = 7;

/** The nearest line within reach of any of the points, and how far to move to sit on it. */
function nearest(points: number[], lines: number[], reach: number) {
  let best: { delta: number; at: number } | null = null;
  for (const point of points)
    for (const line of lines) {
      const delta = line - point;
      if (Math.abs(delta) <= reach && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: line };
    }
  return best;
}

/** What the Add tab drags onto the viewer. */
export const ADD_TYPE = "application/x-nykma-add";
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
  /** Something from the Add tab is being dragged: the frames take the drop. */
  adding?: boolean;
  /** Dropped at x, y (fractions of the frame) in that ratio. */
  onAdd?: (ratio: Ratio, x: number, y: number, what: string) => void;
  /** Snapping while an element is moved or scaled. */
  snap?: Snap;
};

type Dragging = { mode: "move" | "scale"; ratio: Ratio; dx: number; dy: number; factor: number; moved: boolean };

type Shown = { ratio: Ratio; id: string; scale: number; w: number; h: number };

/** The right-click list: every tagged element at a point, topmost first. */
type Menu = { ratio: Ratio; x: number; y: number; items: Picked[] };

/** How long a click on the selection waits to see whether it's the start of a double click. */
const DOUBLE_MS = 280;

const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

/** Safe areas as validate checks them: 6% at the sides, more at the bottom of a 9:16 for the feed's caption. */
const SAFE: Record<Ratio, { x: number; top: number; bottom: number }> = {
  "16x9": { x: 0.05, top: 0.06, bottom: 0.06 },
  "1x1": { x: 0.06, top: 0.06, bottom: 0.08 },
  "9x16": { x: 0.06, top: 0.1, bottom: 0.2 },
};

export function Viewer({ take, ratios, frame, playing, picking, safe, reloadKey, selectedLoc, onFrame, onEnded, onPick, onSelected, onKey, onError, banner, api, placement, onTransform, onEditText, adding, onAdd, snap }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const frames = useRef<Map<Ratio, HTMLIFrameElement | null>>(new Map());
  const ready = useRef<Set<Ratio>>(new Set());
  const [hover, setHover] = useState<{ ratio: Ratio; el: Picked; under?: boolean } | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  // A click on the selection waits for a possible second click before it picks what's under it.
  const pending = useRef<number | null>(null);
  // When a click inside the frame last picked something, so a second click on its new box counts as a double click.
  const pickedAt = useRef(0);
  // Answers to `sample`, by id.
  const samples = useRef(new Map<number, (answer: any) => void>());
  const [dropAt, setDropAt] = useState<{ ratio: Ratio; x: number; y: number } | null>(null);
  const cycling = useRef(false);
  const [boxes, setBoxes] = useState<Partial<Record<Ratio, Picked | null>>>({});
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  // A drag is held: the frames stop taking the pointer until it's let go.
  const [holding, setHolding] = useState(false);
  // Cancels the drag in hand, for an Escape pressed while the keyboard is in an ad's frame.
  const cancelDrag = useRef<(() => void) | null>(null);
  // The lines a drag is sitting on, drawn across the frame; and the other elements' boxes it can snap to.
  const [guides, setGuides] = useState<{ ratio: Ratio; x: number[]; y: number[] } | null>(null);
  const others = useRef<{ x: number; y: number; w: number; h: number }[]>([]);
  // After a drop the box stays where it was dropped until the frame reports the saved one.
  const settling = useRef(false);
  const live = useRef({ frame, playing, picking, selectedLoc, onFrame, onEnded, onPick, onSelected, onKey, onError, onEditText });
  live.current = { frame, playing, picking, selectedLoc, onFrame, onEnded, onPick, onSelected, onKey, onError, onEditText };

  useLayoutEffect(() => {
    const el = area.current!;
    const fit = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // One height for every ratio shown, as large as the area allows.
  const gap = 40;
  // Room round each frame, so the outline, corners and label of an element that fills it stay in sight.
  const pad = 44;
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
      else if (data.type === "hover") setHover(data.el ? { ratio, el: data.el, under: Boolean(data.under) } : null);
      else if (data.type === "pick") {
        setMenu(null);
        if (cycling.current) cycling.current = false;
        else pickedAt.current = performance.now();
        now.onPick(data.el, ratio);
      } else if (data.type === "sample" || data.type === "layers") {
        samples.current.get(data.id)?.((data.type === "sample" ? data.sample : data.layers) ?? null);
        samples.current.delete(data.id);
      } else if (data.type === "stack") setMenu(data.items?.length ? { ratio, x: data.x, y: data.y, items: data.items } : null);
      else if (data.type === "edit") now.onEditText?.();
      else if (data.type === "box") {
        setBoxes((current) => ({ ...current, [ratio]: data.el }));
        if (settling.current) (settling.current = false), setDragging(null);
        if (data.el && data.el.loc === now.selectedLoc) now.onSelected?.(data.el, ratio);
      } else if (data.type === "key" && data.event?.key === "Escape" && cancelDrag.current) cancelDrag.current();
      else if (data.type === "key") now.onKey?.({ ...data.event, target: document.body, preventDefault: () => {} });
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
  useEffect(() => setMenu(null), [frame, picking, reloadKey]);
  useEffect(() => void (adding || setDropAt(null)), [adding]);
  useEffect(() => () => void (pending.current && clearTimeout(pending.current)), []);
  // The list closes on Escape or a press anywhere outside it.
  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && (event.stopPropagation(), setMenu(null));
    const onDown = (event: PointerEvent) => !(event.target as Element).closest?.(".pick-menu") && setMenu(null);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [menu]);

  /** Where a pointer event falls on a frame, in the video's own pixels. */
  const pointAt = (event: { clientX: number; clientY: number; currentTarget: EventTarget }, item: Shown) => {
    const box = (event.currentTarget as HTMLElement).closest(".viewer-frame")!.getBoundingClientRect();
    return { x: (event.clientX - box.left) / item.scale, y: (event.clientY - box.top) / item.scale };
  };

  /** A question to one frame, answered by id; null if it doesn't answer in time. */
  const ask = <T,>(kind: "sample" | "layers", ratio?: Ratio) =>
    new Promise<T | null>((done) => {
      const id = Math.random();
      samples.current.set(id, done);
      send(ratio && ratios.includes(ratio) ? ratio : lead!, { nykma: kind, id });
      setTimeout(() => samples.current.has(id) && (samples.current.delete(id), done(null)), 1500);
    });

  if (api)
    api.current = {
      preview: (loc, style) => sendAll({ nykma: "preview", loc, style }),
      endPreview: (restore) => sendAll({ nykma: "preview", loc: null, restore }),
      sample: (ratio) => ask("sample", ratio),
      layers: (ratio) => ask("layers", ratio),
      pickLoc: (loc, ratio) => send(ratio && ratios.includes(ratio) ? ratio : lead!, { nykma: "pickLoc", loc }),
      hoverLoc: (loc, ratio) => {
        if (!loc) return setHover(null);
        send(ratio && ratios.includes(ratio) ? ratio : lead!, { nykma: "hoverLoc", loc });
      },
    };

  /*
   * Dragging the selected element: the body moves it (Shift keeps it on one axis), a corner scales it. The pointer is
   * captured for the whole drag: without that, a pointer that leaves the box passes over the ad's iframe, which takes
   * the moves, so the box stopped following and jumped when the pointer came back out of the frame.
   */
  const grab = (event: ReactPointerEvent, item: Shown, el: Picked, mode: Dragging["mode"]) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement;
    const pointer = event.pointerId;
    try {
      handle.setPointerCapture(pointer);
    } catch {
      /* the frames stop taking the pointer below, so the window still hears it */
    }
    setHolding(true);
    // The other elements on this frame, in the frame's pixels: not this one, what's inside it or around it, nor a
    // layer that fills the frame (its edges are the frame's).
    others.current = [];
    if (snap?.on && snap.elements)
      void ask<Layer[]>("layers", item.ratio).then((layers) => {
        if (!layers) return;
        const { width: W, height: H } = SIZES[item.ratio];
        const around = new Set(el.path.map((p) => p.loc));
        const at = layers.findIndex((layer) => layer.loc === el.loc);
        const inside = new Set<string>();
        if (at >= 0) for (let i = at + 1; i < layers.length && layers[i].depth > layers[at].depth; i++) inside.add(layers[i].loc);
        others.current = layers
          .filter((layer) => layer.shown && layer.loc !== el.loc && !around.has(layer.loc) && !inside.has(layer.loc) && layer.look.box.w * layer.look.box.h < 0.9)
          .map(({ look: { box } }) => ({ x: box.x * W, y: box.y * H, w: box.w * W, h: box.h * H }));
      });
    // A click in an ad's frame leaves the keyboard there; the drag's Escape is heard here.
    if (document.activeElement instanceof HTMLIFrameElement) document.activeElement.blur();
    const frameBox = (event.currentTarget as HTMLElement).closest(".viewer-frame")!.getBoundingClientRect();
    const x0 = event.clientX;
    const y0 = event.clientY;
    const cx = frameBox.left + (el.box.x + el.box.width / 2) * item.scale;
    const cy = frameBox.top + (el.box.y + el.box.height / 2) * item.scale;
    const d0 = Math.max(4, Math.hypot(x0 - cx, y0 - cy));
    const base = typeof placement === "object" ? placement : null;
    let last: Dragging = { mode, ratio: item.ratio, dx: 0, dy: 0, factor: 1, moved: false };
    /** The lines this drag can snap to, in the frame's pixels. */
    const lines = () => {
      const { width: W, height: H } = SIZES[item.ratio];
      const x: number[] = [];
      const y: number[] = [];
      if (snap?.frame) x.push(0, W / 2, W), y.push(0, H / 2, H);
      if (snap?.safe) {
        const s = SAFE[item.ratio];
        x.push(s.x * W, W - s.x * W);
        y.push(s.top * H, H - s.bottom * H);
      }
      if (snap?.elements) for (const b of others.current) x.push(b.x, b.x + b.w / 2, b.x + b.w), y.push(b.y, b.y + b.h / 2, b.y + b.h);
      return { x, y };
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      let dx = e.clientX - x0;
      let dy = e.clientY - y0;
      let lock: "x" | "y" | null = null;
      if (e.shiftKey && mode === "move") Math.abs(dx) > Math.abs(dy) ? ((dy = 0), (lock = "y")) : ((dx = 0), (lock = "x"));
      const moved = last.moved || Math.hypot(dx, dy) > 3;
      let factor = mode === "scale" ? Math.max(0.05, Math.hypot(e.clientX - cx, e.clientY - cy) / d0) : 1;
      // Snapping, unless it's off or Ctrl is held: the element's edges and centre onto the nearest line in reach.
      const k = item.scale;
      const b = el.box;
      const reach = SNAP_PX / k;
      const hit = { x: [] as number[], y: [] as number[] };
      if (snap?.on && !(e.ctrlKey || e.metaKey) && moved && base) {
        const { x: xs, y: ys } = lines();
        if (mode === "move") {
          const sx = lock === "x" ? null : nearest([b.x, b.x + b.width / 2, b.x + b.width].map((v) => v + dx / k), xs, reach);
          const sy = lock === "y" ? null : nearest([b.y, b.y + b.height / 2, b.y + b.height].map((v) => v + dy / k), ys, reach);
          if (sx) (dx += sx.delta * k), hit.x.push(sx.at);
          if (sy) (dy += sy.delta * k), hit.y.push(sy.at);
        } else if (b.width > 0 && b.height > 0) {
          // Scaled about its centre, an edge sits on line t at factor 2|t − c| / size; and 100% is the code's own size.
          const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
          let best: { f: number; d: number; x?: number; y?: number } | null = null;
          const consider = (f: number, d: number, line: { x?: number; y?: number }) => {
            if (f > 0.05 && d <= reach && (!best || d < best.d)) best = { f, d, ...line };
          };
          for (const t of xs) consider((2 * Math.abs(t - c.x)) / b.width, (Math.abs((2 * Math.abs(t - c.x)) / b.width - factor) * b.width) / 2, { x: t });
          for (const t of ys) consider((2 * Math.abs(t - c.y)) / b.height, (Math.abs((2 * Math.abs(t - c.y)) / b.height - factor) * b.height) / 2, { y: t });
          const own = 1 / (base.scale || 1);
          consider(own, (Math.abs(own - factor) * Math.max(b.width, b.height)) / 2, {});
          const chosen = best as { f: number; x?: number; y?: number } | null;
          if (chosen) {
            factor = chosen.f;
            if (chosen.x !== undefined) hit.x.push(chosen.x, 2 * c.x - chosen.x);
            if (chosen.y !== undefined) hit.y.push(chosen.y, 2 * c.y - chosen.y);
          }
        }
      }
      setGuides(hit.x.length || hit.y.length ? { ratio: item.ratio, ...hit } : null);
      last = { mode, ratio: item.ratio, dx, dy, factor, moved };
      if (!moved || !base) return;
      setDragging(last);
      if (mode === "move") {
        const k = item.scale * el.local;
        send(item.ratio, { nykma: "preview", loc: el.loc, style: { translate: `${round(base.x + dx / k)}px ${round(base.y + dy / k)}px` } });
        shown.forEach((other) => other.ratio !== item.ratio && send(other.ratio, { nykma: "preview", loc: el.loc, style: { translate: `${round(base.x + dx / k)}px ${round(base.y + dy / k)}px` } }));
      } else sendAll({ nykma: "preview", loc: el.loc, style: { scale: String(round(base.scale * factor, 3)) } });
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      try {
        handle.releasePointerCapture(pointer);
      } catch {
        /* already released */
      }
      setHolding(false);
      setGuides(null);
      cancelDrag.current = null;
    };
    // Escape, or a pointer the browser takes away: the element goes back to where it was.
    const onCancel = () => {
      stop();
      setDragging(null);
      sendAll({ nykma: "preview", loc: null, restore: true });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      stop();
      // A press on a corner that didn't drag does nothing.
      if (!last.moved && mode === "scale") return setDragging(null);
      if (!last.moved) {
        setDragging(null);
        // The second click of a double click on an element just picked in the frame: edit its text.
        if (performance.now() - pickedAt.current < DOUBLE_MS) return onEditText?.();
        // A click, not a drag: pick what's under the selection there, as a click in the frame would, once it's
        // clear this isn't the start of a double click (which edits the text instead).
        const at = { x: (e.clientX - frameBox.left) / item.scale, y: (e.clientY - frameBox.top) / item.scale };
        if (pending.current) clearTimeout(pending.current);
        pending.current = window.setTimeout(() => {
          pending.current = null;
          cycling.current = true;
          send(item.ratio, { nykma: "pickAt", ...at });
        }, DOUBLE_MS);
        return;
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
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    cancelDrag.current = onCancel;
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
      onPointerMove={kind === "selected" && !dragging ? (event) => send(item.ratio, { nykma: "hoverAt", ...pointAt(event, item) }) : undefined}
      onPointerLeave={kind === "selected" ? () => setHover(null) : undefined}
      onContextMenu={
        kind === "selected"
          ? (event) => {
              event.preventDefault();
              send(item.ratio, { nykma: "stackAt", ...pointAt(event, item) });
            }
          : undefined
      }
      onDoubleClick={
        kind === "selected"
          ? () => {
              if (pending.current) clearTimeout(pending.current);
              pending.current = null;
              onEditText?.();
            }
          : undefined
      }
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
      {kind === "hover" && hover?.under && (
        <span className="pick-tag under">
          Behind · click: {el.tag}
          {el.text ? ` · ${el.text.slice(0, 24)}` : ""}
        </span>
      )}
    </div>
    );
  };

  const label = (el: Picked) => `${el.tag}${el.text ? ` · ${el.text.slice(0, 32)}` : ""}`;
  const list = (item: Shown) =>
    menu?.ratio === item.ratio && (
      <div className="pick-menu" role="menu" style={{ left: Math.min(menu.x * item.scale, Math.max(0, item.w - 200)), top: Math.min(menu.y * item.scale, Math.max(0, item.h - 180)) }} onContextMenu={(event) => event.preventDefault()}>
        <div className="pick-menu-head">Here, top to bottom</div>
        {menu.items.map((el) => (
          <button
            key={el.loc}
            role="menuitem"
            className={el.loc === selectedLoc ? "on" : ""}
            dir="auto"
            onPointerEnter={() => setHover({ ratio: item.ratio, el })}
            onPointerLeave={() => setHover(null)}
            onClick={() => {
              setMenu(null);
              setHover(null);
              onPick(el, item.ratio);
            }}
          >
            {label(el)}
          </button>
        ))}
      </div>
    );

  return (
    <div
      className={`viewer-area${holding ? " holding" : ""}`}
      ref={area}
      // A press on the canvas round the frames lets go of the selection. Inside a frame, a press on nothing does the same.
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as Element).closest(".viewer-frame, .viewer-banner, .viewer-error, .pick-menu")) return;
        if (pending.current) clearTimeout(pending.current), (pending.current = null);
        setMenu(null);
        setHover(null);
        if (selectedLoc) onPick(null, lead!);
      }}
    >
      {banner && <div className="viewer-banner">{banner}</div>}
      <div className="viewer-row" style={{ gap }}>
        {shown.map((item) => {
          const selected = boxes[item.ratio];
          const hovered = !dragging && hover && hover.ratio === item.ratio && hover.el.loc !== selectedLoc ? hover.el : null;
          const fills = selected && selected.box.x <= 1 && selected.box.y <= 1 && selected.box.width >= SIZES[item.ratio].width - 2 && selected.box.height >= SIZES[item.ratio].height - 2;
          const s = SAFE[item.ratio];
          return (
            <figure key={item.ratio} className="viewer-mon">
              {ratios.length > 1 && <figcaption>{ratioLabel(item.ratio)}</figcaption>}
              <div className={`viewer-frame${picking ? " picking" : ""}${fills ? " filled" : ""}`} style={{ width: item.w, height: item.h }}>
                <div className="viewer-clip">
                  <iframe
                    key={`${item.id}:${reloadKey}`}
                    ref={(el) => void frames.current.set(item.ratio, el)}
                    title={`${take.name} ${item.ratio}`}
                    src={`/board.html?id=${encodeURIComponent(item.id)}&viewer`}
                    style={{ width: SIZES[item.ratio].width, height: SIZES[item.ratio].height, transform: `scale(${item.scale})` }}
                  />
                </div>
                {safe && <div className="safe-area" style={{ left: `${s.x * 100}%`, right: `${s.x * 100}%`, top: `${s.top * 100}%`, bottom: `${s.bottom * 100}%` }} />}
                {selected && outline(item, selected, "selected", "selected")}
                {hovered && outline(item, hovered, "hover", "hover")}
                {guides?.ratio === item.ratio && (
                  <>
                    {guides.x.map((x, i) => (
                      <span key={`x${i}`} className="snap-guide v" style={{ left: x * item.scale }} />
                    ))}
                    {guides.y.map((y, i) => (
                      <span key={`y${i}`} className="snap-guide h" style={{ top: y * item.scale }} />
                    ))}
                  </>
                )}
                {list(item)}
                {adding && (
                  <div
                    className="drop-catch"
                    onDragOver={(event) => {
                      if (!event.dataTransfer.types.includes(ADD_TYPE)) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                      const at = pointAt(event, item);
                      setDropAt({ ratio: item.ratio, x: at.x * item.scale, y: at.y * item.scale });
                    }}
                    onDragLeave={() => setDropAt(null)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDropAt(null);
                      const what = event.dataTransfer.getData(ADD_TYPE);
                      const at = pointAt(event, item);
                      if (what) onAdd?.(item.ratio, at.x / SIZES[item.ratio].width, at.y / SIZES[item.ratio].height, what);
                    }}
                  >
                    {dropAt?.ratio === item.ratio && <span className="drop-mark" style={{ left: dropAt.x, top: dropAt.y }} />}
                  </div>
                )}
              </div>
            </figure>
          );
        })}
      </div>
      {error && <div className="viewer-error">This ad didn't draw: {error}</div>}
    </div>
  );
}
