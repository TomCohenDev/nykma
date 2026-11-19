import type { AdProps, CueInput, Layout } from "../../engine";
import { HandText, handCues, type HandWrite } from "../../parts/hand";

/**
 * Proves the handwriting part: an English word and a Hebrew word in the real fonts with a pen on the tip, `mode="ink"`,
 * two hand-drawn paths, and a line that writes then erases itself. All of it on one sheet of paper, in all three ratios.
 */
const WRITES = {
  written: { id: "written", write: [10, 62] },
  apps: { id: "apps", write: [70, 142] },
  marker: { id: "marker", write: [150, 196] },
  arrow: { id: "arrow", write: [198, 214] },
  mvp: { id: "mvp", write: [216, 252] },
  scratch: { id: "scratch", write: [224, 252], erase: [268, 284] },
} satisfies Record<string, HandWrite>;

export const FRAMES = 300;

export const cues = ({ fps }: CueInput) => handCues("hand-demo", Object.values(WRITES), { fps, volume: 0.45 });

const L: Layout<{ word: number; hebrew: number; marker: number; arrow: number; mvp: number; scratch: number; gap: number; row: "row" | "column"; lift: number }> = {
  "16x9": { word: 230, hebrew: 170, marker: 150, arrow: 250, mvp: 300, scratch: 110, gap: 44, row: "row", lift: 0 },
  "1x1": { word: 250, hebrew: 170, marker: 120, arrow: 120, mvp: 200, scratch: 68, gap: 34, row: "row", lift: 0 },
  "9x16": { word: 280, hebrew: 180, marker: 200, arrow: 280, mvp: 340, scratch: 110, gap: 44, row: "column", lift: 120 }, // Lifted to the centre of the safe area.
};

const INK = "#1b2a52";
const RED = "#c8321f";

export function HandDemo({ ratio }: AdProps) {
  const { word, hebrew, marker, arrow, mvp, scratch, gap, row, lift } = L[ratio];
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#f5f0e6",
        color: INK,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap,
        paddingBottom: lift,
        boxSizing: "border-box",
      }}
    >
      <HandText {...WRITES.written} size={word} pen />
      <HandText {...WRITES.apps} size={hebrew} pen />
      <div style={{ display: "flex", flexDirection: row, alignItems: "center", gap: gap * 1.2 }}>
        <HandText {...WRITES.marker} size={marker} mode="ink" color={RED} pen />
        <HandText {...WRITES.arrow} width={arrow} color={RED} pen />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: gap / 2 }}>
          <HandText {...WRITES.mvp} width={mvp} pen />
          <HandText {...WRITES.scratch} size={scratch} />
        </div>
      </div>
    </div>
  );
}
