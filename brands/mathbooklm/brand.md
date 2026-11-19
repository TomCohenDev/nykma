# MathbookLM

URL: https://mathbooklm.com
Tagline: Write math Naturally

Every row says where it came from. If you couldn't find something, leave it empty and list it under "Couldn't find". Don't guess.

The app in one line: write math by hand on an infinite canvas, lasso it, and it recognizes the strokes, solves them with a deterministic computer algebra system (SymPy, in the browser) and writes the answer back on the canvas. The AI routes and explains. It never does the arithmetic. (`mathbooklm/CLAUDE.md`, landing page.)

## Colours

| Name | Hex | Where it came from |
|---|---|---|
| Primary | #514fbb | `tailwind.config.ts` `primary` |
| Primary container | #6a69d6 | `tailwind.config.ts` `primary-container`; the app's selection colour |
| Primary fixed | #e2dfff | `tailwind.config.ts` `primary-fixed` |
| Secondary container | #e0e0fd | `tailwind.config.ts` `secondary-container` |
| Result accent | #5f3dc4 | `src/canvas/resultAppearance.ts` `RESULT_COLORS` |
| Ink | #1e1e1e | `Canvas.tsx` `currentItemStrokeColor` |
| Text | #1a1c1c | `tailwind.config.ts` `on-background` |
| Muted text | #464553 | `tailwind.config.ts` `on-surface-variant` |
| Canvas | #ffffff | `Canvas.tsx` `viewBackgroundColor` default |
| Canvas grid | #e5e5e5 | `Canvas.tsx` `gridColor` default, grid on, type `square`; live canvas `assets/live-canvas.png` |
| Page | #f9f9f9 | `tailwind.config.ts` `background` |
| Outline | #c7c5d5 | `tailwind.config.ts` `outline-variant` |

## Fonts

Files sit in `assets/`, relative to this folder. A system font has no file. An ad copies the files it uses into `public/ads/<slug>/`.

Every font must be licensed for video. Licence texts are in `assets/licences/`.

| Role | Family | File | Licence | Where it came from |
|---|---|---|---|---|
| Latin | Nunito | assets/Nunito-wght.ttf | OFL 1.1 | The app's UI and display font (`tailwind.config.ts`, `index.html`). File from Google Fonts |
| Hebrew | Rubik | assets/Rubik-wght.ttf | OFL 1.1 | Substitute: the app ships no Hebrew font and Nunito has no Hebrew letters. Rubik's soft corners sit well beside Nunito. File from Google Fonts |
| Hand (Latin) | Virgil | assets/Virgil-Regular.woff2 | OFL 1.1, Reserved Font Name "Virgil", used unmodified | `mathbooklm-website/public/fonts/`, the landing demo's hand font. The canvas itself writes results in Excalifont, Virgil's successor (`layout.ts`), which ships only as subset shards, so Virgil stands in for it |
| Hand (Hebrew) | Gveret Levin | assets/GveretLevin.ttf | OFL 1.1 | Substitute: the app has no Hebrew hand font. A real Hebrew cursive, the way people write in a notebook. File from Google Fonts, project AlefAlefAlef |
| App chrome | Arimo | assets/Arimo-wght.ttf | OFL 1.1 | Substitute: the selection bar renders in Arial here (`getComputedStyle` on the live canvas, 2026-10-31). Arimo has the same metrics and can be used in video. File from Google Fonts |
| Wordmark letters | KaTeX_Math | assets/KaTeX_Math-Italic.woff2 | MIT | The italic *LM* in the wordmark (`MathbookLMWordmark.css`). File from the `katex` package |

## Logo

| File | Use | Where it came from |
|---|---|---|
| assets/icon.png | The purple M. It's also the first letter of the wordmark: icon + "athbook" in Nunito bold + *LM* in KaTeX_Math italic, as in `MathbookLMWordmark.tsx` | `mathbooklm-website/public/icon.png` |

The wordmark is always LTR, even on a Hebrew card.

## Distinctive assets

What makes MathbookLM recognisable even when an ad enlarges, restyles or reimagines it. Added 2026-11-11.

| Asset | What it is | Where it came from |
|---|---|---|
| The purple M | one brush-written M in soft violet (about `#6a69d6`, a little deeper at the bottom), like a stroke of a pen. It's the icon and the wordmark's first letter, so it can be drawn on as a handwritten stroke | `assets/icon.png` |
| The wordmark | the M, then "athbook" in Nunito bold, then an italic maths *LM* (KaTeX_Math), always LTR | `MathbookLMWordmark.tsx`, `assets/KaTeX_Math-Italic.woff2` |
| "Write math Naturally" | the hero line, with "Naturally" in a gradient from `#514fbb` through `#6a69d6` to `#e2dfff` | `LandingPage.tsx`, `landing.css` `.animated-gradient-text` |
| The grid canvas | white, with a fine square grid (`#e5e5e5`, dashed every 20 px, solid every 100 px). Everything happens on it | `Canvas.tsx`, `assets/live-canvas.png` |
| Handwriting | black ink (`#1e1e1e`) in Excalidraw's hand-drawn style: the user's and the app's both look written, not typed | `Canvas.tsx`, `render/latexToExcalidraw/layout.ts` |
| The lasso and the bar | a thin purple rectangle drawn round the maths, then a dashed box with corner handles and the white bar of plain words above it (Solve · Explain · Simulate · Ask …) | `SelectionActionBar.tsx`, `assets/live-selecting.png` |
| The answer writes itself back | the result appears on the canvas in the same hand and ink, under the work, with no card: `x = 3, 5`. Solve on canvas writes steps aligned on `=` ending in a green double box. (`#5f3dc4` is the result card's trim, which is off by default) | `resultAppearance.ts` `DEFAULT_RESULT_APPEARANCE`, `resultObject.ts`, `canvasLayout/buildLayout.ts`, `palette.ts` |
| A problem that moves | a handwritten problem turned into a live simulation on the same grid, with a round purple play button, sliders and answer cards | `sim/simDocumentTemplate.ts` |

The app has no sound of its own.

## Tone

Calm, precise and a little dry: "Write math Naturally", "Your solving partner", "Find anything you've ever written", and in the footer "Built for thinkers. Academic integrity by design." (`LandingPage.tsx`, `PricingPage.tsx`, 2026-11-09). It talks to anyone who does math, with no call-outs by role. The site is English only, so a Hebrew voice has to be written fresh. (Landing and pricing pages.)

## Facts

Prices, limits and any other number an ad may state. Validators reject prices and percentages that aren't here.

| Fact | Value | Where it came from |
|---|---|---|
| Premium price | ₪34.99 / month | `PricingPage.tsx` `priceLabel`; https://mathbooklm.com/pricing, checked live 2026-10-31 (`assets/live-pricing.png`) and again 2026-11-09, unchanged (price, 7-day trial, 3 and 10 AI actions) |
| Premium trial | 7-day free trial, then billed monthly | `PricingPage.tsx` `priceSubLabel`, live pricing page |
| Free plan | Free forever | `PricingPage.tsx` |
| Free plan AI actions | 3 AI actions / day (solve · ask) | `PricingPage.tsx`; `FREE_AI_CALLS_PER_DAY` default in `mathbooklm-server/src/env.ts`; live canvas shows "3 of 3 AI actions left today" |
| Premium AI actions | 10 AI actions / day (solve · ask) | `PricingPage.tsx` |
| Free canvases | 1 infinite canvas (local) | `PricingPage.tsx` |
| Premium canvases | Unlimited canvases & folders, secure cloud sync | `PricingPage.tsx` |
| Worked equation (ads) | x² − 8x + 15 = 0, roots 3 and 5. Written on screen as 2, 8x, 15, 0, 3, 5 | Arithmetic: (x − 3)(x − 5). The app formats it `x = 3, 5` (`formatSolveOutput.ts`). Validators read 8x as a multiplier claim, so the terms are listed here |
| Worked LC circuit (ads) | L = 10 mH, C = 100 µF, charged to 9 V: ω = 1000 rad/s, f ≈ 159 Hz (159.15), peak current 0.9 A, energy 4.05 mJ; with C = 400 µF, f ≈ 79.6 Hz; critical damping at R = 20 Ω; with L = 20 mH, f ≈ 112.5 Hz | Physics, computed for `lc-lesson` 2026-11-09. Textbook laws the lesson writes: Q = CV, E = ½CV² (capacitor, electric field), V = L·dI/dt, E = ½LI² (coil, magnetic field; it opposes changes in current), ω = 1/√(LC), f = ω/2π, I = V√(C/L), E = ½CV², R = 2√(L/C). Numbers an ad shows as the app's output must match what SymPy gives for these inputs |
| Worked box with friction (ads) | m = 5 kg pulled by F = 30 N on a level floor, μ_k = 0.2, μ_s = 0.3, g = 10 m/s²: N = 50 N, kinetic friction 10 N, net force 20 N, a = 4 m/s²; static friction holds up to 15 N, so at F = 12 N friction is 12 N and a = 0; at F = 16 N, a = 1.2 m/s²; with m = 10 kg the most static friction is 30 N, so 30 N only just fails to start it | Physics, computed for `newton-lesson` 2026-11-09. Laws the lesson writes: F_net = ma, N = mg on a level floor, f_k = μ_k N, static friction f_s ≤ μ_s N (it matches the push up to that). N and mg are not a third-law pair (mg's pair is the box pulling the Earth) |

What the app really does, for ads that show it:

- **Canvas default:** white, with a square grid (fine dashed lines every 20 px, solid every 100 px at 100% zoom, `assets/live-canvas.png`).
- **Selection:** a drag makes a thin purple rectangle (`assets/live-selecting.png`). On release, a dashed box with corner handles and a white bar above it. Since 2026-11-10 the bar has ten buttons: Solve · Explain · **Simulate** · Ask · Pin · Reference · Calc · Cut · Copy · More, with Solve and Explain as split buttons (below) (`SelectionActionBar.tsx`; the production bundle served on 2026-11-11 has Simulate's hint "Build an interactive simulation next to the selection"). The bar is English and LTR, in Arial. `assets/live-selection-bar.png` and `assets/live-selection-2026-11-09.png` show the older nine plain buttons, so take the look from them and the buttons from the source.
- **Images:** a selection can hold a pasted photo or screenshot of a problem, and Solve, Explain, Simulate and Ask read it (`readSelectionForAi` in `App.tsx`, `docs/core-workflow.md`, live since 2026-11-10). Handwriting beside it is still recognized. Recognition of handwriting itself stays math only (below).
- **Solve result:** written below the source, no card, in the hand font (`DEFAULT_RESULT_APPEARANCE`). Two roots read `x = 3, 5`, not `x = 3, x = 5` (`formatEquationAssignments` in `formatSolveOutput.ts`). The landing demo's `x = 2, x = 3` is an illustration.
- **Recognition is math only:** MyScript `contentType: "Math"`, `lang: "en_US"` (`mathbooklm-server/src/lib/myscript.ts`). Hebrew on the canvas stays ink. Select the math, not the sentence around it.
- **Chat and Markdown handle Hebrew and RTL** (`CHANGELOG.md`, `lib/textDirection.ts`).

- **Simulations, two ways in:** the **Simulate** button on a selection (live since 2026-11-10: website `e51954f`, server `e119692`), or a simulation word in chat ("simulate this…"). Simulate builds the sim of the selected problem and places it on the canvas beside the selection, sized for the zoom and scrolled into view; the chat thread keeps a copy, so a follow-up like "make gravity a slider" still works. A non-math selection is refused. One AI action, refunded on failure (mathbooklm `CHANGELOG.md`, `docs/core-workflow.md`).
- **The simulation's look, since 2026-11-10** (`sim/simDocumentTemplate.ts`, `sim/mblSimRuntime.js`): a title bar, the stage, a row under it with a colour legend and a live caption that narrates the phase, and a timeline with a filled round purple play button, a scrubber and chips for key moments. A side panel holds the result cards (in a grid, final answers highlighted), live values, tables and up to 6 controls: sliders with a filled track and the value and unit beside the label. Below 520 px wide the panel moves under the stage. Stage labels sit beside their point with a halo and a leader line when moved. Logic questions draw a real gate circuit with wires coloured by value, lamps that light and a truth table. Theme colours: accent `#6d4aff`, teal `#0e9f9a`, amber `#e08a00`, red `#e5484d`, ink `#1f2430` on white. New canvas sims are laid out at 880×550; chat cards are 4:3 (4:5 in a narrow bubble). The bubble header has the title, a version switcher, Code, Expand and **Add to canvas**. On the canvas it's a live element with a transparent background (the grid shows through), clicked to interact; selected, it offers **Revise…**, Fix and a v1–v3 switcher. The older look (no side panel, a hover title badge) is in `mathbooklm/bench/results/sim-20261108T205709Z/`, so don't copy it.

### Solve and Explain on canvas (live)

Live in production: website `c4eae6e` and server `c1e90fe` shipped on 2026-11-09, and the bundle served on 2026-11-11 (`/version.json` commit `5bbacef`) still contains "Remembered for next time" and `canvas-write-status`. **Not yet seen running on the live canvas** (a run spends an AI action): look once before an ad that shows it is handed off, and keep a screenshot here.

- **Split buttons:** Solve and Explain each get a small chevron. The main part runs the last choice, shown by an icon: a pencil for "on canvas", a speech bubble for "in chat". The chevron opens a menu: "Solve on canvas" / "Solve in chat" (and the same for Explain), a ✓ by the current one, and the hint "Remembered for next time". The default is on canvas. The icons are hidden below 640 px wide (`SelectionActionBar.tsx`, `styles.css`).
- **While it works:** a white pill at the top centre reads "Writing the solution on the canvas…" (or "…the explanation…"), with a Stop button. The chat panel stays closed (`App.tsx`, `styles.css` `.canvas-write-status`).
- **Solve on canvas:** written in free space beside the selection, never over existing content, grouped as one unit, and the view pans to it. Steps sit one under another, aligned on `=`, in the hand-drawn renderer (Excalifont, ink #1e1e1e), with short muted notes beside them (Nunito, #868e96). The answer sits in a green double box: outer #2f9e44 at 2.5 px, filled #ebfbee, with a thin inner line (`canvasLayout/buildLayout.ts`, `palette.ts`).
- **Explain on canvas:** a white card with a title, a colour key, a "Problem" row, numbered step badges (blue, amber for key steps with an amber highlight box), dashed "why" notes joined by arrows, a boxed answer, a ✓ check line and a "Watch out:" note. A dashed box with an arrow goes from the student's handwriting into the card. Fixed labels follow the language: Hebrew gives "התרגיל", "תשובה" and "שימו לב:" (`buildLayout.ts`). The colours are Excalidraw's palette, not the brand's (`palette.ts`).
- **Where the numbers come from:** the prompt tells the model to take every number from the problem or from `compute_math` (SymPy), never "mentally". If a numeric final answer arrives with nothing computed, the app sends it back once for a check (`mathbooklm-server/src/lib/prompts.ts` `CANVAS_SOLVE_PROMPT`, `llm/chat.ts`). That's a rule plus one check, not a hard block. Once it ships, an ad may say the answer is computed by SymPy, but not that the AI can't produce a number on its own.
- **Cost:** one AI action per use, as before (`CHANGELOG.md`).

### Accounts

- **Free canvas to Premium:** after upgrading, the free canvas (kept only in the browser) is copied into a cloud notebook named "My free canvas", with its chat, references and a thumbnail. The local copy is never changed. Live since 2026-11-10 (`canvas/importFreeCanvas.ts`, `CHANGELOG.md`). An ad may say upgrading keeps your work.
- **Pilot invitations:** 14 days of Premium without a card, by personal invitation only, live since 2026-11-10 (`PilotPage.tsx`, `mathbooklm-server/docs/pilot.md`). Since 2026-11-11 the user wants ads that invite people to it. The page says: "Invitation only", "Your MathbookLM pilot", "Two weeks of Premium to try handwriting-first math in your lessons. No card, no subscription.", a "Premium · 14 days" tag, and "Your pilot includes": 10 AI actions a day, Unlimited canvases & folders, Secure cloud sync, No card, no automatic charge. Steps: sign in with Google with the invited email, enter the eight-character code from the invitation email, Premium starts at once for 14 days. Afterwards the account returns to the free plan. Codes are made one at a time for one email (`create-pilot-invite.ts`), and there is no public sign-up for an invitation, so a viewer asks for one by email: **contact@mathbooklm.com** (the user, 2026-11-11; the address isn't on the site, which uses support@ for help). Never show a real code. Who it's for: "in your lessons" and `ad-plan.md` point at tutors and teachers.

## Social accounts

From the site footer (`SocialLinks.tsx`, added 2026-11): YouTube https://www.youtube.com/channel/UCZFGK1fAHBdO-oNqf1r2Mow · LinkedIn https://www.linkedin.com/company/146879130/ · Instagram https://www.instagram.com/mathbooklm/ · Facebook https://www.facebook.com/mathbooklm · TikTok https://www.tiktok.com/@mathbooklm · Product Hunt https://www.producthunt.com/products/mathbooklm

## Banned claims

Phrases no ad may use.

- reads Hebrew handwriting
- קורא כתב יד בעברית
- מזהה כתב יד בעברית
- unlimited AI
- AI ללא הגבלה
- never wrong
- תמיד צודק
- 100% accurate
- 100% דיוק
- the AI solves
- ה-AI פותר

## Couldn't find

- A Hebrew name, tagline or tone of voice. The site is English only.
- A Hebrew font or Hebrew hand font in the app: both above are substitutes.
- An official wordmark file: only `icon.png` and the CSS that sets the wordmark.
- User numbers, testimonials or accuracy figures. None may be stated.
- A live run of Solve for this kit: it would spend a real AI action, so results are taken from the source.
