// Browser entry. @screenly-labs/signage-kit bundles this (inlining ./cases)
// into a self-contained classic script with no exports, so it loads from a
// plain <script>. Keep it export-free and free of top-level await.
//
// Single-shot, like quotes and on-this-day: each page load pulls one child at
// random from NCMEC's open cases (optionally one state) and shows them. There is
// no rotation and no refresh timer; the player's reload is what brings the next
// child. Picking at random across every page, not just the newest 20, spreads
// the exposure over all open cases.
//
// An active AMBER Alert comes first: while NCMEC lists one for this area, every
// load shows a child from it (flagged "AMBER Alert"). Only when there is none,
// or the lookup fails, does the board fall back to a random open case.
//
// Flow: read the launch settings → check for active AMBER Alerts → fetch page 1 (which also reports how many
// pages there are) → fetch one random page → pick a child at random. If the
// random page fails, fall back to a child from page 1. If nothing loads at all,
// or the filter has no open cases, the standing appeal stays up. There is
// deliberately no bundled fallback list: a stale record could show a child who
// has since been found.

// Side-effect import: installs the replaceChildren shim for the older-browser
// degraded mode. Must stay first so the shim is in place before any render.
import '@screenly-labs/signage-kit/polyfills'
import { trackPlayer } from '@screenly-labs/signage-kit/analytics'
import { removeScreenlyBranding } from '@screenly-labs/signage-kit/branding'
import { detectPlayer } from '@screenly-labs/signage-kit/profiler'
import qrcode from 'qrcode-generator'
import {
  type MissingChild,
  US_STATES,
  amberDetailUrl,
  amberUrl,
  daysSince,
  displayUrl,
  formatDate,
  formatDuration,
  formatPlace,
  parseAmber,
  parseAmberDetail,
  parseSearch,
  parseTotalPages,
  pickChild,
  pickRandomIndex,
  pickRandomPage,
  readSettings,
  searchUrl,
  withUtm
} from './cases'

const FETCH_TIMEOUT_MS = 10_000
// The card shrinks in FIT_STEP steps down to MIN_FIT of its designed size.
const MIN_FIT = 0.45
const FIT_STEP = 0.05

const settings = readSettings(window.location.search)

const el = (id: string): HTMLElement | null => document.getElementById(id)

const text = (id: string, value: string): void => {
  const node = el(id)
  if (node) node.textContent = value
}

const initials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

// QR SVG for the poster link, built locally: the URL is encoded into modules,
// never injected as markup. Error correction 'L': a screen never gets scuffed
// like paper does, and the lower level keeps the module count (and so the
// minimum readable size) down for the long UTM-tagged URL.
const qrSvg = (link: string): string => {
  const qr = qrcode(0, 'L')
  qr.addData(link)
  qr.make()
  return qr.createSvgTag({ scalable: true, margin: 0 })
}

const renderPhoto = (child: MissingChild): void => {
  const frame = el('mc-photo-frame')
  const img = el('mc-photo') as HTMLImageElement | null
  if (!frame || !img) return
  text('mc-initials', initials(child.name))
  if (!child.photoUrl) {
    img.removeAttribute('src')
    frame.dataset.state = 'empty'
    return
  }
  // Show the initials card until the photo has loaded, and keep it if the photo
  // fails, so a broken image never sits on screen.
  frame.dataset.state = 'loading'
  img.onload = () => {
    frame.dataset.state = 'ready'
  }
  img.onerror = () => {
    frame.dataset.state = 'empty'
  }
  img.alt = `Photo of ${child.name}`
  img.src = child.photoUrl
}

// Does the card's content (photo + details) fit inside its own content box?
// Measured from the children's boxes rather than scrollHeight, because a
// centred flex column overflows upwards too, which scrollHeight never counts.
const cardFits = (card: HTMLElement): boolean => {
  const box = card.getBoundingClientRect()
  const cs = getComputedStyle(card)
  const top = box.top + Number.parseFloat(cs.paddingTop)
  const bottom = box.bottom - Number.parseFloat(cs.paddingBottom)
  const left = box.left + Number.parseFloat(cs.paddingLeft)
  const right = box.right - Number.parseFloat(cs.paddingRight)
  for (const child of Array.from(card.children)) {
    const r = child.getBoundingClientRect()
    if (r.top < top - 1 || r.bottom > bottom + 1 || r.left < left - 1 || r.right > right + 1) {
      return false
    }
  }
  return true
}

// Scale the card (every size inside it is in --u = 1rem * --fit) down until it
// fits the space between the masthead and the hotline band. The CSS sizes are
// the design at full size; this only ever shrinks, so the band and the badge
// stay put at any window shape, including near-square desktop windows.
const fitCard = (): void => {
  const card = el('mc-card')
  if (!card || document.documentElement.dataset.state !== 'ready') return
  let fit = 1
  card.style.setProperty('--fit', '1')
  while (fit > MIN_FIT && !cardFits(card)) {
    fit = Math.max(MIN_FIT, Math.round((fit - FIT_STEP) * 100) / 100)
    card.style.setProperty('--fit', String(fit))
  }
}

const render = (child: MissingChild): void => {
  const today = new Date()
  if (child.amber) {
    document.documentElement.dataset.alert = 'amber'
    text('mc-flag', 'AMBER Alert')
    text('mc-date-label', 'Alert issued')
  }
  text('mc-name', child.name)
  text('mc-age', child.age === null ? 'Unknown' : String(child.age))
  text('mc-place', formatPlace(child) || 'Unknown')
  if (child.missingDate) {
    text('mc-date', formatDate(child.missingDate))
    text('mc-duration', formatDuration(daysSince(child.missingDate, today)))
  } else {
    text('mc-date', 'Unknown')
    text('mc-duration', '')
  }
  const link = withUtm(child.posterUrl)
  const poster = el('mc-poster') as HTMLAnchorElement | null
  if (poster) poster.href = link
  const qr = el('mc-qr')
  if (qr) qr.innerHTML = qrSvg(link)
  text('mc-poster-url', displayUrl(child.posterUrl))
  renderPhoto(child)
  document.documentElement.dataset.state = 'ready'
  fitCard()
  // Webfont metrics differ from the fallback's, so fit again once they land.
  if (document.fonts?.ready) document.fonts.ready.then(fitCard)
}

const fetchJson = async (url: string): Promise<unknown> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      credentials: 'omit',
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

const fetchPage = (page: number): Promise<unknown> => fetchJson(searchUrl(settings.state, page))

// A child from an active AMBER Alert for this area, or null when there is none
// or NCMEC can't be reached (the random-case path then runs as usual). The list
// has no photo or age, so the alert's detail record is fetched for them; without
// it the initials card stands in.
const loadAmber = async (): Promise<MissingChild | null> => {
  let alerts: MissingChild[]
  try {
    alerts = parseAmber(await fetchJson(amberUrl(settings.state)))
  } catch (error) {
    console.error('Missing children: AMBER Alert check failed —', error)
    return null
  }
  if (alerts.length === 0) return null
  const child = alerts[pickRandomIndex(alerts.length)]
  try {
    const detail = parseAmberDetail(await fetchJson(amberDetailUrl(child.caseNumber)))
    return { ...child, photoUrl: child.photoUrl ?? detail.photoUrl, age: child.age ?? detail.age }
  } catch (error) {
    console.error('Missing children: AMBER Alert photo failed —', error)
    return child
  }
}

// The page count from the last load, per filter. Remembering it lets the next
// load fetch one random page straight away instead of page 1 first, halving
// the time to first content. It is only a number, never a case: every case
// shown is always fetched live.
const pagesKey = `missing-children:pages:${settings.state ?? 'US'}`

const readCachedPages = (): number => {
  try {
    const n = Number(window.localStorage.getItem(pagesKey))
    return Number.isInteger(n) && n > 0 ? n : 0
  } catch {
    return 0 // storage disabled (private mode, locked-down players)
  }
}

const storePages = (n: number): void => {
  if (n < 1) return
  try {
    window.localStorage.setItem(pagesKey, String(n))
  } catch {
    // Not fatal: the next load just takes the page-1 path again.
  }
}

const loadChild = async (): Promise<MissingChild | null> => {
  // Fast path: one request, to a random page within the remembered count. If
  // the count has shrunk since, that page comes back empty and we fall through.
  const cached = readCachedPages()
  if (cached > 1) {
    try {
      const data = await fetchPage(pickRandomPage(cached))
      storePages(parseTotalPages(data))
      const picked = pickChild(parseSearch(data))
      if (picked) return picked
    } catch (error) {
      console.error('Missing children: cached page failed, starting from page 1 —', error)
    }
  }

  const first = await fetchPage(1)
  const firstCases = parseSearch(first)
  const total = parseTotalPages(first)
  storePages(total)
  const page = pickRandomPage(total)
  if (page <= 1) return pickChild(firstCases)
  try {
    const picked = pickChild(parseSearch(await fetchPage(page)))
    if (picked) return picked
  } catch (error) {
    console.error(`Missing children: page ${page} failed, using page 1 —`, error)
  }
  return pickChild(firstCases)
}

// Nothing to show (offline, NCMEC unreachable, or no open cases for this
// filter): reveal the standing appeal. It is hidden while loading, so a normal
// load goes straight from the empty frame to the child.
const showAppeal = (): void => {
  document.documentElement.dataset.state = 'offline'
}

const init = (): void => {
  removeScreenlyBranding()
  // Report which player is showing this. A static app can only profile from the
  // user agent and referrer.
  trackPlayer(detectPlayer(), { app: 'missing-children', sendPageView: true })
  text('mc-region', settings.state ? US_STATES[settings.state] : 'United States')
  // Re-fit when the window or the screen's orientation changes, at most once
  // per frame.
  let fitQueued = false
  window.addEventListener('resize', () => {
    if (fitQueued) return
    fitQueued = true
    window.requestAnimationFrame(() => {
      fitQueued = false
      fitCard()
    })
  })
  loadAmber()
    .then((alert) => alert ?? loadChild())
    .then((child) => {
      if (child) render(child)
      else showAppeal() // no open cases for this filter
    })
    .catch((error) => {
      console.error('Missing children: fetch failed, showing the appeal —', error)
      showAppeal()
    })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
