/**
 * The app shell: the company bar, the section navigation, and the page.
 *
 * The bar is `CloudsForgeBar` from @cloudsforge/ui and is never reimplemented. It is passed
 * `PRODUCT` — 'lantern' — so the switcher resolves this surface's own entry and marks it current.
 *
 * ── This is the surface the switcher used to point at nothing ─────────────────────────────────
 *
 * `lantern` carried `inSwitcher: true` and `servesUi: false` at the same time until 2026-08-04.
 * Every operator who opened the switcher was offered "Logs & errors" and taken to a 404, because
 * `micro-lantern` serves JSON and no HTML. This bundle is what that entry reaches. The registry now
 * agrees — `servesUi: true` and `adminOnly: true` on Lantern's entry in
 * `ui/packages/ui/src/surfaces.ts` —
 * and that flag is why the footer below is not optional: every OTHER surface in the estate derives
 * its own footer from the same registry, so all sixteen now offer a link TO here, and until this
 * commit the page they arrived at had no footer and no way back.
 *
 * ── No mark, and no glyph drawn by this app ───────────────────────────────────────────────────
 *
 * `markId: null` (`surfaces.ts`). The registry's `✷` belongs to the switcher entry, which the
 * bar draws. Reproducing it in the page chrome would be this app inventing a mark for a surface
 * that was deliberately not given one.
 *
 * (Those three line numbers were 418, 420 and 392 until 2026-08-06, and all three were wrong. The
 * `lantern` row spans 370-409; 392 is a comment line INSIDE it, and 418 and 420 are past its
 * closing brace, in `beacon` — a comment about Beacon's accent, and `glyph: '◉'`. So all three
 * sent a reader to prose or to the wrong surface's wrong field, and the fields they claimed to
 * name are at 405, 407 and 379.
 *
 * Worth the paragraph because of how the correction went. The first draft of it asserted that 418
 * and 420 land on Beacon's OWN `servesUi`/`adminOnly` — plausible, tidy, and false; Beacon carries
 * those at 446 and 448. It was written from the same habit that produced the stale numbers in the
 * first place, caught only because it too was re-read at the line before being committed. That is
 * the whole discipline: a citation is checked or it is decoration, and there is no third state.)
 */
import { useEffect, useState } from 'react'
import {
  CloudsForgeBar,
  CloudsForgeFooter,
  CookieBanner,
  MainRegion,
  SkipLink,
  SubNav,
  miningOnHub,
} from '@cloudsforge/ui'
import { applyHead, normalisePath, surfaceMeta } from '@cloudsforge/ui/seo'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { PRODUCT, hosts } from '../lib/hosts.ts'
import { NAV, ROUTES } from '../lib/routes.ts'
import { useSession } from '../lib/auth.tsx'
import { setViewedNetwork, viewedNetwork, type ViewedNetwork } from '../lib/viewed.ts'

export function AppShell({ unregistered = false }: { unregistered?: boolean }) {
  // The viewed network: in-tab memory, defaulting to the hostname's own (micro-org#459).
  // `setViewedNetwork` runs first in the handler below so the remounted tree reads the new value
  // on its very first render.
  const [viewed, setViewed] = useState<ViewedNetwork>(viewedNetwork())
  const { account, signIn, signOut } = useSession()

  return (
    <>
      {/*
        Skip link first in the DOM, and it is now the SHARED one rather than this repository's own.

        These pages are long tables and a keyboard reader should not have to tab the bar's logo,
        the product switcher, the account menu and every filter to reach the rows — WCAG 2.2 SC
        2.4.1, and the repeated block it is about is precisely the shared bar. This surface had one
        of the estate's two hand-rolled skip links; sixteen others had none, which is why it moved
        into @cloudsforge/ui.

        The half that was wrong here and is now right: the local link pointed at `#main` on a
        `<main>` with no `tabIndex`, and a `<main>` is not focusable by default. Chrome and Safari
        therefore SCROLLED to it and left focus on the link, so the next Tab went back into the bar
        — the reader was returned to the block they had just asked to bypass. `MainRegion` below
        supplies `id={MAIN_ID}` and `tabIndex={-1}` together, so the two cannot disagree.
      */}
      <SkipLink>Skip to the page</SkipLink>
      {/*
        `mining` is the design system's own control, and the bar puts it immediately left of the
        account menu — the one position it can hold on every surface at once, which is the whole
        of the change. The owner's report was that starting a browser miner is "hidden deep in
        mining page"; a control that lands somewhere different on each surface is hidden again.

        WHAT IS PASSED IS THE `elsewhere` STATE, AND IT RENDERS AN ANCHOR. A session is a WebSocket
        and two Web Workers on `hub.<apex>`. That is a different ORIGIN from this one, so nothing
        in this bundle can start it, watch it or stop it, and a Start button here would be a
        control that cannot do what its label says. The link is also the shape that survives:
        a destination written as an `onClick` cannot be middle-clicked, cannot be opened in a new
        tab, cannot be copied out of, and is invisible to everything that reads links — which is
        the same reason the footer below derives real `href`s from the registry rather than
        handlers.

        `hosts().hub`, never a written-out URL, for the reason the note inside `MainRegion` gives:
        this bundle is served from localhost, from `lantern.<apex>` and sometimes from an address
        the registry does not know, and a literal would be right on exactly one of the three.
      */}
      {/*
        In-app network context (micro-org#459, the combined view). The reader's choice lives in
        `lib/viewed.ts` — module memory, never storage — and the `key` on the Outlet below is the
        refetch mechanism: switching remounts the page tree, and `apiBase()` reads `viewedHosts()`,
        so the same page re-reads itself from the other estate WITHOUT going anywhere. The band and
        the switcher both follow the selection, so testnet data under a mainnet address bar is
        never unmarked. The bar also stamps `?net=` onto its product links, which is what carries
        the choice across a product switch — every surface is its own origin, so nothing else can.
      */}
      <CloudsForgeBar
        current={PRODUCT}
        account={account}
        onSignIn={() => signIn()}
        onSignOut={signOut}
        mining={miningOnHub(hosts().hub)}
        networkSwitch={{
          selected: viewed,
          onSelect: (n) => {
            setViewedNetwork(n)
            setViewed(n)
          },
        }}
      />
      {/*
        The sub-nav is `SubNav` from @cloudsforge/ui and is no longer declared here.

        WHAT IT REPLACES. Measured 2026-08-10: ten frontends declared this strip in their own
        stylesheet under six class prefixes, from what was plainly one original that had been
        copied and then edited in place — the census is in `ui/packages/ui/src/subnav.test.ts`.
        This copy carried two of the three drifts it names, and one of them worse than the census
        predicted: `.ln-subnav__inner` set `max-width: 84rem`, which is 1344px against the bar's
        and the footer's 1200px, so the second row of the header sat 72px proud of the first on
        each side on every screen wide enough to show it. It also wrote its measure, its gutter,
        its gap and its padding as literals, which is why the sections read at 14.4px under a bar
        whose own controls read at 14px and a body step that had been raised to 16px.

        The links stay here, and that is the component's own argument: routing is react-router's
        `NavLink`, which owns the active state, and the design system does not depend on
        react-router. What moved is the STRIP — the sticky offset at `var(--cf-bar-h)`, the
        measure, the scroll behaviour and the type.

        The `label` keeps this surface's own wording. Two `<nav>` landmarks with the same
        accessible name are two landmarks a screen reader user cannot tell apart, so the wording
        is deliberately per-surface and was not homogenised with the strip.
      */}
      <SubNav label="Sections">
        {NAV.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `cf-subnav__link${isActive ? ' cf-subnav__link--current' : ''}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </SubNav>
      <DocumentMeta />
      <MainRegion className="ln-main">
        {/*
          `cloudsforgeHosts()` derives the apex by stripping a KNOWN subdomain, so an address the
          registry does not know makes every estate URL resolve one level too deep — including the
          account portal the sign-in button uses. On a public page that is a curiosity. Here it is
          the difference between an operator signing in and an operator being sent to a hostname
          that does not exist, mid-incident, with no explanation.
        */}
        {unregistered && (
          <p className="ln-note ln-note--warn" role="status">
            <span className="ln-note__icon" aria-hidden="true">
              ▲
            </span>
            <span>
              This page is being served from an address the CloudsForge surface registry does not
              know, so every host it resolves — Lantern itself, and the account portal the sign-in
              button uses — is derived from the wrong apex. Its home is the{' '}
              <code className="cf-num ln-code">lantern</code> surface.
            </span>
          </p>
        )}
        <Outlet key={viewed} />
      </MainRegion>

      {/*
        The company footer, from @cloudsforge/ui, and NEVER a local copy. Every link in it is
        derived from the surface registry, so a new product appears here without this file changing
        — which is the whole reason a shared component exists rather than a seventeenth hand-rolled
        footer. `footer-audit` in micro-ui checks for `.cf-foot` specifically, not for any
        `<footer>`, precisely so a local imitation cannot be mistaken for adoption.

        IT IS OUTSIDE THE GATE ON PURPOSE. `app.tsx` wraps each PAGE in `<Gate>`, not the shell, so
        a signed-out operator gets `SignInWall` inside `<main>` with this footer underneath it. That
        is the state that matters most here: this surface is `adminOnly`, so the reader who has not
        signed in is exactly the reader who most needs a way back out to the rest of the estate. A
        footer rendered only after sign-in would have left the reported defect in place for the only
        visitor who could still see it.

        `current` is PRODUCT — this surface has its own registry row and its own hostname, so the
        identity line names Lantern whether or not the reader may see the Lantern LINK. `account`
        decides only that: with no session the four operator surfaces (this one included) are not
        listed at all, which is the same rule the switcher follows.
      */}
      <CloudsForgeFooter current={PRODUCT} account={account} />

      {/*
        Last in the document, and therefore last in the tab order. That is deliberate: the banner
        is a dialog and is explicitly NOT modal, so a reader who came here to work an incident can
        work it and answer afterwards. A consent banner that traps focus is the coercion the
        regulation is about.

        ON THIS SURFACE IT RENDERS NOTHING, AND IT IS HERE ANYWAY. `CookieBanner` returns null when
        `analyticsId()` finds no `cf-analytics` meta tag in the shell, and this shell deliberately
        carries none — index.html states the reason at length: `/request?id=…` puts a live
        CloudsForge request id in the query string and GA4's `page_location` would hand it to
        Google. Mounting the component regardless keeps that decision in ONE place. The alternative
        — leaving it out — is indistinguishable from the seventeen surfaces that simply had not got
        round to consent yet, and is the shape that gets "fixed" by somebody adding the meta tag
        without ever reading why it was absent.
      */}
      <CookieBanner />
    </>
  )
}

/**
 * Keep `document.title`, the description, the Open Graph tags, the canonical link and the robots
 * directive in step with the address.
 *
 * A component in the shell rather than a hook called by each page, because the failure mode of the
 * second shape is the page that forgets to call it — and the page that forgets is the one added
 * last, which is the one nobody has bookmarked yet and therefore the one nobody notices is titled
 * with the previous page's title.
 *
 * ── EVERY STRING HERE COMES FROM A DECLARATION THAT ALREADY EXISTS ────────────────────────────
 *
 * The title is the route's own `label` from `lib/routes.ts` — the same string the sub-nav draws —
 * and the path is the address the router is on. Nothing is typed here. `surfaceMeta` supplies the
 * rest from the registry row: the name, the description composed from the blurb, and the robots
 * directive, which for a surface carrying `adminOnly: true` is `noindex, nofollow`
 * (`robotsDirective`, ui/packages/ui/src/seo.ts — it reads `servesUi` and `adminOnly` and
 * nothing else). There is deliberately NO `robots` override in
 * the call: the whole value of deriving it is that this console cannot come to disagree with
 * `surfaces.ts` about whether it may be indexed, and an override here would be exactly that
 * disagreement waiting to happen. index.html's static `<meta name="robots">` is the same fact for
 * the crawler that does not execute JavaScript, and `nginx.conf`'s /robots.txt is the third —
 * `test/sitemap.test.ts` traces all three back to the one registry field.
 *
 * An address with no route — anything that falls to `path="*"` and renders NotFoundPage — gets the
 * bare surface name and no invented title. A hand-typed "Not found" here would be a fourth
 * description of a page whose own heading already says it, and it is not a page anybody links to
 * on purpose.
 */
function DocumentMeta() {
  const { pathname } = useLocation()
  useEffect(() => {
    /*
     * Normalised before the lookup, and this is not tidiness. `nginx.conf`'s `/?$` accepts
     * `/events/` as well as `/events`, so both addresses reach this component; matched raw, the
     * trailing-slash spelling would find no route, lose its title and canonicalise to a second
     * address for one page. `surfaceMeta` normalises the path it is GIVEN — it cannot normalise
     * the key this file looks a label up with.
     */
    const path = normalisePath(pathname)
    const label = ROUTES.find((r) => r.path === path)?.label
    applyHead(
      surfaceMeta(PRODUCT, { ...(label == null ? {} : { title: label }), path }),
      window.location.origin,
    )
  }, [pathname])
  return null
}
