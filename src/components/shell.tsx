/**
 * The app shell: the company bar, the section navigation, and the page.
 *
 * The bar is `CloudsForgeBar` from @cloudsforge/ui and is never reimplemented. It is passed
 * `PRODUCT` — 'lantern' — so the switcher resolves this surface's own entry and marks it current.
 *
 * ── This is the surface the switcher has been pointing at nothing ─────────────────────────────
 *
 * `lantern` carries `inSwitcher: true` and `servesUi: false` at the same time
 * (`ui/packages/ui/src/surfaces.ts:386-387`). Every operator who opened the switcher was offered
 * "Logs & errors" and taken to a 404, because `micro-lantern` serves JSON and no HTML. This bundle
 * is what that entry now reaches. Nothing in this file needs to change when `servesUi` is
 * corrected; it is recorded here because the current value makes this shell look redundant and it
 * is the opposite.
 *
 * ── No mark, and no glyph drawn by this app ───────────────────────────────────────────────────
 *
 * `markId: null` (`surfaces.ts:385`). The registry's `✷` belongs to the switcher entry, which the
 * bar draws. Reproducing it in the page chrome would be this app inventing a mark for a surface
 * that was deliberately not given one.
 */
import { CloudsForgeBar } from '@cloudsforge/ui'
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
    </>
  )
}
