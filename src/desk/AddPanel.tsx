/**
 * The Add tab (spec.md §10.14): things to drag onto the viewer. Text, a label and a box take the ad's own look from the
 * frame under the playhead (its biggest text's font and colour, its fills); the ad's ready-made elements come from
 * src/ads/<slug>/elements.tsx, which the agent writes when it builds the ad. A drop writes the element into the scene's
 * code at the playhead, where the inspector, a drag and the effects all work on it. A click adds it in the middle.
 */
import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { ADD_TYPE, type Sample } from "./Viewer";

/** What a tile adds. `size` picks a heading or body text from the ad's biggest text. */
export type AddItem = { kind: "text" | "label" | "box" | "element"; size?: "heading" | "text"; element?: string; name: string };

type Field = { name: string; editable: boolean; kind: string; value?: number | string; code: string };
type Ready = { id: string; name: string; component: string; hint?: string; props: Field[] };

type Props = {
  slug?: string;
  /** Changes when the ad's code may have changed, so the list is read again. */
  version: number;
  /** The ad's look under the playhead, or null when the frame has no text. */
  sample: Sample | null;
  /** Where the playhead is: a scene of the code, or why nothing can be added there. */
  scene: { name: string } | string;
  onDragging: (on: boolean) => void;
  onAdd: (item: AddItem) => void;
  onAsk: (text: string) => void;
};

const fontName = (family?: string) => (family ?? "").split(",")[0].replace(/["']/g, "").trim();

export function AddPanel({ slug, version, sample, scene, onDragging, onAdd, onAsk }: Props) {
  const [ready, setReady] = useState<Ready[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!slug) return;
    fetch(`/api/elements?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        const reply = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(reply.error ?? "The desk couldn't read the ad's elements.");
        setReady(reply.elements ?? []);
        setError("");
      })
      .catch((failure) => setError(failure.message));
  }, [slug, version]);

  const head = sample?.headline;
  const look = head ? `${fontName(head.fontFamily)} ${head.fontWeight}` : "the ad's default font";
  const tile = (item: AddItem, title: string, sub: string, swatch?: ReactNode) => (
    <button
      key={`${item.kind}:${item.element ?? item.size ?? ""}`}
      className="add-tile"
      draggable
      onDragStart={(event: DragEvent) => {
        event.dataTransfer.setData(ADD_TYPE, JSON.stringify(item));
        event.dataTransfer.effectAllowed = "copy";
        onDragging(true);
      }}
      onDragEnd={() => onDragging(false)}
      onClick={() => onAdd(item)}
      title="Drag it onto the video, or click to add it in the middle"
    >
      {swatch}
      <span className="add-name" dir="auto">
        {title}
      </span>
      <span className="add-sub" dir="auto">
        {sub}
      </span>
    </button>
  );

  return (
    <div className="add-panel">
      <p className="add-where">{typeof scene === "string" ? scene : <>Adds to “{scene.name}” at the playhead, for two seconds. Change when it shows in Effects.</>}</p>
      <h4 className="panel-h">In this ad's style</h4>
      <div className="add-grid">
        {tile({ kind: "text", size: "heading", name: "Heading" }, "Heading", look, <span className="add-glyph" style={{ color: head?.color, fontWeight: Number(head?.fontWeight) || 800 }}>Aa</span>)}
        {tile({ kind: "text", size: "text", name: "Text" }, "Text", look, <span className="add-glyph small" style={{ color: head?.color }}>Aa</span>)}
        {tile({ kind: "label", name: "Label" }, "Label", "text on a pill", <span className="add-pill" style={{ background: sample?.paper ?? "#fff", color: head?.color ?? "#171923" }}>Aa</span>)}
        {tile({ kind: "box", name: "Box" }, "Box", "a rounded fill", <span className="add-box" style={{ background: sample?.accent ?? "var(--accent)" }} />)}
      </div>
      <h4 className="panel-h">Made for this ad</h4>
      {error && <p className="panel-error">{error}</p>}
      {ready && ready.length > 0 && (
        <div className="add-list">
          {ready.map((item) =>
            tile(
              { kind: "element", element: item.id, name: item.name },
              item.name,
              item.hint ?? item.props.map((prop) => `${prop.name}: ${prop.value ?? prop.code}`).join(" · "),
            ),
          )}
        </div>
      )}
      {ready && ready.length === 0 && slug && (
        <div className="add-empty">
          <p className="panel-empty">This ad has no ready-made elements yet: its own captions, badges or sections, each with the values you'd change.</p>
          <button
            className="ghost small boxed"
            onClick={() =>
              onAsk(
                `Make ready-made elements for ${slug} in src/ads/${slug}/elements.tsx, as spec.md §10.14 says: a few pieces from this ad, in its look, that I can drop onto the video from the desk's Add tab, each with the props I'd change (the text first). Then stop.`,
              )
            }
          >
            Ask the agent to make some
          </button>
        </div>
      )}
    </div>
  );
}
