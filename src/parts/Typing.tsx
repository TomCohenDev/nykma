import { Fragment, type CSSProperties } from "react";
import { random, useFrame, useVideo } from "../engine";
import { against, runs } from "./bidi";
import type { Span } from "./time";

type Props = {
  text: string;
  typed: Span;
  reserve?: boolean; // Lay out the whole text from the start, so nothing shifts or re-wraps as it types.
  caret?: boolean;
  blink?: number; // Frames on, then off, while waiting. Solid while typing.
  jitter?: number; // 0 types evenly, 1 is very uneven.
  seed?: number | string;
  caretColor?: string;
  caretWidth?: string;
  style?: CSSProperties;
};

const letters = (text: string) => Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);

/** Typed text with a caret, over the `typed` span. Whole letters at a time, so niqqud stays on its letter; the caret follows the text's direction. */
export function Typing({ text, typed: [a, b], reserve = false, caret = true, blink = 15, jitter = 0.5, seed = 1, caretColor = "currentColor", caretWidth = "0.07em", style }: Props) {
  const frame = useFrame();
  const { dir } = useVideo();
  const pieces = runs(text, dir).map((run) => ({ ...run, letters: letters(run.text) }));
  const total = pieces.reduce((sum, run) => sum + run.letters.length, 0);

  // Each key lands at a fixed time inside the span, unevenly, like a person.
  let elapsed = 0;
  const keys = Array.from({ length: total }, (_, i) => (elapsed += 1 + jitter * (2 * random(`${seed}-${i}`) - 1)));
  let left = keys.filter((key) => a + ((b - a) * key) / elapsed <= frame).length;

  const typing = frame >= a && frame < b;
  const on = caret && (typing || Math.floor(Math.abs(frame - (frame < a ? a : b)) / blink) % 2 === 0);
  // Zero width, so blinking and moving never push the text.
  const mark = (
    <span style={{ display: "inline-block", position: "relative", width: 0, height: "1.1em", verticalAlign: "-0.2em" }}>
      <span style={{ position: "absolute", top: 0, bottom: 0, insetInlineStart: 0, width: caretWidth, background: caretColor, opacity: on ? 1 : 0 }} />
    </span>
  );

  let placed = false;
  return (
    <span style={{ whiteSpace: "pre-wrap", ...style }}>
      {pieces.map((run, i) => {
        const shown = Math.min(left, run.letters.length);
        const here = !placed && left <= run.letters.length;
        placed ||= here;
        left -= shown;
        if (!shown && !here && !reserve) return null;
        const body = (
          <>
            {run.letters.slice(0, shown).join("")}
            {here && mark}
            {reserve && <span style={{ visibility: "hidden" }}>{run.letters.slice(shown).join("")}</span>}
          </>
        );
        return run.island ? <bdi key={i} dir={against(dir)}>{body}</bdi> : <Fragment key={i}>{body}</Fragment>;
      })}
    </span>
  );
}
