/**
 * board.html?id=<video id>[&scene=<scene id>][&f=<frame>][&viewer]: an ad at its exact size, in an iframe on the desk
 * (spec.md §10.3). A broken ad breaks only its own frame. With `scene` it's one scene alone; without, the whole video in
 * story order (the desk's viewer). `&strip=<n>&h=<px>` draws n frames of the scene side by side, h px tall: the
 * timeline's filmstrip, one iframe per scene.
 *   desk → frame   { nykma: "frame", frame }                 show this frame
 *                  { nykma: "play", from } | { nykma: "pause" }   play with sound from a frame (viewer)
 *                  { nykma: "pick", on }                    hover and click pick elements tagged data-nk (viewer)
 *                  { nykma: "select", loc }                 keep reporting this element's box as frames change
 *                  { nykma: "preview", loc, style }         show style values on that element before they're saved
 *                  { nykma: "preview", loc: null, restore }  end it: put the old values back, or keep them (saved)
 *                  { nykma: "pickAt", x, y }                a click at that point of the stage (viewer), as below
 *                  { nykma: "hoverAt", x, y }               the pointer is there, over the desk's selection box
 *                  { nykma: "stackAt", x, y }               list every tagged element at that point (right click)
 *                  { nykma: "sample", id }                  the ad's look on this frame, for a new element (Add tab)
 *                  { nykma: "layers", id }                  every tagged element on this frame, for the Layers tab
 *                  { nykma: "pickLoc", loc } | { nykma: "hoverLoc", loc }   select or outline an element by its tag
 *   frame → desk   { nykma: "board", type: "ready", frames, fps } | { type: "error", message }
 *                  { type: "frame", frame } while playing, { type: "ended" }
 *                  { type: "hover", el, under } | { type: "pick", el } | { type: "box", loc, box }
 *                  { type: "stack", x, y, items } | { type: "edit" } (a double click: edit the selection's text)
 *                  { type: "sample", id, sample } | { type: "layers", id, layers }
 * A click picks the topmost tagged element at the point. A click on the selected element, or a second click on the same
 * spot, goes one down instead, so whatever sits behind a full-frame veil can still be reached; hover shows that one.
 * The registry is imported dynamically, so even an ad that fails to load reports back instead of a blank frame.
 */
import { Component, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Video } from "../engine/ad";
import { Stage } from "../engine/Stage";
import { knobsSeen, type KnobKind, type TuneValue } from "../engine/tune";
import { Sound } from "../preview/sound";

const params = new URLSearchParams(location.search);
const tell = (message: object) => parent.postMessage({ nykma: "board", ...message }, location.origin);

window.addEventListener("error", (event) => tell({ type: "error", message: event.message }));
window.addEventListener("unhandledrejection", (event) => tell({ type: "error", message: String(event.reason?.message ?? event.reason) }));

class Guard extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    tell({ type: "error", message: error.message });
  }
  render() {
    return this.state.error ? <div className="scene-error">{this.state.error.message}</div> : this.props.children;
  }
}

/** What the desk learns about an element: where its JSX is, its box on the stage, and how its text looks. */
export type Picked = {
  loc: string;
  knobs: string[];
  tag: string;
  text: string;
  box: { x: number; y: number; width: number; height: number };
  font: string;
  size: number;
  weight: string;
  color: string;
  /** What the engine knows of each knob here and around it: its kind and the code's own value. */
  knobInfo: Record<string, { kind: KnobKind; fallback: TuneValue }>;
  /** The tagged elements around it, innermost first, for the inspector's breadcrumb. */
  path: { loc: string; tag: string; knobs: string[]; text: string }[];
  svg: boolean;
  /** Stage pixels per CSS pixel where the element sits (its parents' scale), so a drag on the stage becomes a translate. */
  local: number;
  /** Computed values the inspector shows when the code doesn't set them. */
  computed: Record<string, string>;
};

const COMPUTED = ["fontSize", "fontWeight", "color", "fill", "letterSpacing", "lineHeight", "opacity", "backgroundColor", "borderRadius", "textAlign", "translate", "scale", "rotate"] as const;

const tagged = (el: Element | null) => el?.closest<HTMLElement | SVGElement>("[data-nk]") ?? null;

/** Whether an element shows at all: not hidden, and neither it nor anything around it at opacity 0. */
const showing = (el: Element) => {
  const check = (el as Element & { checkVisibility?: (options: object) => boolean }).checkVisibility;
  return check ? check.call(el, { opacityProperty: true, visibilityProperty: true }) : true;
};

/** Every tagged element at a point of the window that shows, topmost first, one per tag. A see-through one isn't hit. */
function stackAt(stage: HTMLElement, x: number, y: number) {
  const seen = new Set<string>();
  const stack: (HTMLElement | SVGElement)[] = [];
  for (const hit of document.elementsFromPoint(x, y)) {
    const el = tagged(hit);
    if (!el || !stage.contains(el) || seen.has(el.dataset.nk!) || !showing(hit)) continue;
    seen.add(el.dataset.nk!);
    stack.push(el);
  }
  return stack;
}

/** Where the last click landed, so a second click on the same spot goes one further down. */
let lastClick = { x: NaN, y: NaN };
const SAME_SPOT = 4;

/**
 * What a click at this point picks: the topmost element, or the one under the selection when the selection is the
 * topmost here or the click is on the same spot as the last one. Past the bottom of the stack it wraps to the top.
 */
function targetAt(stage: HTMLElement, x: number, y: number, selected: string | null) {
  const stack = stackAt(stage, x, y);
  const i = selected ? stack.findIndex((el) => el.dataset.nk === selected) : -1;
  const same = Math.hypot(x - lastClick.x, y - lastClick.y) <= SAME_SPOT;
  if (i >= 0 && stack.length > 1 && (i === 0 || same)) return { el: stack[(i + 1) % stack.length], under: true };
  return { el: stack[0] ?? null, under: false };
}

function describe(el: HTMLElement | SVGElement, stage: HTMLElement, video: Video): Picked {
  const origin = stage.getBoundingClientRect();
  const k = origin.width / video.width;
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const parentEl = el.parentElement;
  const parentRect = parentEl?.getBoundingClientRect();
  const local = parentEl && parentEl.offsetWidth > 0 && parentRect ? parentRect.width / k / parentEl.offsetWidth : 1;
  const path: Picked["path"] = [];
  for (let at = tagged(el.parentElement); at && stage.contains(at); at = tagged(at.parentElement)) path.push({ loc: at.dataset.nk!, tag: at.tagName.toLowerCase(), knobs: (at.dataset.nkKnobs ?? "").split(",").filter(Boolean), text: (at.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300) });
  const seen = knobsSeen(video.slug).filter((knob) => knob.ratio === video.ratio);
  const ids = new Set([...(el.dataset.nkKnobs ?? "").split(","), ...path.flatMap((item) => item.knobs)].filter(Boolean));
  const knobInfo = Object.fromEntries(seen.filter((knob) => ids.has(knob.id)).map((knob) => [knob.id, { kind: knob.kind, fallback: knob.fallback }]));
  return {
    knobInfo,
    loc: el.dataset.nk!,
    knobs: (el.dataset.nkKnobs ?? "").split(",").filter(Boolean),
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
    box: { x: (rect.left - origin.left) / k, y: (rect.top - origin.top) / k, width: rect.width / k, height: rect.height / k },
    font: style.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
    size: Math.round(parseFloat(style.fontSize) * 10) / 10,
    weight: style.fontWeight,
    color: el instanceof SVGElement ? style.fill : style.color,
    path,
    svg: el instanceof SVGElement,
    local: Number.isFinite(local) && local > 0 ? local : 1,
    computed: Object.fromEntries(COMPUTED.map((name) => [name, String(style[name as keyof CSSStyleDeclaration] ?? "")])),
  };
}

/** The ad's look on this frame: its biggest text's font, and its colours. A new element starts from it. */
export type Sample = {
  headline: { fontFamily: string; fontWeight: string; fontSize: number; color: string; letterSpacing: string } | null;
  /** The most saturated fill, and the lightest one (what a label sits on). */
  accent: string | null;
  paper: string | null;
};

const rgba = (value: string) => {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(value);
  return m ? { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a: m[4] === undefined ? 1 : +m[4] } : null;
};

function sampleStyle(stage: HTMLElement, video: Video): Sample {
  const origin = stage.getBoundingClientRect();
  const k = origin.width / video.width;
  let best: { size: number; el: Element } | null = null;
  let accent: { sat: number; color: string } | null = null;
  let paper: { light: number; color: string } | null = null;
  for (const el of stage.querySelectorAll("*")) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2 || rect.right < origin.left || rect.left > origin.right || rect.bottom < origin.top || rect.top > origin.bottom) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || Number(style.opacity) < 0.05) continue;
    const own = [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 1);
    if (own && el instanceof HTMLElement && el.offsetHeight > 0) {
      // Its size as seen, after any scale above it.
      const size = (parseFloat(style.fontSize) * rect.height) / el.offsetHeight / k;
      if (!best || size > best.size) best = { size, el };
    }
    const fill = rgba(style.backgroundColor);
    if (fill && fill.a > 0.6 && (rect.width * rect.height) / (k * k) > 4000) {
      const max = Math.max(fill.r, fill.g, fill.b);
      const min = Math.min(fill.r, fill.g, fill.b);
      const light = (max + min) / 2;
      const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
      if (sat > 0.3 && light > 0.2 && light < 0.8 && (!accent || sat > accent.sat)) accent = { sat, color: style.backgroundColor };
      if (light > 0.9 && (!paper || light > paper.light)) paper = { light, color: style.backgroundColor };
    }
  }
  const head = best ? getComputedStyle(best.el) : null;
  return {
    headline: best && head ? { fontFamily: head.fontFamily, fontWeight: head.fontWeight, fontSize: Math.round(best.size), color: head.color, letterSpacing: head.letterSpacing === "normal" ? "" : head.letterSpacing } : null,
    accent: accent?.color ?? null,
    paper: paper?.color ?? null,
  };
}

/**
 * What a layer looks like, for its thumbnail: its fill (a colour, a gradient or an image), a picture it shows (an <img>,
 * or an <svg> as a data URL), the first letters of its text in its colour and weight, and its box as fractions of the
 * frame (for a container with nothing of its own to show).
 */
export type Look = {
  fill?: { color?: string; image?: string; radius?: number };
  src?: string;
  glyph?: { text: string; color: string; weight: string };
  box: { x: number; y: number; w: number; h: number };
};
/** One row of the Layers tab: a tagged element (all the elements with its tag, for one drawn in a list). */
export type Layer = { loc: string; tag: string; text: string; depth: number; count: number; shown: boolean; look: Look };

const SVG_MAX = 12_000;

function lookOf(el: HTMLElement | SVGElement, rect: DOMRect, origin: DOMRect, own: string, svgBudget: { left: number }): Look {
  const style = getComputedStyle(el);
  const look: Look = {
    box: { x: (rect.left - origin.left) / origin.width, y: (rect.top - origin.top) / origin.height, w: rect.width / origin.width, h: rect.height / origin.height },
  };
  const color = /rgba?\([^)]*\)/.test(style.backgroundColor) && !/,\s*0\)$/.test(style.backgroundColor) && style.backgroundColor !== "transparent" ? style.backgroundColor : undefined;
  // A url() or a gradient, but not one so long it would bloat the list.
  const image = style.backgroundImage !== "none" && style.backgroundImage.length < 2000 ? style.backgroundImage : undefined;
  // Its corner as a share of its shorter side, so the thumbnail rounds the same way at its own size.
  const side = el instanceof HTMLElement ? Math.min(el.offsetWidth, el.offsetHeight) : 0;
  if (color || image) look.fill = { color, image, radius: side > 0 ? Math.min((parseFloat(style.borderTopLeftRadius) || 0) / side, 0.5) : 0 };
  if (el instanceof HTMLImageElement && (el.currentSrc || el.src)) look.src = el.currentSrc || el.src;
  else if (el instanceof SVGSVGElement && svgBudget.left > 0) {
    const markup = new XMLSerializer().serializeToString(el);
    if (markup.length <= SVG_MAX) {
      look.src = `data:image/svg+xml,${encodeURIComponent(markup)}`;
      svgBudget.left--;
    }
  }
  const text = own.replace(/\s+/g, " ").trim();
  if (text) look.glyph = { text: [...text].slice(0, 2).join(""), color: style.color, weight: style.fontWeight };
  return look;
}

/** Every tagged element on this frame, in the page's order, with how deep it sits among them. Inside an <svg> only the svg itself. */
function layersOf(stage: HTMLElement): Layer[] {
  const origin = stage.getBoundingClientRect();
  const byLoc = new Map<string, Layer>();
  const list: Layer[] = [];
  const svgBudget = { left: 30 };
  for (const el of stage.querySelectorAll<HTMLElement | SVGElement>("[data-nk]")) {
    if (el.parentElement?.closest("svg") || el.tagName === "STYLE" || el.tagName === "SCRIPT") continue;
    const loc = el.dataset.nk!;
    const rect = el.getBoundingClientRect();
    const onFrame = rect.width > 0.5 && rect.height > 0.5 && rect.right > origin.left && rect.left < origin.right && rect.bottom > origin.top && rect.top < origin.bottom;
    const shown = onFrame && showing(el);
    const seen = byLoc.get(loc);
    if (seen) {
      seen.count++;
      seen.shown ||= shown;
      continue;
    }
    let depth = 0;
    for (let at = tagged(el.parentElement); at && stage.contains(at); at = tagged(at.parentElement)) depth++;
    const own = [...el.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? "").join(" ");
    const text = (own.trim() ? own : el.querySelector("[data-nk]") ? "" : (el.textContent ?? "")).replace(/\s+/g, " ").trim().slice(0, 60);
    const layer = { loc, tag: el.tagName.toLowerCase(), text, depth, count: 1, shown, look: lookOf(el, rect, origin, own, svgBudget) };
    byLoc.set(loc, layer);
    list.push(layer);
  }
  return list;
}

const sound = new Sound();

/** Values shown on an element before they're saved: what each property was, so a cancelled drag can put it back. */
let previewed: { loc: string; els: { el: HTMLElement | SVGElement; was: Record<string, string> }[] } | null = null;
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
/** Ends a preview. Saved values stay as they are: the hot reload draws the same thing from the code. */
function endPreview(restore: boolean) {
  if (previewed && restore) for (const { el, was } of previewed.els) for (const [name, value] of Object.entries(was)) el.style.setProperty(kebab(name), value);
  previewed = null;
}
function preview(loc: string, style: Record<string, string>) {
  if (previewed && previewed.loc !== loc) endPreview(true);
  const stage = document.querySelector<HTMLElement>("[data-nykma-stage]");
  if (!stage) return;
  if (!previewed) previewed = { loc, els: [...stage.querySelectorAll<HTMLElement>(`[data-nk="${CSS.escape(loc)}"]`)].map((el) => ({ el, was: {} })) };
  for (const item of previewed.els)
    for (const [name, value] of Object.entries(style)) {
      if (!(name in item.was)) item.was[name] = item.el.style.getPropertyValue(kebab(name));
      item.el.style.setProperty(kebab(name), value);
    }
}

function Scene({ video, viewer }: { video: Video; viewer: boolean }) {
  const [frame, setFrame] = useState(Number(params.get("f")) || 0);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const playback = useRef<{ stop: () => void } | null>(null);
  const hovered = useRef<string | null>(null);
  const chosen = useRef<string | null>(null);
  chosen.current = selected;

  useEffect(() => {
    const stop = () => {
      playback.current?.stop();
      playback.current = null;
    };
    const play = async (from: number) => {
      stop();
      let stopped = false;
      let raf = 0;
      playback.current = { stop: () => ((stopped = true), cancelAnimationFrame(raf), sound.stop()) };
      const origin = await sound.play(video, from);
      if (stopped) return sound.stop();
      const tick = () => {
        if (stopped) return;
        const f = from + Math.floor((sound.now() - origin) * video.fps);
        if (f >= video.frames) {
          stop();
          setFrame(video.frames - 1);
          return tell({ type: "ended" });
        }
        setFrame(Math.max(f, from));
        tell({ type: "frame", frame: Math.max(f, from) });
        raf = requestAnimationFrame(tick);
      };
      tick();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || typeof event.data?.nykma !== "string") return;
      const data = event.data;
      if (data.nykma === "frame") {
        if (!playback.current) setFrame(Number(data.frame) || 0);
      } else if (data.nykma === "play") void play(Math.min(Math.max(Number(data.from) || 0, 0), Math.max(video.frames - 1, 0)));
      else if (data.nykma === "pause") stop();
      else if (data.nykma === "pick") setPicking(Boolean(data.on));
      else if (data.nykma === "select") setSelected(data.loc ?? null);
      else if (data.nykma === "preview") {
        if (data.loc && data.style) preview(String(data.loc), data.style);
        else endPreview(data.restore !== false);
      }
      else if (data.nykma === "layers") {
        const root = document.querySelector<HTMLElement>("[data-nykma-stage]");
        tell({ type: "layers", id: data.id, layers: root ? layersOf(root) : [] });
      } else if (data.nykma === "pickLoc" || data.nykma === "hoverLoc") {
        const root = document.querySelector<HTMLElement>("[data-nykma-stage]");
        const el = root && data.loc ? root.querySelector<HTMLElement | SVGElement>(`[data-nk="${CSS.escape(String(data.loc))}"]`) : null;
        if (data.nykma === "hoverLoc") return tell({ type: "hover", el: el && root ? describe(el, root, video) : null, under: false });
        if (!el || !root) return;
        chosen.current = el.dataset.nk!;
        setSelected(el.dataset.nk!);
        tell({ type: "pick", el: describe(el, root, video) });
      } else if (data.nykma === "sample") {
        const root = document.querySelector<HTMLElement>("[data-nykma-stage]");
        tell({ type: "sample", id: data.id, sample: root ? sampleStyle(root, video) : null });
      } else if (data.nykma === "pickAt" || data.nykma === "hoverAt" || data.nykma === "stackAt") {
        const root = document.querySelector<HTMLElement>("[data-nykma-stage]");
        if (!root) return;
        const box = root.getBoundingClientRect();
        const k = box.width / video.width;
        const x = box.left + Number(data.x) * k;
        const y = box.top + Number(data.y) * k;
        if (data.nykma === "stackAt") return tell({ type: "stack", x: Number(data.x), y: Number(data.y), items: stackAt(root, x, y).map((el) => describe(el, root, video)) });
        const { el, under } = targetAt(root, x, y, chosen.current);
        if (data.nykma === "hoverAt") {
          hovered.current = el?.dataset.nk ?? null;
          return tell({ type: "hover", el: el ? describe(el, root, video) : null, under });
        }
        lastClick = { x, y };
        if (el) {
          chosen.current = el.dataset.nk!;
          setSelected(el.dataset.nk!);
          tell({ type: "pick", el: describe(el, root, video) });
        } else tell({ type: "pick", el: null });
      }
    };
    window.addEventListener("message", onMessage);
    tell({ type: "ready", frames: video.frames, fps: video.fps });
    return () => {
      window.removeEventListener("message", onMessage);
      stop();
    };
  }, [video]);

  // The selected element moves with the frame (and with hot reloads), so its box is sent again after each commit.
  useLayoutEffect(() => {
    if (!viewer || !selected) return;
    const stage = document.querySelector<HTMLElement>("[data-nykma-stage]");
    const el = stage?.querySelector<HTMLElement>(`[data-nk="${CSS.escape(selected)}"]`);
    tell({ type: "box", loc: selected, el: el && stage ? describe(el, stage, video) : null });
  });

  // A click in the viewer gives it focus, and its keys would stop at the iframe. They go to the desk instead.
  useEffect(() => {
    if (!viewer) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest?.("input, textarea, select, [contenteditable]")) return;
      if ([" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) event.preventDefault();
      const { key, shiftKey, ctrlKey, metaKey, altKey } = event;
      tell({ type: "key", event: { key, shiftKey, ctrlKey, metaKey, altKey } });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [viewer]);

  useEffect(() => {
    if (!viewer || !picking) return;
    const stage = () => document.querySelector<HTMLElement>("[data-nykma-stage]");
    const onMove = (event: PointerEvent) => {
      const root = stage();
      if (!root) return;
      const { el, under } = targetAt(root, event.clientX, event.clientY, chosen.current);
      const loc = el?.dataset.nk ?? null;
      if (loc === hovered.current) return;
      hovered.current = loc;
      tell({ type: "hover", el: el ? describe(el, root, video) : null, under });
    };
    const onLeave = () => {
      hovered.current = null;
      tell({ type: "hover", el: null });
    };
    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const root = stage();
      if (!root) return;
      // The second click of a double click keeps the selection and edits its text.
      if (event.detail > 1) return void (chosen.current && tell({ type: "edit" }));
      const { el } = targetAt(root, event.clientX, event.clientY, chosen.current);
      lastClick = { x: event.clientX, y: event.clientY };
      hovered.current = null;
      if (el) {
        chosen.current = el.dataset.nk!;
        setSelected(el.dataset.nk!);
        tell({ type: "pick", el: describe(el, root, video) });
      } else tell({ type: "pick", el: null });
    };
    const onMenu = (event: MouseEvent) => {
      event.preventDefault();
      const root = stage();
      if (!root) return;
      const box = root.getBoundingClientRect();
      const k = box.width / video.width;
      tell({ type: "stack", x: (event.clientX - box.left) / k, y: (event.clientY - box.top) / k, items: stackAt(root, event.clientX, event.clientY).map((el) => describe(el, root, video)) });
    };
    document.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onMenu);
    document.body.style.cursor = "default";
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("contextmenu", onMenu);
    };
  }, [viewer, picking, video]);

  return (
    <Guard>
      <Stage video={video} frame={frame} />
    </Guard>
  );
}

/** n frames spread over a scene, each scaled to `height`, in a row. Static: no messages, no sound. */
function Strip({ video, frames, count, height }: { video: Video; frames: number; count: number; height: number }) {
  const scale = height / video.height;
  // A scene that draws on a canvas (three.js) costs a WebGL context per copy, and the browser allows about 16 for the
  // whole desk, so it gets one frame. One copy is drawn first to find out; a passive effect runs after the scene's own.
  const [mode, setMode] = useState<"probe" | "one" | "all">("probe");
  useEffect(() => {
    if (mode === "probe") setMode(document.querySelector("canvas") ? "one" : "all");
  }, [mode]);
  const shown = mode === "all" ? count : 1;
  const at = (i: number) => Math.min(frames - 1, Math.floor(((i + 0.5) / shown) * frames));
  useEffect(() => tell({ type: "ready", frames, fps: video.fps }), [frames, video.fps]);
  return (
    <div style={{ display: "flex", height, overflow: "hidden" }}>
      {Array.from({ length: shown }, (_, i) => (
        <div key={i} style={{ width: video.width * scale, height, flex: "none", overflow: "hidden" }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0" }}>
            <Guard>
              <Stage video={video} frame={at(i)} />
            </Guard>
          </div>
        </div>
      ))}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
const fail = (message: string) => {
  root.render(<div className="scene-error">{message}</div>);
  tell({ type: "error", message });
};

type RegistryModule = typeof import("../registry");

function mount({ findVideo }: RegistryModule) {
  const video = findVideo(params.get("id") ?? "");
  if (!video) return fail(`No video "${params.get("id")}" in the registry.`);
  const sceneId = params.get("scene");
  const scene = sceneId ? video.scenes.find((item) => item.id === sceneId) : undefined;
  if (sceneId && !scene) return fail(`${video.slug} has no scene "${sceneId}".`);
  // A scene alone: its own component, its own frames from 0. The rest of the video stays as it is, so useVideo() matches the render.
  const alone = scene ? { ...video, component: scene.component } : video;
  if (scene && params.has("strip")) {
    const count = Math.min(24, Math.max(1, Number(params.get("strip")) || 1));
    return root.render(<Strip video={alone} frames={Math.max(1, scene.frames)} count={count} height={Math.max(16, Number(params.get("h")) || 48)} />);
  }
  root.render(<Scene video={alone} viewer={params.has("viewer")} />);
}

// When an ad's code changes, the registry hands its new self here (src/registry.ts) and the frame draws it again in
// place, keeping its frame and selection. Without that, Vite would reload every open page, the desk with them.
const listeners: Set<(next: RegistryModule) => void> = ((globalThis as any).__nykmaRegistry ??= new Set());
listeners.add(mount);

import("../registry")
  .then((registry) => {
    sessionStorage.removeItem(`nykma.reloaded:${location.search}`);
    mount(registry);
  })
  .catch((error) => {
    // Vite rebuilt its dependency cache since this page loaded, so its imports are stale. One reload fetches the new
    // ones; a second failure is a real error and is shown.
    const key = `nykma.reloaded:${location.search}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      return location.reload();
    }
    sessionStorage.removeItem(key);
    fail(`The registry didn't load: ${error?.message ?? error}`);
  });
