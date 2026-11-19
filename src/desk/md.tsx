/** Just enough Markdown for the desk: headings, paragraphs, lists, tables, quotes, code, bold, italics and links. No HTML is ever injected. */
import type { ReactNode } from "react";

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s)|]+)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const [token] = match;
    const k = `${key}-${at}`;
    if (match[1]) out.push(<code key={k}>{token.slice(1, -1)}</code>);
    else if (match[2]) out.push(<strong key={k}>{inline(token.slice(2, -2), at)}</strong>);
    else if (match[3]) out.push(<em key={k}>{inline(token.slice(1, -1), at)}</em>);
    else if (match[4]) {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      out.push(/^https?:/.test(href) ? <a key={k} href={href} target="_blank" rel="noreferrer">{inline(label, at)}</a> : <span key={k} className="md-ref">{inline(label, at)}</span>);
    } else if (match[5]) out.push(<a key={k} href={token} target="_blank" rel="noreferrer">{token}</a>);
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());

/** Renders Markdown as React elements. Each block gets dir="auto", so Hebrew lines sit right. */
export function Markdown({ text, className = "md" }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = blocks.length;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) body.push(lines[i]);
      i++;
      blocks.push(<pre key={key}>{body.join("\n")}</pre>);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 6);
      const Tag = `h${level}` as "h2";
      blocks.push(<Tag key={key} dir="auto">{inline(heading[2])}</Tag>);
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "") && lines[i + 1].includes("-")) {
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push(cells(lines[i]));
      blocks.push(
        <div key={key} className="md-table">
          <table>
            <thead>
              <tr>{head.map((cell, c) => <th key={c} dir="auto">{inline(cell)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>{row.map((cell, c) => <td key={c} dir="auto">{inline(cell.replace(/<br\s*\/?>/gi, " "))}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      for (; i < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length)); i++) {
        if (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items.push(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""));
        else items[items.length - 1] += ` ${lines[i].trim()}`;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={key}>{items.map((item, n) => <li key={n} dir="auto">{inline(item)}</li>)}</List>);
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      for (; i < lines.length && lines[i].startsWith(">"); i++) body.push(lines[i].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key} dir="auto">{inline(body.join(" "))}</blockquote>);
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key} />);
      i++;
      continue;
    }
    const body: string[] = [];
    for (; i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s+|\s*\|)/.test(lines[i]); i++) body.push(lines[i]);
    if (!body.length) body.push(lines[i++]);
    blocks.push(<p key={key} dir="auto">{inline(body.join(" "))}</p>);
  }
  return <div className={className}>{blocks}</div>;
}

/** One section of a Markdown file, by heading, as Markdown. */
export function sectionOf(text: string, title: RegExp) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#{1,6}\s/.test(line) && title.test(line.replace(/^#+\s*/, "")));
  if (start < 0) return "";
  const level = lines[start].match(/^#+/)![0].length;
  const end = lines.findIndex((line, i) => i > start && (line.match(/^(#{1,6})\s/)?.[1].length ?? 99) <= level);
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}
