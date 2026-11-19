import type { HandManifest } from "../../parts/hand/types.ts";
import { SIZES, type Ratio } from "../../engine/ratio.ts";

/** A loop drawn by a real hand: starts upper left, overshoots where it closes, wobbles a little. Any fixed wobble is a function of the angle. */
function loop(rx: number, ry: number, turns = 1.12) {
  const steps = 72;
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const a = -2.3 + (i / steps) * turns * 2 * Math.PI;
    const drift = 1 + 0.05 * Math.sin(a * 2.3 + 1) + 0.03 * (i / steps);
    return `${(rx * drift * Math.cos(a)).toFixed(1)} ${(ry * drift * Math.sin(a)).toFixed(1)}`;
  });
  return `M${points[0]}L${points.slice(1).join(" ")}`;
}

/** Back and forth across a whole frame, close enough that it nearly fills it. */
function scribble(ratio: Ratio) {
  const { width, height } = SIZES[ratio];
  const pad = 40;
  const rows = Math.ceil((width + height) / 46);
  const points: string[] = [];
  for (let i = 0; i <= rows; i++) {
    // Each pass runs on a slant from the left or bottom edge to the top or right edge.
    const along = (i / rows) * (width + height);
    const wobble = 26 * Math.sin(i * 1.7);
    const x0 = Math.min(along, width) + wobble;
    const y0 = Math.max(along - width, 0) - pad;
    const x1 = Math.max(along - height, 0) - pad;
    const y1 = Math.min(along, height) + wobble;
    points.push(i % 2 ? `${x0.toFixed(0)} ${y0.toFixed(0)}` : `${x1.toFixed(0)} ${y1.toFixed(0)}`);
  }
  return `M${points[0]}L${points.slice(1).join(" ")}`;
}

const line = (id: string, text: string) => ({ id, text, font: "caveat", weight: 700 });

/** What `bun run hand whos-sarah` traces into hand.gen.json. */
export default {
  texts: [
    line("who", "says who?"),
    line("sarah", "who's Sarah?"),
    line("teams", "what teams?"),
    line("what", "of what?"),
    line("ok", "ok."),
    line("true", "what's actually true?"),
    line("ask", "you ask Claude Code"),
    line("mp4", "you get MP4s"),
    line("watching", "you're watching one"),
    line("copy", "and post copy"),
    line("yours", "you post it. not us"),
    line("bar-a", "that bar?"),
    line("bar-b", "the check failed it"),
    line("tag", "nobody knows my app"),
  ],
  paths: [
    { id: "ring", ink: 11, paths: [loop(420, 400)] },
    { id: "ring-name", ink: 11, paths: [loop(300, 80)] },
    { id: "ring-16x9", ink: 9, paths: [loop(400, 240, 1.08)] },
    { id: "ring-1x1", ink: 9, paths: [loop(260, 260, 1.08)] },
    { id: "ring-9x16", ink: 9, paths: [loop(190, 330, 1.08)] },
    { id: "x", ink: 10, paths: ["M6 10C60 50 130 110 190 170", "M196 8C150 60 70 120 10 176"] },
    { id: "strike", ink: 14, paths: ["M4 26C200 8 420 34 620 14C720 6 800 22 880 12"] },
    { id: "flick", ink: 8, paths: ["M6 60C40 40 90 24 140 6"] },
    { id: "close", ink: 13, paths: ["M34 18C31 44 39 72 33 102"] },
    { id: "scribble-16x9", ink: 58, paths: [scribble("16x9")] },
    { id: "scribble-1x1", ink: 58, paths: [scribble("1x1")] },
    { id: "scribble-9x16", ink: 58, paths: [scribble("9x16")] },
  ],
} satisfies HandManifest;
