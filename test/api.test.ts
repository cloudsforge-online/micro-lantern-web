/**
 * The error envelope, and the four-then-five states a panel can be in.
 *
 * No DOM and no network. `readErrorBody`, `resourceState` and `isRefusal` are pure precisely so
 * that the decisions an operator depends on mid-incident can be proved without a browser — a
 * suite that needed one would be a suite that gets stubbed, and this estate has sixteen frontends
 * that shipped green while unusable for exactly that reason.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readErrorBody } from '../src/lib/api.ts'
import { isRefusal, resourceState } from '../src/lib/resource.ts'

describe('readErrorBody', () => {
  it('reads the estate NESTED envelope, which is what micro-lantern sends', () => {
    // `errorReply` at lantern/src/server.ts builds exactly this.
    const parsed = readErrorBody({
      error: { code: 'unauthenticated', message: 'a valid credential is required', requestId: 'r1' },
    })
    assert.deepEqual(parsed, {
      message: 'a valid credential is required',
      code: 'unauthenticated',
      requestId: 'r1',
    })
  })

  it('never lets an object reach the message field', () => {
    // The defect this function was rewritten for: assigning `data.error` — an object — straight to
    // the displayed message rendered every server-side failure in every app as `[object Object]`,
    // with the code and the request id present in the response and discarded. On this surface that
    // would destroy the one field the console exists to hand back to the operator.
    const parsed = readErrorBody({ error: { code: 'forbidden', requestId: 'r2' } })
    assert.equal(parsed.message, undefined)
    assert.equal(parsed.code, 'forbidden')
    assert.equal(parsed.requestId, 'r2')
  })

  it('still understands the flat shape, for a proxy or a rollback', () => {
    assert.deepEqual(readErrorBody({ error: 'gateway said no' }), { message: 'gateway said no' })
  })

  it('answers empty for a body that is not an object', () => {
    for (const body of [null, undefined, 'nope', 42, []]) {
      assert.deepEqual(readErrorBody(body), {})
    }
  })
})

describe('resourceState', () => {
  const nothing = { message: 'x', requestId: undefined, code: undefined, status: undefined }

  it('reports loading before an answer', () => {
    assert.equal(resourceState({ loading: true, error: null, count: null }), 'loading')
    // A resolved load with no data yet is still loading, not empty: `count: null` means the
    // question has not been answered.
    assert.equal(resourceState({ loading: false, error: null, count: null }), 'loading')
  })

  it('separates empty from ok', () => {
    // `{"issues":[]}` is the answer this estate gives right now, and it must not look broken.
    assert.equal(resourceState({ loading: false, error: null, count: 0 }), 'empty')
    assert.equal(resourceState({ loading: false, error: null, count: 3 }), 'ok')
  })

  it('lets failure outrank both emptiness and loading', () => {
    // A request that threw has told us nothing about whether data exists, so "nothing here" for a
    // timeout is how an outage reads as a quiet week.
    assert.equal(resourceState({ loading: false, error: nothing, count: 0 }), 'failed')
    assert.equal(resourceState({ loading: true, error: nothing, count: null }), 'failed')
  })

  it('lets a refusal outrank a failure, because it is the more specific true statement', () => {
    for (const status of [401, 403]) {
      const refusal = { ...nothing, status }
      assert.equal(resourceState({ loading: false, error: refusal, count: 0 }), 'refused')
      // And it survives a spinner, for the same reason `failed` does.
      assert.equal(resourceState({ loading: true, error: refusal, count: null }), 'refused')
    }
  })

  it('does not treat any other status as a refusal', () => {
    // 500 is Lantern falling over, 0 is nothing answering at all. Offering a sign-in button for
    // either would send an operator round a loop that cannot help them.
    for (const status of [0, 404, 429, 500, 503]) {
      assert.equal(isRefusal({ ...nothing, status }), false, String(status))
    }
    assert.equal(isRefusal(null), false)
  })
})
