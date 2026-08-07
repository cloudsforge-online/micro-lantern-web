/**
 * A state, rendered as a word, a glyph and a tone — in that order of importance.
 *
 * The word is never optional and the glyph is never the only non-colour channel. See the header of
 * `src/lib/format.ts` for the measurement behind that, and for why this surface in particular
 * cannot lean on amber: `--cf-warn` and Lantern's registry accent are the same six hex digits.
 */
import type { ReactNode } from 'react'
import type { Tone } from '../lib/format.ts'
import { instant } from '../lib/format.ts'

export function Badge({ tone, title }: { tone: Tone; title?: string | undefined }) {
  return (
    <span className={`ln-badge ln-badge--${tone.tone}`} title={title ?? tone.meaning}>
      <span className="ln-badge__glyph" aria-hidden="true">
        {tone.glyph}
      </span>
      <span className="ln-badge__word">{tone.word}</span>
    </span>
  )
}

/** A label and its value, as a definition pair. The value may be a node — a badge, a link. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ln-fact">
      <dt className="ln-fact__label">{label}</dt>
      <dd className="ln-fact__value">{children}</dd>
    </div>
  )
}

/**
 * A value that may be absent, where absence is a real answer rather than a rendering problem.
 *
 * `missing` is the SENTENCE, not a dash. Most nullable columns on these rows are null for a
 * reason worth stating — a browser sample has no `request_id` because nothing server-side handled
 * it, and rendering that as an empty cell invites the reader to assume the column is broken.
 */
export function Maybe({ value, missing }: { value: string | null; missing: string }) {
  if (value === null || value.length === 0) {
    return <span className="ln-absent">{missing}</span>
  }
  return <span className="cf-num">{value}</span>
}

/** An identifier: monospace, selectable whole, never truncated in the DOM. */
export function Id({ value, short = false }: { value: string; short?: boolean }) {
  return (
    <code className="cf-num ln-id" title={value}>
      {short && value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value}
    </code>
  )
}

/**
 * A timestamp, absolute AND relative, in one element.
 *
 * Both, never one. See `instant()` in `src/lib/format.ts`.
 */
export function When({ iso }: { iso: string }) {
  const { absolute, relative } = instant(iso)
  return (
    <time className="ln-when" dateTime={absolute} title={absolute}>
      <span className="ln-when__rel">{relative}</span>
      <span className="cf-num ln-when__abs">{absolute}</span>
    </time>
  )
}

/** A plain advisory. `warn` for something the reader must weigh; it is not an error state. */
export function Note({
  tone = 'plain',
  children,
}: {
  tone?: 'plain' | 'warn'
  children: ReactNode
}) {
  return (
    <p className={`ln-note ln-note--${tone}`} role="note">
      <span className="ln-note__icon" aria-hidden="true">
        {tone === 'warn' ? '▲' : '·'}
      </span>
      <span>{children}</span>
    </p>
  )
}

/**
 * The double-encoding notice, rendered on the row it applies to.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * VISIBLE, NEVER SILENT.
 *
 * `attributes` was written as a JSON string inside a `jsonb` column. `readAttributes` in
 * `src/lib/lantern.ts` parses such a value once so the operator can still read the stack trace
 * that is inside it — and then says so here, because a client that quietly repairs a storage
 * defect is a client that guarantees nobody will ever fix it. This estate has already lost months
 * to a column nothing read; it should not now lose months to a column one thing reads and
 * launders.
 *
 * The note names the query that settles it, so the reader can check the DATA rather than assume
 * the UI is wrong.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export function EncodingNote({ encoding }: { encoding: string }) {
  if (encoding === 'object' || encoding === 'absent') return null
  if (encoding === 'double-encoded') {
    return (
      <Note tone="warn">
        The <code className="cf-num ln-code">attributes</code> on this row were stored as a JSON{' '}
        <strong>string</strong> sitting inside the <code className="cf-num ln-code">jsonb</code>{' '}
        column, where an object belongs. It has been unwrapped once so the fields below are legible,
        and left marked rather than tidied away — a client that silently mends bad storage
        guarantees the storage stays bad. To settle whether the data or this page is at fault, run{' '}
        <code className="cf-num ln-code">
          select jsonb_typeof(attributes), count(*) from rum_samples group by 1
        </code>
        : <code className="cf-num ln-code">object</code> is what a sound row looks like, and{' '}
        <code className="cf-num ln-code">string</code> is this one.
      </Note>
    )
  }
  return (
    <Note tone="warn">
      The <code className="cf-num ln-code">attributes</code> on this row would not read as an object
      at all, so the three things a browser error keeps there — its type, its message and its stack
      — are missing for it. Nothing has been invented in their place. Run{' '}
      <code className="cf-num ln-code">jsonb_typeof(attributes)</code> against this row to see what
      reached the column.
    </Note>
  )
}
