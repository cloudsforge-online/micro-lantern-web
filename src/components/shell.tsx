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
 */
import { CloudsForgeBar, CloudsForgeFooter } from '@cloudsforge/ui'
import { NavLink, Outlet } from 'react-router-dom'
import { PRODUCT } from '../lib/hosts.ts'
import { NAV } from '../lib/routes.ts'
import { useSession } from '../lib/auth.tsx'

export function AppShell({ unregistered = false }: { unregistered?: boolean }) {
  const { account, signIn, signOut } = useSession()

  return (
    <>
      {/* Skip link first in the DOM: these pages are long tables and a keyboard user should not
          have to tab the navigation and every filter to reach the rows. */}
      <a className="ln-skip" href="#main">
        Skip to the page
      </a>
      <CloudsForgeBar
        current={PRODUCT}
        account={account}
        onSignIn={() => signIn()}
        onSignOut={signOut}
      />
      {/*
        The sub-nav is sticky at exactly `var(--cf-bar-h)` — the bar's own height token, not a
        number copied out of it. When the bar's height changes, this moves with it.
      */}
      <nav className="ln-subnav" aria-label="Sections">
        <div className="ln-subnav__inner">
          {NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `ln-subnav__link${isActive ? ' is-active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="ln-main" id="main">
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
        <Outlet />
      </main>

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
    </>
  )
}
