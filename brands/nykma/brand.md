# nykma

URL: https://nobodyknowsmyapp.com
Tagline: nobody knows my app

Every row says where it came from. There is no site and no logo yet, so the URL is a placeholder (`.example` is a reserved domain) and the logo was designed in code for the first ad.

## Colours

| Name | Hex | Where it came from |
|---|---|---|
| Ink | #141414 | Designed for this kit: terminal black |
| Paper | #F4EFE6 | Designed for this kit: the sheet under the ad, close to `hand-demo`'s paper |
| Marker | #E8301F | Designed for this kit: the correcting pen |

## Fonts

Files sit in `assets/`, relative to this folder. A system font has no file. An ad copies the files it uses into `public/ads/<slug>/`.

| Role | Family | File | Licence | Where it came from |
|---|---|---|---|---|
| Latin | JetBrains Mono | assets/JetBrainsMono-wght.ttf | OFL 1.1 (assets/JetBrainsMono-OFL.txt), covers video | Chosen for this kit: nykma lives in a terminal. github.com/google/fonts |
| Latin display | Archivo Black | assets/ArchivoBlack-Regular.ttf | OFL 1.1 (assets/ArchivoBlack-OFL.txt), covers video | Chosen for this kit. github.com/google/fonts |
| Hand (Latin) | Caveat | assets/Caveat-wght.ttf | OFL 1.1 (public/fonts/caveat/), covers video | Ships with nykma: `HAND_FONTS.caveat` |

## Logo

| File | Use | Where it came from |
|---|---|---|
| assets/logo.svg | on light | Designed in code for this kit: a terminal `>` closed by one red pen stroke makes a play button |
| assets/logo-on-dark.svg | on dark | The same, chevron in Paper |
| assets/icon.svg | app and site icon, on any ground | Chosen by the user on 2026-11-19 for nobodyknowsmyapp.com: a white play button and a red cursor on a black tile (P1). The site's favicon and home-screen icons are made from it |

## Tone

Dry, plain, lowercase, a little tired of marketing. It says what the tool does and stops. Taken from the README ("A bare-bones ad maker") and the "Don't lie" section of `.claude/agents/ad-agent.md`.

## Facts

Prices, limits and any other number an ad may state. Validators reject prices and percentages that aren't here.

| Fact | Value | Where it came from |
|---|---|---|
| Output ratios | 16:9, 1:1, 9:16 | README.md |
| Output format | MP4, with post copy in post.md | README.md |
| Runs | Locally, in Claude Code | README.md |
| Publishing | Posts only what the user approves, on the desk or with `bun run publish` when they ask an agent to | spec.md §10.12 |
| Spending | No money is spent without the user's go-ahead | README.md |

## Banned claims

Phrases no ad may use.

- posts for you
- auto-post
- guaranteed
- go viral
- no Claude Code needed

## Couldn't find

- A real logo. The one here was made for this ad.
- Prices, users, customers, testimonials, results: none exist, so none are stated.
