/**
 * The states a panel can be in, as visibly different things.
 *
 * They are separated because collapsing any two of them destroys information the operator needs:
 *
 *   LOADING   — we do not know yet. Waiting is the correct action.
 *   EMPTY     — the query answered, with nothing. Nothing is wrong.
 *   REFUSED   — the service declined. There is something to DO, and it is not "try again".
 *   FAILED    — the query did not answer. Retrying may work. The request id is what support needs.
 *
 * A spinner that never resolves, an empty list that was actually a timeout, and a refusal rendered
 * as "no results" are the three failures this file exists to prevent.
 *
 * ── EMPTY IS THE COMMON CASE ON THIS SURFACE, AND IT IS GOOD NEWS ─────────────────────────────
 *
 * `GET /v1/issues?limit=3` on this estate answers `{"issues":[]}` right now. That is a healthy
 * estate, not a broken panel — so the empty state has to READ as an answer. A blank area, a bare
 * dash or a panel that simply does not appear all read as "this failed to draw", and an operator
 * who cannot tell "no open issues" from "the issues panel is broken" has no reason to trust the
 * one they are shown next.
 */
import type { ReactNode } from 'react'
import type { ErrorNotice } from '../lib/api.ts'

// Every optional prop is spelled `?: T | undefined`. Under `exactOptionalPropertyTypes` those are
// two different types, and only the second one accepts the `value ?? undefined` a caller writes
// when it may or may not have something to pass.
export function Loading({ label = 'Loading' }: { label?: string | undefined }) {
  return (
    <div className="wt-state wt-state--loading" role="status" aria-live="polite">
      <span className="wt-spinner" aria-hidden="true" />
      <p className="wt-state__title">{label}</p>
    </div>
  )
}

export function Empty({
  title,
  hint,
  action,
}: {
  /** Say what was asked and found nothing. "No data" describes the screen, not the answer. */
  title: string
  hint?: string | undefined
  action?: ReactNode | undefined
}) {
  return (
    <div className="wt-state wt-state--empty" role="status">
      <span className="wt-state__icon" aria-hidden="true">
        ◇
      </span>
      <p className="wt-state__title">{title}</p>
      {hint && <p className="wt-state__hint">{hint}</p>}
      {action && <div className="wt-state__action">{action}</div>}
    </div>
  )
}

/**
 * The service declined, and the reader can act on that.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * `explorer-web`, WHICH THIS FILE WAS COPIED FROM, DELETED THIS COMPONENT. IT IS BACK ON PURPOSE.
 *
 * There it was right to delete: `micro-indexer` opened its reads, so no visitor could be refused
 * and a component explaining a restriction nobody was under would be believed anyway.
 *
 * `micro-lantern` refuses every anonymous read (`authorise`, `lantern/src/server.ts`) and
 * `lantern` is `adminOnly` in the registry (`surfaces.ts`). The two refusals are different
 * events with different next actions, and the CODE is what separates them
 * (`authorise` in `lantern/src/server.ts`):
 *
 *   401 `unauthenticated`  no credential, or one Lantern could not verify. Sign in.
 *   403 `forbidden`        a credential that is not enough. Signing in again will not help, and
 *                          offering it would send an operator round a loop they cannot leave.
 *
 * So the button below is shown for 401 and withheld for 403.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function Refused({
  notice,
  onSignIn,
}: {
  notice: ErrorNotice
  onSignIn?: (() => void) | undefined
}) {
  const canSignIn = notice.status === 401
  return (
    <div className="wt-state wt-state--refused" role="status">
      <span className="wt-state__icon" aria-hidden="true">
        ⊘
      </span>
      <p className="wt-state__title">
        {canSignIn ? 'Lantern needs a credential for this' : 'Lantern will not serve this to you'}
      </p>
      <p className="wt-state__hint">
        {canSignIn
          ? 'The request was made without a credential Lantern could verify. Signing in again ' +
            'issues a new one.'
          : 'Your session is valid and this estate does not consider it an operator credential. ' +
            'Signing in again would issue the same one, so there is no button here.'}
      </p>
      <p className="wt-state__meta">
        Lantern answered <code className="cf-num ln-code">{notice.code ?? notice.status}</code>
        {notice.requestId && (
          <>
            {' '}
            · request <code className="cf-num wt-reqid">{notice.requestId}</code>
          </>
        )}
      </p>
      {canSignIn && onSignIn && (
        <div className="wt-state__action">
          <button type="button" className="cf-btn" onClick={onSignIn}>
            Sign in
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * A failure, with the figure that is missing named, and the request id on screen.
 *
 * `what` is required and it is the point of the component. "That did not load" on an error console
 * is the console committing the offence it exists to detect — a panel that cannot say which figure
 * is absent leaves an operator unable to tell a missing panel from an empty one. So every caller
 * names its read.
 *
 * The request id is what the operator quotes and what finds the exact request across every service
 * at once. It is rendered in the monospace token and made selectable, because it is going to be
 * pasted into the box on the `/request` page in this very app.
 */
export function Failed({
  notice,
  what,
  onRetry,
}: {
  notice: ErrorNotice
  /** The thing that is missing, as a noun phrase: "the open issues", "the browser samples". */
  what: string
  onRetry?: (() => void) | undefined
}) {
  return (
    <div className="wt-state wt-state--failed" role="alert">
      <span className="wt-state__icon" aria-hidden="true">
        ■
      </span>
      <p className="wt-state__title">Could not load {what}</p>
      <p className="wt-state__hint">{notice.message}</p>
      <p className="wt-state__meta">
        {notice.code ? (
          <>
            Lantern answered <code className="cf-num ln-code">{notice.code}</code>
          </>
        ) : notice.status !== undefined ? (
          <>
            HTTP <code className="cf-num ln-code">{notice.status}</code>
          </>
        ) : (
          // No status and no code means the request never got an answer at all — the fetch threw.
          // Saying so is the difference between "Lantern is refusing" and "nothing replied".
          <>The request did not reach Lantern</>
        )}
        {notice.requestId ? (
          <>
            {' '}
            · request <code className="cf-num wt-reqid">{notice.requestId}</code>
          </>
        ) : (
          <> · no request id — Lantern never answered, so there is none to quote</>
        )}
      </p>
      {onRetry && (
        <div className="wt-state__action">
          <button type="button" className="cf-btn" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The whole-surface sign-in panel, shown INSTEAD of the pages when there is no session.
 *
 * Not a per-panel state: the gate in `app.tsx` renders this and mounts nothing that fetches, so a
 * signed-out visitor never sees four 401s arranged in a grid. See the header of `lib/auth.tsx` for
 * why this surface has a gate at all when `explorer-web` deliberately has none.
 */
export function SignInWall({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section className="ln-wall" aria-labelledby="wall-title">
      <h1 className="ln-wall__title" id="wall-title">
        Lantern is an operator surface
      </h1>
      <p className="ln-wall__lede">
        This console reads the estate's errors, log events and browser samples. Every one of those
        reads is credentialled — Lantern refuses an anonymous request outright — and the surface
        registry marks it <code className="cf-num ln-code">adminOnly</code>.
      </p>
      <p className="ln-wall__lede">
        Nothing has been requested on your behalf. You are not looking at a page that failed; you
        are looking at a page that has not asked Lantern anything, because asking without a
        credential can only produce a screen of refusals.
      </p>
      <div className="ln-wall__action">
        <button type="button" className="cf-btn cf-btn--primary" onClick={onSignIn}>
          Sign in
        </button>
      </div>
      <p className="ln-wall__note">
        Signing in returns you to this page. If Lantern still declines afterwards, it will say so
        with its own code and a request id — that is a decision the service makes, not this page.
      </p>
    </section>
  )
}
