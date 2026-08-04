/**
 * Where this app talks to, resolved at runtime.
 *
 * `cloudsforgeHosts()` reads `window.location.hostname` on every call, so one image serves
 * localhost, a preview deployment and production. Nothing here reads a build-time constant; see
 * the note in vite.config.ts and `test/no-build-time-config.test.ts`.
 *
 * ── This bundle IS the surface it reads, and the registry already promised it ───────────────────
 *
 * `lantern` is an entry that already exists (`ui/packages/ui/src/surfaces.ts:375-389`), with
 * `subdomain: 'lantern'`, `inSwitcher: true`, `adminOnly: true` — and **`servesUi: false`**. The
 * operator switcher has therefore been offering every admin an entry that 404s, because
 * `micro-lantern` serves an API and no HTML at all. Driven through the real gateway before this
 * repository existed: `https://lantern.cloudsforge.localtest.me/` answered 404.
 *
 * So this bundle is the page the registry already claims. In production nginx serves it at
 * `lantern.<apex>` and `micro-lantern` serves `/v1/…` behind the same hostname — the arrangement
 * `trade.<apex>` already uses — so `apiBase()` is `''` and every request is relative.
 *
 * `servesUi` said **false** until 2026-08-04, which was wrong the moment this bundle existed, and
 * this repository could not fix it: micro-ui owns that file. `test/hosts.test.ts` pinned the claim
 * as it stood, so the day it flipped a test would say so out loud rather than the flag drifting
 * into agreement unnoticed. It flipped — after the bundle was deployed and the page MEASURED at
 * `200 text/html` through the gateway, in that order, because the flag records a measurement and
 * not an intention. The test is now pinned to `true` for the same reason, in reverse.
 */
import { cloudsforgeHosts, type CloudsForgeHosts, type SurfaceKey } from '@cloudsforge/ui'

/**
 * The surface this application IS.
 *
 * `markId: null` (`surfaces.ts:385`), so nothing in this bundle renders a mark or a wordmark and
 * no chrome here is designed around one. The glyph the registry gives it — `✷` — belongs to the
 * shared bar's switcher entry, not to this app's own chrome.
 */
export const PRODUCT: SurfaceKey = 'lantern'

/**
 * The accent block `<html data-cf-product>` names.
 *
 * `lantern` HAS a declared block (`ui/packages/ui/src/tokens.css:596-602`), which is why the real
 * key is used rather than a neighbour's: tokens.css says at `:389-396` that every key an app may
 * set is declared, precisely so a surface cannot fall through to the company ember in silence —
 * which is what `admin` did. That block carries amber, and `src/styles.css` then re-points the
 * five accent tokens to the ember ramp. The reason is quoted where that happens.
 */
export const ACCENT_SURFACE: SurfaceKey = 'lantern'

/** The name reported to the observability ingest and shown in error copy. */
export const APP_NAME = 'lantern-web'

/**
 * The base URL for the API this app reads, which is `micro-lantern` itself.
 *
 * In production the SPA and the service share `lantern.<apex>`, so the base is the empty string
 * and requests stay relative. Under `pnpm dev` the page is on Vite's 5190 while the service is on
 * the registry's devPort 4010, so the base is absolute and the request goes cross-origin.
 *
 * The difference is derived by COMPARING ORIGINS rather than by a `DEV` flag, because a flag is a
 * build-time constant and this repository has none: an image built for production and opened on
 * localhost would then point at a host that is not there.
 */
export function resolveApiBase(
  origin: string,
  hostMap: CloudsForgeHosts,
  key: SurfaceKey,
): string {
  const own = hostMap[key]
  // With no page origin there is nothing for a relative URL to resolve against, so the absolute
  // form is the only correct answer.
  if (!origin) return own
  // A surface may carry a basePath (the wallet is a path inside Hub), so compare ORIGINS rather
  // than whole URLs — otherwise every such surface would look cross-origin to itself.
  return new URL(own).origin === origin ? '' : own
}

/** The same four names `cloudsforgeHosts()` treats as development. Kept in step by test. */
export function isLocal(hostname: string): boolean {
  return (
    hostname === '' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local')
  )
}

/**
 * Whether this bundle is being served from an address the surface registry knows.
 *
 * `cloudsforgeHosts()` derives the apex by stripping a KNOWN subdomain prefix. Served from an
 * unknown name, the whole name becomes the apex, and every CloudsForge URL derived from it — this
 * service, and the account portal an operator is sent to sign in at — resolves one level too deep.
 * That matters more here than on a public page: an operator sent to a sign-in URL derived from the
 * wrong apex arrives nowhere and has nothing on screen to say why. So the shell says it, once.
 */
export function isRegisteredPlacement(
  origin: string,
  hostname: string,
  hostMap: CloudsForgeHosts,
): boolean {
  if (isLocal(hostname)) return true
  if (!origin) return true
  try {
    return new URL(hostMap[PRODUCT]).origin === origin
  } catch {
    return false
  }
}

/** Every CloudsForge base URL, for the current environment. */
export function hosts(): CloudsForgeHosts {
  return cloudsforgeHosts()
}

/** This app's API base, resolved now. Call it per request; never cache it in a module constant. */
export function apiBase(): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return resolveApiBase(origin, cloudsforgeHosts(), PRODUCT)
}

/** The page origin, or a stable placeholder when there is no document (tests, prerender). */
export function pageOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin
}

/** Whether the current address is one the registry knows. Read by the shell. */
export function placementIsKnown(): boolean {
  if (typeof window === 'undefined') return true
  return isRegisteredPlacement(window.location.origin, window.location.hostname, cloudsforgeHosts())
}
