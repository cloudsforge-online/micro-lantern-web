/**
 * The request-id lookup — `GET /v1/requests/:requestId`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE WORKFLOW THE WHOLE SERVICE IS SHAPED AROUND.
 *
 * `13-operational-model.md`, quoted verbatim in `lantern/src/reads.ts`: "a user quotes
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
 * `eventsByRequestId` (`lantern/src/reads.ts`) tests the id against
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
    'Something in this bundle threw while looking the id up, so Lantern never got a chance to answer.',
    [id, usable],
  )

  const events = lookup.data?.events ?? []

  return (
    <section className="ln-page" aria-labelledby="request-title">
      <header className="ln-page__head">
        <h1 className="ln-page__title" id="request-title">
          Trace one request
        </h1>
        <p className="ln-page__lede">
          Every service in the estate stamps one id on each line it writes while handling a call,
          and the same id is printed on the screen the user was looking at when it went wrong. Drop
          it in the box and Lantern gives back each line that carried it, newest first, no matter
          which service wrote it. That is a whole request end to end, in the order it fell over.
        </p>
        <p className="ln-page__lede">
          The trace id comes back alongside it, taken from the most recent line that had one, and
          becomes a link when the deploy has a tracer URL template configured. Read from{' '}
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
            Lantern will only look up an id built from{' '}
            <code className="cf-num ln-code">[A-Za-z0-9._:-]</code>, between 1 and 128 characters
            long. Anything else comes back as zero rows and no complaint, which looks identical to a
            real id that logged nothing — so the shape is checked here first. Nothing has been asked
            of the service.
          </Note>
        )}
      </header>

      {id === '' && (
        <Empty
          title="Waiting for an id"
          hint={
            'Every failure on this console prints the request id Lantern handed it, and so does ' +
            'every error screen the estate shows a user. That string is what this box is for: one ' +
            'paste, and the whole path the call took becomes readable.'
          }
        />
      )}

      {id !== '' && (
        <>
          {lookup.state === 'loading' && <Loading label={`Chasing ${id} across the estate`} />}
          {lookup.state === 'refused' && lookup.error && (
            <Refused notice={lookup.error} onSignIn={() => signIn()} />
          )}
          {lookup.state === 'failed' && lookup.error && (
            <Failed
              notice={lookup.error}
              what={`the lines written under ${id}`}
              onRetry={lookup.reload}
            />
          )}
          {lookup.state === 'empty' && usable && (
            <Empty
              title={`Nothing was logged under ${id}`}
              hint={
                'The id is a shape Lantern accepts, and it did go and look. Two things produce ' +
                'this answer: no service ever wrote a line under that id, or the lines have aged ' +
                'past the seven-day event window. If it is the second, the fault may still be on ' +
                'the grouped list — an issue outlives the lines it was built from, and it keeps ' +
                'the trace id from the first time it happened.'
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
                        missing="not one of these lines carried a trace id, so the request went untraced"
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
                        Open it in the tracer
                      </a>
                    ) : (
                      // Null means the deploy configured no template (`traceUrl`,
                      // `lantern/src/reads.ts`) — an absent link rather than a broken one.
                      <Maybe
                        value={null}
                        missing="no tracer URL template is set on this deploy, so there is nothing to link to — an absent link beats a broken one"
                      />
                    )}
                  </dd>
                </div>
              </dl>

              <table className="ln-table">
                <caption className="ln-table__caption">
                  {events.length} {events.length === 1 ? 'line' : 'lines'} carried this id, newest
                  first, across every service that touched the request
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
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
                        <Maybe value={millis(event.latency_ms)} missing="nothing timed" />
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
