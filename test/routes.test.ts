/**
 * The routes, nginx and the router must all name the same set of addresses.
 *
 * This is the cost of the honest-404 rule and the only thing that keeps it payable. nginx
 * ENUMERATES the client routes so that an unknown address answers 404 rather than 200; the moment
 * that list and the router disagree, one of two silent failures ships:
 *
 *   a route in React and not in nginx   → 404 on a hard refresh, and on every pasted link
 *   a route in nginx and not in React   → 200 carrying the not-found screen, which is the exact
 *                                         defect the enumeration exists to prevent
 *
 * Neither is visible in a browser you happen to be clicking through, and neither breaks a build.
 * So it is checked here, by reading the two files.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { NAV, NGINX_ROUTES, ROUTES } from '../src/lib/routes.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const NGINX = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8')
const APP = readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8')

/** nginx.conf with its comments removed — the header quotes directives it forbids. */
const NGINX_CODE = NGINX.split('\n')
  .map((line) => line.replace(/#.*$/, ''))
  .join('\n')

describe('the route declaration', () => {
  it('declares the four reads this console makes', () => {
    assert.deepEqual(
      ROUTES.map((r) => r.path),
      ['/', '/events', '/browser', '/request'],
    )
  })

  it('gives every route a label, so the navigation is the whole surface', () => {
    // If a route is ever added without one, this fails rather than the page becoming unreachable
    // except by URL.
    assert.equal(NAV.length, ROUTES.length)
  })

  it('names the endpoint each route reads, in its purpose', () => {
    // A route whose purpose does not name a `/v1` path is a page that does not read the service,
    // which on this surface would be a page with nothing on it.
    for (const route of ROUTES) {
      assert.match(route.purpose, /\/v1\//, `${route.path} does not say which route it reads`)
    }
  })
})

describe('the router mounts exactly the declared routes', () => {
  for (const route of ROUTES) {
    if (route.path === '/') continue
    it(`src/app.tsx mounts ${route.path}`, () => {
      assert.ok(
        APP.includes(`path="${route.path.slice(1)}"`),
        `${route.path} is declared in routes.ts and not mounted in app.tsx`,
      )
    })
  }

  it('has an index route and a catch-all', () => {
    assert.match(APP, /<Route\s+index/)
    assert.match(APP, /path="\*"/)
  })
})

describe('nginx enumerates exactly the declared routes', () => {
  it('serves the index from its own exact location', () => {
    assert.match(NGINX_CODE, /location = \/ \{/)
  })

  it('lists every non-index route in the alternation, and nothing else', () => {
    const match = /location ~ \^\/\(([^)]+)\)\/\?\$/.exec(NGINX_CODE)
    assert.ok(match, 'the enumerated-routes location block is missing or has changed shape')
    const enumerated = (match[1] ?? '').split('|')
    assert.deepEqual(enumerated, [...NGINX_ROUTES])
  })

  it('uses `/?$` and never the `(/|$)` prefix form', () => {
    // `(/|$)` matches /events/anything/at/all, so the not-found screen ships with a 200 for every
    // address beneath every route the app owns. micro-site shipped exactly that.
    assert.doesNotMatch(NGINX_CODE, /\(\/\|\$\)/)
  })

  it('keeps the honest 404 and refuses the blanket SPA fallback', () => {
    assert.match(NGINX_CODE, /error_page 404 \/index\.html/)
    assert.doesNotMatch(NGINX_CODE, /try_files\s+\$uri\s+(\$uri\/\s+)?\/index\.html/)
  })

  it('restates all three security headers in every location that sets any header', () => {
    // nginx's add_header is all-or-nothing per level: a location declaring ANY header inherits
    // NONE from its parent. This is the rule that silently stripped nosniff from every hashed
    // script in every frontend cut from the template.
    const blocks = NGINX_CODE.split(/location\s/).slice(1)
    for (const block of blocks) {
      if (!block.includes('add_header')) continue
      const name = block.split('{')[0]?.trim() ?? '?'
      for (const header of ['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy']) {
        assert.ok(block.includes(header), `location ${name} sets headers but not ${header}`)
      }
    }
  })
})

describe('the CI deep link is a route this app really has', () => {
  it('names an enumerated route', () => {
    const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
    // Anchored to the start of a line, so it reads the WITH: key rather than the sentence in the
    // file header that quotes it.
    const match = /^\s+deep-link-path:\s*(\S+)\s*$/m.exec(ci)
    assert.ok(match, 'ci.yml declares no deep-link-path')
    const path = (match[1] ?? '').trim()
    // Requiring a 200 from a path the app does not own is the opposite of the honest-404 rule.
    assert.ok(
      ROUTES.some((r) => r.path === path),
      `ci.yml deep-links ${path}, which is not a declared route`,
    )
  })

  it('the repository name in ci.yml is this one', () => {
    const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
    assert.match(ci, /app: lantern-web/)
    // A copied workflow that still names its template checks out the wrong sibling and builds the
    // wrong context — silently green until it is not.
    assert.doesNotMatch(ci, /web-template:headers|path: web-template/)
    assert.ok(root.length > 0)
  })
})
