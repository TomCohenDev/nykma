/**
 * The timeline (spec.md §10.3): the story as one track of scenes with no gaps, as in Final Cut's storyline. Drag a
 * scene to move it, drag its edges to trim it, drag the playhead (or anywhere on the ruler) to scrub. The sound track shows the ad's
 * cues. Order and trims are written to story.json by the project; the timeline only reports what you did.
 */
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { SIZES, type Ratio } from "./api";

export type Clip = {
  id: string;
  name: string;
  kind: "scene" | "image" | "clip" | "row";
  frames: number;
  /** For a scene: the first frame shown and its full length, so its edges can be dragged back out. */
  trimIn?: number;
  full?: number;
  /** A still for the clip: one scene alone in board.html, or an image's own file. */
  thumb?: { videoId: string; ratio: Ratio; scene: string; version?: string } | { src: string };
  sub?: string;
};
export type Cue = { src: string; at: number; frames?: number; volume?: number };

type Props = {
  clips: Clip[];
  cues: Cue[];
  fps: number;
  frame: number;
  selected?: string;
  editable: boolean;
  dir: "ltr" | "rtl";
  onSeek: (frame: number) => void;
  onSelect: (id: string) => void;
  onReorder: (order: string[]) => void;
  onTrim: (id: string, trim: { in: number; out: number }) => void;
  onSeconds: (id: string, seconds: number) => void;
  onDropFiles?: (files: File[], index: number) => void;
  /** story.json's transitions, drawn where each goes into its scene; clicking one opens it. */
  transitions?: Record<string, { type: string; frames: number }>;
  onTransition?: (id: string) => void;
};

const HEAD = 116;
const LANE_PAD = 10;
/** The timeline's height, dragged at its top edge and kept for next time. */
const HEIGHT_KEY = "nykma.timeline-h";
const savedHeight = () => {
  try {
    return Number(localStorage.getItem(HEIGHT_KEY)) || 0;
  } catch {
    return 0;
  }
};
const setHeight = (px: number) => {
  const h = Math.round(Math.max(150, Math.min(window.innerHeight * 0.6, px)));
  document.documentElement.style.setProperty("--tl-h", `${h}px`);
  return h;
};
if (savedHeight()) setHeight(savedHeight());

const tc = (frame: number, fps: number) => {
  const s = Math.floor(frame / fps);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
export const timecode = (frame: number, fps: number) => {
  const f = Math.max(0, Math.round(frame));
  const s = Math.floor(f / fps);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(f % Math.round(fps)).padStart(2, "0")}`;
};

/** How long each sound file is, read from its metadata, in frames. */
function useDurations(srcs: string[], fps: number) {
  const [lengths, setLengths] = useState<Record<string, number>>({});
  useEffect(() => {
    for (const src of srcs) {
      if (lengths[src] !== undefined) continue;
      const audio = new Audio();
      audio.preload = "metadata";
      audio.onloadedmetadata = () => setLengths((current) => ({ ...current, [src]: Math.round(audio.duration * fps) }));
      audio.onerror = () => setLengths((current) => ({ ...current, [src]: 0 }));
      audio.src = `/${src}`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcs.join("|"), fps]);
  return lengths;
}

type Drag =
  | { kind: "scrub" }
  | { kind: "move"; id: string; x0: number; dx: number; started: boolean }
  | { kind: "trim-in" | "trim-out" | "seconds"; id: string; x0: number; dx: number };

export function Timeline({ clips, cues, fps, frame, selected, editable, dir, onSeek, onSelect, onReorder, onTrim, onSeconds, onDropFiles, transitions, onTransition }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const lanes = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [boxH, setBoxH] = useState(206);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const total = Math.max(1, clips.reduce((sum, clip) => sum + clip.frames, 0));
  const lengths = useDurations(cues.map((cue) => cue.src), fps);

  useLayoutEffect(() => {
    const el = wrap.current!;
    const fit = () => (setWidth(el.clientWidth), setBoxH(el.clientHeight));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const LANE_H = Math.max(56, Math.min(220, boxH - 128));
  const px = ((width - HEAD - 40) / total) * zoom; // pixels per frame
  const x = (f: number) => f * px;
  const starts: number[] = [];
  clips.reduce((at, clip) => (starts.push(at), at + clip.frames), 0);

  // Ruler: a tick every 1, 2, 5 or 10 s, whichever keeps labels apart.
  const step = [1, 2, 5, 10, 15, 30].find((s) => s * fps * px >= 56) ?? 60;
  const ticks = Array.from({ length: Math.floor(total / fps / step) + 1 }, (_, i) => i * step);

  const frameAt = (clientX: number) => Math.max(0, Math.min(total - 1, Math.round((clientX - lanes.current!.getBoundingClientRect().left - LANE_PAD) / px)));
  /** Press on the ruler, the playhead or an empty part of a track, and drag: the playhead follows the pointer. */
  const scrub = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    lanes.current!.setPointerCapture(event.pointerId);
    setDrag({ kind: "scrub" });
    onSeek(frameAt(event.clientX));
  };

  /* Dragging a clip: past 4 px it moves; on release it goes where the pointer is between the other clips. */
  const targetIndex = (id: string, dx: number) => {
    const from = clips.findIndex((clip) => clip.id === id);
    const centre = x(starts[from]) + x(clips[from].frames) / 2 + dx;
    let index = 0;
    clips.forEach((clip, i) => {
      if (i !== from && centre > x(starts[i]) + x(clip.frames) / 2) index++;
    });
    return index;
  };
  const begin = (event: ReactPointerEvent, kind: Drag["kind"], id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    setDrag(kind === "move" ? { kind, id, x0: event.clientX, dx: 0, started: false } : { kind, id, x0: event.clientX, dx: 0 });
  };
  const move = (event: ReactPointerEvent) => {
    if (!drag) return;
    if (drag.kind === "scrub") return onSeek(frameAt(event.clientX));
    const dx = event.clientX - drag.x0;
    if (drag.kind === "move") setDrag({ ...drag, dx, started: drag.started || Math.abs(dx) > 4 });
    else setDrag({ ...drag, dx });
  };
  const end = () => {
    if (!drag) return;
    if (drag.kind === "scrub") return setDrag(null);
    const clip = clips.find((item) => item.id === drag.id)!;
    const df = Math.round(drag.dx / px);
    if (drag.kind === "move") {
      if (!drag.started) onSelect(drag.id);
      else if (editable) {
        const rest = clips.map((item) => item.id).filter((id) => id !== drag.id);
        rest.splice(targetIndex(drag.id, drag.dx), 0, drag.id);
        onReorder(rest);
      }
    } else if (drag.kind === "seconds") onSeconds(drag.id, Math.max(0.5, Math.round(((clip.frames + df) / fps) * 10) / 10));
    else if (clip.full !== undefined) {
      const tin = clip.trimIn ?? 0;
      const out = tin + clip.frames;
      if (drag.kind === "trim-in") onTrim(drag.id, { in: Math.max(0, Math.min(out - 1, tin + df)), out });
      else onTrim(drag.id, { in: tin, out: Math.max(tin + 1, Math.min(clip.full, out + df)) });
    }
    setDrag(null);
  };

  /** What a clip looks like mid-drag: trims change its width, a move shifts it. */
  const shape = (clip: Clip, i: number) => {
    let left = x(starts[i]);
    let w = x(clip.frames);
    if (drag && drag.kind !== "scrub" && drag.id === clip.id) {
      const df = drag.dx / px;
      if (drag.kind === "move" && drag.started) left += drag.dx;
      if (drag.kind === "trim-out" && clip.full !== undefined) w = x(Math.max(1, Math.min(clip.full - (clip.trimIn ?? 0), clip.frames + df)));
      if (drag.kind === "seconds") w = x(Math.max(fps / 2, clip.frames + df));
      if (drag.kind === "trim-in" && clip.full !== undefined) {
        const d = Math.max(-(clip.trimIn ?? 0), Math.min(clip.frames - 1, df));
        left += x(d);
        w -= x(d);
      }
    }
    return { left, w };
  };
  const insertAt = drag?.kind === "move" && drag.started ? targetIndex(drag.id, drag.dx) : null;
  const dragged = drag && drag.kind !== "scrub" ? drag.id : undefined;
  const insertX = (index: number | null, skip?: string) => {
    if (index === null) return null;
    const others = clips.filter((clip) => clip.id !== skip);
    return x(others.slice(0, index).reduce((sum, clip) => sum + clip.frames, 0));
  };
  const marker = insertX(insertAt, dragged) ?? insertX(dropAt);

  return (
    <section
      className="timeline"
      ref={wrap}
      onDragOver={(event) => {
        if (!onDropFiles || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        const lane = wrap.current!.querySelector(".tl-lanes")!.getBoundingClientRect();
        const f = (event.clientX - lane.left - LANE_PAD) / px;
        setDropAt(starts.filter((start, i) => f > start + clips[i].frames / 2).length);
      }}
      onDragLeave={() => setDropAt(null)}
      onDrop={(event) => {
        if (!onDropFiles) return;
        event.preventDefault();
        const files = [...event.dataTransfer.files];
        if (files.length) onDropFiles(files, dropAt ?? clips.length);
        setDropAt(null);
      }}
    >
      <div
        className="tl-resize"
        title="Drag to make the timeline taller or shorter"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          const handle = event.currentTarget;
          handle.setPointerCapture(event.pointerId);
          const y0 = event.clientY;
          const h0 = wrap.current!.getBoundingClientRect().height;
          const onMove = (e: PointerEvent) => setHeight(h0 + y0 - e.clientY);
          const onUp = (e: PointerEvent) => {
            handle.removeEventListener("pointermove", onMove);
            handle.removeEventListener("pointerup", onUp);
            try {
              localStorage.setItem(HEIGHT_KEY, String(setHeight(h0 + y0 - e.clientY)));
            } catch {
              /* a private window: the height lasts this visit */
            }
          };
          handle.addEventListener("pointermove", onMove);
          handle.addEventListener("pointerup", onUp);
        }}
      />
      <div className="tl-bar">
        <span className="tl-hint">
          {editable ? (
            <>
              Drag a scene to move it · drag its edges to trim · drop images or clips here
            </>
          ) : clips.some((clip) => clip.kind === "row") ? (
            <>The storyboard, at the pitch's times</>
          ) : (
            <>One scene. Drop an image or a clip here to build a story around it</>
          )}
        </span>
        <span className="tl-total">{timecode(total, fps)}</span>
        <input className="tl-zoom" type="range" min={1} max={6} step={0.25} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Zoom the timeline" />
        <button className="ghost small" onClick={() => setZoom(1)}>
          Fit
        </button>
      </div>
      <div className="tl-body">
        <div className="tl-heads">
          <div className="tl-ruler-head" />
          <div className="tl-head" style={{ height: LANE_H }}>
            <i style={{ background: "var(--t-scene)" }} />
            {clips.some((clip) => clip.kind === "row") ? "Storyboard" : "Video"}
          </div>
          <div className="tl-head">
            <i style={{ background: "var(--t-music)" }} />
            Sound
          </div>
        </div>
        <div className="tl-scroll">
          <div className={`tl-lanes${drag?.kind === "scrub" ? " scrubbing" : ""}`} ref={lanes} style={{ width: x(total) + 40 }} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}>
            <div className="tl-ruler" onPointerDown={scrub} title="Drag to scrub">
              {ticks.map((s) => (
                <span key={s} style={{ left: x(s * fps) }}>
                  {tc(s * fps, fps)}
                </span>
              ))}
            </div>
            <div className="tl-lane" style={{ height: LANE_H }} onPointerDown={scrub}>
              {clips.map((clip, i) => {
                const { left, w } = shape(clip, i);
                const moving = drag?.kind === "move" && drag.id === clip.id && drag.started;
                const trimmable = editable && clip.kind === "scene" && clip.full !== undefined;
                return (
                  <div
                    key={clip.id}
                    className={`tl-clip ${clip.kind}${selected === clip.id ? " on" : ""}${moving ? " moving" : ""}`}
                    style={{ left, width: Math.max(w - 2, 4) }}
                    onPointerDown={(event) => begin(event, "move", clip.id)}
                    onDoubleClick={() => onSeek(starts[i])}
                    title={`${clip.name}${clip.sub ? ` · ${clip.sub}` : ""}`}
                  >
                    <div className="tl-clip-head" dir="auto">
                      <span className="tl-n">{i + 1}</span>
                      <span className="tl-name">{clip.name}</span>
                      <span className="tl-len">{(clip.frames / fps).toFixed(1)}s</span>
                    </div>
                    <Thumb clip={clip} height={LANE_H - 22} width={w} />
                    {trimmable && <span className="tl-handle in" onPointerDown={(event) => begin(event, "trim-in", clip.id)} title="Drag to trim the start" />}
                    {trimmable && <span className="tl-handle out" onPointerDown={(event) => begin(event, "trim-out", clip.id)} title="Drag to trim the end" />}
                    {editable && clip.kind === "image" && <span className="tl-handle out" onPointerDown={(event) => begin(event, "seconds", clip.id)} title="Drag to show it longer or shorter" />}
                    {(clip.trimIn ?? 0) > 0 && <span className="tl-trimmed in" title={`${clip.trimIn} frames trimmed`} />}
                    {clip.full !== undefined && (clip.trimIn ?? 0) + clip.frames < clip.full && <span className="tl-trimmed out" title={`${clip.full - (clip.trimIn ?? 0) - clip.frames} frames trimmed`} />}
                  </div>
                );
              })}
              {clips.map((clip, i) => {
                const tr = transitions?.[clip.id];
                if (!i || !tr || tr.type === "cut" || (drag && drag.kind !== "scrub")) return null;
                return (
                  <button
                    key={`tr:${clip.id}`}
                    className="tl-tr"
                    style={{ left: x(starts[i]) - 9, ["--tr-w" as string]: `${Math.max(6, x(Math.min(tr.frames, clip.frames)))}px` }}
                    title={`${tr.type} into ${clip.name}, ${(tr.frames / fps).toFixed(2)} s`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => onTransition?.(clip.id)}
                  />
                );
              })}
              {marker !== null && <div className="tl-insert" style={{ left: marker }} />}
            </div>
            <div className="tl-lane" onPointerDown={scrub}>
              {cues.map((cue, i) => {
                const known = lengths[cue.src];
                const offset = typeof (cue as { trim?: unknown }).trim === "number" ? ((cue as { trim?: number }).trim ?? 0) : 0;
                const length = cue.frames ?? (known !== undefined ? Math.max(1, known - offset) : total - cue.at);
                const name = cue.src.split("/").pop()!;
                return (
                  <div key={i} className="tl-cue" style={{ left: x(cue.at), width: Math.max(x(Math.min(length, total - cue.at)) - 2, 6) }} title={name}>
                    <span>{name}</span>
                  </div>
                );
              })}
              {cues.length === 0 && <span className="tl-empty">No sound</span>}
            </div>
            <div className="tl-playhead" style={{ left: x(frame) }}>
              <span className="tl-playhead-grab" onPointerDown={scrub} title="Drag to scrub" />
            </div>
          </div>
        </div>
      </div>
      {dir === "rtl" && <span hidden />}
    </section>
  );
}

/** The bar under the viewer: the whole video, with a tick where each scene starts. Press and drag to scrub. */
export function Scrubber({ frame, total, starts, onSeek }: { frame: number; total: number; starts: number[]; onSeek: (frame: number) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(false);
  const at = (clientX: number) => {
    const box = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(total - 1, Math.round(((clientX - box.left) / box.width) * (total - 1))));
  };
  const share = total > 1 ? frame / (total - 1) : 0;
  return (
    <div
      className={`scrubber${held ? " held" : ""}`}
      ref={bar}
      role="slider"
      aria-label="Playhead"
      aria-valuemin={0}
      aria-valuemax={total - 1}
      aria-valuenow={frame}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setHeld(true);
        onSeek(at(event.clientX));
      }}
      onPointerMove={(event) => held && onSeek(at(event.clientX))}
      onPointerUp={() => setHeld(false)}
      onPointerCancel={() => setHeld(false)}
    >
      <div className="scrub-track">
        <div className="scrub-fill" style={{ width: `${share * 100}%` }} />
        {starts.slice(1).map((start) => (
          <i key={start} style={{ left: `${(start / Math.max(1, total - 1)) * 100}%` }} />
        ))}
      </div>
      <div className="scrub-knob" style={{ left: `${share * 100}%` }} />
    </div>
  );
}

/** A filmstrip per clip: one board.html iframe drawing a few frames of the scene side by side, or the image tiled. */
function Thumb({ clip, height, width }: { clip: Clip; height: number; width: number }) {
  const t = clip.thumb;
  if (!t) return <div className="tl-thumb empty" />;
  if ("src" in t) return <div className="tl-thumb" style={{ backgroundImage: `url("${t.src}")` }} />;
  const size = SIZES[t.ratio];
  const each = (size.width / size.height) * height;
  // Whole thumbnails only, and a count that changes in steps, so zooming doesn't reload the strip on every pixel.
  const count = Math.min(24, Math.max(1, Math.ceil(width / each)));
  return (
    <div className="tl-thumb live">
      <iframe
        title={clip.name}
        loading="lazy"
        tabIndex={-1}
        src={`/board.html?id=${encodeURIComponent(t.videoId)}&scene=${encodeURIComponent(t.scene)}&strip=${count}&h=${Math.round(height)}&v=${t.version ?? clip.frames}`}
        style={{ width: Math.ceil(each * count), height }}
      />
    </div>
  );
}
