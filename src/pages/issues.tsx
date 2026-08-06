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
    'the open issues could not be read',
    [limit],
  )

  const rows = issues.data?.issues ?? []
  const regressed = rows.filter((r) => r.status === 'regressed').length

  return (
    <section className="ln-page" aria-labelledby="issues-title">
      <header className="ln-page__head">
        <h1 className="ln-page__title" id="issues-title">
          Open issues
        </h1>
        <p className="ln-page__lede">
          Errors grouped by fingerprint, most recently seen first. Read from{' '}
          <code className="cf-num ln-code">GET /v1/issues</code>. Resolved issues are not in this
          list — Lantern excludes them at the query.
        </p>
        <div className="ln-filters" role="group" aria-label="How many issues to fetch">
          <label className="ln-filter">
            <span className="ln-filter__label">Limit</span>
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

      {issues.state === 'loading' && <Loading label="Reading the open issues" />}
      {issues.state === 'refused' && issues.error && (
        <Refused notice={issues.error} onSignIn={() => signIn()} />
      )}
      {issues.state === 'failed' && issues.error && (
        <Failed notice={issues.error} what="the open issues" onRetry={issues.reload} />
      )}
      {issues.state === 'empty' && (
        <Empty
          title="No open issues"
          hint={
            'Lantern answered with an empty list. Nothing in the estate is currently new, ' +
            'acknowledged or regressed — this is the healthy answer, not a panel that failed to ' +
            'load. Issues are kept for ninety days after they are resolved.'
          }
        />
      )}

      {issues.state === 'ok' && (
        <>
          {regressed > 0 && (
            <Note tone="warn">
              {regressed === 1 ? 'One issue has' : `${regressed} issues have`} regressed: resolved,
              and then seen again. Lantern stamps <code className="cf-num ln-code">regressed_at</code>{' '}
              in the same statement that moves the status, so the time below is when it came back
              rather than when it was first found.
            </Note>
          )}
          <table className="ln-table">
            <caption className="ln-table__caption">
              {rows.length} open {rows.length === 1 ? 'issue' : 'issues'}, most recently seen first
            </caption>
            <thead>
              <tr>
                <th scope="col">Status</th>
                <th scope="col">Severity</th>
                <th scope="col">Issue</th>
                <th scope="col">Service</th>
                <th scope="col">Occurrences</th>
                <th scope="col">Last seen</th>
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
                        missing="no stack frame — this issue was grouped without one"
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
                    <span className="ln-hint"> since first seen</span>
                  </td>
                  <td>
                    <When iso={issue.last_seen} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
