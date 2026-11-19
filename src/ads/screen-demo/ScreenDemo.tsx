/**
 * screen-demo (spec.md §6.7): a generated clip of a student at a computer, with a real nykma ad playing on the monitor.
 * On the screen is bake-nykma's "Then there's 14" and "Solve" scenes, laid out as a 16:9 display.
 *
 * The clip comes from public/ads/screen-demo/gen.json (bun run gen screen-demo, after approving it on the desk), and its
 * screen from bun run screen screen-demo pc. Until then pc.screen.json doesn't exist, so the track is looked up with
 * import.meta.glob, which finds nothing instead of breaking every ad, and the ad shows what's missing.
 */
import { ScreenInsert, Sequence, type AdProps, type ScreenTrack } from "../../engine";
import { scenes as bake } from "../bake-nykma/BakeNykma";

const tracks = import.meta.glob<ScreenTrack>("./*.screen.json", { eager: true, import: "default" });
const track = tracks["./pc.screen.json"];

export const FRAMES = 180; // 6 s at 30 fps, the clip's length

/** bake-nykma's stall at 14 and the solve, back to back, as they play in that ad. */
function OnScreen() {
  const parts = ["stuck", "solve"].map((id) => bake.find((scene) => scene.id === id)!);
  let from = 0;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#fff" }}>
      {parts.map((scene) => {
        const frames = typeof scene.frames === "number" ? scene.frames : 0;
        const Part = scene.component;
        const at = from;
        from += frames;
        return (
          <Sequence key={scene.id} from={at} duration={frames}>
            <Part ratio="16x9" />
          </Sequence>
        );
      })}
    </div>
  );
}

function Waiting() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#1e1e1e", color: "#c4c4c4", font: "500 34px/1.5 system-ui", textAlign: "center", padding: 80 }}>
      <div>
        screen-demo is waiting for its clip.
        <br />
        Approve it on the desk, then run
        <br />
        <code style={{ color: "#fff" }}>bun run gen screen-demo</code> and <code style={{ color: "#fff" }}>bun run screen screen-demo pc</code>
      </div>
    </div>
  );
}

export function ScreenDemo({ ratio }: AdProps) {
  if (!track) return <Waiting />;
  // 1:1 keeps the monitor and the student's head. A 9:16 would need its own upright clip: a 16:9 one crops the screen.
  return (
    <ScreenInsert
      track={track}
      size={[1920, 1080]}
      video={{ slug: "bake-nykma" }}
      focus={ratio === "1x1" ? [0.18, 0.5] : [0.5, 0.5]}
      screenStyle={{ filter: "brightness(0.94)" }}
    >
      <OnScreen />
    </ScreenInsert>
  );
}
