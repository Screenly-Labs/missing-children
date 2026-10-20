# CLAUDE.md

Guidance for working in this repo.

## What this is

A **static** full-screen missing-child alert for digital signage, hosted on
**GitHub Pages**. It rotates through the newest open cases from NCMEC (the
National Center for Missing & Exploited Children), optionally filtered to one US
state. Same static template as `on-this-day` (its blueprint): no server, just
HTML/CSS/JS built through `@screenly-labs/signage-kit`.

Data flow: the browser reads the launch settings (`?state=&stepSeconds=`),
fetches NCMEC's public search
(`https://api.missingkids.org/missingkids/servlet/JSONDataServlet?action=publicSearch&search=new&subjToSearch=child[&missState=XX]`,
CORS-open, newest 20 cases), and shows one child per step. It refetches every
30 min, keeping the current child on screen across a refresh when still listed.

### No bundled fallback, on purpose

Unlike `on-this-day`, there is **no offline dataset**. A stale list could show a
child who has been found. Failure modes:

- refresh fails with a list already on screen → keep it, try again next cycle;
- first fetch fails, or a filter has zero open cases → the standing **appeal**
  screen (hotline + NCMEC credit, also the no-JS/pre-fetch screen), retrying
  every minute.

Do not add a cached or bundled case list.

## Stack & conventions

- **Bun** for everything (package manager, bundler, test runner). Never npm/npx.
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
  `html[data-state="ready"]`) and the appeal (shown otherwise). Asset URLs carry
  `?v=__ASSET_VERSION__`, stamped at build.
- `assets/static/js/cases.ts`: **pure, exported, unit-tested** helpers: settings
  parsing (`readSettings`, `normalizeState`, `clampStep`), `searchUrl`, the
  response parser (`parseSearch`/`toChild`), NCMEC date parsing (hand-rolled;
  `Date.parse` of `"Oct 13, 2026 12:00:00 AM"` is engine-specific), name/city
  casing (`tidyCase`), the poster-link UTM tags (`UTM`, `withUtm`), and display
  formatting. Add testable logic here.
- `assets/static/js/main.ts`: browser **entry**: fetch loop, rotation, render.
  Keep it **export-free** and free of top-level `await`.
- `.well-known/signage-app.json`: the signage-app manifest (settings schema +
  launch template `{?state,stepSeconds}`). `test/manifest.test.ts` checks the
  `state` enum matches `US_STATES` and the `stepSeconds` bounds match the clamp,
  so update both together.

## Content rules

- Show NCMEC data **unaltered** apart from casing. Never crop out, restyle or
  editorialize a case. Photos are hot-linked from `api.missingkids.org` only
  (`toChild` refuses any other origin).
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
badge sits on it). One quiet fade per step, gated on reduced motion; the
degraded-mode resting state for the photo lives at the end of the stylesheet.
Sizes are rem off the kit's fluid root; the photo plate uses explicit
width/height (no `aspect-ratio`, which is above the support floor).

## Deploy

Tag-driven: pushing a CalVer tag runs `deploy-pages.yml`. PRs run `ci.yml`.
