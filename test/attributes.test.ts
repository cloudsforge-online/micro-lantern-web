/**
 * The `attributes` reader — the guard on the defect this repository was cut to expose.
 *
 * `rum_samples.attributes` was written as a JSON STRING inside a `jsonb` column, and nothing in the
 * estate read the column, so nothing could observe it. Both halves are fixed — the service has a
 * reader (`lantern/src/reads.ts`) and the writer stores a real object, verified against the
 * running service — but rows written before the fix survive until retention takes them, and a
 * service can regress. The branch below is what keeps such a row READABLE and FLAGGED rather than
 * silently laundered.
 *
 * Every case here was checked against the shape the service actually returns. One real row, from
 * `/v1/rum?limit=3` on this estate:
 *
 *   {"id":"945","ts":"2026-08-04T05:45:21.569Z","app":"aetherholm-web","kind":"page_load",
 *    "route":"/","value_ms":53,"status_code":null,"request_id":null,"trace_id":null,
 *    "session":"8892d3dd-…","attributes":{"at":"…","url":"https://aetherholm…","type":"PageLoad",
 *    "context":{"ttfb":27,"loaded":53,…},"message":"/","release":"estate","userAgent":"…"}}
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { attrBag, attrString, readAttributes, rumDetail } from '../src/lib/lantern.ts'

describe('readAttributes', () => {
  it('passes a healthy object through and says so', () => {
    const result = readAttributes({ message: 'boom', type: 'TypeError' })
    assert.equal(result.encoding, 'object')
    assert.equal(result.bag['message'], 'boom')
  })

  it('parses a double-encoded string ONCE and flags the row', () => {
    // The exact shape the column held: a JSON string inside jsonb.
    const raw = JSON.stringify({ message: 'boom', type: 'TypeError' })
    const result = readAttributes(raw)
    assert.equal(result.encoding, 'double-encoded')
    assert.equal(result.bag['message'], 'boom')
  })

  it('does not parse twice, so a triple-encoded value is reported rather than repaired', () => {
    // Parsing again would "fix" this and hide a worse version of the same defect: the inner value
    // is a STRING, not a bag, and pretending otherwise is how the original defect survived.
    const raw = JSON.stringify(JSON.stringify({ message: 'boom' }))
    const result = readAttributes(raw)
    assert.equal(result.encoding, 'unparseable')
    assert.deepEqual(result.bag, {})
  })

  it('never coerces a non-object into a bag', () => {
    for (const raw of ['not json at all', '"a bare string"', '[1,2,3]', 42, true]) {
      const result = readAttributes(raw)
      assert.equal(result.encoding, 'unparseable', `${JSON.stringify(raw)} was accepted`)
      assert.deepEqual(result.bag, {})
    }
  })

  it('distinguishes absent from unreadable', () => {
    // A null column is a row that carried nothing. An unparseable one is a row that carried
    // something this console could not read. Rendering the same sentence for both would tell an
    // operator that a mangled record is an empty one.
    assert.equal(readAttributes(null).encoding, 'absent')
    assert.equal(readAttributes(undefined).encoding, 'absent')
    assert.equal(readAttributes('{oops').encoding, 'unparseable')
  })

  it('an array is not a bag', () => {
    // `typeof [] === 'object'`, so this is the branch that would otherwise let `bag['message']`
    // read an array index and render nothing without saying why.
    assert.equal(readAttributes([{ message: 'boom' }]).encoding, 'unparseable')
  })
})

describe('attrString', () => {
  it('returns strings and refuses everything else', () => {
    const bag = { s: 'yes', empty: '', n: 7, o: { a: 1 }, nul: null }
    assert.equal(attrString(bag, 's'), 'yes')
    // An empty string is absence, not a value: rendering it produces a blank cell that reads as a
    // broken column.
    assert.equal(attrString(bag, 'empty'), null)
    assert.equal(attrString(bag, 'n'), null)
    // The one that matters: `String({a:1})` is '[object Object]', which is the exact rendering
    // failure this estate shipped in every frontend cut from the template.
    assert.equal(attrString(bag, 'o'), null)
    assert.equal(attrString(bag, 'nul'), null)
    assert.equal(attrString(bag, 'missing'), null)
  })
})

describe('attrBag', () => {
  it('returns a nested object and nothing else', () => {
    assert.deepEqual(attrBag({ context: { ttfb: 27 } }, 'context'), { ttfb: 27 })
    assert.equal(attrBag({ context: 'no' }, 'context'), null)
    assert.equal(attrBag({ context: [1] }, 'context'), null)
    assert.equal(attrBag({}, 'context'), null)
  })
})

describe('rumDetail', () => {
  it('digs the three fields that have NO COLUMN out of the bag', () => {
    // `rum_samples` has no message, no stack and no type. If this test ever stops finding them,
    // the samples page is back to telling an operator that something called `error` happened on
    // `/dashboard` and nothing whatever about what it was.
    const detail = rumDetail({
      type: 'TypeError',
      message: "Cannot read properties of null (reading 'useState')",
      stack: 'at Foo (index.js:1:1)',
      url: 'https://aetherholm.cloudsforge.localtest.me/',
      release: 'estate',
      userAgent: 'CloudsForge-Beacon/1.0 (synthetic monitoring)',
      context: { ttfb: 27, loaded: 53 },
    })
    assert.equal(detail.type, 'TypeError')
    assert.match(detail.message ?? '', /useState/)
    assert.equal(detail.stack, 'at Foo (index.js:1:1)')
    assert.equal(detail.release, 'estate')
    assert.deepEqual(detail.context, { ttfb: 27, loaded: 53 })
    assert.equal(detail.encoding, 'object')
  })

  it('reads a double-encoded row and still reports the encoding', () => {
    const detail = rumDetail(JSON.stringify({ type: 'PageLoad', message: '/' }))
    assert.equal(detail.type, 'PageLoad')
    assert.equal(detail.message, '/')
    // The flag survives the dig. A page that recovered the fields and dropped the flag would be
    // the silent laundering this whole file exists to prevent.
    assert.equal(detail.encoding, 'double-encoded')
  })

  it('reports every field as absent rather than inventing one', () => {
    const detail = rumDetail({})
    for (const value of [detail.type, detail.message, detail.stack, detail.url, detail.release]) {
      assert.equal(value, null)
    }
    assert.equal(detail.context, null)
  })

  it('matches the shape of a real row from the running service', () => {
    // Copied from `/v1/rum?limit=3`, verbatim, including the snake_case wire keys.
    const row = {
      id: '945',
      ts: '2026-08-04T05:45:21.569Z',
      app: 'aetherholm-web',
      kind: 'page_load',
      route: '/',
      value_ms: 53,
      status_code: null,
      request_id: null,
      trace_id: null,
      session: '8892d3dd-0000-0000-0000-000000000000',
      attributes: {
        at: '2026-08-04T05:45:21.569Z',
        url: 'https://aetherholm.cloudsforge.localtest.me/',
        type: 'PageLoad',
        context: { ttfb: 27, loaded: 53, navigationType: 'navigate', domContentLoaded: 52 },
        message: '/',
        release: 'estate',
        userAgent: 'CloudsForge-Beacon/1.0 (synthetic monitoring)',
      },
    }
    const detail = rumDetail(row.attributes)
    assert.equal(detail.encoding, 'object')
    assert.equal(detail.type, 'PageLoad')
    assert.equal(detail.message, '/')
    assert.equal(detail.userAgent, 'CloudsForge-Beacon/1.0 (synthetic monitoring)')
    assert.equal(detail.context?.['ttfb'], 27)
    // The columns are still columns, and still snake_case. A client that camel-cased them would
    // read `undefined` for every one of these and render an empty table with no error anywhere.
    assert.equal(row.value_ms, 53)
    assert.equal(row.status_code, null)
  })
})
