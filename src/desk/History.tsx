/**
 * The project's history (spec.md §10.13): every change the desk made to this ad, newest first: an edit in the
 * inspector, a drag in the viewer, a knob, a trim, a new order, an effect. Click one to go back to just after it;
 * the ones above it stay, greyed, until you make a new change, so you can come forward again. /api/history keeps it.
 */
import { useCallback, useEffect, useState } from "react";
import { post } from "./api";

export type HistoryEntry = { id: string; at: number; kind: "source" | "tune" | "story" | string; label: string; files: string[] };
export type HistoryState = { entries: HistoryEntry[]; position: number };

/** The history for one ad, read again whenever `key` changes and every few seconds while it's shown. */
export function useHistory(slug: string | undefined, key: unknown, live: boolean) {
  const [state, setState] = useState<HistoryState>({ entries: [], position: 0 });
  const [error, setError] = useState("");
  const load = useCallback(() => {
    if (!slug) return;
    fetch(`/api/history?slug=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("The desk couldn't read the history."))))
      .then((reply: HistoryState) => setState({ entries: reply.entries ?? [], position: reply.position ?? 0 }))
      .catch(() => {});
  }, [slug]);
  useEffect(load, [load, key]);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [live, load]);
  /** undo, redo, or a position (0: before every change). */
  const move = async (to: "undo" | "redo" | number) => {
    if (!slug) return;
    setError("");
    try {
      const reply = await post<HistoryState>(typeof to === "number" ? "/api/history/goto" : `/api/history/${to}`, typeof to === "number" ? { slug, position: to } : { slug });
      setState({ entries: reply.entries ?? [], position: reply.position ?? 0 });
    } catch (failure) {
      setError((failure as Error).message);
      load();
      throw failure;
    }
  };
  return { ...state, error, setError, move, load };
}

const KIND: Record<string, string> = { source: "Code", tune: "Knob", story: "Timeline", fx: "Effect" };

const ago = (at: number) => {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString();
};

export function HistoryPanel({ history, onMoved }: { history: ReturnType<typeof useHistory>; onMoved: () => void }) {
  const { entries, position, error } = history;
  const [busy, setBusy] = useState(false);
  const go = async (to: "undo" | "redo" | number) => {
    setBusy(true);
    try {
      await history.move(to);
      onMoved();
    } catch {
      /* shown above the list */
    } finally {
      setBusy(false);
    }
  };
  const rows = entries.map((entry, i) => ({ entry, i })).reverse();
  return (
    <div className="history">
      <div className="history-bar">
        <button className="ghost small" disabled={busy || position === 0} onClick={() => void go("undo")} title={position ? `Undo: ${entries[position - 1]?.label}` : "Nothing to undo"}>
          ↶ Undo
        </button>
        <button className="ghost small" disabled={busy || position >= entries.length} onClick={() => void go("redo")} title={position < entries.length ? `Redo: ${entries[position]?.label}` : "Nothing to redo"}>
          ↷ Redo
        </button>
        <span className="spacer" />
        <button
          className="ghost small danger"
          disabled={busy || position === 0}
          onClick={() => {
            if (confirm(`Undo all ${position} change${position === 1 ? "" : "s"} the desk made to this ad? You can come forward again until you make a new change.`)) void go(0);
          }}
        >
          Reset all
        </button>
      </div>
      {error && <p className="ins-error">{error}</p>}
      {entries.length === 0 ? (
        <p className="panel-empty">No changes yet. Everything you change here, in the inspector, on the timeline or in the viewer, is listed, and you can go back to any point.</p>
      ) : (
        <ol className="history-list">
          {rows.map(({ entry, i }) => {
            const undone = i >= position;
            const here = i === position - 1;
            return (
              <li key={entry.id} className={`${undone ? "undone" : ""}${here ? " here" : ""}`}>
                <button disabled={busy || here} onClick={() => void go(i + 1)} title={undone ? "Redo up to this change" : here ? "You're here" : "Go back to just after this change"}>
                  <span className={`hk ${entry.kind}`}>{KIND[entry.kind] ?? entry.kind}</span>
                  <span className="hl" dir="auto">
                    {entry.label}
                  </span>
                  <span className="ht">{here ? "now" : ago(entry.at)}</span>
                </button>
              </li>
            );
          })}
          <li className={position === 0 ? "here" : ""}>
            <button disabled={busy || position === 0} onClick={() => void go(0)} title="Before every change listed">
              <span className="hk start">Start</span>
              <span className="hl">Before these changes</span>
              <span className="ht">{position === 0 ? "now" : ""}</span>
            </button>
          </li>
        </ol>
      )}
      <p className="ins-note history-foot">Only the desk's own changes are here. When the agent or your editor changes a file after that, going back past it stops and says which file.</p>
    </div>
  );
}
