/**
 * Host resolution, and the registry claims this bundle depends on.
 *
 * Pure functions only, no DOM. The point of `resolveApiBase` being a function of its arguments is
 * that both branches — same-origin production and cross-origin dev — can be proved without a
 * browser and without a running service.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SURFACES, cloudsforgeHosts, type CloudsForgeHosts } from '@cloudsforge/ui'
import { ACCENT_SURFACE, PRODUCT, isLocal, isRegisteredPlacement, resolveApiBase } from '../src/lib/hosts.ts'

const lantern = SURFACES.find((s) => s.key === 'lantern')

describe('the registry entry this bundle is', () => {
  it('exists', () => {
    assert.ok(lantern, 'micro-ui no longer declares a `lantern` surface')
  })

  it('is the subdomain and the dev port the service really uses', () => {
    assert.equal(lantern?.subdomain, 'lantern')
    // `micro-lantern` binds 4010. This is the SERVICE's port, not this bundle's — vite.config.ts
    // takes 5190 — and `resolveApiBase` is what bridges them under `pnpm dev`.
    assert.equal(lantern?.devPort, 4010)
  })

  it('is adminOnly, which is why this repository has a gate', () => {
    // `explorer-web` has no gate because its reads are anonymous. This flag, plus `authorise` in
    // `lantern/src/server.ts`, is the whole reason this one does.
    assert.equal(lantern?.adminOnly, true)
  })

  it('says servesUi: true — the claim this repository made false', () => {
    // PINNED AS IT STANDS. It stood at `false` until 2026-08-04: the registry offered `lantern` in
    // the switcher while declaring it served no UI, so every operator who chose it got a 404 —
    // driven through the real gateway, which answered 404 before this bundle existed.
    //
    // The tripwire worked. micro-ui flipped the flag once the bundle was deployed and MEASURED
    // (200 text/html through the gateway with the estate CA), this test went red saying "update
    // this test and the note in src/lib/hosts.ts together", and that is what this change is.
    //
    // Still pinned, now in the other direction, for the same reason: if the registry ever stops
    // saying this bundle serves a page, the bundle's own tests should be the thing that notices.
    assert.equal(
      lantern?.servesUi,
      true,
      'servesUi has changed back. If it is now false, either this bundle stopped being deployed ' +
        'or the registry is wrong — update this test and the note in src/lib/hosts.ts together.',
    )
    assert.equal(lantern?.inSwitcher, true)
  })

  it('carries the accent that is also --cf-warn, which is why styles.css re-points it', () => {
    // The byte-identical pair: surfaces.ts and tokens.css. If micro-ui ever gives Lantern
    // a distinct accent, the ember override in src/styles.css becomes a decision to re-argue
    // rather than a rule to follow — so this pins the fact the override cites.
    assert.equal(lantern?.accent, '#f4a63c')
  })

  it('has no mark, so nothing in this bundle renders one', () => {
    assert.equal(lantern?.markId, null)
  })
})

describe('PRODUCT and the accent key', () => {
  it('names the real registry key in both places', () => {
    assert.equal(PRODUCT, 'lantern')
    // Deliberately the same key. tokens.css declares a `[data-cf-product='lantern']` block, so
    // naming a neighbour's key to get a different colour would be a lie about which surface this
    // is — the colour is moved in styles.css instead, by var() indirection.
    assert.equal(ACCENT_SURFACE, 'lantern')
  })
})

describe('resolveApiBase', () => {
  const hosts = cloudsforgeHosts() as CloudsForgeHosts

  it('is relative when the page and the service share an origin — production', () => {
    // nginx serves this bundle at lantern.<apex> and micro-lantern serves /v1 behind the same
    // hostname, so every request is same-origin and the base is the empty string.
    const production = { ...hosts, lantern: 'https://lantern.example.test' }
    assert.equal(resolveApiBase('https://lantern.example.test', production, 'lantern'), '')
  })

  it('is absolute when they do not — pnpm dev', () => {
    // The page is on vite's 5190; the service is on the registry's 4010.
    assert.equal(
      resolveApiBase('http://localhost:5190', hosts, 'lantern'),
      'http://localhost:4010',
    )
  })

  it('is absolute when there is no page origin at all', () => {
    // Nothing for a relative URL to resolve against, so the absolute form is the only correct
    // answer rather than a fallback.
    assert.equal(resolveApiBase('', hosts, 'lantern'), 'http://localhost:4010')
  })
})

describe('isLocal', () => {
  it('matches the four names cloudsforgeHosts() treats as development', () => {
    for (const name of ['', 'localhost', '127.0.0.1', 'my-mac.local']) {
      assert.equal(isLocal(name), true, name)
    }
    for (const name of ['lantern.cloudsforge.localtest.me', 'example.com']) {
      assert.equal(isLocal(name), false, name)
    }
  })
})

describe('isRegisteredPlacement', () => {
  const hosts = cloudsforgeHosts() as CloudsForgeHosts

  it('accepts local development unconditionally', () => {
    assert.equal(isRegisteredPlacement('http://localhost:5190', 'localhost', hosts), true)
  })

  it('rejects an address the registry does not derive', () => {
    // A preview deployment: every estate URL, including the account portal the sign-in button
    // uses, resolves one level too deep. The shell says so rather than sending an operator to a
    // hostname that does not exist.
    const derived = { ...hosts, lantern: 'https://lantern.example.test' }
    assert.equal(isRegisteredPlacement('https://pr-42.preview.dev', 'pr-42.preview.dev', derived), false)
  })
})
