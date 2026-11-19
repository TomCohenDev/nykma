import type { Story } from "./ad";

/**
 * Every src/ads/<slug>/story*.json. A glob, not an import, so an ad with no story yet can't break the registry.
 * It accepts its own hot updates, so the desk drawing an arrow doesn't reload every scene on the board. A page that
 * shows the whole story (the preview, the Play overlay) is opened fresh, and the scripts read the files from disk.
 */
export const stories = import.meta.glob<Story>("/src/ads/*/story*.json", { eager: true, import: "default" });

if (import.meta.hot) import.meta.hot.accept();
