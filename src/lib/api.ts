/**
 * The auth client: tokens, one refresh at a time, and one error shape.
 *
 * Carried forward from Crucible's `src/lib/api.ts`, which is the version of this file that has
 * actually been run against Nimbus. The behaviour worth preserving verbatim is the SINGLE-FLIGHT
 * REFRESH: a dashboard that fires ten requests on mount, all of which 401 on an expired access
 * token, must perform ONE refresh. Ten refreshes against a rotating refresh token means nine of
 * them present a token that has just been superseded, and the user is signed out while holding a
 * valid session.
 *
 * ── One thing is different on THIS surface, and it is the opposite of the explorer's ──────────
 *
 * `micro-lantern` REFUSES an anonymous read. `authorise` (`lantern/src/server.ts`) checks
 * the break-glass `x-lantern-token` first and then falls through to an identity JWT; with no
 * credential at all it throws `TokenError('no credential presented')` and the route answers 401.
 * Every one of the four reads this bundle makes goes through it.
 *
 * So the bearer machinery below is not decoration here, and the rule is the mirror image of
 * `explorer-web/src/lib/api.ts`, which this file was copied from: there a bearer must NEVER travel
 * to the API, because presenting one to an anonymous route turns a public page into a 401. Here a
 * bearer is the only thing that makes the API answer, and the single-flight refresh is what keeps
 * four panels mounting at once from spending four rotations of one refresh token.
 *
 * The break-glass token is deliberately absent from this bundle. It is a shared secret that would
 * be readable in devtools by anyone the page ever loaded for, and a static credential in a
 * JavaScript bundle is a static credential in every browser cache on the estate. It is for a
 * curl, and `micro-deploy`'s gateway config is where it lives.
 */
import { consumeAuthCallback, signInRedirect, signOutRedirect } from '@cloudsforge/ui'
import { APP_NAME, apiBase, hosts, pageOrigin } from './hosts.ts'
import { report } from './obs.ts'

/** Nimbus issues and refreshes tokens; it is cross-origin from every app, always. */
function nimbusUrl(): string {
  return hosts().nimbus
}

/**
 * The shared CloudsForge token keys.
 *
 * Deliberately the same strings in every product: a session established at the Account portal is
 * picked up here without a second round trip, and signing out of one app on a shared machine
 * clears the tokens the next app would have read.
 */
const ACCESS_KEY = 'cf.accessToken'
const REFRESH_KEY = 'cf.refreshToken'

/** Fired when a refresh fails. `AuthProvider` listens and drops the session. */
export const AUTH_EXPIRED_EVENT = 'cf:auth-expired'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

/* ---- token storage ------------------------------------------------- */

const memory = new Map<string, string>()

/**
 * Storage, with a memory fallback.
 *
 * `localStorage` throws rather than returning null in a Safari private window and in a
 * third-party iframe with storage blocked. A module that touched it directly would take the whole
 * bundle down at import time in both, and could not be unit tested outside a browser at all. The
 * fallback loses the session on reload, which is a worse experience than persistence and a much
 * better one than a blank page.
 */
function store(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    if (typeof localStorage !== 'undefined') {
      // Probe rather than trust: the throw happens on ACCESS, not on the typeof check.
      localStorage.getItem(ACCESS_KEY)
      return localStorage
    }
  } catch {
    // Fall through to memory.
  }
  return {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  }
}

export const getAccessToken = (): string | null => store().getItem(ACCESS_KEY)
export const getRefreshToken = (): string | null => store().getItem(REFRESH_KEY)

export function setTokens(tokens: AuthTokens): void {
  store().setItem(ACCESS_KEY, tokens.accessToken)
  store().setItem(REFRESH_KEY, tokens.refreshToken)
}

export function clearTokens(): void {
  store().removeItem(ACCESS_KEY)
  store().removeItem(REFRESH_KEY)
}

export const hasSession = (): boolean => Boolean(getAccessToken() && getRefreshToken())

/* ---- errors -------------------------------------------------------- */

export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined
  /**
   * The server's id for the exact request that failed, echoed in both the `x-request-id` header
   * and the error body. Quoted by the user, it is what finds their request across every service
   * at once — which is why every failure state in this app displays it.
   */
  readonly requestId: string | undefined

  constructor(status: number, message: string, code?: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

/**
 * Pull the sentence, the code and the request id out of a service's error body.
 *
 * The estate's envelope is **nested** — `{error: {code, message, requestId}}`, built by
 * `errorReply()` in every service (`hub-api/src/server.ts`, `identity/src/server.ts`,
 * `service-template/src/server.ts`). This function used to read it as flat, assigning
 * `data.error` — an object — straight to the displayed message. Every server-side failure in
 * every app cut from this template would have rendered as `[object Object]`, with the real
 * message, the code and the request id all present in the response and all discarded. The
 * request id is the one thing a support conversation runs on, so the failure mode was not
 * cosmetic: it destroyed exactly the field the app exists to show.
 *
 * Both shapes are accepted rather than only the nested one, because a proxy or an older service
 * on the rollback path may still answer flat, and a template that only understands the current
 * estate is a template that breaks during the migration it was written for.
 */
export function readErrorBody(body: unknown): {
  message?: string
  code?: string
  requestId?: string
} {
  if (typeof body !== 'object' || body === null) return {}
  const top = body as { error?: unknown; code?: unknown; requestId?: unknown; message?: unknown }
  const nested =
    typeof top.error === 'object' && top.error !== null
      ? (top.error as { code?: unknown; message?: unknown; requestId?: unknown })
      : undefined

  // A string `error` is the flat shape's message. An object `error` is the nested envelope, and
  // its fields win over any same-named field at the top level.
  const message =
    pickString(nested?.message) ??
    (typeof top.error === 'string' ? top.error : undefined) ??
    pickString(top.message)

  return {
    ...(message ? { message } : {}),
    ...(pickString(nested?.code) ?? pickString(top.code)
      ? { code: (pickString(nested?.code) ?? pickString(top.code)) as string }
      : {}),
    ...(pickString(nested?.requestId) ?? pickString(top.requestId)
      ? { requestId: (pickString(nested?.requestId) ?? pickString(top.requestId)) as string }
      : {}),
  }
}

function pickString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

/** What a failure state needs: the sentence, and the id to quote at support. */
export interface ErrorNotice {
  message: string
  requestId: string | undefined
  /**
   * The service's error CODE, carried through so a screen can branch on it.
   *
   * The template drops it, and dropping it is how `micro-market` and `micro-mint` each rendered a
   * router 404 as a fact about a chain. It matters here for the same shape of reason:
   * `micro-lantern` answers 401 with code `unauthenticated` and 403 with code `forbidden`
   * (both from `authorise` in `lantern/src/server.ts`), and an operator needs to know which of "sign in" and
   * "you are signed in and still not allowed" they are looking at.
   */
  code: string | undefined
  /** The HTTP status, for the one case where the code is absent and the status is all there is. */
  status: number | undefined
}

/**
 * Normalise a caught error for display.
 *
 * `fallback` covers the non-ApiError case, which is a bug in this bundle rather than a server
 * response — so it is also the only case worth reporting from here. An ApiError has already been
 * logged by the service that produced it, under the request id shown to the user.
 */
export function noticeFor(err: unknown, fallback: string): ErrorNotice {
  if (err instanceof ApiError) {
    return {
      message: err.message,
      requestId: err.requestId,
      code: err.code,
      status: err.status,
    }
  }
  report({
    app: APP_NAME,
    type: err instanceof Error ? err.name : 'UnknownError',
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? (err.stack ?? null) : null,
    context: { fallback },
  })
  return {
    message: fallback,
    requestId: undefined,
    code: undefined,
    status: undefined,
  }
}

/* ---- the single-flight refresh ------------------------------------- */

let inflightRefresh: Promise<boolean> | null = null

/**
 * Refresh the session, at most once concurrently.
 *
 * Every caller that arrives while a refresh is in flight awaits THE SAME promise; the slot is
 * cleared when it settles, so the next 401 after this one starts a fresh attempt rather than
 * replaying a stale answer.
 */
export function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return Promise.resolve(false)
  if (!inflightRefresh) {
    inflightRefresh = performRefresh(refreshToken).finally(() => {
      inflightRefresh = null
    })
  }
  return inflightRefresh
}

async function performRefresh(refreshToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${nimbusUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (!res.ok) {
      // Returning false signs the user out either way, but the two causes are not the same event:
      // a 401 is an expired refresh token and routine, anything else is Nimbus failing. They were
      // indistinguishable for as long as neither was written down.
      if (res.status !== 401) {
        report({
          app: APP_NAME,
          type: 'RefreshFailed',
          message: `Token refresh failed (${res.status})`,
          statusCode: res.status,
          requestId: res.headers.get('x-request-id'),
        })
      }
      return false
    }
    setTokens((await res.json()) as AuthTokens)
    return true
  } catch (err) {
    report({
      app: APP_NAME,
      type: 'RefreshUnreachable',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? (err.stack ?? null) : null,
      context: { nimbus: nimbusUrl() },
    })
    return false
  }
}

function expireSession(): void {
  clearTokens()
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}

/* ---- the request core ---------------------------------------------- */

export interface RequestOptions {
  method?: string
  body?: unknown
  /** Default true: attach the bearer token and refresh once on 401. */
  auth?: boolean
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
  /**
   * Extra request headers. **Nothing on this surface sets one, and that is a fact about the API.**
   *
   * `micro-lantern` reads exactly three request headers on a read route: `x-lantern-token` and
   * `authorization` in `authorise` (`lantern/src/server.ts`), plus `x-request-id` in the
   * server frame (`lantern/src/server.ts`). There is no `Idempotency-Key` anywhere in that
   * repository and this bundle sends no write that would need one — every route it calls is a GET,
   * and the service's only writes are the ingest paths a collector posts to.
   *
   * The parameter is kept rather than deleted because it is the template's and because deleting it
   * would make the next writer add it back without the note. Copying `trade-web`'s client here
   * would have sent an `Idempotency-Key` this service never reads; copying this one to `trade`
   * would fail every write with a **400** (`trade/src/server.ts`). Two clients that look
   * alike and are not interchangeable is exactly the shape this estate keeps shipping.
   *
   * `authorization` and `content-type` are set by this function AFTER these are spread, so a
   * caller cannot accidentally drop the bearer token by passing a header map of its own.
   */
  headers?: Record<string, string>
}

async function request<T>(base: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, query, signal, headers: extra } = opts

  // `base` may be '' (relative, same origin), so resolve against the page origin.
  const url = new URL(base + path, pageOrigin())
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
    }
  }

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = { accept: 'application/json', ...extra }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const token = getAccessToken()
    if (auth && token) headers['authorization'] = `Bearer ${token}`
    return fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    })
  }

  let res: Response
  try {
    res = await send()
  } catch (err) {
    // The user-facing sentence is the right one whether the cause is their wifi or our container.
    // The cause itself, though, only exists here — discarding it is how a service being down
    // looked exactly like a bad connection, for everyone, for as long as it lasted.
    report({
      app: APP_NAME,
      type: 'NetworkError',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? (err.stack ?? null) : null,
      context: { method, url: url.toString() },
    })
    throw new ApiError(
      0,
      'Lantern could not be reached at all. Nothing was sent and nothing was changed. Check the connection, then ask again.',
    )
  }

  // One silent refresh and retry on expiry. Ten of these at once share one refresh.
  if (res.status === 401 && auth && getRefreshToken()) {
    if (await refreshSession()) {
      res = await send()
    } else {
      expireSession()
      throw new ApiError(
        401,
        'Your session has run out. Sign in and this page picks up where it left off.',
        'session_expired',
        res.headers.get('x-request-id') ?? undefined,
      )
    }
  }

  if (!res.ok) {
    // Every service sets this header on every response, error or not, so it is present even when
    // the body is a proxy's HTML page rather than ours.
    let requestId = res.headers.get('x-request-id') ?? undefined
    let message = res.statusText || `Lantern answered ${res.status} and said nothing more`
    let code: string | undefined
    try {
      const parsed = readErrorBody(await res.json())
      if (parsed.message) message = parsed.message
      if (parsed.code) code = parsed.code
      if (parsed.requestId) requestId = parsed.requestId
    } catch (err) {
      // A non-JSON error body means something in FRONT of the service answered — a gateway, a
      // CDN, a misrouted deploy — and the request never reached it. Nothing server-side logs
      // that, so it has to be reported from here.
      report({
        app: APP_NAME,
        type: 'NonJsonErrorBody',
        message: `${res.status} response from ${url.pathname} was not JSON`,
        stack: err instanceof Error ? (err.stack ?? null) : null,
        statusCode: res.status,
        requestId,
        context: { method, contentType: res.headers.get('content-type') },
      })
    }
    // `auth` means "attach a bearer IF we hold one", not "we hold one", so a 401 to a call made
    // without a session is the route saying it needs authentication rather than a session ending —
    // and expiring one that never existed dispatches `cf:auth-expired`, which signs a user out of
    // a session they never had.
    //
    // `explorer-web` reported that defect to micro-web-template and the template has since fixed
    // it (`web-template/src/lib/api.ts`, `if (res.status === 401 && auth && hasSession())`).
    // This line is the template's, not a fork of it, and `test/api.test.ts` checks the two agree.
    // Unlike on the explorer, the guard is load-bearing HERE: every read this bundle makes is
    // credentialled, so a 401 arriving without a session is the service saying "authenticate",
    // and expiring a session that never existed would dispatch `cf:auth-expired` at a visitor who
    // has not signed in — which is how a sign-in button turns into a loop.
    if (res.status === 401 && auth && hasSession()) expireSession()
    throw new ApiError(res.status, message, code, requestId)
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return undefined as T
  return (await res.json()) as T
}

/** This app's own API: relative in production, the registry's dev port under `pnpm dev`. */
export const api = <T,>(path: string, opts?: RequestOptions): Promise<T> =>
  request<T>(apiBase(), path, opts)

/** Nimbus, which is cross-origin from everywhere. */
export const nimbus = <T,>(path: string, opts?: RequestOptions): Promise<T> =>
  request<T>(nimbusUrl(), path, opts)

/* ---- boot and sign-in --------------------------------------------- */

/**
 * Whether this tab has already asked the portal about the reader.
 *
 * `sessionStorage`, and neither `localStorage` nor a module variable, for reasons on both sides:
 * a module variable dies with the navigation the ask IS, so it could never say "already asked",
 * and `localStorage` would remember for ever — an operator who declined once in the morning would
 * still be treated as a stranger after signing in at Hub in the afternoon. A tab is the unit a
 * reader would recognise.
 */
const SSO_ASKED_KEY = 'cf.ssoAsked'

/**
 * Record the ask and confirm it stuck; false means it did not, so nobody may leave.
 *
 * The verification is the loop guard and it is not decorative. `sessionStorage` throws on write in
 * a Safari private window, and an "ask once" that cannot remember having asked is an ask on every
 * page load — with the return address pointing back here, that is an infinite bounce between this
 * console and the portal, in the browser configuration least able to explain itself.
 */
function claimTheOneAsk(): boolean {
  try {
    if (typeof sessionStorage === 'undefined') return false
    if (sessionStorage.getItem(SSO_ASKED_KEY) !== null) return false
    sessionStorage.setItem(SSO_ASKED_KEY, '1')
    return sessionStorage.getItem(SSO_ASKED_KEY) !== null
  } catch {
    return false
  }
}

/**
 * What the boot sequence found. `main.tsx` renders for two of the three.
 *
 * A boolean cannot express the third: "there is nothing to render because the browser is leaving".
 * Rendering anyway paints the sign-in wall at somebody who is a redirect away from being signed
 * in, which is the flash the awaited bootstrap exists to prevent.
 */
export type BootResult = 'signed-in' | 'signed-out' | 'asking-the-portal'

/**
 * Establish the session, and — if there is none — ask the portal ONCE whether the reader has one.
 *
 * Called from main.tsx BEFORE React renders, so the first paint already knows.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS SURFACE MUST ASK, AND WHY IT CANNOT ANSWER THE QUESTION ITSELF
 *
 * This estate's session is a pair of tokens in `localStorage`, under the shared `cf.*` keys, and
 * `localStorage` is per ORIGIN. There are no cookies anywhere in the estate — measured in a real
 * browser against the running gateway: after signing in at `hub.<apex>/account/login` the context
 * held `cf.accessToken` and `cf.refreshToken` on Hub's origin, `[]` on this one, and
 * `context.cookies()` was empty for every host. So an operator who signed in five seconds ago is,
 * to this bundle, indistinguishable from somebody who has never had an account.
 *
 * The one bridge is the portal hand-off: go to `hub/account/login?return=<here>`, and a portal
 * that already holds a session mints a 60-second, single-use, origin-bound code and returns the
 * browser with it in the fragment — no second credential prompt
 * (`hub-web/src/pages/account.tsx`). `admin-web` has crossed that bridge all along, from
 * `ProtectedRoute` (`admin-web/src/lib/auth.tsx`); this console never did, and the cost
 * was not only a sign-in button shown to somebody already signed in. `CloudsForgeFooter` decides
 * `adminOnly` visibility from `account.roles` (`ui/packages/ui/src/index.tsx`), so with no
 * session there are no roles, and the footer hid Admin, Foresight Admin, Lantern and Beacon from
 * every operator on the two consoles those links matter most on. `micro-ui`'s `pnpm footer-audit`
 * reported exactly that, four times per surface, the day it began signing in for `adminOnly`
 * surfaces instead of only for ones that redirect.
 *
 * ── ONCE, AND THE ASK IS NOT AN AUTHORISATION DECISION ────────────────────────────────────────
 *
 * The ask is claimed BEFORE the browser leaves, so a portal that holds no session — which keeps
 * the reader on its own sign-in form — cannot turn a return visit into a second departure. A
 * reader who comes back gets this console's own sign-in wall, which is the screen that explains
 * where they are.
 *
 * And nothing here decides who is an operator. This asks "is there a session at all", exactly as
 * the gate does; `roles` is read only to decide what the chrome may OFFER. Lantern verifies the
 * credential on every route it serves (`authorise`, `lantern/src/server.ts`) and is the
 * only thing that can. A link on a page is not an authorisation.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The strip-then-exchange ordering inside `consumeAuthCallback` is load-bearing and is documented
 * where it is implemented: the code leaves the address bar before it goes over the wire, so it is
 * never in the history, in a referrer, or in a screenshot taken while the request is in flight.
 * Nothing here may reorder that, and nothing here may re-read `location.hash` afterwards.
 */
export async function bootstrapSession(): Promise<BootResult> {
  try {
    const tokens = await consumeAuthCallback()
    if (tokens) {
      setTokens(tokens)
      return 'signed-in'
    }
  } catch (err) {
    // A failed exchange is a signed-out boot, not a broken app: the sign-in button is right there.
    report({
      app: APP_NAME,
      type: 'AuthCallbackFailed',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? (err.stack ?? null) : null,
    })
  }
  if (hasSession()) return 'signed-in'
  if (!claimTheOneAsk()) return 'signed-out'
  signIn()
  return 'asking-the-portal'
}

/**
 * Send the browser to the Account portal, returning here afterwards.
 *
 * `returnTo` defaults to the CURRENT URL including its path and query, which is what puts a user
 * who deep-linked into a protected page back on that page rather than on a dashboard they then
 * have to navigate out of.
 */
export function signIn(returnTo?: string): void {
  signInRedirect(returnTo ?? (typeof window === 'undefined' ? undefined : window.location.href))
}

/** Clear this app's tokens FIRST — the portal cannot reach them — then end the shared session. */
export function signOut(returnTo?: string): void {
  clearTokens()
  signOutRedirect(returnTo ?? (typeof window === 'undefined' ? undefined : window.location.origin))
}

/** Reset module state. Tests only. */
export function __resetAuth(): void {
  inflightRefresh = null
  memory.clear()
}
