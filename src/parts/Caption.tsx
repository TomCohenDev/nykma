import { Fragment, type CSSProperties, type ReactNode } from "react";
import { useFrame, useVideo } from "../engine";
import { against, runs, type Dir } from "./bidi";
import { easings, prog, type Ease, type Span } from "./time";

type Props = {
  text: string;
  reveal?: Span; // Word starts spread over this span...
  at?: readonly number[]; // ...or one start frame per word, say from `said()`.
  duration?: number; // Frames each word takes to arrive.
  ease?: Ease;
  kinetic?: (p: number, word: number) => CSSProperties; // A word's style at 0..1 arrival. Replaces the default fade and slide.
  shift?: number; // Default slide along the reading direction, in pixels.
  style?: CSSProperties;
};

/** A word is whatever sits between spaces and may mix directions: `ב־₪49` is two tokens of one word. */
type Token = { text: string; run: number; island: boolean; word: number; joined: boolean };

function tokenize(text: string, dir: Dir) {
  const tokens: Token[] = [];
  let word = -1;
  let glued = false;
  runs(text, dir).forEach((run, r) => {
    for (const [piece] of run.text.matchAll(/\s+|\S+/g)) {
      if (/\s/.test(piece)) {
        glued = false;
        continue;
      }
      if (!glued) word++;
      const prev = tokens[tokens.length - 1];
      tokens.push({ text: piece, run: r, island: run.island, word, joined: glued || (run.island && prev?.run === r) });
      glued = true;
    }
  });
  return { tokens, words: word + 1 };
}

const groupBy = <T,>(items: T[], starts: (item: T, prev: T) => boolean) => {
  const groups: T[][] = [];
  items.forEach((item, i) => {
    if (i && !starts(item, items[i - 1])) groups[groups.length - 1].push(item);
    else groups.push([item]);
  });
  return groups;
};

const spaced = (nodes: ReactNode[]) => nodes.map((node, i) => <Fragment key={i}>{i > 0 && " "}{node}</Fragment>);

/** A word-by-word kinetic line. Words arrive in reading order, so a Hebrew line builds from the right. */
export function Caption({ text, reveal = [0, 0], at, duration = 10, ease = easings.outCubic, kinetic, shift = 28, style }: Props) {
  const frame = useFrame();
  const { dir } = useVideo();
  const { tokens, words } = tokenize(text, dir);
  const start = (word: number) => at?.[word] ?? reveal[0] + ((reveal[1] - reveal[0]) * word) / Math.max(words - 1, 1);
  const from = dir === "rtl" ? shift : -shift;
  const look = kinetic ?? ((p: number) => ({ opacity: p, transform: `translateX(${from * (1 - p)}px)` }));

  const word = (token: Token, key: number): ReactNode => {
    const p = prog(frame, [start(token.word), start(token.word) + duration], ease);
    return <span key={key} style={{ display: "inline-block", ...look(p, token.word) }}>{token.text}</span>;
  };

  // Tokens that may not break apart ride in one nowrap chain. Inside it, an island's words keep their own direction.
  const chains = groupBy(tokens, (token) => !token.joined).map((chain, c) => {
    const parts = groupBy(chain, (token, prev) => token.run !== prev.run).map((part, p) =>
      part[0].island ? <bdi key={p} dir={against(dir)}>{spaced(part.map(word))}</bdi> : part.map(word),
    );
    return chain.length > 1 ? <span key={c} style={{ whiteSpace: "nowrap" }}>{parts}</span> : parts;
  });
  return <div style={style}>{spaced(chains)}</div>;
}
