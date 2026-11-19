/**
 * Settings (spec.md §10.8): defaults for new ads, the voice, word timing and Claude Code, saved in settings.json as
 * you change them. An ad already built keeps what it was made with, so nothing here re-spends on it.
 */
import { useEffect, useRef, useState } from "react";
import { Shell } from "./Dashboard";
import { Instructions } from "./Instructions";
import { PlayIcon, StopIcon } from "./icons";
import { RATIOS, post, ratioLabel, type Ratio, type Settings, type State, type Status, type Voice } from "./api";

type Go = (hash: string) => void;

type KeyRow = { name: "openrouter" | "elevenlabs" | "pexels" | "pixabay"; label: string; for: string; set: boolean; last4?: string };
const KEY_HELP: Record<KeyRow["name"], string> = {
  openrouter: "One key for generated video (Veo, Kling, MiniMax, Seedance, Wan) and images (Nano Banana, GPT Image, FLUX, Recraft). Make it at openrouter.ai/keys with a credit limit: that's the hard stop, whatever happens on this machine.",
  elevenlabs: "Voice, music and sound effects through mv.py. A key already in .env.local keeps working; one saved here comes first.",
  pexels: "Free stock photos and clips, searched before any shot is generated (bun run stock). Optional: Pixabay alone is enough, and Pexels has paused new keys. With a key: 200 searches an hour, 20,000 a month.",
  pixabay: "Free stock photos and clips (bun run stock), alone or next to Pexels. Free: log in and copy the key from pixabay.com/api/docs. Photos come at 1280 px unless the account has full API access.",
};

/**
 * Keys for paid services, saved in the desk's key store outside the repo. A key goes in and never comes back out: the
 * page knows only whether one is set and its last four characters. Test asks the service, for free.
 */
function Connections({ status, onChange }: { status?: Status; onChange: () => void }) {
  const [rows, setRows] = useState<KeyRow[]>();
  const [where, setWhere] = useState("");
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
        onChange();
        test(name);
      },
      (failure) => setError(failure.message),
    );
  };
  const remove = (name: string, label: string) => {
    if (!confirm(`Remove the ${label} key from the desk?`)) return;
    post("/api/keys/remove", { service: name }).then((reply) => {
      load(reply);
      setTests((all) => ({ ...all, [name]: undefined as never }));
      onChange();
    }, (failure) => setError(failure.message));
  };
  return (
    <section>
      <h2>Connections</h2>
      {error && <p className="form-error">{error}</p>}
      {!rows && !error && <span className="spinner" />}
      {rows?.map((row) => {
        const result = tests[row.name];
        return (
          <div key={row.name} className="connection">
            <div className="connection-head">
              <b>{row.label}</b>
              <span className="note">{row.for}</span>
              {row.set ? (
                <span className="status-line ok">Connected, key ends in {row.last4}</span>
              ) : row.name === "elevenlabs" && status?.eleven.ok ? (
                <span className="status-line ok">Connected through .env.local</span>
              ) : (
                <span className="status-line bad">Not connected</span>
              )}
            </div>
            <p className="note">{KEY_HELP[row.name]}</p>
            <form
              className="row"
              onSubmit={(event) => {
                event.preventDefault();
                save(row.name);
              }}
            >
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder={row.set ? "Paste a new key to replace it" : `Paste the ${row.label} key`}
                value={drafts[row.name] ?? ""}
                onChange={(event) => setDrafts((all) => ({ ...all, [row.name]: event.target.value }))}
              />
              <button className="primary" disabled={!drafts[row.name]?.trim()}>
                Save
              </button>
              {row.set && (
                <>
                  <button type="button" className="ghost small" onClick={() => test(row.name)}>
                    Test
                  </button>
                  <button type="button" className="ghost small" onClick={() => remove(row.name, row.label)}>
                    Remove
                  </button>
                </>
              )}
            </form>
            {result && <p className={`status-line ${result === "testing" ? "" : result.ok ? "ok" : "bad"}`}>{result === "testing" ? "Testing" : result.detail}</p>}
          </div>
        );
      })}
      <div className="connection">
        <div className="connection-head">
          <b>Codex</b>
          <span className="note">generated stills, on your ChatGPT login</span>
          <span className={`status-line ${status ? (status.codex.ok ? "ok" : "bad") : ""}`}>{status ? status.codex.detail : "Checking"}</span>
        </div>
        <p className="note">
          No key: the desk runs Codex on the login it already has, the way the Codex app does. A still costs no money and counts against the plan's image limit. Log in with <code>codex login</code> or in the Codex app.
          {status?.codex.path ? ` Using ${status.codex.path}.` : ""}
        </p>
      </div>
      <p className="note">
        Keys are saved in {where || "~/.config/nykma"}/keys/, outside the repo and readable only by you, and never shown again. The desk makes the paid image and video calls and the stock searches itself, so their keys never reach an agent.
      </p>
    </section>
  );
}

const MODELS: [string, string][] = [["", "Claude Code's default"], ["opus", "Opus"], ["sonnet", "Sonnet"], ["haiku", "Haiku"], ["fable", "Fable"]];
const EFFORTS: [string, string][] = [["", "Claude Code's default"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["xhigh", "Extra high"], ["max", "Max"]];

function Line({ name, check }: { name: string; check?: { ok: boolean; detail: string } }) {
  return (
    <div className={`status-line ${check ? (check.ok ? "ok" : "bad") : ""}`}>
      <b>{name}</b> {check ? check.detail : "Checking"}
    </div>
  );
}

export function SettingsPage({ state, go, brand }: { state: State; go: Go; brand?: string }) {
  const [settings, setSettings] = useState<Settings>();
  const [status, setStatus] = useState<Status>();
  const [voices, setVoices] = useState<Voice[]>();
  const [voiceError, setVoiceError] = useState("");
  const [savedNote, setSaved] = useState("");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState("");
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addNote, setAddNote] = useState("");
  const [looked, setLooked] = useState<Record<string, Voice>>({});
  const [localBusy, setLocalBusy] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);

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
  // Opened from a brand kit: go straight to its instructions.
  useEffect(() => {
    if (brand && settings) document.getElementById("instructions")?.scrollIntoView({ block: "start" });
  }, [brand, Boolean(settings)]);
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
        setSaved("Saved");
        setTimeout(() => setSaved(""), 1500);
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

  if (!settings)
    return (
      <Shell page="settings" state={state} go={go}>
        <header className="page-head">
          <h1>Settings</h1>
        </header>
        {error ? <p className="form-error">{error}</p> : <span className="spinner big" />}
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

  return (
    <Shell page="settings" state={state} go={go}>
      <header className="page-head">
        <h1>
          Settings <span className="saved-note">{savedNote}</span>
        </h1>
      </header>
      <p className="page-lede">These are the defaults for new ads. An ad that's already built keeps what it was made with, so changing one here never spends anything on it.</p>
      {error && <p className="form-error">{error}</p>}
      <div className="settings">
        <Connections status={status} onChange={() => check(true)} />

        <section>
          <h2>New ads</h2>
          <div className="row">
            <span>Layouts</span>
            <div className="segmented" role="group" aria-label="Layouts">
              {RATIOS.map((ratio) => (
                <button key={ratio} type="button" aria-pressed={s.ratios.includes(ratio)} onClick={() => toggleRatio(ratio)}>
                  {ratioLabel(ratio)}
                </button>
              ))}
            </div>
            <span className="note">Each one is laid out for its own shape. You can pick others for one ad when you start it.</span>
          </div>
          <label className="check">
            <input type="checkbox" checked={s.pitch} onChange={(event) => change({ ...s, pitch: event.target.checked })} />
            Pitch first: a pitch and an animatic, then stop for me
          </label>
          <label className="check">
            <input type="checkbox" checked={s.thumbnail} onChange={(event) => change({ ...s, thumbnail: event.target.checked })} />
            Thumbnail: a designed cover image for each layout, made in code with the ad
          </label>
        </section>

        <Instructions state={state} brand={brand} />

        <section>
          <h2>Voice</h2>
          <div className="choices">
            <label className="choice">
              <input type="radio" name="voice" checked={s.voice.mode === "auto"} onChange={() => change({ ...s, voice: { mode: "auto" } })} />
              <span>
                <b>Automatic</b>
                <small>The agent picks the ElevenLabs voice that suits each idea{saved.length ? ", from your saved voices first" : ""}, and names it in the pitch.</small>
              </span>
            </label>
            <label className="choice">
              <input type="radio" name="voice" checked={s.voice.mode === "fixed"} disabled={!voices?.length && !saved.length && !s.voice.id} onChange={() => {
                  const first = s.voice.id ?? saved[0]?.id ?? voices?.[0]?.id;
                  if (first) pickVoice(first);
                }} />
              <span>
                <b>Always this voice</b>
                <small>For every voice-over, unless the idea needs more than one voice.</small>
              </span>
            </label>
          </div>
          <audio ref={audio} onEnded={() => setPlaying("")} />
          {voices?.length || saved.length ? (
            <div className="row">
              <span>ElevenLabs voice</span>
              <select value={s.voice.mode === "fixed" ? (s.voice.id ?? "") : ""} onChange={(event) => event.target.value && pickVoice(event.target.value)}>
                {(s.voice.mode !== "fixed" || !s.voice.id) && <option value="">Pick a voice</option>}
                {s.voice.mode === "fixed" && s.voice.id && !nameOf(s.voice.id) && <option value={s.voice.id}>{s.voice.name ?? s.voice.id}</option>}
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
              {s.voice.mode === "fixed" && fixedVoice?.preview && (
                <button className="ghost small" type="button" onClick={() => play(fixedVoice)}>
                  {playing === fixedVoice.id ? <StopIcon size={12} /> : <PlayIcon size={12} />} Preview
                </button>
              )}
            </div>
          ) : null}
          {!voices?.length && (
            <p className="note">
              {voiceError || (status?.eleven.ok === false ? `The account's voices need an ElevenLabs key. ${status.eleven.detail}.` : "Loading the account's voices")}
              {voiceError && (
                <>
                  {" "}
                  <button className="ghost small" onClick={loadVoices}>Try again</button>
                </>
              )}
            </p>
          )}
          <h3 className="settings-sub">Saved voices</h3>
          {saved.length ? (
            <ul className="saved-voices">
              {saved.map((voice) => {
                const info = known(voice.id);
                return (
                  <li key={voice.id}>
                    <span className="saved-voice-name">{voice.name}</span>
                    <code>{voice.id}</code>
                    {info?.preview && (
                      <button className="ghost small" type="button" onClick={() => play({ id: voice.id, preview: info.preview })}>
                        {playing === voice.id ? <StopIcon size={12} /> : <PlayIcon size={12} />}
                      </button>
                    )}
                    {s.voice.mode === "fixed" && s.voice.id === voice.id ? (
                      <span className="note">In use</span>
                    ) : (
                      <button className="ghost small" type="button" onClick={() => pickVoice(voice.id)}>
                        Use always
                      </button>
                    )}
                    <button className="ghost small" type="button" onClick={() => removeVoice(voice.id)} aria-label={`Remove ${voice.name}`}>
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="note">None yet. Add a voice by its id: one you cloned, or one from the ElevenLabs voice library.</p>
          )}
          <form className="row add-voice" onSubmit={addVoice}>
            <input type="text" placeholder="Voice id, e.g. JBFqnCBsd6RMkjVDRZzb" value={newId} spellCheck={false} onChange={(event) => setNewId(event.target.value)} />
            <input type="text" placeholder="Name (optional)" value={newName} onChange={(event) => setNewName(event.target.value)} />
            <button className="primary" disabled={!newId.trim() || adding}>
              {adding ? "Looking it up" : "Add"}
            </button>
          </form>
          {addNote && <p className="note">{addNote}</p>}
          <p className="note">Listing and looking up voices, and the previews, are free. Speaking a script spends credits, only within the pitch.</p>
        </section>

        <section>
          <h2>Generated stills</h2>
          <p className="note">Stills a new ad generates: a person, a place, a first frame for a video. A video is made only after you approve the stills it starts from.</p>
          <div className="choices">
            <label className="choice">
              <input type="radio" name="images" checked={s.images === "openrouter"} onChange={() => change({ ...s, images: "openrouter" })} />
              <span>
                <b>OpenRouter</b>
                <small>Nano Banana, GPT Image, FLUX or Recraft, picked per shot. Paid per still, priced in the pitch and approved on the desk.</small>
              </span>
            </label>
            <label className="choice">
              <input type="radio" name="images" checked={s.images === "codex"} onChange={() => change({ ...s, images: "codex" })} />
              <span>
                <b>Codex</b>
                <small>OpenAI's image model on your ChatGPT login. No money, but it uses the plan's image limit. It draws a few fixed sizes, so a 9:16 or 16:9 still is cropped to fit.</small>
              </span>
            </label>
          </div>
          <div className="row">
            <span>Codex path</span>
            <input
              type="text"
              defaultValue={s.codex.bin}
              placeholder="Found automatically"
              spellCheck={false}
              onBlur={(event) => event.target.value.trim() !== s.codex.bin && change({ ...s, codex: { bin: event.target.value.trim() } })}
            />
            <span className="note">Empty finds codex on your PATH, then the Codex app's own.</span>
          </div>
          <Line name="Codex" check={status?.codex} />
        </section>

        <section>
          <h2>Generated video</h2>
          <p className="note">Clips a new ad generates from its approved stills. An ad keeps the choice it was made with, so changing this never changes or re-spends a built ad.</p>
          <div className="choices">
            <label className="choice">
              <input type="radio" name="video" checked={s.video === "openrouter"} onChange={() => change({ ...s, video: "openrouter" })} />
              <span>
                <b>OpenRouter</b>
                <small>Veo, Kling, Seedance, MiniMax or Wan, picked per shot. About $0.50 to $2 a clip, priced in the pitch and approved on the desk.</small>
              </span>
            </label>
            <label className="choice">
              <input type="radio" name="video" checked={s.video === "local"} onChange={() => change({ ...s, video: "local" })} />
              <span>
                <b>This PC</b>
                <small>LTX-2.5 in ComfyUI, on this machine's GPU. No money, about 3½ minutes a clip, one at a time. Close to Veo, a little softer on hands. Set it up once with bun run local:setup.</small>
              </span>
            </label>
          </div>
          <Line name="This PC" check={status?.local} />
          {status?.local.ok && (
            <div className="row">
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
                {localBusy ? "Working" : status.local.running ? "Stop ComfyUI (frees the GPU)" : "Start ComfyUI now"}
              </button>
              <span className="note">It starts by itself when a clip needs it, and keeps running after.</span>
            </div>
          )}
        </section>

        <section>
          <h2>Word timing</h2>
          <p className="note">When a voice is a recording, its words need times so captions and cuts land on them.</p>
          <div className="choices">
            <label className="choice">
              <input type="radio" name="align" checked={s.align === "whisper"} onChange={() => change({ ...s, align: "whisper" })} />
              <span>
                <b>Whisper</b>
                <small>On this machine, free. Most words land within 2 or 3 frames. Good for captions.</small>
              </span>
            </label>
            <label className="choice">
              <input type="radio" name="align" checked={s.align === "eleven"} onChange={() => change({ ...s, align: "eleven" })} />
              <span>
                <b>ElevenLabs</b>
                <small>Forced alignment: exact, for a cut that has to land on a word. Spends credits, at a rate ElevenLabs doesn't publish.</small>
              </span>
            </label>
          </div>
          <Line name="Whisper" check={status?.whisper} />
        </section>

        <section>
          <h2>
            Claude Code
            <button className="ghost small" onClick={() => check(true)}>
              Check again
            </button>
          </h2>
          <div className={`status-line ${status ? (status.claude.ok ? "ok" : "bad") : ""}`}>
            <b>Connection</b>
            {!status
              ? "Checking"
              : status.claude.ok
                ? `Connected${status.claude.account ? ` as ${status.claude.account}` : ""}${status.claude.plan ? ` (${status.claude.plan})` : ""}, Claude Code ${status.claude.version}`
                : status.claude.detail}
          </div>
          {status && !status.claude.ok && (
            <p className="note">
              Install it from claude.com/code, then run <code>claude auth login</code> in a terminal and press Check again. The desk runs the agents through it, on your Claude plan.
            </p>
          )}
          <div className="row">
            <span>Path</span>
            <input
              type="text"
              defaultValue={s.claude.bin}
              spellCheck={false}
              onBlur={(event) => event.target.value.trim() !== s.claude.bin && change({ ...s, claude: { ...s.claude, bin: event.target.value.trim() || "claude" } })}
            />
            <span className="note">"claude" finds it on your PATH.</span>
          </div>
          <div className="row">
            <span>Model</span>
            <select value={s.claude.model} onChange={(event) => change({ ...s, claude: { ...s.claude, model: event.target.value } })}>
              {MODELS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="row">
            <span>Effort</span>
            <select value={s.claude.effort} onChange={(event) => change({ ...s, claude: { ...s.claude, effort: event.target.value } })}>
              {EFFORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <p className="note">The model and effort apply to the next message you send an agent.</p>
        </section>

        <section>
          <h2>Tools</h2>
          <Line name="ElevenLabs" check={status?.eleven} />
          <Line name="OpenRouter" check={status?.openrouter} />
          <Line name="Codex" check={status?.codex} />
          <Line name="Whisper" check={status?.whisper} />
          <Line name="yt-dlp" check={status?.ytdlp} />
          <Line name="OpenCV" check={status?.opencv} />
          <Line name="ffmpeg" check={status?.ffmpeg} />
        </section>
      </div>
    </Shell>
  );
}
