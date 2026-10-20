# Screenly Missing Children App

A full-screen missing-child alert for digital signage. It rotates through the
newest open cases from the **National Center for Missing & Exploited Children**
(NCMEC), nationwide or for one US state, one child at a time: their photo, their
age now, when and where they went missing, and a link to the full NCMEC poster.
The 24-hour **1-800-THE-LOST** hotline is on screen at every step.

Live: **https://missing-children.srly.io**

Part of the Screenly signage family alongside [on-this-day](https://github.com/Screenly-Labs/on-this-day),
[word-of-the-day](https://github.com/Screenly-Labs/word-of-the-day) and
[quotes](https://github.com/Screenly-Labs/quotes). Like those, it is a fully
**static** site hosted on **GitHub Pages**, built on
[`@screenly-labs/signage-kit`](https://github.com/Screenly-Labs/signage-kit). The
case data is fetched from NCMEC in the browser.

## Settings

Settings are query parameters on the launch URL, declared in
[`.well-known/signage-app.json`](.well-known/signage-app.json) so the app store
renders the form.

| Parameter | Values | Default |
| --- | --- | --- |
| `state` | Two-letter US state or territory code (`CA`, `TX`, `PR`, …) | nationwide |
| `stepSeconds` | Seconds per child, `6`–`120` | `15` |

```
https://missing-children.srly.io/?state=CA&stepSeconds=20
```

An unknown `state` falls back to nationwide; an out-of-range `stepSeconds` is
clamped.

## Where the data comes from

The page calls the public JSON search behind
[missingkids.org](https://www.missingkids.org/gethelpnow/search):

```
https://api.missingkids.org/missingkids/servlet/JSONDataServlet?action=publicSearch&search=new&subjToSearch=child[&missState=CA]
```

It returns the 20 most recently reported open cases and answers CORS requests
from any origin, so the static page calls it directly with no server and no API
key. Photos load from `api.missingkids.org/photographs/…`, and every case links
to its official poster at `missingkids.org/poster/…`.

The list is refetched every 30 minutes. A failed refresh keeps the current list
on screen; if the very first fetch fails (offline signage), the page shows a
standing appeal with the hotline and retries every minute. There is
**deliberately no bundled fallback list**: a stale record could show a child who
has already been found.

## Stack

- **Bun** for package management, bundling and tests (no npm/npx)
- **TypeScript**, strict; all browser JS is authored as `.ts`
- **Tailwind CSS v4**, CSS-first config, compiled by the Tailwind CLI
- **Biome** for lint + format
- Self-hosted Bricolage Grotesque + Hanken Grotesk, vendored via signage-kit

## Develop

```sh
bun install
bun run dev        # build, then serve dist/ locally
bun run build      # build the static site into dist/
bun test           # unit + manifest tests
bun run typecheck  # tsc --noEmit
bun run lint       # Biome (lint:fix / format to auto-fix)
```

## Supported resolutions

The layout is fluid (one `clamp()`-driven root size from signage-kit). Verified
landscape **and** portrait across:

| Resolution | Notes |
| --- | --- |
| 4096×2160 · 3840×2160 (+ portrait) | 4K |
| 1920×1080 (+ portrait) | 1080p |
| 1280×720 (+ portrait) | 720p |
| 800×480 (+ portrait) | Raspberry Pi Touch Display |

## Deploy

Deploys are **tag-driven**. Pushing a CalVer tag (`YYYY.N.P`, e.g. `2026.10.0`)
runs `.github/workflows/deploy-pages.yml`, which builds and publishes `dist/` to
GitHub Pages; it can also be run by hand (`workflow_dispatch`). Pushing to
`master` on its own does **not** deploy. CI (`ci.yml`) typechecks, lints, tests
and builds every PR.

One-time setup (outside this repo):

1. **DNS:** `CNAME` record `missing-children.srly.io → screenly-labs.github.io`.
2. **Repo → Settings → Pages:** Source = "GitHub Actions"; set the custom domain
   to `missing-children.srly.io` and enable "Enforce HTTPS" once the certificate
   provisions.

## Attribution

Case data and photographs are provided by the
[National Center for Missing & Exploited Children](https://www.missingkids.org)
and are shown unaltered, with a link to each official poster and a standing
credit on every screen. This app is not affiliated with or endorsed by NCMEC.

## License

AGPL-3.0-only (see `LICENSE`).
