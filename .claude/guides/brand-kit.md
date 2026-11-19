# Making or refreshing a brand kit

Read this when the user asks for a new brand, or to refresh part of one. An ad for an existing brand uses the kit as saved and never re-derives it.

- **A new brand:** take whatever the user points you at, fill in `brands/_template/`, list what you couldn't find instead of guessing, and put the sources in `sources.txt` one per line (`bun run brand-check` records their hashes).
- **Every row says where it came from.** The facts table is what ads may state, and `validate` rejects prices and percentages that aren't in it, so a fact goes in only with its source.
- **Distinctive assets:** the colours, shapes, sounds, screens and moments that make the product recognisable even when an ad redraws it (a card's rounded purple corners, a swipe, a sound-logo). Ads may reimagine the product, so this list is what keeps it the brand's. Name only what the sources show.
- **Fonts** must be licensed for video: record each licence in `brand.md`. When the app's font can't be used (Apple's San Francisco, for example), pick a licensed substitute and note it.
- **Assets** stay in the kit's `assets/`. An ad copies what it uses into `public/ads/<slug>/`, because the page and the hand tracer read only `public/`: `{ family: "Brand Hand", src: "ads/<slug>/hand.woff2" }`.
- **A refresh:** do only the part asked for, and say what changed. To accept a changed source, leave just its path on its line and run `brand-check` again.
- `notes.md` holds the user's standing notes for the brand's ads (`bun run history` prints it). Start it empty.
