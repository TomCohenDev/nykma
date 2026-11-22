// nobodyknowsmyapp.com: a static Astro site. worker/index.ts serves it and answers /api/contact.
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://nobodyknowsmyapp.com",
  output: "static",
  build: { format: "directory" },
  // /v/1 became the home page on 2026-11-21.
  redirects: { "/v/1": "/" },
});
