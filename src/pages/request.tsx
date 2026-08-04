/**
 * The request-id lookup — `GET /v1/requests/:requestId`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE WORKFLOW THE WHOLE SERVICE IS SHAPED AROUND.
 *
 * `13-operational-model.md:73-78`, quoted verbatim in `lantern/src/reads.ts:6-8`: "a user quotes
 * an id from an error screen and an operator pastes it into one search box". This is that box. The
 * partial `events_request_id_idx` exists for this query and `traceForRequestId` exists to turn the
 * paste into a jump to the trace.
 *
 * It is also the page that closes a loop inside this very repository: every failure state in this
 * console prints the request id Lantern gave it, and this is where that id is spent.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── The id lives in the QUERY STRING, and that is a routing decision ──────────────────────────
 *
 * `/request?id=…`, not `/request/:id`. A path parameter would make this a route with children, and
 * `nginx.conf`'s header records what this estate does with those: the prefix form
 * `^/(request)(/|$)` matches `/request/anything/at/all` and serves the not-found screen with a
 * 200 — the exact defect the enumeration exists to prevent, reintroduced by the convenience of a
 * path parameter. A query string keeps one exact shape per route.
 *
 * It is a URL parameter rather than component state because a lookup is the thing an operator
 * pastes into chat. `?id=…` is shareable and survives a refresh; a `useState` box does not.
 *
 * ── An unparseable id comes back EMPTY, not as an error ───────────────────────────────────────
 *
 * `eventsByRequestId` (`lantern/src/reads.ts:54-60`) tests the id against
 * `/^[A-Za-z0-9._:-]{1,128}$/` and returns no rows if it fails — it does not 400. So a paste with
 * a stray quote in it is indistinguishable, in the response, from a real id with no events. This
 * page therefore applies the same test in the browser and says which of the two the reader is
 * looking at, because "no events for this request" and "that is not a request id" are different
 * facts and only one of them means the search is over.
 */
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Failed, Empty, Loading, Refused } from '../components/states.tsx'
import { Badge, Id, Maybe, Note, When } from '../components/tone.tsx'
import { useSession } from '../lib/auth.tsx'
import { millis, severityTone } from '../lib/format.ts'
import { requestLookup, type RequestReply } from '../lib/lantern.ts'
import { useResource } from '../lib/resource.ts'

/** The same shape the service applies before it will look anything up. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/

export function RequestPage() {
  const { signIn } = useSession()
  const [params, setParams] = useSearchParams()
  const id = params.get('id') ?? ''
  const usable = SAFE_REQUEST_ID.test(id)

  const load = useCallback(
    (signal: AbortSignal) =>
      usable
        ? requestLookup(id, signal)
        : // Nothing is asked for an id the service would refuse to match. Returning the empty
          // answer keeps the hook's four states honest without inventing a response.
          Promise.resolve<RequestReply>({ requestId: id, traceId: null, traceUrl: null, events: [] }),
    [id, usable],
  )
  const lookup = useResource<RequestReply>(
    load,
    (data) => data.events.length,
    'the request could not be looked up',
    [id, usable],
  )

  const events = lookup.data?.events ?? []

  return (
    <section className="ln-page" aria-labelledby="request-title">
      <header className="ln-page__head">
        <h1 className="ln-page__title" id="request-title">
          Request lookup
        </h1>
        <p className="ln-page__lede">
          Paste the request id from an error screen. Lantern returns every log line that carried it
          — across every service that touched the request — and the trace it belongs to. Read from{' '}
          <code className="cf-num ln-code">GET /v1/requests/:requestId</code>.
        </p>
        <form
          className="ln-lookup"
          onSubmit={(e) => e.preventDefault()}
          role="search"
          aria-label="Look up a request id"
        >
          <label className="ln-filter ln-filter--grow">
            <span className="ln-filter__label">Request id</span>
            <input
              className="ln-filter__input ln-filter__input--wide cf-num"
              type="text"
              value={id}
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. 01JYQ4Z8N2K7B3QT"
              aria-invalid={id !== '' && !usable}
              // Replaces rather than pushes: an operator correcting a typo character by character
              // should not have to press Back sixteen times to leave the page.
              onChange={(e) =>
                setParams(e.target.value ? { id: e.target.value.trim() } : {}, { replace: true })
              }
            />
          </label>
        </form>
        {id !== '' && !usable && (
          <Note tone="warn">
            That is not a shape Lantern will look up. The service matches{' '}
            <code className="cf-num ln-code">[A-Za-z0-9._:-]</code>, between 1 and 128 characters
            (<code className="cf-num ln-code">lantern/src/reads.ts:51</code>), and returns no rows
            for anything else — without an error, which is why this page checks rather than letting
            an empty answer look like a finished search. Nothing has been requested.
          </Note>
        )}
      </header>

      {id === '' && (
        <Empty
          title="Nothing looked up yet"
          hint={
            'Every failure state in this console prints the request id Lantern gave it, and every ' +
            'error screen in the estate shows the same id to the person who hit it. This is where ' +
            'it is spent.'
          }
        />
      )}

      {id !== '' && (
        <>
          {lookup.state === 'loading' && <Loading label={`Looking up ${id}`} />}
          {lookup.state === 'refused' && lookup.error && (
            <Refused notice={lookup.error} onSignIn={() => signIn()} />
          )}
          {lookup.state === 'failed' && lookup.error && (
            <Failed
              notice={lookup.error}
              what={`the events for request ${id}`}
              onRetry={lookup.reload}
            />
          )}
          {lookup.state === 'empty' && usable && (
            <Empty
              title={`No events carry the request id ${id}`}
              hint={
                'The id is a shape Lantern accepts and it asked. Either nothing logged under it, ' +
                'or the events have aged out — they are pruned at seven days, while the issues ' +
                'they were grouped into are kept for ninety. The issues list may still show it.'
              }
            />
          )}

          {lookup.state === 'ok' && lookup.data && (
            <>
              <dl className="ln-facts ln-facts--head">
                <div className="ln-fact">
                  <dt className="ln-fact__label">Request</dt>
                  <dd className="ln-fact__value">
                    <Id value={lookup.data.requestId} />
                  </dd>
                </div>
                <div className="ln-fact">
                  <dt className="ln-fact__label">Trace</dt>
                  <dd className="ln-fact__value">
                    {lookup.data.traceId ? (
                      <Id value={lookup.data.traceId} />
                    ) : (
                      <Maybe
                        value={null}
                        missing="no trace id on any of these events — the request was not sampled"
                      />
                    )}
                  </dd>
                </div>
                <div className="ln-fact">
                  <dt className="ln-fact__label">Trace link</dt>
                  <dd className="ln-fact__value">
                    {lookup.data.traceUrl ? (
                      <a
                        className="ln-link"
                        href={lookup.data.traceUrl}
                        rel="noreferrer noopener"
                        target="_blank"
                      >
                        Open the trace
                      </a>
                    ) : (
                      // Null means the deploy configured no template (`traceUrl`,
                      // `lantern/src/reads.ts:80-83`) — an absent link rather than a broken one.
                      <Maybe
                        value={null}
                        missing="this deploy has no trace URL template configured, so there is no link to build"
                      />
                    )}
                  </dd>
                </div>
              </dl>

              <table className="ln-table">
                <caption className="ln-table__caption">
                  {events.length} {events.length === 1 ? 'event' : 'events'} carried this request
                  id, newest first
                </caption>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Severity</th>
                    <th scope="col">Service</th>
                    <th scope="col">Message</th>
                    <th scope="col">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <When iso={event.ts} />
                      </td>
                      <td>
                        <Badge tone={severityTone(event.severity)} />
                      </td>
                      <td>
                        {event.service}
                        <span className="ln-hint">via {event.source}</span>
                      </td>
                      <td>
                        <span className="ln-event__msg">{event.msg}</span>
                        {event.route && <span className="ln-hint">{event.route}</span>}
                        {event.err_type && <span className="ln-event__type">{event.err_type}</span>}
                      </td>
                      <td className="cf-num">
                        <Maybe value={millis(event.latency_ms)} missing="not timed" />
                        {event.status_code !== null && (
                          <span className="ln-hint">HTTP {event.status_code}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </section>
  )
}
