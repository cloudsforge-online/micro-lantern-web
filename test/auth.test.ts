/**
 * The session shape, and the gate — the two things this surface does differently from the one it
 * was copied from.
 *
 * `readReader` is pure so the nested-versus-flat mistake cannot be made silently a sixth time. The
 * gate is checked by reading `src/app.tsx`, because its value is entirely in what it does NOT do:
 * it must not send a request before there is a session, and it must not decide who is an operator.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { readReader } from '../src/lib/auth.tsx'

const APP = readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8')
const AUTH = readFileSync(new URL('../src/lib/auth.tsx', import.meta.url), 'utf8')

describe('readReader', () => {
  it('reads the NESTED shape identity actually sends', () => {
    // `toPublicUser`, identity/src/users.ts.
    const reader = readReader({ user: { handle: 'ada', roles: ['admin'] } })
    assert.equal(reader.handle, 'ada')
    assert.deepEqual(reader.roles, ['admin'])
  })

  it('refuses the flat shape, which identity has never sent', () => {
    // The template declared `{ handle?, roles? }` at the TOP level; four frontends inherited it,
    // `roles` was always null, `isAdmin` in the shared bar was always false, and the switcher hid
    // every adminOnly entry from every operator — INCLUDING THIS SURFACE'S. Tolerating the flat
    // shape as a fallback would encode a response identity does not send, and the next reader
    // could not tell which is real.
    const reader = readReader({ handle: 'ada', roles: ['admin'] })
    assert.equal(reader.handle, null)
    assert.deepEqual(reader.roles, [])
  })

  it('survives every wrong-shaped body without throwing', () => {
    for (const body of [null, undefined, 'nope', 42, [], { user: null }, { user: 'ada' }]) {
      const reader = readReader(body)
      assert.equal(reader.handle, null)
      assert.deepEqual(reader.roles, [])
    }
  })

  it('treats an empty handle as no handle', () => {
    assert.equal(readReader({ user: { handle: '' } }).handle, null)
  })

  it('drops non-string roles rather than rendering them', () => {
    assert.deepEqual(readReader({ user: { roles: ['admin', 7, null] } }).roles, ['admin'])
  })
})

describe('the gate', () => {
  it('exists, unlike explorer-web, and mounts the pages only inside itself', () => {
    // Every read here is credentialled (`authorise`, lantern/src/server.ts) and the
    // surface is adminOnly (surfaces.ts). Without a gate the first paint for a signed-out
    // operator is four panels of 401, which reads as "Lantern is broken".
    assert.match(APP, /function Gate\(/)
    for (const page of ['IssuesPage', 'EventsPage', 'BrowserPage', 'RequestPage']) {
      const mounted = new RegExp(`<Gate>\\s*<${page} />\\s*</Gate>`)
      assert.match(APP, mounted, `${page} is mounted outside the gate, so it would fetch anonymously`)
    }
  })

  it('renders the sign-in wall for anonymous and nothing that fetches', () => {
    assert.match(APP, /status === 'anonymous'/)
    assert.match(APP, /SignInWall/)
  })

  it('does not flash the wall while the session is still being checked', () => {
    // There are tokens in storage and /auth/me is in flight. Showing the sign-in wall to somebody
    // who is signed in offers them a button that sends them round a loop they have completed.
    assert.match(APP, /status === 'loading'/)
  })

  it('never branches on roles — the service decides, not the client', () => {
    // A client that predicts an authorisation decision is a client that will eventually disagree
    // with the service making it. The gate asks "is there a session", never "is this an admin".
    //
    // Comment lines are stripped: app.tsx SAYS "the gate never inspects roles" in its header, and
    // a check that reads a description of the thing instead of the thing is the defect this
    // estate keeps producing. Same lesson as test/harness-honesty.test.ts.
    const code = APP.split('\n')
      .filter((line) => !/^\s*(?:\/\*|\*|\/\/)/.test(line))
      .join('\n')
    assert.doesNotMatch(code, /\broles\b/)
  })

  it('records the contrast with explorer-web where the decision lives', () => {
    // The argument must stay next to the code, and it must name the file it is disagreeing with,
    // or the next person to copy explorer-web here will delete the gate as surplus.
    assert.match(AUTH, /explorer-web\/src\/lib\/auth\.tsx/)
    assert.match(AUTH, /lantern\/src\/server\.ts/)
  })

  it('the 404 page is deliberately NOT gated', () => {
    // A wrong address is a wrong address whether or not you are signed in, and asking somebody to
    // sign in before being told the page does not exist wastes the one minute an incident cannot
    // spare.
    assert.match(APP, /path="\*" element=\{<NotFoundPage \/>\}/)
  })
})

describe('the break-glass token', () => {
  it('is never SENT by any executable line in the bundle', () => {
    // `authorise` checks a static token header before it consults identity
    // (lantern/src/server.ts). In a JavaScript bundle that is a shared credential in every
    // browser cache the page ever loaded into. It is for a curl and for micro-deploy.
    //
    // Checked against comment-stripped source, and the distinction is the same one
    // test/harness-honesty.test.ts had to learn: this repository DOCUMENTS the header's existence
    // at length in src/lib/api.ts and src/lib/lantern.ts, on purpose, because the next writer
    // needs to know why it is absent. A guard that fires on its own rationale gets disabled.
    const header = ['x-lantern', 'token'].join('-')
    for (const file of [
      '../src/lib/api.ts',
      '../src/lib/lantern.ts',
      '../src/lib/auth.tsx',
      '../index.html',
    ]) {
      const code = readFileSync(new URL(file, import.meta.url), 'utf8')
        .split('\n')
        .filter((line) => !/^\s*(?:\/\*|\*|\/\/|<!--|\s*-->)/.test(line))
        .join('\n')
      assert.equal(code.includes(header), false, `${file} sends the break-glass token`)
    }
  })
})
