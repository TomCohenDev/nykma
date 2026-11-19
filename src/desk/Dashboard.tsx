/** The dashboard: projects and brand kits, like a file browser (spec.md §10.1). */
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BrandIcon, CloseIcon, FolderIcon, GearIcon, GlobeIcon, PlusIcon, ProjectsIcon, SparkIcon, UploadIcon } from "./icons";
import { RATIOS, STATE_LABEL, ago, brandFile, post, posterOf, ratioLabel, upload, useEscape, type BrandKit, type Project, type Ratio, type Run, type Settings, type State } from "./api";

type Go = (hash: string) => void;

export function Shell({ page, state, go, children }: { page: "projects" | "brands" | "settings"; state: State; go: Go; children: ReactNode }) {
  const kits = state.brands.filter((kit) => kit.made || kit.uploads.length);
  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Desk">
        <div className="wordmark">
          <span className="wordmark-mark">n</span> nykma
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
        <div className="sidebar-foot">
          <a href="/" target="_blank" rel="noreferrer">
            Scrubbing preview ↗
          </a>
        </div>
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

function NewProject({ brands, onClose, go }: { brands: BrandKit[]; onClose: () => void; go: Go }) {
  const [text, setText] = useState("");
  const [brand, setBrand] = useState(brands[0]?.name ?? "");
  const [kind, setKind] = useState<"video" | "asset">("video");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  // This ad's layouts start from the saved settings, and change only for this ad.
  const [ratios, setRatios] = useState<Ratio[]>(["1x1"]);
  const [pitch, setPitch] = useState(true);
  const [thumbnail, setThumbnail] = useState(true);
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
  const toggle = (ratio: Ratio) => setRatios((now) => (now.includes(ratio) ? (now.length > 1 ? now.filter((item) => item !== ratio) : now) : RATIOS.filter((item) => item === ratio || now.includes(item))));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError("");
    post("/api/ask", { text, brand: brand || undefined, kind, ratios, pitch, thumbnail: kind === "asset" ? undefined : thumbnail })
      .then((reply) => go(`#/run/${reply.id}`))
      .catch((failure) => {
        setError(failure.message);
        setSending(false);
      });
  };
  return (
    <Modal title="New project" onClose={onClose}>
      <form className="new-form" onSubmit={submit}>
        <label className="big-ask">
          <span>
            <SparkIcon /> What's it about?
          </span>
          <textarea
            dir="auto"
            rows={4}
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && text.trim()) submit(event);
            }}
            placeholder="A 20 second ad about how fast the app solves a page of homework"
          />
        </label>
        <div className="form-row">
          <label>
            Brand
            <select value={brand} onChange={(event) => setBrand(event.target.value)}>
              {brands.map((kit) => (
                <option key={kit.name}>{kit.name}</option>
              ))}
              <option value="">Another brand: say it above</option>
            </select>
          </label>
          <div className="field">
            Kind
            <div className="segmented" role="group" aria-label="Kind">
              <button type="button" aria-pressed={kind === "video"} onClick={() => setKind("video")}>
                Video
              </button>
              <button type="button" aria-pressed={kind === "asset"} onClick={() => setKind("asset")}>
                Asset
              </button>
            </div>
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            Layouts
            <div className="segmented" role="group" aria-label="Layouts">
              {RATIOS.map((ratio) => (
                <button key={ratio} type="button" aria-pressed={ratios.includes(ratio)} onClick={() => toggle(ratio)}>
                  {ratioLabel(ratio)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={pitch} onChange={(event) => setPitch(event.target.checked)} />
          Pitch first
        </label>
        {kind !== "asset" && (
          <label className="check">
            <input type="checkbox" checked={thumbnail} onChange={(event) => setThumbnail(event.target.checked)} />
            Thumbnail
          </label>
        )}
        <p className="hint">
          {pitch ? "The agent writes a pitch and an animatic first, then stops for you." : "No pitch: the agent builds straight away and stops at the first look."}{" "}
          {kind === "asset" ? "An asset is stills: a post image or a carousel." : ""}
        </p>
        {error && <p className="form-error">{error}</p>}
        <footer>
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!text.trim() || sending}>
            {sending ? "Starting" : "Start"} <kbd>Ctrl ↵</kbd>
          </button>
        </footer>
      </form>
    </Modal>
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

function Poster({ project }: { project: Project }) {
  const { video, image } = posterOf(project);
  const ref = useRef<HTMLVideoElement>(null);
  if (video)
    return (
      <video
        ref={ref}
        className="card-media"
        src={`${video}#t=2`}
        muted
        loop
        playsInline
        preload="metadata"
        onMouseEnter={() => void ref.current?.play().catch(() => {})}
        onMouseLeave={() => ref.current?.pause()}
      />
    );
  if (image) return <img className="card-media contain" src={image} alt="" loading="lazy" />;
  const take = project.info?.takes[0];
  const id = take?.ratios.find((item) => item.ratio === "16x9")?.id;
  const scene = take?.scenes[Math.floor((take.scenes.length - 1) / 2)];
  if (id && scene && take.frames)
    return (
      <div className="card-live">
        <iframe title={project.slug} src={`/board.html?id=${encodeURIComponent(id)}&scene=${encodeURIComponent(scene.id)}&f=${Math.floor(scene.frames / 2)}`} width={1920} height={1080} tabIndex={-1} loading="lazy" />
      </div>
    );
  return <div className="card-media blank">{project.slug}</div>;
}

const FILTERS = ["all", "pitch", "first-look", "checked", "ready", "dropped", "code"] as const;

export function ProjectsPage({ state, projects, go }: { state: State; projects: Project[]; go: Go }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [brand, setBrand] = useState("");
  const [creating, setCreating] = useState(false);
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

  return (
    <Shell page="projects" state={state} go={go}>
      <header className="page-head">
        <h1>Projects</h1>
        <button className="primary" onClick={() => setCreating(true)}>
          <PlusIcon size={14} /> New project
        </button>
      </header>
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
      <ul className="grid">
        {starting.map((run: Run) => (
          <li key={run.id}>
            <button className="card" onClick={() => go(`#/run/${run.id}`)}>
              <div className="card-thumb">
                <div className="card-media blank">
                  <span className="spinner big" />
                </div>
              </div>
              <div className="card-info">
                <span className="card-name" dir="auto">{run.title}</span>
                <span className="card-meta">The agent is starting</span>
              </div>
            </button>
          </li>
        ))}
        {shown.map((project) => (
          <li key={project.key}>
            <button className={`card${project.state === "dropped" ? " dropped" : ""}`} onClick={() => go(`#/p/${encodeURIComponent(project.key)}`)}>
              <div className="card-thumb">
                <Poster project={project} />
                <span className={`state ${project.state}`}>{STATE_LABEL[project.state]}</span>
                {project.running && <span className="working-dot on-card" title="The agent is working" />}
                {project.kind === "asset" && <span className="kind-tag">Asset</span>}
              </div>
              <div className="card-info">
                <span className="card-name">{project.slug}</span>
                <span className="card-meta">{[project.brand, ago(project.updated)].filter(Boolean).join(" · ") || "No queue folder yet"}</span>
              </div>
            </button>
          </li>
        ))}
        {!shown.length && !starting.length && (
          <li className="grid-empty">
            <p>No projects here yet.</p>
            <button className="primary" onClick={() => setCreating(true)}>
              <PlusIcon size={14} /> New project
            </button>
          </li>
        )}
      </ul>
      {creating && <NewProject brands={state.brands.filter((kit) => kit.made)} onClose={() => setCreating(false)} go={go} />}
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
