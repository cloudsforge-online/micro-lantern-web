/**
 * The `micro-lantern` client, and the reader for the one column this estate has never looked at.
 *
 * Every shape below was taken from the service's own source — `lantern/src/reads.ts` for
 * `EventRow` and `RumRow`, `lantern/src/issues.ts` for `IssueRow` and the status ladder — and the
 * wire keys are SNAKE_CASE because those are column names selected verbatim (`value_ms`,
 * `status_code`, `request_id`, `trace_id`). Nothing here renames them on the way in: a client that
 * camel-cases a wire it does not control is a client that silently reads `undefined` the day a
 * column is added.
 *
 * ── Every read is credentialled, and that is the service's decision, not this file's ──────────
 *
 * `authorise` (`lantern/src/server.ts`) runs before all four handlers. With no credential
 * the answer is 401 `unauthenticated`; with a service token lacking the read scope it is 403
 * `forbidden`, both raised by that same `authorise`. So these calls are made with `auth: true`
 * (the default) and the bearer this bundle holds is the identity JWT. The break-glass
 * `x-lantern-token` is NOT sent from here and must never be: a shared static secret in a
 * JavaScript bundle is a shared static secret in every browser cache on the estate.
 */
import { api } from './api.ts'

/* ------------------------------------------------------------------ the grouped issues */

/** `lantern/src/issues.ts`. `events` is `::text` because it is a bigint. */
export interface IssueRow {
  readonly fingerprint: string
  readonly service: string
  readonly severity: string
  readonly title: string
  readonly culprit: string | null
  readonly status: string
  readonly events: string
  readonly first_seen: string
  readonly last_seen: string
  readonly first_trace_id: string | null
}

/**
 * The status ladder, `lantern/src/issues.ts`: `new → acknowledged → resolved → regressed`.
 *
 * `listOpenIssues` returns only `new`, `acknowledged` and `regressed`, so `resolved`
 * cannot appear in this list — it is included here anyway, because a vocabulary that omits a value
 * the service can produce is how an unknown string ends up rendered as a blank badge.
 */
export const ISSUE_STATUSES = ['new', 'acknowledged', 'resolved', 'regressed'] as const

/** `issues.severity` is CHECKed to this set — `lantern/src/issues.ts`. */
export const ISSUE_SEVERITIES = ['fatal', 'error', 'warn'] as const

/* ------------------------------------------------------------------ the raw events */

/** `lantern/src/reads.ts`, one field per selected column. */
export interface EventRow {
  readonly id: string
  readonly ts: string
  readonly service: string
  readonly source: string
  readonly severity: string
  readonly msg: string
  readonly request_id: string | null
  readonly trace_id: string | null
  readonly span_id: string | null
  readonly route: string | null
  readonly status_code: number | null
  readonly latency_ms: number | null
  readonly err_type: string | null
  readonly fingerprint: string | null
  readonly attributes: unknown
}

/* ------------------------------------------------------------------ the browser samples */

/** `lantern/src/reads.ts`. */
export interface RumRow {
  readonly id: string
  readonly ts: string
  readonly app: string
  readonly kind: string
  readonly route: string | null
  readonly value_ms: number | null
  readonly status_code: number | null
  readonly request_id: string | null
  readonly trace_id: string | null
  readonly session: string | null
  readonly attributes: unknown
}

/** The six values `rum_samples.kind` is CHECKed to — `lantern/src/rum.ts`, mirrored in obs.ts. */
export const RUM_KINDS = [
  'page_load',
  'first_contentful_paint',
  'largest_contentful_paint',
  'fetch_error',
  'unhandled_rejection',
  'error',
] as const

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE `attributes` READER.
 *
 * This is the most important function in the repository, for two reasons that are both defects
 * somebody else found the hard way.
 *
 * ── 1. NOTHING HAS EVER READ THIS COLUMN ──────────────────────────────────────────────────────
 *
 * `rum_samples` was write-only for the whole life of the service: inserted by the sink, deleted by
 * retention, selected by nothing (`lantern/src/reads.ts` says so where the reader was
 * finally added). This page is the first thing in the estate that will ever display it. There is
 * therefore NO body of experience saying what these values look like in practice, and everything
 * below is written for a value that may be anything at all.
 *
 * ── 2. A BROWSER ERROR HAS NO COLUMNS ─────────────────────────────────────────────────────────
 *
 * `rum_samples` has no `message`, no `stack` and no `type`. `obs.ts` puts all three in the
 * `attributes` bag because there is nowhere else for them to go. So a samples view that renders
 * the columns and not the bag tells an operator that something called `error` happened on
 * `/dashboard` and nothing whatever about what it was — which is worse than no page, because it
 * looks like coverage.
 *
 * ── 3. IT WAS DOUBLE-ENCODED, AND THE HONEST THING IS TO SAY SO ON SCREEN ─────────────────────
 *
 * The column was written as a JSON STRING inside `jsonb` — so a reader that parsed once got a
 * quoted blob and a reader that did not got `[object Object]`. That is fixed at the write side and
 * verified against the running service (`/v1/rum?limit=3` now returns a real object), but rows
 * written before the fix are still in the table until retention takes them, and a service can
 * regress.
 *
 * So: a string arriving here is parsed ONCE and the row is FLAGGED. It is never coerced silently,
 * because silent coercion is what let the defect live — the value looked fine to every layer that
 * touched it. If you are checking whether a row is genuinely double-encoded rather than the UI
 * being wrong, the question is answered in the database and not here:
 *
 *     select jsonb_typeof(attributes), count(*) from rum_samples group by 1;
 *
 * `object` is healthy. `string` is a double-encoded row, and it is the DATA that is wrong.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface Attributes {
  /** The bag, always an object — `{}` when there was nothing usable. */
  readonly bag: Record<string, unknown>
  /**
   * How the bag arrived. `double-encoded` is rendered as a visible note on the row, never hidden:
   * an operator reading a stack trace needs to know the storage layer mangled the record it came
   * out of, because the next field they look at may be mangled too.
   */
  readonly encoding: 'object' | 'double-encoded' | 'unparseable' | 'absent'
}

export function readAttributes(raw: unknown): Attributes {
  if (raw === null || raw === undefined) return { bag: {}, encoding: 'absent' }
  if (typeof raw === 'string') {
    // Parsed exactly once. A second parse would "fix" a triple-encoded value and hide a worse
    // version of the same defect.
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return { bag: parsed as Record<string, unknown>, encoding: 'double-encoded' }
      }
      // A string that parses to a scalar or an array is not a bag. Reporting it as unparseable is
      // more honest than wrapping it in an object this service never wrote.
      return { bag: {}, encoding: 'unparseable' }
    } catch {
      return { bag: {}, encoding: 'unparseable' }
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { bag: raw as Record<string, unknown>, encoding: 'object' }
  }
  return { bag: {}, encoding: 'unparseable' }
}

/** One string out of the bag, or null. Never `String(value)` — that is how `[object Object]` ships. */
export function attrString(bag: Record<string, unknown>, key: string): string | null {
  const value = bag[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** A nested bag — `attributes.context`, which is where `obs.ts` puts the caller's extras. */
export function attrBag(bag: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = bag[key]
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

/**
 * What a browser sample actually says, dug out of the bag.
 *
 * The three fields with no column, plus the two that make a report reproducible. `obs.ts` writes
 * `type`, `message`, `stack`, `url`, `release`, `userAgent` and `context`; a sample from anything
 * else may write none of them, which is why every field here is nullable and the caller renders
 * absence as a sentence rather than as an empty cell.
 */
export interface RumDetail {
  readonly type: string | null
  readonly message: string | null
  readonly stack: string | null
  readonly url: string | null
  readonly release: string | null
  readonly userAgent: string | null
  readonly context: Record<string, unknown> | null
  readonly encoding: Attributes['encoding']
}

export function rumDetail(raw: unknown): RumDetail {
  const { bag, encoding } = readAttributes(raw)
  return {
    type: attrString(bag, 'type'),
    message: attrString(bag, 'message'),
    stack: attrString(bag, 'stack'),
    url: attrString(bag, 'url'),
    release: attrString(bag, 'release'),
    userAgent: attrString(bag, 'userAgent'),
    context: attrBag(bag, 'context'),
    encoding,
  }
}

/* ------------------------------------------------------------------ the four reads */

export interface IssuesReply {
  readonly issues: readonly IssueRow[]
}
export interface EventsReply {
  readonly events: readonly EventRow[]
}
export interface RumReply {
  readonly samples: readonly RumRow[]
}
/** `lantern/src/server.ts`. `traceUrl` is null unless the deploy configured a template. */
export interface RequestReply {
  readonly requestId: string
  readonly traceId: string | null
  readonly traceUrl: string | null
  readonly events: readonly EventRow[]
}

/**
 * `limit` is clamped by the service, not here — `clampLimit` at `lantern/src/server.ts`
 * takes 100 as the default and caps issues at 500 and events/rum at 1000. A client-side clamp
 * would be a second copy of a rule the service owns, and the copy is the one that goes stale.
 */
export function listIssues(limit: number, signal: AbortSignal): Promise<IssuesReply> {
  return api<IssuesReply>('/v1/issues', { query: { limit }, signal })
}

export interface EventFilter {
  readonly service?: string | undefined
  readonly severity?: string | undefined
  readonly traceId?: string | undefined
  readonly limit: number
}

export function listEvents(filter: EventFilter, signal: AbortSignal): Promise<EventsReply> {
  // Empty strings are dropped rather than sent: `paramOrUndef` (`lantern/src/server.ts`)
  // treats an empty value as absent anyway, and sending `service=` makes a URL that reads as a
  // filter on nothing.
  return api<EventsReply>('/v1/events', {
    query: {
      service: filter.service || undefined,
      severity: filter.severity || undefined,
      traceId: filter.traceId || undefined,
      limit: filter.limit,
    },
    signal,
  })
}

export interface RumFilter {
  readonly app?: string | undefined
  readonly kind?: string | undefined
  readonly session?: string | undefined
  readonly limit: number
}

export function listRum(filter: RumFilter, signal: AbortSignal): Promise<RumReply> {
  return api<RumReply>('/v1/rum', {
    query: {
      app: filter.app || undefined,
      kind: filter.kind || undefined,
      session: filter.session || undefined,
      limit: filter.limit,
    },
    signal,
  })
}

/**
 * The request-id lookup — the workflow the whole service is shaped around.
 *
 * `13-operational-model.md`, quoted in `lantern/src/reads.ts`: "a user quotes an id from
 * an error screen and an operator pastes it into one search box". This is that box.
 *
 * The id is path-encoded rather than sent as a query parameter because that is the route the
 * service defines (`GET /v1/requests/:requestId`). `eventsByRequestId` refuses anything outside
 * `/^[A-Za-z0-9._:-]{1,128}$/` by returning no rows — so a paste with a stray quote in it comes
 * back as an honest empty rather than an error, and the page says which id it asked about.
 */
export function requestLookup(requestId: string, signal: AbortSignal): Promise<RequestReply> {
  return api<RequestReply>(`/v1/requests/${encodeURIComponent(requestId)}`, { signal })
}
