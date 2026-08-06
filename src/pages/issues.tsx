/**
 * The open issues — `GET /v1/issues?limit=N`.
 *
 * `listOpenIssues` (`lantern/src/issues.ts`) returns `new`, `acknowledged` and `regressed`
 * only, ordered by `last_seen` descending. There is no filter parameter on this route, so the only
 * control here is the limit, and it is a real one: it goes into `deps` and re-issues the request.
 *
 * ── THE EMPTY ANSWER IS THE ONE THIS PAGE IS MOST LIKELY TO GIVE ──────────────────────────────
 *
 * `GET /v1/issues?limit=3` answers `{"issues":[]}` on this estate right now. A healthy estate has
 * no open issues, so an operator's first impression of this console will very often be the empty
 * state — and if that state looks like a panel that failed to draw, the console has taught them in
 * one glance that it cannot be trusted. It says "no open issues" and names what that means.
 *
 * ── `regressed` is why the status column exists ───────────────────────────────────────────────
 *
 * `lantern/src/issues.ts`: the frozen table had one nullable `resolved_at`, so an occurrence
 * after a resolve bumped `last_seen` under a green label and nobody was told the fault came back.
 * The row that says `regressed` is the most important row this page can draw, which is why it
 * carries the loudest tone in `statusTone()` and why the count of them is stated above the table.
 */
import { useCallback, useState } from 'react'
import { Failed, Empty, Loading, Refused } from '../components/states.tsx'
import { Badge, Id, Maybe, Note, When } from '../components/tone.tsx'
import { useSession } from '../lib/auth.tsx'
import { count, severityTone, statusTone } from '../lib/format.ts'
import { listIssues, type IssuesReply } from '../lib/lantern.ts'
import { useResource } from '../lib/resource.ts'

const LIMITS = [25, 100, 500] as const

export function IssuesPage() {
  const { signIn } = useSession()
  const [limit, setLimit] = useState<number>(100)

  const load = useCallback((signal: AbortSignal) => listIssues(limit, signal), [limit])
  // `limit` is in `deps`, so changing it genuinely re-issues the request. Without it the table
  // would keep the previous rows under the new number — the previous answer with the new label on
  // it, which is the failure `lib/resource.ts` documents at length.
  const issues = useResource<IssuesReply>(
    load,
    (data) => data.issues.length,
    'Something in this bundle threw while reading the grouped faults, so Lantern never got a chance to answer.',
    [limit],
  )

  const rows = issues.data?.issues ?? []
  const regressed = rows.filter((r) => r.status === 'regressed').length

  return (
    <section className="ln-page" aria-labelledby="issues-title">
      <header className="ln-page__head">
        <h1 className="ln-page__title" id="issues-title">
          Grouped faults
        </h1>
        <p className="ln-page__lede">
          An issue is a pile of events that hash to one fingerprint. Lantern builds that hash from
          four things: the service, the error type, the message with its variable parts masked out,
          and the first stack frame belonging to our own code rather than to a dependency. Two
          crashes that differ only in a request id, a timestamp or a row count are therefore one row
          here instead of two.
        </p>
        <p className="ln-page__lede">
          Only faults get a fingerprint at all — anything logged at <code className="cf-num ln-code">error</code>{' '}
          or <code className="cf-num ln-code">fatal</code>, plus any line carrying a 5xx status.
          Ordinary request logging never becomes an issue. This list holds the three open states,{' '}
          <code className="cf-num ln-code">new</code>, <code className="cf-num ln-code">acknowledged</code>{' '}
          and <code className="cf-num ln-code">regressed</code>, and comes from{' '}
          <code className="cf-num ln-code">GET /v1/issues</code>.
        </p>
        <p className="ln-page__lede">
          An issue outlives the lines behind it. Every hour Lantern closes anything whose last
          occurrence has fallen outside the seven-day event window, marking it resolved by{' '}
          <code className="cf-num ln-code">system</code>, and deletes a resolved issue once that last
          occurrence passes ninety days. While an issue is open, nothing removes it. Both numbers are
          deploy settings — <code className="cf-num ln-code">LANTERN_EVENT_RETENTION_DAYS</code> and{' '}
          <code className="cf-num ln-code">LANTERN_ISSUE_RETENTION_DAYS</code> — and the service
          refuses to start if the second is smaller than the first.
        </p>
        <div className="ln-filters" role="group" aria-label="How many rows to ask Lantern for">
          <label className="ln-filter">
            <span className="ln-filter__label">Rows</span>
            <select
              className="ln-filter__input"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {LIMITS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {issues.state === 'loading' && <Loading label="Fetching the grouped faults" />}
      {issues.state === 'refused' && issues.error && (
        <Refused notice={issues.error} onSignIn={() => signIn()} />
      )}
      {issues.state === 'failed' && issues.error && (
        <Failed notice={issues.error} what="the grouped faults" onRetry={issues.reload} />
      )}
      {issues.state === 'empty' && (
        <Empty
          title="Nothing is open"
          hint={
            'Lantern answered, and the answer was zero rows. A working estate produces exactly ' +
            'this, so read it as a result rather than as a panel that failed to draw. To tell ' +
            'health apart from silence, look at the raw log lines: a full stream there with an ' +
            'empty list here means nothing has failed, while two empty lists mean no telemetry is ' +
            'arriving and the OTLP collector is what to check first.'
          }
        />
      )}

      {issues.state === 'ok' && (
        <>
          {regressed > 0 && (
            <Note tone="warn">
              {regressed === 1 ? 'One fault below came' : `${regressed} faults below came`} back
              after being closed. Lantern stamps{' '}
              <code className="cf-num ln-code">regressed_at</code> in the same statement that moves
              the status, so the time in the last column is when the fault returned — not when
              somebody first met it.
            </Note>
          )}
          {/*
            THE SCROLL BELONGS TO THE TABLE, NOT TO THE DOCUMENT.

            A six-column table of issue titles, service names and timestamps has a minimum width of
            roughly 580px and cannot be made narrower without truncating the one column an operator
            reads. On a 390px viewport that is 210px WIDER THAN THE PAGE, and with no container to
            absorb it the overflow was the document's: `<html>` scrolled sideways, taking the
            section navigation, the page heading and the filters with it, so an operator on a phone
            scrolled right to read a title and lost the tabs that get them back.

            Measured at 390x780 in headless Chromium against the built bundle behind this
            repository's own nginx.conf: `documentElement.scrollWidth - clientWidth` was 210 on
            this page and 3 on the other three. It is NOT a regression from the @cloudsforge/ui 1.1
            adoption — the same measurement on the commit before it is byte-identical — it is a
            defect this surface shipped with, found by driving the page at a phone width while
            checking for reflow the shared 16px body text might have caused.

            `overflow-x: auto` on a wrapper and NOT `display: block` on the `<table>` itself, which
            is the shorter version of this fix and the wrong one: a table set to `display: block`
            loses its table semantics in Firefox and Safari, and the rows an assistive technology
            would announce as "row 2 of 12, Service, micro-nimbus" become undifferentiated text.
            The wrapper keeps the element a table and gives the overflow somewhere to go.

            `tabIndex={0}` because a scroll container that only a mouse can reach is a WCAG 2.1
            failure (SC 2.1.1): keyboard readers must be able to scroll it, and a focusable region
            is how. `role="region"` with the caption's text as its label so the focus stop
            announces what it is rather than landing on an unnamed box.
          */}
          <div className="ln-tablewrap" tabIndex={0} role="region" aria-labelledby="issues-caption">
          <table className="ln-table">
            <caption className="ln-table__caption" id="issues-caption">
              {rows.length} grouped {rows.length === 1 ? 'fault' : 'faults'}, newest occurrence at
              the top
            </caption>
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Severity</th>
                <th scope="col">What broke</th>
                <th scope="col">Service</th>
                <th scope="col">Occurrences</th>
                <th scope="col">Last occurrence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((issue) => (
                <tr key={issue.fingerprint}>
                  <td>
                    <Badge tone={statusTone(issue.status)} />
                  </td>
                  <td>
                    <Badge tone={severityTone(issue.severity)} />
                  </td>
                  <td>
                    <span className="ln-issue__title">{issue.title}</span>
                    <span className="ln-issue__culprit">
                      <Maybe
                        value={issue.culprit}
                        missing="grouped without a stack frame, so there is no call site to name"
                      />
                    </span>
                    <span className="ln-issue__fp">
                      <Id value={issue.fingerprint} short />
                    </span>
                  </td>
                  <td>{issue.service}</td>
                  <td className="cf-num">
                    {count(issue.events)}
                    {/* A running total, never a count of surviving rows: events are pruned at
                        seven days and issues at ninety, so a count derived from the events table
                        would fall to zero for an issue that is still the estate's biggest problem
                        (`lantern/src/issues.ts`). */}
                    <span className="ln-hint"> counted since the first one, not from surviving rows</span>
                  </td>
                  <td>
                    <When iso={issue.last_seen} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </section>
  )
}
