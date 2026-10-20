// Browser entry. @screenly-labs/signage-kit bundles this (inlining ./cases)
// into a self-contained classic script with no exports, so it loads from a
// plain <script>. Keep it export-free and free of top-level await.
//
// Flow: read the launch settings → fetch NCMEC's newest cases (optionally one
// state) → rotate through them one per step → refetch every REFRESH_MS. A
// failed refresh keeps the last good list on screen. If there has never been a
// good list (offline from boot), the page shows the hotline card instead and
// retries. There is deliberately no bundled fallback list: a stale record could
// show a child who has since been found.

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
  daysSince,
  displayUrl,
  formatDate,
  formatDuration,
  formatPlace,
  parseSearch,
  readSettings,
  searchUrl,
  withUtm
} from './cases'

const FETCH_TIMEOUT_MS = 10_000
const REFRESH_MS = 30 * 60 * 1000
const RETRY_MS = 60 * 1000

const settings = readSettings(window.location.search)
let cases: MissingChild[] = []
let index = 0
let stepTimer = 0

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

// Warm the cache for the next photo so the swap is instant on slow links.
const preload = (child: MissingChild | undefined): void => {
  if (!child?.photoUrl) return
  const img = new Image()
  img.src = child.photoUrl
}

const render = (child: MissingChild): void => {
  const today = new Date()
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
  text('mc-count', cases.length > 1 ? `${index + 1} / ${cases.length}` : '')
  renderPhoto(child)

  // Replay the entrance on every step: drop the flag, force a reflow, re-add.
  const card = el('mc-card')
  if (card) {
    card.classList.remove('is-entering')
    void card.offsetWidth
    card.classList.add('is-entering')
  }
  document.documentElement.dataset.state = 'ready'
}

const step = (): void => {
  if (cases.length === 0) return
  index = (index + 1) % cases.length
  render(cases[index])
  preload(cases[(index + 1) % cases.length])
}

const startRotation = (): void => {
  window.clearInterval(stepTimer)
  stepTimer = window.setInterval(step, settings.stepSeconds * 1000)
}

const fetchCases = async (): Promise<MissingChild[]> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(searchUrl(settings.state), {
      credentials: 'omit',
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return parseSearch(await res.json())
  } finally {
    clearTimeout(timer)
  }
}

const showOffline = (): void => {
  window.clearInterval(stepTimer)
  document.documentElement.dataset.state = 'offline'
}

const load = async (): Promise<void> => {
  let next: MissingChild[]
  try {
    next = await fetchCases()
  } catch (error) {
    console.error('Missing children: fetch failed —', error)
    if (cases.length === 0) {
      showOffline()
      window.setTimeout(load, RETRY_MS)
    } else {
      window.setTimeout(load, REFRESH_MS)
    }
    return
  }

  if (next.length === 0) {
    // A successful but empty answer (no open cases for this filter) is real
    // data, not an outage: clear the list rather than keep stale cases up.
    cases = []
    showOffline()
  } else {
    // Keep showing the same child across a refresh when they are still listed,
    // so a refresh never cuts a step short or jumps back to the start.
    const current = cases[index]?.posterUrl
    cases = next
    const kept = current ? next.findIndex((c) => c.posterUrl === current) : -1
    index = kept >= 0 ? kept : 0
    if (kept < 0) render(cases[index])
    else text('mc-count', cases.length > 1 ? `${index + 1} / ${cases.length}` : '')
    preload(cases[(index + 1) % cases.length])
    startRotation()
  }
  window.setTimeout(load, REFRESH_MS)
}

const init = (): void => {
  removeScreenlyBranding()
  // Report which player is showing this. A static app can only profile from the
  // user agent and referrer. No-op until a GA tag is added to index.html.
  trackPlayer(detectPlayer(), { app: 'missing-children', sendPageView: true })
  text('mc-region', settings.state ? US_STATES[settings.state] : 'United States')
  void load()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
