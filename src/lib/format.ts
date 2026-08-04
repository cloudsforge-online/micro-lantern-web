/**
 * Values rendered as words, and severity rendered as three channels.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * A SEVERITY MUST NEVER BE COLOUR ALONE, AND ON THIS SURFACE THAT IS SHARPER THAN USUAL.
 *
 * micro-ui measured the estate's reserved status hues at ΔE 4.6 apart under protanopia, which is
 * why `status-web` encodes every day three times. Here there is a second reason on top: Lantern's
 * own registry accent is `#f4a63c` (`ui/packages/ui/src/surfaces.ts:381`), which is byte-identical
 * to `--cf-warn` (`ui/packages/ui/src/tokens.css:111`) — the colour of one of the states it
 * reports. `tokens.css:594-596` says so and instructs this surface to wear ember instead, which
 * `src/styles.css` does. But even with the chrome moved out of the way, a badge that meant `warn`
 * only by being amber would say nothing to a reader who cannot separate it from the red one.
 *
 * So every tone below carries a WORD, a GLYPH and a tone class, in that order of importance, and
 * `Tone.word` is never optional.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface Tone {
  /** The tone class, which selects the colour. Never the only channel. */
  readonly tone: 'fatal' | 'error' | 'warn' | 'info' | 'good' | 'plain'
  /** The word. Always rendered. */
  readonly word: string
  /** A non-colour visual channel. Always rendered, always `aria-hidden`. */
  readonly glyph: string
  /** The sentence behind the word, for a title attribute. */
  readonly meaning: string
}

const UNKNOWN_SEVERITY = (value: string): Tone => ({
  tone: 'plain',
  word: value,
  glyph: '·',
  // An unrecognised severity is shown verbatim rather than folded into `info`. The set is a CHECK
  // constraint on the service's side, so a value outside it means the contract moved.
  meaning: `a severity this console does not recognise (${value})`,
})

/**
 * A log severity. `events.severity` is free-form on the service side; `issues.severity` is CHECKed
 * to `error | fatal | warn` (`lantern/src/issues.ts:25`).
 */
export function severityTone(severity: string): Tone {
  switch (severity) {
    case 'fatal':
      return { tone: 'fatal', word: 'fatal', glyph: '✖', meaning: 'the process could not continue' }
    case 'error':
      return { tone: 'error', word: 'error', glyph: '▲', meaning: 'a request or job failed' }
    case 'warn':
      return { tone: 'warn', word: 'warn', glyph: '△', meaning: 'something recoverable went wrong' }
    case 'info':
      return { tone: 'info', word: 'info', glyph: '·', meaning: 'an ordinary log line' }
    case 'debug':
      return { tone: 'plain', word: 'debug', glyph: '·', meaning: 'a developer log line' }
    default:
      return UNKNOWN_SEVERITY(severity)
  }
}

/**
 * A place on the status ladder — `lantern/src/issues.ts:5-7`.
 *
 * `regressed` is the one that matters and the reason the ladder exists: the frozen `issues` table
 * had a single nullable `resolved_at`, so an occurrence after a resolve bumped `last_seen` under a
 * green label and nobody was told the fault came back (`lantern/src/issues.ts:9-18`). It is
 * therefore given the LOUDEST tone of the four, not the neutral one a "known issue" would get.
 */
export function statusTone(status: string): Tone {
  switch (status) {
    case 'new':
      return { tone: 'error', word: 'new', glyph: '◆', meaning: 'seen for the first time' }
    case 'acknowledged':
      return { tone: 'info', word: 'acknowledged', glyph: '◇', meaning: 'somebody has picked it up' }
    case 'resolved':
      return { tone: 'good', word: 'resolved', glyph: '✓', meaning: 'closed, and not seen since' }
    case 'regressed':
      return {
        tone: 'fatal',
        word: 'regressed',
        glyph: '↺',
        meaning: 'resolved, and then it happened again',
      }
    default:
      return UNKNOWN_SEVERITY(status)
  }
}

/** A browser sample kind. Six values, CHECK-constrained — `lantern/src/rum.ts:25`. */
export function kindTone(kind: string): Tone {
  switch (kind) {
    case 'error':
      return { tone: 'error', word: 'error', glyph: '▲', meaning: 'an exception in the browser' }
    case 'unhandled_rejection':
      return {
        tone: 'error',
        word: 'unhandled rejection',
        glyph: '▲',
        meaning: 'a promise rejected with nothing to catch it',
      }
    case 'fetch_error':
      return {
        tone: 'warn',
        word: 'fetch error',
        glyph: '△',
        meaning: 'a request the browser made did not succeed',
      }
    case 'page_load':
      return { tone: 'info', word: 'page load', glyph: '▢', meaning: 'a navigation completed' }
    case 'first_contentful_paint':
      return { tone: 'info', word: 'first paint', glyph: '◐', meaning: 'the first content painted' }
    case 'largest_contentful_paint':
      return {
        tone: 'info',
        word: 'largest paint',
        glyph: '◑',
        meaning: 'the largest element painted',
      }
    default:
      return UNKNOWN_SEVERITY(kind)
  }
}

/**
 * A timestamp, as an absolute instant AND a relative one.
 *
 * Both, never one. "3 minutes ago" is what an operator scans for and is unusable in a handover
 * note; an ISO instant is what goes in the note and is unreadable at a glance mid-incident. The
 * absolute form is the machine-readable one and goes in the `dateTime` attribute.
 */
export function instant(iso: string, now: number = Date.now()): { absolute: string; relative: string } {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) {
    // Shown verbatim rather than as "Invalid Date". A timestamp this console cannot parse is a
    // fact about the row, and hiding it behind a placeholder loses the only copy of it.
    return { absolute: iso, relative: 'unparseable timestamp' }
  }
  return { absolute: new Date(at).toISOString(), relative: relative(at - now) }
}

/** A signed millisecond gap as English. Negative is the past, which is every row this app shows. */
export function relative(deltaMs: number): string {
  const past = deltaMs <= 0
  const seconds = Math.round(Math.abs(deltaMs) / 1000)
  const [value, unit] =
    seconds < 60
      ? [seconds, 'second']
      : seconds < 3600
        ? [Math.round(seconds / 60), 'minute']
        : seconds < 86400
          ? [Math.round(seconds / 3600), 'hour']
          : [Math.round(seconds / 86400), 'day']
  const plural = value === 1 ? unit : `${unit}s`
  if (value === 0) return 'just now'
  return past ? `${value} ${plural} ago` : `in ${value} ${plural}`
}

/** A duration in milliseconds. `null` is a real answer — no column, or nothing to measure. */
export function millis(value: number | null): string | null {
  if (value === null) return null
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(value < 10000 ? 2 : 1)} s`
}

/** A count that arrives as a string, because it is a bigint on the wire (`events::text`). */
export function count(raw: string): string {
  const n = Number(raw)
  return Number.isFinite(n) ? n.toLocaleString('en-GB') : raw
}
