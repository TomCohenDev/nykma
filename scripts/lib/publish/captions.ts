/**
 * The default copy for each platform, from the ad's post.md (spec.md §7.4): one `## <Platform>` section each. YouTube's
 * section starts with `Title: ...`. A platform with no section of its own takes the first of its fallbacks (info.ts),
 * and the publish dialog shows it for you to edit before you approve it.
 */
import { PLATFORM_INFO } from "./info.ts";
import type { Platform } from "./types.ts";

export function sections(postMd: string): Map<string, string> {
  const found = new Map<string, string>();
  const parts = postMd.split(/^##\s+/m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    const head = (newline < 0 ? part : part.slice(0, newline)).trim();
    const body = newline < 0 ? "" : part.slice(newline + 1).trim();
    found.set(head.toLowerCase(), body);
  }
  return found;
}

/** A section that only says the ad isn't for that platform ("No 9:16 cut of this ad. Not for TikTok"). */
const notFor = (body: string) => /^No (9:16|1:1|16:9)\b[^\n]*\n*[^\n]*\bNot for\b/i.test(body) || /^Not for\b/i.test(body);

export function copyFor(postMd: string | undefined, platform: Platform): { caption: string; title?: string; section?: string; skip?: string } {
  if (!postMd) return { caption: "" };
  const all = sections(postMd);
  const info = PLATFORM_INFO[platform];
  for (const name of info.sections) {
    const body = all.get(name.toLowerCase());
    if (body === undefined) continue;
    if (notFor(body)) return { caption: "", section: name, skip: body.split("\n")[0] };
    let caption = body;
    let title: string | undefined;
    const titleLine = caption.match(/^Title:\s*(.+)$/im);
    if (titleLine) {
      title = titleLine[1].trim();
      caption = caption.replace(titleLine[0], "").trim();
    }
    // A table or a "Links" block isn't caption copy.
    caption = caption.replace(/\n\|[^\n]*\|(\n|$)/g, "\n").trim();
    if (info.titleLimit && !title) title = caption.split("\n")[0].replace(/[#*_`]/g, "").slice(0, info.titleLimit);
    return { caption, title, section: name };
  }
  return { caption: "" };
}
