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
    'the event stream could not be read',
    [service, severity, sentTraceId, limit],
  )

  const rows = events.data?.events ?? []
  const filtered = [service, severity, sentTraceId].filter(Boolean).length > 0

  return (
    <section className="ln-page" aria-labelledby="events-title">
      <header className="ln-page__head">
        <h1 className="ln-page__title" id="events-title">
          Events
        </h1>
        <p className="ln-page__lede">
          The raw log lines Lantern has ingested, newest first. Read from{' '}
          <code className="cf-num ln-code">GET /v1/events</code>. Events are pruned at seven days;
          the issues they were grouped into are kept for ninety.
        </p>
        <div className="ln-filters" role="group" aria-label="Filter the event stream">
          <label className="ln-filter">
            <span className="ln-filter__label">Service</span>
            <input
              className="ln-filter__input"
              type="text"
              value={service}
              placeholder="any service"
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
              <option value="">any severity</option>
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
              placeholder="32 hex characters"
              aria-invalid={!traceIdApplied}
              onChange={(e) => setTraceId(e.target.value.trim().toLowerCase())}
            />
          </label>
          <label className="ln-filter">
            <span className="ln-filter__label">Limit</span>
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
            A trace id is 32 hexadecimal characters; this one is {traceId.length}. Lantern would
            ignore it and return the unfiltered stream (`lantern/src/reads.ts`), so it has
            not been sent — the rows below are NOT filtered by trace. Finish the id, or clear it.
          </Note>
        )}
      </header>

      {events.state === 'loading' && <Loading label="Reading the event stream" />}
      {events.state === 'refused' && events.error && (
        <Refused notice={events.error} onSignIn={() => signIn()} />
      )}
      {events.state === 'failed' && events.error && (
        <Failed notice={events.error} what="the event stream" onRetry={events.reload} />
      )}
      {events.state === 'empty' && (
        <Empty
          title={filtered ? 'No events match this filter' : 'No events'}
          hint={
            filtered
              ? 'Lantern answered with an empty list for exactly the filter shown above. Widen it ' +
                'and the request is re-sent.'
              : 'Lantern has no events at all in its seven-day window. That is an answer, not a ' +
                'failure — but if you expected traffic, the collector rather than this page is ' +
                'the thing to check.'
          }
        />
      )}

      {events.state === 'ok' && (
        <table className="ln-table">
          <caption className="ln-table__caption">
            {rows.length} {rows.length === 1 ? 'event' : 'events'}
            {filtered ? ', matching the filter above' : ', unfiltered'}
          </caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Severity</th>
              <th scope="col">Service</th>
              <th scope="col">Message</th>
              <th scope="col">Request</th>
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
                    <Maybe value={null} missing="no request id — not emitted inside a request" />
                  )}
                </td>
                <td className="cf-num">
                  <Maybe
                    value={millis(event.latency_ms)}
                    missing="not a timed operation"
                  />
                  {event.status_code !== null && (
                    <span className="ln-hint">HTTP {event.status_code}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
