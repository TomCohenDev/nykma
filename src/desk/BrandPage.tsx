/** A brand kit: brand.md drawn as swatches, specimens and logos, with the agent on the right (spec.md §9, §10.1). */
import { useEffect, useState } from "react";
import { Chat } from "./Chat";
import { BackIcon } from "./icons";
import { Markdown, sectionOf } from "./md";
import { brandFile, post, type BrandKit, type State } from "./api";

type Go = (hash: string) => void;

/** Loads a kit's font files so the specimens are set in them. Returns the family names to use. */
function useKitFonts(kit?: BrandKit) {
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!kit) return;
    for (const font of kit.fonts) {
      if (!font.file || !/\.(woff2?|ttf|otf)$/i.test(font.file)) continue;
      const family = `kit-${kit.name}-${font.family}`;
      if (loaded[font.file]) continue;
      new FontFace(family, `url("${brandFile(kit.name, font.file)}")`, { weight: "100 900" })
        .load()
        .then((face) => {
          document.fonts.add(face);
          setLoaded((current) => ({ ...current, [font.file!]: family }));
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kit?.name, kit?.fonts.map((font) => font.file).join()]);
  return loaded;
}

/** Black or white, whichever reads on `hex`. */
function readable(hex = "#2c2c2c") {
  const v = hex.length === 4 ? hex.slice(1).split("").map((c) => c + c).join("") : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111111" : "#ffffff";
}

const SECTIONS = [
  ["colours", "Colours"],
  ["fonts", "Fonts"],
  ["logos", "Logo"],
  ["tone", "Tone"],
  ["facts", "Facts"],
  ["banned", "Banned claims"],
  ["sources", "Sources"],
] as const;

export function BrandPage({ name, state, go, refresh }: { name: string; state: State; go: Go; refresh: () => void }) {
  const kit = state.brands.find((item) => item.name === name);
  const fonts = useKitFonts(kit);
  const [editing, setEditing] = useState<string>();
  const [check, setCheck] = useState<{ output: string; failed: boolean }>();
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const running = state.runs.some((run) => run.running && run.brand === name);

  const ask = (text: string, shown: string) => post("/api/ask", { kit: name, text, shown }).then(refresh);
  const runCheck = () => {
    setChecking(true);
    post<{ output: string; failed: boolean }>("/api/brand-check", { brand: name })
      .then(setCheck, (failure) => setCheck({ output: failure.message, failed: true }))
      .finally(() => setChecking(false));
  };
  const save = () =>
    post("/api/brand-md", { brand: name, text: editing ?? "" }).then(
      () => {
        setEditing(undefined);
        refresh();
      },
      (failure) => setError(failure.message),
    );

  const text = kit?.text ?? "";
  const part = (title: RegExp) => sectionOf(text, title);
  const latin = kit?.fonts.find((font) => font.file && fonts[font.file]);

  return (
    <div className="project brand-page">
      <header className="topbar">
        <div className="topbar-left">
          <button className="ghost back" onClick={() => go("#/brands")} title="All brand kits">
            <BackIcon />
          </button>
          <span className="crumb" onClick={() => go("#/brands")}>Brand kits</span>
          <span className="crumb-sep">/</span>
          <h1 className="crumb-here">{name}</h1>
          {kit && !kit.made && <span className="state pitch">{running ? "Being made" : "Not made yet"}</span>}
          {running && <span className="working-dot" />}
        </div>
        <div className="topbar-mid" />
        <div className="topbar-right">
          <button className="ghost" onClick={runCheck} disabled={checking || !kit?.sources.trim()} title="Re-hash the sources and list what changed. Free.">
            {checking ? "Checking" : "Check sources"}
          </button>
          <button className="ghost" disabled={!kit?.made} onClick={() => go(`#/settings/${encodeURIComponent(name)}`)} title="The agent's instructions for this brand's ads">
            Agent instructions{kit?.knowledge ? ` · ${kit.knowledge} edited` : ""}
          </button>
          <button className="primary" disabled={!kit?.made} onClick={() => setEditing(kit?.text ?? "")}>
            Edit brand.md
          </button>
        </div>
      </header>

      <aside className="left-panel">
        <section className="panel-section">
          <h3>Kit</h3>
          <ul className="file-list">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#/brand/${encodeURIComponent(name)}`} onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(`kit-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </section>
        {kit && kit.uploads.length > 0 && (
          <section className="panel-section">
            <h3>Uploads <span className="count">{kit.uploads.length}</span></h3>
            <ul className="file-list">
              {kit.uploads.map((file) => (
                <li key={file}>
                  <a href={brandFile(name, `uploads/${file}`)} target="_blank" rel="noreferrer">{file}</a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <main className="kit-scroll">
        {!kit?.made ? (
          <div className="kit-empty">
            {running ? <span className="spinner big" /> : null}
            <h2>{running ? "The agent is making this kit" : "There's no brand.md yet"}</h2>
            <p>{running ? "It reads the sources, writes brand.md, copies the assets, and lists what it couldn't find. Follow along on the right." : "Ask the agent on the right to make it, and say where to look."}</p>
          </div>
        ) : (
          <article className="kit-sheet">
            <header className="kit-hero" style={{ background: kit.colours[0] ?? "#2c2c2c" }}>
              {kit.logos[0] && <img src={brandFile(name, kit.logos[0])} alt={`${name} logo`} />}
              <div>
                <h2 style={{ fontFamily: latin ? fonts[latin.file!] : undefined, color: readable(kit.colours[0]) }}>{text.match(/^#\s+(.+)$/m)?.[1] ?? name}</h2>
                {kit.tagline && <p dir="auto" style={{ color: readable(kit.colours[0]), opacity: 0.8 }}>{kit.tagline}</p>}
                {kit.url && (
                  <a href={kit.url.startsWith("http") ? kit.url : `https://${kit.url}`} target="_blank" rel="noreferrer" style={{ color: readable(kit.colours[0]), opacity: 0.65 }}>
                    {kit.url}
                  </a>
                )}
              </div>
            </header>

            <section id="kit-colours">
              <h3>Colours</h3>
              <ul className="swatches">
                {kit.colours.map((colour) => (
                  <li key={colour}>
                    <button
                      onClick={() => {
                        void navigator.clipboard?.writeText(colour);
                        setCopied(colour);
                        setTimeout(() => setCopied(""), 1200);
                      }}
                      title="Copy"
                    >
                      <span className="swatch" style={{ background: colour }} />
                      <span className="swatch-hex">{copied === colour ? "Copied" : colour.toUpperCase()}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {part(/colou?rs?|palette/i) && <Markdown text={part(/colou?rs?|palette/i)} className="md kit-md" />}
            </section>

            <section id="kit-fonts">
              <h3>Fonts</h3>
              <ul className="specimens">
                {kit.fonts.map((font) => (
                  <li key={`${font.role}-${font.family}`}>
                    <p className="specimen" style={{ fontFamily: font.file && fonts[font.file] ? fonts[font.file] : undefined }} dir="auto">
                      {/hebrew|עברית/i.test(font.role) ? "אבגד הוזח 0123" : /hand/i.test(font.role) ? "Written by hand" : "Aa Bb Cc 0123"}
                    </p>
                    <p className="specimen-meta">
                      <strong>{font.family}</strong> · {font.role}
                      {font.file ? ` · ${font.file}` : " · system font"}
                    </p>
                  </li>
                ))}
              </ul>
              {part(/^fonts?/i) && <Markdown text={part(/^fonts?/i)} className="md kit-md" />}
            </section>

            <section id="kit-logos">
              <h3>Logo</h3>
              <ul className="logos">
                {kit.logos.map((logo) => (
                  <li key={logo}>
                    <div className="logo-tile checker">
                      <img src={brandFile(name, logo)} alt={logo} />
                    </div>
                    <span>{logo}</span>
                  </li>
                ))}
              </ul>
            </section>

            {[
              ["tone", /^tone/i],
              ["facts", /facts?/i],
              ["banned", /banned/i],
            ].map(([id, title]) => {
              const body = part(title as RegExp);
              return (
                <section key={id as string} id={`kit-${id}`}>
                  <h3>{SECTIONS.find(([key]) => key === id)![1]}</h3>
                  {body ? <Markdown text={body} className="md kit-md" /> : <p className="hint">Nothing in brand.md yet.</p>}
                </section>
              );
            })}

            <section id="kit-sources">
              <h3>Sources</h3>
              <pre className="sources">{kit.sources.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("#")).join("\n") || "No sources recorded."}</pre>
              {check && <pre className={`check-output${check.failed ? " failed" : ""}`}>{check.output}</pre>}
            </section>
          </article>
        )}
        {error && <p className="form-error">{error}</p>}
      </main>

      <Chat
        query={`brand=${encodeURIComponent(name)}`}
        title="ad-agent"
        subtitle={`brand kit · ${name}`}
        ask={ask}
        uploadTo={`brand:${name}`}
        placeholder={kit?.made ? "Refresh the colours, the logo changed…" : "Make the kit from…"}
        quick={kit?.made ? [{ label: "Refresh the brand", send: "Refresh the brand: check the sources and update what changed." }] : []}
        empty={<p>Ask for a refresh at whatever size you want: everything, the colours, or just the logo. Your edits to brand.md win.</p>}
      />

      {editing !== undefined && (
        <div className="overlay-veil" onPointerDown={(event) => event.target === event.currentTarget && setEditing(undefined)}>
          <div className="modal wide" role="dialog" aria-label="Edit brand.md">
            <header>
              <h2>brands/{name}/brand.md</h2>
            </header>
            <textarea className="code-edit" dir="auto" spellCheck={false} value={editing} onChange={(event) => setEditing(event.target.value)} />
            <footer>
              <button className="ghost" onClick={() => setEditing(undefined)}>
                Cancel
              </button>
              <button className="primary" onClick={() => void save()}>
                Save
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
