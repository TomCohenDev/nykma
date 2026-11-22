/** The desk's look: Ink (nykma's own, the default; its id is still "graphite") or Studio (warm). A preference of this browser, not of an ad. */
export type Theme = "graphite" | "studio";
export const THEMES: { id: Theme; name: string; note: string }[] = [
  { id: "graphite", name: "Ink", note: "nykma's ink, paper and red, as on the site" },
  { id: "studio", name: "Studio", note: "Warm charcoal, brass, IBM Plex" },
];
const KEY = "nykma.theme";

export function savedTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "studio" ? "studio" : "graphite";
  } catch {
    return "graphite";
  }
}

export function applyTheme(theme: Theme = savedTheme()) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private window: the theme lasts this visit */
  }
}
