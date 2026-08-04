/**
 * One fetch, five states.
 *
 * Every screen in the estate needs the same answer — loading, ok, empty, failed — and every screen
 * that computes it by hand eventually gets one of the cases wrong: an empty array rendered for a
 * timeout, or a fault rendered as "no results". The decision is made once here, as a pure
 * function, so the wrong version cannot be written a seventh time.
 *
 * ── The fifth state is `refused`, and on THIS surface it is not optional ───────────────────────
 *
 * `explorer-web`, which this file was copied from, DELETED its `refused` state, and was right to:
 * `micro-indexer` made its reads anonymous, so a 401 there is a genuine fault rather than a thing
 * a reader could act on.
 *
 * Nothing of the sort is true here. `micro-lantern` authorises every read
 * (`lantern/src/server.ts:623-636`) and `lantern` is `adminOnly: true` in the registry
 * (`ui/packages/ui/src/surfaces.ts:388`). A 401 means "sign in", a 403 means "you are signed in
 * and this estate does not consider you an operator", and those are two different sentences with
 * two different next actions. Collapsing either into `failed` puts a "try again" button in front
 * of somebody for whom trying again cannot possibly work.
 *
 * Note what this state is NOT for: it is never entered by predicting a refusal. The gate in
 * `app.tsx` stops the requests being SENT when there is no session at all, so nobody sees a screen
 * made of 401s; but once a request is sent, the state comes from the answer. A client that decides
 * for itself who is authorised is a client that will eventually disagree with the service making
 * the decision.
 */
import { useCallback, useEffect, useState } from 'react'
import { noticeFor, type ErrorNotice } from './api.ts'

export type ResourceState = 'loading' | 'ok' | 'empty' | 'failed' | 'refused'

/** A refusal this reader can act on, rather than a fault. Pure, so the test needs no browser. */
export function isRefusal(error: ErrorNotice | null): boolean {
  return error !== null && (error.status === 401 || error.status === 403)
}

/**
 * Which state a resource is in.
 *
 * FAILURE OUTRANKS EMPTINESS, in both directions. A request that threw has told us nothing about
 * whether data exists, so reporting "nothing here" for a timeout is how an outage reads as a quiet
 * week — and it outranks `loading` too, so a failure cannot be hidden behind a spinner that never
 * resolves. `refused` outranks `failed` for the same reason one level up: it is the more specific
 * true statement, and the only one of the two that tells the reader what to do next.
 */
export function resourceState(opts: {
  loading: boolean
  error: ErrorNotice | null
  count: number | null
}): ResourceState {
  if (isRefusal(opts.error)) return 'refused'
  if (opts.error) return 'failed'
  if (opts.loading) return 'loading'
  if (opts.count === null) return 'loading'
  return opts.count > 0 ? 'ok' : 'empty'
}

export interface Resource<T> {
  state: ResourceState
  data: T | null
  error: ErrorNotice | null
  reload: () => void
}

/**
 * Run `load` on mount and on demand, and reduce the outcome to one of the five states.
 *
 * `count` exists because "empty" is a property of the DATA, not of the response: an object with an
 * empty list inside it is a 200 that should render the empty state. `/v1/issues?limit=3` really
 * does answer `{"issues":[]}` on this estate right now, and that is the single most likely thing
 * an operator will see on the first page — so it has to look like "no open issues" and not like a
 * panel that failed to draw.
 */
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  count: (data: T) => number,
  fallbackMessage: string,
  /**
   * The VALUES the question depends on — a filter, a path parameter, a pasted request id.
   *
   * ── Why this parameter exists, and why `load` is still not the dependency ─────────────────
   *
   * The template's version of this hook re-runs on `nonce` alone, and `load` is deliberately
   * excluded because most callers recreate it every render, which would make the effect a render
   * loop. That is correct for a screen with one fixed question, which is every screen the
   * template was written for.
   *
   * It is WRONG for a screen whose question changes, and every screen in this repository is one:
   * the events page filters by service and severity, the samples page by app and kind, and the
   * request lookup is nothing but a value in a box. With `[nonce]` as the only dependency the
   * request is never re-sent, and the console shows the PREVIOUS answer under the NEW label,
   * silently.
   *
   * On an error console that is the worst thing the screen can do. An operator narrowing the
   * event list to `severity=fatal` during an incident, and being shown the unfiltered list with
   * `fatal` selected above it, is being handed the wrong evidence with the right label on it —
   * and will act on it, because acting on it is the entire reason they opened this page.
   *
   * So the caller passes the values rather than the closure. `[nonce, ...deps]` re-runs on either,
   * the in-flight request is aborted by the existing cleanup, and `load` stays out of the array.
   */
  deps: readonly unknown[] = [],
): Resource<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ErrorNotice | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    load(controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return
        setData(value)
        setLoading(false)
      })
      .catch((err: unknown) => {
        // An abort is this component going away, not a failure. Rendering the failed state for it
        // is how a fast double-navigation leaves an error on a screen nobody is looking at.
        if (controller.signal.aborted) return
        setError(noticeFor(err, fallbackMessage))
        setLoading(false)
      })
    return () => controller.abort()
    // `load` is recreated every render by most callers, so it is deliberately not a dependency —
    // it would make this effect a render loop. `nonce` re-runs it on demand and `deps` re-runs it
    // when the QUESTION changes; see the note on the parameter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  return {
    state: resourceState({ loading, error, count: data === null ? null : count(data) }),
    data,
    error,
    reload,
  }
}
