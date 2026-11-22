# Free stock

Read this when the idea needs a shot that code, Blender or the user's footage can't make: a real person, a place, a thing in the world. Look in free stock before you propose generating it. A clip costs nothing here and about $2 generated. The order: free stock, then code, Blender or the user's footage, then generated. Stock has to fit the idea's look, not just its subject: when the best result would look generic next to the rest of the ad, say so in the pitch ("stock: pexels:12345 fits, but generic → generate") and go to `.claude/guides/generated.md`.

- `bun run stock <slug> "person laughing at a phone" --video --min-seconds 4` asks the desk to search Pexels and Pixabay (it holds the keys, so it must be running). Read the sheet it prints: each result is a numbered tile, and a clip is four frames from its preview, left to right, top to bottom. Try two or three wordings before giving up.
- In the pitch, give each such shot a line: "stock: found pexels:12345" or "no fit → generate". Take nothing until the user says go.
- `bun run stock <slug> --take pexels:12345 --name laugh` downloads the file that fits the ratios (`--ratio 1x1,9x16`) into `public/ads/<slug>/stock/`. A clip is unpacked like footage, with its `<Footage>` line and sheet (`.claude/guides/footage.md`). A photo is `asset("ads/<slug>/stock/<file>")`.
- A stock person is a mood or a situation, the way an illustration is: never a customer, a user, a testimonial, or anyone endorsing the product. Both licences forbid implying endorsement.
- No visible third-party logos or brands, and no product UI from stock. The app is built in code, as always.
- Credit each one in `post.md` and the README with the line `--take` prints ("Video by … on Pexels", with the link). `sources.json` keeps the record. After a clone, `bun run stock <slug>` downloads them again.
