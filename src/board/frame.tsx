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
 *                  { nykma: "pickAt", x, y }                pick the element at that point of the stage (viewer)
 *   frame → desk   { nykma: "board", type: "ready", frames, fps } | { type: "error", message }
 *                  { type: "frame", frame } while playing, { type: "ended" }
 *                  { type: "hover", el } | { type: "pick", el } | { type: "box", loc, box }
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
      else if (data.nykma === "pickAt") {
        const root = document.querySelector<HTMLElement>("[data-nykma-stage]");
        if (!root) return;
        const box = root.getBoundingClientRect();
        const k = box.width / video.width;
        const el = tagged(document.elementFromPoint(box.left + Number(data.x) * k, box.top + Number(data.y) * k));
        if (el && root.contains(el)) {
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
      const el = tagged(document.elementFromPoint(event.clientX, event.clientY));
      const loc = el && root?.contains(el) ? el.dataset.nk! : null;
      if (loc === hovered.current) return;
      hovered.current = loc;
      tell({ type: "hover", el: el && loc && root ? describe(el, root, video) : null });
    };
    const onLeave = () => {
      hovered.current = null;
      tell({ type: "hover", el: null });
    };
    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const root = stage();
      const el = tagged(document.elementFromPoint(event.clientX, event.clientY));
      if (el && root?.contains(el)) {
        setSelected(el.dataset.nk!);
        tell({ type: "pick", el: describe(el, root, video), alt: event.altKey, double: event.detail > 1 });
      } else tell({ type: "pick", el: null });
    };
    document.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.addEventListener("click", onClick, true);
    document.body.style.cursor = "default";
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("click", onClick, true);
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
