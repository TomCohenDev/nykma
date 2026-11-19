/**
 * Agent instructions, on the Settings page (spec.md §10.11): ad-agent's prompt, the project rules, the pitch template
 * and the reviewer, as text you edit. The defaults are the repo's files. A brand's edits are its own copies in
 * brands/<brand>/knowledge/, which its ads read instead of the defaults. The editor works as Obsidian's does: Live
 * (formatted as you write), Source (plain, with line numbers) and Reading, inline or expanded to the whole window.
 */
import { useEffect, useState, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import { Markdown } from "./md";
import { MarkdownEditor } from "./MarkdownEditor";
import { post, type State } from "./api";

type File = { path: string; group: string; title: string; about: string; edited?: boolean };
type Loaded = { path: string; base: string; text: string; edited: boolean; where: string };
type Mode = "live" | "source" | "reading";
const MODES: [Mode, string, string][] = [
  ["live", "Live", "Formatted as you write. A line shows its Markdown when the cursor is on it."],
  ["source", "Source", "The Markdown as written, with line numbers"],
  ["reading", "Reading", "The file rendered, not editable"],
];
const MODE_KEY = "nykma.instructions.mode";

/**
 * The editor keeps lines as "\n", and the files on Windows end theirs with "\r\n". Compare and edit with "\n", or every
 * file opens "Not saved", and save with the file's own line endings so a save changes only what was edited.
 */
const lf = (text: string) => text.replace(/\r\n?/g, "\n");
const asLf = (reply: Loaded): Loaded => ({ ...reply, text: lf(reply.text), base: lf(reply.base) });

/** Reading view: the file rendered, not editable. An agent's front matter (name, tools, model) is a small table on top. */
function Reading({ text }: { text: string }) {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const fields = (front?.[1].split(/\r?\n/) ?? []).flatMap((line) => line.match(/^([\w-]+):\s*(.*)$/)?.slice(1, 3) ?? []);
  const pairs = fields.flatMap((_, i) => (i % 2 ? [] : [[fields[i], fields[i + 1]]]));
  return (
    <div className="instruction-preview">
      {pairs.length > 0 && (
        <dl className="front-matter">
          {pairs.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd dir="auto">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Markdown text={front ? text.slice(front[0].length) : text} className="md instruction-md" />
    </div>
  );
}

function readMode(): Mode {
  try {
    const saved = localStorage.getItem(MODE_KEY);
    return saved === "live" || saved === "source" || saved === "reading" ? saved : "live";
  } catch {
    return "live";
  }
}

/**
 * The full window, for a long file. Escape or the cross closes it, and the edit carries on inline. It listens as the
 * key bubbles up, so Escape in a block being edited cancels that block instead.
 */
function Expanded({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="instruction-full" role="dialog" aria-label={title}>
      {children}
      <button className="icon-button instruction-close" onClick={onClose} aria-label="Close">
        <CloseIcon />
      </button>
    </div>
  );
}

export function Instructions({ state, brand: first }: { state: State; brand?: string }) {
  const kits = state.brands.filter((kit) => kit.made);
  const [brand, setBrand] = useState(first ?? "");
  const [files, setFiles] = useState<File[]>();
  const [path, setPath] = useState(".claude/agents/ad-agent.md");
  const [loaded, setLoaded] = useState<Loaded>();
  const [draft, setDraft] = useState("");
  const [eol, setEol] = useState("\n");
  const [showBase, setShowBase] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mode, setModeState] = useState<Mode>(readMode);
  const [expanded, setExpanded] = useState(false);
  const setMode = (next: Mode) => {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {}
  };
  const dirty = Boolean(loaded) && draft !== loaded!.text;
  const q = brand ? `&brand=${encodeURIComponent(brand)}` : "";

  const loadFiles = () =>
    fetch(`/api/instructions?${q.slice(1)}`)
      .then((res) => res.json())
      .then((reply) => setFiles(reply.files))
      .catch(() => setError("The instructions didn't load."));
  useEffect(() => void loadFiles(), [q]);

  useEffect(() => {
    setLoaded(undefined);
    setShowBase(false);
    setError("");
    fetch(`/api/instruction?path=${encodeURIComponent(path)}${q}`)
      .then((res) => res.json())
      .then((reply: Loaded & { error?: string }) => {
        if (reply.error) return setError(reply.error);
        setEol(reply.text.includes("\r\n") ? "\r\n" : "\n");
        setLoaded(asLf(reply));
        setDraft(lf(reply.text));
      })
      .catch(() => setError("That file didn't load."));
  }, [path, q]);

  // Don't lose an edit to a click or a closed tab.
  const leave = () => !dirty || confirm("Throw away your changes to this file?");
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const done = (reply: Loaded) => {
    setLoaded(asLf(reply));
    setDraft(lf(reply.text));
    setShowBase(false);
    void loadFiles();
  };
  const save = () => {
    const text = draft;
    if (!loaded || text === loaded.text || saving || showBase) return;
    setSaving(true);
    setError("");
    post<Loaded>("/api/instruction", { path, text: eol === "\n" ? text : text.replace(/\n/g, eol), brand: brand || undefined })
      .then(done, (failure) => setError(failure.message))
      .finally(() => setSaving(false));
  };
  const reset = () => {
    if (!brand || !confirm(`Delete ${brand}'s version? Its ads will read the default again.`)) return;
    post<Loaded>("/api/instruction/reset", { path, brand }).then(done, (failure) => setError(failure.message));
  };

  const file = files?.find((item) => item.path === path);
  const note = !brand
    ? `The default, for every brand without its own version. Saving changes ${path}.`
    : loaded?.edited
      ? `${brand}'s own version, read instead of the default for ${brand}'s ads.`
      : `This is the default. Saving keeps a copy for ${brand} only, in ${loaded?.where ?? "its kit"}.`;

  const text = loaded ? (showBase ? loaded.base : draft) : "";
  const view = loaded ? (
    <div className={`instruction-view ${mode}`}>
      {mode === "reading" ? (
        <Reading text={text} />
      ) : (
        <MarkdownEditor value={text} live={mode === "live"} readOnly={showBase} onChange={setDraft} onSave={save} />
      )}
    </div>
  ) : (
    !error && <span className="spinner" />
  );
  const toolbar = (inline: boolean) => (
    <div className="row instruction-actions">
      <div className="segmented" role="group" aria-label="View">
        {MODES.map(([id, label, about]) => (
          <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)} title={about}>
            {label}
          </button>
        ))}
      </div>
      {inline && (
        <button className="ghost small" onClick={() => setExpanded(true)} title="Open in the full window">
          Expand
        </button>
      )}
      {brand && loaded?.edited && (
        <>
          <button className="ghost small" onClick={() => setShowBase((on) => !on)}>
            {showBase ? "Back to the edit" : "See the default"}
          </button>
          <button className="ghost small" onClick={reset}>
            Use the default
          </button>
        </>
      )}
      <span className="grow" />
      {dirty && <span className="hint">Not saved</span>}
      <button className="ghost small" disabled={!dirty} onClick={() => loaded && setDraft(loaded.text)}>
        Discard
      </button>
      <button className="primary small" disabled={!dirty || saving || showBase} onClick={save}>
        {saving ? "Saving" : brand && !loaded?.edited ? `Save for ${brand}` : "Save"}
      </button>
    </div>
  );

  return (
    <section id="instructions">
      <h2>
        Agent instructions
        <select
          value={brand}
          aria-label="For which brand"
          onChange={(event) => {
            if (leave()) setBrand(event.target.value);
          }}
        >
          <option value="">Every brand (the defaults)</option>
          {kits.map((kit) => (
            <option key={kit.name} value={kit.name}>
              {kit.name}
              {kit.knowledge ? ` · ${kit.knowledge} edited` : ""}
            </option>
          ))}
        </select>
      </h2>
      <div className="instruction-groups">
        {[...new Set((files ?? []).map((item) => item.group))].map((group) => (
          <div key={group} className="instruction-group">
            <span className="instruction-group-name">{group}</span>
            <div className="segmented instruction-tabs" role="tablist" aria-label={group}>
              {(files ?? [])
                .filter((item) => item.group === group)
                .map((item) => (
                  <button key={item.path} type="button" role="tab" aria-pressed={item.path === path} title={item.about} onClick={() => item.path !== path && leave() && setPath(item.path)}>
                    {item.title}
                    {item.edited && <span className="instruction-edited" title={`${brand} has its own version`} />}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
      <p className="note">
        {file?.about} {note} Edits reach the next run.
      </p>
      {error && <p className="form-error">{error}</p>}
      {expanded ? (
        <>
          <p className="note">Open in the full window.</p>
          <Expanded title={file?.title ?? path} onClose={() => setExpanded(false)}>
            <header className="instruction-full-head">
              <b>{file?.title}</b>
              <span className="hint">{loaded?.where ?? path}</span>
            </header>
            {toolbar(false)}
            {view}
          </Expanded>
        </>
      ) : (
        <>
          {toolbar(true)}
          {view}
        </>
      )}
    </section>
  );
}
