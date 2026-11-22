/**
 * The Effects tab (spec.md §10.13). For an element: an entrance, a loop and an exit, written into the ad's code as its
 * `data-fx` attribute (src/engine/fx.ts), so the render draws them exactly as the viewer does. For a scene: the
 * transition into it from the scene before, written to story.json's `transitions` (src/engine/transitions.ts).
 * Each tile previews its effect with the engine's own maths when you hover it.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { EFFECTS, FX_EASES, formatFx, fxPose, parseFx, type FxEase, type FxInfo, type FxSlot, type FxStep } from "../engine/fx";
import { TRANSITIONS, transitionLook, type StoryTransition } from "../engine/transitions";
import type { EditSource, SourceElement } from "./Inspector";
import type { Picked } from "./Viewer";

const SLOTS: { slot: FxSlot; title: string; none: string }[] = [
  { slot: "in", title: "Entrance", none: "Just there" },
  { slot: "loop", title: "Loop", none: "Still" },
  { slot: "out", title: "Exit", none: "Stays" },
];

/** The element's data-fx value as its code writes it, or why the desk can't change it. */
export function fxOf(source: SourceElement | null): { value: string; editable: boolean } {
  const attr = source?.attrs?.find((item) => item.name === "data-fx");
  if (attr) return { value: attr.value, editable: attr.editable };
  const prop = source?.props.find((item) => item.name === "data-fx");
  if (prop) return { value: typeof prop.value === "string" ? prop.value : "", editable: prop.editable };
  return { value: "", editable: true };
}

const labelOf = (slot: FxSlot, id: string) => EFFECTS[slot].find((item) => item.id === id)?.label ?? id;

/** "Fade up in · Float · Fade out", for the inspector. */
export function describeFx(value: string): string {
  const steps = parseFx(value);
  return steps.map((step) => (step.slot === "in" ? `In: ${labelOf("in", step.effect)}` : step.slot === "loop" ? `Loop: ${labelOf("loop", step.effect)}` : `Out: ${labelOf("out", step.effect)}`)).join(" · ");
}

export function describeTransition(entry: StoryTransition | undefined, fps: number): string {
  if (!entry || entry.type === "cut") return "";
  const label = TRANSITIONS.find((item) => item.id === entry.type)?.label ?? entry.type;
  return `${label}, ${(entry.frames / fps).toFixed(2)} s`;
}

/** Plays `length` frames on a loop while `on`, and rests on `rest` otherwise. */
function useLoop(on: boolean, length: number, rest: number) {
  const [frame, setFrame] = useState(rest);
  useEffect(() => {
    if (!on) return setFrame(rest);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setFrame(Math.floor(((now - start) / 1000) * 30) % length);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, length, rest]);
  return frame;
}

/** A tile for one effect: a little card that does the effect, with the engine's maths, while you hover it. */
function FxTile({ slot, info, on, onPick }: { slot: FxSlot; info: FxInfo | null; on: boolean; onPick: () => void }) {
  const [hover, setHover] = useState(false);
  // A loop shows two cycles; an entrance or an exit plays with a pause around it.
  const length = info ? (slot === "loop" ? info.frames * 2 : info.frames + 30) : 1;
  const step: FxStep | null = info ? { slot, effect: info.id, at: 10, frames: info.frames } : null;
  // At rest: an entrance shows where it ends, an exit and a loop where they start.
  const frame = useLoop(hover && Boolean(info), length, slot === "in" ? length - 1 : slot === "loop" ? step?.at ?? 0 : 0);
  const pose = step ? fxPose([step], frame, slot === "out" ? info!.frames + 20 : length) : null;
  const k = 0.22; // the tile is about a fifth of a real element
  const style: CSSProperties = pose
    ? {
        translate: `${pose.x * k}px ${pose.y * k}px`,
        scale: String(pose.s),
        rotate: `${pose.r}deg`,
        opacity: pose.o,
        filter: `${pose.blur ? `blur(${pose.blur * k}px)` : ""}${pose.glow ? ` drop-shadow(0 0 ${pose.glow * k}px var(--accent))` : ""}` || undefined,
        maskImage: pose.mask,
        WebkitMaskImage: pose.mask,
      }
    : {};
  return (
    <button className={`fx-tile${on ? " on" : ""}`} onClick={onPick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} aria-pressed={on}>
      <span className="fx-stage">{info ? <i style={style} /> : <i className="still" />}</span>
      <span className="fx-name">{info ? info.label : SLOTS.find((item) => item.slot === slot)!.none}</span>
    </button>
  );
}

/** A tile for one transition: two cards, A going and B coming, drawn with the engine's look while you hover. */
function TransitionTile({ id, label, description, on, onPick }: { id: string; label: string; description: string; on: boolean; onPick: () => void }) {
  const [hover, setHover] = useState(false);
  const frame = useLoop(hover && id !== "cut", 50, 34);
  const p = Math.max(0, Math.min(1, (frame - 8) / 26));
  const look = id === "cut" ? (p < 0.5 ? null : { out: { visibility: "hidden" as const }, in: {} }) : transitionLook(id, p, { width: 64, height: 40 });
  return (
    <button className={`fx-tile tr${on ? " on" : ""}`} onClick={onPick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title={description} aria-pressed={on}>
      <span className="fx-stage tr-stage">
        <b className="tr-a" style={look ? { ...look.out, zIndex: look.outOnTop ? 2 : 1 } : { zIndex: 2 }}>A</b>
        <b className="tr-b" style={look ? { ...look.in, zIndex: look.outOnTop ? 1 : 2 } : { visibility: "hidden" }}>B</b>
        {look && "overlay" in look && look.overlay && <b className="tr-o" style={look.overlay} />}
      </span>
      <span className="fx-name">{label}</span>
    </button>
  );
}

type ElementProps = {
  el: Picked;
  source: SourceElement | null;
  onEdit: EditSource;
  /** The playhead, counted in the scene it's in, for "start here". */
  localFrame: number;
  fps: number;
};

function ElementEffects({ el, source, onEdit, localFrame, fps }: ElementProps) {
  const { value, editable } = fxOf(source);
  const steps = parseFx(value);
  const parts = el.loc.startsWith("src/parts/");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (next: FxStep[], label: string) => {
    setBusy(true);
    setError("");
    try {
      await onEdit({ kind: "attr", name: "data-fx", value: formatFx(next) || null }, label);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const setSlot = (slot: FxSlot, effect: string | null) => {
    const rest = steps.filter((step) => step.slot !== slot);
    if (!effect) return save(rest, `Removed the ${slot === "in" ? "entrance" : slot === "out" ? "exit" : "loop"} on ${el.tag}`);
    const old = steps.find((step) => step.slot === slot);
    // Keeps the old one's timing; a new one takes the effect's defaults (an entrance at the scene's start).
    const next: FxStep = { ...(old ?? {}), slot, effect };
    const order: FxSlot[] = ["in", "loop", "out"];
    return save([...rest, next].sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot)), `${labelOf(slot, effect)} ${slot === "in" ? "in" : slot === "out" ? "out" : "loop"} on ${el.tag}${el.text ? ` "${el.text.slice(0, 16)}"` : ""}`);
  };
  const change = (slot: FxSlot, patch: Partial<FxStep>, label: string) => save(steps.map((step) => (step.slot === slot ? { ...step, ...patch } : step)), label);

  if (parts) return <p className="panel-empty">The parts bin draws this element, and every ad shares it. Pick the element around it to give it effects.</p>;
  if (!source) return <p className="panel-empty">Reading its code…</p>;
  if (!editable) return <p className="panel-empty">Its code works out its effects (<code>data-fx</code> isn't plain text there). Ask the agent to change them.</p>;

  return (
    <div className={`fx${busy ? " busy" : ""}`}>
      {error && <p className="ins-error">{error}</p>}
      {SLOTS.map(({ slot, title }) => {
        const step = steps.find((item) => item.slot === slot);
        const info = step ? EFFECTS[slot].find((item) => item.id === step.effect) : undefined;
        return (
          <section key={slot} className="fx-sec">
            <h4>
              {title}
              {step && <span className="ins-sub">{info?.label ?? step.effect}</span>}
            </h4>
            <div className="fx-grid">
              <FxTile slot={slot} info={null} on={!step} onPick={() => void setSlot(slot, null)} />
              {EFFECTS[slot].map((item) => (
                <FxTile key={item.id} slot={slot} info={item} on={step?.effect === item.id} onPick={() => void setSlot(slot, item.id)} />
              ))}
            </div>
            {step && (
              <div className="fx-opts">
                <label>
                  <span>Starts</span>
                  <FrameInput value={step.at} placeholder={slot === "out" ? "at the end" : "0"} onSave={(at) => change(slot, { at }, `${title} starts at ${at ?? "default"}`)} />
                  <button className="ghost small" title="Start it on the frame the playhead is on" onClick={() => void change(slot, { at: localFrame }, `${title} starts at ${localFrame}`)}>
                    Here
                  </button>
                </label>
                <label>
                  <span>{slot === "loop" ? "One cycle" : "Takes"}</span>
                  <FrameInput value={step.frames} placeholder={String(info?.frames ?? 15)} onSave={(frames) => change(slot, { frames: frames ?? undefined }, `${title} takes ${frames} frames`)} min={1} />
                  <span className="fx-sec-s">{(((step.frames ?? info?.frames ?? 15) as number) / fps).toFixed(2)} s</span>
                </label>
                <label>
                  <span>Strength</span>
                  <select value={String(step.amount ?? 1)} onChange={(event) => void change(slot, { amount: Number(event.target.value) }, `${title} strength ${event.target.value}`)}>
                    {[0.25, 0.5, 0.75, 1, 1.5, 2, 3].map((n) => (
                      <option key={n} value={n}>
                        {n === 1 ? "Normal" : `× ${n}`}
                      </option>
                    ))}
                  </select>
                </label>
                {slot !== "loop" && (
                  <label>
                    <span>Easing</span>
                    <select value={step.ease ?? ""} onChange={(event) => void change(slot, { ease: (event.target.value || undefined) as FxEase | undefined }, `${title} easing ${event.target.value || "default"}`)}>
                      <option value="">The effect's own</option>
                      {FX_EASES.map((ease) => (
                        <option key={ease} value={ease}>
                          {ease}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </section>
        );
      })}
      {value && (
        <p className="ins-note fx-code">
          In the code: <code>data-fx="{value}"</code>
        </p>
      )}
    </div>
  );
}

/** A frame number that saves on Enter or blur; empty means the effect's default. */
function FrameInput({ value, placeholder, onSave, min = 0 }: { value?: number; placeholder?: string; onSave: (value: number | undefined) => Promise<unknown>; min?: number }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setText(value === undefined ? "" : String(value)), [value]);
  const commit = () => {
    const next = text === "" ? undefined : Math.max(min, Math.round(Number(text)));
    if (next === value || (next !== undefined && !Number.isFinite(next))) return setText(value === undefined ? "" : String(value));
    void onSave(next);
  };
  return (
    <input
      ref={ref}
      className="ins-input fx-frame"
      inputMode="numeric"
      value={text}
      placeholder={placeholder}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") ref.current?.blur();
        if (event.key === "Escape") setText(value === undefined ? "" : String(value));
      }}
    />
  );
}

type SceneProps = {
  scene: { id: string; name: string; frames: number };
  prev?: { id: string; name: string };
  transition?: StoryTransition;
  fps: number;
  onTransition: (id: string, value: StoryTransition | null, label: string) => void;
  editable: boolean;
};

function SceneTransition({ scene, prev, transition, fps, onTransition, editable }: SceneProps) {
  const current = transition?.type ?? "cut";
  const frames = transition?.frames ?? 15;
  if (!editable) return <p className="panel-empty">This ad is one scene, so there's nothing to go between. Scenes made in code, or images and clips you add, get transitions.</p>;
  if (!prev) return <p className="panel-empty">"{scene.name}" opens the video, so nothing comes before it. Pick a later scene on the timeline for the transition into it.</p>;
  return (
    <div className="fx">
      <section className="fx-sec">
        <h4>
          Into "{scene.name}"<span className="ins-sub">from "{prev.name}"</span>
        </h4>
        <div className="fx-grid tr-grid">
          {TRANSITIONS.map((item) => (
            <TransitionTile key={item.id} id={item.id} label={item.label} description={item.description} on={current === item.id} onPick={() => onTransition(scene.id, item.id === "cut" ? null : { type: item.id, frames }, item.id === "cut" ? `Cut into "${scene.name}"` : `${item.label} into "${scene.name}"`)} />
          ))}
        </div>
        {current !== "cut" && (
          <div className="fx-opts">
            <label>
              <span>Takes</span>
              <FrameInput value={frames} min={1} onSave={async (n) => onTransition(scene.id, { type: current, frames: Math.min(n ?? 15, scene.frames) }, `Transition into "${scene.name}" takes ${n} frames`)} />
              <span className="fx-sec-s">{(frames / fps).toFixed(2)} s</span>
            </label>
            <div className="seg small">
              {[8, 15, 24, 36].map((n) => (
                <button key={n} aria-pressed={frames === n} onClick={() => onTransition(scene.id, { type: current, frames: Math.min(n, scene.frames) }, `Transition into "${scene.name}" takes ${n} frames`)}>
                  {(n / fps).toFixed(n % fps ? 2 : 0)} s
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="ins-note">The video's length doesn't change: "{prev.name}" holds its last frame while "{scene.name}" comes in over it.</p>
      </section>
    </div>
  );
}

export function EffectsPanel(props: { el: Picked | null; elementProps?: Omit<ElementProps, "el">; scene?: SceneProps; hint: string }) {
  if (props.el && props.elementProps) return <ElementEffects el={props.el} {...props.elementProps} />;
  if (props.scene) return <SceneTransition {...props.scene} />;
  return <p className="panel-empty">{props.hint}</p>;
}
