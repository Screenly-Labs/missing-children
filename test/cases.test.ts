import { describe, expect, test } from 'bun:test'
import {
  daysSince,
  displayUrl,
  formatDate,
  formatDuration,
  formatPlace,
  normalizeState,
  parseMissingDate,
  parseSearch,
  parseTotalPages,
  pickChild,
  pickRandomIndex,
  pickRandomPage,
  readSettings,
  searchUrl,
  tidyCase,
  toChild,
  withUtm
} from '../assets/static/js/cases'

// Shaped like one entry of NCMEC's publicSearch `persons` array. Fictional.
const person = (overrides: Record<string, unknown> = {}) => ({
  caseNumber: '1234567',
  orgPrefix: 'NCMC',
  isChild: true,
  seqNumber: 1,
  firstName: 'JANE',
  lastName: 'EXAMPLE',
  middleName: '',
  missingCity: 'SPRINGFIELD',
  missingState: 'il',
  missingCountry: 'US',
  missingDate: 'Oct 13, 2026 12:00:00 AM',
  age: 12,
  hasThumbnail: true,
  thumbnailUrl: '/photographs/NCMC1234567c1t.jpg',
  imageUrl: '/photographs/NCMC1234567c1.jpg',
  ...overrides
})

describe('settings', () => {
  test('state is validated and upper-cased', () => {
    expect(normalizeState('ca')).toBe('CA')
    expect(normalizeState(' TX ')).toBe('TX')
    expect(normalizeState('PR')).toBe('PR')
    expect(normalizeState('ZZ')).toBeNull()
    expect(normalizeState('')).toBeNull()
    expect(normalizeState(null)).toBeNull()
  })

  test('reads the state from the query string', () => {
    expect(readSettings('?state=ny')).toEqual({ state: 'NY' })
    expect(readSettings('')).toEqual({ state: null })
  })
})

describe('searchUrl', () => {
  test('nationwide omits the state filter', () => {
    const url = new URL(searchUrl(null))
    expect(url.origin).toBe('https://api.missingkids.org')
    expect(url.searchParams.get('action')).toBe('publicSearch')
    expect(url.searchParams.get('search')).toBe('new')
    expect(url.searchParams.get('subjToSearch')).toBe('child')
    expect(url.searchParams.has('missState')).toBe(false)
  })

  test('a state scopes the search', () => {
    expect(new URL(searchUrl('CA')).searchParams.get('missState')).toBe('CA')
  })

  test('page 1 is the default; later pages add goToPage', () => {
    expect(new URL(searchUrl(null)).searchParams.has('goToPage')).toBe(false)
    expect(new URL(searchUrl(null, 1)).searchParams.has('goToPage')).toBe(false)
    expect(new URL(searchUrl('TX', 7)).searchParams.get('goToPage')).toBe('7')
  })
})

describe('random selection', () => {
  test('pickRandomIndex stays in range for every rng value', () => {
    for (const r of [0, 0.001, 0.5, 0.999999, 1]) {
      const i = pickRandomIndex(20, () => r)
      expect(Number.isInteger(i)).toBe(true)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(20)
    }
    expect(pickRandomIndex(10, () => 0)).toBe(0)
    expect(pickRandomIndex(10, () => 1)).toBe(9)
  })

  test('pickRandomIndex guards empty and invalid lengths', () => {
    expect(pickRandomIndex(0)).toBe(0)
    expect(pickRandomIndex(-3)).toBe(0)
    expect(pickRandomIndex(Number.NaN)).toBe(0)
  })

  test('pickRandomPage covers 1..totalPages', () => {
    expect(pickRandomPage(182, () => 0)).toBe(1)
    expect(pickRandomPage(182, () => 0.999999)).toBe(182)
    expect(pickRandomPage(182, () => 1)).toBe(182)
    expect(pickRandomPage(0, () => 0.7)).toBe(1)
  })

  test('parseTotalPages reads a positive integer or 0', () => {
    expect(parseTotalPages({ totalPages: 27 })).toBe(27)
    expect(parseTotalPages({ totalPages: 0 })).toBe(0)
    expect(parseTotalPages({ totalPages: '3' })).toBe(0)
    expect(parseTotalPages({})).toBe(0)
    expect(parseTotalPages(null)).toBe(0)
  })

  test('pickChild prefers cases with a photo', () => {
    const noPhoto = toChild(person({ caseNumber: '1', hasThumbnail: false }))
    const photo = toChild(person({ caseNumber: '2' }))
    if (!noPhoto || !photo) throw new Error('fixture')
    for (const r of [0, 0.5, 0.99]) {
      expect(pickChild([noPhoto, photo, noPhoto], () => r)?.caseNumber).toBe('2')
    }
  })

  test('pickChild falls back to photo-less cases, and null for none', () => {
    const noPhoto = toChild(person({ hasThumbnail: false }))
    if (!noPhoto) throw new Error('fixture')
    expect(pickChild([noPhoto])).toBe(noPhoto)
    expect(pickChild([])).toBeNull()
  })
})

describe('dates', () => {
  test('parses NCMEC date strings to calendar dates', () => {
    expect(parseMissingDate('Oct 13, 2026 12:00:00 AM')).toBe('2026-10-13')
    expect(parseMissingDate('Jan 5, 2019 12:00:00 AM')).toBe('2019-01-05')
    expect(parseMissingDate('Sep 30, 2001')).toBe('2001-09-30')
  })

  test('rejects anything else', () => {
    expect(parseMissingDate('2026-10-13')).toBeNull()
    expect(parseMissingDate('Foo 1, 2020')).toBeNull()
    expect(parseMissingDate('Oct 40, 2020')).toBeNull()
    expect(parseMissingDate(null)).toBeNull()
    expect(parseMissingDate(17)).toBeNull()
  })

  test('formats and measures', () => {
    expect(formatDate('2026-10-13')).toBe('October 13, 2026')
    expect(daysSince('2026-10-13', new Date(2026, 9, 20, 23, 59))).toBe(7)
    expect(daysSince('2026-10-21', new Date(2026, 9, 20))).toBe(0)
    // Across a DST change the count is still whole days.
    expect(daysSince('2026-03-01', new Date(2026, 3, 1))).toBe(31)
  })

  test('duration coarsens as it grows', () => {
    expect(formatDuration(0)).toBe('Missing since today')
    expect(formatDuration(1)).toBe('Missing 1 day')
    expect(formatDuration(45)).toBe('Missing 45 days')
    expect(formatDuration(90)).toBe('Missing 2 months')
    expect(formatDuration(800)).toBe('Missing 2 years')
  })
})

describe('tidyCase', () => {
  test('title-cases shouted or lower-case words', () => {
    expect(tidyCase('GENESIS MAYORQUIN')).toBe('Genesis Mayorquin')
    expect(tidyCase('los angeles')).toBe('Los Angeles')
    expect(tidyCase("O'NEIL SMITH-JONES")).toBe("O'Neil Smith-Jones")
    expect(tidyCase('JOSÉ ÁLVAREZ')).toBe('José Álvarez')
  })

  test('keeps deliberate mixed casing and squashes whitespace', () => {
    expect(tidyCase('  DeShawn   McKenzie ')).toBe('DeShawn McKenzie')
  })
})

describe('toChild', () => {
  test('normalizes a search result', () => {
    expect(toChild(person())).toEqual({
      caseNumber: '1234567',
      name: 'Jane Example',
      age: 12,
      missingDate: '2026-10-13',
      city: 'Springfield',
      state: 'IL',
      photoUrl: 'https://api.missingkids.org/photographs/NCMC1234567c1.jpg',
      posterUrl: 'https://www.missingkids.org/poster/NCMC/1234567/1'
    })
  })

  test('tolerates missing optional fields', () => {
    const child = toChild(
      person({ age: 0, missingDate: '', missingCity: '', hasThumbnail: false, seqNumber: 2 })
    )
    expect(child?.age).toBeNull()
    expect(child?.missingDate).toBeNull()
    expect(child?.photoUrl).toBeNull()
    expect(child?.posterUrl).toBe('https://www.missingkids.org/poster/NCMC/1234567/2')
  })

  test('never points the photo at another origin', () => {
    expect(toChild(person({ imageUrl: 'https://example.com/x.jpg' }))?.photoUrl).toBeNull()
  })

  test('rejects malformed and non-child records', () => {
    expect(toChild(null)).toBeNull()
    expect(toChild('x')).toBeNull()
    expect(toChild(person({ caseNumber: '' }))).toBeNull()
    expect(toChild(person({ firstName: '', lastName: '' }))).toBeNull()
    expect(toChild(person({ isChild: false }))).toBeNull()
  })

  test('rejects unidentified-persons (NCMU) records', () => {
    expect(
      toChild(person({ orgPrefix: 'NCMU', firstName: 'John', lastName: 'Doe 2000' }))
    ).toBeNull()
    expect(toChild(person({ orgPrefix: 'ncmu' }))).toBeNull()
    // State clearinghouse cases (e.g. USVA) are real missing-child records.
    expect(toChild(person({ orgPrefix: 'USVA' }))).not.toBeNull()
  })
})

describe('parseSearch', () => {
  test('keeps valid cases in order and drops duplicates', () => {
    const data = {
      status: 'success',
      persons: [
        person(),
        person({ caseNumber: '2' }),
        { junk: true },
        person() // duplicate poster
      ]
    }
    expect(parseSearch(data).map((c) => c.caseNumber)).toEqual(['1234567', '2'])
  })

  test('returns [] for anything that is not a search payload', () => {
    expect(parseSearch(null)).toEqual([])
    expect(parseSearch({})).toEqual([])
    expect(parseSearch({ persons: 'nope' })).toEqual([])
  })
})

describe('display helpers', () => {
  test('formatPlace joins whatever is known', () => {
    expect(formatPlace({ city: 'Springfield', state: 'IL' })).toBe('Springfield, IL')
    expect(formatPlace({ city: '', state: 'IL' })).toBe('IL')
    expect(formatPlace({ city: '', state: '' })).toBe('')
  })

  test('withUtm tags the poster link for the QR code', () => {
    const url = new URL(withUtm('https://www.missingkids.org/poster/NCMC/1234567/1'))
    expect(url.origin + url.pathname).toBe('https://www.missingkids.org/poster/NCMC/1234567/1')
    expect(url.searchParams.get('utm_source')).toBe('missing-children')
    expect(url.searchParams.get('utm_medium')).toBe('qr')
    expect(url.searchParams.get('utm_campaign')).toBe('missing-child-poster')
  })

  test('withUtm keeps existing params and never duplicates a tag', () => {
    const url = new URL(withUtm('https://www.missingkids.org/poster/NCMC/1/1?a=b&utm_medium=x'))
    expect(url.searchParams.get('a')).toBe('b')
    expect(url.searchParams.getAll('utm_medium')).toEqual(['qr'])
  })

  test('displayUrl drops the scheme and www', () => {
    expect(displayUrl('https://www.missingkids.org/poster/NCMC/1/1')).toBe(
      'missingkids.org/poster/NCMC/1/1'
    )
  })
})
