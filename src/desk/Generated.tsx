/**
 * An ad's generated media on the desk (spec.md §6.6), in two steps. First the stills: what each costs (nothing through
 * Codex), the money to approve for the ones through OpenRouter, and each made still to approve or send back with a
 * note. Then the videos: once every still a video starts from is approved, Make videos approves their cost and the
 * desk makes them. The agent can make stills within the approval, never a video.
 */
import { useState } from "react";
import { post, usePoll } from "./api";

type Estimate = { usd: number; basis: string } | { error: string };
type Review = { verdict: "approved" | "retake"; note?: string; at: string };
type Shot = {
  id: string;
  kind: "image" | "video";
  via?: "openrouter" | "codex" | "local";
  model: string;
  why: string;
  first?: string;
  estimate: Estimate;
  current: boolean;
  problems: string[];
  made?: { file: string; costUsd: number; made: string; via?: string; cropped?: string };
  review?: Review;
  waiting?: string[];
};
type Job = { id: string; shot: string; status: "running" | "done" | "failed"; message: string };
type GenState = {
  shots: Shot[];
  toMake: number | null;
  stillsToMake: number | null;
  videosToMake: number | null;
  approved: number;
  spent: number;
  jobs: Job[];
  connected: boolean;
  codex: boolean;
  error?: string;
};

const money = (usd: number) => `$${usd < 1 && usd > 0 ? usd.toFixed(3) : usd.toFixed(2)}`;
const cents = (usd: number) => Math.ceil(usd * 100 - 1e-9) / 100;
/** Real costs come back a little off the estimate (a still estimated at $0.05 cost $0.0504), so approvals carry 5%. */
const HEADROOM = 1.05;

function Cost({ shot }: { shot: Shot }) {
  const free = (via?: string) => (via === "codex" ? "plan" : via === "local" ? "this PC" : undefined);
  if (shot.current) return <span className="gen-cost">made · {free(shot.made!.via) ?? money(shot.made!.costUsd)}</span>;
  if ("error" in shot.estimate) return <span className="gen-cost">no price</span>;
  return <span className="gen-cost">{free(shot.via) ?? `~${money(shot.estimate.usd)}`}</span>;
}

function Problems({ shot, job }: { shot: Shot; job?: Job }) {
  return (
    <>
      {"error" in shot.estimate && <span className="gen-problem">{shot.estimate.error}</span>}
      {shot.problems.map((problem) => (
        <span key={problem} className="gen-problem">
          {problem}
        </span>
      ))}
      {job && <span className={job.status === "failed" ? "gen-problem" : "gen-job"}>{job.message}</span>}
    </>
  );
}

export function GeneratedPanel({ slug, onRetake }: { slug: string; onRetake?: (id: string, note: string) => Promise<unknown> }) {
  const [fast, setFast] = useState(false);
  const { data, reload } = usePoll<GenState>(`/api/gen?slug=${encodeURIComponent(slug)}`, fast ? 3000 : 10000);
  const [error, setError] = useState("");
  const [retaking, setRetaking] = useState<string>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const running = data?.jobs?.some((job) => job.status === "running") ?? false;
  if (running !== fast) setFast(running);
  if (!data || data.error || !data.shots?.length) return data?.error ? <p className="panel-error">gen.json: {data.error}</p> : null;

  const stills = data.shots.filter((shot) => shot.kind === "image");
  const videos = data.shots.filter((shot) => shot.kind === "video");
  const byId = new Map(data.shots.map((shot) => [shot.id, shot]));
  const jobOf = (id: string) => data.jobs.find((item) => item.shot === id && item.status !== "done");
  const left = data.approved - data.spent;
  // What's still to approve for an amount: nothing while what's left covers it, else that plus the headroom.
  const needFor = (usd: number | null) => (usd === null ? null : usd <= Math.max(0, left) + 1e-9 ? 0 : cents(usd * HEADROOM - Math.max(0, left)));
  const stillsNeed = needFor(data.stillsToMake);
  const videosNeed = needFor(data.videosToMake);
  const toMakeVideos = videos.filter((video) => !video.current);
  const waiting = [...new Set(toMakeVideos.flatMap((video) => video.waiting ?? []))];
  const videosRunning = toMakeVideos.some((video) => data.jobs.some((job) => job.shot === video.id && job.status === "running"));

  const act = (path: string, body: object) => {
    setError("");
    setBusy(true);
    return post(path, body)
      .then(reload, (failure) => setError(failure.message))
      .finally(() => setBusy(false));
  };
  const approveMoney = (usd: number, ask: string) => confirm(ask) && act("/api/gen/approve", { slug, usd });
  const review = (id: string, verdict: Review["verdict"], text = "") =>
    act("/api/gen/review", { slug, id, verdict, note: text }).then(async () => {
      if (verdict !== "retake" || !onRetake) return;
      await onRetake(id, text).catch((failure) => setError(failure.message));
    });
  const makeVideos = () => {
    const total = cents(data.approved + (videosNeed ?? 0));
    const ask = !data.videosToMake
      ? `Make ${toMakeVideos.length} video${toMakeVideos.length === 1 ? "" : "s"} on this PC? No money: each takes the GPU about 3½ minutes, one at a time. Close games and other heavy apps first.`
      : videosNeed && videosNeed > 0
        ? `Make ${toMakeVideos.length} video${toMakeVideos.length === 1 ? "" : "s"} for about ${money(data.videosToMake!)}? This approves ${money(videosNeed)} more (the estimate plus 5% for small price differences), so up to ${money(total)} in all on this ad. Retakes need another approval.`
        : `Make ${toMakeVideos.length} video${toMakeVideos.length === 1 ? "" : "s"} for about ${money(data.videosToMake ?? 0)}, from what's already approved?`;
    if (confirm(ask)) act("/api/gen/videos", { slug, usd: videosNeed && videosNeed > 0 ? total : undefined });
  };

  return (
    <section className="panel-section gen-panel">
      <h3>Generated media</h3>

      {stills.length > 0 && <h4>1 · Stills</h4>}
      <ul className="gen-shots">
        {stills.map((shot) => {
          const verdict = shot.review?.verdict;
          return (
            <li key={shot.id} title={shot.why} className={verdict === "approved" ? "approved" : verdict === "retake" ? "retake" : ""}>
              <div className="gen-shot-head">
                <b>{shot.id}</b>
                <span className="gen-kind">{shot.via === "codex" ? "Codex" : "still"}</span>
                <Cost shot={shot} />
              </div>
              {shot.via !== "codex" && <span className="gen-model">{shot.model}</span>}
              {shot.current && (
                <a href={`/ads/${slug}/${shot.made!.file}`} target="_blank" rel="noreferrer">
                  <img className="gen-thumb" src={`/ads/${slug}/${shot.made!.file}?${encodeURIComponent(shot.made!.made)}`} alt={shot.id} />
                </a>
              )}
              <Problems shot={shot} job={jobOf(shot.id)} />
              {shot.current && retaking !== shot.id && (
                <div className="gen-review">
                  {verdict === "approved" ? (
                    <span className="gen-ok">Approved</span>
                  ) : verdict === "retake" ? (
                    <span className="gen-job" dir="auto">Sent back{shot.review!.note ? `: ${shot.review!.note}` : ""}</span>
                  ) : (
                    <span className="gen-kind">Approve it before a video starts from it</span>
                  )}
                  {verdict !== "approved" && (
                    <button className="primary small" disabled={busy} onClick={() => review(shot.id, "approved")}>
                      Approve
                    </button>
                  )}
                  <button className="ghost small" disabled={busy} onClick={() => (setRetaking(shot.id), setNote(""))}>
                    Retake
                  </button>
                </div>
              )}
              {retaking === shot.id && (
                <form
                  className="gen-note"
                  onSubmit={(event) => {
                    event.preventDefault();
                    review(shot.id, "retake", note).then(() => setRetaking(undefined));
                  }}
                >
                  <textarea dir="auto" rows={3} autoFocus placeholder="What should change? The agent gets this, rewrites the prompt and makes it again." value={note} onChange={(event) => setNote(event.target.value)} />
                  <div className="gen-review">
                    <button className="primary small" disabled={busy || !note.trim()}>
                      Send to the agent
                    </button>
                    <button type="button" className="ghost small" onClick={() => setRetaking(undefined)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      {stillsNeed !== null && stillsNeed > 0 && (
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            approveMoney(
              cents(data.approved + stillsNeed),
              `Approve ${money(stillsNeed)} more for ${slug}'s stills? That's the estimate of ${money(data.stillsToMake!)} plus 5% for small price differences. No video is made until you approve the stills and press Make videos.`,
            )
          }
        >
          Approve {money(stillsNeed)} for stills
        </button>
      )}

      {videos.length > 0 && <h4>2 · Videos</h4>}
      <ul className="gen-shots">
        {videos.map((shot) => {
          const first = shot.first ? [...byId.values()].find((still) => still.kind === "image" && shot.first!.replace(/\\/g, "/").startsWith(`generated/${still.id}.`)) : undefined;
          return (
            <li key={shot.id} title={shot.why}>
              <div className="gen-shot-head">
                <b>{shot.id}</b>
                <span className="gen-kind">{shot.via === "local" ? "video · this PC" : "video"}</span>
                <Cost shot={shot} />
              </div>
              <span className="gen-model">
                {shot.model}
                {first ? ` · from ${first.id}` : ""}
              </span>
              {!shot.current && (shot.waiting?.length ? <span className="gen-kind">Waiting on {shot.waiting.join(", ")}</span> : <span className="gen-ok">Its stills are approved</span>)}
              <Problems shot={shot} job={jobOf(shot.id)} />
            </li>
          );
        })}
      </ul>
      {toMakeVideos.length > 0 && (
        <button className="primary" disabled={busy || videosRunning || waiting.length > 0 || !data.connected || data.videosToMake === null} onClick={makeVideos}>
          {videosRunning ? "Making the videos" : `Make ${toMakeVideos.length === 1 ? "the video" : `${toMakeVideos.length} videos`}${data.videosToMake === 0 ? " · this PC" : data.videosToMake !== null ? ` · ~${money(data.videosToMake)}` : ""}`}
        </button>
      )}
      {toMakeVideos.length > 0 && waiting.length > 0 && <p className="panel-empty">Approve {waiting.join(", ")} first. Nothing is paid for on a frame you haven't seen.</p>}

      <dl className="gen-money">
        <dt>To make</dt>
        <dd>{data.toMake === null ? "unknown" : money(data.toMake)}</dd>
        <dt>Approved</dt>
        <dd>{money(data.approved)}</dd>
        <dt>Spent</dt>
        <dd>{money(data.spent)}</dd>
      </dl>
      {!data.connected && <p className="panel-empty">Connect OpenRouter in Settings before anything can be made through it.</p>}
      {stills.some((shot) => shot.via === "codex") && !data.codex && <p className="panel-empty">Codex isn't found. Install it and log in with ChatGPT, or set its path in Settings.</p>}
      {left > 0.005 && (
        <button className="ghost small" disabled={busy} onClick={() => approveMoney(cents(data.spent), `Take back the ${money(left)} not spent yet? Nothing more can be made until you approve again.`)}>
          Take back {money(left)}
        </button>
      )}
      {error && <p className="panel-error">{error}</p>}
    </section>
  );
}
