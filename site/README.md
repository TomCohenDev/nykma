# nobodyknowsmyapp.com

The site: a static Astro build served by a Cloudflare Worker (`worker/index.ts`), which also answers the sales form on `/pricing` by emailing it through Cloudflare Email Routing. There's no payment processor: companies contact sales and get a price by email.

```bash
cd site && bun install
bun run dev        # the pages, with hot reload (the form needs `preview`)
bun run preview    # build, then the Worker locally; a sent form is written to an .eml file, not mailed
bun run check      # typecheck the Worker
bun run deploy     # build and deploy to nobodyknowsmyapp.com
```

Astro is pinned to 6 because Astro 7 needs Node 22.23 or later.

## Cloudflare (set up 2026-11-19)

- **Email Routing** is on for nobodyknowsmyapp.com, with one rule: `sales@nobodyknowsmyapp.com` → the inbox in `SALES_TO`. Change it with `npx wrangler email routing rules list nobodyknowsmyapp.com` and `... rules update`. A new inbox has to be verified first (`wrangler email routing addresses create <email>`, then the link Cloudflare mails).
- **`SALES_TO`** is a Worker secret (`npx wrangler secret put SALES_TO`), so the inbox isn't in this public repo. It must be a verified destination address.
- **The Worker** `nykma-site` is deployed to its workers.dev preview only. To go live, uncomment `routes` in `wrangler.jsonc` and `bun run deploy`: that attaches nobodyknowsmyapp.com and www.nobodyknowsmyapp.com, and www redirects.

For `bun run preview`, put `SALES_TO=anything@example.com` in `site/.dev.vars` (gitignored).

The form's spam guard is a hidden field that bots fill in. If spam gets through, add Cloudflare Turnstile.
