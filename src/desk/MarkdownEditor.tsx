/**
 * A Markdown editor in the manner of Obsidian, on CodeMirror 6 (spec.md §10.11). "live" shows the text formatted as you
 * write it: headings large, bold bold, code and links styled, and the marks that make them (#, **, `, [](...)) hidden
 * except on the lines the cursor is on. "source" is the plain text with line numbers. The file itself is never
 * reformatted: what you type is what's saved.
 */
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import { Compartment, EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, keymap, lineNumbers, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

type Props = { value: string; onChange: (text: string) => void; onSave: () => void; readOnly: boolean; live: boolean };

class Bullet extends WidgetType {
  toDOM() {
    const dot = document.createElement("span");
    dot.className = "cm-bullet";
    dot.textContent = "•";
    return dot;
  }
}

const hide = Decoration.replace({});
const bullet = Decoration.replace({ widget: new Bullet() });
const line = (className: string) => Decoration.line({ class: className });
const mark = (className: string) => Decoration.mark({ class: className });

/** The lines of an agent's front matter at the top (---, fields, ---), which Markdown would read as a heading. */
function frontMatterEnd(state: EditorState) {
  if (state.doc.line(1).text !== "---") return 0;
  for (let n = 2; n <= state.doc.lines; n++) if (state.doc.line(n).text === "---") return state.doc.line(n).to;
  return 0;
}

/** Live preview: style what the Markdown means, and hide its marks away from the cursor. */
function decorate(view: EditorView): DecorationSet {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];
  const front = frontMatterEnd(state);
  // The lines the cursor or a selection touches show their Markdown as written.
  const active = new Set<number>();
  for (const range of state.selection.ranges)
    for (let n = state.doc.lineAt(range.from).number; n <= state.doc.lineAt(range.to).number; n++) active.add(n);
  const shown = (pos: number) => active.has(state.doc.lineAt(pos).number);
  const eachLine = (from: number, to: number, className: string) => {
    for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n++) ranges.push(line(className).range(state.doc.line(n).from));
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.from < front) return;
        const name = node.name;
        const heading = name.match(/^(?:ATXHeading|SetextHeading)(\d)$/);
        if (heading) ranges.push(line(`cm-h cm-h${heading[1]}`).range(state.doc.lineAt(node.from).from));
        else if (name === "HeaderMark") {
          if (!shown(node.from)) {
            const after = state.doc.sliceString(node.to, node.to + 1) === " " ? 1 : 0;
            ranges.push(hide.range(node.from, node.to + after));
          }
        } else if (name === "StrongEmphasis") ranges.push(mark("cm-strong").range(node.from, node.to));
        else if (name === "Emphasis") ranges.push(mark("cm-em").range(node.from, node.to));
        else if (name === "Strikethrough") ranges.push(mark("cm-strike").range(node.from, node.to));
        else if (name === "EmphasisMark" || name === "StrikethroughMark") {
          if (!shown(node.from)) ranges.push(hide.range(node.from, node.to));
        } else if (name === "InlineCode") ranges.push(mark("cm-code").range(node.from, node.to));
        else if (name === "CodeMark") {
          // Inline code's backticks hide; a fence's ``` stays, dimmed, so the block's edges are visible.
          if (node.node.parent?.name === "InlineCode" && !shown(node.from)) ranges.push(hide.range(node.from, node.to));
          else ranges.push(mark("cm-dim").range(node.from, node.to));
        } else if (name === "FencedCode") {
          eachLine(node.from, node.to, "cm-fence");
          return false;
        } else if (name === "Link") ranges.push(mark("cm-link").range(node.from, node.to));
        else if (name === "LinkMark" || name === "URL") {
          if (node.node.parent?.name === "Link" && !shown(node.from)) ranges.push(hide.range(node.from, node.to));
        } else if (name === "ListMark") {
          const text = state.doc.sliceString(node.from, node.to);
          if (/^[-*+]$/.test(text) && !shown(node.from)) ranges.push(bullet.range(node.from, node.to));
          else ranges.push(mark("cm-dim").range(node.from, node.to));
        } else if (name === "Blockquote") eachLine(node.from, node.to, "cm-quote");
        else if (name === "QuoteMark") {
          if (!shown(node.from)) ranges.push(hide.range(node.from, Math.min(node.to + 1, state.doc.lineAt(node.from).to)));
        } else if (name === "HorizontalRule") {
          ranges.push(line("cm-hr").range(state.doc.lineAt(node.from).from));
          if (!shown(node.from)) ranges.push(hide.range(node.from, node.to));
        } else if (name === "Table") {
          eachLine(node.from, node.to, "cm-table");
          return false;
        }
      },
    });
  }
  return Decoration.set(ranges, true);
}

/** Marks the front matter's lines in both modes, so they read as plain fields and not as a heading. */
function frontLines(view: EditorView): DecorationSet {
  const end = frontMatterEnd(view.state);
  if (!end) return Decoration.none;
  const ranges: Range<Decoration>[] = [];
  for (let n = 1; n <= view.state.doc.lineAt(end).number; n++) ranges.push(line("cm-front").range(view.state.doc.line(n).from));
  return Decoration.set(ranges);
}

const frontMatter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = frontLines(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged) this.decorations = frontLines(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorate(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = decorate(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Colours for the Markdown syntax, in the desk's palette. Used in both modes. */
const highlight = HighlightStyle.define([
  { tag: tags.heading, color: "var(--text)", fontWeight: "650" },
  { tag: tags.strong, fontWeight: "650" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "var(--blue)" },
  { tag: tags.url, color: "var(--text-3)" },
  { tag: tags.monospace, color: "#e0b97a" },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: "var(--text-3)" },
  { tag: tags.quote, color: "var(--text-2)" },
]);

const theme = EditorView.theme(
  {
    "&": { height: "100%", color: "var(--text)", backgroundColor: "transparent" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { overflow: "auto" },
    ".cm-cursor": { borderLeftColor: "var(--text)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "rgba(13, 153, 255, 0.3) !important" },
    ".cm-gutters": { backgroundColor: "transparent", color: "var(--text-3)", border: "none", borderInlineEnd: "1px solid var(--line-soft)" },
    ".cm-activeLine": { backgroundColor: "transparent" },
  },
  { dark: true },
);

export function MarkdownEditor({ value, onChange, onSave, readOnly, live }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const mode = useRef(new Compartment());
  const lock = useRef(new Compartment());
  // The latest callbacks, for the editor's listeners, which are set up once.
  const handlers = useRef({ onChange, onSave });
  handlers.current = { onChange, onSave };

  const modeExtensions = (isLive: boolean) => (isLive ? [livePreview, EditorView.contentAttributes.of({ class: "cm-live" })] : [lineNumbers(), EditorView.contentAttributes.of({ class: "cm-source" })]);

  useEffect(() => {
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([{ key: "Mod-s", preventDefault: true, run: () => (handlers.current.onSave(), true) }, ...defaultKeymap, ...historyKeymap]),
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(highlight),
          frontMatter,
          EditorView.lineWrapping,
          EditorView.perLineTextDirection.of(true), // Hebrew lines run right to left.
          theme,
          mode.current.of(modeExtensions(live)),
          lock.current.of(EditorState.readOnly.of(readOnly)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) handlers.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    return () => view.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new file, Discard or "See the default" changes the text from outside.
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);
  useEffect(() => void view.current?.dispatch({ effects: mode.current.reconfigure(modeExtensions(live)) }), [live]);
  useEffect(() => void view.current?.dispatch({ effects: lock.current.reconfigure(EditorState.readOnly.of(readOnly)) }), [readOnly]);

  return <div className={`md-editor ${live ? "live" : "source"}`} ref={host} />;
}
