# Changelog

Newest first. `spec.md` says how nykma works now. This file says what changed and why.

## 2026-11-19

### Added: the public repo, TomCohenDev/nykma
- **Why.** The user asked for the repo to go public and the site to go live.
- **Repos.** This repo was renamed `TomCohenDev/nykma-private` (its remote here is updated). `TomCohenDev/nykma` is new and public, made from `bun run export-public` with its own history and commits under the GitHub no-reply address. It has a description, the site as its homepage, topics, Discussions, secret scanning with push protection, private vulnerability reporting, and a ruleset that stops force pushes and deleting `main`.
- **The domain isn't attached yet.** nobodyknowsmyapp.com already had proxied DNS records and a Cloudflare Access login in front of it, set up outside nykma. Attaching the Worker failed on the records, and the user decides what happens to them, so the site stays on its workers.dev preview (`site/README.md`).

### Changed: the domain is nobodyknowsmyapp.com, set up on Cloudflare
- **Why.** The domain the user bought is nobodyknowsmyapp.com (nykma for short), not nykma.com. Every link, the licence notice, the brand kit's URL and the sales address now use it.
- **Cloudflare.** Email Routing is on for the domain, and `sales@nobodyknowsmyapp.com` forwards to the user's inbox. The Worker is deployed to its workers.dev preview with `SALES_TO` set as a secret. A test request through the live form arrived in the inbox. The domain isn't attached yet, because the pages link to the public repo, which doesn't exist yet (`site/README.md`).

### Added: nobodyknowsmyapp.com's first pages, and a sales form instead of payments
- **Why.** The user wants companies to contact sales for now, with no payment processor, through a small form that reaches sales@nobodyknowsmyapp.com.
- **`site/`** is the start of nobodyknowsmyapp.com: Astro (pinned to 6, which runs on Node 22.12) with the nykma brand kit's colours and fonts, a home page and `/pricing`. Pricing says personal use is free and companies ask sales, with the install commands on one side and the form on the other.
- **The form** asks for a name, work email, company, how many people will use nykma, and an optional note. `site/worker/index.ts` checks it and mails it through Cloudflare Email Routing to the inbox in the `SALES_TO` secret, with the sender as Reply-To. Header values can't add headers, non-ASCII names are encoded, and bots that fill a hidden field are told it was sent. Without JavaScript it lands on `/pricing/sent/` or `/pricing/not-sent/`. Tested locally with `wrangler dev`, which writes the mail to a file.
- **`COMMERCIAL.md`** now says to contact sales at the form or sales@nobodyknowsmyapp.com, instead of buying at the pricing page.

## 2026-11-18

### Added: a licence and a public export, for nobodyknowsmyapp.com
- **Why.** The user wants nykma published at nobodyknowsmyapp.com with tutorials, free for personal use and paid for every company.
- **Licence.** `LICENSE` is PolyForm Noncommercial 1.0.0 with a copyright notice and a pointer to `COMMERCIAL.md`, which says what's free, what needs a licence and which services (ElevenLabs, LTX-2.5, stock, generated media) have their own terms. `CONTRIBUTING.md` and `.github/CLA.md` let contributions go into the paid licence too. `SECURITY.md` points to GitHub's private reporting, and `.github/FUNDING.yml` to the pricing page. `package.json` names the licence.
- **Export.** `bun run export-public` copies what `publish.json` allows into `../nykma-public`: the engine, desk, scripts and instructions, the nykma, mathbooklm and gomlin brands without their notes or local sources, and their ads and the demos. It rewrites the registry to those ads, and stops on a client's name, a local path, a use of an unlisted ad or a file over 50 MB. The private repo is never pushed to the public one (`CLAUDE.md`, `spec.md` §12).
- **Fixed for it:** gomlin's `brand.md` named a local path, and `evals/README.md` used another client's brief as its example.
- **The nykma brand** now has its real URL, nobodyknowsmyapp.com. The two ads that show `nykma.example` on screen are unchanged.

## 2026-11-10

### Changed: more creative room in every file the agent reads
- **Why.** After freeing the product's look (below), the user asked for every instruction file to be reviewed with the same mindset (sell the idea and grab the viewer, like Google's product ads) and for all the suggestions to become the defaults for every brand, as one change.
- **Pace and speed.** Pace on screen (time compressed, sped up, a snap) is staging. Only a speed the ad states ("in 2 seconds") is a claim. This fixes a clash between the hard rule and "exaggerate speed". `claims-checker` follows it, and says exaggerated scale, metaphor and a stylised UI are never `unsupported` on their own.
- **Finding the idea.** The "Product proof" route is now "Product as spectacle": the product's one moment blown up into the drama, really working or reimagined. At least one of the three routes is a kind of idea the brand's history hasn't used lately. "Safe isn't clear": when two ideas are close, the bolder one wins. Each explorer's second idea is its bolder one, and each idea has a `look:` line.
- **The pitch** gains "The wild one" (the boldest idea not picked, in full, so the user can choose it), "The one image" (the frame a viewer would remember), and a sound line that asks whether sound is part of the idea.
- **Craft.** "One viewer, one real task" becomes "one viewer, one thread": a piece of data, a character, an object or a question runs from hook to payoff, and the ad's shape is the idea's (a demo, a story, one striking visual, a tease and reveal, a loop). The 30 s demo shape is one shape to bend, for demos. "Motion lands and holds" becomes "one motion language, chosen for the ad", with the old style as the default. The first frame can also be an image strange or beautiful enough to stop the thumb. "Sell the idea" points at the kit's distinctive assets. The maths typesetting rule moved to `build.md`, since it isn't about every ad.
- **The reviewer** leaves alone an element that's huge, cropped, bleeding off the frame, broken out of its device, or a UI blown up or restyled.
- **Guides.** `generated.md` allows the idea's own world (a surreal place, the metaphor's setting), and `stock.md` lets a shot be generated when stock has the subject but would look generic. `footage.md` lets footage be graded, slowed and layered with motion design. `3d.md` shows a UI becoming objects. `engine.md` has a "Reimagining the product" section. `build.md` lets the pitch choose a logo-only ending.
- **New part:** `src/parts/morph.ts`, `morph(from, to, k)` from one closed outline into another as an SVG path, with `rect`, `ellipse` and `star`. It's frame math, so the same frame gives the same path.
- **Brand kits** gain a "Distinctive assets" section (the template and `brand-kit.md`): what makes the product recognisable when an ad redraws it. Existing kits don't have it yet. Until a refresh adds it, the agent names the ones it relies on in the pitch.
- **Every brand.** No brand has its own version of the instructions, so these defaults reach all of them. Gomlin's note asking for the app 1:1 in a true-to-life phone is dropped, at the user's request. Its note to check the real app against current recordings stays.
- **The user's own edits** on the desk, the same day: "Claims are true" no longer lists the ban on made-up testimonials, reviews, user counts, quotes and results, or on a stock person shown as a customer, or the line to say so in the pitch when the brief asks for a claim `brand.md` can't back. "Who decides what" no longer says to use the brand kit "as saved, never re-derived". `claims-checker.md`, `concept-explorer.md`, `stock.md` and `generated.md` still carry the testimonial and stock-endorser bans.
- **Eval:** compare against `c-2026-11-10-real-product`, frozen before either change today.

### Changed: the product's look is free, what it does stays true
- **Why.** The user found "the product as it is" too tight for an ad: an ad sells the idea of the product and grabs the viewer, the way Google's product ads enhance and animate a product beyond how it really looks.
- **Now:** the craft principle "The product as it is" becomes "Sell the idea, not the screenshot". The agent may blow up the part that matters, strip a screen to its moment, rebuild the UI as motion design, turn a card or an answer into an object, or exaggerate speed and scale. The real app 1:1 in a phone is one option, not the default. The product has to stay recognisable (colours, signature shapes, name), and when the real UI is shown it's still built from its source or a screenshot.
- **Unchanged:** what the product is shown doing is true. A reimagined screen may simplify and exaggerate, never add a feature, a result or a number, and `claims-checker` marks one that does as `unsupported`. The UI is still built in code, never by an image or video model. Brand notes still come first (gomlin's "app 1:1" note was dropped later the same day, above).
- **Files:** `ad-agent.md` (Claims are true, the Pitch stage, Craft), `concept-explorer.md`, `claims-checker.md`, the pitch template (a new "The product's look" line), `3d.md`, `generated.md`, `hebrew.md`, spec §6.4, §6.6, §7.1 and §8.
- **Eval:** the instructions before the change are frozen as `evals/prompt-versions/c-2026-11-10-real-product`, to compare against with `bun run eval`.

## 2026-11-09

### Changed: a generated person may be shown using the product
- **Why.** The user asked to drop the rule against it, for the MathbookLM lesson ad (`lc-lesson`), where the teacher using the app is the point.
- **Now:** a generated person can be shown as a user, such as a teacher with the app on the projector. The real UI still goes on their screen in code, and `post.md` says they're AI-generated. Changed in `ad-agent.md` (Claims are true), `generated.md`, `claims-checker.md`, `concept-explorer.md` and spec §6.6.
- **Unchanged:** no stock person as a customer, user or endorser (Pexels and Pixabay forbid implying endorsement), no real or named person generated, and no made-up testimonials, quotes or results.

### Added: a thumbnail for each ad, as a setting
- **Why.** The user asked for a generated thumbnail for every ad, as an option they can turn off.
- **The setting** (`thumbnail`, on by default) sits under "Pitch first" in Settings, and the new-ad form has the same checkbox for one ad. The brief's "Thumbnail:" line asks the agent for one, or says there's none. An asset has no separate cover.
- **In the engine:** `thumbnail` on the registry line is a component made in code like the ad, composed per ratio. `capture.html?id=…&thumbnail` mounts it on one frame, and `<Sequence from={-n}>` lets it show any moment of the ad, three.js included.
- **Files:** `bun run render` writes `<id>-thumbnail.png` and a `.jpg` (under YouTube's 2 MB) next to each MP4, and `--thumbnail` renders only those. `bun run stills <id> --thumbnail` captures one to look at.
- **The agent** reads `.claude/guides/thumbnail.md` (on the desk under Guides): one subject, a few big words, the same promise as the ad, the brand small, the middle of a 9:16 kept clear for grids. The cover's words go in the pitch's new "Thumbnail:" line so `bun run claims` checks them, and `post.md` says which file is the cover for which platform.
- **The desk** shows a project's cover as its card's poster, and lists its thumbnails in the project's files with their JPGs.
- `three-demo` has a cover, as the test.

### Changed: every eval version runs on today's tooling, and the runs so far are written down
- **Why.** Testing the frozen version B on a gomlin brief would have failed: a version was laid over the last commit, which had none of the day's tooling (`history`, `claims`, the brand notes) that its own prompt names. Now a version is laid over the working copy, so the instructions are the only thing that differs between versions.
- **Two 10-second briefs** (`mathbooklm-ten`, `gomlin-ten`) join the set, making 14.
- **`evals/README.md`** has a "What the runs so far showed" section: the three pairs of runs, what each found, and the open issues (`cp` refusals while copying brand files, `compare`'s undercounted refusals, a layout failure rendered anyway, and briefs that echo a tagline steering every version to the same idea).
- **`CLAUDE.md`** says the user's feedback about ads goes in `brands/<brand>/notes.md`, since agent runs no longer see Claude Code's memory.


## 2026-11-08

### Added: what the first eval taught, three.js, and a stamp for live results
- **Why.** The first full eval (the old prompt against the new on one 10 s mathbooklm ad, built to MP4s) showed where the agents lose time and truth. The user picked which suggestions to take; the prompt as it was is frozen first as `evals/prompt-versions/b-2026-11-08-lean-core`.
- **No memory in agent runs.** The old prompt read two of the assistant's Claude memory files before pitching: every session gets that index, so agent runs depended on files nobody edits on purpose. Desk and eval runs now get `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, with `~/.claude/projects/**` denied as a backstop (`scripts/lib/permissions.ts`). Brand notes are the one home for standing feedback.
- **Invent the staging, not the product.** The new prompt had the answer write itself stroke by stroke, unverified, twice. The user likes invention, so it stays, with a line: before showing the product doing something, the agent looks at how it really does it (`brand.md`, the kit's screenshots, and the app's own code from `sources.txt`), stages it however the idea wants, and says in the pitch what's invented. The hard rule, craft principle, explorer and pitch template ("Invented:") say the same.
- **`bun run claims <slug>`** checks a pitch against `brand.md` before the user sees it (`.claude/agents/claims-checker.md`, Sonnet, text only, about $0.10): each claim and product moment is backed, resting on a named source, staged, or unsupported, in `claims.md`. The agent fixes what's unsupported. On gomlin's `pag-tokef` it flagged "no more forms" said without the kit's caveat that swipe apply covers only enabled sources. A brand can have its own version on the desk. `review` and `claims` share `scripts/lib/claude.ts`.
- **Explorers in the foreground.** One ran in the background and the pitch was written before it reported. `concept-explorer.md` has `background: false`, and the prompt says to start all three in one message and wait for all three.
- **Fewer refused shell commands.** The traces had several a run ("multiple operations", brace expansion, `$variables`), each a wasted turn. Reading commands are allowed (`cat`, `head`, `tail`, `sed -n`, `grep`, `wc`, `find`), and the prompt asks for plain commands.
- **`.claude/guides/engine.md`.** Both builds spent their first 20-30 turns reading old ads and `mv.py` to learn how a scene, `spec.json` or the hand parts are wired, which costs money and pulls the execution toward old ads. The guide says what the engine and the parts bin can do, with the file for each, and that anything on the page is fair game as long as it's a function of the frame.
- **`bun run stills … --sheet`**: one labelled image of the frames, instead of a PNG each (the builds read 10-13 a round).
- **`bun run validate <id> --layout`**: the Layout and Hebrew checks straight from the code, no render, in seconds, into `out/<slug>/layout.md`. The agent runs it before every first look and fixes what fails (the old prompt's wordmark over a line at 7 s is this kind of fault), and the ad still counts as unchecked.
- **three.js** (`src/parts/Three.tsx`, `three` 0.187): `<Three setup draw>`, a scene that's a function of the frame, with `texture` and `model` holding the capture through a new `holdFrame` in the engine (`src/engine/ready.ts`, waited on by `seek`). `.claude/guides/3d.md` chooses between CSS 3D (the app's UI in space, still real DOM), three.js (objects and spaces) and Blender (photoreal), and keeps readable text in the DOM. `three-demo` is the test ad, and it passes `validate`, including the re-render of random frames.
- **`bun run stamp`** puts an `instructions:` line in each README: a hash of the instruction files as the brand's run reads them, named after a matching frozen version, or kept in `evals/stamps/<hash>/`. The README has a "Results" table for the user to fill after posting, and `bun run stamp --report` lists ads by instructions with their results. `eval snapshot` now freezes the same list of files the desk edits and the stamp hashes.
- **The desk** lists the claims checker and the two new guides.

### Changed: the agent's instructions, rebuilt from the deep-research report on prompting ad agents
- **Why.** The user commissioned a deep-research report on prompt engineering for creative agents and asked for its best practices to be put in. Its main findings: instruction-following drops as rules pile up and compete, so a prompt should hold what matters to most runs and load the rest when its stage comes; models given the same brief converge on the same likely idea, and independent ideas chosen afterwards beat one context trying harder; examples and old work anchor new ideas; current Claude models over-apply `MUST` and capitals; hard limits belong in code as well as words; and a prompt change has to be measured, not judged by how it reads.
- **A short core prompt** (`ad-agent.md` from 24 KB to 11 KB; with `CLAUDE.md`, what loads on every run went from about 30 KB to 15 KB): the job, the hard rules first (each saying what in code backs it), who decides what (hard rules, brand kit, brief, stages, craft), the stages with their stops, how the idea is found, craft as principles with their reasons, and when to read each guide. No capitals or "MUST". The pitch is now the contract for the build: a change to the idea, a claim or the cost goes back to the user.
- **Guides read at their stage** (`.claude/guides/`): build, footage, stock, generated media, Hebrew, checks, hand-off and brand kit, moved out of the prompt with their detail intact. The Hebrew guide adds a second read as a Hebrew editor and bidi done in code.
- **Three concept explorers** (`.claude/agents/concept-explorer.md`). Before a pitch ad-agent starts three at once, each down a different route (product proof, a human moment, form, metaphor, anti-ad, a wild card), with the same self-contained brief and none of the others' ideas. It picks from the six by mechanism, and the runners-up go in the pitch as "Other routes". ad-agent's tools allow only that agent (`Agent(concept-explorer)`), and the desk allows `Agent`.
- **`bun run history <brand>`** (free): the mechanism of each past ad for the brand, cut short, and the user's standing notes. The agent reads this instead of old ads while it looks for the idea, since three of mathbooklm's six ads turned out to be about a board or a lecture running out of room.
- **Brand notes** (`brands/<brand>/notes.md`): the user's feedback that should hold for a brand's next ads, which until now lived only in one assistant's memory and never reached ad-agent. tomcohen's (the course: plain text, one real number, no אב־טיפוס or 10 מפגשים) and gomlin's (the app 1:1 in a phone, music only) are filled in. The agent adds one at hand-off. "A new composition every shot" became a craft principle for every brand.
- **The pitch template** asks for a `mechanism:` line, the brief as the agent read it (who's watching, the one takeaway, the proof, the action, what it chose), how it works (the first two seconds, the brand, the product and where its UI comes from, the sound, what it's made with, the risk) and the other routes. "The idea" stays first and the storyboard keeps its headers, so the reviewer and `animatic` read them as before.
- **`CLAUDE.md`** keeps the commands, the code rules, the limits and how to change nykma, and points to `ad-agent.md` for making an ad, so each rule has one owner instead of two copies.
- **`bun run eval`** (`evals/`): 12 fixed briefs (three of them edge cases), frozen prompt versions with the old prompt as baseline `a-2026-11-08-accumulated`, pitch-only runs in a throwaway worktree with money-spending commands switched off, a blind A/B sheet and its tally. The report's other experiments (explorers against one context, old ads visible, effort, reasons) are listed in `evals/README.md` to run next. The rewrite itself hasn't been compared with the baseline yet: that's the first run to make.
- **Settings → Agent instructions** shows the explorer and the eight guides too, in three groups (Agents, Project, Guides), and a brand can have its own version of each. A brand's explorer edits reach the explorers through ad-agent's brief to them.
- **`bun run eval --build`, `compare` and `trace`.** The user wanted to see how the agents worked and the ads they made, not just the pitches. `--build` carries a run past the pitch to a rendered first look (the worktree links `node_modules`, `.venv` and `.env.local`, never reading them, so ElevenLabs runs within the pitch's plan), every run keeps its event log and a step-by-step `trace.md`, and `compare` lays two versions side by side: tools, cost, explorers, old ads and outside files read before the pitch, guides, MP4s. The first full run (one 10 s mathbooklm brief) showed the old prompt reading seven old pitches and two Claude memory files before its pitch, which the first count had missed.
- **The desk's permission lists** moved to `scripts/lib/permissions.ts`, so `eval` runs under the same limits as a desk run.
- **Not changed:** the reviewer, which already adjusts rather than redirects and gives concrete fixes, and `validate`. The report's further ideas (a separate creative and claims reviewer, a structured production spec handed to a separate builder, a reviewer that must cite evidence) wait for the evals to show the need.

### Fixed: agent instructions opened as "Not saved"
- CodeMirror turns the Windows files' `\r\n` into `\n`, so an untouched file differed from the one on disk: switching tabs asked to throw away changes, and Save stayed on. The page now compares with `\n` and saves with the file's own line endings. A disabled primary button is grey, not a faded blue.

### Removed: variation B and HyperFrames. nykma is the one engine, with HyperFrames' craft rules
- **One agent, one engine** (`spec.md` §10.9). The user found two engines too complex and asked for research and one choice, or a combination of both. The evidence was already here: the frame-for-frame port (`queue/2026-11-04-hyperframes-vs-nykma/`) and the blind bake-off (`queue/2026-11-04-bakeoff/`). HyperFrames made the same picture with more code, bigger files and less deterministic renders. In the bake-off nykma had the better idea and sound, and HyperFrames' only edge was layout, which came from rules in its skills and the checker it ran while building. HyperFrames' releases since the pinned 0.9.13 (0.9.14 fixes a Studio timeline gate) change none of that. Variation B also had none of the desk's board, story, scenes, `review` or `validate`, and it doubled the tokens per brief.
  - **Combination:** `ad-agent.md` has a new "Craft" section of HyperFrames' rules: frame 0 as the thumbnail, one real task from hook to payoff with a beat shape, read time (0.5 s plus 0.3 s a word), nothing static for over 3 s, nothing on top of text, phone-readable sizes, the same safe areas `validate` checks, and motion that lands and holds. Real superscripts in maths, from the bake-off's ² fault.
  - **Gone:** `hf-agent`, `hf/` (the pinned CLI, `hf.mjs`, `render.mjs`, the copied skills, and 119 MB of node_modules), the **Two variations** setting and checkbox, `variation.json`, the variation tags and links, and the HyperFrames line under Tools. The experiments stay in `queue/` and `experiments/hyperframes/`, and an old `-hf` queue folder opens as an ordinary project. A transparent WebM from `render` is listed under "Later".

### Added: agent instructions, in Settings, with each brand's own version
- **Edit what the agent is told from the desk** (`spec.md` §10.11). The user asked to edit the agent's instructions: the defaults, and a version per brand kit that falls back to them. Settings has an **Agent instructions** section with four tabs: the agent (`ad-agent.md`), the project rules (`CLAUDE.md`), the pitch template, and the reviewer.
  - With "Every brand" picked it edits the repo's files, which are the defaults. With a brand picked, saving keeps a copy in `brands/<brand>/knowledge/`, and **Use the default** deletes it. A brand kit's top bar links there and says how many files it has edited.
  - A run for a brand with edits starts with `.claude/agents/ad-agent-for-<brand>.md` (gitignored), which the desk writes fresh at each start: the brand's prompt plus a list of its other files to read instead of the defaults. `bun run review` uses the brand's reviewer.
  - The desk reads and writes only those four files (`scripts/lib/agents.ts`).
  - **An editor like Obsidian's**, on CodeMirror 6 (MIT, a new dependency). The user asked for a rendered, bigger, editable view, and then for editing "more like Obsidian does" rather than a block at a time. **Live** shows the Markdown formatted as you type and hides its marks except on the cursor's lines, **Source** is the plain text with line numbers, and **Reading** is rendered and read-only. **Expand** opens it over the whole window. The file is saved exactly as typed, never reformatted.

## 2026-11-06

### Added: KaTeX, for ads that show an app's chat maths
- **`katex` is a dependency now** (MIT). spring-moves shows MathbookLM's chat answer, which the app typesets with KaTeX. Ads now use the same library and fonts (`katex/dist/katex.min.css`), instead of an imitation in plain type.

### Fixed: a Codex still lost to a locked temp folder
- **Cleaning up Codex's working folder no longer throws the still away** (`scripts/lib/codex.ts`). On Windows Codex can hold its temp folder for a moment after it exits. The cleanup in `finally` then threw `EBUSY`, so `bun run gen` failed a still Codex had already drawn (spring-moves' `board-a-still`). The cleanup now retries for about 3 s, and if the folder is still locked it's left behind with a note in the progress line.

### Changed: stock works with Pixabay alone
- **A stock source with no key is skipped quietly** (`spec.md` §6.8). Pexels has paused new API keys, so most setups will have only Pixabay. Each search used to print "Pexels isn't connected"; now an unconnected source is left out when the other has a key, and the error appears only when neither does. Settings says Pexels is optional.

### Changed: local video uses the 14 GB build of LTX-2.5
- **`ltx-2.5-q4`, about 9 times faster on this PC** (`spec.md` §6.9). The first real local clip, with Lightricks' int8 file, took 29 min 41 s for 6 s at 720p. The file is 20 GB, more than the card's 16 GB, so ComfyUI fed it from RAM and the page file at 166 s a step, with the GPU mostly idle. Unsloth's 14 GB GGUF of the same model (`UD-Q4_K_XL`, same licence) fits the card and made the same clip in 3 min 22 s, at 4 s a step. The two clips are nearly identical (SSIM 0.975), and both are close to Veo 3.1 Fast's from the same still, a little softer.
  - The new model id is `ltx-2.5-q4`. It's the same workflow with its loader swapped for ComfyUI-GGUF's `UnetLoaderGGUF`, and the brief now names it. `ltx-2.5` still works.
  - `bun run local:setup` clones the ComfyUI-GGUF add-on at a pinned commit and installs its Python packages into ComfyUI's own Python. A model file can now go into a chosen models folder (`into`).
  - ComfyUI starts with `--offline`, since `--disable-api-nodes` is deprecated.
  - The agents know how to use it. ad-agent has a "Video on this PC" entry: when to write `"via": "local"`, what the model takes, seeds for retakes, prompts used as written, and what to fall back to OpenRouter for. hf-agent, the pitch template and CLAUDE.md point to it. `bun run gen --estimate` gives a local shot's measured GPU minutes, which the pitch lists where a price would go.

## 2026-11-05

### Added: video on this PC
- **Generated video on this PC, free** (`spec.md` §6.9). Asked for because a clip through OpenRouter costs about $2. Settings → Generated video now picks OpenRouter or this PC, and the choice goes into each new ad's brief and its shots' `via`, so it never changes a built ad. A video shot with `"via": "local"` and `"model": "ltx-2.5"` is made by LTX-2.5 distilled in ComfyUI on this machine's GPU. Like an OpenRouter video, it waits for its approved still and **Make videos**. It costs no money, takes a few minutes, and is recorded with its seed.
  - Picked from the research in `reports/Local video models on 16GB.md`:
    - LTX-2.5 is level with Veo 3.1 Fast on Artificial Analysis's board, fits a 16 GB card, and is free for ads below $10M revenue.
    - MiniMax H3 ranks higher, but its licence is unclear and it's heavier.
    - Wan 2.2 is next to try.
  - `bun run local:setup` installs ComfyUI portable v0.44.0 (its own Python, PyTorch and CUDA) in `~/nykma-local/`, and the 47 GB of model files with the `hf` CLI. It resumes, and says how to accept the licence on Hugging Face.
  - The desk starts ComfyUI on 127.0.0.1 with its paid API nodes off, fills ComfyUI's own LTX-2.5 template (`scripts/lib/comfy/ltx-2.5-i2v.json`, exported with Playwright) node by checked node, makes one clip at a time, and drops the clip's sound unless the shot asks for it.
  - Checked so far: the template's nodes are all built into ComfyUI 0.44, and ComfyUI accepts the filled workflow and reports only the model files not downloaded yet. The first real clip waits for the model download.

### Added: free stock
- **Free stock before generated media** (`spec.md` §6.8). Asked for because a generated clip costs about $2. For any shot code can't make, the agent now searches Pexels and Pixabay first, and generates only when nothing fits. The pitch says per shot "stock: found pexels:12345" or "no fit → generate", and the pitch template has the line.
  - `bun run stock <slug> "query"` asks the desk to search both sources (photos, clips or both; `--ratio`, `--min-seconds`, `--source`, `--page`). It saves small previews and one numbered contact sheet to `out/stock/`, where a clip is four frames of its preview (ffmpeg, then `py/stock_sheet.py` with OpenCV), and prints the list with ids, sizes, lengths, authors and pages.
  - `bun run stock <slug> --take pexels:12345` downloads the file that fits the ratios into `public/ads/<slug>/stock/`. A clip is unpacked like footage, and the command prints its `<Footage>` line and the credit line. `sources.json` records the source, id, author, page, licence, file and hash, under `stock/<file>`, next to the `--own` entries, which are unchanged. `stock/` is gitignored like `footage/`, and `bun run stock <slug>` downloads it again after a clone.
  - Pexels and Pixabay are two more connections in Settings (paste once, Test, Remove). The desk makes every call, so the keys never reach an agent, and agent runs don't inherit `PEXELS_API_KEY` or `PIXABAY_API_KEY`. The CLI uses the desk token, as `bun run gen` does. Answers are cached for 24 hours as Pixabay asks, which also spares the rate limits, and files are downloaded, never hotlinked.
  - `ad-agent` and `hf-agent` have the rules: search before proposing a generated shot; a stock person is never a customer, user, testimonial or endorser; no visible third-party logos or brands; never product UI from stock; credit each file in `post.md` and the README.
  - Checked end to end against a stand-in Pexels and Pixabay (`NYKMA_PEXELS_URL`, `NYKMA_PIXABAY_URL`), with a synthetic photo and synthetic clips. Not checked against the real APIs yet, since there are no keys. Pexels' page says new API keys are paused for now.
- **`bun run footage <slug>` with no clips** now unpacks the generated and stock clips it finds outside `footage/`. Before, it collected generated videos after a clone and then never unpacked them.

### Changed: generated media
- **Stills first, then video, with you in between** (`spec.md` §6.6). Asked for: generate the frames, wait for confirmation, and only then the video. Every video now needs a `first` frame from a still. `bun run gen` makes only the stills and stops with exit code 2 at the first video. On the desk, each made still has **Approve** and **Retake**: the retake's note goes to the agent's chat. When every still a video starts from is approved, **Make videos** approves the videos' cost plus 5% and the desk makes them all. The agent can't start a video: `/api/gen/run` answers 409. Approvals of stills are kept outside the repo, next to the budgets, in `gen-frames.json`, keyed to each still's file hash, so a retake needs approving again. **Make videos** checks every video can be made, and that the amount covers them, before it changes the approval.
- **Stills through Codex, on your ChatGPT login** (`scripts/lib/codex.ts`, Settings → Generated stills). Asked for as an option beside OpenRouter, the way T3 Code connects to OpenAI. The desk runs `codex app-server` (JSON-RPC over stdio) on the login Codex already has: no key, no money, and each still counts against the plan's image limit. A still with `"via": "codex"` is one ephemeral, read-only thread in an empty temp folder, and any approval Codex asks for is declined. Codex draws fixed sizes, so a still is cropped from the centre to its `aspect_ratio`. Settings picks the route for new ads (it goes into the brief), finds the binary on the PATH or in the Codex desktop app, and shows whether it's logged in with ChatGPT (`account/read`, free). Agents are denied `codex` and `~/.codex`. Video is still OpenRouter only. The Anthropic API has no image model, so there's no route through a Claude login.
  - Checked against a stand-in Codex app-server and a stand-in OpenRouter: a Codex still made and cropped from 1024×1536 to 864×1536, the agent refused a video, the desk refused it until the still was approved, a retake verdict and a new still each blocked it again, a too-small approval refused without changing the budget, the video made from the approved still, a Codex still not blocked by an overspent budget, the plan's limit reported with its reset time, and Codex's approval request declined. spring-moves and screen-demo keep every shot made, since `via` joins a shot's request hash only for Codex. Codex's account and capability calls were checked against the real Codex 0.166 on this machine. No real Codex image has been made yet, and the panel hasn't been tried in a running desk yet.

### Added
- **1:1 by default** (`spec.md` §10.8). Asked for: one layout per ad unless more are ticked. A new ad's brief names its layouts, and the agent writes them on the registry line as `ratios`. The new-project form has the three as toggles, 1:1 on. Ads already built keep their three.
- **Two variations at once** (`spec.md` §10.9). Asked for after the bake-off: every brief built twice, at the same time, one through each engine. With it on, the desk starts `ad-agent` (variation A, nykma) and a new `hf-agent` (variation B, HyperFrames, in `hf/<slug>/`) from one brief. Each has its own idea, queue folder and chat, and the two are tagged and linked on the desk. B's folders end in `-hf`, and `variation.json` records the pair.
  - `hf/` pins HyperFrames 0.9.13, holds its skills, and has `hf.mjs` (the CLI with telemetry off) and `render.mjs` (every layout, −14 LUFS, silent and MP3, as `render.ts` hands over). Checked by rendering the bake-off's 1:1 project with it: 15 s, −14.75 LUFS.
  - B uses nykma's sound pipeline and footage tools, so the two differ only in the picture engine. GSAP comes from the package, not a CDN.
  - This reverses "not adopted" from 2026-11-04 for the engine, as a second variation and not a replacement. It costs about twice the tokens per ad, which the settings page says.
- **Settings page** (`spec.md` §10.8), in `settings.json` (gitignored): layouts, two variations, pitch first, the ElevenLabs voice (automatic, or one from the account's list with its preview), Whisper or ElevenLabs for word times, and Claude Code's path, model and effort, with whether it's installed and logged in. It also shows whether the ElevenLabs key, Whisper, yt-dlp and HyperFrames are there, without reading the key out.
  - Settings go into each new ad (registry line, spec.json) rather than being read at build time, so changing one never changes or re-spends on a built ad. `mv.py` doesn't read them.
  - `mv.py voices --json` lists the voices for the page.
- **Saved voices** in Settings. Asked for, to keep your own ElevenLabs voice ids in the list. Type an id and an optional name, and the desk looks it up for free (`mv.py voices --id`) to fill in the name and preview. It's saved even if ElevenLabs doesn't return it, with a warning. Saved voices come first in the picker, have **Use always** and **Remove**, and in Automatic the agent is asked to pick from them first. Checked with George's id and a made-up one, which came back as a 400 and was saved with the warning.

### Added: generated media
- **Generated stills and clips** (`spec.md` §6.6), asked for as an addition to the flow, not a replacement. The example: someone looking at their phone with an O mouth, then the app. The person is generated and the app is the real UI in code. Researched first (`reports/Video and image generation APIs.md`): Sora's API and the Gemini API's Veo previews shut down this autumn, so this goes through OpenRouter, one key for Veo, Kling, MiniMax, Seedance and Wan video, and Nano Banana, GPT Image, FLUX and Recraft images.
  - An ad lists shots in `public/ads/<slug>/gen.json`, each with a `why`. `bun run gen <slug> --estimate` prices them from OpenRouter's public catalogue for free. The pitch lists them, and the user approves the amount in the project's Generated media panel. `bun run gen <slug>` then makes them through the desk, cached on the request's hash like `mv.py`. Videos are unpacked like footage. Files and their record (`generated/generated.json`) are committed, because they were paid for and can't be made the same again.
  - `ad-agent` and `hf-agent` have the rules: what may and may never be generated, the cheapest shot that works, one retake, stop at exit 2, and say in `post.md` what's AI-generated. The pitch template has a line for it.
  - Checked end to end against a stand-in OpenRouter server: estimate, refusal before a key and before approval, the token check, approval, an image made and then used as a video's first frame, the video unpacked to frames, a second run costing nothing, the ledger, and a changed prompt refused for lack of budget. Not checked against the real API yet: that spends money. Whether video takes the first frame as a data URL is unverified.
- **Connections in Settings** (`spec.md` §10.10): OpenRouter and ElevenLabs keys pasted once into a key store outside the repo (`~/.config/nykma/keys/`, 0600), shown only as their last four characters, with a free Test and Remove. `eleven.py` reads its key there first, before `.env.local`.

- **The ad on a screen in the shot** (`spec.md` §6.7). Asked for "someone looking at a PC with the ad showing on the PC screen": a generated (or shot) clip with a green screen, and the ad's own scene put on that screen in the same frames.
  - `bun run screen <slug> <clip>` (`py/screen.py`, OpenCV) finds the green screen in every frame. Its edges are fitted as lines, so a corner behind a hand is still found. It writes the corners to `src/ads/<slug>/<clip>.screen.json`, plus per-frame mattes that keep hands and heads in front, despilled plates, and a sheet to check. `--corners` follows a screen that isn't green.
  - `<ScreenInsert track size>` in the engine warps any React scene onto the screen in each frame with a CSS `matrix3d` and masks it with the matte.
  - Tested on made-up clips: corners within 1.2 px, and 0.4 px with a hand over one. A full render in every ratio had the scene on the screen, frame-matched, behind a head, with no green edge. Not yet tried on a real generated clip. `py/requirements.txt` adds `opencv-python-headless` (OpenCV 5.0, with a wheel for Intel Macs).
  - `ad-agent` has the steps, and the prompt wording for a usable green screen. `hf-agent` is told how to use the same corners and mattes in HyperFrames.

- **`screen-demo`**, set up ready for the first real run (`spec.md` §6.7). It's your example: a generated clip of a student at a PC, with MathbookLM's bake-nykma ad playing on the monitor. Rehearsed end to end on a stand-in API with a synthetic clip, then reset to before the paid step:
  - approve in the panel
  - `bun run gen`: the still, then the video from it, unpacked
  - `bun run screen`: found in all 144 frames, with the hidden corner right
  - stills and a full render in 1:1 and 16:9, 180 frames each
- **`<ScreenInsert>`** passes the screen's size and shape to `useVideo()` inside it, and takes `video` to lend a borrowed scene its own slug. Both were found in the rehearsal: bake-nykma's handwriting is looked up by slug.
- **Settings → Tools** also checks OpenCV and ffmpeg.

### Fixed
- **Approving exactly the estimate could block the last shot.** In the rehearsal, a still estimated at $0.05 cost $0.0504, and the $0.60 video was then refused with $0.5996 left. **Approve** now adds 5% to the estimate and says so.
- **An agent could read API keys.** Claude Code's `Read(**/.env.*)` deny rule doesn't cover a `node` or `python` script opening the file itself, and agents may run both. Keys for paid images and video now never reach an agent: the desk makes those calls. Agent runs no longer inherit vendor keys from the desk's environment, load no MCP servers (`--strict-mcp-config`, `mcp__*` denied), and have the key store, `curl` and `security` denied. A script an agent writes could still open the key store, since it runs as you, so the backstop is the key's own credit limit at OpenRouter. ElevenLabs' key is still read by `mv.py` as before.
- **Pitch card notes faded at the end.** The notes under each card on the board had a fade over their last 15%, so the end of every note was dimmed, and anything past 500 units was cut off. The fade is gone, and notes too long for the room under the card now shrink their type until they fit (down to 18 from 44).
- **Test** on an OpenRouter key said "Works, $10.00 left" for an account that had never bought credits, and the first real shot got 402. It now reads the account's balance too and fails with "no credits". The 402 cost nothing and was logged as failed at $0.
- **A generated still couldn't be a clip's first frame** when the model chose its own format: Nano Banana answered in JPEG, and the video named `generated/pc-still.png`. Inputs under `generated/` now find the shot's file whatever its extension.
- **The screen's green light stayed on what it lit.** Despill reached only 20 px past the screen and capped green at red, so a student's cheek beside the monitor stayed lime. It now reaches by distance (in full to half the screen's diagonal, gone by one and a half) and holds green to red and blue's average where the light visibly landed.
- **First real run of screen-demo**: the still ($0.053) and Veo 3.1 Fast clip ($0.60, taking the still as a data-URL first frame), the screen found in all 144 frames, and 1:1 and 16:9 rendered with no green showing through. The 1:1 framing was moved onto the monitor.
- **The ad on a screen flashed and lagged in the desk's preview** (fine in the render). The screen was cut by a CSS mask that changed every frame, and a mask that hasn't loaded hides its layer: on the board the screen went dark in 84 of 136 painted frames, and 1080p images with alpha decoded too slowly for 30 fps. `bun run screen` now writes a JPEG plate and a WebP of just the screen's box with a hole in it, and `<ScreenInsert>` lays the ad between them as plain images, fetching the next frames ahead. The board now shows every clip frame at 60 fps with no stalls and no flashes, and the render matches the old one (PSNR 44-46 dB). Run `bun run screen` again for clips tracked before this.

## 2026-11-04

### Added
- **Whisper for word times** (`py/whisper.py`, `spec.md` §6.3). Asked for as an option beside ElevenLabs. It can only do the listening half: it times a recording, while voice, music, stems and sfx stay with ElevenLabs.
  - A recorded voice (`voices[]` with `file`) is now timed by `faster-whisper` on this machine, for free, unless it says `"align": "eleven"`. Before, every recording went to ElevenLabs' forced alignment, which has no published rate. No ad used a recording, so none changes.
  - Given the script, the words that come back are the script's own, laid on what Whisper heard, so `word:` cues and lines work as before. With no `text`, Whisper transcribes and its segments become the lines, for speech in footage.
  - Hebrew uses ivrit.ai's fine-tune of large-v3-turbo (Apache 2.0). It heard 106 of 109 words of pag-tokef's and achuzim's voice-overs exactly. Two of the misses were "שלושים ותשעה" written as "39", and those words take the time of what it heard there.
  - Its starts were 48-78 ms early against ElevenLabs' own timing, so they move 50 ms later. Then 78-86% of words start within 2 frames and 83-90% within 3. That's fine for captions, so forced alignment stays an option for cuts that must land on a word.
  - `mv.py words <audio>` writes `words.json` beside any recording, such as a clip's `audio.wav`.
  - `py/requirements.txt` adds `faster-whisper` and holds PyAV below 19, which dropped an argument faster-whisper 1.2 passes. All of it installs from wheels on an Intel Mac.
- **The brand's own videos from a URL** (`spec.md` §6.5). `bun run footage <slug> <url> --own` downloads with `yt-dlp` (up to 4K) and unpacks like any clip. Asked for to use a brand's own channel. It refuses without `--own`, and `public/ads/<slug>/sources.json` records the URL, title, channel and date. It's committed, so it shows whose video it was, and a clone downloads it again. `ad-agent` is told that only the brand's own videos qualify.
  - Checked with a public YouTube video: download, unpack, the refusal without `--own`, the download again after `footage/` was deleted, and Whisper on its sound.

### Tried, not adopted
- **HyperFrames** (HeyGen's HTML-to-MP4 renderer) as a second engine. pag-tokef was rebuilt in it frame for frame (`experiments/hyperframes/pag-tokef/`, comparison in `queue/2026-11-04-hyperframes-vs-nykma/`). The picture came out the same (SSIM 0.99, the same Hebrew layout, audio with no offset), and so did the render time. It had 1.4× the code, files 1.8× the size, each ratio as its own project, a silent RTL layout bug, and no path into the desk, board or React parts bin. Worth borrowing instead: a layout and contrast check in `validate`, and transparent WebM from `render`.
- **A blind bake-off with HyperFrames** (`queue/2026-11-04-bakeoff/`), asked for because a frame-for-frame port can only come out the same. One brief, a 15 s MathbookLM ad, went to `ad-agent` and to a fresh agent with only HyperFrames. Time (21 vs 17 min), tokens (168k vs 205k), code (732 vs 812 lines) and render time came out close. nykma's ad had the stronger idea and sound. HyperFrames' had the cleaner layout, from the checker it runs while building. The engine still isn't adopted. The lesson is a free layout check during the build (overlaps, out of frame, 9:16 safe area, read time).

## 2026-11-03

### Added
- **Real footage** (`spec.md` §6.5). Asked for to make live-action ads from video the user shoots, which code and Blender can't fake.
  - `bun run footage <slug> <clip>` unpacks a clip to frames at its own rate (up to 120 fps), with its sound and a contact sheet the agent can read. HDR phone video is tone-mapped, so it doesn't come out grey.
  - `<Footage>` in the engine plays those frames exactly, with trim, speed, ramps, and framing per shape.
  - Drop a clip on the board (up to 4 GB) and it's uploaded, unpacked and placed as a scene, with its sound, a scrubber, and right-click length, fit and sound on/off. In `story.json` it's an entry in `images` with `clip` set.
  - `ad-agent` has a short section on footage: cut it, don't rebuild it, read the sheet, frame each shape, and don't make it claim more than it shows.
  - Originals in `public/ads/*/footage/` are gitignored, like the frames.
  - Checked with a 1080p clip with sound and a 4K 60 fps HDR clip: unpacked from the command and from a drop on `story-demo`'s board, played as scene 4 in stills in all three shapes, and mixed with its sound in a full render.
- **Blender and the audio pipeline on a Mac**, including Intel Macs, which Blender 5 no longer supports. Asked for to add Blender shots from an Intel MacBook.
  - `kit.py` runs on Blender 4.5 LTS as well as 5.x: it picks the EEVEE engine id that exists, and builds the compositor as the scene's tree with a Composite node where there's no `compositing_node_group`. Checked by rendering `py-demo` stills in 4.5.15 against a test timeline.
  - `mv.py` finds `/Applications/Blender.app` without `BLENDER` being set, and its messages name the right venv path for the machine.
  - The desk lets the agent run `.venv/bin/python`, so Blender and `mv.py` work from the desk on a Mac. `ad-agent` is told the Mac path.
  - `py/requirements.txt` keeps `numba` below 0.63 and `llvmlite` below 0.46 on Intel Macs, because the newer ones ship no x86_64 macOS wheels and fail to build.
- **Auto layout on the board** (L, or the grid button in the toolbar): the story in one row in play order, chains off the story in rows below, and loose scenes in a last row. Asked for because dragged scenes and images end up scattered, with arrows looping across the board. It moves scenes only, so the video doesn't change.

### Fixed
- **Blender plates didn't show on the board,** though the render had them. The dev server doesn't watch `public/ads/*/gen/` (plates can run to gigabytes), so it never learned of plates made after it started, and answered them with `index.html`. It now reads `gen/` from disk on each request (`vite.config.ts`), as renders already did. Found on `compile-tom`'s drop and assemble scenes.
- **Blender plates were opaque on 4.5.** `kit.compositor` ran the render through Glare and Lens Distortion, which hand back an opaque image there, so every `--layer` plate came out as a black frame with no page behind it. Found on compile-tom's first plates. When the film is transparent, the compositor now sets the alpha back after them: the render's own alpha, or the bloom's brightness where it glows past an object, whichever is higher. Checked on compile-tom's plates in 4.5.15 (a corner pixel went from alpha 255 to 0, and the glow still shows over the page).

## 2026-11-02

### Added
- **The desk is now a Figma-style app** (`spec.md` §10), so the whole flow works from the UI. Asked for to make the process UI-driven, with the agent kept as it is.
  - **Dashboard:** projects and brand kits as cards. New project is one prompt box with a brand and Video / Asset. New brand kit starts from a local repo, a website or uploaded files (saved to `brands/<brand>/uploads/`).
  - **Project:** the board in the middle, scenes and files on the left, and the chat with `ad-agent` on the right. Play shows the whole story with sound. Render runs `render --ratio all` with no agent and copies the files to the queue folder.
  - **Board:** pan and zoom, each scene live at its real size in every ratio, selection, a scrubber, and arrows dragged between scenes that set the order the video plays, saved in `src/ads/<slug>/story.json`. A pitch shows its storyboard rows as cards.
  - **Chat:** streams the agent's words, folds its steps, gives buttons for the state you're in, sends the selected scenes and frame with your note, takes dropped files, and keeps the conversation in `.chat.json`.
  - **Brand kit page:** swatches, specimens in the kit's fonts, logos, facts, sources, **Check sources**, and **Edit brand.md**.
- **Scenes:** an ad can list `scenes` in the registry instead of one `component`, each with its own frames and cues. `story.json` sets their order, and every script follows it.
- **Assets:** `kind: "asset"` makes stills. Render writes `<id>-<n>.png` per scene. `validate` doesn't check them yet.
- `story-demo`, a three-scene ad for trying the arrows.
- `ad-agent` has one new rule: split ads into scenes, and read `story.json` before rendering.

- **Your own images on the board:** drop, paste or add (I) images on a project's board. They go to `public/ads/<slug>/board/`, start off the story, and join the video when you draw an arrow to or from them. Right-click to set how long one shows (1–8 s) and whether it fills the frame or fits inside it on black. Delete takes it off and closes the gap. They're listed under `images` in `story.json`, and the engine plays them as scenes, so render, Play and stills all show them. An ad with one component takes them too, and its sound moves with it.
- Cutting the arrow out of the start now makes the next scene the start, instead of leaving a story of one.
- The chat panel resizes: drag its left edge, double-click to reset. The width is kept.
- A pitch card on the board shows only the picture, as the animatic does, with the storyboard notes (on screen, what happens, voice) under the frame instead of over it.

### Fixed
- **New project opened an old one:** the desk named a new project after the first queue folder the agent mentioned, so reading `mashal/pitch.md` as an example opened mashal and overwrote its `.session`. A new project now takes only a queue folder that didn't exist when its run started. The old desk had the same bug.
- **"The registry didn't load" with 504 Outdated Optimize Dep:** Vite found a package (roughjs) only when a board scene first used it, and rebuilt its dependency cache under the open pages. `vite.config.ts` now scans every page and ad up front and prebundles React and roughjs, and a board scene with stale imports reloads itself once.
- **Chat flashing:** the chat polled faster while the agent worked, and changing pace cleared its data, so it flipped between running and idle without end.

## 2026-11-01

### Added
- Every render also writes `<id>-silent.mp4` with no sound stream, and the sound alone as `<slug>[-<take>].mp3` at 320 kbps. An ad with no sound gets no MP3. `ad-agent` copies them to the queue, and the desk links them under the player.

### Changed
- `spec.md` now records the true-peak target, the reviewer's cost, how `review --frames` writes its report, and that `brand-check` skips `.env` files.

## 2026-10-31

### Added
- **Engine:** own React and Playwright engine with ffmpeg encoding, replacing Remotion, which can't be used commercially for free. Preview page, `stills`, `sheet`, `render`, and the smoke ad.
- **Parts bin:** `time`, `camera`, `ratio`, `Cursor`, `Typing`, `Rough`, `Caption`, `EndCard`, `timeline` and `bidi`, in English and Hebrew.
- **Handwriting:** `hand`, `hand:check`, `<HandText>` and `handCues()`, ported from `tomcohendev-portfolio`. Caveat and Playpen Sans Hebrew fonts (OFL), and a synthesized pen-scratch sound.
- **Python and Blender:** `py/mv.py`, `tl.py` and `kit.py`, ported from `mathbooklm-ad/mv`, with `--estimate`, `--test-line`, `--video` and `--ratio`. Synth helpers in `scripts/audio/`.
- **Workflow:** `animatic`, `review`, `validate`, `brand-check`, the two agent prompts, and the templates in `queue/_template/` and `brands/_template/`.
- **Hebrew support:** `lang: "he"`, right-to-left layout and motion, Hebrew fonts in the brand kit, and Hebrew voice refused on models other than `eleven_v4` and `eleven_v3` before any credits are spent.
- **The desk:** `bun run dev` now opens one local page to ask for ads, watch every ratio in sync, and answer the agent. Its state is the queue folders. Sessions are kept in `queue/<folder>/.session`. The scrubbing preview moved to `/`.
- **Demo ads:** `smoke`, `parts-demo`, `hand-demo` and `py-demo`.
- **Test ads:** `whos-sarah` (English, for nykma) and `mashal` (Hebrew, for mathbooklm), with the `nykma` and `mathbooklm` brand kits.

### Changed
- **First look:** the agent now renders every ratio, shows you the MP4s and stops before any checks run. You give notes, or say "check it", "skip the checks" or "drop it". Checks used to run automatically before hand-off. Asked for after seeing how long the render and validate loop took.
- **Reviewer:** one fast agent that suggests concrete adjustments replaced the four critics (alignment, craft, viewer, language), for a simpler and faster review. This removed the pitch critique and the message, language, claim and motion reviews.
- **Spec scope:** nykma works for any app in any framework. The app's source is optional, and screenshots or a URL also work.
- **Spec non-goals:** a hosted app is still out, but one local page is now allowed.
- Scripts run on Node with `--experimental-strip-types`, because Playwright hangs under bun on Windows. `bun run` stays the command.
- Render true-peak target moved from -1.5 to -2.5 dB, because AAC overshoots.

### Fixed
- **Capture:** `--disable-partial-raster` reduces anti-aliasing differences that depended on seek order. About 1% of frames still differ, so `validate`'s re-render check allows up to 256 pixels past 48 levels.
- **Registry:** a `cues` function on an ad with no timeline could crash every ad.
- **Scripts:** Vite's file watcher cost each command 5.8 s, so it's off for one-shot scripts.
- **`mv.py`:** music cut off after the last voice line, the limiter broke the loudness target, `pcm_*` audio lacked a WAV header, crashed Blender scenes exited 0, librosa read 23 ms late and put `bar:3` a whole bar off, and old models silently ignored `language_code`.
- **`validate`:** uppercase `10X` only warned, gradient text gave false contrast failures, `ink` handwriting was invisible to Truth, and unwritten handwriting counted as on screen.
- **`hand:check`:** false `order-backwards` error on `מ.ש.ל.`.
- **`review`:** a `--frames` recheck overwrote the first pass, and the prompt now tells the reviewer to copy frame numbers from the file names.
- **`brand-check`:** hashing a folder read `.env` files. Nothing was printed, and it now skips them.
- **`beatPhase`:** the TypeScript version now matches `tl.py` after the last beat.
- **Desk:** `/media` missing files fall through to a 404 instead of the page, and stopping the agent yourself no longer shows an error.

### Known issues
- ElevenLabs has never been called live, because nykma has no key. Tests use a fake server.
- No agent can listen, so sound is checked by levels only.
- `render` reports true peak before AAC encoding, and the real value can be about 2 dB higher. `validate` measures the MP4.
- `validate` gives 100+ warnings per ad, mostly brief moments during camera moves.
- Truth reads `8x` as a claim, so algebra must go in the brand's facts.
