/**
 * The board: an infinite canvas with the ad's scenes as frames, and arrows between them that make the story
 * (spec.md §10.3–10.4). Scenes are live: each is board.html in an iframe at its exact size, scaled by the camera.
 * Board units are output pixels. Places are saved in 16:9 cells (story.ts CELL) and stretched for the ratio on show.
 */
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RATIOS, SIZES, ratioLabel, type Ratio, type View } from "./api";
import { ArrowToolIcon, FitIcon, HandIcon, ImageIcon, LayoutIcon, MoveIcon, PauseIcon, PlayIcon } from "./icons";
import { CELL, addArrow, autoLayout, removeArrow, removeImages, setStart, updateImage, type Arrow, type Place, type StoryState } from "./story";

export type BoardItem = {
  id: string;
  name: string;
  sub: string;
  frames: number;
  fps: number;
  /** A live scene: one iframe per ratio. */
  scene?: { videoIds: Partial<Record<Ratio, string>> };
  /** An image you put on the board. It plays as a still, the same picture in every ratio. */
  image?: { src: string; fit: "cover" | "contain"; seconds: number };
  /** A video clip you put on the board: its frames (`#####` is the file number from 1), at the clip's own rate. */
  clip?: { src: string; fps: number; frames: number; from: number; fit: "cover" | "contain" };
  /** A pitch row: an image and the words, until the scene exists. */
  card?: { image?: string; happens: string; text: string; voice: string; time: string };
};

export type BoardHandle = {
  fit(): void;
  fitSelection(): void;
  zoomTo(z: number): void;
  zoomBy(factor: number): void;
  focus(id: string): void;
};

type Props = {
  items: BoardItem[];
  view: View;
  ratios: Ratio[];
  dir: "ltr" | "rtl";
  story: StoryState;
  editable: boolean;
  onStory: (next: StoryState, commit: boolean) => void;
  selected: string[];
  onSelect: (ids: string[]) => void;
  frames: Record<string, number>;
  onFrame: (id: string, frame: number) => void;
  onAsk?: (id: string) => void;
  /** Uploads images and puts them on the board at these places (board units). Without it the board takes none. */
  onAddImages?: (files: File[], at: Place[]) => void;
  onZoom?: (z: number) => void;
  banner?: ReactNode;
  empty?: ReactNode;
};

type Rect = { x: number; y: number; w: number; h: number };
type Camera = { x: number; y: number; z: number };
type Tool = "move" | "hand" | "arrow";

const RATIO_GAP = 80;
const MIN_Z = 0.02;
const MAX_Z = 4;
const clampZ = (z: number) => Math.min(MAX_Z, Math.max(MIN_Z, z));

/** The frames a scene shows for a view, side by side, in board units from the scene's corner. */
function layoutFor(view: View, ratios: Ratio[]) {
  const shown = view === "all" ? RATIOS.filter((ratio) => ratios.includes(ratio)) : [view];
  const h = Math.max(...shown.map((ratio) => SIZES[ratio].height));
  let x = 0;
  const parts = shown.map((ratio) => {
    const { width, height } = SIZES[ratio];
    const part = { ratio, x, y: (h - height) / 2, w: width, h: height };
    x += width + RATIO_GAP;
    return part;
  });
  return { parts, w: x - RATIO_GAP, h };
}

const SECONDS = [1, 2, 3, 5, 8];
const VIDEO_FILE = /\.(mov|mp4|m4v|webm|mkv|avi)$/i;
/** Images and video clips: what the board takes. */
const imagesIn = (list: FileList | File[] | undefined | null) =>
  [...(list ?? [])].filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/") || VIDEO_FILE.test(file.name));
/** The file of a clip's frame for a frame of the scene, which runs at the ad's rate. */
const clipFrame = (clip: NonNullable<BoardItem["clip"]>, frame: number, fps: number) => {
  const index = Math.min(Math.max(Math.floor((clip.from + frame / fps) * clip.fps + 1e-6), 0), clip.frames - 1);
  return clip.src.replace(/#+/, (run) => String(index + 1).padStart(run.length, "0"));
};

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** One live scene in one ratio. The frame goes over postMessage, so scrubbing never reloads the page. */
const SceneFrame = memo(function SceneFrame({ src, width, height, frame, onError }: { src: string; width: number; height: number; frame: number; onError: (message?: string) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const now = useRef(frame);
  now.current = frame;
  const [initial] = useState(frame);
  const tell = useCallback((f: number) => ref.current?.contentWindow?.postMessage({ nykma: "frame", frame: f }, location.origin), []);
  useEffect(() => tell(frame), [frame, tell]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== ref.current?.contentWindow || event.data?.nykma !== "board") return;
      if (event.data.type === "ready") {
        onError(undefined);
        tell(now.current);
      }
      if (event.data.type === "error") onError(String(event.data.message));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onError, tell]);
  return <iframe ref={ref} className="scene-iframe" title="scene" src={`${src}&f=${initial}`} width={width} height={height} tabIndex={-1} />;
});

export const Board = forwardRef<BoardHandle, Props>(function Board(props, handle) {
  const { items, view, ratios, story, editable, onStory, selected, onSelect, frames, onFrame, onAsk, onAddImages, onZoom, banner, empty } = props;
  const picker = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [camera, setCamera] = useState<Camera>({ x: 80, y: 80, z: 0.2 });
  const cam = useRef(camera);
  cam.current = camera;
  const [tool, setTool] = useState<Tool>("move");
  const [space, setSpace] = useState(false);
  const [drag, setDrag] = useState<
    | { kind: "pan" }
    | { kind: "move" }
    | { kind: "marquee"; from: { x: number; y: number }; to: { x: number; y: number } }
    | { kind: "arrow"; from: string; to: { x: number; y: number }; over?: string }
    | null
  >(null);
  const [hover, setHover] = useState<string>();
  const [arrowPicked, setArrowPicked] = useState<Arrow>();
  const [menu, setMenu] = useState<{ id: string; x: number; y: number }>();
  const [toast, setToast] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [playing, setPlaying] = useState(false);

  useLayoutEffect(() => {
    const el = box.current!;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => onZoom?.(camera.z), [camera.z, onZoom]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  /* ── Geometry ── */
  const layout = useMemo(() => layoutFor(items.some((item) => item.scene || item.image || item.clip) ? view : "16x9", ratios), [items, view, ratios]);
  const cell = { w: layout.w + 480, h: layout.h + 620 };
  const toBoard = useCallback((place: Place): [number, number] => [(place[0] / CELL.w) * cell.w, (place[1] / CELL.h) * cell.h], [cell.w, cell.h]);
  const fromBoard = (x: number, y: number): Place => [(x / cell.w) * CELL.w, (y / cell.h) * CELL.h];

  const rects = useMemo(() => {
    const out: Record<string, Rect> = {};
    for (const item of items) {
      const [x, y] = toBoard(story.board[item.id] ?? [0, 0]);
      out[item.id] = { x, y, w: layout.w, h: layout.h };
    }
    return out;
  }, [items, story.board, layout, toBoard]);

  const screen = (x: number, y: number) => ({ x: x * camera.z + camera.x, y: y * camera.z + camera.y });
  const world = (sx: number, sy: number) => ({ x: (sx - cam.current.x) / cam.current.z, y: (sy - cam.current.y) / cam.current.z });
  const local = (event: { clientX: number; clientY: number }) => {
    const bounds = box.current!.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const itemAt = (sx: number, sy: number) => {
    const p = world(sx, sy);
    return [...items].reverse().find((item) => {
      const r = rects[item.id];
      return r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    })?.id;
  };

  /* ── Camera ── */
  const fitTo = useCallback(
    (ids: string[]) => {
      const list = ids.map((id) => rects[id]).filter(Boolean);
      if (!list.length) return;
      const x0 = Math.min(...list.map((r) => r.x));
      const y0 = Math.min(...list.map((r) => r.y));
      const x1 = Math.max(...list.map((r) => r.x + r.w));
      const y1 = Math.max(...list.map((r) => r.y + r.h));
      const pad = 72;
      const z = clampZ(Math.min((size.w - pad * 2) / (x1 - x0), (size.h - pad * 2 - 40) / (y1 - y0), 1));
      setCamera({ z, x: size.w / 2 - ((x0 + x1) / 2) * z, y: size.h / 2 - ((y0 + y1) / 2) * z - 10 });
    },
    [rects, size],
  );
  const zoomAround = (factor: number, at = { x: size.w / 2, y: size.h / 2 }) =>
    setCamera((current) => {
      const z = clampZ(current.z * factor);
      const k = z / current.z;
      return { z, x: at.x - (at.x - current.x) * k, y: at.y - (at.y - current.y) * k };
    });

  useImperativeHandle(handle, () => ({
    fit: () => fitTo(items.map((item) => item.id)),
    fitSelection: () => fitTo(selected.length ? selected : items.map((item) => item.id)),
    zoomTo: (z: number) => zoomAround(z / cam.current.z),
    zoomBy: (factor: number) => zoomAround(factor),
    focus: (id: string) => fitTo([id]),
  }));

  // Fit once there's something to fit, and again when the ratio on show changes the shapes.
  const fitted = useRef("");
  useEffect(() => {
    // Again when the set of things changes kind: pitch cards giving way to scenes, or a first scene arriving.
    const key = `${view}|${items.some((item) => item.scene)}|${items.length > 0}`;
    if (!items.length || !size.w || fitted.current === key) return;
    fitted.current = key;
    fitTo(items.map((item) => item.id));
  }, [view, items, size, fitTo]);

  useEffect(() => {
    const el = box.current!;
    const onWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest(".no-wheel")) return;
      event.preventDefault();
      const scale = event.deltaMode === 1 ? 33 : 1;
      if (event.ctrlKey || event.metaKey) zoomAround(Math.exp(-event.deltaY * scale * 0.0022), local(event));
      else {
        const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
        const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;
        setCamera((current) => ({ ...current, x: current.x - dx * scale, y: current.y - dy * scale }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  /* ── Story edits ── */
  // Auto layout moves the scenes, then fits them once their new places are drawn.
  const laidOut = useRef(false);
  const arrange = () => {
    if (!items.length) return;
    laidOut.current = true;
    onStory(autoLayout(story, items.map((item) => item.id)), true);
  };
  useEffect(() => {
    if (!laidOut.current) return;
    laidOut.current = false;
    fitTo(items.map((item) => item.id));
  }, [rects, items, fitTo]);

  const draw = (from: string, to: string) => {
    const next = addArrow(story, from, to);
    if (!next) return setToast(from === to ? "" : "That arrow would make a loop. Each scene plays once.");
    onStory(next, true);
  };

  /* ── Images ── */
  /**
   * Places for `count` new images, side by side: where they were dropped, or else in the first free spot below the
   * middle of the view, so a new image never lands on a scene.
   */
  const placesFor = (count: number, at?: { x: number; y: number }) => {
    const centre = world(at?.x ?? size.w / 2, at?.y ?? size.h / 2);
    const taken = Object.values(rects);
    const free = (x: number, y: number) => !taken.some((r) => x < r.x + r.w + 60 && x + layout.w + 60 > r.x && y < r.y + r.h + 60 && y + layout.h + 60 > r.y);
    let x = centre.x - layout.w / 2;
    let y = centre.y - layout.h / 2;
    if (!at) for (let tries = 0; !free(x, y) && tries < 200; tries++) y += cell.h / 2;
    return Array.from({ length: count }, (_, i) => {
      let nx = x + i * cell.w;
      if (!at) while (!free(nx, y)) nx += cell.w / 2;
      taken.push({ x: nx, y, w: layout.w, h: layout.h });
      return fromBoard(nx, y);
    });
  };
  const addImages = (files: File[], at?: { x: number; y: number }) => {
    if (!onAddImages) return;
    if (!files.length) return setToast("The board takes images (PNG, JPEG, WebP, GIF, AVIF, SVG) and video clips (MOV, MP4, WebM).");
    onAddImages(files, placesFor(files.length, at));
  };
  /** Takes images off the board. Scenes are code, so they stay. */
  const dropImages = (ids: string[]) => {
    const gone = ids.filter((id) => story.images[id]);
    if (!gone.length) return false;
    onStory(removeImages(story, gone), true);
    onSelect(selected.filter((id) => !gone.includes(id)));
    setToast(gone.length > 1 ? `${gone.length} images taken off the board. Their files stay in public/.` : "Image taken off the board. Its file stays in public/.");
    return true;
  };

  useEffect(() => {
    if (!onAddImages) return;
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return;
      const files = imagesIn(event.clipboardData?.files);
      if (!files.length) return;
      event.preventDefault();
      // A pasted screenshot is always called image.png, so it gets a time instead.
      addImages(files.map((file) => (file.name === "image.png" ? new File([file], `pasted-${Date.now().toString(36)}.png`, { type: file.type }) : file)));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  /* ── Keyboard ── */
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (event.key === " " && !event.repeat) {
        setSpace(true);
        event.preventDefault();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.shiftKey && event.code === "Digit1") fitTo(items.map((item) => item.id));
      else if (event.shiftKey && event.code === "Digit2") fitTo(selected.length ? selected : items.map((item) => item.id));
      else if (event.shiftKey && event.code === "Digit0") zoomAround(1 / cam.current.z);
      else if (key === "v") setTool("move");
      else if (key === "h") setTool("hand");
      else if (key === "a" && editable) setTool("arrow");
      else if (key === "=" || key === "+") zoomAround(1.25);
      else if (key === "-") zoomAround(0.8);
      else if (key === "k") setPlaying((on) => !on);
      else if (key === "l") arrange();
      else if (key === "i" && onAddImages) picker.current?.click();
      else if ((key === "delete" || key === "backspace") && arrowPicked && editable) {
        onStory(removeArrow(story, arrowPicked), true);
        setArrowPicked(undefined);
      } else if ((key === "delete" || key === "backspace") && dropImages(selected)) {
        // Done: only the selected images went.
      } else if (key === "escape") {
        setMenu(undefined);
        setArrowPicked(undefined);
        setDrag(null);
        onSelect([]);
      } else return;
      event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === " ") setSpace(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  /* ── Playing the selected scene in place ── */
  const focusId = selected.length === 1 ? selected[0] : undefined;
  const focusItem = items.find((item) => item.id === focusId);
  useEffect(() => setPlaying(false), [focusId]);
  useEffect(() => {
    if (!playing || !focusItem || focusItem.frames < 2) return;
    const { id, frames: length, fps } = focusItem;
    const from = frames[id] ?? 0;
    const began = performance.now();
    let raf = 0;
    const tick = () => {
      onFrame(id, (from + Math.floor(((performance.now() - began) / 1000) * fps)) % length);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // The start frame is read once, when play starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, focusItem?.id, focusItem?.frames, focusItem?.fps]);

  /* ── Pointer ── */
  const begin = (event: React.PointerEvent) => {
    if (event.button === 2) return;
    setMenu(undefined);
    const at = local(event);
    const panning = event.button === 1 || tool === "hand" || space;
    const target = event.target as HTMLElement;
    if (!panning && target.closest(".overlay-ui")) return; // buttons, scrubbers and handles do their own thing

    const handleId = target.closest<HTMLElement>("[data-handle]")?.dataset.handle;
    const hitArrow = target.closest<SVGElement>("[data-arrow]")?.dataset.arrow;
    const over = itemAt(at.x, at.y);
    box.current!.setPointerCapture(event.pointerId);

    let last = at;
    let moved = false;
    let mode: "pan" | "move" | "marquee" | "arrow" | "none" = "none";
    let arrowFrom = "";
    const startPlaces = Object.fromEntries(Object.entries(story.board));
    let moving: string[] = [];
    let current = story;

    if (panning) {
      mode = "pan";
      setDrag({ kind: "pan" });
    } else if (handleId && editable) {
      mode = "arrow";
      arrowFrom = handleId;
      setDrag({ kind: "arrow", from: handleId, to: at });
    } else if (hitArrow && editable) {
      const [from, to] = hitArrow.split("\n");
      setArrowPicked([from, to]);
      onSelect([]);
      return;
    } else if (over && tool === "arrow" && editable) {
      mode = "arrow";
      arrowFrom = over;
      setDrag({ kind: "arrow", from: over, to: at });
    } else if (over) {
      setArrowPicked(undefined);
      const already = selected.includes(over);
      const next = event.shiftKey ? (already ? selected.filter((id) => id !== over) : [...selected, over]) : already ? selected : [over];
      onSelect(next);
      moving = event.shiftKey && already ? [] : next;
      mode = "move";
    } else {
      setArrowPicked(undefined);
      if (!event.shiftKey) onSelect([]);
      mode = "marquee";
      setDrag({ kind: "marquee", from: at, to: at });
    }

    const move = (e: PointerEvent) => {
      const p = local(e);
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (Math.abs(p.x - at.x) + Math.abs(p.y - at.y) > 3) moved = true;
      if (mode === "pan") setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
      if (mode === "move" && moved && moving.length) {
        const total = { x: (p.x - at.x) / cam.current.z, y: (p.y - at.y) / cam.current.z };
        const board = { ...current.board };
        for (const id of moving) {
          const [bx, by] = toBoard(startPlaces[id] ?? [0, 0]);
          board[id] = fromBoard(bx + total.x, by + total.y);
        }
        current = { ...current, board };
        onStory(current, false);
        setDrag({ kind: "move" });
      }
      if (mode === "marquee") setDrag({ kind: "marquee", from: at, to: p });
      if (mode === "arrow") setDrag({ kind: "arrow", from: arrowFrom, to: p, over: itemAt(p.x, p.y) });
      last = p;
    };
    const end = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      const p = local(e);
      if (mode === "move" && moved && moving.length) onStory(current, true);
      if (mode === "marquee") {
        const a = world(Math.min(at.x, p.x), Math.min(at.y, p.y));
        const b = world(Math.max(at.x, p.x), Math.max(at.y, p.y));
        const inside = items
          .filter((item) => {
            const r = rects[item.id];
            return r.x < b.x && r.x + r.w > a.x && r.y < b.y && r.y + r.h > a.y;
          })
          .map((item) => item.id);
        if (moved) onSelect(e.shiftKey ? [...new Set([...selected, ...inside])] : inside);
      }
      if (mode === "arrow") {
        const to = itemAt(p.x, p.y);
        if (to && to !== arrowFrom) draw(arrowFrom, to);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  };

  const onContext = (event: React.MouseEvent) => {
    event.preventDefault();
    const at = local(event);
    const id = itemAt(at.x, at.y);
    if (!id) return setMenu(undefined);
    if (!selected.includes(id)) onSelect([id]);
    setMenu({ id, x: at.x, y: at.y });
  };

  const onHover = (event: React.PointerEvent) => {
    if (drag) return;
    const at = local(event);
    const target = event.target as HTMLElement;
    if (target.closest("[data-handle]")) return;
    setHover(itemAt(at.x, at.y));
  };

  /* ── Drawing ── */
  const number = new Map(story.order.map((id, i) => [id, i + 1]));
  const onStoryIds = new Set(story.order);
  // Scenes well off screen, or too small to read, unload their pages so a big board stays fast.
  const visible = (r: Rect) => {
    const s = screen(r.x, r.y);
    const w = r.w * camera.z;
    const h = r.h * camera.z;
    return s.x + w > -400 && s.y + h > -400 && s.x < size.w + 400 && s.y < size.h + 400 && w > 18;
  };
  const step = 2 ** Math.ceil(Math.log2(20 / camera.z)) * camera.z; // dots 20 to 40 px apart at any zoom
  const errorSetters = useMemo(() => {
    const out: Record<string, (message?: string) => void> = {};
    for (const item of items) out[item.id] = (message?: string) => setErrors((current) => (current[item.id] === message ? current : { ...current, [item.id]: message }));
    return out;
  }, [items]);

  /**
   * An arrow between two scenes. Side to side when nothing is in the way. An arrow that would cross another scene
   * arcs over the top, and one that runs backwards loops under the bottom, so the order reads at a glance.
   */
  const routed = (fromId: string, toId: string) => {
    const a = rects[fromId];
    const b = rects[toId];
    const s = screen(a.x + a.w, a.y + a.h / 2);
    const t = screen(b.x, b.y + b.h / 2);
    const others = items.filter((item) => item.id !== fromId && item.id !== toId).map((item) => rects[item.id]);
    const hits = (r: Rect) => {
      const p = [s, t].map((q) => world(q.x, q.y));
      for (let i = 1; i < 12; i++) {
        const k = i / 12;
        const x = p[0].x + (p[1].x - p[0].x) * k;
        const y = p[0].y + (p[1].y - p[0].y) * k;
        if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true;
      }
      return false;
    };
    const backwards = b.x + b.w / 2 < a.x + a.w / 2;
    if (!backwards && !others.some(hits)) return arrowPath(a, t, b);
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x + a.w, b.x + b.w);
    const between = [a, b, ...others.filter((r) => r.x < x1 && r.x + r.w > x0)];
    const gap = 40 / camera.z + 60;
    if (backwards) {
      const lane = Math.max(...between.map((r) => r.y + r.h)) + gap;
      const p = screen(a.x + a.w / 2, a.y + a.h);
      const q = screen(b.x + b.w / 2, b.y + b.h);
      const c = screen(0, lane).y;
      const k = (c - p.y) / 0.75 + p.y;
      return `M ${p.x} ${p.y} C ${p.x} ${k}, ${q.x} ${k + q.y - p.y}, ${q.x} ${q.y}`;
    }
    const lane = Math.min(...between.map((r) => r.y)) - gap;
    // Off-centre toward each other, so the arc clears the name labels at the scenes' top left.
    const p = screen(a.x + a.w * 0.72, a.y);
    const q = screen(b.x + b.w * 0.5, b.y);
    const c = screen(0, lane).y;
    const k = (c - p.y) / 0.75 + p.y;
    return `M ${p.x} ${p.y} C ${p.x} ${k}, ${q.x} ${k + q.y - p.y}, ${q.x} ${q.y}`;
  };

  const arrowPath = (from: Rect, to: { x: number; y: number }, toRect?: Rect) => {
    const s = screen(from.x + from.w, from.y + from.h / 2);
    const t = toRect ? screen(toRect.x, toRect.y + toRect.h / 2) : to;
    const dx = t.x - s.x;
    const c = dx >= 0 ? Math.max(40, dx / 2) : Math.max(120, Math.abs(dx) / 3);
    return `M ${s.x} ${s.y} C ${s.x + c} ${s.y}, ${t.x - c} ${t.y}, ${t.x} ${t.y}`;
  };

  const cursor = drag?.kind === "pan" ? "grabbing" : tool === "hand" || space ? "grab" : tool === "arrow" ? "crosshair" : "default";
  const scrubFor = focusItem && focusItem.frames > 1 && !focusItem.image ? focusItem : undefined;
  const menuImage = menu ? story.images[menu.id] : undefined;
  const menuClip = menuImage?.clip;
  const clipLength = menuClip ? menuClip.frames / menuClip.fps - (menuClip.from ?? 0) : 0;

  return (
    <div
      className={`board${dropping ? " dropping" : ""}`}
      ref={box}
      style={{ cursor }}
      onPointerDown={begin}
      onPointerMove={onHover}
      onPointerLeave={() => setHover(undefined)}
      onContextMenu={onContext}
      onDragOver={(event) => {
        if (!onAddImages || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!box.current?.contains(event.relatedTarget as Node)) setDropping(false);
      }}
      onDrop={(event) => {
        if (!onAddImages) return;
        event.preventDefault();
        setDropping(false);
        addImages(imagesIn(event.dataTransfer.files), local(event));
      }}
    >
      <div className="board-grid" style={{ backgroundSize: `${step}px ${step}px`, backgroundPosition: `${camera.x}px ${camera.y}px` }} />
      <div className="world" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})` }}>
        {items.map((item) => {
          const r = rects[item.id];
          const show = visible(r);
          const off = editable && !onStoryIds.has(item.id);
          return (
            <div key={item.id} className={`scene${off ? " off" : ""}`} style={{ left: r.x, top: r.y, width: r.w, height: r.h }} data-scene={item.id}>
              {item.image
                ? layout.parts.map((part) => (
                    // The same picture in every ratio, as the video shows it: filling the frame, or all of it on black.
                    <div key={part.ratio} className="scene-part" style={{ left: part.x, top: part.y, width: part.w, height: part.h }}>
                      {show && <img className="scene-image" src={item.image!.src} alt="" draggable={false} style={{ objectFit: item.image!.fit }} />}
                    </div>
                  ))
                : item.clip
                ? layout.parts.map((part) => (
                    // A clip: the frame under the scrubber, cropped for each shape as the video crops it.
                    <div key={part.ratio} className="scene-part" style={{ left: part.x, top: part.y, width: part.w, height: part.h }}>
                      {show && <img className="scene-image" src={clipFrame(item.clip!, frames[item.id] ?? 0, item.fps)} alt="" draggable={false} style={{ objectFit: item.clip!.fit }} />}
                    </div>
                  ))
                : item.scene
                ? layout.parts.map((part) => {
                    const videoId = item.scene!.videoIds[part.ratio];
                    return (
                      <div key={part.ratio} className="scene-part" style={{ left: part.x, top: part.y, width: part.w, height: part.h }}>
                        {videoId && show ? (
                          <SceneFrame
                            src={`/board.html?id=${encodeURIComponent(videoId)}&scene=${encodeURIComponent(item.id)}`}
                            width={part.w}
                            height={part.h}
                            frame={frames[item.id] ?? 0}
                            onError={errorSetters[item.id]}
                          />
                        ) : (
                          <div className="scene-placeholder" />
                        )}
                      </div>
                    );
                  })
                : item.card && (
                    <>
                      {/* The frame is the picture alone, as the animatic shows it: the image, or a plain card with the words. */}
                      <div className="card-scene" dir="auto">
                        {item.card.image ? <img src={item.card.image} alt="" draggable={false} /> : item.card.text && <p className="card-plain">{item.card.text}</p>}
                      </div>
                      {/* The storyboard notes sit under the frame, like a text layer under a Figma frame. */}
                      <CardNotes words={[item.card.text, item.card.happens, item.card.voice].join("\n")}>
                        {item.card.text && (
                          <p>
                            <span className="card-key">On screen</span>
                            <span className="card-text">{item.card.text}</span>
                          </p>
                        )}
                        {item.card.happens && (
                          <p>
                            <span className="card-key">What happens</span>
                            {item.card.happens}
                          </p>
                        )}
                        {item.card.voice && (
                          <p>
                            <span className="card-key">Voice</span>
                            <span className="card-voice">“{item.card.voice}”</span>
                          </p>
                        )}
                      </CardNotes>
                    </>
                  )}
            </div>
          );
        })}
      </div>

      <svg className="arrows" width={size.w} height={size.h}>
        <defs>
          {Object.entries({ head: "#0d99ff", "head-idle": "#7a7a7a", "head-picked": "#ffffff", "head-ok": "#14ae5c", "head-bad": "#f24822" }).map(([id, fill]) => (
            <marker key={id} id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0 0.5L10 5L0 9.5z" fill={fill} />
            </marker>
          ))}
        </defs>
        {story.arrows.map(([from, to]) => {
          const a = rects[from];
          const b = rects[to];
          if (!a || !b) return null;
          const d = routed(from, to);
          const picked = arrowPicked?.[0] === from && arrowPicked?.[1] === to;
          const live = onStoryIds.has(from) && onStoryIds.has(to);
          return (
            <g key={`${from}>${to}`} className={`arrow${picked ? " picked" : ""}${live ? "" : " idle"}${editable ? "" : " fixed"}`} data-arrow={`${from}\n${to}`}>
              <path className="arrow-hit" d={d} />
              <path className="arrow-line" d={d} markerEnd={`url(#${picked ? "head-picked" : live ? "head" : "head-idle"})`} />
            </g>
          );
        })}
        {drag?.kind === "arrow" && rects[drag.from] && (() => {
          const target = drag.over && drag.over !== drag.from ? drag.over : undefined;
          const tone = target ? (addArrow(story, drag.from, target) ? "ok" : "bad") : "";
          return <path className={`arrow-line drawing ${tone}`} d={arrowPath(rects[drag.from], drag.to, target ? rects[target] : undefined)} markerEnd={`url(#${tone ? `head-${tone}` : "head"})`} />;
        })()}
      </svg>

      <div className="overlay">
        {items.map((item) => {
          const r = rects[item.id];
          const s = screen(r.x, r.y);
          const w = r.w * camera.z;
          const h = r.h * camera.z;
          if (s.x > size.w || s.y > size.h + 30 || s.x + w < 0 || s.y + h < -30) return null;
          const tiny = w < 70;
          const n = editable ? number.get(item.id) : undefined;
          const isStart = editable && story.start === item.id && story.order.length > 0;
          const picked = selected.includes(item.id);
          const error = errors[item.id];
          return (
            <div key={item.id}>
              <div className={`scene-label${picked ? " picked" : ""}${editable && !n ? " off" : ""}`} style={{ left: s.x, top: s.y - 22, maxWidth: Math.max(w, 24) }}>
                {isStart && !tiny && <span className="start-flag">▶ Start</span>}
                {n !== undefined && <span className="scene-number">{n}</span>}
                {!tiny && <span className="scene-name" dir="auto">{item.name}</span>}
                {w > 160 && <span className="scene-sub">{item.sub}</span>}
                {error && <span className="scene-error-tag" title={error}>error</span>}
              </div>
              {view === "all" && (item.scene || item.image || item.clip) && w > 260 &&
                layout.parts.map((part) => (
                  <span key={part.ratio} className="ratio-caption" style={{ left: s.x + part.x * camera.z, top: s.y + (part.y + part.h) * camera.z + 6 }}>
                    {ratioLabel(part.ratio)}
                  </span>
                ))}
              {(picked || hover === item.id) && <div className={`scene-outline${picked ? " picked" : ""}`} style={{ left: s.x - 1, top: s.y - 1, width: w + 2, height: h + 2 }} />}
              {error && w > 140 && (
                <div className="scene-error-note" style={{ left: s.x + 8, top: s.y + 8, maxWidth: w - 16 }}>
                  {error}
                </div>
              )}
              {editable && (picked || hover === item.id) && !drag && (
                <button className="arrow-handle overlay-ui-handle" data-handle={item.id} style={{ left: s.x + w, top: s.y + h / 2 }} title="Drag to the next scene" />
              )}
            </div>
          );
        })}

        {scrubFor && rects[scrubFor.id] && (() => {
          const r = rects[scrubFor.id];
          const s = screen(r.x, r.y + r.h);
          const w = Math.max(r.w * camera.z, 280);
          const frame = frames[scrubFor.id] ?? 0;
          return (
            <div className="scrubber overlay-ui no-wheel" style={{ left: s.x, top: s.y + 10, width: w }} onPointerDown={(event) => event.stopPropagation()}>
              <button className="icon-button" onClick={() => setPlaying((on) => !on)} title={playing ? "Pause (K)" : "Play this scene (K)"}>
                {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
              </button>
              <input
                type="range"
                min={0}
                max={scrubFor.frames - 1}
                value={frame}
                onChange={(event) => {
                  setPlaying(false);
                  onFrame(scrubFor.id, Number(event.target.value));
                }}
              />
              <output>
                {frame} · {(frame / scrubFor.fps).toFixed(2)} s
              </output>
            </div>
          );
        })()}

        {drag?.kind === "marquee" && (
          <div
            className="marquee"
            style={{
              left: Math.min(drag.from.x, drag.to.x),
              top: Math.min(drag.from.y, drag.to.y),
              width: Math.abs(drag.to.x - drag.from.x),
              height: Math.abs(drag.to.y - drag.from.y),
            }}
          />
        )}

        {menu && (
          <div className="menu overlay-ui" style={{ left: menu.x, top: menu.y }} onPointerDown={(event) => event.stopPropagation()}>
            {menuImage && (
              <>
                <div className="menu-row" role="group" aria-label="Shown for">
                  <span>Shown for</span>
                  {menuClip
                    ? [...SECONDS.filter((n) => n < clipLength - 0.05), undefined].map((n) => (
                        // A clip plays to its end unless it's cut shorter.
                        <button key={n ?? "all"} aria-pressed={menuImage.seconds === n} onClick={() => onStory(updateImage(story, menu.id, { seconds: n }), true)}>
                          {n === undefined ? `All ${Math.round(clipLength * 10) / 10}s` : `${n}s`}
                        </button>
                      ))
                    : SECONDS.map((n) => (
                        <button key={n} aria-pressed={(menuImage.seconds ?? 2) === n} onClick={() => onStory(updateImage(story, menu.id, { seconds: n }), true)}>
                          {n}s
                        </button>
                      ))}
                </div>
                {menuClip?.sound && (
                  <div className="menu-row" role="group" aria-label="Sound">
                    <span>Sound</span>
                    <button aria-pressed={menuClip.volume !== 0} onClick={() => onStory(updateImage(story, menu.id, { clip: { ...menuClip, volume: undefined } }), true)}>
                      On
                    </button>
                    <button aria-pressed={menuClip.volume === 0} onClick={() => onStory(updateImage(story, menu.id, { clip: { ...menuClip, volume: 0 } }), true)}>
                      Off
                    </button>
                  </div>
                )}
                <div className="menu-row" role="group" aria-label="Picture">
                  <span>Picture</span>
                  <button aria-pressed={(menuImage.fit ?? "cover") === "cover"} onClick={() => onStory(updateImage(story, menu.id, { fit: "cover" }), true)} title="Fill the frame, cropping the edges">
                    Fill
                  </button>
                  <button aria-pressed={menuImage.fit === "contain"} onClick={() => onStory(updateImage(story, menu.id, { fit: "contain" }), true)} title="All of the picture, on black">
                    Fit
                  </button>
                </div>
                <hr />
              </>
            )}
            {editable && (
              <button
                onClick={() => {
                  onStory(setStart(story, menu.id), true);
                  setMenu(undefined);
                }}
              >
                Start here
              </button>
            )}
            {onAsk && (
              <button
                onClick={() => {
                  onAsk(menu.id);
                  setMenu(undefined);
                }}
              >
                Ask about this scene
              </button>
            )}
            <button
              onClick={() => {
                fitTo([menu.id]);
                setMenu(undefined);
              }}
            >
              Zoom to {menuClip ? "clip" : menuImage ? "image" : "scene"} <kbd>⇧2</kbd>
            </button>
            {editable && story.arrows.some(([from, to]) => from === menu.id || to === menu.id) && (
              <button
                onClick={() => {
                  let next = story;
                  for (const arrow of story.arrows.filter(([from, to]) => from === menu.id || to === menu.id)) next = removeArrow(next, arrow);
                  onStory(next, true);
                  setMenu(undefined);
                }}
              >
                Remove its arrows
              </button>
            )}
            {menuImage && (
              <button
                className="danger"
                onClick={() => {
                  dropImages(selected.includes(menu.id) ? selected : [menu.id]);
                  setMenu(undefined);
                }}
              >
                Take off the board <kbd>Del</kbd>
              </button>
            )}
          </div>
        )}
      </div>

      {banner && <div className="board-banner overlay-ui">{banner}</div>}
      {!items.length && empty && <div className="board-empty">{empty}</div>}
      {toast && <div className="board-toast">{toast}</div>}

      <div className="toolbar overlay-ui" onPointerDown={(event) => event.stopPropagation()}>
        <button className={tool === "move" ? "on" : ""} onClick={() => setTool("move")} title="Move (V)">
          <MoveIcon />
        </button>
        <button className={tool === "hand" ? "on" : ""} onClick={() => setTool("hand")} title="Hand (H, or hold Space)">
          <HandIcon />
        </button>
        {editable && (
          <button className={tool === "arrow" ? "on" : ""} onClick={() => setTool("arrow")} title="Arrow: drag from one scene to the next (A)">
            <ArrowToolIcon />
          </button>
        )}
        {onAddImages && (
          <button onClick={() => picker.current?.click()} title="Add an image or a video clip (I), or drop one on the board">
            <ImageIcon />
          </button>
        )}
        <span className="toolbar-rule" />
        <button onClick={arrange} title="Auto layout: the story in a row, in the order it plays (L)">
          <LayoutIcon />
        </button>
        <button onClick={() => fitTo(items.map((item) => item.id))} title="Zoom to fit (Shift+1)">
          <FitIcon />
        </button>
      </div>
      {onAddImages && (
        <input
          ref={picker}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml,video/*,.mov,.mkv"
          multiple
          hidden
          onChange={(event) => {
            addImages(imagesIn(event.target.files));
            event.target.value = "";
          }}
        />
      )}
      {dropping && <div className="board-drop">Drop images to put them on the board</div>}
    </div>
  );
});

/** A card's notes under its frame. When they're longer than the room below it, the type shrinks until they fit. */
function CardNotes({ words, children }: { words: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      let size = 44;
      el.style.fontSize = `${size}px`;
      while (el.scrollHeight > el.clientHeight && size > 18) {
        size -= 2;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    // Measured again once the web fonts are in, since they set the line breaks.
    document.fonts.ready.then(fit);
  }, [words]);
  return (
    <div ref={ref} className="card-notes" dir="auto">
      {children}
    </div>
  );
}
