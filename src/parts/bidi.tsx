import { Fragment, type ReactNode } from "react";

/** Finds runs that read against the line's direction, so `₪49` or `Claude Code` stays put inside Hebrew. */
export type Dir = "ltr" | "rtl";
export type Run = { text: string; island: boolean };

// A Latin or numeric stretch: ₪49, 50%, $5/mo, C++, nykma.app, Claude Code. A space or joiner only counts with more of
// the stretch to follow, so a full stop after ₪49 stays in the Hebrew line and "49 ₪" keeps its Hebrew order.
const LTR = /(?:\+?[\p{Script=Latin}\p{Nd}]|[₪$€£¥])(?:[\p{Script=Latin}\p{Nd}₪$€£¥%+]|[.,:\/_'’&@#-](?=[\p{Script=Latin}\p{Nd}])| +(?=[\p{Script=Latin}\p{Nd}]))*/gu;
const RTL = /[\p{Script=Hebrew}\p{Script=Arabic}](?:[\p{Script=Hebrew}\p{Script=Arabic}\p{M}]|[\s.,:;'"-]+(?=[\p{Script=Hebrew}\p{Script=Arabic}]))*/gu;

/** Splits text into plain runs and `island` runs that read against `dir`. */
export function runs(text: string, dir: Dir): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const match of text.matchAll(dir === "rtl" ? LTR : RTL)) {
    if (match.index > at) out.push({ text: text.slice(at, match.index), island: false });
    out.push({ text: match[0], island: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), island: false });
  return out;
}

/** The direction an island reads in. */
export const against = (dir: Dir): Dir => (dir === "rtl" ? "ltr" : "rtl");

/** Text with its islands wrapped in `<bdi>`, ready to drop into a line. */
export const isolate = (text: string, dir: Dir): ReactNode[] =>
  runs(text, dir).map((run, i) => (run.island ? <bdi key={i} dir={against(dir)}>{run.text}</bdi> : <Fragment key={i}>{run.text}</Fragment>));
