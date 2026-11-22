/**
 * Dev server only: tags every host JSX element in src/ads/ and src/parts/ with where it is in the source, so the desk
 * can click an element in a preview and edit its values (source.ts, spec.md §10.13).
 *
 *   <div data-nk="src/ads/smoke/Smoke.tsx:42:7">                  line and column of the tag's `<`, 1-based
 *   <div data-nk="..." data-nk-knobs="title-x,fade">               the knobs (k, nudge, at) its attributes read
 *
 * Renders are built with `vite build`, which never runs this (`apply: "serve"`), so an MP4 has no tags. It never
 * throws: a file that doesn't parse is passed on unchanged and Vite reports the error as usual.
 */
import { relative } from "node:path";
import type { Plugin } from "vite";
import { hostTag, lineCol, lineStarts, parse, walk } from "./source.ts";

const SOURCE = /\/src\/(ads|parts)\/.+\.tsx$/;
const KNOBS = new Set(["k", "nudge", "at"]);

const attribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** The knob ids an opening element's attributes read: k("id"), t.nudge("id"), at("id"). */
function knobsOf(opening: any) {
  const ids: string[] = [];
  for (const attr of opening.attributes)
    walk(attr, (node) => {
      if (node.type === "JSXElement" || node.type === "JSXFragment") return false;
      if (node.type !== "CallExpression") return;
      const callee = node.callee;
      const name = callee?.type === "Identifier" ? callee.name : callee?.type === "MemberExpression" && !callee.computed ? callee.property?.name : undefined;
      const first = node.arguments?.[0];
      if (KNOBS.has(name) && first?.type === "Literal" && typeof first.value === "string" && !ids.includes(first.value)) ids.push(first.value);
    });
  return ids;
}

/** The code with data-nk (and data-nk-knobs) on each host element, or undefined when there's nothing to tag. */
export function tagSource(code: string, file: string): string | undefined {
  try {
    const program = parse(file, code);
    if (!program) return undefined;
    const starts = lineStarts(code);
    const inserts: { at: number; text: string }[] = [];
    walk(program, (node) => {
      if (node.type !== "JSXElement" || !hostTag(node)) return;
      const opening = node.openingElement;
      if (opening.attributes.some((attr: any) => attr.type === "JSXAttribute" && attr.name?.name === "data-nk")) return;
      const { line, col } = lineCol(starts, node.start);
      const knobs = knobsOf(opening);
      const text = ` data-nk="${attribute(`${file}:${line}:${col}`)}"${knobs.length ? ` data-nk-knobs="${attribute(knobs.join(","))}"` : ""}`;
      inserts.push({ at: opening.name.end, text });
    });
    if (!inserts.length) return undefined;
    let out = code;
    for (const { at, text } of inserts.sort((a, b) => b.at - a.at)) out = out.slice(0, at) + text + out.slice(at);
    return out;
  } catch {
    return undefined;
  }
}

export function sourceTags(): Plugin {
  let root = process.cwd();
  return {
    name: "nykma-source-tags",
    apply: "serve",
    enforce: "pre",
    configResolved: (config) => void (root = config.root),
    transform(code, id) {
      try {
        const [path, query = ""] = id.split("?");
        const clean = path.replace(/\\/g, "/");
        if (!SOURCE.test(clean) || /(^|&)(raw|url|inline|worker)\b/.test(query)) return null;
        const file = relative(root, path).replace(/\\/g, "/");
        if (file.startsWith("..")) return null;
        const tagged = tagSource(code, file);
        return tagged === undefined ? null : { code: tagged, map: null };
      } catch {
        return null;
      }
    },
  };
}
