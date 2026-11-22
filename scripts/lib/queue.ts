/** Reads the markdown the workflow scripts share: pitch.md, brand.md, sources.txt. Lenient on purpose: it's prose. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

export const HEBREW = /[֐-׿יִ-ﭏ]/;
export const stripNiqqud = (text: string) => text.replace(/[֑-ׇֽֿׁׂׅׄ]/g, "");

/** One frame every quarter of a second, and always the last. */
export function quarterFrames({ frames, fps }: { frames: number; fps: number }) {
  const count = Math.floor(((frames - 1) * 4) / fps) + 1;
  return [...new Set([...Array.from({ length: count }, (_, i) => Math.round((i * fps) / 4)), frames - 1])];
}

export type Table = { header: string[]; rows: string[][] };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());

/** Every pipe table in the text. */
export function tables(text: string): Table[] {
  const found: Table[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].trim().startsWith("|") || !/^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) || !lines[i + 1].includes("-")) continue;
    const header = cells(lines[i]).map((cell) => cell.toLowerCase());
    const rows: string[][] = [];
    let at = i + 2;
    for (; at < lines.length && lines[at].trim().startsWith("|"); at++) rows.push(cells(lines[at]));
    found.push({ header, rows });
    i = at - 1;
  }
  return found;
}

/** The body under the first heading matching `title`, up to the next heading of the same or a higher level. */
export function section(text: string, title: RegExp) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^#{1,6}\s/.test(line) && title.test(line.replace(/^#+\s*/, "")));
  if (start < 0) return "";
  const level = lines[start].match(/^#+/)![0].length;
  const end = lines.findIndex((line, i) => i > start && (line.match(/^(#{1,6})\s/)?.[1].length ?? 99) <= level);
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

/** `key: value` on a line of its own, bold or as a bullet is fine. */
export function field(text: string, key: string) {
  const value = text.match(new RegExp(`^[\\s>*-]*\\**${key}\\**\\s*:\\**\\s*(.+)$`, "im"))?.[1].trim();
  return value && !/^<.*>$/.test(value) ? value : undefined;
}

/** A cell with no content: empty, a dash, or an unfilled <placeholder>. */
const blank = (cell = "") => !cell.trim() || /^[-–—]+$/.test(cell.trim()) || /^<[^>]*>$/.test(cell.trim());

const column = (table: Table, name: RegExp) => table.header.findIndex((cell) => name.test(cell));

const DATED = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

/** The kits in brands/, longest first, so with kits `myapp` and `myapp-pro`, `myapp-pro-launch` reads as myapp-pro. */
const kitDirs = () => {
  const root = join(ROOT, "brands");
  return existsSync(root) ? readdirSync(root).filter((name) => !/^[_.]/.test(name)).sort((a, b) => b.length - a.length) : [];
};

/**
 * A queue folder's name is `<date>-<brand>-<slug>`: the brand is a kit in brands/, or, for work that isn't any
 * brand's ad, one word that says what it is (`benchmark`). Older folders without one read as `<date>-<slug>`.
 */
export function folderParts(name: string): { date: string; brand?: string; slug: string } | undefined {
  const [, date, rest] = name.match(DATED) ?? [];
  if (!date) return undefined;
  const kit = kitDirs().find((brand) => rest.startsWith(`${brand}-`));
  if (kit) return { date, brand: kit, slug: rest.slice(kit.length + 1) };
  const cut = rest.indexOf("-");
  return cut > 0 ? { date, brand: rest.slice(0, cut), slug: rest.slice(cut + 1) } : { date, slug: rest };
}

/** The ad's slug from its queue folder's name. */
export const folderSlug = (name: string) => folderParts(name)?.slug ?? name;

/** Finds the latest queue/<date>-<brand>-<slug>/ (or an older <date>-<slug>/). */
export function queueFolder(slug: string) {
  const root = join(ROOT, "queue");
  if (!existsSync(root)) return undefined;
  const name = readdirSync(root)
    .filter((entry) => DATED.test(entry) && (folderSlug(entry) === slug || entry.slice(11) === slug))
    .sort((a, b) => a.slice(0, 10).localeCompare(b.slice(0, 10)) || a.localeCompare(b))
    .at(-1);
  return name ? join(root, name) : undefined;
}

export const readIf = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : undefined);

export type Row = { number: number; start: number; end: number; happens: string; text: string; voice: string; image: string };

export type Pitch = { folder: string; text: string; idea: string; brand?: string; bpm?: number; rows: Row[]; problems: string[] };

/** "0:03", "1:02.5" or "3.5" in seconds. */
function seconds(value: string) {
  const match = value.trim().replace(/s$/, "").match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  return match ? Number(match[1] ?? 0) * 60 + Number(match[2]) : NaN;
}

const plain = (cell = "") =>
  blank(cell)
    ? ""
    : cell
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/^["“”׳״]+|["“”׳״]+$/g, "")
        .trim();

const imagePath = (cell = "") => (blank(cell) ? "" : (cell.match(/!?\[[^\]]*\]\(([^)]+)\)/)?.[1] ?? cell.replace(/`/g, "")).trim());

/** The idea is the first two lines under "## The idea". The storyboard is the table with a Time column. */
export function readPitch(folder: string): Pitch | undefined {
  const text = readIf(join(folder, "pitch.md"));
  if (text === undefined) return undefined;
  const idea = section(text, /idea/i)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s>*-]+/, "").trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n");

  const problems: string[] = [];
  const rows: Row[] = [];
  const table = tables(text).find((candidate) => column(candidate, /^time/) >= 0);
  if (table) {
    const at = {
      time: column(table, /^time/),
      happens: column(table, /happens/),
      text: column(table, /on.?screen/),
      voice: column(table, /^voice/),
      image: column(table, /^image/),
    };
    table.rows.forEach((cell, i) => {
      const number = i + 1;
      const [from, to] = (cell[at.time] ?? "").split(/\s*[-–—]\s*|\s+to\s+/);
      const start = seconds(from ?? "");
      const end = seconds(to ?? "");
      if (!(end > start)) {
        problems.push(`row ${number}: can't read time "${cell[at.time]}". Write start-end, like 0:03-0:06 or 3-6.`);
        return;
      }
      rows.push({
        number,
        start,
        end,
        happens: plain(cell[at.happens]),
        text: plain(cell[at.text]),
        voice: plain(cell[at.voice]),
        image: imagePath(cell[at.image]),
      });
    });
  }
  const bpm = Number(field(text, "bpm")?.match(/\d+(\.\d+)?/)?.[0]);
  return { folder, text, idea, brand: field(text, "brand"), bpm: bpm > 0 ? bpm : undefined, rows, problems };
}

export type Brand = {
  name: string;
  dir: string;
  text: string;
  colours: string[];
  fonts: { role: string; family: string; file?: string }[];
  logos: string[];
  url?: string;
  tagline?: string;
  facts: string;
  banned: string[];
};

export function brandNames() {
  const root = join(ROOT, "brands");
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((name) => !name.startsWith("_") && existsSync(join(root, name, "brand.md")));
}

export function readBrand(name: string): Brand | undefined {
  const dir = join(ROOT, "brands", name);
  const text = readIf(join(dir, "brand.md"));
  if (text === undefined) return undefined;

  const fontTable = tables(section(text, /^fonts?/i)).find((table) => column(table, /family/) >= 0);
  const fonts = (fontTable?.rows ?? []).flatMap((row) => {
    const family = row[column(fontTable!, /family/)];
    const file = row[column(fontTable!, /file/)];
    return blank(family) ? [] : [{ role: row[0], family: family.replace(/`/g, ""), file: blank(file) ? undefined : file?.replace(/`/g, "") }];
  });

  const filled = (body: string) => body.replace(/<[^>]*>/g, ""); // Unfilled template placeholders.
  const bulletsOrFirstCells = (body: string) => [
    ...body.split(/\r?\n/).flatMap((line) => line.match(/^\s*[-*]\s+(.+)$/)?.[1].trim() ?? []),
    ...tables(body).flatMap((table) => table.rows.map((row) => row[0])),
  ];

  return {
    name,
    dir,
    text,
    colours: [...filled(section(text, /colou?rs?|palette/i)).matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)].map(([hex]) => hex.toLowerCase()),
    fonts,
    logos: [...filled(section(text, /^logos?/i)).matchAll(/[\w./\\-]+\.(?:svg|png|webp|jpe?g)/gi)].map(([file]) => file),
    url: field(text, "url")?.match(/https?:\/\/\S+|[\w-]+(?:\.[\w-]+)+\S*/)?.[0],
    tagline: field(text, "tagline"),
    facts: section(text, /facts?/i),
    banned: bulletsOrFirstCells(section(text, /banned/i)).filter((claim) => !blank(claim)),
  };
}

/** The brand named in the pitch or the README. With neither, the only brand there is. */
export function brandFor(folder?: string, override?: string): { brand?: Brand; asked?: string } {
  const named = folder && folderParts(basename(folder))?.brand;
  const asked =
    override ??
    (folder && (field(readIf(join(folder, "pitch.md")) ?? "", "brand") ?? field(readIf(join(folder, "README.md")) ?? "", "brand"))) ??
    (named && existsSync(join(ROOT, "brands", named, "brand.md")) ? named : undefined);
  if (asked) return { brand: readBrand(asked), asked };
  const names = brandNames();
  return { brand: names.length === 1 ? readBrand(names[0]) : undefined };
}

/** The first of these places that holds the file: absolute, the queue folder, the repo, public/, the brand. */
export function locate(path: string, ...places: (string | undefined)[]) {
  if (isAbsolute(path)) return existsSync(path) ? path : undefined;
  return [...places, ROOT, join(ROOT, "public")].flatMap((place) => (place ? [join(place, path)] : [])).find((full) => existsSync(full));
}

/** Local folders listed in sources.txt, so README evidence can point inside the app's own repo. */
export function sourceFolders(brand?: Brand) {
  const text = brand && readIf(join(brand.dir, "sources.txt"));
  if (!text) return [];
  const paths = text.split(/\r?\n/).map((line) => parseSource(line)?.source).filter((source) => source && !/^https?:/i.test(source)) as string[];
  return [...new Set(paths.filter(isAbsolute).map((path) => (/\.\w+$/.test(path) ? dirname(path) : path)))];
}

export type Source = { hash?: string; date?: string; source: string };

/** `<hash> <date> <file or url>`, or just the file or url until brand-check has recorded it. # starts a comment. */
export function parseSource(line: string): Source | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;
  const match = trimmed.match(/^([0-9a-f]{16})\s+(\d{4}-\d{2}-\d{2})\s+(.+)$/);
  return match ? { hash: match[1], date: match[2], source: match[3] } : { source: trimmed };
}
