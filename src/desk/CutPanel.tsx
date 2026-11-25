import { useEffect, useState } from "react";
import { post } from "./api";

/** A try of a line in the take, as take.json lists them. */
type Try = { n: number; from: number; to: number; complete: boolean; text: string };
type CutScene = { id: string; line: string; frames: number; parts: { in: number; out: number; jump?: number | null }[]; words: { t: string }[]; try?: { n: number; of: number; complete: boolean }; tries?: Try[] };
type Left = { from: number; to: number; text: string; why: string };
export type CutState = {
  take: { fps: number; frames: number; scenes: CutScene[]; missing?: string[]; left?: Left[]; clip: { name: string } };
  lines: { id: string; line: string; pick?: number }[];
  report?: string;
  cutting: boolean;
  log?: string;
};

const secs = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

/**
 * A talking head's cut (spec.md §6.11): each line, the try it plays, and the others to pick instead; what was left out of
 * the take and why. Picking a try or cutting again runs `bun run take` and goes in the history, so Undo puts it back.
 */
export function CutPanel({ slug, version, onSeek, onChanged }: { slug: string; version: number; onSeek: (id: string) => void; onChanged: () => void }) {
  const [state, setState] = useState<CutState | null>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [log, setLog] = useState("");
  const [open, setOpen] = useState<string>();

  useEffect(() => {
    fetch(`/api/take?slug=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setState)
      .catch(() => setState(null));
  }, [slug, version]);

  const act = (what: string, body: object) => {
    setBusy(what);
    setError("");
    post<CutState>("/api/take", { slug, ...body })
      .then((reply) => {
        setState(reply);
        setLog(reply.log ?? "");
        onChanged();
      })
      .catch((failure) => setError(failure.message))
      .finally(() => setBusy(""));
  };

  if (state === undefined) return <p className="panel-empty">Reading the cut…</p>;
  if (state === null) return <p className="panel-empty">This ad has no cut. A talking head gets one from <code>bun run take {slug} &lt;the take&gt;</code>.</p>;
  const { take } = state;
  const picked = new Map(state.lines.map((line) => [line.id, line.pick]));

  return (
    <div className="cut-panel">
      <div className="cut-head">
        <span>
          {take.scenes.length} lines, {(take.frames / take.fps).toFixed(1)} s from <b>{take.clip.name}</b>
        </span>
        <div className="cut-actions">
          <button className="ghost" disabled={!!busy || state.cutting} onClick={() => act("cut", {})} title="Cut the take again from cut.json">
            {busy === "cut" ? "Cutting…" : "Cut again"}
          </button>
          <button className="ghost" disabled={!!busy || state.cutting} onClick={() => act("verify", { verify: true })} title="Whisper hears the cut again and lists words a cut may have clipped or left in">
            {busy === "verify" ? "Listening…" : "Hear it again"}
          </button>
        </div>
      </div>
      {error && <p className="panel-error">{error}</p>}
      <ol className="cut-lines">
        {take.scenes.map((scene) => {
          const tries = scene.tries ?? [];
          const chosen = scene.try?.n;
          const jumps = scene.parts.length - 1;
          return (
            <li key={scene.id} className={open === scene.id ? "open" : ""}>
              <button className="cut-line" onClick={() => (onSeek(scene.id), setOpen(open === scene.id ? undefined : scene.id))}>
                <span className="cut-id">{scene.id}</span>
                <span className="cut-text" dir="auto">
                  {scene.words.map((word) => word.t).join(" ")}
                </span>
                <span className="cut-meta">
                  {(scene.frames / take.fps).toFixed(1)} s{jumps > 0 ? ` · ${jumps} jump${jumps > 1 ? "s" : ""}` : ""}
                  {scene.try && !scene.try.complete ? " · partial" : ""}
                </span>
              </button>
              {tries.length > 1 && (
                <div className="cut-tries">
                  {tries.map((item) => (
                    <button
                      key={item.n}
                      className={`chip${item.n === chosen ? " on" : ""}`}
                      disabled={!!busy || item.n === chosen}
                      title={`${secs(item.from)}–${secs(item.to)}${item.complete ? "" : " (broken off)"}: ${item.text}`}
                      onClick={() => act(`${scene.id}:${item.n}`, { line: scene.id, pick: item.n })}
                    >
                      Try {item.n}
                      {item.complete ? "" : "…"}
                    </button>
                  ))}
                  {picked.get(scene.id) !== undefined && (
                    <button className="chip" disabled={!!busy} title="Let the cutter choose: the last complete try" onClick={() => act(`${scene.id}:auto`, { line: scene.id, pick: null })}>
                      Auto
                    </button>
                  )}
                </div>
              )}
              {open === scene.id && tries.length > 1 && (
                <ul className="cut-try-text">
                  {tries.map((item) => (
                    <li key={item.n} className={item.n === chosen ? "on" : ""}>
                      <span className="cut-try-n">
                        {item.n} · {secs(item.from)}
                        {item.complete ? "" : " · broken off"}
                      </span>
                      <span dir="auto">{item.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {!!take.missing?.length && <p className="panel-error">Not found in the take: {take.missing.join(", ")}. Ask the agent, or change the line in cut.json.</p>}
      {!!take.left?.length && (
        <>
          <h4 className="panel-h">Left out of the take</h4>
          <ul className="cut-left">
            {take.left.map((item, i) => (
              <li key={i}>
                <span className="cut-why">
                  {secs(item.from)}–{secs(item.to)} · {item.why}
                </span>
                <span dir="auto">{item.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {log && <pre className="cut-log">{log}</pre>}
    </div>
  );
}
