// Pure, unit-tested helpers for the missing-children app (no DOM). main.ts owns
// the fetch loop and rendering; everything that can be tested without a browser
// lives here so test/cases.test.ts can import it directly.
//
// Data source: the public JSON search behind missingkids.org, run by the
// National Center for Missing & Exploited Children (NCMEC). It answers CORS
// requests from any origin, so the static page calls it directly.

export const API_BASE = 'https://api.missingkids.org'
export const SEARCH_PATH = '/missingkids/servlet/JSONDataServlet'
export const POSTER_BASE = 'https://www.missingkids.org/poster'

// NCMEC's 24-hour hotline, shown on every screen.
export const HOTLINE = '1-800-THE-LOST'
export const HOTLINE_DIGITS = '1-800-843-5678'

// UTM tags on the poster link the QR code encodes, so NCMEC can see traffic
// arriving from screens running this app.
export const UTM = {
  utm_source: 'missing-children',
  utm_medium: 'qr',
  utm_campaign: 'missing-child-poster'
} as const

// Two-letter codes NCMEC accepts as `missState`: the 50 states, DC, and the
// inhabited territories.
export const US_STATES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District of Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  AS: 'American Samoa',
  GU: 'Guam',
  MP: 'Northern Mariana Islands',
  PR: 'Puerto Rico',
  VI: 'U.S. Virgin Islands'
}

// Active AMBER Alerts live under this pseudo org prefix: their posters are
// `/poster/AMBER/{amberId}/{personId}`.
export const AMBER_PREFIX = 'AMBER'

// Roles an AMBER Alert record can name besides the child. Such a record is
// never shown as "Have you seen this child?".
const NOT_A_CHILD = /abductor|companion|suspect/i

// Org prefixes whose records are unidentified remains, not missing children.
export const UNIDENTIFIED_PREFIXES = new Set(['NCMU'])

export const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

const MONTHS_SHORT = MONTHS_LONG.map((m) => m.slice(0, 3))

export interface MissingChild {
  caseNumber: string
  name: string
  /** Current age in years, as NCMEC reports it ("Age Now"). */
  age: number | null
  /** Local calendar date the child went missing, `YYYY-MM-DD`. */
  missingDate: string | null
  city: string
  state: string
  /** Absolute photo URL, or null when the case has no photo. */
  photoUrl: string | null
  /** The public NCMEC poster for this case. */
  posterUrl: string
  /** True for a child in an active AMBER Alert. */
  amber: boolean
}

export interface Settings {
  /** Two-letter state filter, or null for nationwide. */
  state: string | null
}

/** Upper-case a valid state/territory code, or null for anything else. */
export const normalizeState = (raw: string | null | undefined): string | null => {
  if (!raw) return null
  const code = raw.trim().toUpperCase()
  return code in US_STATES ? code : null
}

/** Reads the launch-URL settings (`?state=CA`). */
export const readSettings = (search: string): Settings => ({
  state: normalizeState(new URLSearchParams(search).get('state'))
})

/**
 * NCMEC search URL for open cases, newest first, optionally scoped to one state.
 * Results come 20 to a page; `page` is 1-based.
 */
export const searchUrl = (state: string | null, page = 1): string => {
  const params = new URLSearchParams({
    action: 'publicSearch',
    search: 'new',
    searchLang: 'en_US',
    subjToSearch: 'child',
    LanguageId: 'en_US'
  })
  if (state) params.set('missState', state)
  if (page > 1) params.set('goToPage', String(page))
  return `${API_BASE}${SEARCH_PATH}?${params.toString()}`
}

/** NCMEC's active AMBER Alerts, optionally scoped to one state. */
export const amberUrl = (state: string | null): string => {
  const params = new URLSearchParams({
    action: 'amberAlert',
    missState: state ?? '',
    LanguageId: 'en_US'
  })
  return `${API_BASE}${SEARCH_PATH}?${params.toString()}`
}

/** The detail record for one AMBER Alert, which carries the photo. */
export const amberDetailUrl = (amberId: string): string => {
  const params = new URLSearchParams({ action: 'amberDetail', amberId, LanguageId: 'en_US' })
  return `${API_BASE}${SEARCH_PATH}?${params.toString()}`
}

/**
 * Parses NCMEC's `"Oct 13, 2026 12:00:00 AM"` (or the AMBER list's `10/13/2026`)
 * into `YYYY-MM-DD`. Done by hand
 * because `Date.parse` of that format is engine-specific, and the date is a
 * calendar date with no meaningful time or zone.
 */
export const parseMissingDate = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null
  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(raw.trim())
  if (numeric) {
    const [month, day] = [Number(numeric[1]), Number(numeric[2])]
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return `${numeric[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const m = /^([A-Za-z]{3})[a-z]*\.? +(\d{1,2}), +(\d{4})/.exec(raw.trim())
  if (!m) return null
  const month = MONTHS_SHORT.findIndex((s) => s.toLowerCase() === m[1].toLowerCase())
  const day = Number(m[2])
  if (month < 0 || day < 1 || day > 31) return null
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** `2026-10-13` → `October 13, 2026`. */
export const formatDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${d}, ${y}`
}

/** Whole days between a `YYYY-MM-DD` date and `today` (local), never negative. */
export const daysSince = (iso: string, today: Date): number => {
  const [y, m, d] = iso.split('-').map(Number)
  const start = Date.UTC(y, m - 1, d)
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.max(0, Math.round((now - start) / 86_400_000))
}

/** "Missing 3 days" / "Missing 1 year" style duration, coarsened as it grows. */
export const formatDuration = (days: number): string => {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (days < 1) return 'Missing since today'
  if (days < 60) return `Missing ${plural(days, 'day')}`
  if (days < 730) return `Missing ${plural(Math.floor(days / 30.44), 'month')}`
  return `Missing ${plural(Math.floor(days / 365.25), 'year')}`
}

/**
 * Cases arrive in mixed casing ("GENESIS MAYORQUIN", "Ian Moreno"). Title-case
 * only the words that are entirely upper- or lower-case, so deliberate casing
 * like "McKenzie" or "DeShawn" survives.
 */
export const tidyCase = (raw: string): string =>
  raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) =>
      word === word.toUpperCase() || word === word.toLowerCase()
        ? word.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase())
        : word
    )
    .join(' ')

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Validates and normalizes one entry of the search response's `persons`. */
export const toChild = (raw: unknown): MissingChild | null => {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const caseNumber = str(p.caseNumber)
  const orgPrefix = str(p.orgPrefix)
  const first = str(p.firstName)
  const last = str(p.lastName)
  if (!caseNumber || !orgPrefix || !(first || last)) return null
  // Only child records: the same search can return adult (CSAW) cases.
  if (p.isChild === false) return null
  // NCMU is NCMEC's unidentified-persons caseload (deceased "John Doe" cases
  // with forensic reconstructions), mixed into the same search. Those are not
  // missing children and must never be shown as one.
  if (UNIDENTIFIED_PREFIXES.has(orgPrefix.toUpperCase())) return null
  const seq = typeof p.seqNumber === 'number' ? p.seqNumber : 1
  const image = str(p.imageUrl)
  return {
    caseNumber,
    name: tidyCase([first, last].filter(Boolean).join(' ')),
    age: typeof p.age === 'number' && p.age > 0 ? p.age : null,
    missingDate: parseMissingDate(p.missingDate),
    city: tidyCase(str(p.missingCity)),
    state: str(p.missingState).toUpperCase(),
    photoUrl: p.hasThumbnail !== false && image.startsWith('/') ? `${API_BASE}${image}` : null,
    posterUrl: `${POSTER_BASE}/${encodeURIComponent(orgPrefix)}/${encodeURIComponent(caseNumber)}/${seq}`,
    amber: false
  }
}

/** A photo path from NCMEC, made absolute; null for anything off-origin. */
const ncmecPhoto = (raw: unknown): string | null => {
  const path = str(raw)
  return path.startsWith('/') && !path.startsWith('//') ? `${API_BASE}${path}` : null
}

/**
 * Validates and normalizes one entry of the amberAlert response's `persons`.
 * The field names follow NCMEC's own AMBER widget, which accepts either spelling
 * of the id, name and place. The list carries no photo (see `amberPhotoUrl`).
 */
export const toAmberChild = (raw: unknown): MissingChild | null => {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const id = str(p.amberId) || str(p.caseNumber)
  const name = str(p.fullName) || [str(p.firstName), str(p.lastName)].filter(Boolean).join(' ')
  if (!id || !name) return null
  if (p.isChild === false) return null
  for (const role of [p.personType, p.role, p.relationship, p.subjectType]) {
    if (typeof role === 'string' && NOT_A_CHILD.test(role)) return null
  }
  const seq = typeof p.personId === 'number' || typeof p.personId === 'string' ? p.personId : 1
  // `missingFrom` is "City ST"; otherwise separate city/state fields.
  const from = /^(.+?),?\s+([A-Za-z]{2})$/.exec(str(p.missingFrom))
  return {
    caseNumber: id,
    name: tidyCase(name),
    age: typeof p.age === 'number' && p.age > 0 ? p.age : null,
    missingDate:
      parseMissingDate(p.alertDate) ?? parseMissingDate(p.missingDate) ?? parseMissingDate(p.date),
    city: tidyCase(from ? from[1] : str(p.city) || str(p.missingCity)),
    state: (from ? from[2] : str(p.state) || str(p.missingState)).toUpperCase(),
    photoUrl: ncmecPhoto(p.imageUrl),
    posterUrl: `${POSTER_BASE}/${AMBER_PREFIX}/${encodeURIComponent(id)}/${encodeURIComponent(String(seq))}`,
    amber: true
  }
}

/** Parses an amberAlert response into the children in active alerts. */
export const parseAmber = (data: unknown): MissingChild[] => {
  if (!data || typeof data !== 'object') return []
  const persons = (data as { persons?: unknown }).persons
  if (!Array.isArray(persons)) return []
  const seen = new Set<string>()
  const out: MissingChild[] = []
  for (const raw of persons) {
    const child = toAmberChild(raw)
    if (!child || seen.has(child.posterUrl)) continue
    seen.add(child.posterUrl)
    out.push(child)
  }
  return out
}

/**
 * The photo and age from an amberDetail response's `childBean`, which the
 * alert list lacks. Anything missing or malformed comes back null.
 */
export const parseAmberDetail = (data: unknown): Pick<MissingChild, 'photoUrl' | 'age'> => {
  const bean = data && typeof data === 'object' ? (data as { childBean?: unknown }).childBean : null
  if (!bean || typeof bean !== 'object') return { photoUrl: null, age: null }
  const b = bean as Record<string, unknown>
  return {
    photoUrl: ncmecPhoto(b.imageUrl),
    age: typeof b.age === 'number' && b.age > 0 ? b.age : null
  }
}

/** Parses a search response into display-ready cases, dropping malformed ones. */
export const parseSearch = (data: unknown): MissingChild[] => {
  if (!data || typeof data !== 'object') return []
  const persons = (data as { persons?: unknown }).persons
  if (!Array.isArray(persons)) return []
  const seen = new Set<string>()
  const out: MissingChild[] = []
  for (const raw of persons) {
    const child = toChild(raw)
    if (!child || seen.has(child.posterUrl)) continue
    seen.add(child.posterUrl)
    out.push(child)
  }
  return out
}

/** The search response's `totalPages`, or 0 when absent or malformed. */
export const parseTotalPages = (data: unknown): number => {
  const n = data && typeof data === 'object' ? (data as { totalPages?: unknown }).totalPages : 0
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0
}

/** A uniform integer in [0, length). Clamped, so rng() === 1 stays in range. */
export const pickRandomIndex = (length: number, rng: () => number = Math.random): number => {
  if (!Number.isFinite(length) || length < 1) return 0
  return Math.min(length - 1, Math.floor(rng() * length))
}

/** A uniform page number in [1, totalPages]. */
export const pickRandomPage = (totalPages: number, rng: () => number = Math.random): number =>
  pickRandomIndex(totalPages, rng) + 1

/**
 * Picks one case at random, preferring cases that have a photo: a face is what
 * a passerby can recognise, so a photo-less case is only shown when nothing
 * else on the page has one.
 */
export const pickChild = (
  cases: MissingChild[],
  rng: () => number = Math.random
): MissingChild | null => {
  if (cases.length === 0) return null
  const withPhoto = cases.filter((c) => c.photoUrl)
  const pool = withPhoto.length > 0 ? withPhoto : cases
  return pool[pickRandomIndex(pool.length, rng)]
}

/** "Los Angeles, CA" — whichever parts are known. */
export const formatPlace = (child: Pick<MissingChild, 'city' | 'state'>): string =>
  [child.city, child.state].filter(Boolean).join(', ')

/** The poster URL with the UTM tags appended, for the QR code. */
export const withUtm = (url: string): string => {
  const out = new URL(url)
  for (const [key, value] of Object.entries(UTM)) out.searchParams.set(key, value)
  return out.toString()
}

/** The poster URL without the scheme, for printing on screen. */
export const displayUrl = (url: string): string => url.replace(/^https?:\/\/(www\.)?/, '')
