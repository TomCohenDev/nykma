/** The dashboard: projects and brand kits, like a file browser (spec.md §10.1). */
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BrandIcon, CloseIcon, FolderIcon, GearIcon, GlobeIcon, NykmaIcon, PlusIcon, ProjectsIcon, SendIcon, SparkIcon, UploadIcon } from "./icons";
import { RATIOS, SIZES, STATE_LABEL, ago, brandFile, media, post, posterOf, ratioLabel, upload, useEscape, type BrandKit, type Project, type Ratio, type Run, type Settings, type State } from "./api";

type Go = (hash: string) => void;

export function Shell({ page, state, go, children }: { page: "projects" | "brands" | "publish" | "settings"; state: State; go: Go; children: ReactNode }) {
  const kits = state.brands.filter((kit) => kit.made || kit.uploads.length);
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Desk">
        <div className="wordmark">
          <NykmaIcon size={24} />
          <span>
            nykma<b>_</b>
          </span>
        </div>
        <ul className="nav">
          <li>
            <button className={page === "projects" ? "on" : ""} onClick={() => go("#/")}>
              <ProjectsIcon /> Projects
            </button>
          </li>
          <li>
            <button className={page === "brands" ? "on" : ""} onClick={() => go("#/brands")}>
              <BrandIcon /> Brand kits
            </button>
          </li>
          <li>
            <button className={page === "publish" ? "on" : ""} onClick={() => go("#/publish")}>
              <SendIcon /> Publishing
            </button>
          </li>
          <li>
            <button className={page === "settings" ? "on" : ""} onClick={() => go("#/settings")}>
              <GearIcon /> Settings
            </button>
          </li>
        </ul>
        <h3 className="nav-title">Brands</h3>
        <ul className="nav brands">
          {kits.map((kit) => (
            <li key={kit.name}>
              <button onClick={() => go(`#/brand/${encodeURIComponent(kit.name)}`)}>
                <span className="swatch-dot" style={{ background: kit.colours[3] ?? kit.colours[0] ?? "#555" }} />
                {kit.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main className="shell-main">{children}</main>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEscape(onClose);
  return (
    <div className="overlay-veil" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** The brief, on the page rather than in a dialog: what the ad is about, the brand, and how it's made. */
function Composer({ brands, go, focusKey }: { brands: BrandKit[]; go: Go; focusKey: number }) {
  const [text, setText] = useState("");
  const [brand, setBrand] = useState(brands[0]?.name ?? "");
  const [kind, setKind] = useState<"video" | "asset">("video");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  // This ad's layouts start from the saved settings, and change only for this ad.
  const [ratios, setRatios] = useState<Ratio[]>(["1x1"]);
  const [pitch, setPitch] = useState(true);
  const [thumbnail, setThumbnail] = useState(true);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((saved: Settings) => {
        setRatios(saved.ratios);
        setPitch(saved.pitch);
        setThumbnail(saved.thumbnail);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (focusKey) box.current?.focus();
  }, [focusKey]);
  const toggle = (ratio: Ratio) => setRatios((now) => (now.includes(ratio) ? (now.length > 1 ? now.filter((item) => item !== ratio) : now) : RATIOS.filter((item) => item === ratio || now.includes(item))));
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setError("");
    post("/api/ask", { text, brand: brand || undefined, kind, ratios, pitch, thumbnail: kind === "asset" ? undefined : thumbnail })
      .then((reply) => go(`#/run/${reply.id}`))
      .catch((failure) => {
        setError(failure.message);
        setSending(false);
      });
  };
  const kit = brands.find((item) => item.name === brand);
  return (
    <form className="brief" onSubmit={submit}>
      <textarea
        ref={box}
        dir="auto"
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
        }}
        placeholder="What should the next ad be about? A 15-second ad that shows the free plan solving one real homework problem…"
      />
      <div className="brief-opts">
        <label className="opt">
          <span className="swatch-dot" style={{ background: kit?.colours[3] ?? kit?.colours[0] ?? "#555" }} />
          <select value={brand} onChange={(event) => setBrand(event.target.value)} aria-label="Brand">
            {brands.map((item) => (
              <option key={item.name}>{item.name}</option>
            ))}
            <option value="">Another brand: say it above</option>
          </select>
        </label>
        <div className="seg" role="group" aria-label="Kind">
          <button type="button" aria-pressed={kind === "video"} onClick={() => setKind("video")}>
            Video
          </button>
          <button type="button" aria-pressed={kind === "asset"} onClick={() => setKind("asset")}>
            Asset
          </button>
        </div>
        <div className="seg" role="group" aria-label="Layouts">
          {RATIOS.map((ratio) => (
            <button key={ratio} type="button" aria-pressed={ratios.includes(ratio)} onClick={() => toggle(ratio)}>
              {ratioLabel(ratio)}
            </button>
          ))}
        </div>
        <label className="opt check">
          <input type="checkbox" checked={pitch} onChange={(event) => setPitch(event.target.checked)} />
          Pitch first
        </label>
        {kind !== "asset" && (
          <label className="opt check">
            <input type="checkbox" checked={thumbnail} onChange={(event) => setThumbnail(event.target.checked)} />
            Cover image
          </label>
        )}
        <span className="brief-hint">{pitch ? "" : "No pitch: the agent builds straight away and stops at the first look."}</span>
        <button className="primary" disabled={!text.trim() || sending}>
          {sending ? "Starting…" : pitch ? "Pitch it" : "Build it"} <kbd>Ctrl ↵</kbd>
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

function NewKit({ onClose, go }: { onClose: () => void; go: Go }) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState<"repo" | "url" | "files">("repo");
  const [where, setWhere] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const ready = slug && (from === "files" ? files.length > 0 : where.trim());

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setSending(true);
    setError("");
    try {
      const saved: string[] = [];
      for (const file of files) saved.push(await upload(file, `brand:${slug}`));
      const source =
        from === "repo"
          ? `Its source is the local repo at ${where.trim()}.`
          : from === "url"
            ? `Its source is the website ${where.trim()}.`
            : `Its sources are the files I uploaded: ${saved.join(", ")}.`;
      const text = `Make a brand kit for "${name.trim()}" in brands/${slug}/. ${source}${notes.trim() ? `\n\n${notes.trim()}` : ""}`;
      await post("/api/ask", { kit: slug, text, shown: `Make the ${name.trim()} brand kit from ${from === "files" ? `${files.length} uploaded files` : where.trim()}` });
      go(`#/brand/${encodeURIComponent(slug)}`);
    } catch (failure) {
      setError((failure as Error).message);
      setSending(false);
    }
  };

  return (
    <Modal title="New brand kit" onClose={onClose}>
      <form className="new-form" onSubmit={submit}>
        <label>
          Name
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="mathbooklm" />
          {slug && slug !== name.trim() && <span className="hint">Saved as brands/{slug}/</span>}
        </label>
        <div className="field">
          Make it from
          <div className="source-tabs">
            <button type="button" aria-pressed={from === "repo"} onClick={() => setFrom("repo")}>
              <FolderIcon /> A local repo
            </button>
            <button type="button" aria-pressed={from === "url"} onClick={() => setFrom("url")}>
              <GlobeIcon /> A website
            </button>
            <button type="button" aria-pressed={from === "files"} onClick={() => setFrom("files")}>
              <UploadIcon /> Upload files
            </button>
          </div>
        </div>
        {from === "repo" && <input value={where} onChange={(event) => setWhere(event.target.value)} placeholder="C:\Users\you\github\your-app" />}
        {from === "url" && <input value={where} onChange={(event) => setWhere(event.target.value)} placeholder="https://your-app.com" />}
        {from === "files" && (
          <div
            className="dropzone"
            onClick={() => picker.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              setFiles((current) => [...current, ...event.dataTransfer.files]);
            }}
          >
            <UploadIcon size={20} />
            <p>Drop logos, fonts, screenshots or a PDF, or click to pick them.</p>
            {files.length > 0 && (
              <ul>
                {files.map((file, i) => (
                  <li key={i}>{file.name}</li>
                ))}
              </ul>
            )}
            <input ref={picker} type="file" multiple hidden onChange={(event) => event.target.files && setFiles((current) => [...current, ...event.target.files!])} />
          </div>
        )}
        <label>
          Anything else <span className="hint">optional</span>
          <textarea dir="auto" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="The Hebrew pages only, the logo is in public/icon.svg…" />
        </label>
        <p className="hint">The agent writes brand.md, copies the assets, and lists what it couldn't find instead of guessing.</p>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!ready || sending}>
            {sending ? "Starting" : "Make the kit"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

/** The ratio an ad is shown in on its card: its first layout, so a 9:16 ad gets a tall card. */
function ratioOf(project: Project): Ratio {
  const listed = project.info?.takes[0]?.ratios.map((item) => item.ratio as Ratio) ?? [];
  const take = project.ad ? Object.values(project.ad.takes)[0] : undefined;
  // The first layout that has a render, so the card plays what was made; then the registry's first layout.
  return (listed.find((ratio) => take?.[ratio]) ?? RATIOS.find((ratio) => take?.[ratio]) ?? listed[0] ?? "16x9") as Ratio;
}

const CARD_H = 228;

function Poster({ project, ratio, height = CARD_H }: { project: Project; ratio: Ratio; height?: number }) {
  const ad = project.ad;
  const ref = useRef<HTMLVideoElement>(null);
  const cover = ad?.thumbnails?.find((file) => file.includes(ratio) && file.endsWith(".jpg")) ?? ad?.thumbnails?.find((file) => file.includes(ratio));
  const take = ad ? Object.values(ad.takes)[0] : undefined;
  const file = take?.[ratio];
  const fallback = posterOf(project);
  if (file || fallback.video)
    return (
      <video
        ref={ref}
        className="card-media"
        src={`${file ? media(ad!.folder, file) : fallback.video}#t=2`}
        poster={cover ? media(ad!.folder, cover) : undefined}
        muted
        loop
        playsInline
        preload="metadata"
        onMouseEnter={() => void ref.current?.play().catch(() => {})}
        onMouseLeave={() => ref.current?.pause()}
      />
    );
  if (cover || fallback.image) return <img className="card-media" src={cover ? media(ad!.folder, cover) : fallback.image} alt="" loading="lazy" />;
  const info = project.info?.takes[0];
  const id = info?.ratios.find((item) => item.ratio === ratio)?.id;
  const scene = info?.scenes[Math.floor((info.scenes.length - 1) / 2)];
  if (id && scene && info.frames)
    return (
      <div className="card-live">
        <iframe
          title={project.slug}
          src={`/board.html?id=${encodeURIComponent(id)}&scene=${encodeURIComponent(scene.id)}&f=${Math.floor(scene.frames / 2)}`}
          width={SIZES[ratio].width}
          height={SIZES[ratio].height}
          tabIndex={-1}
          loading="lazy"
          style={{ transform: `scale(${height / SIZES[ratio].height})` }}
        />
      </div>
    );
  return <div className="card-media blank">{project.slug}</div>;
}

const FILTERS = ["all", "pitch", "first-look", "checked", "ready", "dropped", "code"] as const;

export function ProjectsPage({ state, projects, go }: { state: State; projects: Project[]; go: Go }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [brand, setBrand] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  const starting = state.runs.filter((run) => run.running && run.kind === "agent" && !run.folder && !run.brand && !run.slug && !run.thread);
  const shown = useMemo(
    () =>
      projects
        .filter((project) => (filter === "all" ? project.state !== "code" : project.state === filter))
        .filter((project) => !brand || project.brand === brand)
        .sort((a, b) => b.updated - a.updated),
    [projects, filter, brand],
  );
  const counts = Object.fromEntries(FILTERS.map((key) => [key, key === "all" ? projects.filter((p) => p.state !== "code").length : projects.filter((p) => p.state === key).length]));
  const brands = [...new Set(projects.map((project) => project.brand).filter(Boolean))] as string[];
  const colourOf = (name?: string) => state.brands.find((kit) => kit.name === name)?.colours[3] ?? "#555";

  return (
    <Shell page="projects" state={state} go={go}>
      <header className="page-head">
        <h1>Projects</h1>
        <button className="ghost boxed" onClick={() => setFocusKey((key) => key + 1)}>
          <PlusIcon size={14} /> New project
        </button>
      </header>
      <Composer brands={state.brands.filter((kit) => kit.made)} go={go} focusKey={focusKey} />
      <div className="filters">
        {FILTERS.filter((key) => key === "all" || counts[key]).map((key) => (
          <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {key === "all" ? "All" : STATE_LABEL[key]} <span>{counts[key]}</span>
          </button>
        ))}
        {brands.length > 1 && (
          <select value={brand} onChange={(event) => setBrand(event.target.value)} aria-label="Brand">
            <option value="">Every brand</option>
            {brands.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        )}
      </div>
      <ul className="library">
        {starting.map((run: Run) => (
          <li key={run.id} style={{ width: Math.round(CARD_H * (16 / 9)) }}>
            <button className="tile" onClick={() => go(`#/run/${run.id}`)}>
              <div className="tile-thumb" style={{ height: CARD_H }}>
                <div className="card-media blank">
                  <span className="spinner big" />
                </div>
              </div>
              <span className="tile-name" dir="auto">
                {run.title}
              </span>
              <span className="tile-meta">The agent is starting</span>
            </button>
          </li>
        ))}
        {shown.map((project) => {
          const ratio = ratioOf(project);
          const take = project.info?.takes[0];
          const ratios = take?.ratios.map((item) => item.ratio as Ratio) ?? [];
          return (
            <li key={project.key} style={{ width: Math.round(CARD_H * (SIZES[ratio].width / SIZES[ratio].height)) }}>
              <button className={`tile${project.state === "dropped" ? " dropped" : ""}`} onClick={() => go(`#/p/${encodeURIComponent(project.key)}`)}>
                <div className="tile-thumb" style={{ height: CARD_H }}>
                  <Poster project={project} ratio={ratio} />
                  <span className={`state ${project.state}`}>{STATE_LABEL[project.state]}</span>
                  {project.running && <span className="working-dot on-card" title="The agent is working" />}
                  {ratios.length > 0 && (
                    <span className="tile-ratios">
                      {ratios.map((item) => (
                        <span key={item}>{ratioLabel(item)}</span>
                      ))}
                    </span>
                  )}
                  {take && take.frames > 0 && take.kind !== "asset" && <span className="tile-len">{(take.frames / take.fps).toFixed(1)}s</span>}
                  {project.kind === "asset" && <span className="tile-len">Asset</span>}
                </div>
                <span className="tile-name">{project.slug}</span>
                <span className="tile-meta">
                  {project.brand && <span className="swatch-dot" style={{ background: colourOf(project.brand) }} />}
                  {[project.brand, ago(project.updated)].filter(Boolean).join(" · ") || "No queue folder yet"}
                </span>
              </button>
            </li>
          );
        })}
        {!shown.length && !starting.length && <li className="grid-empty">No projects here yet. Write a brief above to start one.</li>}
      </ul>
    </Shell>
  );
}

export function KitCard({ kit, go, running }: { kit: BrandKit; go: Go; running: boolean }) {
  const logo = kit.logos[0];
  const ground = kit.colours[0] ?? "#2c2c2c";
  return (
    <button className="card kit" onClick={() => go(`#/brand/${encodeURIComponent(kit.name)}`)}>
      <div className="card-thumb kit-thumb" style={{ background: ground }}>
        {logo ? <img src={brandFile(kit.name, logo)} alt="" /> : <span className="kit-letter">{kit.name[0]?.toUpperCase()}</span>}
        <div className="kit-swatches">
          {kit.colours.slice(0, 8).map((colour) => (
            <span key={colour} style={{ background: colour }} />
          ))}
        </div>
        {running && <span className="working-dot on-card" />}
        {!kit.made && <span className="state pitch">{running ? "Being made" : "Not made"}</span>}
      </div>
      <div className="card-info">
        <span className="card-name">{kit.name}</span>
        <span className="card-meta">{kit.fonts.map((font) => font.family).filter((family, i, all) => all.indexOf(family) === i).slice(0, 3).join(", ") || kit.url || "No fonts yet"}</span>
      </div>
    </button>
  );
}

export function BrandsPage({ state, go }: { state: State; go: Go }) {
  const [creating, setCreating] = useState(false);
  const running = new Set(state.runs.filter((run) => run.running && run.brand).map((run) => run.brand));
  return (
    <Shell page="brands" state={state} go={go}>
      <header className="page-head">
        <h1>Brand kits</h1>
        <button className="primary" onClick={() => setCreating(true)}>
          <PlusIcon size={14} /> New brand kit
        </button>
      </header>
      <p className="page-lede">A brand is worked out once and reused, so no ad pays to rediscover it. Every ad reads its kit and nothing else about the brand.</p>
      <ul className="grid">
        {state.brands.map((kit) => (
          <li key={kit.name}>
            <KitCard kit={kit} go={go} running={running.has(kit.name)} />
          </li>
        ))}
      </ul>
      {creating && <NewKit onClose={() => setCreating(false)} go={go} />}
    </Shell>
  );
}
