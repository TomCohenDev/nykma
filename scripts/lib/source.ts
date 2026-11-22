/**
 * Reading and editing an ad's literal values in its source, for the desk (spec.md §10.13). The dev server tags every
 * host JSX element in src/ads/ and src/parts/ with data-nk="<file>:<line>:<col>" (source-tag.ts). The desk sends that
 * back here to see the element's text, style and props, and to change one literal in place.
 *
 *   elementAt(loc, texts?, slug?)  the element at that tag: text, style fields, props and data-* attributes, the file's
 *                                  hash, and with `texts` (what the element and its parents show) the string literals in
 *                                  the ad's folder that text comes from, wherever they're defined
 *   editSource(loc, hash, edit)    replaces, adds or removes one literal. Only src/ads/: src/parts/ is shared by every ad
 *   undoSource(slug?)              the desk's Ctrl+Z: one step back in the ad's history (history.ts)
 *
 * Lines and columns are 1-based and count UTF-16 code units, as JS strings do. Only the literal's own range is
 * rewritten, so the rest of the file (CRLF or LF, Hebrew, comments) stays byte for byte. Every write is recorded in the
 * ad's history, so it can be undone and redone.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { parseSync } from "rolldown/utils";
import { HistoryError, record, undo, writeAtomic, type HistoryMove } from "./history.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const ADS = join(ROOT, "src", "ads");
const PARTS = join(ROOT, "src", "parts");

export type Field = { name: string; code: string; editable: boolean; kind: "number" | "string" | "other"; value?: number | string };
/** A data-* attribute on the element (data-nk aside). value is set when it's a plain string; editable when attr can change it. */
export type AttrInfo = { name: string; code: string; editable: boolean; value?: string };
/**
 * A string literal in the ad's folder whose value is text the element shows. loc is the literal's own start
 * (`file:line:col`), for a { kind: "literal" } edit with that file's hash.
 */
export type TextMatch = {
  loc: string;
  file: string;
  line: number;
  value: string;
  hash: string;
  match: "exact" | "contains";
  kind: LiteralKind;
};
/** "object" is style={{ ... }}, "none" no style attribute, "other" anything else (style={s}, or props spread in). */
export type StyleMode = "object" | "none" | "other";
export type ElementInfo = {
  file: string;
  loc: string;
  hash: string;
  tag: string;
  component?: string;
  /** The ad whose folder `texts` searched: from the loc, or the slug the desk passed for an element in src/parts/. */
  slug?: string;
  text?: { value: string; editable: boolean; code: string };
  style: Field[];
  styleMode: StyleMode;
  props: Field[];
  attrs: AttrInfo[];
  /** Only when the request sent text: best first, at most 6. */
  texts?: TextMatch[];
};
export type SourceEdit =
  | { kind: "text"; value: string }
  | { kind: "literal"; value: string }
  | { kind: "style"; name: string; value: number | string | null }
  | { kind: "prop"; name: string; value: number | string }
  | { kind: "attr"; name: string; value: string | null };
/** loc: the element's (or for a literal edit, the literal's new) location. hash: the edited file's new hash. */
export type EditReply = { ok: true; hash: string; loc: string; file: string };

/** An answer the desk passes on as is: the status and, for a stale file, its current hash. */
export class SourceError extends Error {
  readonly status: number;
  readonly hash?: string;
  constructor(status: number, message: string, hash?: string) {
    super(message);
    this.status = status;
    this.hash = hash;
  }
}

/** The status and body the desk answers a failed read or edit with. */
export const sourceFailure = (error: any): [number, { error: string; hash?: string }] => [
  error instanceof SourceError || error instanceof HistoryError ? error.status : 400,
  { error: String(error?.message ?? error), ...(error instanceof SourceError && error.hash ? { hash: error.hash } : {}) },
];

type Node = { type: string; start: number; end: number; [key: string]: any };

const langOf = (file: string) => (/\.tsx$/.test(file) ? "tsx" : /\.jsx$/.test(file) ? "jsx" : /\.[cm]?ts$/.test(file) ? "ts" : /\.[cm]?js$/.test(file) ? "js" : "tsx");

/** The program, or undefined when the file doesn't parse. Never throws. */
export function parse(file: string, code: string): Node | undefined {
  try {
    const result = parseSync(file, code, { lang: langOf(file) });
    return result.errors.length ? undefined : (result.program as unknown as Node);
  } catch {
    return undefined;
  }
}

const isNode = (value: unknown): value is Node => !!value && typeof value === "object" && typeof (value as Node).type === "string";

/** Every node, depth first, with its ancestors (nearest last). Returning false from visit skips the node's children. */
export function walk(node: Node, visit: (node: Node, parents: Node[]) => boolean | void, parents: Node[] = []) {
  if (visit(node, parents) === false) return;
  parents.push(node);
  for (const key in node) {
    if (key === "type" || key === "start" || key === "end") continue;
    const value = node[key];
    if (Array.isArray(value)) for (const item of value) isNode(item) && walk(item, visit, parents);
    else if (isNode(value)) walk(value, visit, parents);
  }
  parents.pop();
}

/** A lowercase tag: div, span, svg, path. Not a component, a fragment or a member tag like motion.div. */
export const hostTag = (element: Node): string | undefined => {
  const name = element.openingElement?.name;
  return name?.type === "JSXIdentifier" && /^[a-z]/.test(name.name) ? name.name : undefined;
};

export function lineStarts(code: string) {
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

/** 1-based line and column of an offset. */
export function lineCol(starts: number[], offset: number) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, col: offset - starts[low] + 1 };
}

export const hashOf = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** The literal a value expression is, if it is one: a number (or minus a number), a string or a plain template. */
function literal(node: Node | null | undefined): { kind: "number" | "string"; value: number | string } | undefined {
  if (!node) return undefined;
  if (node.type === "Literal" && typeof node.value === "number") return { kind: "number", value: node.value };
  if (node.type === "Literal" && typeof node.value === "string") return { kind: "string", value: node.value };
  if (node.type === "UnaryExpression" && node.operator === "-" && node.argument?.type === "Literal" && typeof node.argument.value === "number")
    return { kind: "number", value: -node.argument.value };
  if (node.type === "TemplateLiteral" && node.expressions.length === 0 && typeof node.quasis[0]?.value?.cooked === "string")
    return { kind: "string", value: node.quasis[0].value.cooked };
  return undefined;
}

const field = (name: string, code: string, node: Node | null | undefined): Field => {
  const found = literal(node);
  return found ? { name, code, editable: true, ...found } : { name, code, editable: false, kind: "other" };
};

const short = (text: string, max = 200) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** JSX text as React reads it: each line trimmed, blank lines dropped, the rest joined with spaces. */
const jsxText = (raw: string) =>
  raw.includes("\n")
    ? raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ")
    : raw.trim();

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
/** JSX text and attribute strings as React shows them: the parser leaves &entities; as written. */
const decode = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()] ?? whole;
    const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });

const attrName = (attr: Node) => (attr.name.type === "JSXNamespacedName" ? `${attr.name.namespace.name}:${attr.name.name.name}` : String(attr.name.name));

/** Where an element's pieces are in the source, so an edit can replace exactly one range. */
type Target = { field: Field; range: [number, number]; context: "jsx-text" | "jsx-attr" | "expression"; node?: Node };

function analyse(element: Node, code: string) {
  const src = (node: Node) => code.slice(node.start, node.end);
  const opening = element.openingElement as Node;
  const style: Target[] = [];
  const props: Target[] = [];
  const attrs: { info: AttrInfo; node: Node }[] = [];
  let text: Target | undefined;
  let textInfo: ElementInfo["text"];
  let styleAttr: Node | undefined;
  let styleObject: Node | undefined;
  let spread: Node | undefined;

  for (const attr of opening.attributes as Node[]) {
    if (attr.type === "JSXSpreadAttribute") {
      spread ??= attr;
      props.push({ field: { name: `...${src(attr.argument)}`, code: src(attr.argument), editable: false, kind: "other" }, range: [attr.start, attr.end], context: "expression" });
      continue;
    }
    const name = attrName(attr);
    const value = attr.value as Node | null;
    if (name === "style") {
      styleAttr = attr;
      styleObject = value?.type === "JSXExpressionContainer" && value.expression.type === "ObjectExpression" ? value.expression : undefined;
      style.length = 0;
      for (const prop of (styleObject?.properties ?? []) as Node[]) {
        if (prop.type === "SpreadElement") {
          style.push({ field: { name: `...${src(prop.argument)}`, code: src(prop.argument), editable: false, kind: "other" }, range: [prop.start, prop.end], context: "expression", node: prop });
          continue;
        }
        const key = prop.computed
          ? `[${src(prop.key)}]`
          : prop.key.type === "Identifier"
            ? prop.key.name
            : prop.key.type === "Literal"
              ? String(prop.key.value)
              : src(prop.key);
        const editable = prop.kind === "init" && !prop.method && !prop.shorthand && !prop.computed;
        const f = field(key, src(prop.value), editable ? prop.value : undefined);
        style.push({ field: f, range: [prop.value.start, prop.value.end], context: "expression", node: prop });
      }
      // style={s} is shown as a prop, as before: its value isn't a list the desk can change.
      if (!styleObject && value) props.push({ field: { name, code: src(value.type === "JSXExpressionContainer" ? value.expression : value), editable: false, kind: "other" }, range: [value.start, value.end], context: "expression" });
      continue;
    }
    if (name.startsWith("data-")) {
      if (name.startsWith("data-nk")) continue;
      let shown: string | undefined;
      if (value?.type === "Literal" && typeof value.value === "string") shown = decode(value.value);
      else if (value?.type === "JSXExpressionContainer" && literal(value.expression)?.kind === "string") shown = String(literal(value.expression)!.value);
      attrs.push({ info: { name, code: value ? src(value) : "true", editable: value === null || shown !== undefined, ...(shown !== undefined ? { value: shown } : {}) }, node: attr });
      continue;
    }
    if (name === "key" || name === "ref" || name === "children" || /^on[A-Z]/.test(name)) continue;
    if (value === null) {
      props.push({ field: { name, code: "true", editable: false, kind: "other" }, range: [attr.start, attr.end], context: "expression" });
    } else if (value.type === "Literal") {
      props.push({ field: field(name, src(value), value), range: [value.start, value.end], context: "jsx-attr" });
    } else if (value.type === "JSXExpressionContainer" && value.expression.type !== "JSXEmptyExpression") {
      props.push({ field: field(name, src(value.expression), value.expression), range: [value.expression.start, value.expression.end], context: "expression" });
    } else {
      props.push({ field: { name, code: src(value), editable: false, kind: "other" }, range: [value.start, value.end], context: "expression" });
    }
  }

  const children = (element.children as Node[]).filter((child) => !(child.type === "JSXText" && !child.raw.trim()));
  if (children.length === 1 && children[0].type === "JSXText") {
    const child = children[0];
    const raw: string = child.raw;
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;
    const value = jsxText(child.value);
    textInfo = { value, editable: true, code: raw.trim() };
    text = { field: { name: "text", code: raw.trim(), editable: true, kind: "string", value }, range: [child.start + lead, child.end - trail], context: "jsx-text" };
  } else if (children.length === 1 && children[0].type === "JSXExpressionContainer" && literal(children[0].expression)?.kind === "string") {
    const expression = children[0].expression as Node;
    const value = String(literal(expression)!.value);
    textInfo = { value, editable: true, code: src(expression) };
    text = { field: { name: "text", code: src(expression), editable: true, kind: "string", value }, range: [expression.start, expression.end], context: "expression" };
  } else if (children.length) {
    textInfo = { value: "", editable: false, code: short(code.slice(children[0].start, children[children.length - 1].end)) };
  }
  const styleMode: StyleMode = styleObject ? "object" : styleAttr || spread ? "other" : "none";
  return { opening, style, props, attrs, text, textInfo, styleAttr, styleObject, styleMode, spread };
}

/** The enclosing component: the nearest named function, preferring a capitalised one. */
function componentOf(parents: Node[]) {
  let fallback: string | undefined;
  for (let i = parents.length - 1; i >= 0; i--) {
    const node = parents[i];
    let name: string | undefined;
    if ((node.type === "FunctionDeclaration" || node.type === "FunctionExpression") && node.id?.name) name = node.id.name;
    else if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") name = node.id.name;
    if (!name) continue;
    if (/^[A-Z]/.test(name)) return name;
    fallback ??= name;
  }
  return fallback;
}

const toRel = (file: string) => relative(ROOT, file).split(sep).join("/");
/** The ad a repo path belongs to: src/ads/<slug>/... */
const slugOf = (rel: string) => /^src\/ads\/([^/]+)\/.+/.exec(rel)?.[1];
const CODE = /\.(tsx|jsx|[cm]?ts|[cm]?js)$/;

/** A loc's file, checked: a .tsx or .jsx (any code file with `anyCode`) under src/ads/ or src/parts/, in the repo. */
function fileOf(loc: string, anyCode = false) {
  const match = /^(.+):(\d+):(\d+)$/.exec(loc);
  if (!match) throw new SourceError(400, "That isn't a source location.");
  const [, path, line, col] = match;
  const kind = anyCode ? CODE : /\.(tsx|jsx)$/;
  if (path.split(/[\\/]/).includes("..") || !kind.test(path) || /\.d\.[cm]?ts$/.test(path)) throw new SourceError(400, "That isn't an ad's source file.");
  const file = resolve(ROOT, path);
  const inAds = file.startsWith(ADS + sep);
  if (!inAds && !file.startsWith(PARTS + sep)) throw new SourceError(400, "Only files in src/ads/ and src/parts/ can be read here.");
  if (!existsSync(file)) throw new SourceError(404, "No such file.");
  const rel = toRel(file);
  return { file, rel, line: Number(line), col: Number(col), inAds, slug: inAds ? slugOf(rel) : undefined };
}

function offsetOf(code: string, line: number, col: number) {
  const starts = lineStarts(code);
  if (line < 1 || line > starts.length) return -1;
  return starts[line - 1] + col - 1;
}

function find(rel: string, code: string, line: number, col: number) {
  const program = parse(rel, code);
  if (!program) throw new SourceError(409, "The file doesn't parse right now. Fix it in the code first.", hashOf(code));
  const offset = offsetOf(code, line, col);
  if (offset < 0) throw new SourceError(404, "No element there. Did the file change?", hashOf(code));
  let found: { element: Node; parents: Node[] } | undefined;
  walk(program, (node, parents) => {
    if (found) return false;
    if (node.end < offset || node.start > offset) return false;
    if (node.type === "JSXElement" && node.start === offset && hostTag(node)) found = { element: node, parents: [...parents] };
  });
  if (!found) throw new SourceError(404, "No element there. Did the file change?", hashOf(code));
  return found;
}

// ---------------------------------------------------------------------------------------------------------------
// Text wherever it's defined: the string literals in an ad's folder, matched against what the element shows.

type LiteralKind = "string" | "template" | "jsx-text" | "jsx-attr";
type Lit = {
  /** Offset of the literal's start: its quote or backtick, or the first non-space character of JSX text. */
  start: number;
  /** The range an edit replaces. */
  range: [number, number];
  kind: LiteralKind;
  /** What it shows: escapes resolved, entities decoded, JSX text's whitespace collapsed. */
  value: string;
  /** Its quote, for a string or attribute. */
  quote?: string;
  /** Raw newlines in a template, kept as they are when it's rewritten. */
  multiline?: boolean;
  /** "always": never a match (a class name, a knob id). "contains": only an exact match counts (it looks like CSS). */
  quiet?: "always" | "contains";
};

/** Wrappers around an expression that are TS but not a type. Any other TS node above a literal makes it a type. */
const TS_EXPRESSION = new Set(["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "TSInstantiationExpression", "TSExportAssignment"]);
const MODULE = new Set(["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression", "TSExternalModuleReference", "TSImportType", "ImportAttribute"]);
/** Host attributes that hold words. Any other attribute on a host element is markup (d, viewBox, fill, href). */
const TEXT_ATTRS = new Set(["alt", "title", "aria-label", "aria-description", "placeholder", "value", "label", "content"]);
/** Props, keys and attributes that never hold words, even on a component. */
const NOT_TEXT = new Set([
  "className", "class", "key", "id", "ref", "src", "href", "d", "style", "as", "fill", "stroke", "transform", "viewBox", "xmlns", "points",
  "ease", "easing", "variant", "icon", "path", "url", "type", "kind", "align", "dir", "lang", "font", "fontFamily", "fontWeight", "color",
  "background", "backgroundColor", "backgroundImage", "border", "borderColor", "boxShadow", "textShadow", "filter", "clipPath", "mask",
  "mixBlendMode", "transition", "transformOrigin", "objectFit", "objectPosition", "display", "position", "flexDirection", "justifyContent",
  "alignItems", "alignSelf", "textAlign", "direction", "whiteSpace", "overflow", "fontStyle", "textTransform", "letterSpacing", "lineHeight",
  "width", "height", "top", "left", "right", "bottom", "margin", "padding", "gap", "inset", "translate", "rotate", "scale", "opacity", "zIndex",
  "gridTemplateColumns", "gridTemplateRows", "cursor", "pointerEvents", "userSelect", "fontVariantNumeric", "fontFeatureSettings", "writingMode",
  "textDecoration", "outline", "borderRadius", "strokeLinecap", "strokeLinejoin", "strokeDasharray", "unicodeBidi", "accent", "ink", "paper",
  "voice", "music", "sfx", "audio", "video", "image", "img", "photo", "file", "slug", "scene", "seed", "ratio", "id",
]);
/** Calls whose string arguments are names, not words: knobs, seeds, files, class lists. */
const NAME_CALLS = new Set(["k", "nudge", "at", "random", "staticFile", "useTune", "require", "cn", "clsx", "classNames", "cue", "asset", "loadFont", "querySelector", "getElementById", "addEventListener", "useTimeline", "useCue"]);
const CSS_VALUE = [
  /^#[0-9a-f]{3,8}$/i,
  /^(rgba?|hsla?|oklch|oklab|lab|lch|color-mix|var|calc|min|max|clamp|url|linear-gradient|radial-gradient|conic-gradient|repeating-[a-z-]+|cubic-bezier|steps|translate\w*|rotate\w*|scale\w*|skew\w*|matrix\w*|perspective|blur|brightness|contrast|drop-shadow|grayscale|saturate|sepia|inset|polygon|circle|ellipse|path)\(/i,
  /^-?\d*\.?\d+(px|em|rem|deg|rad|turn|ms|vh|vw|vmin|vmax|fr|ch|ex|pt)(\s+-?\d*\.?\d+(px|em|rem|deg|rad|turn|ms|vh|vw|vmin|vmax|fr|ch|ex|pt|%)?)*$/,
  /^[a-z0-9_:/[\].#-]+( [a-z0-9_:/[\].#-]+)*$/, // all-lowercase ASCII tokens (class lists, ids, easing names, keywords) when one has a dash
];
const looksLikeCss = (value: string) =>
  CSS_VALUE.slice(0, 3).some((pattern) => pattern.test(value.trim())) || (CSS_VALUE[3].test(value.trim()) && /[-:]/.test(value));

const calleeName = (call: Node) => (call.callee?.type === "Identifier" ? call.callee.name : call.callee?.type === "MemberExpression" && !call.callee.computed ? call.callee.property?.name : undefined);
const keyName = (prop: Node) => (prop.key?.type === "Identifier" ? prop.key.name : prop.key?.type === "Literal" ? String(prop.key.value) : undefined);

/** Never text: an import source, an object key, a type, a directive, a tagged template, the desk's own tags. */
function structural(node: Node, parents: Node[]) {
  const parent = parents.at(-1);
  if (!parent) return false;
  if (MODULE.has(parent.type)) return true;
  if (parent.type === "ExpressionStatement" && parent.directive) return true;
  if ((parent.type === "Property" || parent.type === "PropertyDefinition" || parent.type === "MethodDefinition" || parent.type === "AccessorProperty") && parent.key === node) return true;
  if (parent.type === "TaggedTemplateExpression") return true;
  if (parent.type === "CallExpression" && calleeName(parent) === "require") return true;
  if (parents.some((p) => p.type.startsWith("TS") && !TS_EXPRESSION.has(p.type))) return true;
  const attr = parents.findLast((p) => p.type === "JSXAttribute");
  if (attr && attrName(attr).startsWith("data-nk")) return true;
  return false;
}

/** Whether a literal can't be the words on screen, from where it sits. */
function nameLike(node: Node, parents: Node[]) {
  const parent = parents.at(-1)!;
  for (let i = parents.length - 1; i >= 0; i--) {
    const p = parents[i];
    if (p.type === "JSXAttribute") {
      const name = attrName(p);
      if (name === "style" || name === "className" || name.startsWith("data-") || /^on[A-Z]/.test(name)) return true;
      const tagged = parents[i - 1]?.type === "JSXOpeningElement" ? parents[i - 1] : undefined;
      const host = tagged?.name?.type === "JSXIdentifier" && /^[a-z]/.test(tagged.name.name);
      return host ? !TEXT_ATTRS.has(name) : NOT_TEXT.has(name);
    }
    if (p.type === "JSXElement" || p.type === "JSXFragment") break;
  }
  if (parent.type === "Property" && parent.value === node && NOT_TEXT.has(keyName(parent) ?? "")) return true;
  if (parent.type === "CallExpression" && parent.arguments?.includes(node) && NAME_CALLS.has(calleeName(parent) ?? "")) return true;
  if (parent.type === "BinaryExpression" && /^[!=]==?$/.test(parent.operator)) return true;
  if (parent.type === "SwitchCase" && parent.test === node) return true;
  if (parent.type === "MemberExpression" && parent.computed && parent.property === node) return true;
  if (parent.type === "AssignmentPattern" && parent.right === node && parents.at(-2)?.type === "Property" && NOT_TEXT.has(keyName(parents.at(-2)!) ?? "")) return true;
  return false;
}

/** Every string literal in a file that could be text: strings, plain templates, JSX text and attribute strings. */
function literalsIn(file: string, code: string, program: Node) {
  const found: Lit[] = [];
  walk(program, (node, parents) => {
    let lit: Lit | undefined;
    if (node.type === "Literal" && typeof node.value === "string") {
      if (structural(node, parents)) return;
      const inAttr = parents.at(-1)?.type === "JSXAttribute";
      lit = {
        start: node.start,
        range: [node.start, node.end],
        kind: inAttr ? "jsx-attr" : "string",
        value: inAttr ? decode(node.value) : node.value,
        quote: code[node.start],
      };
    } else if (node.type === "TemplateLiteral" && node.expressions.length === 0 && typeof node.quasis[0]?.value?.cooked === "string") {
      if (structural(node, parents)) return false;
      lit = { start: node.start, range: [node.start, node.end], kind: "template", value: node.quasis[0].value.cooked, multiline: /\n/.test(node.quasis[0].value.raw) };
    } else if (node.type === "JSXText" && node.raw.trim()) {
      const raw: string = node.raw;
      const lead = raw.length - raw.trimStart().length;
      const trail = raw.length - raw.trimEnd().length;
      lit = { start: node.start + lead, range: [node.start + lead, node.end - trail], kind: "jsx-text", value: decode(jsxText(raw)) };
    }
    if (!lit) return;
    if (lit.kind !== "jsx-text" && nameLike(node, parents)) lit.quiet = "always";
    else if (!/[\p{L}\p{N}]/u.test(lit.value)) lit.quiet = "always";
    else if (lit.kind !== "jsx-text" && looksLikeCss(lit.value)) lit.quiet = "contains";
    found.push(lit);
  });
  return found;
}

type Scanned = { rel: string; hash: string; starts: number[]; lits: (Lit & { norm: string; compact: string; lower: string })[] };
const scans = new Map<string, { mtime: number; size: number; scan: Scanned }>();

/** Removes what text shows without being text: bidi marks, zero widths, soft hyphens. Whitespace becomes one space. */
const norm = (text: string) =>
  text
    .normalize("NFC")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\u061c\ufeff\u00ad]/g, "")
    .replace(/\s+/gu, " ")
    .trim();

function scan(file: string): Scanned | undefined {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    return undefined;
  }
  if (stat.size > 2_000_000) return undefined;
  const cached = scans.get(file);
  if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) return cached.scan;
  const code = readFileSync(file, "utf8");
  const rel = toRel(file);
  const program = parse(rel, code);
  const lits = program
    ? literalsIn(rel, code, program).map((lit) => {
        const n = norm(lit.value);
        return { ...lit, norm: n, compact: n.replace(/ /g, ""), lower: n.toLowerCase() };
      })
    : [];
  const result: Scanned = { rel, hash: hashOf(code), starts: lineStarts(code), lits };
  scans.set(file, { mtime: stat.mtimeMs, size: stat.size, scan: result });
  return result;
}

function codeFiles(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) codeFiles(path, out);
    else if (CODE.test(entry.name) && !/\.d\.[cm]?ts$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** How many matches one text may give and still say where the text is. */
const FEW = 6;

/**
 * The literals in the ad's folder that the shown texts come from, best first. texts[0] is the clicked element's own
 * text, then its parents'. The first text with a few exact matches wins; one with a few literals containing it (or
 * contained in it) adds to those.
 */
function textsIn(slug: string, texts: string[], near?: string): TextMatch[] {
  const dir = join(ADS, slug);
  if (!existsSync(dir)) return [];
  const scanned = codeFiles(dir)
    .map(scan)
    .filter((item): item is Scanned => !!item);
  type Hit = { scanned: Scanned; lit: Scanned["lits"][number]; score: number; match: TextMatch["match"] };
  const order = (a: Hit, b: Hit) =>
    a.score - b.score || Number(b.scanned.rel === near) - Number(a.scanned.rel === near) || a.scanned.rel.localeCompare(b.scanned.rel) || a.lit.start - b.lit.start;
  const sets = texts.map((text) => {
    const t = norm(text);
    const exact: Hit[] = [];
    const contains: Hit[] = [];
    if (!t) return { exact, contains };
    const compact = t.replace(/ /g, "");
    const lower = t.toLowerCase();
    for (const item of scanned)
      for (const lit of item.lits) {
        if (lit.quiet === "always" || !lit.norm) continue;
        const hit = (score: number, match: TextMatch["match"]) => (match === "exact" ? exact : contains).push({ scanned: item, lit, score, match });
        if (lit.norm === t) hit(0, "exact");
        else if (lit.compact === compact || lit.lower === lower) hit(0.5, "exact");
        else if (lit.quiet === "contains") continue;
        else if (lit.norm.includes(t)) hit(1 + (1 - t.length / lit.norm.length), "contains");
        else if (compact.length > 1 && lit.compact.includes(compact)) hit(1.5 + (1 - compact.length / lit.compact.length), "contains");
        else if (lit.norm.length >= 3 && t.includes(lit.norm)) hit(2 + (1 - lit.norm.length / t.length), "contains");
      }
    return { exact: exact.sort(order), contains: contains.sort(order) };
  });
  const few = (list: Hit[]) => list.length > 0 && list.length <= FEW;
  let hits = [...(sets.find((set) => few(set.exact))?.exact ?? []), ...(sets.find((set) => few(set.contains))?.contains ?? [])];
  if (!hits.length) {
    // Every text is ambiguous: the smallest set, exact before contains.
    const candidates = sets.flatMap((set) => [set.exact, set.contains]).filter((list) => list.length);
    hits = candidates.sort((a, b) => a.length - b.length || a[0].score - b[0].score)[0] ?? [];
  }
  const seen = new Set<string>();
  const out: TextMatch[] = [];
  for (const hit of hits) {
    const { line, col } = lineCol(hit.scanned.starts, hit.lit.start);
    const loc = `${hit.scanned.rel}:${line}:${col}`;
    if (seen.has(loc)) continue;
    seen.add(loc);
    out.push({ loc, file: hit.scanned.rel, line, value: short(hit.lit.value, 300), hash: hit.scanned.hash, match: hit.match, kind: hit.lit.kind });
    if (out.length >= FEW) break;
  }
  return out;
}

/**
 * The element at loc. With `texts`, also the literals in the ad's folder that show that text (`texts` on the reply).
 * `slug` names the ad for an element in src/parts/, whose text an ad passes in.
 */
export function elementAt(loc: string, texts: string[] = [], slug?: string): ElementInfo {
  const { file, rel, line, col, slug: own } = fileOf(loc);
  const code = readFileSync(file, "utf8");
  const { element, parents } = find(rel, code, line, col);
  const { style, props, attrs, textInfo, styleMode } = analyse(element, code);
  const ad = own ?? (slug && /^[a-z0-9][a-z0-9_-]*$/i.test(slug) && existsSync(join(ADS, slug)) ? slug : undefined);
  const asked = texts.map((text) => String(text).slice(0, 300)).filter((text) => text.trim()).slice(0, 6);
  return {
    file: rel,
    loc: `${rel}:${line}:${col}`,
    hash: hashOf(code),
    tag: hostTag(element)!,
    component: componentOf(parents),
    ...(ad ? { slug: ad } : {}),
    ...(textInfo ? { text: textInfo } : {}),
    style: style.map((target) => target.field),
    styleMode,
    props: props.map((target) => target.field),
    attrs: attrs.map((attr) => attr.info),
    ...(asked.length ? { texts: ad ? textsIn(ad, asked, rel) : [] } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Writing.

function numberCode(value: number) {
  const rounded = Number(value.toFixed(4));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** The source text for a new value, written to fit where it goes. */
function write(value: number | string, context: Target["context"]) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new SourceError(400, "That isn't a number.");
    const text = numberCode(value);
    return context === "jsx-attr" ? `{${text}}` : text;
  }
  if (context === "expression") return JSON.stringify(value);
  // JSX text and attribute strings have no escapes and decode &entities;, so anything awkward becomes {"..."}.
  if (context === "jsx-attr") return /["\\&\r\n]|[\u0000-\u001f]/.test(value) ? `{${JSON.stringify(value)}}` : `"${value}"`;
  return !value || value !== value.trim() || /[{}<>&\r\n]|[\u0000-\u001f]/.test(value) ? `{${JSON.stringify(value)}}` : value;
}

const control = (c: string) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;

/** A literal's new source, in its own kind: the quotes it had, a template's backticks, JSX text's whitespace. */
function writeLiteral(lit: Lit, value: string): { text: string; shift: number } {
  if (lit.kind === "string") {
    if (lit.quote !== "'") return { text: JSON.stringify(value), shift: 0 };
    const body = value.replace(/[\\'\n\r\u2028\u2029]|[\u0000-\u001f]/g, (c) =>
      c === "\\" ? "\\\\" : c === "'" ? "\\'" : c === "\n" ? "\\n" : c === "\r" ? "\\r" : control(c),
    );
    return { text: `'${body}'`, shift: 0 };
  }
  if (lit.kind === "template") {
    const body = value.replace(/\\|`|\$\{|\r|\n|[\u0000-\u0009\u000b-\u001f]/g, (c) =>
      c === "\\" ? "\\\\" : c === "`" ? "\\`" : c === "${" ? "\\${" : c === "\r" ? "\\r" : c === "\n" ? (lit.multiline ? "\n" : "\\n") : control(c),
    );
    return { text: `\`${body}\``, shift: 0 };
  }
  if (lit.kind === "jsx-attr") {
    const quote = lit.quote === "'" ? "'" : '"';
    if (value.includes(quote) || /[&\r\n]|[\u0000-\u001f]/.test(value)) return { text: `{${JSON.stringify(value)}}`, shift: 1 };
    return { text: `${quote}${value}${quote}`, shift: 0 };
  }
  const text = write(value, "jsx-text");
  return { text, shift: text.startsWith("{") ? 1 : 0 };
}

/** A style key as code: a name, or a quoted custom property. */
function styleKey(name: string) {
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) return name;
  if (/^--[a-zA-Z0-9_-]+$/.test(name)) return JSON.stringify(name);
  throw new SourceError(400, `${name} isn't a style property name. Use camelCase (fontSize) or a --custom-property.`);
}

const valueCode = (value: number | string) => (typeof value === "number" ? write(value, "expression") : JSON.stringify(value));

/** The code with `text` (`name: value`) added as the object's last property, laid out like the ones before it. */
function addProperty(code: string, object: Node, text: string) {
  const props = object.properties as Node[];
  const close = object.end - 1;
  if (!props.length) return code.slice(0, object.start + 1) + ` ${text} ` + code.slice(close);
  const last = props[props.length - 1];
  const opening = code.slice(object.start + 1, props[0].start);
  const between = props.length > 1 ? code.slice(props[props.length - 2].end, last.start) : undefined;
  let gap: string;
  if (between !== undefined && /^\s*,\s*$/.test(between)) gap = between.slice(between.indexOf(",") + 1);
  else if (opening.includes("\n")) gap = opening.slice(opening.lastIndexOf("\n") - (opening[opening.lastIndexOf("\n") - 1] === "\r" ? 1 : 0));
  else gap = " ";
  if (!gap) gap = " ";
  // A comment at the end of the last property's line stays with it.
  const pastComment = (at: number) => at + (/^[ \t]*(\/\/[^\r\n]*|\/\*[^\r\n]*?\*\/)/.exec(code.slice(at, close))?.[0].length ?? 0);
  const comma = /^\s*,/.exec(code.slice(last.end, close));
  if (comma) {
    const at = pastComment(last.end + comma[0].length);
    return code.slice(0, at) + gap + text + "," + code.slice(at);
  }
  const at = gap.includes("\n") ? pastComment(last.end) : last.end;
  return code.slice(0, last.end) + "," + code.slice(last.end, at) + gap + text + code.slice(at);
}

/** The code without one attribute and the space before it. */
function removeAttribute(code: string, attr: Node) {
  let from = attr.start;
  while (from > 0 && /\s/.test(code[from - 1])) from--;
  return code.slice(0, from) + code.slice(attr.end);
}

/** The code with an attribute added after the opening tag's last one. */
function addAttribute(code: string, opening: Node, text: string) {
  const attributes = opening.attributes as Node[];
  const at = attributes.length ? attributes[attributes.length - 1].end : opening.name.end;
  return code.slice(0, at) + " " + text + code.slice(at);
}

const attrCode = (name: string, value: string) => `${name}=${/["&\r\n]|[\u0000-\u001f]/.test(value) ? `{${JSON.stringify(value)}}` : `"${value}"`}`;

const ATTR_NAME = /^data-[a-z][a-z0-9-]*$/;
const shown = (value: unknown) => (typeof value === "string" ? `"${short(value.replace(/\s+/g, " "), 40)}"` : String(value));

/** One edit to an element, as the new code and a label for the history. */
function editElement(code: string, rel: string, line: number, col: number, edit: Exclude<SourceEdit, { kind: "literal" }>) {
  const { element } = find(rel, code, line, col);
  const parts = analyse(element, code);
  const value = edit.value;
  const replace = (target: Target, next: number | string) => code.slice(0, target.range[0]) + write(next, target.context) + code.slice(target.range[1]);

  if (edit.kind === "text" || edit.kind === "prop") {
    if (typeof value !== "number" && typeof value !== "string") throw new SourceError(400, "A value is a number or a string.");
    if (edit.kind === "text" && typeof value !== "string") throw new SourceError(400, "Text is a string.");
    const target = edit.kind === "text" ? parts.text : parts.props.findLast((item) => item.field.name === edit.name);
    if (!target) throw new SourceError(400, `The element has no ${edit.kind === "text" ? "text" : `prop ${edit.name}`}.`);
    if (!target.field.editable) throw new SourceError(400, `${target.field.name} isn't a plain value here: change it in the code.`);
    const label = edit.kind === "text" ? `Text ${shown(target.field.value)} → ${shown(value)}` : `${edit.name} ${shown(target.field.value)} → ${shown(value)}`;
    return { after: replace(target, value), label };
  }

  if (edit.kind === "style") {
    if (typeof edit.name !== "string" || !edit.name) throw new SourceError(400, "Which style property?");
    if (value !== null && typeof value !== "number" && typeof value !== "string") throw new SourceError(400, "A style value is a number, a string or null.");
    const target = parts.style.findLast((item) => item.field.name === edit.name);
    if (target) {
      if (!target.field.editable) throw new SourceError(400, `${edit.name} is \`${short(target.field.code, 60)}\` here, not a plain value: change it in the code.`);
      if (value !== null) return { after: replace(target, value), label: `${edit.name} ${shown(target.field.value)} → ${shown(value)}` };
      const props = parts.styleObject!.properties as Node[];
      const index = props.indexOf(target.node!);
      if (props.length === 1) return { after: removeAttribute(code, parts.styleAttr!), label: `Remove ${edit.name}` };
      const after =
        index < props.length - 1
          ? code.slice(0, target.node!.start) + code.slice(props[index + 1].start)
          : code.slice(0, props[index - 1].end) + code.slice(target.node!.end);
      return { after, label: `Remove ${edit.name}` };
    }
    if (value === null) return { after: code, label: "" };
    const text = `${styleKey(edit.name)}: ${valueCode(value)}`;
    if (parts.styleMode === "other") {
      const why = parts.styleAttr ? `Its style is ${short(code.slice(parts.styleAttr.start, parts.styleAttr.end), 60)}` : `It spreads ${short(code.slice(parts.spread!.start, parts.spread!.end), 40)}, which may carry a style`;
      throw new SourceError(400, `${why}, not a style={{ … }} list, so the desk can't add ${edit.name} here: change it in the code.`);
    }
    const after = parts.styleObject ? addProperty(code, parts.styleObject, text) : addAttribute(code, parts.opening, `style={{ ${text} }}`);
    return { after, label: `${edit.name} → ${shown(value)}` };
  }

  if (edit.kind === "attr") {
    if (typeof edit.name !== "string" || !ATTR_NAME.test(edit.name) || edit.name.startsWith("data-nk")) throw new SourceError(400, "Only data-* attributes can be set here (and not data-nk).");
    if (value !== null && typeof value !== "string") throw new SourceError(400, "An attribute's value is a string or null.");
    const found = parts.attrs.findLast((attr) => attr.info.name === edit.name);
    if (found) {
      if (!found.info.editable) throw new SourceError(400, `${edit.name} is ${short(found.info.code, 60)} here, not a plain string: change it in the code.`);
      if (value === null) return { after: removeAttribute(code, found.node), label: `Remove ${edit.name}` };
      return { after: code.slice(0, found.node.start) + attrCode(edit.name, value) + code.slice(found.node.end), label: `${edit.name} → ${shown(value)}` };
    }
    if (value === null) return { after: code, label: "" };
    return { after: addAttribute(code, parts.opening, attrCode(edit.name, value)), label: `${edit.name} → ${shown(value)}` };
  }
  throw new SourceError(400, "An edit is text, literal, style, prop or attr.");
}

/** Writes the edit and records it in the ad's history. A history that can't be saved doesn't undo the edit. */
function commit(slug: string, file: string, rel: string, before: string, after: string, label: string, key: string) {
  writeAtomic(file, after);
  try {
    record(slug, "source", label, [{ path: rel, before, after }], key);
  } catch (error) {
    console.warn(`[desk] the edit to ${rel} was made but not added to the history: ${(error as Error).message}`);
  }
}

const cleanLabel = (label: unknown) => (typeof label === "string" && label.trim() ? label.trim().slice(0, 200) : undefined);

export function editSource(loc: string, hash: string, edit: SourceEdit, label?: string): EditReply {
  if (!edit || typeof edit !== "object") throw new SourceError(400, "No edit.");
  if (edit.kind === "literal") return editLiteral(loc, hash, edit.value, label);
  const { file, rel, line, col, inAds, slug } = fileOf(loc);
  if (!inAds) throw new SourceError(403, "That's in the parts bin, shared by every ad. Ask the agent.");
  if (!slug) throw new SourceError(403, "That file isn't in an ad's folder.");
  const before = readFileSync(file, "utf8");
  if (hashOf(before) !== hash) throw new SourceError(409, "The file changed since you opened it.", hashOf(before));
  const { after, label: auto } = editElement(before, rel, line, col, edit);
  const reply: EditReply = { ok: true, hash: hashOf(after), loc: `${rel}:${line}:${col}`, file: rel };
  if (after === before) return reply;
  // Every edit is inside the element, after its `<`, so the element keeps its line and column. An edit that would
  // break the file isn't written.
  try {
    find(rel, after, line, col);
  } catch {
    throw new SourceError(400, "That value would break the file, so it wasn't written.");
  }
  commit(slug, file, rel, before, after, cleanLabel(label) ?? auto, `${rel}:${line}:${col}:${edit.kind}:${"name" in edit ? edit.name : ""}`);
  return reply;
}

/** Replaces the literal that starts at loc, in any code file in an ad's folder. */
function editLiteral(loc: string, hash: string, value: unknown, label?: string): EditReply {
  if (typeof value !== "string") throw new SourceError(400, "Text is a string.");
  const { file, rel, line, col, inAds, slug } = fileOf(loc, true);
  if (!inAds) throw new SourceError(403, "That's in the parts bin, shared by every ad. Ask the agent.");
  if (!slug) throw new SourceError(403, "That file isn't in an ad's folder.");
  const before = readFileSync(file, "utf8");
  if (hashOf(before) !== hash) throw new SourceError(409, "The file changed since you opened it.", hashOf(before));
  const program = parse(rel, before);
  if (!program) throw new SourceError(409, "The file doesn't parse right now. Fix it in the code first.", hashOf(before));
  const offset = offsetOf(before, line, col);
  const lit = literalsIn(rel, before, program).find((item) => item.start === offset);
  if (!lit) throw new SourceError(404, "No text there. Did the file change?", hashOf(before));
  const { text, shift } = writeLiteral(lit, value);
  const after = before.slice(0, lit.range[0]) + text + before.slice(lit.range[1]);
  const at = lit.range[0] + shift;
  const { line: newLine, col: newCol } = lineCol(lineStarts(after), at);
  const reply: EditReply = { ok: true, hash: hashOf(after), loc: `${rel}:${newLine}:${newCol}`, file: rel };
  if (after === before) return reply;
  const parsed = parse(rel, after);
  const again = parsed && literalsIn(rel, after, parsed).find((item) => item.start === at);
  if (!again || again.value !== (lit.kind === "jsx-text" && !shift ? decode(jsxText(value)) : value))
    throw new SourceError(400, "That text would break the file, so it wasn't written.");
  commit(slug, file, rel, before, after, cleanLabel(label) ?? `Text ${shown(lit.value)} → ${shown(value)}`, `${rel}:${offset}:literal`);
  return reply;
}

/** The desk's Ctrl+Z: one step back in that ad's history (or the last ad the desk changed). */
export function undoSource(slug?: string): HistoryMove & { ok: true; file?: string; hash?: string } {
  const moved = undo(slug);
  const file = moved.changed[0];
  const text = file && existsSync(resolve(ROOT, file)) ? readFileSync(resolve(ROOT, file), "utf8") : undefined;
  return { ok: true, ...moved, ...(file ? { file } : {}), ...(text !== undefined ? { hash: hashOf(text) } : {}) };
}
