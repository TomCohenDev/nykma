/**
 * Settings (spec.md §10.8): defaults for new ads, the agent, the voice, generated media, connections and the tools,
 * saved in settings.json as you change them. An ad already built keeps what it was made with, so nothing here
 * re-spends on it. The page is a list of categories on the left and one category at a time on the right, each value
 * a row: what it is and what it does on the left, the control on the right.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { THEMES, applyTheme, savedTheme, type Theme } from "./theme";
import { Shell } from "./Dashboard";
import { Instructions } from "./Instructions";
import { ImageIcon, PlayIcon, SparkIcon, StopIcon } from "./icons";
import { RATIOS, SIZES, post, ratioLabel, type Ratio, type Settings, type State, type Status, type Voice } from "./api";
import "./settings.css";

type Go = (hash: string) => void;
type Check = { ok: boolean; detail: string } | undefined;

/* ── Icons for the categories (16 px line drawings, like icons.tsx) ── */
const svg = (children: ReactNode) => (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
const ICONS = {
  general: svg(<path d="M3 4.5h10M3 8h10M3 11.5h10M5.5 3v3M10.5 6.5v3M7 10v3" />),
  agent: <SparkIcon size={16} />,
  voice: svg(
    <>
      <rect x="6" y="2" width="4" height="7.5" rx="2" />
      <path d="M3.8 8a4.2 4.2 0 008.4 0M8 12.2V14" />
    </>,
  ),
  media: <ImageIcon size={16} />,
  connections: svg(<path d="M6.5 9.5l3-3M7 4.5l1.2-1.2a2.6 2.6 0 013.7 3.7L10.7 8.2M9 11.5l-1.2 1.2a2.6 2.6 0 01-3.7-3.7L5.3 7.8" />),
  system: svg(
    <>
      <rect x="2" y="3" width="12" height="8.5" rx="1.5" />
      <path d="M5.5 14h5M8 11.5V14M4.5 6l1.8 1.5-1.8 1.5M8 9h3" />
    </>,
  ),
};

type Section = keyof typeof ICONS;
const SECTIONS: { id: Section; name: string; lede: string }[] = [
  { id: "general", name: "General", lede: "How a new ad starts, and how the desk looks." },
  { id: "agent", name: "Agent", lede: "Claude Code runs the agents on your Claude plan. Pick its model and effort, and edit the instructions every ad is made with." },
  { id: "voice", name: "Voice", lede: "The ElevenLabs voice for voice-overs. Listing and previewing voices is free; speaking a script spends credits, only within the pitch." },
  { id: "media", name: "Generated media", lede: "Where generated stills and clips are made, and how a recorded voice gets its word times. An ad keeps the choice it was made with." },
  { id: "connections", name: "Connections", lede: "Keys for the services the desk calls. A key goes in and never comes back out, and it never reaches an agent." },
  { id: "system", name: "System", lede: "What the desk found on this machine. Each check only looks: nothing here spends a token or a credit." },
];
const SECTION_KEY = "nykma.settings.section";
const savedSection = (): Section => {
  try {
    const value = localStorage.getItem(SECTION_KEY) as Section | null;
    return value && value in ICONS ? value : "general";
  } catch {
    return "general";
  }
};

/* ── Building blocks ── */

function Group({ title, note, children, right }: { title?: string; note?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="st-group">
      {(title || right) && (
        <header className="st-group-head">
          <div>
            {title && <h3>{title}</h3>}
            {note && <p>{note}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="st-card">{children}</div>
    </section>
  );
}

function Row({ label, hint, children, stack }: { label: ReactNode; hint?: ReactNode; children?: ReactNode; stack?: boolean }) {
  return (
    <div className={`st-row${stack ? " stack" : ""}`}>
      <div className="st-row-text">
        <div className="st-row-label">{label}</div>
        {hint && <div className="st-row-hint">{hint}</div>}
      </div>
      {children !== undefined && <div className="st-row-control">{children}</div>}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`st-toggle${on ? " on" : ""}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="st-seg" role="radiogroup" aria-label={label}>
      {options.map(([id, name]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}>
          {name}
        </button>
      ))}
    </div>
  );
}

function Pill({ check, children, title }: { check: Check | { ok: boolean }; children?: ReactNode; title?: string }) {
  return <span title={title} className={`st-pill ${check ? (check.ok ? "ok" : "bad") : "wait"}`}>{children ?? (check ? (check.ok ? "Ready" : "Not ready") : "Checking")}</span>;
}

type Option<T> = { id: T; name: string; badge?: string; text: string; check?: Check };
function Options<T extends string>({ value, options, onChange, name }: { value: T; options: Option<T>[]; onChange: (value: T) => void; name: string }) {
  return (
    <div className="st-options" role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <button key={option.id} type="button" role="radio" aria-checked={value === option.id} className={`st-option${value === option.id ? " on" : ""}`} onClick={() => onChange(option.id)}>
          <span className="st-option-top">
            <span className="st-radio" />
            <b>{option.name}</b>
            {option.badge && <span className={`st-badge ${option.badge.toLowerCase().replace(/\W+/g, "-")}`}>{option.badge}</span>}
          </span>
          <span className="st-option-text">{option.text}</span>
          {option.check !== undefined && value === option.id && (
            <span className={`st-option-check ${option.check ? (option.check.ok ? "ok" : "bad") : ""}`}>{option.check ? option.check.detail : "Checking"}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** A text field that saves when it loses focus or on Enter. */
function PathField({ value, placeholder, onSave }: { value: string; placeholder?: string; onSave: (value: string) => void }) {
  return (
    <input
      className="st-input mono"
      type="text"
      defaultValue={value}
      placeholder={placeholder}
      spellCheck={false}
      onBlur={(event) => event.target.value.trim() !== value && onSave(event.target.value.trim())}
      onKeyDown={(event) => event.key === "Enter" && (event.target as HTMLInputElement).blur()}
    />
  );
}

/* ── General ── */

const THEME_LOOK: Record<Theme, { bg: string; panel: string; line: string; text: string; dim: string; accent: string; font: string }> = {
  graphite: { bg: "#0d0d0d", panel: "#141414", line: "#2e2e2e", text: "#f4efe6", dim: "#69645c", accent: "#e8301f", font: "JetBrains Mono, monospace" },
  studio: { bg: "#121110", panel: "#1a1816", line: "#2a2622", text: "#f1ebe2", dim: "#635c52", accent: "#e3a34a", font: "IBM Plex Sans, sans-serif" },
};

/** A small picture of the desk in that theme: panels, a timeline and the accent. */
function ThemeCard({ theme, on, onPick }: { theme: (typeof THEMES)[number]; on: boolean; onPick: () => void }) {
  const c = THEME_LOOK[theme.id];
  return (
    <button type="button" role="radio" aria-checked={on} className={`st-theme${on ? " on" : ""}`} onClick={onPick}>
      <span className="st-theme-pic" style={{ background: c.bg, borderColor: c.line }}>
        <i style={{ left: 0, top: 0, bottom: 0, width: "22%", background: c.panel, borderRight: `1px solid ${c.line}` }} />
        <i style={{ right: 0, top: 0, bottom: 0, width: "24%", background: c.panel, borderLeft: `1px solid ${c.line}` }} />
        <i style={{ left: "38%", top: "14%", width: "24%", height: "44%", background: c.text, opacity: 0.9, borderRadius: 2 }} />
        <i style={{ left: "22%", right: "24%", bottom: 0, height: "26%", background: c.panel, borderTop: `1px solid ${c.line}` }} />
        <i style={{ left: "26%", bottom: "9%", width: "16%", height: "9%", background: c.dim, borderRadius: 2 }} />
        <i style={{ left: "44%", bottom: "9%", width: "22%", height: "9%", background: c.dim, borderRadius: 2 }} />
        <i style={{ left: "50%", bottom: 0, width: 1.5, height: "26%", background: c.accent }} />
        <i style={{ right: "3%", top: "6%", width: "17%", height: "8%", background: c.accent, borderRadius: 2 }} />
        <b style={{ left: "3%", top: "8%", color: c.text, fontFamily: c.font }}>Aa</b>
      </span>
      <span className="st-theme-name">
        <span className="st-radio" />
        <b>{theme.name}</b>
      </span>
      <span className="st-theme-note">{theme.note}</span>
    </button>
  );
}

/** One card per layout, drawn in its own shape. */
function RatioCards({ value, onToggle }: { value: Ratio[]; onToggle: (ratio: Ratio) => void }) {
  return (
    <div className="st-ratios" role="group" aria-label="Layouts">
      {RATIOS.map((ratio) => {
        const on = value.includes(ratio);
        const { width, height } = SIZES[ratio];
        const k = 34 / Math.max(width, height);
        return (
          <button key={ratio} type="button" aria-pressed={on} className={`st-ratio${on ? " on" : ""}`} onClick={() => onToggle(ratio)} title={on && value.length === 1 ? "A new ad needs at least one layout" : undefined}>
            <span className="st-ratio-shape" style={{ width: width * k, height: height * k }} />
            <b>{ratioLabel(ratio)}</b>
            <small>{ratio === "16x9" ? "YouTube, web" : ratio === "1x1" ? "Feed posts" : "Reels, Stories, Shorts"}</small>
          </button>
        );
      })}
    </div>
  );
}

/* ── Connections ── */

type KeyRow = { name: "openrouter" | "elevenlabs" | "pexels" | "pixabay"; label: string; for: string; set: boolean; last4?: string };
const KEY_HELP: Record<KeyRow["name"], { text: string; link: string }> = {
  openrouter: { text: "One key for generated video (Veo, Kling, MiniMax, Seedance, Wan) and images (Nano Banana, GPT Image, FLUX, Recraft). Give it a credit limit when you make it: that's the hard stop, whatever happens on this machine.", link: "openrouter.ai/keys" },
  elevenlabs: { text: "Voice, music and sound effects through mv.py. A key already in .env.local keeps working; one saved here comes first.", link: "elevenlabs.io/app/settings/api-keys" },
  pexels: { text: "Free stock photos and clips, searched before any shot is generated (bun run stock). Optional: Pixabay alone is enough, and Pexels has paused new keys. With a key: 200 searches an hour, 20,000 a month.", link: "pexels.com/api" },
  pixabay: { text: "Free stock photos and clips (bun run stock), alone or next to Pexels. Log in and copy the key from the API docs page. Photos come at 1280 px unless the account has full API access.", link: "pixabay.com/api/docs" },
};

/**
 * Keys for paid services, saved in the desk's key store outside the repo. The page knows only whether one is set and
 * its last four characters. Test asks the service, for free.
 */
function Connections({ status, onChange }: { status?: Status; onChange: () => void }) {
  const [rows, setRows] = useState<KeyRow[]>();
  const [where, setWhere] = useState("");
  const [open, setOpen] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [tests, setTests] = useState<Record<string, { ok: boolean; detail: string } | "testing">>({});
  const [error, setError] = useState("");
  const load = (reply: { home: string; services: KeyRow[] }) => {
    setRows(reply.services);
    setWhere(reply.home);
  };
  useEffect(() => {
    fetch("/api/keys")
      .then((res) => res.json())
      .then(load)
      .catch(() => setError("The connections didn't load."));
  }, []);
  const test = (name: string) => {
    setTests((all) => ({ ...all, [name]: "testing" }));
    fetch(`/api/keys/test?service=${name}`)
      .then((res) => res.json())
      .then((reply) => setTests((all) => ({ ...all, [name]: reply })))
      .catch(() => setTests((all) => ({ ...all, [name]: { ok: false, detail: "The test didn't run." } })));
  };
  const save = (name: string) => {
    setError("");
    post("/api/keys", { service: name, key: drafts[name] ?? "" }).then(
      (reply) => {
        load(reply);
        setDrafts((all) => ({ ...all, [name]: "" }));
        setOpen("");
        onChange();
        test(name);
      },
      (failure) => setError(failure.message),
    );
  };
  const remove = (name: string, label: string) => {
    if (!confirm(`Remove the ${label} key from the desk?`)) return;
    post("/api/keys/remove", { service: name }).then(
      (reply) => {
        load(reply);
        setTests((all) => ({ ...all, [name]: undefined as never }));
        onChange();
      },
      (failure) => setError(failure.message),
    );
  };
  return (
    <>
      {error && <p className="form-error">{error}</p>}
      <Group title="Services" note="Paid generation and free stock. The desk makes these calls itself.">
        {!rows && !error && (
          <div className="st-row">
            <span className="spinner" />
          </div>
        )}
        {rows?.map((row) => {
          const result = tests[row.name];
          const viaEnv = !row.set && row.name === "elevenlabs" && status?.eleven.ok;
          const connected = row.set || viaEnv;
          const help = KEY_HELP[row.name];
          return (
            <div key={row.name} className={`st-service${open === row.name ? " open" : ""}`}>
              <div className="st-row">
                <span className={`st-avatar ${row.name}`}>{row.label[0]}</span>
                <div className="st-row-text">
                  <div className="st-row-label">{row.label}</div>
                  <div className="st-row-hint">{row.for}</div>
                </div>
                <div className="st-row-control">
                  {connected ? <Pill check={{ ok: true }}>{viaEnv ? "Connected · .env.local" : `Connected · ••${row.last4}`}</Pill> : <Pill check={{ ok: false }}>Not connected</Pill>}
                  {row.set && (
                    <button type="button" className="ghost small" onClick={() => test(row.name)}>
                      Test
                    </button>
                  )}
                  <button type="button" className={connected ? "ghost small" : "primary small"} onClick={() => setOpen(open === row.name ? "" : row.name)}>
                    {open === row.name ? "Close" : connected ? "Replace" : "Connect"}
                  </button>
                </div>
              </div>
              {result && <p className={`st-test ${result === "testing" ? "" : result.ok ? "ok" : "bad"}`}>{result === "testing" ? "Testing…" : result.detail}</p>}
              {open === row.name && (
                <div className="st-service-body">
                  <p>
                    {help.text} Get one at <code>{help.link}</code>.
                  </p>
                  <form
                    className="st-key"
                    onSubmit={(event) => {
                      event.preventDefault();
                      save(row.name);
                    }}
                  >
                    <input
                      className="st-input mono"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus
                      placeholder={row.set ? "Paste a new key to replace it" : `Paste the ${row.label} key`}
                      value={drafts[row.name] ?? ""}
                      onChange={(event) => setDrafts((all) => ({ ...all, [row.name]: event.target.value }))}
                    />
                    <button className="primary" disabled={!drafts[row.name]?.trim()}>
                      Save key
                    </button>
                    {row.set && (
                      <button type="button" className="ghost danger" onClick={() => remove(row.name, row.label)}>
                        Remove
                      </button>
                    )}
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </Group>
      <Group title="Logins" note="No key: these run on a login the tool already has.">
        <Row
          label={
            <>
              <span className="st-avatar codex">C</span> Codex
            </>
          }
          hint={
            <>
              Generated stills on your ChatGPT login: no money, counts against the plan's image limit. Log in with <code>codex login</code> or the Codex app.
            </>
          }
        >
          <Pill check={status?.codex} title={status?.codex.detail}>{status ? (status.codex.ok ? `Logged in${status.codex.plan ? ` · ${status.codex.plan}` : ""}` : "Not logged in") : undefined}</Pill>
        </Row>
        <Row
          label={
            <>
              <span className="st-avatar claude">C</span> Claude Code
            </>
          }
          hint="Runs every agent, on your Claude plan. Its model and effort are under Agent."
        >
          <Pill check={status?.claude}>{status ? (status.claude.ok ? `Connected${status.claude.plan ? ` · ${status.claude.plan}` : ""}` : "Not connected") : undefined}</Pill>
        </Row>
      </Group>
      <p className="st-foot">Keys are kept in {where || "~/.config/nykma"}/keys/, outside the repo and readable only by you, and never shown again.</p>
    </>
  );
}

const MODELS: [string, string][] = [["", "Default"], ["opus", "Opus"], ["sonnet", "Sonnet"], ["haiku", "Haiku"], ["fable", "Fable"]];
const EFFORTS: [string, string][] = [["", "Default"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["xhigh", "Extra high"], ["max", "Max"]];

const TOOLS: { key: keyof Status; name: string; what: string }[] = [
  { key: "claude", name: "Claude Code", what: "Runs the agents" },
  { key: "eleven", name: "ElevenLabs", what: "Voice, music and sound effects" },
  { key: "openrouter", name: "OpenRouter", what: "Generated stills and video, paid" },
  { key: "codex", name: "Codex", what: "Generated stills on your ChatGPT login" },
  { key: "local", name: "This PC (ComfyUI)", what: "Generated video on this machine's GPU" },
  { key: "whisper", name: "Whisper", what: "Word times for a recorded voice, free" },
  { key: "ffmpeg", name: "ffmpeg", what: "Encodes every MP4" },
  { key: "ytdlp", name: "yt-dlp", what: "Downloads a brand's own videos" },
  { key: "opencv", name: "OpenCV", what: "Finds a green screen in a clip" },
];

/** Which categories need a look: a dot in the list. */
function warnings(status: Status | undefined, s: Settings | undefined): Partial<Record<Section, string>> {
  if (!status || !s) return {};
  const out: Partial<Record<Section, string>> = {};
  if (!status.claude.ok) out.agent = "Claude Code isn't connected";
  if ((s.images === "codex" && !status.codex.ok) || (s.video === "local" && !status.local.ok) || (s.images === "openrouter" && !status.openrouter.ok) || (s.video === "openrouter" && !status.openrouter.ok)) out.media = "The chosen generator isn't ready";
  if (!status.eleven.ok) out.voice = "No ElevenLabs key";
  if (!status.openrouter.ok || !status.eleven.ok) out.connections = "A service isn't connected";
  if (!status.ffmpeg.ok || !status.claude.ok) out.system = "A tool the desk needs is missing";
  return out;
}

export function SettingsPage({ state, go, brand }: { state: State; go: Go; brand?: string }) {
  const [settings, setSettings] = useState<Settings>();
  const [status, setStatus] = useState<Status>();
  const [voices, setVoices] = useState<Voice[]>();
  const [voiceError, setVoiceError] = useState("");
  const [savedNote, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState("");
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addNote, setAddNote] = useState("");
  const [looked, setLooked] = useState<Record<string, Voice>>({});
  const [localBusy, setLocalBusy] = useState(false);
  const [theme, setTheme] = useState<Theme>(savedTheme);
  // Opened from a brand kit: its instructions, under Agent.
  const [section, setSection] = useState<Section>(() => (brand ? "agent" : savedSection()));
  const audio = useRef<HTMLAudioElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const pick = (next: Section) => {
    setSection(next);
    try {
      localStorage.setItem(SECTION_KEY, next);
    } catch {
      /* the section lasts this visit */
    }
    document.querySelector(".st-main")?.scrollTo({ top: 0 });
  };

  const check = (fresh = false) => {
    setStatus(undefined);
    fetch(`/api/status${fresh ? "?fresh" : ""}`)
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => {});
  };
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then(setSettings)
      .catch(() => setError("The settings didn't load."));
    check();
  }, []);
  const loadVoices = () => {
    setVoiceError("");
    fetch("/api/voices")
      .then((res) => res.json())
      .then((reply) => (reply.voices ? setVoices(reply.voices) : setVoiceError(reply.error ?? "The voices didn't load.")))
      .catch(() => setVoiceError("The voices didn't load."));
  };
  useEffect(() => {
    if (status?.eleven.ok && !voices && !voiceError) loadVoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.eleven.ok]);

  const change = (next: Settings) => {
    setSettings(next);
    setError("");
    post<Settings>("/api/settings", { settings: next }).then(
      (clean) => {
        setSettings(clean);
        setSaved(true);
        clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 1600);
      },
      (failure) => setError(failure.message),
    );
  };

  const play = (voice: { id: string; preview?: string }) => {
    const el = audio.current;
    if (!el || !voice.preview) return;
    if (playing === voice.id) {
      el.pause();
      setPlaying("");
      return;
    }
    el.src = voice.preview;
    el.play().then(() => setPlaying(voice.id), () => setPlaying(""));
  };

  const warn = warnings(status, settings);
  const here = SECTIONS.find((item) => item.id === section)!;

  const nav = (
    <nav className="st-nav" aria-label="Settings">
      <h1>Settings</h1>
      {SECTIONS.map((item) => (
        <button key={item.id} className={section === item.id ? "on" : ""} onClick={() => pick(item.id)} aria-current={section === item.id ? "page" : undefined}>
          {ICONS[item.id]}
          <span>{item.name}</span>
          {warn[item.id] && <i className="st-dot" title={warn[item.id]} />}
        </button>
      ))}
      <p className="st-nav-foot">Saved as you change them, in settings.json. Built ads keep what they were made with.</p>
    </nav>
  );

  if (!settings)
    return (
      <Shell page="settings" state={state} go={go}>
        <div className="st">
          {nav}
          <main className="st-main">{error ? <p className="form-error">{error}</p> : <span className="spinner big" />}</main>
        </div>
      </Shell>
    );

  const s = settings;
  const toggleRatio = (ratio: Ratio) => {
    const on = s.ratios.includes(ratio);
    if (on && s.ratios.length === 1) return;
    change({ ...s, ratios: RATIOS.filter((item) => (item === ratio ? !on : s.ratios.includes(item))) });
  };
  const saved = s.savedVoices;
  const known = (id?: string) => (id ? (looked[id] ?? voices?.find((voice) => voice.id === id)) : undefined);
  const nameOf = (id: string) => saved.find((voice) => voice.id === id)?.name ?? known(id)?.name;
  const fixedVoice = known(s.voice.id);
  const pickVoice = (id: string) => change({ ...s, voice: { mode: "fixed", id, name: nameOf(id) } });
  const accountVoices = (voices ?? []).filter((voice) => !saved.some((item) => item.id === voice.id));

  /** Looks the id up (free) for its name and preview, then saves it whether or not ElevenLabs knew it. */
  const addVoice = (event: React.FormEvent) => {
    event.preventDefault();
    const id = newId.trim();
    if (!/^[A-Za-z0-9]{8,40}$/.test(id)) return setAddNote("A voice id is 8 to 40 letters and numbers, as ElevenLabs shows it.");
    setAdding(true);
    setAddNote("");
    fetch(`/api/voice?id=${encodeURIComponent(id)}`)
      .then((res) => res.json())
      .catch(() => ({ error: "The lookup didn't run." }))
      .then((reply: { voice?: Voice; error?: string }) => {
        if (reply.voice) setLooked((all) => ({ ...all, [id]: reply.voice! }));
        const name = newName.trim() || reply.voice?.name || id;
        const list = saved.some((voice) => voice.id === id) ? saved.map((voice) => (voice.id === id ? { id, name } : voice)) : [...saved, { id, name }];
        change({ ...s, savedVoices: list, voice: s.voice.id === id ? { ...s.voice, name } : s.voice });
        setAddNote(reply.voice ? "" : `Saved, but ${reply.error ?? "ElevenLabs didn't find it"} Check the id: a voice the account can't reach fails when it speaks.`);
        setNewId("");
        setNewName("");
      })
      .finally(() => setAdding(false));
  };
  const removeVoice = (id: string) => change({ ...s, savedVoices: saved.filter((voice) => voice.id !== id), voice: s.voice.id === id ? { mode: "auto" } : s.voice });

  const body: Record<Section, () => ReactNode> = {
    general: () => (
      <>
        <Group title="New ads" note="The defaults when you start one. You can pick other layouts for one ad when you start it.">
          <Row label="Layouts" hint="Each is laid out for its own shape, not cropped." stack>
            <RatioCards value={s.ratios} onToggle={toggleRatio} />
          </Row>
          <Row label="Pitch first" hint="A pitch and an animatic, then it stops for you to say go. Off: it builds straight away.">
            <Toggle label="Pitch first" on={s.pitch} onChange={(on) => change({ ...s, pitch: on })} />
          </Row>
          <Row label="Thumbnail" hint="A designed cover image for each layout, made in code with the ad.">
            <Toggle label="Thumbnail" on={s.thumbnail} onChange={(on) => change({ ...s, thumbnail: on })} />
          </Row>
        </Group>
        <Group title="Look" note="This browser's preference. Ads always show on neutral grey, so their colours read true.">
          <div className="st-themes" role="radiogroup" aria-label="Theme">
            {THEMES.map((item) => (
              <ThemeCard
                key={item.id}
                theme={item}
                on={theme === item.id}
                onPick={() => {
                  applyTheme(item.id);
                  setTheme(item.id);
                }}
              />
            ))}
          </div>
        </Group>
      </>
    ),

    agent: () => (
      <>
        <Group
          title="Claude Code"
          right={
            <button className="ghost small" onClick={() => check(true)}>
              Check again
            </button>
          }
        >
          <div className="st-hero">
            <span className={`st-hero-mark ${status ? (status.claude.ok ? "ok" : "bad") : ""}`}>
              <SparkIcon size={18} />
            </span>
            <div>
              <b>{!status ? "Checking…" : status.claude.ok ? `Connected${status.claude.account ? ` as ${status.claude.account}` : ""}` : "Not connected"}</b>
              <span>
                {!status
                  ? "Asking Claude Code, for free."
                  : status.claude.ok
                    ? `${status.claude.plan ? `${status.claude.plan} plan · ` : ""}Claude Code ${status.claude.version ?? ""}`
                    : (
                      <>
                        {status.claude.detail}. Install it from claude.com/code, run <code>claude auth login</code> in a terminal, then Check again.
                      </>
                    )}
              </span>
            </div>
          </div>
          <Row label="Model" hint="For the next message you send an agent. Default is Claude Code's own." stack>
            <Seg label="Model" value={s.claude.model} options={MODELS} onChange={(model) => change({ ...s, claude: { ...s.claude, model } })} />
          </Row>
          <Row label="Effort" hint="How long it thinks. More effort is slower and uses more of your plan." stack>
            <Seg label="Effort" value={s.claude.effort} options={EFFORTS} onChange={(effort) => change({ ...s, claude: { ...s.claude, effort } })} />
          </Row>
          <details className="st-more">
            <summary>Advanced</summary>
            <Row label="Path" hint={'"claude" finds it on your PATH.'}>
              <PathField value={s.claude.bin} onSave={(bin) => change({ ...s, claude: { ...s.claude, bin: bin || "claude" } })} />
            </Row>
          </details>
        </Group>
        <div className="st-group">
          <header className="st-group-head">
            <div>
              <h3>Instructions</h3>
              <p>What every ad is made with: ad-agent's prompt, the rules, the pitch template and the reviewer. A brand can have its own copy.</p>
            </div>
          </header>
          <div className="settings st-instructions">
            <Instructions state={state} brand={brand} />
          </div>
        </div>
      </>
    ),

    voice: () => (
      <>
        <audio ref={audio} onEnded={() => setPlaying("")} />
        <Group title="Voice-overs">
          <Options
            name="Voice"
            value={s.voice.mode}
            onChange={(mode) => {
              if (mode === "auto") return change({ ...s, voice: { mode: "auto" } });
              const first = s.voice.id ?? saved[0]?.id ?? voices?.[0]?.id;
              if (first) pickVoice(first);
            }}
            options={[
              { id: "auto", name: "Automatic", text: `The agent picks the voice that suits each idea${saved.length ? ", from your saved voices first" : ""}, and names it in the pitch.` },
              { id: "fixed", name: "Always this voice", text: "The same voice for every voice-over, unless an idea needs more than one." },
            ]}
          />
          {s.voice.mode === "fixed" && (voices?.length || saved.length) ? (
            <Row label="The voice">
              <select className="st-input" value={s.voice.id ?? ""} onChange={(event) => event.target.value && pickVoice(event.target.value)}>
                {!s.voice.id && <option value="">Pick a voice</option>}
                {s.voice.id && !nameOf(s.voice.id) && <option value={s.voice.id}>{s.voice.name ?? s.voice.id}</option>}
                {saved.length > 0 && (
                  <optgroup label="Saved">
                    {saved.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {accountVoices.length > 0 && (
                  <optgroup label="On your account">
                    {accountVoices.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name}
                        {Object.values(voice.labels).length ? ` (${Object.values(voice.labels).slice(0, 3).join(", ")})` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {fixedVoice?.preview && (
                <button className="ghost small st-play" type="button" onClick={() => play(fixedVoice)} aria-label="Preview">
                  {playing === fixedVoice.id ? <StopIcon size={12} /> : <PlayIcon size={12} />}
                </button>
              )}
            </Row>
          ) : null}
          {!voices?.length && (
            <p className="st-inline-note">
              {voiceError || (status?.eleven.ok === false ? "The account's voices need an ElevenLabs key (Connections)." : "Loading the account's voices…")}
              {voiceError && (
                <button className="ghost small" onClick={loadVoices}>
                  Try again
                </button>
              )}
              {status?.eleven.ok === false && (
                <button className="ghost small" onClick={() => pick("connections")}>
                  Open Connections
                </button>
              )}
            </p>
          )}
        </Group>
        <Group title="Saved voices" note="Voices you added by id: a clone, or one from the ElevenLabs library. They're offered first, and preferred when the agent picks.">
          {saved.map((voice) => {
            const info = known(voice.id);
            const inUse = s.voice.mode === "fixed" && s.voice.id === voice.id;
            return (
              <div key={voice.id} className="st-row st-voice">
                <span className="st-avatar voice">{voice.name.slice(0, 1).toUpperCase()}</span>
                <div className="st-row-text">
                  <div className="st-row-label">
                    {voice.name} {inUse && <span className="st-badge free">In use</span>}
                  </div>
                  <div className="st-row-hint mono">{voice.id}</div>
                </div>
                <div className="st-row-control">
                  {info?.preview && (
                    <button className="ghost small st-play" type="button" onClick={() => play({ id: voice.id, preview: info.preview })} aria-label={`Preview ${voice.name}`}>
                      {playing === voice.id ? <StopIcon size={12} /> : <PlayIcon size={12} />}
                    </button>
                  )}
                  {!inUse && (
                    <button className="ghost small" type="button" onClick={() => pickVoice(voice.id)}>
                      Use always
                    </button>
                  )}
                  <button className="ghost small danger" type="button" onClick={() => removeVoice(voice.id)} aria-label={`Remove ${voice.name}`}>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
          <form className="st-row st-add" onSubmit={addVoice}>
            <input className="st-input mono" type="text" placeholder="Voice id, e.g. JBFqnCBsd6RMkjVDRZzb" value={newId} spellCheck={false} onChange={(event) => setNewId(event.target.value)} />
            <input className="st-input" type="text" placeholder="Name (optional)" value={newName} onChange={(event) => setNewName(event.target.value)} />
            <button className="primary" disabled={!newId.trim() || adding}>
              {adding ? "Looking it up…" : "Add voice"}
            </button>
          </form>
          {addNote && <p className="st-inline-note">{addNote}</p>}
        </Group>
      </>
    ),

    media: () => (
      <>
        <Group title="Stills" note="A person, a place, a first frame for a video. A clip is made only after you approve the stills it starts from.">
          <Options
            name="Stills"
            value={s.images}
            onChange={(images) => change({ ...s, images })}
            options={[
              { id: "openrouter", name: "OpenRouter", badge: "Paid", text: "Nano Banana, GPT Image, FLUX or Recraft, picked per shot. Priced in the pitch and approved on the desk.", check: status?.openrouter },
              { id: "codex", name: "Codex", badge: "Free", text: "OpenAI's image model on your ChatGPT login, within the plan's image limit. A few fixed sizes, so 9:16 and 16:9 are cropped to fit.", check: status?.codex },
            ]}
          />
          {s.images === "codex" && (
            <details className="st-more">
              <summary>Advanced</summary>
              <Row label="Codex path" hint="Empty finds codex on your PATH, then the Codex app's own.">
                <PathField value={s.codex.bin} placeholder="Found automatically" onSave={(bin) => change({ ...s, codex: { bin } })} />
              </Row>
            </details>
          )}
        </Group>
        <Group title="Video" note="Clips made from approved stills.">
          <Options
            name="Video"
            value={s.video}
            onChange={(video) => change({ ...s, video })}
            options={[
              { id: "openrouter", name: "OpenRouter", badge: "Paid", text: "Veo, Kling, Seedance, MiniMax or Wan, picked per shot. About $0.50 to $2 a clip, priced in the pitch and approved on the desk.", check: status?.openrouter },
              { id: "local", name: "This PC", badge: "Free", text: "LTX-2.5 in ComfyUI on this machine's GPU. About 3½ minutes a clip, one at a time; close to Veo, a little softer on hands. Set up once with bun run local:setup.", check: status?.local },
            ]}
          />
          {s.video === "local" && status?.local.ok && (
            <Row label="ComfyUI" hint="It starts by itself when a clip needs it, and keeps running after.">
              <Pill check={{ ok: Boolean(status.local.running) }}>{status.local.running ? "Running" : "Stopped"}</Pill>
              <button
                type="button"
                className="ghost small"
                disabled={localBusy}
                onClick={() => {
                  setLocalBusy(true);
                  post(status.local.running ? "/api/local/stop" : "/api/local/start", {}).then(
                    () => (setLocalBusy(false), check(true)),
                    (failure) => (setLocalBusy(false), setError(failure.message)),
                  );
                }}
              >
                {localBusy ? "Working…" : status.local.running ? "Stop (frees the GPU)" : "Start now"}
              </button>
            </Row>
          )}
        </Group>
        <Group title="Word timing" note="When a voice is a recording, its words need times so captions and cuts land on them.">
          <Options
            name="Word timing"
            value={s.align}
            onChange={(align) => change({ ...s, align })}
            options={[
              { id: "whisper", name: "Whisper", badge: "Free", text: "On this machine. Most words land within 2 or 3 frames: good for captions.", check: status?.whisper },
              { id: "eleven", name: "ElevenLabs", badge: "Credits", text: "Forced alignment: exact, for a cut that has to land on a word. Spends credits, at a rate ElevenLabs doesn't publish.", check: status?.eleven },
            ]}
          />
        </Group>
      </>
    ),

    connections: () => <Connections status={status} onChange={() => check(true)} />,

    system: () => (
      <Group
        title="Tools"
        right={
          <button className="ghost small" onClick={() => check(true)}>
            Check again
          </button>
        }
      >
        {TOOLS.map((tool) => {
          const value = status?.[tool.key] as Check;
          return (
            <Row key={tool.key} label={tool.name} hint={value && !value.ok ? value.detail : tool.what}>
              <Pill check={value}>{value ? (value.ok ? (value.detail.length < 34 ? value.detail : "Ready") : "Missing") : undefined}</Pill>
            </Row>
          );
        })}
      </Group>
    ),
  };

  return (
    <Shell page="settings" state={state} go={go}>
      <div className="st">
        {nav}
        <main className="st-main">
          <header className="st-head">
            <div>
              <h2>{here.name}</h2>
              <p>{here.lede}</p>
            </div>
            <span className={`st-saved${savedNote ? " on" : ""}`} aria-live="polite">
              {savedNote ? "✓ Saved" : ""}
            </span>
          </header>
          {error && <p className="form-error">{error}</p>}
          <div className="st-body" key={section}>
            {body[section]()}
          </div>
        </main>
      </div>
    </Shell>
  );
}
