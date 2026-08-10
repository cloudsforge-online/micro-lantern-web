/**
 * THE ESTATE FOOTER, ON THE PAGE A VISITOR ACTUALLY REACHES.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE NETWORK BELOW IS STUBBED, AND NOTHING IN THIS FILE IS EVIDENCE THAT ANYTHING IS REACHABLE.
 *
 * `test/journeys/browser.ts` answers every cross-origin request from a fixture table; its own
 * header carries the full account and `test/harness-honesty.test.ts` keeps that header true. What
 * these two scenarios prove is what this BUNDLE renders — which is exactly the question the defect
 * they exist for turned on.
 *
 * ── Why this file exists at all ───────────────────────────────────────────────────────────────
 *
 * `micro-ui`'s `pnpm footer-audit` owns this property estate-wide: it drives every surface of a
 * running estate in a real browser and asks whether there is a `contentinfo` landmark holding the
 * links the registry says it should. It found this surface rendering NO footer landmark at all,
 * while all sixteen other surfaces were already deriving links TO here from the same registry row
 * (`ui/packages/ui/src/surfaces.ts`, `servesUi: true`). A reader who followed one of those
 * links arrived at a page with no footer and no way back.
 *
 * That audit CANNOT RUN IN CI. It needs the whole estate up behind the gateway, and it verifies the
 * gateway's certificate against a CA that only exists on a machine which has brought `deploy` up.
 * So it runs when somebody remembers, and this repository's pipeline was green throughout.
 *
 * These scenarios are the half of it that CAN run on every push: this bundle, built, in real
 * Chromium, with no estate. They are not a replacement for the audit — they cannot see the estate's
 * other fifteen surfaces or prove a single link answers — and they are the tripwire that would have
 * gone red the day the footer was left out.
 *
 * THE EXPECTATIONS ARE DERIVED FROM `SURFACES`, NEVER LISTED HERE. A hand-written list of sixteen
 * names would go on passing after a seventeenth surface was added, which is precisely the drift the
 * shared footer exists to prevent.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { SURFACES } from '@cloudsforge/ui'
import {
  assertMounted,
  closeBrowser,
  renderOnlyWithStubbedNetwork,
  type SentRequest,
  type Session,
  type Stubs,
} from './journeys/browser.ts'
import { startSurface, stopSurface } from './journeys/surface.ts'

/** A session in storage, so the gate lets a page mount and the client attaches a bearer. */
const SIGNED_IN = { 'cf.accessToken': 'test-access', 'cf.refreshToken': 'test-refresh' }

const READS = [
  ['GET /auth/me', { json: { user: { handle: 'estateadmin', roles: ['admin'] } } }],
  // The live answer from this estate: Lantern holds no open issues. An empty list is enough — this
  // file is about the chrome, and a fixture full of rows would only make the failure noisier.
  ['GET /v1/issues', { json: { issues: [] } }],
] as const

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE PORTAL, STANDING IN — AND THE SEAM THESE SCENARIOS EXIST FOR
 *
 * Every scenario below that wanted a signed-in operator used to do it by seeding `SIGNED_IN` into
 * `localStorage`, and that is the shape of a test that cannot fail: **nothing in this estate ever
 * puts a token into THIS origin's storage except `bootstrapSession` redeeming a `#cf_code`**, and
 * until the commit these scenarios arrived with, nothing ever sent this surface a `#cf_code`.
 *
 * The estate's tokens are per-origin `localStorage` and there are NO cookies anywhere in it —
 * measured, in a real browser against the running estate: after signing in at
 * `hub.<apex>/account/login` the context held `['cf.accessToken', 'cf.refreshToken']` on Hub's
 * origin and `[]` on Lantern's, with `context.cookies()` empty for every host. So an operator who
 * is signed into the estate is, as far as this origin can see, a stranger — which is exactly what
 * `micro-ui`'s `pnpm footer-audit` reported the moment it started signing in for `adminOnly`
 * surfaces rather than only for ones that redirect: `hides "Admin" from a signed-in operator`,
 * four times over, on a footer rendering the identical 18 links signed-out and signed-in.
 *
 * The one bridge across an origin is the portal hand-off (`@cloudsforge/ui`: `signInRedirect`,
 * then `consumeAuthCallback` redeeming at `POST /auth/handoff/redeem`), and `admin-web` has always
 * crossed it — `ProtectedRoute` (admin-web/src/lib/auth.tsx) sends an anonymous visitor to
 * the portal, which hands a held session straight back (hub-web/src/pages/account.tsx)
 * without a second credential prompt. This surface never asked.
 *
 * So the stand-in below is the PORTAL, not this app: it answers `GET /account/login` and either
 * holds a session — bouncing back with a code, as Hub does — or does not. What is under test is
 * whether this bundle ASKS, what return address it asks with, and that it asks once.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** The code Hub would put in the fragment. Redeemed once, for tokens, by `consumeAuthCallback`. */
const HANDOFF_CODE = 'test-handoff-code-0001'

/** Chromium asks the portal's origin for one, and an unanswered request is a failed request. */
const PORTAL_FAVICON: Stubs[number] = ['GET /favicon.ico', { status: 204, body: '' }]

/** Where the browser was sent to sign in, and what return address it carried. */
function portalCalls(session: Session): SentRequest[] {
  return session.apiCalls().filter((r) => new URL(r.url).pathname === '/account/login')
}

/**
 * The portal, with or without a session of its own.
 *
 * With one it does what Hub does: mints a code and returns the browser to the address it was given,
 * with the code in the FRAGMENT. Without one it renders its sign-in form and the browser stays
 * there — which is the whole reason this surface may only ask once.
 */
function portal(holdsASession: boolean): Stubs[number] {
  return [
    'GET /account/login',
    (req: SentRequest) => {
      const back = new URL(req.url).searchParams.get('return')
      if (back === null) return { status: 400, body: 'the console did not say where to return to' }
      if (!holdsASession) {
        return { contentType: 'text/html', body: '<!doctype html><title>Sign in</title><h1>Sign in</h1>' }
      }
      const url = new URL(back)
      const params = new URLSearchParams(url.hash.replace(/^#/, ''))
      params.set('cf_code', HANDOFF_CODE)
      url.hash = params.toString()
      return {
        contentType: 'text/html',
        body: `<!doctype html><title>Signing you in</title><meta http-equiv="refresh" content="0;url=${url.toString()}">`,
      }
    },
  ]
}

/** Identity redeeming the code, once, for this origin's own tokens. */
const REDEEM: Stubs[number] = [
  'POST /auth/handoff/redeem',
  { json: { accessToken: 'handed-access', refreshToken: 'handed-refresh', expiresIn: 900 } },
]

/** Every surface the footer must offer a signed-out reader. The audit's own rule, restated. */
const PUBLIC_SURFACE_NAMES = SURFACES.filter(
  (s) => s.servesUi && s.key !== 'signin' && s.adminOnly !== true,
).map((s) => s.name)

/** The four it must NOT offer one. Hiding is not the boundary; advertising is the defect. */
const OPERATOR_SURFACE_NAMES = SURFACES.filter((s) => s.servesUi && s.adminOnly === true).map(
  (s) => s.name,
)

const READ_FOOTER = function () {
  const foots = Array.from(document.querySelectorAll('footer, [role="contentinfo"]'))
  const foot = foots[0] as HTMLElement | undefined
  const navs = foot ? Array.from(foot.querySelectorAll('nav')) : []
  const anchors = foot ? Array.from(foot.querySelectorAll('a')) : []
  return {
    landmarks: foots.length,
    // `.cf-foot` is CloudsForgeFooter's own class and @cloudsforge/ui is the only thing that emits
    // it. This is what separates "has a footer" from "has THE footer" — a local imitation would
    // satisfy every other assertion here, and a local copy is how sixteen surfaces stop agreeing.
    shared: Boolean(document.querySelector('footer.cf-foot')),
    role: foot?.getAttribute('role') ?? '',
    labelled: navs.filter((n) => n.getAttribute('aria-labelledby') ?? n.getAttribute('aria-label'))
      .length,
    unlabelled: navs.filter(
      (n) => !(n.getAttribute('aria-labelledby') ?? n.getAttribute('aria-label')),
    ).length,
    headings: Array.from(foot?.querySelectorAll('h2') ?? []).map((h) =>
      (h.textContent ?? '').trim(),
    ),
    links: anchors.map((a) => ({
      text: (a.textContent ?? '').trim(),
      href: a.getAttribute('href') ?? '',
      current: a.getAttribute('aria-current') === 'page',
    })),
    background: foot ? getComputedStyle(foot).backgroundColor : '',
    text: foot?.innerText ?? '',
    // The PAGE's substrate, not the footer's. These are two different questions and only one of
    // them was ever asked: the footer brings its own background from @cloudsforge/ui, so it was
    // correct on a page whose body had no background at all. See the block this checks, in
    // src/styles.css.
    pageBackground: getComputedStyle(document.body).backgroundColor,
    bgToken: getComputedStyle(document.documentElement).getPropertyValue('--cf-bg').trim(),
  }
}

/** `#0e0c0a` → `rgb(14, 12, 10)`, so the token and the computed value can be compared exactly. */
function asRgb(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  assert.ok(m, `--cf-bg did not resolve to a six-digit hex: ${JSON.stringify(hex)}`)
  return `rgb(${parseInt(m[1] as string, 16)}, ${parseInt(m[2] as string, 16)}, ${parseInt(m[3] as string, 16)})`
}

after(async () => {
  await closeBrowser()
  await stopSurface()
})

describe('the estate sign-on this console is part of', () => {
  it('asks the portal whether the reader already holds a session — once, and no more', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/',
      stubs: [portal(false), PORTAL_FAVICON],
    })
    try {
      // ASKED. The bundle has no way of its own to know: the estate's tokens are per-origin
      // storage and it holds none, so the only reader it can distinguish from a stranger is one
      // the portal has already told it about.
      const asked = portalCalls(session)
      assert.equal(asked.length, 1, `the portal was asked ${asked.length} times; expected once`)

      // WITH THE ADDRESS THIS PAGE IS AT. A return address to anywhere else is how an operator
      // signs in and lands on somebody else's surface.
      const back = new URL(asked[0]?.url ?? '').searchParams.get('return')
      assert.equal(back, `${surface.origin}/`)

      // AND ONCE. The portal holds no session in this scenario, so it kept the browser; a reader
      // who comes back must get this console rather than be sent round again.
      await session.page.goto(`${surface.origin}/`, { waitUntil: 'domcontentloaded' })
      await assertMounted(session, { showing: ['You need an operator session for this'] })
      assert.equal(
        portalCalls(session).length,
        1,
        'asked the portal a second time — a reader who declined to sign in is now in a loop',
      )
    } finally {
      await session.close()
    }
  })

  it('takes the hand-off when the portal holds one, and asks for no second credential', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/',
      stubs: [portal(true), REDEEM, PORTAL_FAVICON, ...READS],
    })
    try {
      // The operator is on the console, signed in, having typed nothing. This is the journey the
      // footer defect was the visible half of.
      await assertMounted(session, { showing: ['Grouped faults', 'estateadmin'] })
      assert.equal(session.page.url(), `${surface.origin}/`)

      // The code was spent at identity's redemption route and is NOT in the address bar. Both
      // halves matter: a code left in the fragment is a credential in the history.
      const redeemed = session
        .apiCalls()
        .filter((r) => new URL(r.url).pathname === '/auth/handoff/redeem')
      assert.equal(redeemed.length, 1, `redeemed ${redeemed.length} times; expected once`)
      assert.equal(JSON.parse(redeemed[0]?.body ?? '{}').code, HANDOFF_CODE)
      assert.doesNotMatch(session.page.url(), /cf_code/)

      // And the tokens are this origin's own, from the redemption — not the portal's.
      const stored = await session.page.evaluate(() => ({
        access: localStorage.getItem('cf.accessToken'),
        refresh: localStorage.getItem('cf.refreshToken'),
      }))
      assert.deepEqual(stored, { access: 'handed-access', refresh: 'handed-refresh' })
    } finally {
      await session.close()
    }
  })
})

describe('the second row of the header', () => {
  it('renders the SHARED section strip, not a private copy of it', async () => {
    /*
     * The assertion that would have caught the defect the sub-nav census was run for, and it
     * reads the DOM rather than the source, because the source is the half that already passed.
     *
     * Measured 2026-08-10: ten frontends declared this strip in their own stylesheet, and nine of
     * the ten had a `display: flex` row with neither `white-space: nowrap` nor `overflow-x: auto`
     * — so six labels on a phone squeezed, broke mid-word, and the ones past the edge could not be
     * reached at all. This copy scrolled, but it also set `max-width: 84rem` against the bar's
     * 1200px, which put the row 72px proud of the bar on each side on every wide screen.
     *
     * `test/styles.test.ts` asserts that `.cf-subnav*` exists in ui.css and that `.ln-subnav*` is
     * gone from src/styles.css. Both of those pass perfectly well against a shell that renders a
     * `<nav>` with NO CLASS ON IT AT ALL — which is exactly what a half-finished adoption looks
     * like, and exactly the state in which the strip on screen is unstyled rather than shared. So
     * what is asserted here is the strip a reader actually meets.
     */
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/',
      stubs: [portal(true), REDEEM, PORTAL_FAVICON, ...READS],
    })
    try {
      await assertMounted(session, { showing: ['Grouped faults'] })

      const strip = await session.page.evaluate(() => {
        const shared = document.querySelector('nav.cf-subnav')
        const links = [...(shared?.querySelectorAll('a') ?? [])]
        return {
          exists: Boolean(shared),
          label: shared?.getAttribute('aria-label') ?? null,
          hasInner: Boolean(shared?.querySelector('.cf-subnav__inner')),
          linkCount: links.length,
          // Every anchor in the strip, not merely the ones carrying the class: a link left on the
          // old name shows up here as a `false`.
          allShared: links.every((a) => a.classList.contains('cf-subnav__link')),
          current: links.filter((a) => a.classList.contains('cf-subnav__link--current')).length,
          stale: links.filter((a) => a.classList.contains('is-active')).length,
          privateCopies: document.querySelectorAll('[class*="ln-subnav"]').length,
        }
      })

      assert.equal(strip.exists, true, 'no <nav class="cf-subnav"> in the document')
      assert.equal(strip.hasInner, true, 'the shared strip has no .cf-subnav__inner scroll box')
      // This surface's own wording, deliberately not homogenised with the strip: a document with
      // two `<nav>`s — the company bar is the other — needs two names a reader can tell apart.
      assert.equal(strip.label, 'Sections')
      assert.ok(strip.linkCount >= 2, `the strip rendered ${strip.linkCount} links`)
      assert.equal(strip.allShared, true, 'a section link is not on the shared class')
      assert.equal(strip.current, 1, `${strip.current} sections are marked current`)
      assert.equal(strip.stale, 0, 'a section link still carries the local `is-active` modifier')
      assert.equal(strip.privateCopies, 0, 'the local .ln-subnav markup is back in the document')
    } finally {
      await session.close()
    }
  })

  it('is the same measure as the bar above it, which it was not', async () => {
    /*
     * Defect 2, measured on the page instead of read out of a stylesheet.
     *
     * `.ln-subnav__inner` and `.ln-main` both said `max-width: 84rem` — 1344px — while
     * `.cf-bar__inner` takes 1200px from `--cf-max-w`. On a screen wide enough to show it, the
     * second row of the header and every heading on the page began 72px to the left of the
     * wordmark above them. A stylesheet grep cannot see this: three rules can name three different
     * tokens and still agree, or name one token and disagree because a container constrains one of
     * them. Left edges are compared as the browser computed them.
     *
     * ── THE FOOTER IS NOT IN THIS ASSERTION, AND THAT IS A FINDING RATHER THAN AN OMISSION ─────
     *
     * Measured here on 2026-08-10 at a 1600px viewport: `.cf-bar__inner`, `.cf-subnav__inner` and
     * `main` all land at left = 200, and `.cf-foot__inner` lands at 184. The footer's border box
     * is 1232px wide against the bar's 1200.
     *
     * The cause is in `@cloudsforge/ui`, not here. `.cf-foot__inner` (ui.css) sets
     * `max-width: var(--cf-max-w)` and `padding: … var(--cf-space-xl) …` and, unlike
     * `.cf-bar__inner` and `.cf-subnav__inner`, does NOT set `box-sizing: border-box` — and ui.css
     * carries no global reset for it. So its 1200px is its CONTENT box and the 16px gutter is
     * added outside, which is the identical 16px-too-wide defect the sub-nav census was run for,
     * one row further down and in the design system rather than in an app.
     *
     * Reported, not fixed: this branch does not touch the `ui` repository. The assertion is left
     * naming only the three rows this repository is responsible for, so it stays honest, and the
     * footer can be added to it the day ui.css grows the missing declaration.
     */
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/',
      stubs: [portal(true), REDEEM, PORTAL_FAVICON, ...READS],
      viewport: { width: 1600, height: 900 },
    })
    try {
      await assertMounted(session, { showing: ['Grouped faults'] })
      /*
       * Written as one expression with no local helper on purpose. The loader that runs this suite
       * rewrites a NAMED function — including `const left = (sel) => …` — into a call to esbuild's
       * `__name` helper, which exists in this process and not in the page, so the evaluate throws
       * `ReferenceError: __name is not defined` in Chromium. Every other `page.evaluate` in this
       * repository is a plain expression for the same reason.
       */
      const SELECTORS = ['.cf-bar__inner', '.cf-subnav__inner', 'main'] as const
      const lefts = await session.page.evaluate(
        (selectors: readonly string[]) =>
          selectors.map((sel) => {
            const el = document.querySelector(sel)
            return el === null ? null : Math.round(el.getBoundingClientRect().left)
          }),
        SELECTORS,
      )
      const [bar, subnav, main] = lefts
      assert.notEqual(bar, null, 'no .cf-bar__inner on the page to measure against')
      assert.equal(subnav, bar, 'the sections do not line up with the bar')
      assert.equal(main, bar, 'the page content does not line up with the bar')
    } finally {
      await session.close()
    }
  })
})

describe('the estate footer', () => {
  it('is under the sign-in wall BEFORE anybody signs in, and hides the operator surfaces', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/',
      stubs: [portal(false), PORTAL_FAVICON],
    })
    try {
      // The wall is what a reader gets once the portal has been asked and had nothing to give.
      // Reached by coming back rather than by seeding a flag, so this scenario stands on the same
      // one-shot behaviour the scenario above pins rather than on a private arrangement with it.
      await session.page.goto(`${surface.origin}/`, { waitUntil: 'domcontentloaded' })
      // The state this defect was reported in. A signed-out operator gets `SignInWall` inside
      // `<main>`; the shell is OUTSIDE the gate, so the footer must be under it.
      await assertMounted(session, { showing: ['You need an operator session for this'] })
      const f = await session.page.evaluate(READ_FOOTER)

      assert.equal(f.shared, true, 'the page does not render @cloudsforge/ui’s CloudsForgeFooter')
      assert.equal(f.landmarks, 1, `${f.landmarks} footer landmarks; there must be exactly one`)
      assert.equal(f.role, 'contentinfo')

      // It is navigation, and navigation is labelled.
      assert.equal(f.unlabelled, 0, 'an unlabelled <nav> inside the footer')
      assert.equal(f.labelled, 4)
      assert.equal(f.headings.length, 4)

      // The links are the registry's, and nobody else's.
      const texts = f.links.map((l) => l.text)
      for (const name of PUBLIC_SURFACE_NAMES) {
        assert.ok(texts.includes(name), `the footer does not offer "${name}"`)
      }
      for (const name of OPERATOR_SURFACE_NAMES) {
        assert.ok(!texts.includes(name), `advertises the operator surface "${name}" to a stranger`)
      }
      for (const link of f.links) {
        assert.notEqual(link.text, '', `a link with no text at ${link.href}`)
        assert.notEqual(link.href, '', `"${link.text}" is an anchor with no href`)
      }

      // Nothing is marked current: this surface is `adminOnly` (surfaces.ts), so its own link
      // is not on the page for a stranger to be standing on. The identity line still says where
      // they are, and it is the registry's words rather than a tagline written here.
      assert.deepEqual(
        f.links.filter((l) => l.current),
        [],
      )
      assert.match(f.text, /Lantern — Logs, errors and browser samples, for operators/)

      // The stylesheet reached the page. A footer whose markup is perfect and whose CSS never
      // arrived is not a footer anybody can read — three surfaces in this estate shipped that way.
      assert.notEqual(f.background, 'rgba(0, 0, 0, 0)', 'the footer’s CSS never arrived')
      assert.notEqual(f.background, '')

      // AND THE PAGE UNDER IT. This surface shipped with no `body` background rule at all, so the
      // token resolved, the footer was dark, and the page between the sub-nav and the footer was
      // white. Asserted against the TOKEN rather than against a colour written here, so re-theming
      // the estate does not make this fail and hard-coding a value cannot make it pass.
      assert.equal(
        f.pageBackground,
        asRgb(f.bgToken),
        'the page body does not consume --cf-bg; the surface renders on a white substrate',
      )
    } finally {
      await session.close()
    }
  })

  /**
   * The operator's footer, reached the way an operator reaches it: through the portal.
   *
   * This scenario used to seed `SIGNED_IN` into `localStorage`, and that made it a check that
   * could not fail — it arranged the one thing the bundle could not do for itself and then
   * asserted the consequence. It is now driven from a signed-out browser through the hand-off,
   * which is the seam the estate audit exercises. The seeded form is kept BELOW, for the
   * different question of what happens when a session is already held.
   */
  it('marks Lantern as the current surface for an operator, and offers the other three', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/',
      stubs: [portal(true), REDEEM, PORTAL_FAVICON, ...READS],
    })
    try {
      await assertMounted(session, { showing: ['Grouped faults'] })
      const f = await session.page.evaluate(READ_FOOTER)
      assert.equal(f.shared, true)

      // The inverse of the assertion above, so "hidden from everybody" cannot pass as "hidden from
      // strangers". A rule that only ever removes things is satisfied by removing everything.
      const texts = f.links.map((l) => l.text)
      for (const name of [...PUBLIC_SURFACE_NAMES, ...OPERATOR_SURFACE_NAMES]) {
        assert.ok(texts.includes(name), `hides "${name}" from a signed-in operator`)
      }

      const marked = f.links.filter((l) => l.current)
      assert.equal(marked.length, 1, `${marked.length} links marked aria-current; expected one`)
      assert.equal(marked[0]?.text, 'Lantern')
    } finally {
      await session.close()
    }
  })

  it('does not send an operator who already holds a session to the portal at all', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/',
      storage: SIGNED_IN,
      // The portal is in the table and must go UNUSED. Left out, an unwanted trip to it would be
      // an aborted request rather than a legible failure.
      stubs: [portal(true), REDEEM, PORTAL_FAVICON, ...READS],
    })
    try {
      await assertMounted(session, { showing: ['Grouped faults'] })
      assert.deepEqual(
        portalCalls(session).map((r) => r.url),
        [],
        'a reader holding a session was sent to sign in again',
      )
      const texts = (await session.page.evaluate(READ_FOOTER)).links.map((l) => l.text)
      for (const name of OPERATOR_SURFACE_NAMES) {
        assert.ok(texts.includes(name), `hides "${name}" from a signed-in operator`)
      }
    } finally {
      await session.close()
    }
  })
})
