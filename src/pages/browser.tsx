/**
 * The browser samples — `GET /v1/rum?app=&kind=&session=&limit=`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS PAGE IS THE FIRST THING IN THE ESTATE THAT HAS EVER READ `rum_samples`.
 *
 * The table was WRITE-ONLY for the whole life of the service: inserted by the ingest sink, deleted
 * by retention, and selected by nothing (`lantern/src/reads.ts:128-144`). A browser error could be
 * collected perfectly, stored perfectly, and be invisible to every human in the company — which is
 * worse than not collecting it, because it looks like coverage. `/v1/rum` and this page are the
 * two halves of fixing that, and they landed on the same night.
 *
 * Two consequences follow, and both are visible in the code below.
 *
 * ── 1. THE COLUMNS ARE NOT THE RECORD ─────────────────────────────────────────────────────────
 *
 * `rum_samples` has no `message`, no `stack` and no `type`. `obs.ts` puts all three into the
 * `attributes` jsonb bag because there is nowhere else for them to go. A samples table that renders
 * the columns and not the bag tells an operator that something called `error` happened on
 * `/dashboard` and NOTHING about what it was. So every row here can be expanded, and the expansion
 * is the bag: the type, the message, the stack, the page URL, the release and the context.
 *
 * ── 2. THE BAG WAS DOUBLE-ENCODED, AND THIS PAGE SAYS SO RATHER THAN LAUNDERING IT ────────────
 *
 * It was written as a JSON string inside `jsonb`. Verified fixed against the running service
 * before this page was written — `/v1/rum?limit=3` returns real objects — but rows written before
 * the fix are still in the table until retention takes them, and a service can regress. So
 * `readAttributes` parses a string ONCE and flags the row, and `EncodingNote` renders the flag
 * where the reader is looking. It is never silently coerced: silent coercion is what let the
 * defect live for months, and a client that quietly repairs a storage fault guarantees nobody ever
 * fixes it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useState } from 'react'
import { Failed, Empty, Loading, Refused } from '../components/states.tsx'
import { Badge, EncodingNote, Id, Maybe, Note, When } from '../components/tone.tsx'
import { useSession } from '../lib/auth.tsx'
import { kindTone, millis } from '../lib/format.ts'
import { RUM_KINDS, rumDetail, type RumReply, type RumRow, listRum } from '../lib/lantern.ts'
import { useResource } from '../lib/resource.ts'

export function BrowserPage() {
  const { signIn } = useSession()
  const [app, setApp] = useState('')
  const [kind, setKind] = useState('')
  const [session, setSession] = useState('')
  const [limit, setLimit] = useState(100)

  const load = useCallback(
    (signal: AbortSignal) => listRum({ app, kind, session, limit }, signal),
    [app, kind, session, limit],
  )
  const samples = useResource<RumReply>(
    load,
    (data) => data.samples.length,
    'the browser samples could not be read',
    [app, kind, session, limit],
  )

  const rows = samples.data?.samples ?? []
  const filtered = [app, kind, session].filter(Boolean).length > 0
  const mangled = rows.filter((r) => rumDetail(r.attributes).encoding !== 'object').length

  return (
    <section className="ln-page" aria-labelledby="rum-title">
      <header className="ln-page__head">
        <h1 className="ln-page__title" id="rum-title">
          Browser samples
        </h1>
        <p className="ln-page__lede">
          What the estate's frontends reported about themselves — page loads, paints, fetch
          failures and uncaught errors. Read from{' '}
          <code className="cf-num ln-code">GET /v1/rum</code>. Samples expire after thirty days and
          carry no identity: there is no user column, and{' '}
          <code className="cf-num ln-code">session</code> is a per-tab random string that dies with
          the tab.
        </p>
        <div className="ln-filters" role="group" aria-label="Filter the browser samples">
          <label className="ln-filter">
            <span className="ln-filter__label">App</span>
            <input
              className="ln-filter__input"
              type="text"
              value={app}
              placeholder="any app"
              onChange={(e) => setApp(e.target.value.trim())}
            />
          </label>
          <label className="ln-filter">
            <span className="ln-filter__label">Kind</span>
            <select
              className="ln-filter__input"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="">any kind</option>
              {RUM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="ln-filter">
            <span className="ln-filter__label">Session</span>
            <input
              className="ln-filter__input ln-filter__input--wide cf-num"
              type="text"
              value={session}
              placeholder="one tab's random id"
              onChange={(e) => setSession(e.target.value.trim())}
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
      </header>

      {samples.state === 'loading' && <Loading label="Reading the browser samples" />}
      {samples.state === 'refused' && samples.error && (
        <Refused notice={samples.error} onSignIn={() => signIn()} />
      )}
      {samples.state === 'failed' && samples.error && (
        <Failed notice={samples.error} what="the browser samples" onRetry={samples.reload} />
      )}
      {samples.state === 'empty' && (
        <Empty
          title={filtered ? 'No samples match this filter' : 'No browser samples'}
          hint={
            filtered
              ? 'Lantern answered with an empty list for exactly the filter shown above.'
              : 'Lantern has stored no browser samples in its thirty-day window. If a frontend ' +
                'should be reporting, check that its obs client posts to /ingest/client with a ' +
                '`samples` envelope and a `kind` from the six the column accepts — every one of ' +
                'those three was wrong at once, and the answer was a cheerful 202.'
          }
        />
      )}

      {samples.state === 'ok' && (
        <>
          {mangled > 0 && (
            <Note tone="warn">
              {mangled} of {rows.length} rows did not arrive with an object in{' '}
              <code className="cf-num ln-code">attributes</code>. Each one is flagged where it
              appears. This is a fact about the stored data, not about this page.
            </Note>
          )}
          <p className="ln-hint ln-page__count">
            {rows.length} {rows.length === 1 ? 'sample' : 'samples'}
            {filtered ? ', matching the filter above' : ', unfiltered'} — newest first. Expand a row
            for the fields that have no column.
          </p>
          <ul className="ln-samples">
            {rows.map((row) => (
              <SampleRow key={row.id} row={row} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/**
 * One sample, with the bag underneath it.
 *
 * `<details>` rather than a state hook: an operator scanning for the error among forty page loads
 * wants several rows open at once, and the browser's own disclosure keeps them open across a
 * re-render. The summary carries everything a scan needs so that expanding is a choice rather than
 * the only way to read the row.
 */
function SampleRow({ row }: { row: RumRow }) {
  const detail = rumDetail(row.attributes)
  // The headline is the bag's message where there is one — which for an error is the ONLY place
  // it exists. Falling back to the route is honest: a page-load sample genuinely has no message.
  const headline = detail.message ?? row.route ?? 'no message and no route on this sample'

  return (
    <li className="ln-sample">
      <details>
        <summary className="ln-sample__summary">
          <Badge tone={kindTone(row.kind)} />
          <span className="ln-sample__app">{row.app}</span>
          <span className="ln-sample__headline">{headline}</span>
          <When iso={row.ts} />
        </summary>
        <div className="ln-sample__body">
          <EncodingNote encoding={detail.encoding} />

          <dl className="ln-facts">
            <div className="ln-fact">
              <dt className="ln-fact__label">Type</dt>
              <dd className="ln-fact__value">
                {/* No column for this. It is in the bag, and it is the classifier the caller
                    actually used — `kind` is the six-value CHECK-constrained label. */}
                <Maybe value={detail.type} missing="no `type` in attributes" />
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Message</dt>
              <dd className="ln-fact__value">
                <Maybe value={detail.message} missing="no `message` in attributes" />
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Route</dt>
              <dd className="ln-fact__value">
                <Maybe value={row.route} missing="no route recorded" />
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Page URL</dt>
              <dd className="ln-fact__value">
                <Maybe value={detail.url} missing="no `url` in attributes" />
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Duration</dt>
              <dd className="ln-fact__value">
                <Maybe value={millis(row.value_ms)} missing="this kind measures nothing" />
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">HTTP status</dt>
              <dd className="ln-fact__value">
                <Maybe
                  value={row.status_code === null ? null : String(row.status_code)}
                  missing="not a response"
                />
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Request id</dt>
              <dd className="ln-fact__value">
                {row.request_id ? (
                  <Id value={row.request_id} />
                ) : (
                  <Maybe
                    value={null}
                    missing="none — nothing server-side handled this, so there is no id to join on"
                  />
                )}
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Trace id</dt>
              <dd className="ln-fact__value">
                {row.trace_id ? (
                  <Id value={row.trace_id} />
                ) : (
                  <Maybe value={null} missing="none" />
                )}
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Session</dt>
              <dd className="ln-fact__value">
                {row.session ? <Id value={row.session} short /> : <Maybe value={null} missing="none" />}
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Release</dt>
              <dd className="ln-fact__value">
                <Maybe value={detail.release} missing="no `release` in attributes" />
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">User agent</dt>
              <dd className="ln-fact__value">
                <Maybe value={detail.userAgent} missing="no `userAgent` in attributes" />
              </dd>
            </div>
          </dl>

          {detail.stack !== null && (
            <div className="ln-sample__stack">
              <h3 className="ln-sample__stackTitle">Stack</h3>
              {/* Pre-wrapped, never truncated. A stack that has to be scrolled horizontally is a
                  stack nobody reads past the first frame of. */}
              <pre className="cf-num ln-stack">{detail.stack}</pre>
            </div>
          )}

          {detail.context !== null && (
            <div className="ln-sample__context">
              <h3 className="ln-sample__stackTitle">Context</h3>
              <dl className="ln-facts ln-facts--tight">
                {Object.entries(detail.context).map(([key, value]) => (
                  <div className="ln-fact" key={key}>
                    <dt className="ln-fact__label">{key}</dt>
                    <dd className="ln-fact__value">
                      {/* JSON.stringify rather than String(): a nested object rendered with
                          String() is `[object Object]`, which is precisely the shape of failure
                          this whole page exists to have stopped. */}
                      <code className="cf-num">
                        {typeof value === 'string' ? value : JSON.stringify(value)}
                      </code>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </details>
    </li>
  )
}
