# Gomlin

URL: https://gomlinjobs.com
Tagline:

The app's look was read from the Flutter source, not the website's rebuild of it. Every row says where it came from. Paths are inside the gomlin repo.

## Colours

| Name | Hex | Where it came from |
|---|---|---|
| Primary purple | #655EE4 | `gomlin/lib/core/theme/pallete.dart` |
| Primary dark | #544BD0 | `gomlin/lib/core/theme/pallete.dart` |
| Secondary | #7A84D8 | `gomlin/lib/core/theme/pallete.dart` |
| Background / card (light) | #F4F5F9 | `gomlin/lib/core/theme/pallete.dart` |
| Surface variant (light) | #FFFFFF | `gomlin/lib/core/theme/pallete.dart` |
| Text | #171923 | `gomlin/lib/core/theme/pallete.dart` |
| Text secondary | #5E6272 | `gomlin/lib/core/theme/pallete.dart` |
| Border | #D7DAE6 | `gomlin/lib/core/theme/pallete.dart` |
| Apply green | #22C55E | `gomlin/lib/src/ui/widgets/job_swiper/job_swiper_widget.dart` |
| Reject red | #EF4444 | `gomlin/lib/src/ui/widgets/job_swiper/job_swiper_widget.dart` |
| Accent green | #BDF5B3 | `gomlin/lib/core/theme/pallete.dart` |
| Accent yellow | #F0D08A | `gomlin/lib/core/theme/pallete.dart` |
| Background (dark) | #141414 | `gomlin/lib/core/theme/pallete.dart` |

The app starts in the light theme (`gomlin/lib/src/blocs/theme/theme_bloc.dart`), so ads show light unless the idea needs dark.

## Fonts

Files sit in `assets/`, relative to this folder. A system font has no file. An ad copies the files it uses into `public/ads/<slug>/`.

| Role | Family | File | Licence | Where it came from |
|---|---|---|---|---|
| Latin | Noto Sans | assets/NotoSans-wdth-wght.ttf | SIL OFL 1.1 | `gomlin/assets/fonts/noto_sans/`, `gomlin/lib/core/theme/typography.dart` |
| Hebrew | Noto Sans Hebrew | assets/NotoSansHebrew-wdth-wght.ttf | SIL OFL 1.1 | `gomlin/assets/fonts/noto_sans_hebrew/`, `gomlin/lib/core/theme/typography.dart` |
| Katakana sound effects (ads only, not the app's) | Dela Gothic One 1.005 | assets/DelaGothicOne-Regular.ttf | SIL OFL 1.1, `assets/licences/DelaGothicOne-OFL.txt` | Google Fonts repo, `ofl/delagothicone/` (added 2026-11-11 for etzba-achat's manga lettering) |

## Logo

| File | Use | Where it came from |
|---|---|---|
| assets/gomlin-banner.png | wordmark, on light | `gomlin/assets/images/gomlin-banner.png`, used at 40 px high on the feed's top bar |
| assets/app-icon.png | app icon | `gomlin/assets/icons/app_icon.png` |
| assets/ui/app/chat-head.png | chat head on the dock | `gomlin-website/public/app/chat-head.png` |

## Distinctive assets

What makes Gomlin recognisable even when an ad enlarges, restyles or reimagines it. Refreshed 2026-11-11 from the same sources.

| Asset | What it is | Where it came from |
|---|---|---|
| Gomlin purple | `#655EE4`, flat and saturated: the stats band, the end card, the apply flow's accents. A purple field reads as Gomlin before any word does | `pallete.dart`, `gomlin-website/src/components/Stats.jsx` |
| The wordmark | "Gomlin" in fat rounded white letters with a thin navy outline, a purple ball for the dot on the i, a purple swoosh under it, and "jobs" in purple below. It disappears on white or light grey, so it sits on the purple (`notes.md`) | `assets/gomlin-banner.png` |
| The character | a cartoon face with a big dark-purple beard and hair, square black glasses, wide eyes, peach skin, a coral nose and a coral dot on the ear. It is the app icon and the chat head on the dock, so it can be the brand's face in an ad | `assets/app-icon.png`, `assets/ui/app/chat-head.png` |
| The swipe | one job card on a stack, dragged right to apply, left to pass, in Hebrew too. The gesture is the product | `job_swiper_widget.dart`, `assets/intro-video.mp4` |
| Red X and green arrow | the two 68 px dock buttons: reject `#EF4444`, apply `#22C55E` with the flipped `apply.svg`. On a tap each bounces 1 → 1.22 → 0.93 → 1.06 → 1 over 520 ms; while dragging, the matching one grows 35% and the others fade | `job_swiper_widget.dart`, `assets/ui/app/apply.svg` |
| "הוגש!" | the white pill that pops above the apply button after a swipe: the moment of payoff | `app_he.arb` (`jobCardAppliedText`), `job_swiper_widget.dart` |
| The streak | 🔥 on a light pill with a bar from `#8B7FF6` to `#BB72F8` | `streak_badge.dart` |
| The light card | `#F4F5F9`, radius 10, a big bold job title with the company and its logo under it, and the coloured badges | `job_card.dart`, `job_card_surface.dart` |

No sound is the brand's own: the app plays none, and `notes.md` asks for professional music only.

## App UI

Rebuild from the source, in nykma's own React.

- **Layout of the feed:** top bar 38 px icon slots with the banner centred, card stack, floating dock, bottom nav 52 px high. `job_swiper_widget.dart`, `nav_bar.dart`
- **Job card:** `#F4F5F9`, radius 10, 1 px border at 40% of `#D7DAE6`, shadow blur 20 offset 6. Title 26 / w700, company 18 / w500 with the logo on the right in Hebrew, badges with radius 8 at 10% of their colour. `job_card.dart`, `job_card_surface.dart`
- **Dock, left to right in every language:** filter 46, reject 68 (red X), resume 46, apply 68 (green `ui/app/apply.svg`, flipped), chat head 46. Swiping right applies, in Hebrew too. Dragging scales the matching button up 35% over 80 px and fades the others.
- **After applying:** a white "הוגש!" pill above the apply button, then the streak banner.
- **Nav labels (Hebrew):** פיד, משוב, פניות, פרופיל. `lib/l10n/app_he.arb`
- **Swipe badges:** "החלקה להגשה פעילה" (green) or "הגשה ידנית" (orange). `job_card.dart`

- **Device:** Android, as in `assets/intro-video.mp4`: punch-hole camera, status bar, black three-button nav bar, 1080 by 2316. The website's iPhone frame isn't how the footage shows it.
- **Job card in real use:** full-length job text runs behind the floating dock, and a company without a logo gets the purple building icon, not the website demo's coloured letter tile. The four dots at the screen's edge in the footage are a Samsung panel handle, not the app.
- **Icons:** in `assets/ui/app/`, from `gomlin-website/public/app/`. The site's scene sizes in `gomlin-website/src/components/howItWorks/` match the footage, so they're the base for type sizes.
- **Modal sheets (filters, Tailored Resume):** cover the bottom nav, over a dim backdrop. Onboarding has no bottom nav.
- **Streak banner:** `#F4F5F9`, radius 14, purple border at 35%, 🔥, bar from `#8B7FF6` to `#BB72F8`. `streak_badge.dart`

## Look outside the app

- **Stats:** solid `#655EE4` with heavy white numbers. `gomlin-website/src/components/Stats.jsx`
- **Hero:** `assets/intro-video.mp4` (real footage of the app in a hand) under a dark overlay, the banner large, black store buttons with radius 16. The site uses 55% black, and an ad needs more for text to read. `gomlin-website/src/components/Hero.jsx`
- **`step-1.png` to `step-3.png` on the site are mock-ups,** with garbled text and a "You've been accepted" screen the app doesn't have. Don't use them.
- **The screenshots in `tomcohendev-portfolio/case_studies/gomlinjobs/` are from July 2025,** an older dark design with different navigation. Don't use them.

## Tone

Plain, helpful and a little warm. The website's line: "אנו מאמינים שחיפוש עבודה לא אמור להרגיש כמו עבודה." `gomlin-website/src/i18n/translations.js`

## Facts

| Fact | Value | Where it came from |
|---|---|---|
| Stores | Google Play and the App Store | `gomlin-website/src/components/Footer.jsx` |
| Play link | https://play.google.com/store/apps/details?id=com.gomlinjobs.gomlin | `gomlin-website/src/components/Hero.jsx` |
| App Store link | https://apps.apple.com/us/app/gomlin-jobs/id6744745540 | `gomlin-website/src/components/Hero.jsx` |
| What swipe apply sends | name, email, phone and the resume | `gomlin-server/core/applicator.py` |
| Which jobs swipe apply covers | only jobs whose source is enabled; the rest are marked "הגשה ידנית" and open the original site | `gomlin/SWIPE_APPLY_CAPABILITIES.md` |
| Resume | uploaded once in the app, and parsed into the profile | `gomlin-website/src/i18n/translations.js`, `gomlin/lib/src/ui/screens/mobile/onboarding/` |
| Resume parsing | the uploaded resume suggests professional fields and countries, which the user confirms | `gomlin/lib/src/ui/screens/mobile/onboarding/fast_onboarding_screen.dart` |
| Feed order | puts jobs matching the profile's fields first; filters by field and experience level | `gomlin/BALANCED_JOB_FEED_FUNCTION.sql`, `job_filters_bottom_sheet.dart` |
| AI chat on each job | asks about fit, what to stress in the resume, and the company | `gomlin/lib/src/ui/widgets/job_swiper/job_chat_session_store.dart` |
| Tailored resume | AI edits the resume for one job, keeps about 90% of the wording and is told not to invent experience; "Apply with this" applies with it. The sheet's labels are English in every language | `gomlin-server/core/resume_suggester.py`, `job_swiper_widget.dart` |
| Applications tab | lists applied jobs, with search. No reply status | `gomlin/lib/src/ui/screens/mobile/applications/applications_screen.dart` |
| Unemployment, July 2026 | 3.3% (not seasonally adjusted) | CBS, via https://tradingeconomics.com/israel/unemployment-rate |
| Unemployment, August 2026 | 2.9% (not seasonally adjusted) | CBS, via https://tradingeconomics.com/israel/unemployment-rate |
| Unemployment, September 2026 | 3.2% (not seasonally adjusted), 143.8 thousand people | CBS, via https://www.davar1.co.il/702542/ |
| Broad unemployment, September 2026 | 4.4%, 203.8 thousand people | CBS, via https://www.davar1.co.il/702542/ |
| Job vacancies, September 2026 | 148,047, seasonally adjusted | CBS, via https://www.bizportal.co.il/career/news/article/20045078 |
| High-tech jobs | most of the 40-plus scraped sources are tech employers, such as monday, Wiz, Nvidia, Google and Microsoft. There's no job count, so say "הרבה", not a number, and don't name a company without checking it's still live | `gomlin-scraper/sites/` |
| Student jobs | "לסטודנטים" is a job type and a level in the filter sheet | `gomlin/lib/src/ui/widgets/job_swiper/job_filters_bottom_sheet.dart`, `gomlin-scraper/core/experience_level.py` |
| Forms the server can fill | Matrix, Greenhouse, Comeet and Lever, among others. Which are switched on now is in the `apply_source_capabilities` table, so don't name a source in an ad without checking it | `gomlin-server/core/applicator.py` |

## Banned claims

- That every job can be applied to with a swipe
- "ללא טפסים" or "אפס טפסים" without limiting it to jobs with swipe apply
- Interview, offer or "employer viewed you" notifications. The website's demo and features list show them, but they aren't in the app
- That Gomlin ends ghosting or gets replies. The Applications tab has no reply status
- "Unlimited applications". The limit of 5 per 24 hours is switched off for testing (`gomlin/lib/src/utils/auth_utils.dart`) and marked to come back
- Job, swipe or company counts, unless taken live. `Stats.jsx` has hardcoded fallbacks
- That unemployment is soaring or in crisis. 3.2% is low, and July was higher than September
- That the broad measure's 203.8 thousand are all looking for work. It includes discouraged and recently laid-off people
- "Get hired faster", or any claim about hiring outcomes
- Success stories or testimonials. The case studies page has none yet

## Couldn't find

- Prices. The payment policy mentions an Explorer tier, but there's no pricing page and the app's plans folder is empty. Ads don't state a price or say "free"
- A tagline in Hebrew that the brand uses everywhere
- The licence text for the Noto fonts in the app repo. They're published under the SIL OFL 1.1, so add the files to `assets/licences/` before hand-off
- A screenshot or screen recording of the current app. The kit was made from source and `assets/intro-video.mp4`, which films the phone at an angle
