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
export function Loading({ label = 'Fetching' }: { label?: string | undefined }) {
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
        {canSignIn ? 'Lantern wants a credential' : 'Your credential is not enough'}
      </p>
      <p className="wt-state__hint">
        {canSignIn
          ? 'Nothing went out with this read that Lantern could check. Sign in and the page asks ' +
            'again holding a token it can verify. Nothing was read, so nothing was lost.'
          : 'The session is valid; this estate does not count it as an operator credential. ' +
            'A second sign-in would mint the same token, which is why no button is offered here — ' +
            'getting past this takes a change of role, not another attempt.'}
      </p>
      <p className="wt-state__meta">
        Lantern replied <code className="cf-num ln-code">{notice.code ?? notice.status}</code>
        {notice.requestId && (
          <>
            {' '}
            · under request <code className="cf-num wt-reqid">{notice.requestId}</code>
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
      <p className="wt-state__title">Lantern did not return {what}</p>
      <p className="wt-state__hint">{notice.message}</p>
      <p className="wt-state__hint">
        This screen only ever reads, so nothing was written and no telemetry was lost — the view is
        short of one panel and that is all. Ask again, or take the id below to whoever is on call.
      </p>
      <p className="wt-state__meta">
        {notice.code ? (
          <>
            It replied <code className="cf-num ln-code">{notice.code}</code>
          </>
        ) : notice.status !== undefined ? (
          <>
            The status was <code className="cf-num ln-code">{notice.status}</code>
          </>
        ) : (
          // No status and no code means the request never got an answer at all — the fetch threw.
          // Saying so is the difference between "Lantern is refusing" and "nothing replied".
          <>Nothing answered — the request never got as far as Lantern</>
        )}
        {notice.requestId ? (
          <>
            {' '}
            · under request <code className="cf-num wt-reqid">{notice.requestId}</code>
          </>
        ) : (
          <> · no request id to quote, because no response came back carrying one</>
        )}
      </p>
      {onRetry && (
        <div className="wt-state__action">
          <button type="button" className="cf-btn" onClick={onRetry}>
            Ask again
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
        You need an operator session for this
      </h1>
      <p className="ln-wall__lede">
        Everything here — the grouped faults, the raw log lines, the browser reports and the request
        lookup — is read out of Lantern, and Lantern turns away any read that arrives without a
        credential. The surface registry marks this console{' '}
        <code className="cf-num ln-code">adminOnly</code> for the same reason.
      </p>
      <p className="ln-wall__lede">
        No request has gone out yet. This is not a page that broke; it is a page that has
        deliberately asked for nothing, because asking without a token would fill the screen with
        four refusals and teach you nothing.
      </p>
      <div className="ln-wall__action">
        <button type="button" className="cf-btn cf-btn--primary" onClick={onSignIn}>
          Sign in
        </button>
      </div>
      <p className="ln-wall__note">
        Signing in brings you back to this address. If Lantern still says no once you return, it
        will show you the code it said no under and the request id it said it against. That call
        belongs to the service, not to this page.
      </p>
    </section>
  )
}
