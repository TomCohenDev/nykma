/**
 * Publishing (spec.md §10.12): the Publishing page, where you set up each provider, connect accounts and follow your
 * posts, and the publish dialog on an ad, where you pick accounts, check each caption and approve. Approving is the
 * only way a post is made, and the desk posts it; an agent can't.
 */
import { useEffect, useMemo, useState } from "react";
import { Shell } from "./Dashboard";
import { CloseIcon } from "./icons";
import { PlatformIcon, PlatformStack } from "./social";
import "./publish.css";
import { post, useEscape, usePoll, type State } from "./api";
import { PLATFORM_INFO } from "../../scripts/lib/publish/info.ts";
import type { draft, publishState } from "../../scripts/lib/publish/index.ts";
import type { AccountView, Job, Option, Platform } from "../../scripts/lib/publish/types.ts";

type Go = (hash: string) => void;
type PublishState = ReturnType<typeof publishState>;
type ProviderView = PublishState["providers"][number];
type Draft = ReturnType<typeof draft>;

const STATE_TEXT: Record<Job["state"], string> = {
  approved: "Waiting",
  running: "Posting",
  scheduled: "Scheduled",
  published: "Posted",
  inbox: "In TikTok's inbox",
  overdue: "Overdue",
  changed: "File changed",
  failed: "Failed",
  cancelled: "Cancelled",
};
const TONE: Record<Job["state"], string> = {
  approved: "wait", running: "wait", scheduled: "wait", published: "ok", inbox: "ok", overdue: "bad", changed: "bad", failed: "bad", cancelled: "off",
};

const when = (ms?: number) => (ms ? new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const money = (usd: number) => `$${usd.toFixed(usd < 0.1 ? 3 : 2)}`;

function copyText(text: string) {
  void navigator.clipboard?.writeText(text);
}

/* ── The Publishing page ──────────────────────────────────────────────────────────────────────────── */

const TAB_KEY = "nykma.publish.tab";
type Tab = "posts" | "accounts" | "connect";
const OPEN_STATES: Job["state"][] = ["approved", "running", "scheduled", "overdue", "failed", "changed"];
const NEEDS_YOU: Job["state"][] = ["overdue", "failed", "changed"];

/** One provider, opened: what it covers, the steps to set it up, its fields, and Connect. */
function ProviderDetail({ p, onChange, onClose }: { p: ProviderView; onChange: () => void; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(p.fields.map((field) => [field.key, field.value ?? ""])));
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string }>();
  const [copied, setCopied] = useState(false);
  const fieldsAuth = p.auth === "fields";

  const save = async () => {
    setBusy("Saving");
    setNote(undefined);
    try {
      const reply = await post<{ connected: string[] }>("/api/publish/provider", { provider: p.id, values });
      if (fieldsAuth) {
        setNote({ ok: true, text: `Connected: ${reply.connected.join(", ")}.` });
        setValues((all) => Object.fromEntries(Object.entries(all).map(([key, value]) => [key, p.fields.find((field) => field.key === key)?.secret ? "" : value])));
      } else setNote({ ok: true, text: "Saved. Now press Connect." });
      onChange();
    } catch (failure) {
      setNote({ ok: false, text: (failure as Error).message });
    } finally {
      setBusy("");
    }
  };

  /** Opens the platform's login in a new tab, then waits for it to come back to the desk's callback. */
  const connect = async () => {
    setNote(undefined);
    let started: { url: string; state: string };
    try {
      started = await post("/api/publish/connect", { provider: p.id });
    } catch (failure) {
      return setNote({ ok: false, text: (failure as Error).message });
    }
    window.open(started.url, "_blank", "noopener");
    setBusy("Waiting for you to log in, in the tab that opened");
    const until = Date.now() + 15 * 60_000;
    const poll = async () => {
      const reply = await fetch(`/api/publish/login?state=${encodeURIComponent(started.state)}`).then((res) => res.json()).catch(() => ({ done: false }));
      if (reply.done) {
        setBusy("");
        setNote(reply.error ? { ok: false, text: reply.error } : { ok: true, text: `Connected: ${(reply.names ?? []).join(", ")}.${reply.note ? ` ${reply.note}` : ""}` });
        onChange();
      } else if (Date.now() < until) setTimeout(poll, 1500);
      else setBusy("");
    };
    void poll();
  };

  const remove = async () => {
    if (!confirm(`Forget ${p.label}'s app credentials? Connected accounts stay until you remove them.`)) return;
    await post("/api/publish/provider/remove", { provider: p.id }).catch(() => {});
    onChange();
  };

  return (
    <section className="pb-detail" aria-label={p.label}>
      <header className="pb-detail-head">
        <PlatformStack platforms={p.platforms} size={36} max={6} />
        <div>
          <h3>{p.label}</h3>
          <p>{p.platforms.map((platform) => PLATFORM_INFO[platform].label).join(" · ")}</p>
        </div>
        <ProviderStatus p={p} />
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </header>
      <p className="pb-blurb">{p.blurb}</p>
      {p.caveat && <p className="pb-caveat">{p.caveat}</p>}
      <div className="pb-detail-grid">
        <div>
          <h4>Set it up</h4>
          <ol className="pb-steps">
            {p.setup.map((step, i) => (
              <li key={i}>
                <span>{i + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
          {p.console && (
            <a className="pb-console" href={p.console} target="_blank" rel="noreferrer">
              Open {p.console.replace(/^https?:\/\//, "").split("/")[0]} ↗
            </a>
          )}
        </div>
        <form
          className="pb-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h4>{fieldsAuth ? "Connect" : "Your app"}</h4>
          {p.redirect && (
            <label className="pb-field">
              <span>Redirect URI</span>
              <span className="pb-copy">
                <code>{p.redirect}</code>
                <button
                  type="button"
                  className="ghost small"
                  onClick={() => {
                    copyText(p.redirect!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </span>
            </label>
          )}
          {p.fields.map((field) => (
            <label key={field.key} className="pb-field">
              <span>
                {field.label}
                {field.optional ? <small> optional</small> : null}
                {field.secret && field.set && <small className="pb-set"> saved ··{field.last4}</small>}
              </span>
              <input
                className="pb-input"
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                placeholder={field.secret && field.set ? "Paste a new one to replace it" : (field.placeholder ?? "")}
                value={values[field.key] ?? ""}
                onChange={(event) => setValues((all) => ({ ...all, [field.key]: event.target.value }))}
              />
              {field.help && <small className="pb-help">{field.help}</small>}
            </label>
          ))}
          <div className="pb-actions">
            <button className={fieldsAuth ? "primary" : "ghost"} disabled={Boolean(busy)}>
              {fieldsAuth ? (p.accounts ? "Connect again" : "Connect") : "Save"}
            </button>
            {!fieldsAuth && (
              <button type="button" className="primary" disabled={!p.ready || Boolean(busy)} onClick={() => void connect()} title={p.ready ? undefined : "Save the app's details first"}>
                {p.accounts ? "Connect another account" : "Connect an account"}
              </button>
            )}
            {!fieldsAuth && p.fields.some((field) => field.set) && (
              <button type="button" className="ghost small danger" onClick={() => void remove()}>
                Forget app
              </button>
            )}
          </div>
          {busy && (
            <p className="pb-busy">
              <span className="spinner" /> {busy}
            </p>
          )}
          {note && <p className={`pb-note ${note.ok ? "ok" : "bad"}`}>{note.text}</p>}
        </form>
      </div>
    </section>
  );
}

function ProviderStatus({ p }: { p: ProviderView }) {
  const text = p.accounts ? `${p.accounts} connected` : p.auth === "fields" ? "Not connected" : p.ready ? "App ready" : "Not set up";
  return <span className={`pb-pill ${p.accounts ? "ok" : p.ready ? "mid" : "off"}`}>{text}</span>;
}

function JobRow({ job, accounts, go, onChange }: { job: Job; accounts: AccountView[]; go: Go; onChange: () => void }) {
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const account = accounts.find((item) => item.id === job.accountId);
  const act = (action: string) =>
    post("/api/publish/job", { id: job.id, action }).then(
      () => (setError(""), onChange()),
      (failure) => setError(failure.message),
    );
  const time = job.state === "published" || job.state === "inbox" ? job.updated : (job.at ?? job.approvedAt);
  const info = PLATFORM_INFO[job.platform];
  return (
    <li className={`pb-job ${TONE[job.state]}${open ? " open" : ""}`}>
      <div className="pb-job-main">
        <PlatformIcon platform={job.platform} tile size={34} title={info.label} />
        <div className="pb-job-text">
          <div className="pb-job-title">
            <b>{account?.name ?? job.accountId.split(":").pop()}</b>
            <span>{info.label}</span>
          </div>
          <div className="pb-job-sub">
            <button className="link" onClick={() => go(`#/p/${encodeURIComponent(job.folder)}`)}>
              {job.slug}
            </button>
            <span>{job.file}</span>
          </div>
        </div>
        <span className={`pb-state ${TONE[job.state]}`}>{STATE_TEXT[job.state]}</span>
        <span className="pb-when">{when(time)}</span>
        <div className="pb-job-actions">
          {job.url && (
            <a className="ghost small button-link" href={job.url} target="_blank" rel="noreferrer">
              View ↗
            </a>
          )}
          {["overdue", "failed"].includes(job.state) && (
            <button className="primary small" onClick={() => confirm(`Post it to ${account?.label ?? info.label} now?`) && act("now")}>
              Post now
            </button>
          )}
          {["approved", "overdue", "failed", "changed"].includes(job.state) && (
            <button className="ghost small" onClick={() => act("cancel")}>
              Cancel
            </button>
          )}
          {!["approved", "running"].includes(job.state) && (
            <button className="ghost small" onClick={() => act("remove")}>
              Clear
            </button>
          )}
          <button className="ghost small pb-more" onClick={() => setOpen((on) => !on)} aria-expanded={open} title="The log">
            {open ? "▴" : "▾"}
          </button>
        </div>
      </div>
      {job.error && ["failed", "changed", "overdue", "approved"].includes(job.state) && <p className="pb-job-error">{job.error}</p>}
      {open && (
        <div className="pb-job-more">
          {job.url && (
            <a href={job.url} target="_blank" rel="noreferrer" className="pb-url">
              {job.url}
            </a>
          )}
          <ul className="pb-log">
            {job.log.map((line, i) => (
              <li key={i}>
                <time>{new Date(line.at).toLocaleTimeString()}</time> {line.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </li>
  );
}

export function PublishPage({ state, go }: { state: State; go: Go }) {
  const { data, reload } = usePoll<PublishState>("/api/publish", 4000);
  const [tab, setTabState] = useState<Tab | null>(() => {
    try {
      return (localStorage.getItem(TAB_KEY) as Tab | null) ?? null;
    } catch {
      return null;
    }
  });
  const [filter, setFilter] = useState<"all" | "upcoming" | "attention" | "done">("all");
  const [provider, setProvider] = useState<string>();
  const setTab = (next: Tab) => {
    setTabState(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      /* the tab lasts this visit */
    }
  };

  if (!data)
    return (
      <Shell page="publish" state={state} go={go}>
        <header className="page-head">
          <h1>Publishing</h1>
        </header>
        <span className="spinner big" />
      </Shell>
    );

  const open = data.jobs.filter((job) => OPEN_STATES.includes(job.state));
  const attention = data.jobs.filter((job) => NEEDS_YOU.includes(job.state));
  const upcoming = data.jobs.filter((job) => ["approved", "scheduled", "running"].includes(job.state));
  const done = data.jobs.filter((job) => !open.includes(job));
  const next = upcoming.filter((job) => job.at).sort((a, b) => (a.at ?? 0) - (b.at ?? 0))[0];
  const shownTab: Tab = tab ?? (data.jobs.length ? "posts" : data.accounts.length ? "accounts" : "connect");
  const connectedPlatforms = [...new Set(data.accounts.map((account) => account.platform))];
  const jobs = filter === "upcoming" ? upcoming : filter === "attention" ? attention : filter === "done" ? done : [...open, ...done];
  const selected = data.providers.find((p) => p.id === provider);

  const remove = (account: AccountView) => {
    if (!confirm(`Disconnect ${account.label}? Posts waiting for it will fail.`)) return;
    void post("/api/publish/account/remove", { id: account.id }).then(reload);
  };

  return (
    <Shell page="publish" state={state} go={go}>
      <div className="pb">
        <header className="pb-head">
          <div>
            <h1>Publishing</h1>
            <p>Connect your accounts once, then publish an ad from its page. The desk posts only what you approve there, at the time you pick; an agent can't approve anything. Logins and app secrets stay in the desk's key store on this PC.</p>
          </div>
          {connectedPlatforms.length > 0 && (
            <div className="pb-connected" title="Connected">
              {connectedPlatforms.map((platform) => (
                <PlatformIcon key={platform} platform={platform} tile size={30} title={PLATFORM_INFO[platform].label} />
              ))}
            </div>
          )}
        </header>

        <div className="pb-stats">
          <button className={`pb-stat${attention.length ? " bad" : ""}`} onClick={() => (setTab("posts"), setFilter("attention"))}>
            <span>Needs you</span>
            <b>{attention.length}</b>
            <small>{attention.length ? "overdue, failed or changed" : "nothing waiting on you"}</small>
          </button>
          <button className="pb-stat" onClick={() => (setTab("posts"), setFilter("upcoming"))}>
            <span>Coming up</span>
            <b>{upcoming.length}</b>
            <small>{next ? `next ${when(next.at)}` : "nothing scheduled"}</small>
          </button>
          <button className="pb-stat" onClick={() => (setTab("posts"), setFilter("done"))}>
            <span>Posted</span>
            <b>{data.jobs.filter((job) => job.state === "published" || job.state === "inbox").length}</b>
            <small>kept until you clear them</small>
          </button>
          <button className="pb-stat" onClick={() => setTab("accounts")}>
            <span>Accounts</span>
            <b>{data.accounts.length}</b>
            <small>{data.accounts.some((account) => account.needsReconnect) ? "one needs connecting again" : `on ${connectedPlatforms.length} platform${connectedPlatforms.length === 1 ? "" : "s"}`}</small>
          </button>
        </div>

        <nav className="pb-tabs" role="tablist">
          {(
            [
              ["posts", "Posts", data.jobs.length],
              ["accounts", "Accounts", data.accounts.length],
              ["connect", "Connect", data.providers.filter((p) => p.accounts).length],
            ] as [Tab, string, number][]
          ).map(([id, name, count]) => (
            <button key={id} role="tab" aria-selected={shownTab === id} className={shownTab === id ? "on" : ""} onClick={() => setTab(id)}>
              {name}
              {count > 0 && <span>{count}</span>}
            </button>
          ))}
        </nav>

        {shownTab === "posts" && (
          <section className="pb-panel">
            <div className="pb-filters">
              {(
                [
                  ["all", "All"],
                  ["upcoming", "Coming up"],
                  ["attention", "Needs you"],
                  ["done", "Done"],
                ] as const
              ).map(([id, name]) => (
                <button key={id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>
                  {name}
                </button>
              ))}
            </div>
            {!data.jobs.length ? (
              <div className="pb-empty">
                <b>Nothing posted yet</b>
                <p>Open an ad and press Publish. Its posts show here, from approved to live.</p>
              </div>
            ) : !jobs.length ? (
              <div className="pb-empty">
                <p>No posts here.</p>
              </div>
            ) : (
              <ul className="pb-jobs">
                {jobs.map((job) => (
                  <JobRow key={job.id} job={job} accounts={data.accounts} go={go} onChange={reload} />
                ))}
              </ul>
            )}
            <p className="pb-foot">
              YouTube, Facebook, Mastodon, Tumblr and Upload-Post hold a scheduled post themselves, so the PC can be off at its time. The rest are posted by the desk: keep it running (bun run dev) until then. A time missed while it was off waits for you as Overdue, so nothing posts hours late.
            </p>
          </section>
        )}

        {shownTab === "accounts" && (
          <section className="pb-panel">
            <div className="pb-accounts">
              {data.accounts.map((account) => {
                const soon = account.reconnectBy && account.reconnectBy - Date.now() < 7 * 86_400_000;
                return (
                  <article key={account.id} className={`pb-account${account.needsReconnect ? " bad" : ""}`}>
                    <PlatformIcon platform={account.platform} tile size={42} title={PLATFORM_INFO[account.platform].label} />
                    <div className="pb-account-text">
                      <b dir="auto">{account.name}</b>
                      <span>
                        {PLATFORM_INFO[account.platform].label}
                        {account.handle && ` · @${account.handle.replace(/^@/, "")}`}
                        {account.provider === "uploadpost" && " · through Upload-Post"}
                      </span>
                      {account.needsReconnect ? (
                        <span className="pb-pill bad">Connect again: {account.needsReconnect}</span>
                      ) : account.reconnectBy ? (
                        <span className={`pb-pill ${soon ? "mid" : "ok"}`}>Connect again by {new Date(account.reconnectBy).toLocaleDateString()}</span>
                      ) : (
                        <span className="pb-pill ok">Connected</span>
                      )}
                    </div>
                    <button className="ghost small danger" onClick={() => remove(account)}>
                      Disconnect
                    </button>
                  </article>
                );
              })}
              <button className="pb-account add" onClick={() => setTab("connect")}>
                <span className="pb-add-mark">+</span>
                <div className="pb-account-text">
                  <b>Connect an account</b>
                  <span>YouTube, Facebook, Instagram, TikTok, LinkedIn, X and more</span>
                </div>
              </button>
            </div>
          </section>
        )}

        {shownTab === "connect" && (
          <section className="pb-panel">
            <p className="pb-intro">
              Each platform needs an app of your own, registered once in its developer console, so your posts don't depend on anyone else's approval; each one's steps say where to click. Bluesky, Mastodon, Telegram and Discord need only a password, token or webhook. Upload-Post is a paid service for the networks an app of your own can't post to publicly: TikTok, Threads and Pinterest.
            </p>
            <div className="pb-providers">
              {data.providers.map((p) => (
                <button key={p.id} className={`pb-provider${provider === p.id ? " on" : ""}${p.accounts ? " connected" : ""}`} onClick={() => setProvider(provider === p.id ? undefined : p.id)} aria-expanded={provider === p.id}>
                  <PlatformStack platforms={p.platforms} size={30} max={p.platforms.length > 4 ? 3 : 4} />
                  <b>{p.label}</b>
                  <span className="pb-provider-for">{p.platforms.length > 2 ? `${p.platforms.length} networks` : p.platforms.length === 1 && PLATFORM_INFO[p.platforms[0]].label === p.label ? (p.auth === "fields" ? "A token or password" : "An app of your own") : p.platforms.map((platform) => PLATFORM_INFO[platform].label).join(", ")}</span>
                  <ProviderStatus p={p} />
                </button>
              ))}
            </div>
            {selected && <ProviderDetail key={selected.id} p={selected} onChange={reload} onClose={() => setProvider(undefined)} />}
          </section>
        )}
      </div>
    </Shell>
  );
}

/* ── The publish dialog on an ad ──────────────────────────────────────────────────────────────────── */

type PostDraft = { file: string; thumbnail?: string; caption: string; title?: string; options: Record<string, string | boolean>; specs?: Option[]; optionsError?: string };

function bestFile(platform: Platform, videos: Draft["videos"]) {
  const order = PLATFORM_INFO[platform].ratios;
  // The main take first: its id has no take letter after the slug.
  const sorted = [...videos].sort((a, b) => order.indexOf(a.ratio as never) - order.indexOf(b.ratio as never) || a.id.length - b.id.length);
  return sorted.find((video) => order.includes(video.ratio as never)) ?? sorted[0];
}

function coverFor(file: string, covers: string[]) {
  const id = file.replace(/\.mp4$/, "");
  return covers.find((cover) => cover === `${id}-thumbnail.jpg`) ?? covers.find((cover) => cover === `${id}-thumbnail.png`);
}

function OptionInput({ option, value, onChange }: { option: Option; value: string | boolean | undefined; onChange: (value: string | boolean) => void }) {
  if (option.type === "toggle")
    return (
      <label className="check pub-option" title={option.help}>
        <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
        {option.label}
        {option.help && <small className="note"> {option.help}</small>}
      </label>
    );
  if (option.type === "select")
    return (
      <label className="pub-option">
        <span>{option.label}</span>
        <select value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}>
          {(value === undefined || value === "") && <option value="">Choose</option>}
          {option.choices?.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        {option.help && <small className="note">{option.help}</small>}
      </label>
    );
  return (
    <label className="pub-option">
      <span>{option.label}</span>
      <input type="text" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />
      {option.help && <small className="note">{option.help}</small>}
    </label>
  );
}

/** One account's post: which file, the caption and title, and the platform's own choices. */
function PostCard({ account, draft, value, onChange, onRemove }: { account: AccountView; draft: Draft; value: PostDraft; onChange: (next: PostDraft) => void; onRemove: () => void }) {
  const info = PLATFORM_INFO[account.platform];
  const over = value.caption.length > info.captionLimit;
  const skip = draft.copy[account.platform]?.skip;
  const shown = (option: Option) => !option.when || value.options[option.when.key] === option.when.is;
  return (
    <div className="pub-card">
      <header>
        <span className="pb-card-who">
          <PlatformIcon platform={account.platform} tile size={24} />
          <b dir="auto">{account.name}</b>
          <small>{info.label}</small>
        </span>
        <button className="icon-button" onClick={onRemove} aria-label="Don't post here">
          <CloseIcon size={12} />
        </button>
      </header>
      {skip && <p className="pub-error">post.md says: {skip}</p>}
      <div className="pub-card-row">
        <label className="pub-option">
          <span>Video</span>
          <select value={value.file} onChange={(event) => onChange({ ...value, file: event.target.value, thumbnail: coverFor(event.target.value, draft.covers) })}>
            {draft.videos.map((video) => (
              <option key={video.file} value={video.file}>
                {video.file} · {(video.bytes / 1e6).toFixed(0)} MB
              </option>
            ))}
          </select>
        </label>
        {draft.covers.length > 0 && (
          <label className="pub-option">
            <span>Cover</span>
            <select value={value.thumbnail ?? ""} onChange={(event) => onChange({ ...value, thumbnail: event.target.value || undefined })}>
              <option value="">None</option>
              {draft.covers.map((cover) => (
                <option key={cover} value={cover}>
                  {cover}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {info.titleLimit && (
        <label className="pub-option">
          <span>
            Title <small className={`note ${(value.title?.length ?? 0) > info.titleLimit ? "over" : ""}`}>{value.title?.length ?? 0}/{info.titleLimit}</small>
          </span>
          <input type="text" dir="auto" value={value.title ?? ""} onChange={(event) => onChange({ ...value, title: event.target.value })} />
        </label>
      )}
      <label className="pub-option">
        <span>
          Caption <small className={`note ${over ? "over" : ""}`}>{value.caption.length}/{info.captionLimit}</small>
          {draft.copy[account.platform]?.section && <small className="note"> from post.md's {draft.copy[account.platform]!.section}</small>}
        </span>
        <textarea dir="auto" rows={Math.min(10, Math.max(3, value.caption.split("\n").length + 1))} value={value.caption} onChange={(event) => onChange({ ...value, caption: event.target.value })} />
      </label>
      {value.optionsError && <p className="pub-error">{value.optionsError}</p>}
      {!value.specs && !value.optionsError && <span className="spinner" />}
      {value.specs?.filter(shown).map((option) => (
        <OptionInput key={option.key} option={option} value={value.options[option.key]} onChange={(next) => onChange({ ...value, options: { ...value.options, [option.key]: next } })} />
      ))}
    </div>
  );
}

/** Posting by hand where there's no account: the caption to copy, the file to drag, the upload page. */
function ByHand({ folder, draft, platform, videos }: { folder: string; draft: Draft; platform: Platform; videos: Draft["videos"] }) {
  const info = PLATFORM_INFO[platform];
  const file = bestFile(platform, videos);
  const copy = draft.copy[platform];
  const [copied, setCopied] = useState(false);
  return (
    <div className="pub-hand">
      <PlatformIcon platform={platform} tile size={22} />
      <b>{info.label}</b>
      <button
        className="ghost small"
        disabled={!copy?.caption}
        onClick={() => {
          copyText(copy?.title ? `${copy.title}\n\n${copy.caption}` : copy?.caption ?? "");
          setCopied(true);
        }}
      >
        {copied ? "Copied" : "Copy caption"}
      </button>
      {file && (
        <button className="ghost small" onClick={() => void post("/api/publish/reveal", { folder, file: file.file }).catch(() => {})}>
          Show {file.file}
        </button>
      )}
      {info.uploadUrl && (
        <a className="ghost small button-link" href={info.uploadUrl} target="_blank" rel="noreferrer">
          Open {info.label} ↗
        </a>
      )}
    </div>
  );
}

export function PublishDialog({ folder, go, onClose }: { folder: string; go: Go; onClose: () => void }) {
  useEscape(onClose);
  const [state, setState] = useState<PublishState>();
  const [draft, setDraft] = useState<Draft>();
  const [loadError, setLoadError] = useState("");
  const [posts, setPosts] = useState<Record<string, PostDraft>>({});
  const [timing, setTiming] = useState<"now" | "later">("now");
  const [at, setAt] = useState(() => {
    const soon = new Date(Date.now() + 60 * 60_000);
    soon.setMinutes(0, 0, 0);
    return new Date(soon.getTime() - soon.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<number>();

  useEffect(() => {
    Promise.all([fetch("/api/publish").then((res) => res.json()), fetch(`/api/publish/draft?folder=${encodeURIComponent(folder)}`).then((res) => res.json())]).then(
      ([publish, made]) => {
        if (made.error) return setLoadError(made.error);
        setState(publish);
        setDraft(made);
      },
      () => setLoadError("Publishing didn't load."),
    );
  }, [folder]);

  const accounts = state?.accounts ?? [];
  const providerOf = (account: AccountView) => state?.providers.find((p) => p.id === account.provider);

  const toggle = (account: AccountView) => {
    if (!draft) return;
    if (posts[account.id]) {
      const { [account.id]: _gone, ...rest } = posts;
      return setPosts(rest);
    }
    const file = bestFile(account.platform, draft.videos);
    if (!file) return;
    const copy = draft.copy[account.platform] ?? { caption: "" };
    const fresh: PostDraft = { file: file.file, thumbnail: coverFor(file.file, draft.covers), caption: copy.caption, title: PLATFORM_INFO[account.platform].titleLimit ? copy.title ?? "" : undefined, options: {} };
    setPosts((all) => ({ ...all, [account.id]: fresh }));
    fetch(`/api/publish/options?account=${encodeURIComponent(account.id)}`)
      .then((res) => res.json())
      .then((reply) => {
        const specs: Option[] = reply.options ?? [];
        const defaults: Record<string, string | boolean> = {};
        for (const option of specs) if (option.default !== undefined) defaults[option.key] = option.default;
        if (specs.some((option) => option.key === "ai")) defaults.ai = draft.aiGenerated;
        setPosts((all) => (all[account.id] ? { ...all, [account.id]: { ...all[account.id], specs, options: { ...defaults, ...all[account.id].options }, optionsError: reply.error } } : all));
      })
      .catch(() => setPosts((all) => (all[account.id] ? { ...all, [account.id]: { ...all[account.id], specs: [], optionsError: "Its options didn't load." } } : all)));
  };

  const chosen = accounts.filter((account) => posts[account.id]);
  const time = timing === "later" ? new Date(at).getTime() : undefined;
  const cost = chosen.reduce((sum, account) => {
    const priced = PLATFORM_INFO[account.platform].cost;
    return sum + (priced && providerOf(account)?.platformCost !== false ? priced(posts[account.id].caption) : 0);
  }, 0);
  const holds = chosen.filter((account) => {
    const window = providerOf(account)?.nativeSchedule ?? PLATFORM_INFO[account.platform].nativeSchedule;
    return time && window && time - Date.now() >= window.minMinutes * 60_000;
  });
  const connected = new Set(accounts.map((account) => account.platform));
  const byHand = useMemo(() => (Object.keys(PLATFORM_INFO) as Platform[]).filter((platform) => !connected.has(platform) && PLATFORM_INFO[platform].uploadUrl), [accounts.length]);

  const approve = async () => {
    setError("");
    const names = chosen.map((account) => account.label).join("\n");
    const ask = timing === "now" ? `Post this publicly now to:\n\n${names}${cost ? `\n\nX charges ${money(cost)}.` : ""}` : `Schedule this for ${when(time)} to:\n\n${names}${cost ? `\n\nX charges ${money(cost)}.` : ""}`;
    if (!confirm(ask)) return;
    setBusy(true);
    try {
      const reply = await post<{ jobs: Job[] }>("/api/publish/approve", {
        folder,
        posts: chosen.map((account) => {
          const value = posts[account.id];
          return { accountId: account.id, file: value.file, thumbnail: value.thumbnail, caption: value.caption, title: value.title, options: value.options, at: time };
        }),
      });
      setDone(reply.jobs.length);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay-veil" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal wide pub-dialog" role="dialog" aria-label="Publish">
        <header>
          <h2>Publish {draft?.slug ?? ""}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        <div className="pub-dialog-body">
          {loadError && <p className="form-error">{loadError}</p>}
          {!loadError && (!state || !draft) && <span className="spinner big" />}
          {done !== undefined && (
            <div className="pub-done">
              <p>
                <b>Approved {done} post{done > 1 ? "s" : ""}.</b> {timing === "now" ? "The desk is posting now." : `They go out ${when(time)}.`}
              </p>
              <button className="primary" onClick={() => go("#/publish")}>
                Follow them on the Publishing page
              </button>
            </div>
          )}
          {state && draft && done === undefined && (
            <>
              {!draft.videos.length && <p className="form-error">There's no MP4 in the folder yet. Render the ad first.</p>}
              {!draft.hasPost && <p className="note">This ad has no post.md, so the captions start empty.</p>}
              <h3 className="pub-sub">Post to</h3>
              {!accounts.length ? (
                <p className="note">
                  No accounts connected yet.{" "}
                  <button className="link" onClick={() => go("#/publish")}>
                    Connect them on the Publishing page
                  </button>
                  .
                </p>
              ) : (
                <div className="pb-pick">
                  {accounts.map((account) => (
                    <label key={account.id} className={`pb-pick-item${posts[account.id] ? " on" : ""}${account.needsReconnect ? " off" : ""}`} title={account.needsReconnect ?? account.label}>
                      <input type="checkbox" disabled={Boolean(account.needsReconnect) || !draft.videos.length} checked={Boolean(posts[account.id])} onChange={() => toggle(account)} />
                      <PlatformIcon platform={account.platform} tile size={26} />
                      <span>
                        <b dir="auto">{account.name}</b>
                        <small>{account.needsReconnect ? "connect again first" : PLATFORM_INFO[account.platform].label}</small>
                      </span>
                      <i className="pb-check" />
                    </label>
                  ))}
                </div>
              )}
              {chosen.map((account) => (
                <PostCard
                  key={account.id}
                  account={account}
                  draft={draft}
                  value={posts[account.id]}
                  onChange={(next) => setPosts((all) => ({ ...all, [account.id]: next }))}
                  onRemove={() => toggle(account)}
                />
              ))}
              {byHand.length > 0 && (
                <details className="pub-byhand">
                  <summary>Post by hand elsewhere</summary>
                  <p className="note">For a platform with no account connected here: copy the caption, drag the file in, post.</p>
                  {byHand.map((platform) => (
                    <ByHand key={platform} folder={folder} draft={draft} platform={platform} videos={draft.videos} />
                  ))}
                </details>
              )}
            </>
          )}
        </div>
        {state && draft && done === undefined && (
          <footer className="pub-footer">
            <div className="pub-when-pick">
              <label className="check">
                <input type="radio" name="timing" checked={timing === "now"} onChange={() => setTiming("now")} /> Now
              </label>
              <label className="check">
                <input type="radio" name="timing" checked={timing === "later"} onChange={() => setTiming("later")} /> At
              </label>
              <input type="datetime-local" value={at} disabled={timing === "now"} onChange={(event) => setAt(event.target.value)} />
            </div>
            <div className="pub-summary note">
              {cost > 0 && <span>X charges {money(cost)}. </span>}
              {timing === "later" && chosen.length > 0 && (
                <span>
                  {holds.length === chosen.length
                    ? "Each platform holds it, so the PC can be off then."
                    : holds.length
                      ? `${holds.map((account) => PLATFORM_INFO[account.platform].label).join(", ")} hold${holds.length === 1 ? "s" : ""} it; the desk posts the rest, so keep it running then.`
                      : "The desk posts these, so keep it running then."}
                </span>
              )}
            </div>
            {error && <p className="form-error">{error}</p>}
            <button className="primary" disabled={!chosen.length || busy || chosen.some((account) => !posts[account.id].specs)} onClick={() => void approve()}>
              {busy ? "Checking" : timing === "now" ? `Approve and post (${chosen.length})` : `Approve and schedule (${chosen.length})`}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
