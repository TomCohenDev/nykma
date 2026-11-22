# nobodyknowsmyapp.com

The site: a static Astro build served by a Cloudflare Worker (`worker/index.ts`), which also answers the sales form on `/pricing` by emailing it through Cloudflare Email Routing. There's no payment processor: companies contact sales and get a price by email.

```bash
cd site && bun install
bun run dev        # the pages, with hot reload (the form needs `preview`)
bun run preview    # build, then the Worker locally; a sent form is written to an .eml file, not mailed
bun run check      # typecheck the Worker
bun run deploy     # build and deploy to nobodyknowsmyapp.com and the workers.dev preview
node scripts/examples.mjs [--force]   # the home page's example videos, from ../queue/ (private repo only; needs ffmpeg)
```

The examples are listed in `src/examples.json`. To add one, add its line there (a public brand's ad only) and run the script; it skips the ones already made.

Astro is pinned to 6 because Astro 7 needs Node 22.23 or later.

## Cloudflare (set up 2026-11-19)

- **Email Routing** is on for nobodyknowsmyapp.com, with one rule: `sales@nobodyknowsmyapp.com` → the inbox in `SALES_TO`. Change it with `npx wrangler email routing rules list nobodyknowsmyapp.com` and `... rules update`. A new inbox has to be verified first (`wrangler email routing addresses create <email>`, then the link Cloudflare mails).
- **`SALES_TO`** is a Worker secret (`npx wrangler secret put SALES_TO`), so the inbox isn't in this public repo. It must be a verified destination address.
- **The Worker** `nykma-site` is on its workers.dev preview, https://nykma-site.tom-cohen99.workers.dev. `routes` in `wrangler.jsonc` attach nobodyknowsmyapp.com and www.nobodyknowsmyapp.com as the Worker's custom domains (live since 2026-11-21). The Worker runs first on every request (`run_worker_first: true`), so any `www.` address redirects to the bare domain; everything else goes to the built assets. Before that, the domain pointed at the helix tunnel behind a Cloudflare Access login: the CNAME (`5d1f67fc-b23c-4e8f-a676-d9a49b1357a0.cfargotunnel.com`, proxied) was deleted, and nobodyknowsmyapp.com was taken off the "helix" Access application, which keeps helix.tomcohen.dev and nobodyknowsmyapp.tomcohen.dev.
- **The home page** is the scroll story (`src/pages/index.astro`, once `/v/1`, which now redirects to `/`). The first home page is kept at `/v/0`.

For `bun run preview`, put `SALES_TO=anything@example.com` in `site/.dev.vars` (gitignored).

The form's spam guard is a hidden field that bots fill in. If spam gets through, add Cloudflare Turnstile.
