/**
 * The raw event stream — `GET /v1/events?service=&severity=&traceId=&limit=`.
 *
 * `listEvents` (`lantern/src/reads.ts`) builds the where-clause from whichever of the three
 * filters are present. Note the asymmetry, because it is visible on this page: `service` and
 * `severity` are matched verbatim, but `traceId` is only applied if it matches
 * `/^[0-9a-f]{32}$/` — a 31-character paste is silently ignored and the unfiltered stream comes
 * back. That is the service's behaviour and this page cannot change it, so it VALIDATES THE SAME
 * SHAPE IN THE BROWSER and says so, rather than letting an operator read the whole estate's log
 * under a trace-id label.
 *
 * Every filter value is in the `deps` array of `useResource`. That is the difference between a
 * filter and a decoration; the long note on that parameter in `lib/resource.ts` explains what
 * happens when it is missing, and why it is worse here than anywhere else.
 */
import { useCallback, useState } from 'react'
import { Failed, Empty, Loading, Refused } from '../components/states.tsx'
import { Badge, Id, Maybe, Note, When } from '../components/tone.tsx'
import { useSession } from '../lib/auth.tsx'
import { millis, severityTone } from '../lib/format.ts'
import { listEvents, type EventsReply } from '../lib/lantern.ts'
import { useResource } from '../lib/resource.ts'

/** `micro-lantern` stores whatever severity it is sent; these are the ones worth offering. */
const SEVERITIES = ['fatal', 'error', 'warn', 'info', 'debug'] as const

/** The exact shape `listEvents` requires before it will apply the filter at all. */
const TRACE_ID = /^[0-9a-f]{32}$/

export function EventsPage() {
  const { signIn } = useSession()
  const [service, setService] = useState('')
  const [severity, setSeverity] = useState('')
  const [traceId, setTraceId] = useState('')
  const [limit, setLimit] = useState(100)

  // A trace id that will not be applied is not sent. Sending it would produce the unfiltered
  // stream under a filtered label — the exact failure this repository refuses to ship.
  const traceIdApplied = traceId === '' || TRACE_ID.test(traceId)
  const sentTraceId = TRACE_ID.test(traceId) ? traceId : undefined

  const load = useCallback(
    (signal: AbortSignal) =>
      listEvents({ service, severity, traceId: sentTraceId, limit }, signal),
    [service, severity, sentTraceId, limit],
  )
  const events = useResource<EventsReply>(
    load,
    (data) => data.events.length,
    'Something in this bundle threw while reading the log lines, so Lantern never got a chance to answer.',
    [service, severity, sentTraceId, limit],
  )

  const rows = events.data?.events ?? []
  const filtered = [service, severity, sentTraceId].filter(Boolean).length > 0

  return (
    <section className="ln-page" aria-labelledby="events-title">
      <header className="ln-page__head">
        <h1 className="ln-page__title" id="events-title">
          Raw log lines
        </h1>
        <p className="ln-page__lede">
          One row per record, newest at the top, with no grouping of any kind. An event is a single
          log line with its useful parts lifted into columns: the time, the service that wrote it,
          the door it came in by, the message, and the request and trace ids that join it to
          everything else. Faults among these are also filed under a fingerprint on the grouped
          list; every other line exists only here. Read from{' '}
          <code className="cf-num ln-code">GET /v1/events</code>.
        </p>
        <p className="ln-page__lede">
          Severity is one of six words — <code className="cf-num ln-code">trace</code>,{' '}
          <code className="cf-num ln-code">debug</code>, <code className="cf-num ln-code">info</code>,{' '}
          <code className="cf-num ln-code">warn</code>, <code className="cf-num ln-code">error</code>,{' '}
          <code className="cf-num ln-code">fatal</code> — worked out from the OTLP severity number
          as the record is ingested. A producer that sets no severity number lands on{' '}
          <code className="cf-num ln-code">info</code> and never on{' '}
          <code className="cf-num ln-code">error</code>, so a forgetful service cannot manufacture an
          issue per line.
        </p>
        <p className="ln-page__lede">
          A line is deleted seven days after its own timestamp, by a sweep that runs hourly; the
          window is the deploy's <code className="cf-num ln-code">LANTERN_EVENT_RETENTION_DAYS</code>.
          Nothing is archived on the way out. What survives is what was derived: the hourly counts
          per service and severity, which Lantern keeps for four hundred days, and the issues built
          from the faults. The line itself is gone.
        </p>
        <div className="ln-filters" role="group" aria-label="Filter the event stream">
          <label className="ln-filter">
            <span className="ln-filter__label">Service</span>
            <input
              className="ln-filter__input"
              type="text"
              value={service}
              placeholder="every service"
              onChange={(e) => setService(e.target.value.trim())}
            />
          </label>
          <label className="ln-filter">
            <span className="ln-filter__label">Severity</span>
            <select
              className="ln-filter__input"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">every severity</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="ln-filter">
            <span className="ln-filter__label">Trace id</span>
            <input
              className="ln-filter__input ln-filter__input--wide cf-num"
              type="text"
              value={traceId}
              placeholder="32 hexadecimal characters"
              aria-invalid={!traceIdApplied}
              onChange={(e) => setTraceId(e.target.value.trim().toLowerCase())}
            />
          </label>
          <label className="ln-filter">
            <span className="ln-filter__label">Rows</span>
            <select
              className="ln-filter__input"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {[25, 100, 500, 1000].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!traceIdApplied && (
          <Note tone="warn">
            Lantern will only match a trace id that is exactly 32 hexadecimal characters, and this
            one is {traceId.length}. A short id is not an error there: the clause is dropped and the
            whole stream comes back wearing a label that claims otherwise. So nothing has been sent.
            Finish the id or empty the box; until then the rows below carry no trace filter at all.
          </Note>
        )}
      </header>

      {events.state === 'loading' && <Loading label="Fetching the log lines" />}
      {events.state === 'refused' && events.error && (
        <Refused notice={events.error} onSignIn={() => signIn()} />
      )}
      {events.state === 'failed' && events.error && (
        <Failed notice={events.error} what="the log lines" onRetry={events.reload} />
      )}
      {events.state === 'empty' && (
        <Empty
          title={filtered ? 'Nothing matched' : 'The stream is empty'}
          hint={
            filtered
              ? 'Lantern ran the fields above exactly as they are set and found no line. Loosen ' +
                'one of them and the request goes out again on its own — service and severity are ' +
                'matched character for character, so a near miss returns nothing rather than a ' +
                'complaint.'
              : 'Lantern is holding no line at all inside its seven-day window. That is a real ' +
                'answer rather than a failure, but no estate stays quiet for a week. If traffic ' +
                'was expected, the OTLP collector sits between the services and this page, and it ' +
                'is the thing to look at before anything here.'
          }
        />
      )}

      {/*
        The scroll belongs to the table, not to the document — the same wrapper, for the same
        measured reason, as `pages/issues.tsx`, whose comment carries the full argument and the
        numbers. Nine columns here rather than six, so this table is the wider of the two.

        The comment sits ABOVE the conditional rather than immediately inside it, and that is not a
        style preference: a braced JSX comment as the first thing after `{cond && (` does not
        compile. Inside those parentheses the parser is reading an EXPRESSION, where a `{` opens an
        object literal rather than a comment, and the error it produces — "Expression expected",
        pointing at the closing brace of the component sixty lines below — names neither the
        comment nor the line it is on. `pages/issues.tsx` places the same comment inside a fragment,
        which IS children position, and compiles.
      */}
      {events.state === 'ok' && (
        <div className="ln-tablewrap" tabIndex={0} role="region" aria-labelledby="events-caption">
        <table className="ln-table">
          <caption className="ln-table__caption" id="events-caption">
            {rows.length} {rows.length === 1 ? 'line' : 'lines'}
            {filtered ? ', drawn under the fields above' : ', with no filter applied'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Severity</th>
              <th scope="col">Service</th>
              <th scope="col">Message</th>
              <th scope="col">Request id</th>
              <th scope="col">Latency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((event) => (
              <tr key={event.id}>
                <td>
                  <When iso={event.ts} />
                </td>
                <td>
                  <Badge tone={severityTone(event.severity)} />
                </td>
                <td>
                  {event.service}
                  <span className="ln-hint"> via {event.source}</span>
                </td>
                <td>
                  <span className="ln-event__msg">{event.msg}</span>
                  {event.route && <span className="ln-hint">{event.route}</span>}
                  {event.err_type && <span className="ln-event__type">{event.err_type}</span>}
                </td>
                <td>
                  {/* The id an operator pastes into the lookup page. Rendered whole and
                      selectable, never truncated in the DOM. */}
                  {event.request_id ? (
                    <Id value={event.request_id} />
                  ) : (
                    <Maybe
                      value={null}
                      missing="none: written outside any request, so there is nothing to join on"
                    />
                  )}
                </td>
                <td className="cf-num">
                  <Maybe
                    value={millis(event.latency_ms)}
                    missing="nothing was timed here"
                  />
                  {event.status_code !== null && (
                    <span className="ln-hint">HTTP {event.status_code}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </section>
  )
}
