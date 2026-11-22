import react from "@vitejs/plugin-react";
import sirv from "sirv";
import { defineConfig } from "vite";
import { deskApi } from "./scripts/lib/desk.ts";
import { sourceTags } from "./scripts/lib/source-tag.ts";

export default defineConfig({
  plugins: [
    // Dev server only: data-nk="<file>:<line>:<col>" on each element of an ad, so the desk can edit its values.
    sourceTags(),
    react(),
    // public/ can hold gigabytes of plates, so builds don't copy it: the preview server reads it in place.
    // The dev server doesn't watch gen/ (below), so it never learns of plates made after it started and would answer
    // them with index.html. It reads gen/ from disk on every request instead.
    {
      name: "nykma-public",
      configurePreviewServer: (server) => void server.middlewares.use(sirv("public", { dev: true })),
      configureServer: (server) => {
        const fromDisk = sirv("public", { dev: true });
        server.middlewares.use((req, res, next) => (/^\/ads\/[^/]+\/gen\//.test(req.url ?? "") ? fromDisk(req, res, next) : next()));
      },
    },
    // The desk's API exists only on the dev server. Renders never load it.
    {
      name: "nykma-desk",
      configureServer: (server) => {
        // The desk is the dev server's home page. The old scrubbing preview stays at /index.html.
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/" || req.url?.startsWith("/?")) req.url = `/desk.html${req.url.slice(1)}`;
          next();
        });
        server.middlewares.use(deskApi(server));
      },
    },
  ],
  // Every page and every ad is scanned up front, so a package is never discovered late. A late one makes Vite rebuild
  // its dependency cache mid-session, and every open page and board scene then fails with "Outdated Optimize Dep".
  optimizeDeps: {
    entries: ["index.html", "capture.html", "desk.html", "board.html", "src/**/*.{ts,tsx}"],
    include: ["react", "react-dom", "react-dom/client", "react/jsx-dev-runtime", "roughjs", "roughjs/bin/core"],
  },
  server: { watch: { ignored: ["**/queue/**", "**/out/**", "**/.venv/**", "**/public/ads/*/gen/**", "**/brands/**"] } },
  build: {
    copyPublicDir: false,
    chunkSizeWarningLimit: 10_000, // Served from this machine, so bundle size doesn't matter.
    rolldownOptions: { input: ["index.html", "capture.html"] },
  },
});
