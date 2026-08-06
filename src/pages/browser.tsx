/**
 * The browser samples — `GET /v1/rum?app=&kind=&session=&limit=`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS PAGE IS THE FIRST THING IN THE ESTATE THAT HAS EVER READ `rum_samples`.
 *
 * The table was WRITE-ONLY for the whole life of the service: inserted by the ingest sink, deleted
 * by retention, and selected by nothing (`lantern/src/reads.ts`). A browser error could be
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
    'Something in this bundle threw while reading the browser reports, so Lantern never got a chance to answer.',
    [app, kind, session, limit],
  )

  const rows = samples.data?.samples ?? []
  const filtered = [app, kind, session].filter(Boolean).length > 0
  const mangled = rows.filter((r) => rumDetail(r.attributes).encoding !== 'object').length

  return (
    <section className="ln-page" aria-labelledby="rum-title">
      <header className="ln-page__head">
        <h1 className="ln-page__title" id="rum-title">
          Reports from the browser
        </h1>
        <p className="ln-page__lede">
          Instrumented pages post two sorts of thing here. Faults: an exception nothing caught, a
          promise that rejected with no handler waiting, a request that came back unusable. And
          timing: how long a navigation took, when the first pixel of content appeared, and when the
          largest element did. Six kinds in total, and the column holding them accepts nothing else,
          so a page reporting under a name Lantern does not know is turned away at the door rather
          than filed somewhere odd.
        </p>
        <p className="ln-page__lede">
          There is no person in this data and no column that could hold one. A{' '}
          <code className="cf-num ln-code">userId</code> sent by a page is thrown away before the
          insert. Credentials matching Lantern's redaction rules are swapped for a fixed marker
          while the record is still in memory, so a token written into a message never reaches the
          disk. And <code className="cf-num ln-code">session</code> is a random string minted per
          browser tab, which dies when the tab does — it stitches two reports from one visit
          together and names nobody.
        </p>
        <p className="ln-page__lede">
          Read from <code className="cf-num ln-code">GET /v1/rum</code>. A report is deleted thirty
          days after it arrives, under the deploy's{' '}
          <code className="cf-num ln-code">LANTERN_RUM_RETENTION_DAYS</code>. Nothing summarises it
          first, so what ages out is gone for good.
        </p>
        <div className="ln-filters" role="group" aria-label="Narrow the browser reports">
          <label className="ln-filter">
            <span className="ln-filter__label">App</span>
            <input
              className="ln-filter__input"
              type="text"
              value={app}
              placeholder="every app"
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
              <option value="">every kind</option>
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
              placeholder="paste a tab id to follow one visit"
              onChange={(e) => setSession(e.target.value.trim())}
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
      </header>

      {samples.state === 'loading' && <Loading label="Fetching the browser reports" />}
      {samples.state === 'refused' && samples.error && (
        <Refused notice={samples.error} onSignIn={() => signIn()} />
      )}
      {samples.state === 'failed' && samples.error && (
        <Failed notice={samples.error} what="the browser reports" onRetry={samples.reload} />
      )}
      {samples.state === 'empty' && (
        <Empty
          title={filtered ? 'Nothing matched' : 'No browser reports stored'}
          hint={
            filtered
              ? 'Lantern ran the fields above and came back with nothing. Kind is compared against ' +
                'the six values the column accepts, so a spelling that is close returns zero rows ' +
                'rather than a complaint.'
              : 'Nothing has reached the sink inside its thirty-day window. An instrumented page ' +
                'posts a timing report on every navigation, so quiet here is almost never health. ' +
                'Three things stop one landing. The sink stays shut unless the deploy names the ' +
                'posting origin in its allowlist. A body carrying an `events` array is refused ' +
                'with a 400 naming the mistake, because the key read here is `samples`. And an ' +
                'entry whose `kind` is outside the six is dropped by itself — the batch still ' +
                'answers 202, with `stored: 0` and the reason in the body, which is the one that ' +
                'hides longest.'
          }
        />
      )}

      {samples.state === 'ok' && (
        <>
          {mangled > 0 && (
            <Note tone="warn">
              {mangled} of these {rows.length} rows carried something other than an object in{' '}
              <code className="cf-num ln-code">attributes</code>. Each is marked where it appears.
              The fault is in what was stored, not in how this page reads it, and repairing it
              quietly here is how it would survive another six months.
            </Note>
          )}
          <p className="ln-hint ln-page__count">
            {rows.length} {rows.length === 1 ? 'report' : 'reports'}, newest at the top
            {filtered ? ', drawn under the fields above' : ', with no filter applied'}. Open a row
            for the fields that have no column of their own — the type, the message and the stack.
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
  const headline = detail.message ?? row.route ?? 'this report carries neither a message nor a route'

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
                <Maybe value={detail.type} missing="the page sent no `type` of its own" />
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Message</dt>
              <dd className="ln-fact__value">
                <Maybe value={detail.message} missing="nothing in `message` — a timing report has none to send" />
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Route</dt>
              <dd className="ln-fact__value">
                <Maybe value={row.route} missing="the page did not say which route it was on" />
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Page URL</dt>
              <dd className="ln-fact__value">
                <Maybe value={detail.url} missing="no page address came with it" />
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Duration</dt>
              <dd className="ln-fact__value">
                <Maybe value={millis(row.value_ms)} missing="this kind carries no duration" />
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">HTTP status</dt>
              <dd className="ln-fact__value">
                <Maybe
                  value={row.status_code === null ? null : String(row.status_code)}
                  missing="this report is not about a response"
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
                    missing="none: no server handled this, so there is nothing to join to the log lines"
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
                  <Maybe
                    value={null}
                    missing="none — the estate's own browser client sends no trace context, so its reports leave this empty"
                  />
                )}
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Session</dt>
              <dd className="ln-fact__value">
                {row.session ? (
                  <Id value={row.session} short />
                ) : (
                  <Maybe value={null} missing="none: the tab had nowhere to keep one" />
                )}
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">Release</dt>
              <dd className="ln-fact__value">
                <Maybe value={detail.release} missing="no build tag came with it" />
              </dd>
            </div>
            <div className="ln-fact">
              <dt className="ln-fact__label">User agent</dt>
              <dd className="ln-fact__value">
                <Maybe value={detail.userAgent} missing="no user-agent string was sent" />
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
