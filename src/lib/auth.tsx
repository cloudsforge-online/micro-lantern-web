/**
 * Session state for the tree, and the gate every page here sits behind.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE HAS A GATE, WHEN `explorer-web` — WHICH IT WAS COPIED FROM — DELIBERATELY HAS NONE
 *
 * `explorer-web/src/lib/auth.tsx` states its position at length and it is correct for that
 * surface: every `micro-indexer` route it calls is anonymous, so a gate there would demand a
 * session for public chain facts and would be the defect that repository was built around,
 * arriving from the client's side.
 *
 * **Every read here is the opposite.** `micro-lantern`'s `authorise`
 * (`lantern/src/server.ts`) accepts the break-glass `x-lantern-token`, or an identity JWT
 * whose principal is a user, or a service token holding the read scope — and throws
 * `TokenError('no credential presented')` otherwise. The browser holds only the second of those.
 * And `lantern` is `adminOnly: true` in the registry (`ui/packages/ui/src/surfaces.ts`), which
 * is the estate saying out loud that this surface is not for customers.
 *
 * So a signed-out visitor gets ONE screen: a panel that says what this is and offers `signIn()`.
 * The gate's real job is not to hide anything — the service is what refuses, and the service is
 * the only thing that can — it is to STOP THE REQUESTS BEING SENT. Without it, the first paint of
 * this console for a signed-out operator is four panels of 401, which reads as "Lantern is
 * broken" rather than "you are not signed in", and is exactly the screen a gate exists to spare
 * somebody.
 *
 * What the gate must NOT do is decide who is an operator. It branches on "is there a session at
 * all", never on `roles`. A client that predicts an authorisation decision is a client that will
 * eventually disagree with the service making it — so a signed-in reader whom Lantern refuses sees
 * the service's own 401/403, with its code and its request id, via the `refused` state in
 * `lib/resource.ts`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── The `/auth/me` shape ──────────────────────────────────────────────────────────────────────
 *
 * Identity answers `{ user: {...}, session: {...}, organisations: [...] }` — the profile is
 * **NESTED under `user`**. The route is `GET /auth/me` in `identity/src/server.ts` and the body is
 * built by `toPublicUser` at `identity/src/users.ts`.
 *
 * That shape is worth stating because the estate got it wrong at the root: the web template
 * declared `interface Me { handle?, roles? }` and read both fields off the TOP level, where they
 * are not. Four frontends inherited it, `roles` was then always null, `isAdmin` in the shared
 * company bar was always false, and the switcher hid every `adminOnly` entry from every signed-in
 * operator — **including this one**, which is the entry an operator most needs to find. There is no
 * flat fallback here and `test/auth.test.ts` pins its absence: tolerating it would encode a
 * response identity does not send, and the next reader could not tell which is real.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AccountState } from '@cloudsforge/ui'
import { AUTH_EXPIRED_EVENT, clearTokens, hasSession, nimbus, signIn, signOut } from './api.ts'

/** What identity answers at `/auth/me`, narrowed to what this app needs. */
export interface MeResponse {
  user?: {
    id?: string | null
    handle?: string | null
    roles?: readonly string[] | null
  } | null
}

export interface Reader {
  readonly handle: string | null
  readonly roles: readonly string[]
}

/**
 * Read the reader out of an `/auth/me` body.
 *
 * A pure function so `test/auth.test.ts` can prove the shape without a browser, and so the
 * nested-versus-flat mistake cannot be made silently a sixth time.
 */
export function readReader(body: unknown): Reader {
  const empty: Reader = { handle: null, roles: [] }
  if (typeof body !== 'object' || body === null) return empty
  const nested = (body as MeResponse).user
  if (typeof nested !== 'object' || nested === null) return empty
  return {
    handle: typeof nested.handle === 'string' && nested.handle.length > 0 ? nested.handle : null,
    roles: Array.isArray(nested.roles)
      ? nested.roles.filter((r): r is string => typeof r === 'string')
      : [],
  }
}

export type SessionStatus = 'loading' | 'anonymous' | 'signedIn'

export interface Session {
  status: SessionStatus
  account: AccountState
  reader: Reader
  signIn: (returnTo?: string) => void
  signOut: () => void
}

const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const value = useContext(SessionContext)
  // Throwing beats returning a signed-out default: a component rendered outside the provider would
  // otherwise show an anonymous UI to a signed-in reader and nobody would ever see why.
  if (!value) throw new Error('useSession must be used inside <AuthProvider>')
  return value
}

const NOBODY: Reader = { handle: null, roles: [] }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(() => (hasSession() ? 'loading' : 'anonymous'))
  const [reader, setReader] = useState<Reader>(NOBODY)

  useEffect(() => {
    if (!hasSession()) return
    let live = true
    // An unreachable identity service must not turn a held session into a signed-out screen: the
    // tokens are still there, Lantern will still accept them, and the panels below can still
    // answer. So the failure branch keeps `signedIn` if the tokens survive, and only the handle in
    // the bar is lost.
    nimbus<unknown>('/auth/me')
      .then((profile) => {
        if (!live) return
        setReader(readReader(profile))
        setStatus('signedIn')
      })
      .catch(() => {
        if (!live) return
        setStatus(hasSession() ? 'signedIn' : 'anonymous')
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    const onExpired = () => {
      clearTokens()
      setReader(NOBODY)
      setStatus('anonymous')
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [])

  const doSignOut = useCallback(() => {
    setReader(NOBODY)
    setStatus('anonymous')
    signOut()
  }, [])

  const value = useMemo<Session>(
    () => ({
      status,
      account: {
        signedIn: status === 'signedIn',
        handle: reader.handle,
        roles: reader.roles,
      },
      reader,
      signIn,
      signOut: doSignOut,
    }),
    [status, reader, doSignOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
