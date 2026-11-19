/** The chat panel: the conversation with ad-agent for a project or a brand kit (spec.md §10.6). */
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { post, upload, usePoll, type Run } from "./api";
import { ClipIcon, CloseIcon, SendIcon, SparkIcon, StopIcon } from "./icons";
import { Markdown } from "./md";

export type Chip = { key: string; label: string; context: string };
export type Quick = { label: string; send?: string; act?: () => Promise<unknown> | void; tone?: "primary" | "danger" };

type Props = {
  /** `folder=…`, `brand=…`, `slug=…` or `run=…` */
  query: string | null;
  title: string;
  subtitle?: string;
  quick?: Quick[];
  chips?: Chip[];
  onRemoveChip?: (key: string) => void;
  /** Said once with the next message, then forgotten: "the story is now …". */
  note?: string;
  onSent?: () => void;
  /** Sends `text` to the agent; `shown` is what the chat shows. */
  ask: (text: string, shown: string) => Promise<unknown>;
  uploadTo?: string;
  placeholder?: string;
  empty?: ReactNode;
  focusKey?: number;
};

/* ── The panel's width: drag its left edge, double-click to reset. Kept for next time. ── */
const WIDTH_KEY = "nykma.chatWidth";
const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 280;
const maxWidth = () => Math.max(MIN_WIDTH, Math.min(900, innerWidth - 560)); // leave room for the board and the left panel

function applyWidth(width: number) {
  const clamped = Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, width)));
  document.documentElement.style.setProperty("--chat-w", `${clamped}px`);
  return clamped;
}

const saved = Number(localStorage.getItem(WIDTH_KEY));
if (saved) applyWidth(saved);

function ResizeHandle() {
  const [active, setActive] = useState(false);
  return (
    <div
      className={`chat-resize${active ? " active" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the chat"
      title="Drag to resize, double-click to reset"
      onDoubleClick={() => {
        localStorage.removeItem(WIDTH_KEY);
        applyWidth(DEFAULT_WIDTH);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const handle = event.currentTarget;
        handle.setPointerCapture(event.pointerId);
        setActive(true);
        document.body.classList.add("resizing");
        // The chat is the last column, so its width is the distance from the pointer to the window's right edge.
        const move = (e: PointerEvent) => applyWidth(innerWidth - e.clientX);
        const end = (e: PointerEvent) => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", end);
          handle.removeEventListener("pointercancel", end);
          localStorage.setItem(WIDTH_KEY, String(applyWidth(innerWidth - e.clientX)));
          document.body.classList.remove("resizing");
          setActive(false);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", end);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        const now = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--chat-w")) || DEFAULT_WIDTH;
        localStorage.setItem(WIDTH_KEY, String(applyWidth(now + (event.key === "ArrowLeft" ? 20 : -20))));
      }}
      tabIndex={0}
    />
  );
}

type Group ={ kind: "say"; text: string } | { kind: "do"; lines: string[] } | { kind: "error"; text: string };

function groups(run: Run): Group[] {
  const out: Group[] = [];
  for (const line of run.log) {
    const last = out.at(-1);
    if (line.kind === "do") {
      if (last?.kind === "do") last.lines.push(line.text);
      else out.push({ kind: "do", lines: [line.text] });
    } else out.push({ kind: line.kind, text: line.text });
  }
  return out;
}

function Steps({ lines, live }: { lines: string[]; live: boolean }) {
  return (
    <details className="steps">
      <summary>
        {live ? <span className="spinner" /> : <span className="steps-tick">✓</span>}
        <span className="steps-count">{lines.length === 1 ? "1 step" : `${lines.length} steps`}</span>
        <span className="steps-last" dir="auto">{lines.at(-1)}</span>
      </summary>
      <ol>
        {lines.map((line, i) => (
          <li key={i} dir="auto">{line}</li>
        ))}
      </ol>
    </details>
  );
}

function Turn({ run }: { run: Run }) {
  const parts = groups(run);
  return (
    <li className="turn">
      {run.kind === "render" ? (
        <div className="turn-system">
          <span className="badge">Render</span> {run.title}
        </div>
      ) : (
        <div className="turn-you" dir="auto">
          {run.title}
        </div>
      )}
      <div className="turn-agent">
        {parts.map((part, i) =>
          part.kind === "do" ? (
            <Steps key={i} lines={part.lines} live={run.running && i === parts.length - 1 && !run.partial} />
          ) : part.kind === "say" ? (
            <Markdown key={i} text={part.text} className="md say" />
          ) : (
            <p key={i} className="turn-error" dir="auto">{part.text}</p>
          ),
        )}
        {run.partial && <Markdown text={`${run.partial}▍`} className="md say streaming" />}
        {run.running && !run.partial && parts.at(-1)?.kind !== "do" && (
          <p className="thinking">
            <span className="spinner" /> {run.kind === "render" ? "Rendering" : "Thinking"}
          </p>
        )}
        {run.error && <p className="turn-error" dir="auto">{run.error}</p>}
        {!run.running && run.kind === "agent" && run.cost !== undefined && (
          <p className="turn-cost">
            ${run.cost.toFixed(2)} · {new Date(run.started).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </li>
  );
}

export function Chat({ query, title, subtitle, quick = [], chips = [], onRemoveChip, note, onSent, ask, uploadTo, placeholder, empty, focusKey }: Props) {
  const [running, setRunning] = useState(false);
  const { data: runs = [], reload } = usePoll<Run[]>(query ? `/api/chat?${query}` : null, running ? 700 : 2500);
  const live = runs.find((run) => run.running);
  useEffect(() => setRunning(Boolean(live)), [live]);

  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pinned = useRef(true);

  useEffect(() => input.current?.focus(), [focusKey]);

  const size = runs.reduce((sum, run) => sum + run.log.length + (run.partial?.length ?? 0), runs.length);
  useLayoutEffect(() => {
    const box = scroller.current;
    if (box && pinned.current) box.scrollTop = box.scrollHeight;
  }, [size]);

  useLayoutEffect(() => {
    const box = input.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, 220)}px`;
  }, [text]);

  const send = async (body: string) => {
    const said = body.trim();
    if (!said || sending) return;
    const context = [...chips.map((chip) => chip.context), note, ...files.map((file) => `File for you: ${file}`)].filter(Boolean);
    const full = context.length ? `${said}\n\nFrom the desk:\n${context.map((line) => `- ${line}`).join("\n")}` : said;
    setSending(true);
    setError("");
    try {
      await ask(full, said);
      setText("");
      setFiles([]);
      onSent?.();
      pinned.current = true;
      reload();
      setTimeout(reload, 350); // the first poll can be mid-flight when the run starts
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSending(false);
    }
  };

  const takeFiles = async (list: FileList | File[]) => {
    if (!uploadTo) return setError("There's nowhere to put files yet. Wait for the agent to make the project's folder.");
    setError("");
    for (const file of [...list]) {
      try {
        const path = await upload(file, uploadTo);
        setFiles((current) => [...current, path]);
      } catch (failure) {
        setError((failure as Error).message);
      }
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) void takeFiles(event.dataTransfer.files);
  };

  const busy = Boolean(live) || sending;
  return (
    <section
      className={`chat${dragging ? " dragging" : ""}`}
      aria-label="Chat with the agent"
      onDragOver={(event) => {
        if (![...event.dataTransfer.types].includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <ResizeHandle />
      <header className="panel-head">
        <span className="chat-mark">
          <SparkIcon />
        </span>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {live && (
          <button className="ghost small" onClick={() => void post("/api/stop", { id: live.id }).then(reload)} title="Stop the agent">
            <StopIcon size={12} /> Stop
          </button>
        )}
      </header>

      <div className="chat-scroll" ref={scroller} onScroll={(event) => {
        const box = event.currentTarget;
        pinned.current = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
      }}>
        {runs.length ? (
          <ol className="turns">
            {runs.map((run) => (
              <Turn key={run.id} run={run} />
            ))}
          </ol>
        ) : (
          <div className="chat-empty">{empty ?? <p>Ask the agent for anything about this project.</p>}</div>
        )}
      </div>

      <footer className="composer">
        {quick.length > 0 && (
          <div className="quick">
            {quick.map((item) => (
              <button
                key={item.label}
                className={`chip-button${item.tone ? ` ${item.tone}` : ""}`}
                disabled={busy}
                onClick={() => {
                  if (item.send) void send(item.send);
                  else if (item.act) Promise.resolve(item.act()).catch((failure) => setError(failure.message)).then(reload);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
        <div className="compose-box">
          {(chips.length > 0 || files.length > 0 || note) && (
            <div className="chips">
              {chips.map((chip) => (
                <span key={chip.key} className="chip">
                  {chip.label}
                  {onRemoveChip && (
                    <button aria-label={`Remove ${chip.label}`} onClick={() => onRemoveChip(chip.key)}>
                      <CloseIcon size={10} />
                    </button>
                  )}
                </span>
              ))}
              {note && <span className="chip note" title={note}>Story changed</span>}
              {files.map((file) => (
                <span key={file} className="chip file">
                  {file.split("/").at(-1)}
                  <button aria-label="Remove file" onClick={() => setFiles((current) => current.filter((item) => item !== file))}>
                    <CloseIcon size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            ref={input}
            dir="auto"
            rows={1}
            value={text}
            placeholder={placeholder ?? "Ask for changes, or say go"}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (!busy) void send(text);
              }
            }}
          />
          <div className="compose-tools">
            <button className="icon-button" title="Attach files" onClick={() => picker.current?.click()}>
              <ClipIcon />
            </button>
            <input ref={picker} type="file" multiple hidden onChange={(event) => event.target.files && void takeFiles(event.target.files)} />
            <span className="compose-hint">{live ? "The agent is working" : "Enter to send"}</span>
            <button className="send" disabled={busy || !text.trim()} onClick={() => void send(text)} title="Send">
              <SendIcon />
            </button>
          </div>
        </div>
        {error && <p className="chat-error">{error}</p>}
      </footer>
      {dragging && <div className="drop-veil">Drop to attach</div>}
    </section>
  );
}
