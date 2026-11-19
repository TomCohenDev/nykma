import type { HandFontRef } from "./types.ts";

/** The hand fonts that ship with nykma. Both are OFL; the licence and source sit next to each file under public/fonts/. */
export const HAND_FONTS = {
  /** Latin. No Hebrew letters. wght 400-700. */
  caveat: { family: "Nykma Caveat", src: "fonts/caveat/Caveat-wght.ttf" },
  /** Hebrew (with Latin letters too). wght 100-800. */
  "playpen-hebrew": { family: "Nykma Playpen Hebrew", src: "fonts/playpen-sans-hebrew/PlaypenSansHebrew-wght.ttf" },
} as const;

export function resolveHandFont(font: HandFontRef) {
  if (typeof font !== "string") return font;
  const known = HAND_FONTS[font as keyof typeof HAND_FONTS];
  if (!known) throw new Error(`no hand font "${font}". Have: ${Object.keys(HAND_FONTS).join(", ")}, or give { family, src }`);
  return known;
}

/** Worked out from the first strong letter, the way the Unicode bidi algorithm does. */
export function textDirection(text: string): "ltr" | "rtl" {
  const strong = text.match(/[\p{L}]/u)?.[0] ?? "";
  return /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(strong) ? "rtl" : "ltr";
}
