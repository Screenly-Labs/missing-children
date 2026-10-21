import { describe, expect, test } from 'bun:test'
// The signage-app manifest is the source of truth for how the app store and
// players render/launch this app (docs/app-manifest.md in the app-store repo).
// These assertions mirror the manifest schema's invariants so a malformed edit
// fails CI here rather than being rejected by the store's index build.
import manifest from '../.well-known/signage-app.json'
import { US_STATES, readSettings } from '../assets/static/js/cases'

const BASE_URL = 'https://missing-children.srly.io/'

describe('signage-app manifest', () => {
  test('declares the required top-level fields', () => {
    expect(manifest.manifestVersion).toBe('1')
    expect(manifest.name.length).toBeGreaterThan(0)
    expect(manifest.description.length).toBeGreaterThan(0)
    expect(manifest.launch.baseUrl).toBe(BASE_URL)
  })

  test('id is a store-legal slug', () => {
    expect(manifest.id).toBe('missing-children')
    expect(manifest.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  })

  test('every declared URL is on the app origin or its repo', () => {
    for (const url of [manifest.homepage, manifest.source, manifest.support]) {
      expect(new URL(url).protocol).toBe('https:')
    }
    expect(manifest.homepage).toBe(BASE_URL)
    expect(manifest.source).toContain('github.com/Screenly-Labs/missing-children')
    expect(manifest.support).toContain('github.com/Screenly-Labs/missing-children')
  })

  test('tags are unique strings', () => {
    expect(new Set(manifest.tags).size).toBe(manifest.tags.length)
  })

  test('the launch template names every setting, in one query expression', () => {
    const names = Object.keys(manifest.settings.properties)
    expect(manifest.launch.template).toBe(`{?${names.join(',')}}`)
  })

  test('state options match the codes the app accepts', () => {
    const {
      enum: codes,
      'x-enumLabels': labels,
      default: fallback
    } = manifest.settings.properties.state
    expect(fallback).toBe('')
    expect(codes[0]).toBe('')
    expect(labels[0]).toBe('Nationwide')
    expect(codes.length).toBe(labels.length)
    expect(new Set(codes).size).toBe(codes.length)
    expect(codes.slice(1).sort()).toEqual(Object.keys(US_STATES).sort())
    codes.slice(1).forEach((code, i) => {
      expect(labels[i + 1]).toBe(US_STATES[code])
      expect(readSettings(`?state=${code}`).state).toBe(code)
    })
  })

  test('is single-shot: nothing to pace', () => {
    // One random child per load, no rotation loop and no refresh timer, so the
    // manifest carries no playback block (the player's reload brings the next).
    expect('playback' in manifest).toBe(false)
    expect(Object.keys(manifest.settings.properties)).toEqual(['state'])
  })
})
