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
 * (`ui/packages/ui/src/surfaces.ts:418`, `servesUi: true`). A reader who followed one of those
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
import { assertMounted, closeBrowser, renderOnlyWithStubbedNetwork } from './journeys/browser.ts'
import { startSurface, stopSurface } from './journeys/surface.ts'

/** A session in storage, so the gate lets a page mount and the client attaches a bearer. */
const SIGNED_IN = { 'cf.accessToken': 'test-access', 'cf.refreshToken': 'test-refresh' }

const READS = [
  ['GET /auth/me', { json: { user: { handle: 'estateadmin', roles: ['admin'] } } }],
  // The live answer from this estate: Lantern holds no open issues. An empty list is enough — this
  // file is about the chrome, and a fixture full of rows would only make the failure noisier.
  ['GET /v1/issues', { json: { issues: [] } }],
] as const

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

describe('the estate footer', () => {
  it('is under the sign-in wall BEFORE anybody signs in, and hides the operator surfaces', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, { path: '/' })
    try {
      // The state this defect was reported in. A signed-out operator gets `SignInWall` inside
      // `<main>`; the shell is OUTSIDE the gate, so the footer must be under it.
      await assertMounted(session, { showing: ['Lantern is an operator surface'] })
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

      // Nothing is marked current: this surface is `adminOnly` (surfaces.ts:420), so its own link
      // is not on the page for a stranger to be standing on. The identity line still says where
      // they are, and it is the registry's words rather than a tagline written here.
      assert.deepEqual(
        f.links.filter((l) => l.current),
        [],
      )
      assert.match(f.text, /Lantern — Logs & errors/)

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

  it('marks Lantern as the current surface for an operator, and offers the other three', async () => {
    const surface = await startSurface()
    const session = await renderOnlyWithStubbedNetwork(surface.origin, {
      path: '/',
      storage: SIGNED_IN,
      stubs: READS,
    })
    try {
      await assertMounted(session, { showing: ['Open issues'] })
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
})
