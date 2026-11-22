/**
 * The inspector (spec.md §10.13): what's selected, and how each value can change.
 *   In the code · a literal in the ad's code (text, a size, a colour), written back by /api/source/edit. A value the
 *                 code doesn't set yet can be added: a move, a scale, a colour. The text is edited where it's written,
 *                 even when that's a constant or a list somewhere else in the ad.
 *   Knob        · a named value in tune.json (useTune), written by /api/tune, for anything the code computes.
 *   Ask         · everything else goes to the agent as a note on that element.
 * Numbers can be dragged by their label, and the viewer shows the value live before it's saved. Every save goes in
 * the project's history (History tab), so it can be undone.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Picked } from "./Viewer";
import type { Placement } from "./Viewer";
import { post, ratioLabel, type Ratio, type TakeInfo } from "./api";
import type { StoryImage } from "../engine/ad";

/** /api/source/element */
export type Field = { name: string; code: string; editable: boolean; kind: "number" | "string" | "other"; value?: number | string };
export type TextSource = { loc: string; file: string; line: number; value: string; hash: string; match: "exact" | "contains" };
export type SourceElement = {
  file: string;
  loc: string;
  hash: string;
  tag: string;
  component?: string;
  text?: { value: string; editable: boolean; code: string };
  /** Where the element's text is written, when it isn't inside the element itself. */
  texts?: TextSource[];
  /** style={{…}}, no style yet, or something the desk can't add to (style={s}). */
  styleMode?: "object" | "none" | "other";
  style: Field[];
  props: Field[];
  attrs?: { name: string; value: string; editable: boolean }[];
  /** A wrapper around one component (a ready-made element): the component and the values it takes. */
  params?: { component: string; props: Field[] };
  /** A child in JSX, so the desk can take it out. */
  removable?: boolean;
};
export type SourceChange =
  | { kind: "text"; value: string }
  | { kind: "literal"; value: string }
  | { kind: "style"; name: string; value: number | string | null }
  | { kind: "prop"; name: string; value: number | string }
  | { kind: "attr"; name: string; value: string | null }
  | { kind: "param"; name: string; value: number | string };
/** Saves one change. `at` is another literal than the element's own: where its text is written. */
export type EditSource = (change: SourceChange, label: string, at?: { loc: string; hash: string }) => Promise<void>;

export type Tune = Partial<Record<"all" | Ratio, Record<string, unknown>>>;

/** Loads what the code says about the picked element, again after each save or undo. */
export function useElementSource(el: Picked | null | undefined, sourceKey: number, slug?: string) {
  const [source, setSource] = useState<SourceElement | null>(null);
  const [failed, setFailed] = useState("");
  const current = useRef(el?.loc);
  current.current = el?.loc;
  const texts = el ? [el.text, ...el.path.map((item) => item.text)].filter((text, i, all) => text && all.indexOf(text) === i).slice(0, 4) : [];
  const load = useCallback(() => {
    const loc = el?.loc;
    if (!loc) return setSource(null);
    // The slug lets an element the parts bin draws (a caption) find its text in the ad's own folder.
    const query = new URLSearchParams({ loc, ...(slug ? { slug } : {}) });
    for (const text of texts) query.append("text", text);
    fetch(`/api/source/element?${query}`)
      .then(async (res) => {
        const reply = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(reply.error ?? "The desk couldn't read this element's code.");
        if (current.current !== loc) return; // another element was picked while this was loading
        setSource(reply);
        setFailed("");
      })
      .catch((error) => {
        if (current.current !== loc) return;
        setSource(null);
        setFailed(error.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el?.loc, sourceKey, slug, texts.join("\u0000")]);
  useEffect(load, [load]);
  return { source, failed, setFailed, load };
}

/** A literal translate ("12px -30px"), scale and rotate, or 0 0 1 0. */
export function placementIn(source: SourceElement | null) {
  const field = (name: string) => source?.style.find((item) => item.name === name);
  const t = field("translate");
  const [x, y] = typeof t?.value === "string" ? t.value.split(/\s+/).map((part) => parseFloat(part) || 0) : [0, 0];
  const s = field("scale");
  const r = field("rotate");
  return { x: x ?? 0, y: y ?? 0, scale: s?.value === undefined ? 1 : Number(parseFloat(String(s.value))) || 1, rotate: r?.value === undefined ? 0 : parseFloat(String(r.value)) || 0, fields: { translate: t, scale: s, rotate: r } };
}

/** The knob that moves this element, when its code has one (nudge() in useTune). */
export const nudgeKnob = (el: Picked) => el.knobs.find((id) => el.knobInfo?.[id]?.kind === "nudge");

/** Where a drag starts, or why the element can't be dragged. */
export function placementOf(el: Picked, source: SourceElement | null, tune: Tune, ratio: Ratio): Placement | string {
  const knob = nudgeKnob(el);
  if (knob) {
    const value = (tune[ratio]?.[knob] ?? tune.all?.[knob] ?? {}) as { dx?: number; dy?: number; scale?: number };
    return { x: value.dx ?? 0, y: value.dy ?? 0, scale: value.scale ?? 1 };
  }
  if (el.loc.startsWith("src/parts/")) return "The parts bin draws this one, and every ad shares it. Pick the element around it to move it.";
  if (!source) return "Loading its code…";
  const { x, y, scale, fields } = placementIn(source);
  const fixed = (field?: Field) => field && !field.editable;
  if (fixed(fields.translate) || fixed(fields.scale)) return "Its code works out where it goes. Ask the agent to move it.";
  if (source.styleMode === "other" || !source.styleMode) return "Its style comes from elsewhere in the code. Pick the element around it, or ask the agent.";
  return { x, y, scale };
}

type SceneProps = {
  id: string;
  name: string;
  kind: "scene" | "image" | "clip";
  frames: number;
  fps: number;
  onStory: boolean;
  trimIn?: number;
  full?: number;
  image?: StoryImage;
};

type Props = {
  take?: TakeInfo;
  slug?: string;
  ratio: Ratio;
  el?: Picked | null;
  source: SourceElement | null;
  failed: string;
  onEdit: EditSource;
  /** Show style values live on the selected element, or end that (put back unless saved). */
  onPreview: (style: Record<string, string> | null, restore?: boolean) => void;
  /** Bumped by a double click on the element in the viewer: the text field takes focus. */
  textFocus?: number;
  /** A short line about the element's effects, and opening the Effects tab. */
  effects?: string;
  onEffects?: () => void;
  scene?: SceneProps;
  onAsk: (about: string) => void;
  onSelectLoc: (loc: string) => void;
  onTrim: (id: string, trim: { in: number; out: number }) => void;
  onImage: (id: string, change: Partial<StoryImage>) => void;
  onToggleStory: (id: string) => void;
  onRemoveImage: (id: string) => void;
  onEdited: () => void;
  /** Only one thing is in the video, so it can't be taken out. */
  onlyOne?: boolean;
  /** Takes the selected element out of the code (Delete). Only for an element that's a child in JSX. */
  onRemove?: () => void;
  /** The ad's knobs, and saving one. */
  tune: Tune;
  onKnob: (id: string, scope: "all" | Ratio, value: unknown, label: string) => Promise<void>;
};

const short = (loc: string) => loc.replace(/^src\/(ads|parts)\//, "").replace(/:(\d+):\d+$/, ":$1");
const clip = (text: string, n = 28) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const UNITLESS = new Set(["opacity", "scale", "fontWeight", "lineHeight", "zIndex", "flex", "order"]);
const cssValue = (name: string, value: number | string) => (typeof value === "number" && !UNITLESS.has(name) ? `${value}px` : String(value));

function Section({ title, sub, children, open = true, right }: { title: string; sub?: ReactNode; children: ReactNode; open?: boolean; right?: ReactNode }) {
  const [shown, setShown] = useState(open);
  return (
    <section className={`ins-sec${shown ? "" : " shut"}`}>
      <h4>
        <button className="ins-fold" onClick={() => setShown((on) => !on)} aria-expanded={shown}>
          <span className="caret">{shown ? "▾" : "▸"}</span>
          {title}
        </button>
        {sub && <span className="ins-sub">{sub}</span>}
        {right && <span className="ins-right">{right}</span>}
      </h4>
      {shown && children}
    </section>
  );
}

function Row({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: string }) {
  return (
    <div className="ins-row" title={hint}>
      <span className="ins-label">{label}</span>
      <div className="ins-value">{children}</div>
    </div>
  );
}

/** A field that saves on Enter or when it loses focus, and goes back on Escape. */
function Edit({ value, kind, onSave, wide, dir, placeholder, focus }: { value: string | number; kind: "number" | "string"; onSave: (value: string | number) => Promise<unknown>; wide?: boolean; dir?: "auto"; placeholder?: string; focus?: number }) {
  const [text, setText] = useState(String(value));
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  useEffect(() => setText(String(value)), [value]);
  useEffect(() => {
    if (focus) ref.current?.focus(), ref.current?.select();
  }, [focus]);
  const commit = async () => {
    if (text === String(value)) return;
    const next = kind === "number" ? Number(text) : text;
    if (kind === "number" && !Number.isFinite(next)) return setText(String(value));
    setBusy(true);
    try {
      await onSave(next);
    } catch {
      setText(String(value));
    } finally {
      setBusy(false);
    }
  };
  const props = {
    ref,
    className: `ins-input${wide ? " wide" : ""}${busy ? " busy" : ""}`,
    value: text,
    dir,
    placeholder,
    onChange: (event: { target: { value: string } }) => setText(event.target.value),
    onBlur: commit,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !(wide && event.shiftKey)) {
        event.preventDefault();
        (event.target as HTMLElement).blur();
      }
      if (event.key === "Escape") setText(String(value));
      event.stopPropagation();
    },
  };
  if (wide) return <textarea rows={Math.min(6, Math.max(2, Math.ceil(text.length / 30)))} {...props} />;
  return <input {...props} inputMode={kind === "number" ? "decimal" : undefined} />;
}

/**
 * A number with a label you can drag sideways (Shift: ×10, Alt: ×0.1), arrow keys that step it, and a live preview
 * while it changes. It saves once, when you let go or press Enter. Empty saves null: the code's value is taken out.
 */
function NumberField({ label, value, placeholder, step = 1, min, max, unit, onPreview, onCommit, clearable, hint }: {
  label: string;
  value?: number;
  placeholder?: string;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  onPreview: (value: number | null) => void;
  onCommit: (value: number | null) => Promise<unknown>;
  clearable?: boolean;
  hint?: string;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(value === undefined ? "" : String(value)), [value]);
  const clamp = (n: number) => round(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n)), step < 1 ? 3 : 1);
  const base = () => (text === "" ? (parseFloat(placeholder ?? "") || 0) : Number(text));
  const save = async (next: number | null) => {
    if (next === (value ?? null)) return onPreview(null);
    setBusy(true);
    try {
      await onCommit(next);
    } catch {
      setText(value === undefined ? "" : String(value));
      onPreview(null);
    } finally {
      setBusy(false);
    }
  };
  const scrub = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const x0 = event.clientX;
    const from = base();
    let last: number | null = null;
    const onMove = (e: PointerEvent) => {
      const by = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * step;
      last = clamp(from + Math.round((e.clientX - x0) / 3) * by);
      setText(String(last));
      onPreview(last);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      if (last !== null) void save(last);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };
  return (
    <div className="nf" title={hint}>
      <span className="nf-label" onPointerDown={scrub} title="Drag sideways to change it">
        {label}
      </span>
      <input
        className={`ins-input nf-input${busy ? " busy" : ""}`}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(event) => {
          setText(event.target.value);
          const n = Number(event.target.value);
          if (event.target.value !== "" && Number.isFinite(n)) onPreview(n);
        }}
        onBlur={() => {
          if (text === "") return clearable && value !== undefined ? void save(null) : setText(value === undefined ? "" : String(value));
          const n = Number(text);
          if (!Number.isFinite(n)) return setText(value === undefined ? "" : String(value)), onPreview(null);
          void save(clamp(n));
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const next = clamp(base() + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : event.altKey ? 0.1 : 1) * step);
            setText(String(next));
            onPreview(next);
          } else if (event.key === "Enter") (event.target as HTMLElement).blur();
          else if (event.key === "Escape") {
            setText(value === undefined ? "" : String(value));
            onPreview(null);
          }
        }}
      />
      {unit && <span className="nf-unit">{unit}</span>}
    </div>
  );
}

const toHex = (color: string) => {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${color.slice(1).replace(/./g, (c) => c + c)}`;
  return "#000000";
};

/** A swatch that opens the colour picker (live while it's open), and the value as text. */
function ColorField({ value, placeholder, onPreview, onCommit }: { value?: string; placeholder?: string; onPreview: (value: string | null) => void; onCommit: (value: string | null) => Promise<unknown> }) {
  const picker = useRef<HTMLInputElement>(null);
  const shown = value ?? placeholder ?? "";
  useEffect(() => {
    const input = picker.current;
    if (!input) return;
    // React's onChange is the input event; the picker's own change event is when it closes.
    const onChange = () => void onCommit(input.value).catch(() => onPreview(null));
    input.addEventListener("change", onChange);
    return () => input.removeEventListener("change", onChange);
  });
  return (
    <div className="cf">
      <label className="sw big" style={{ background: shown }}>
        <input ref={picker} type="color" value={toHex(shown)} onChange={(event) => onPreview(event.target.value)} />
      </label>
      <Edit kind="string" value={value ?? ""} placeholder={placeholder} onSave={(next) => onCommit(String(next) || null)} />
    </div>
  );
}

export function Inspector(props: Props) {
  const { take, slug, ratio, el, source, failed, onEdit, onPreview, scene, onAsk, onSelectLoc, onTrim, onImage, onToggleStory, onRemoveImage, onlyOne, tune, onKnob } = props;
  const [scope, setScope] = useState<"all" | Ratio>("all");
  const [textAt, setTextAt] = useState(0);
  useEffect(() => setTextAt(0), [el?.loc]);
  void slug;

  /* ── An element on the stage ── */
  if (el) {
    const parts = el.loc.startsWith("src/parts/");
    const fields = source?.style ?? [];
    const fieldOf = (name: string) => fields.find((field) => field.name === name);
    const canAdd = !parts && (source?.styleMode === "object" || source?.styleMode === "none");
    const covered = new Set<string>();

    /** One style property: edited where the code writes it, added when it doesn't, shown when the code works it out. */
    const styleControl = (name: string, label: string, type: "number" | "color" | "select", opts: { unit?: string; step?: number; min?: number; max?: number; options?: string[]; computed?: string } = {}) => {
      covered.add(name);
      const field = fieldOf(name);
      const computed = opts.computed ?? el.computed?.[name] ?? "";
      if (field && !field.editable)
        return (
          <Row label={label} hint={field.code}>
            <button className="ins-fx" onClick={() => onAsk(`the ${name} of the ${el.tag} at ${short(el.loc)} (now \`${field.code}\`)`)} title={`The code works it out: ${field.code}. Click to ask the agent.`}>
              ƒ <code>{clip(field.code, 26)}</code>
            </button>
          </Row>
        );
      if (!field && !canAdd)
        return (
          <Row label={label}>
            <span className="ins-read">{computed || "—"}</span>
          </Row>
        );
      const save = (value: number | string | null, shown: string) => onEdit({ kind: "style", name, value }, value === null ? `${label}: back to the code's` : `${label} ${shown}`);
      if (type === "color")
        return (
          <Row label={label}>
            <ColorField
              value={field?.value === undefined ? undefined : String(field.value)}
              placeholder={computed}
              onPreview={(value) => onPreview(value === null ? null : { [name]: value })}
              onCommit={(value) => save(value, value ?? "")}
            />
          </Row>
        );
      if (type === "select")
        return (
          <Row label={label}>
            <select
              className="ins-select"
              value={field?.value === undefined ? "" : String(field.value)}
              onChange={(event) => {
                const value = event.target.value;
                void save(value === "" ? null : /^\d+$/.test(value) ? Number(value) : value, value);
              }}
            >
              <option value="">{computed ? `${computed} (now)` : "—"}</option>
              {opts.options!.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Row>
        );
      // A number, or a string with a unit the field keeps ("24px", "0.02em"). Anything else is edited as text.
      const raw = field?.value;
      const unitIn = typeof raw === "string" ? raw.match(/^(-?[\d.]+)([a-z%]*)$/i) : null;
      if (typeof raw === "string" && !unitIn)
        return (
          <Row label={label}>
            <Edit kind="string" value={raw} onSave={(value) => save(String(value), String(value))} />
          </Row>
        );
      const unit = unitIn ? unitIn[2] : undefined;
      const value = typeof raw === "number" ? raw : unitIn ? Number(unitIn[1]) : undefined;
      const write = (n: number) => (unit ? `${n}${unit}` : n);
      return (
        <NumberField
          label={label}
          value={value}
          placeholder={computed ? String(parseFloat(computed) || computed) : undefined}
          unit={unit ?? opts.unit}
          step={opts.step}
          min={opts.min}
          max={opts.max}
          clearable
          onPreview={(n) => onPreview(n === null ? null : { [name]: cssValue(name, write(n)) })}
          onCommit={(n) => save(n === null ? null : write(n), n === null ? "" : `${value ?? computed} → ${n}${unit ?? ""}`)}
        />
      );
    };

    // Text: in the element itself, or where the code writes it (a constant, a list, a prop from the parent).
    const direct = source?.text?.editable && !parts ? source.text : undefined;
    const texts = (source?.texts ?? []).filter(Boolean);
    const elsewhere = !direct ? texts[Math.min(textAt, texts.length - 1)] : undefined;

    // Layout: the element's own translate/scale/rotate, or its nudge knob.
    const knob = nudgeKnob(el);
    const nudge = knob ? ((tune[ratio]?.[knob] ?? tune.all?.[knob] ?? {}) as { dx?: number; dy?: number; scale?: number }) : undefined;
    const place = placementIn(source);
    ["translate", "scale", "rotate"].forEach((name) => covered.add(name));
    const layoutBlocked = !knob && (parts || !source || (!canAdd && !place.fields.translate) || (place.fields.translate && !place.fields.translate.editable));
    const saveTranslate = (x: number, y: number) => onEdit({ kind: "style", name: "translate", value: x || y ? `${x}px ${y}px` : null }, `Move to ${x}, ${y}`);

    const hasText = Boolean(el.text) && !el.svg;
    const other = () => fields.filter((field) => field.editable && !covered.has(field.name));
    const computedFields = () => fields.filter((field) => !field.editable && !covered.has(field.name));
    const holder = el.knobs.length ? undefined : el.path.find((item) => item.knobs?.length);
    const knobs = (el.knobs.length ? el.knobs : (holder?.knobs ?? [])).filter((id) => id !== knob);
    const knobValue = (id: string): unknown => tune[ratio]?.[id] ?? tune.all?.[id];

    return (
      <div className="inspector">
        <header className="ins-head">
          <div className="ins-title">
            <span className="ins-tag">{el.tag}</span>
            <span className="ins-text" dir="auto">
              {el.text ? clip(el.text, 40) : source?.component || "element"}
            </span>
          </div>
          <div className="ins-src">
            {source?.component && <span>{source.component} · </span>}
            <code>{short(el.loc)}</code>
            <span>
              {" "}
              · {ratioLabel(ratio)} · {Math.round(el.box.width)}×{Math.round(el.box.height)}
            </span>
          </div>
          {el.path.length > 0 && (
            <div className="ins-path">
              {el.path
                .slice(0, 4)
                .reverse()
                .map((item) => (
                  <button key={item.loc} onClick={() => onSelectLoc(item.loc)} title={short(item.loc)}>
                    {item.tag}
                  </button>
                ))}
              <span>{el.tag}</span>
            </div>
          )}
        </header>
        {failed && <p className="ins-error">{failed}</p>}
        {source?.params && !parts && (
          <Section title="Parameters" sub={<code>{source.params.component}</code>}>
            {source.params.props.length === 0 && <p className="ins-note">It takes no values here.</p>}
            {source.params.props.map((field) => (
              <Row key={field.name} label={field.name}>
                {field.editable ? (
                  <Edit dir="auto" wide={field.kind === "string"} kind={field.kind === "number" ? "number" : "string"} value={field.value ?? ""} focus={field.name === "text" ? props.textFocus : undefined} onSave={(value) => onEdit({ kind: "param", name: field.name, value }, `${source.params!.component} ${field.name} → ${clip(String(value), 30)}`)} />
                ) : (
                  <code className="ins-code">{clip(field.code, 40)}</code>
                )}
              </Row>
            ))}
          </Section>
        )}
        {parts && <p className="ins-note">The parts bin draws this element, and every ad shares it, so it isn't edited here. Pick the element around it, or ask the agent.</p>}

        {(el.text || source?.text) && (
          <Section title="Text" sub={elsewhere ? <>written in <code>{short(elsewhere.loc)}</code></> : direct ? undefined : "from the code"}>
            {direct ? (
              <Edit wide dir="auto" kind="string" value={direct.value} focus={props.textFocus} onSave={(value) => onEdit({ kind: "text", value: String(value) }, `Text → "${clip(String(value), 40)}"`)} />
            ) : elsewhere && !elsewhere.loc.startsWith("src/parts/") ? (
              <>
                <Edit
                  wide
                  dir="auto"
                  kind="string"
                  value={elsewhere.value}
                  focus={props.textFocus}
                  onSave={(value) => onEdit({ kind: "literal", value: String(value) }, `Text → "${clip(String(value), 40)}"`, { loc: elsewhere.loc, hash: elsewhere.hash })}
                />
                {elsewhere.match === "contains" && <p className="ins-note">This text is part of a longer line in the code. Editing it changes the whole line, wherever it shows.</p>}
                {texts.length > 1 && (
                  <label className="ins-alt">
                    Not this one?
                    <select value={Math.min(textAt, texts.length - 1)} onChange={(event) => setTextAt(Number(event.target.value))}>
                      {texts.map((item, i) => (
                        <option key={item.loc} value={i}>
                          {clip(item.value, 30)} · {short(item.loc)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <>
                <code className="ins-code" dir="auto">
                  {source?.text?.code || el.text}
                </code>
                <p className="ins-note">The code puts this text together, so the desk can't find one place to change it. Ask the agent.</p>
              </>
            )}
          </Section>
        )}

        <Section title="Layout" sub={knob ? <>with the knob <code>{knob}</code></> : undefined}>
          {knob ? (
            <>
              <div className="nf-grid">
                <NumberField label="X" value={nudge?.dx ?? 0} onPreview={(n) => onPreview(n === null ? null : { translate: `${n}px ${nudge?.dy ?? 0}px` })} onCommit={(n) => onKnob(knob, "all", { ...nudge, dx: n ?? 0 }, `Move ${knob}`)} />
                <NumberField label="Y" value={nudge?.dy ?? 0} onPreview={(n) => onPreview(n === null ? null : { translate: `${nudge?.dx ?? 0}px ${n}px` })} onCommit={(n) => onKnob(knob, "all", { ...nudge, dy: n ?? 0 }, `Move ${knob}`)} />
                <NumberField label="Scale" value={round((nudge?.scale ?? 1) * 100, 1)} unit="%" min={1} onPreview={(n) => onPreview(n === null ? null : { scale: String(n / 100) })} onCommit={(n) => onKnob(knob, "all", { ...nudge, scale: (n ?? 100) / 100 }, `Scale ${knob}`)} />
              </div>
              {Boolean(nudge?.dx || nudge?.dy || (nudge?.scale ?? 1) !== 1) && (
                <button className="ghost small" onClick={() => void onKnob(knob, "all", null, `Reset ${knob}`)}>
                  Reset
                </button>
              )}
            </>
          ) : layoutBlocked ? (
            <p className="ins-note">{typeof placementOf(el, source, tune, ratio) === "string" ? (placementOf(el, source, tune, ratio) as string) : "This element can't be moved from here."}</p>
          ) : (
            <>
              <div className="nf-grid">
                <NumberField label="X" value={place.x} unit="px" onPreview={(n) => onPreview(n === null ? null : { translate: `${n}px ${place.y}px` })} onCommit={(n) => saveTranslate(n ?? 0, place.y)} />
                <NumberField label="Y" value={place.y} unit="px" onPreview={(n) => onPreview(n === null ? null : { translate: `${place.x}px ${n}px` })} onCommit={(n) => saveTranslate(place.x, n ?? 0)} />
                <NumberField
                  label="Scale"
                  value={round(place.scale * 100, 1)}
                  unit="%"
                  min={1}
                  onPreview={(n) => onPreview(n === null ? null : { scale: String(n / 100) })}
                  onCommit={(n) => onEdit({ kind: "style", name: "scale", value: n === null || n === 100 ? null : round(n / 100, 3) }, `Scale ${Math.round(place.scale * 100)}% → ${n ?? 100}%`)}
                />
                <NumberField
                  label="Rotate"
                  value={place.rotate}
                  unit="°"
                  onPreview={(n) => onPreview(n === null ? null : { rotate: `${n}deg` })}
                  onCommit={(n) => onEdit({ kind: "style", name: "rotate", value: n ? `${n}deg` : null }, `Rotate ${place.rotate}° → ${n ?? 0}°`)}
                />
              </div>
              {Boolean(place.x || place.y || place.scale !== 1 || place.rotate) && (
                <button
                  className="ghost small"
                  onClick={async () => {
                    for (const name of ["translate", "scale", "rotate"]) if (place.fields[name as "translate"]) await onEdit({ kind: "style", name, value: null }, `Reset ${name}`);
                  }}
                >
                  Reset position
                </button>
              )}
              <p className="ins-hint">Drag it in the viewer to move it, or by a corner to scale it.</p>
            </>
          )}
        </Section>

        {source && hasText && (
          <Section title="Type" sub={`${el.font}`}>
            {styleControl("fontSize", "Size", "number", { unit: "px", min: 1 })}
            {styleControl("fontWeight", "Weight", "select", { options: ["300", "400", "500", "600", "700", "800", "900"] })}
            {styleControl("color", "Colour", "color")}
            {styleControl("letterSpacing", "Spacing", "number", { unit: "px", step: 0.5 })}
            {styleControl("lineHeight", "Line height", "number", { step: 0.05, min: 0, computed: el.computed?.lineHeight?.endsWith("px") && el.size ? String(round(parseFloat(el.computed.lineHeight) / el.size)) : el.computed?.lineHeight })}
            {styleControl("textAlign", "Align", "select", { options: ["start", "center", "end", "left", "right"] })}
          </Section>
        )}

        {source && (
          <Section title="Appearance">
            {el.svg && styleControl("fill", "Fill", "color")}
            {styleControl("opacity", "Opacity", "number", { step: 0.05, min: 0, max: 1 })}
            {!el.svg && styleControl("backgroundColor", "Background", "color")}
            {!el.svg && styleControl("borderRadius", "Corners", "number", { unit: "px", min: 0 })}
          </Section>
        )}

        <Section title="Effects" right={<button className="ghost small" onClick={props.onEffects}>{props.effects ? "Edit" : "Add"}</button>}>
          <p className="ins-note">{props.effects || "No effects on this element. Add an entrance, a loop or an exit."}</p>
        </Section>

        {props.onRemove && !parts && (
          <div className="ins-remove">
            <button className="ghost small boxed danger" onClick={props.onRemove} title="Take it out of the code (Delete). Ctrl+Z brings it back">
              Remove element
            </button>
          </div>
        )}

        {source && (other().length > 0 || computedFields().length > 0 || source.props.length > 0) && (
          <Section title="More from the code" open={false}>
            {other().map((field) => (
              <Row key={field.name} label={field.name}>
                {parts ? (
                  <code className="ins-code">{field.code}</code>
                ) : (
                  <Edit kind={field.kind === "number" ? "number" : "string"} value={field.value ?? ""} onSave={(value) => onEdit({ kind: "style", name: field.name, value }, `${field.name} ${field.value} → ${value}`)} />
                )}
              </Row>
            ))}
            {computedFields().map((field) => (
              <Row key={field.name} label={field.name.startsWith("...") ? "spread" : field.name} hint={field.code}>
                <code className="ins-code">{field.name.startsWith("...") ? field.name : clip(field.code, 40)}</code>
              </Row>
            ))}
            {source.props.map((field) => (
              <Row key={`p:${field.name}`} label={field.name}>
                {field.editable && !parts ? (
                  <Edit kind={field.kind === "number" ? "number" : "string"} value={field.value ?? ""} onSave={(value) => onEdit({ kind: "prop", name: field.name, value }, `${field.name} → ${value}`)} />
                ) : (
                  <code className="ins-code">{clip(field.code, 40)}</code>
                )}
              </Row>
            ))}
          </Section>
        )}

        {knobs.length > 0 && (
          <Section
            title="Knobs"
            sub={holder ? `on the ${holder.tag} around it` : undefined}
            right={
              <span className="seg small">
                <button aria-pressed={scope === "all"} onClick={() => setScope("all")}>
                  All ratios
                </button>
                <button aria-pressed={scope === ratio} onClick={() => setScope(ratio)}>
                  {ratioLabel(ratio)}
                </button>
              </span>
            }
          >
            {knobs.map((id) => {
              const value = knobValue(id);
              const info = el.knobInfo?.[id];
              if ((value && typeof value === "object") || info?.kind === "nudge") {
                const v = (value ?? {}) as Record<string, number>;
                return (
                  <div key={id} className="nf-grid">
                    {(["dx", "dy", "scale"] as const).map((key) => (
                      <NumberField key={key} label={`${id} ${key}`} value={v[key] ?? (key === "scale" ? 1 : 0)} step={key === "scale" ? 0.05 : 1} onPreview={() => {}} onCommit={(n) => onKnob(id, scope, { ...v, [key]: n ?? (key === "scale" ? 1 : 0) }, `${id} ${key} → ${n}`)} />
                    ))}
                  </div>
                );
              }
              const shownValue = value ?? info?.fallback;
              const reset = value !== undefined && (
                <button className="ghost small" title="Back to the code's value" onClick={() => void onKnob(id, scope, null, `${id}: back to the code's`)}>
                  Reset
                </button>
              );
              if (typeof shownValue === "boolean")
                return (
                  <Row key={id} label={id}>
                    <span className="seg small">
                      <button aria-pressed={shownValue} onClick={() => void onKnob(id, scope, true, `${id} on`)}>
                        On
                      </button>
                      <button aria-pressed={!shownValue} onClick={() => void onKnob(id, scope, false, `${id} off`)}>
                        Off
                      </button>
                    </span>
                    {reset}
                  </Row>
                );
              if (typeof shownValue === "number" || (value === undefined && !info))
                return (
                  <div key={id} className="ins-knob">
                    <NumberField label={id} value={typeof value === "number" ? value : undefined} placeholder={info ? String(info.fallback) : undefined} onPreview={() => {}} onCommit={(n) => onKnob(id, scope, n, `${id} → ${n ?? "the code's"}`)} clearable />
                    {reset}
                  </div>
                );
              return (
                <Row key={id} label={id}>
                  <Edit kind="string" value={value === undefined ? "" : String(value)} placeholder={info ? String(info.fallback) : undefined} onSave={(v) => onKnob(id, scope, v === "" ? null : v, `${id} → ${v}`)} />
                  {reset}
                </Row>
              );
            })}
          </Section>
        )}

        <div className="ins-foot">
          <button className="ghost wide" onClick={() => onAsk(`the ${el.tag}${el.text ? ` "${el.text.slice(0, 40)}"` : ""} at ${short(el.loc)}`)}>
            Ask the agent about this element
          </button>
          <p className="ins-note">Every change is saved in the ad's code and listed under History. Ctrl+Z undoes it, Ctrl+Shift+Z puts it back.</p>
        </div>
      </div>
    );
  }

  /* ── A scene, image or clip on the timeline ── */
  if (scene && take) {
    const s = (frames: number) => `${(frames / scene.fps).toFixed(2)} s`;
    const tin = scene.trimIn ?? 0;
    const out = tin + scene.frames;
    return (
      <div className="inspector">
        <header className="ins-head">
          <div className="ins-title">
            <span className="ins-tag">{scene.kind}</span>
            <span className="ins-text" dir="auto">
              {scene.name}
            </span>
          </div>
          <div className="ins-src">
            <code>{scene.id}</code> · {s(scene.frames)} · {scene.onStory ? "in the video" : "not in the video"}
          </div>
        </header>
        <Section title="Timing">
          {scene.kind === "scene" && scene.full !== undefined && (
            <>
              <Row label="Starts at">
                <Edit kind="number" value={tin} onSave={async (v) => onTrim(scene.id, { in: Math.max(0, Math.min(out - 1, Math.round(Number(v)))), out })} />
                <span className="ins-sub">frame</span>
              </Row>
              <Row label="Ends at">
                <Edit kind="number" value={out} onSave={async (v) => onTrim(scene.id, { in: tin, out: Math.max(tin + 1, Math.min(scene.full!, Math.round(Number(v)))) })} />
                <span className="ins-sub">of {scene.full}</span>
              </Row>
              {(tin > 0 || out < scene.full) && (
                <button className="ghost small" onClick={() => onTrim(scene.id, { in: 0, out: scene.full! })}>
                  Show all of it again
                </button>
              )}
            </>
          )}
          {scene.kind === "scene" && scene.full === undefined && <Row label="Length">{s(scene.frames)}</Row>}
          {scene.image && !scene.image.clip && (
            <Row label="Shown for">
              <Edit kind="number" value={scene.image.seconds ?? 2} onSave={async (v) => onImage(scene.id, { seconds: Math.max(0.5, Number(v)) })} />
              <span className="ins-sub">s</span>
            </Row>
          )}
        </Section>
        <Section title="Transition in" right={<button className="ghost small" onClick={props.onEffects}>{props.effects ? "Edit" : "Add"}</button>}>
          <p className="ins-note">{props.effects || "A cut. Add a fade, a slide or a zoom into this scene."}</p>
        </Section>
        {scene.image && (
          <Section title="Picture">
            <div className="seg">
              <button aria-pressed={(scene.image.fit ?? "cover") === "cover"} onClick={() => onImage(scene.id, { fit: "cover" })}>
                Fill
              </button>
              <button aria-pressed={scene.image.fit === "contain"} onClick={() => onImage(scene.id, { fit: "contain" })}>
                Fit
              </button>
            </div>
            {scene.image.clip?.sound && (
              <div className="seg" style={{ marginTop: 8 }}>
                <button aria-pressed={scene.image.clip.volume !== 0} onClick={() => onImage(scene.id, { clip: { ...scene.image!.clip!, volume: undefined } })}>
                  Sound on
                </button>
                <button aria-pressed={scene.image.clip.volume === 0} onClick={() => onImage(scene.id, { clip: { ...scene.image!.clip!, volume: 0 } })}>
                  Sound off
                </button>
              </div>
            )}
          </Section>
        )}
        <div className="ins-foot">
          <button className="ghost wide" disabled={scene.onStory && onlyOne} title={scene.onStory && onlyOne ? "The video needs at least one scene in it" : undefined} onClick={() => onToggleStory(scene.id)}>
            {scene.onStory ? "Take it out of the video" : "Put it in the video"}
          </button>
          {scene.image && (
            <button className="ghost wide danger" onClick={() => onRemoveImage(scene.id)}>
              Remove from the project
            </button>
          )}
          <button className="ghost wide" onClick={() => onAsk(`the ${scene.kind} "${scene.name}" (\`${scene.id}\`)`)}>
            Ask the agent about this {scene.kind}
          </button>
          {scene.kind === "scene" && take.audioTimed && <p className="ins-note">This ad is timed by its voice, so a trim or a new order puts the voice out of time until the agent rebuilds the mix.</p>}
        </div>
      </div>
    );
  }

  /* ── Nothing selected: the video ── */
  return (
    <div className="inspector">
      <header className="ins-head">
        <div className="ins-title">
          <span className="ins-text">{take?.name ?? "No video yet"}</span>
        </div>
        {take && (
          <div className="ins-src">
            {take.kind} · {(take.frames / take.fps).toFixed(1)} s · {take.fps} fps · {take.ratios.map((item) => ratioLabel(item.ratio)).join(" ")} · {take.lang}
          </div>
        )}
      </header>
      <section className="ins-sec">
        <p className="ins-note">
          Turn on <b>Select</b> (V) above the viewer and click anything in the ad. You can change its text, size, colour and place here, drag it in the viewer, and give it effects.
        </p>
        <p className="ins-note">Click a scene on the timeline for its length, trim, transition and place in the video.</p>
      </section>
    </div>
  );
}

/** Saves a knob in tune.json. */
export const saveKnob = (slug: string, take: string | undefined, ratio: "all" | Ratio, id: string, value: unknown, label: string) => post("/api/tune", { slug, take, ratio, id, value, label });
