# CLAUDE.md

Guidance for working in this repo.

## What this is

A **static** full-screen missing-child alert for digital signage, hosted on
**GitHub Pages**. It shows one child picked at random from the open cases at
NCMEC (the National Center for Missing & Exploited Children), optionally
filtered to one US state. Same static template as `on-this-day` (its blueprint): no server, just
HTML/CSS/JS built through `@screenly-labs/signage-kit`. Like `quotes` and
`on-this-day` it is **single-shot**: one random child per page load, no rotation
and no refresh timer. The player's reload brings the next child. Keep it that
way; don't add a client-side loop or anything pushed from a server.

Active **AMBER Alerts** come first. On each load the browser asks NCMEC for
active alerts (`…/JSONDataServlet?action=amberAlert&missState=XX`, empty for
nationwide). If there are any, it shows a child from one at random, flagged
"AMBER Alert" with an "Alert issued" date, and fetches the alert's detail record
(`action=amberDetail&amberId=…`) for the photo and age. Posters are
`/poster/AMBER/{amberId}/{personId}`. No alerts, or a failed check, falls
through to the random open case below; an AMBER lookup failure must never
blank the board. `toAmberChild` drops any record that names an abductor or
companion: only the child is ever shown.

Data flow: the browser reads the launch settings (`?state=`), fetches page 1 of
NCMEC's public search
(`https://api.missingkids.org/missingkids/servlet/JSONDataServlet?action=publicSearch&search=new&subjToSearch=child[&missState=XX][&goToPage=N]`,
CORS-open, 20 per page), reads `totalPages`, fetches one random page, and shows
one child from it at random (`pickChild` prefers a case with a photo). A failed
random page falls back to page 1. The page count is remembered per filter in
`localStorage`, so later loads skip page 1 and fetch a random page directly
(one request instead of two). That is a number, not a case list.

### No bundled fallback, on purpose

Unlike `on-this-day`, there is **no offline dataset**. A stale list could show a
child who has been found. Failure modes:

- the random page fails → pick from page 1 instead;
- page 1 fails, or a filter has zero open cases → the standing **appeal** screen
  (hotline + NCMEC credit) until the next reload. It is also the no-JS screen
  (`<noscript>`).

There is **no loading screen**: while fetching, the middle of the board is
empty (masthead and hotline band only), and the child fades in. The appeal is
`display: none` unless `html[data-state="offline"]`; don't show it while
loading.

Do not add a cached or bundled case list.

## Stack & conventions

- **Bun** for everything (package manager, bundler, test runner). Never npm/npx.
  CI pins **Bun 1.3.14**; update `bun.lock` with that version. Newer Bun writes
  `lockfileVersion: 2`, which 1.3.14 can't read, and `--frozen-lockfile` fails.
- **TypeScript**, strict. All browser JS is `.ts`, bundled by the kit.
- **Tailwind CSS v4**, CSS-first (`@theme` in `assets/static/styles/tailwind.css`).
- **Biome**: single quotes, no semicolons, 2-space, 100 cols. CSS is excluded.

## Commands

```sh
bun install
bun run dev        # build + serve dist/
bun run build      # assemble dist/
bun test           # bun:test: helpers + manifest
bun run typecheck  # tsc --noEmit
bun run lint       # biome lint --error-on-warnings
```

## Layout

- `index.html`: page shell. Holds the case card (hidden until
  `html[data-state="ready"]`) and the appeal (shown only when
  `html[data-state="offline"]`, or without JS). Asset URLs carry
  `?v=__ASSET_VERSION__`, stamped at build.
- `assets/static/js/cases.ts`: **pure, exported, unit-tested** helpers: settings
  parsing (`readSettings`, `normalizeState`), `searchUrl`, the response parser
  (`parseSearch`/`toChild`/`parseTotalPages`), the AMBER Alert parsers
  (`amberUrl`/`parseAmber`/`toAmberChild`/`parseAmberDetail`), random selection
  (`pickRandomIndex`/`pickRandomPage`/`pickChild`), NCMEC date parsing (hand-rolled;
  `Date.parse` of `"Oct 13, 2026 12:00:00 AM"` is engine-specific), name/city
  casing (`tidyCase`), the poster-link UTM tags (`UTM`, `withUtm`), and display
  formatting. Add testable logic here.
- `assets/static/js/main.ts`: browser **entry**: fetch, pick, render once.
  Keep it **export-free** and free of top-level `await`.
- `.well-known/signage-app.json`: the signage-app manifest (settings schema +
  launch template `{?state}`, no `playback` since it's single-shot).
  `test/manifest.test.ts` checks the `state` enum matches `US_STATES`, so update
  both together.

## Content rules

- Show NCMEC data **unaltered** apart from casing. Never crop out, restyle or
  editorialize a case. Photos are hot-linked from `api.missingkids.org` only
  (`toChild` refuses any other origin).
- Never show unidentified-persons records. The search mixes in NCMEC's `NCMU`
  caseload (deceased "John Doe" cases with forensic reconstructions); `toChild`
  drops them via `UNIDENTIFIED_PREFIXES`. Add any other such prefix there.
- The hotline band (1-800-THE-LOST / 1-800-843-5678 / 911) and the NCMEC credit
  stay on screen in every state.
- Every case carries a QR code for its NCMEC poster, encoding the UTM-tagged
  URL. It uses error correction `L` (fewer modules for the long URL) and a
  92px size floor so modules stay 2+ device px on the 800x480 panel. Keep both,
  and re-check that it still decodes at the smallest resolutions after any
  change to the QR block or the URL.
- Test fixtures are fictional (`Jane Example`). Never commit screenshots or
  fixtures taken from real cases.

## Design: "The Bulletin"

A public-safety notice on warm paper: signal-red `Missing` flag + area in the
masthead, the photo as a large poster plate, the name in Bricolage Grotesque,
three plain facts, and a dark ink hotline band at the foot (the white Screenly
badge sits on it). One quiet fade as the child appears, gated on reduced motion; the
degraded-mode resting state for the photo lives at the end of the stylesheet.
Sizes are rem off the kit's fluid root; the photo plate uses explicit
width/height (no `aspect-ratio`, which is above the support floor).

Three layout invariants, all learned the hard way:

- **The board is exactly one viewport tall** (`height: 100svh`, card row
  `minmax(0, 1fr)`), so the hotline band always sits on the bottom edge.
- **The Screenly badge lives inside the hotline band**, in flow (unlayered
  `.hotline .brand` override at the end of the stylesheet). The kit pins
  `.brand` to the viewport corner; on this light design that put the white
  wordmark on the paper whenever the band wasn't flush with the bottom.
- **The card fits itself.** Every size inside `.card` is in `--u`
  (`1rem * --fit`), and `fitCard()` in `main.ts` steps `--fit` down from 1 to
  0.45 until the photo and details fit the card's box (measured from the
  children's rects, since a centred column overflows upwards too). It runs on
  render, on `document.fonts.ready`, and on resize (once per frame). New sizes
  inside the card must use `--u`, not `rem`, or they won't scale.

## Deploy

Tag-driven: pushing a CalVer tag runs `deploy-pages.yml`. PRs run `ci.yml`.
