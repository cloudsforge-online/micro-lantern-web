# micro-lantern-web

[![ci](https://github.com/cloudsforge-online/micro-lantern-web/actions/workflows/ci.yml/badge.svg)](https://github.com/cloudsforge-online/micro-lantern-web/actions/workflows/ci.yml)
![licence](https://img.shields.io/badge/licence-MIT-97CA00)
![node](https://img.shields.io/badge/node-%3E%3D22-5FA04E?logo=node.js&logoColor=white)
![typescript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![module](https://img.shields.io/badge/module-ESM-F7DF1E?logo=javascript&logoColor=black)
![tests](https://img.shields.io/badge/tests-node%3Atest%2C%20no%20DOM-6E56CF)

The operator console for `micro-lantern`: the estate's open issues, its raw log events, the browser
samples its frontends report about themselves, and the request-id lookup an operator pastes an id
into mid-incident. A static SPA served by nginx — no Node, no toolchain and no environment in the
image.

Design authority: [`ecosystem/13-operational-model.md`](https://github.com/cloudsforge-online/micro-docs/blob/main/ecosystem/13-operational-model.md)

---

## Why this repository exists

**The surface registry has been offering every operator a page that 404s.**

`ui/packages/ui/src/surfaces.ts:375-389` declares `lantern` with `inSwitcher: true` and
`servesUi: false` at the same time. `micro-lantern` serves JSON and no HTML, so the switcher entry
"Logs & errors" led nowhere. Driven through the real gateway before a line of this was written:

```
$ curl -sI --cacert deploy/gateway/certs/ca.crt https://lantern.cloudsforge.localtest.me/
HTTP/2 404
```

This bundle is the page that entry already claimed, **and micro-ui has since been corrected**:
`ui/packages/ui/src/surfaces.ts:405` now reads `servesUi: true`, and `test/hosts.test.ts:45` pins it
at `true` — so a regression goes red rather than leaving a sentence here that has quietly become
false. Measured live on 2026-08-05: `https://lantern.cloudsforge.online/` → `200 text/html`. On
testnet the same surface is `https://lantern-testnet.cloudsforge.online/` — testnet hostnames are
single-label `<surface>-testnet.`, never `<surface>.testnet.`.

---

## What the pages are

| Route | Reads | What it is for |
| --- | --- | --- |
| `/` | `GET /v1/issues` | Open issues, grouped by fingerprint, worst-recent first |
| `/events` | `GET /v1/events` | The raw log lines, filtered by service, severity and trace id |
| `/browser` | `GET /v1/rum` | Browser samples, **including the `attributes` bag** |
| `/request` | `GET /v1/requests/:requestId` | The one search box the service is shaped around |

`/request` is the important one. `13-operational-model.md:73-78`, quoted in
`lantern/src/reads.ts:6-8`: *"a user quotes an id from an error screen and an operator pastes it
into one search box"*. Every failure state in this console prints the request id Lantern gave it,
and that page is where the id is spent — the loop closes inside the repository.

---

## `/v1/rum` is being read here for the first time

`rum_samples` was **write-only for the whole life of the service**: inserted by the ingest sink,
deleted by retention, and selected by nothing (`lantern/src/reads.ts:128-144`). A browser error
could be collected perfectly, stored perfectly, and remain invisible to every human in the company
— which is worse than not collecting it, because it looks like coverage.

Two things follow, and both are visible on the page:

1. **The columns are not the record.** `rum_samples` has no `message`, no `stack` and no `type`;
   `obs.ts` puts all three in the `attributes` jsonb bag because there is nowhere else for them to
   go. A samples table that renders the columns and not the bag tells an operator that something
   called `error` happened on `/dashboard` and nothing whatever about what it was. Every row here
   expands into the bag.

2. **The bag was double-encoded** — a JSON string inside `jsonb`. That is fixed at the write side
   and verified against the running service, but rows written before the fix live until retention
   takes them and a service can regress. So `readAttributes` (`src/lib/lantern.ts`) parses a string
   **once** and **flags the row on screen**; it never coerces silently and never renders
   `[object Object]` or a quoted blob. If you need to know whether it is the data or this page:

   ```sql
   select jsonb_typeof(attributes), count(*) from rum_samples group by 1;
   ```

   `object` is healthy. `string` is a double-encoded row, and the data is what is wrong.

---

## It is gated, and the surface it was copied from deliberately is not

`explorer-web` has no `ProtectedRoute` and argues the case at length: its reads are anonymous, so a
gate there would demand a session for public chain facts.

Every read here is the opposite. `authorise` (`lantern/src/server.ts:623-636`) accepts the
break-glass token, or an identity JWT whose principal is a user, or a service token holding the read
scope — and throws with no credential at all. `lantern` is `adminOnly: true`
(`surfaces.ts:388`). So:

* **Signed out** → one panel explaining what this surface is, and a `signIn()` button. **No request
  is issued at all**, so nobody is shown a screen made of 401s that reads as "Lantern is down".
* **Signed in and refused** → the service's own answer, rendered honestly: 401 with a sign-in
  button, 403 **without** one (signing in again issues the same credential), each with the code and
  the request id.

The gate never inspects `roles`. A client that predicts an authorisation decision is a client that
will eventually disagree with the service making it. `test/auth.test.ts` asserts the absence against
comment-stripped source.

**The break-glass token is not in this bundle and must never be.** It is a shared static secret; in
JavaScript it would sit in every browser cache the page ever loaded into. It is for a curl.

---

## The accent is ember, and that is the design system's instruction

`ui/packages/ui/src/tokens.css:594-596`, verbatim:

> Note that Lantern's own UI forces ember for its chrome, because amber is also its WARN severity
> and a surface must not wear the colour of one of the states it reports.

Lantern's registry accent is `#f4a63c` (`surfaces.ts:381`) and `--cf-warn` is `#f4a63c`
(`tokens.css:111`) — the same six digits. `index.html` still names the real key
(`data-cf-product="lantern"`, a declared block at `tokens.css:596-602`, so nothing falls through in
silence), and `src/styles.css` re-points the five accent tokens to the ember ramp through `var()`
indirection. **There is not one hex literal in this repository's CSS**, and both a test and a CI
step say so.

Severity is therefore rendered as **word + glyph + tone** — three channels, never colour alone.

---

## Running it

```bash
pnpm install
pnpm dev        # http://localhost:5190
```

5190 was checked against the siblings rather than inherited: 5180 is hub-web, 5185 is
foresight-admin-web, 5188 is status-web, and 5199 is the template's placeholder that several
frontends shipped unchanged. 5191 is left free for `beacon-web`.

`micro-lantern` binds **4010** (the registry's `devPort`), which is the SERVICE's port and not this
one. Under `pnpm dev` the page is cross-origin from it and `apiBase()` returns the absolute host; in
production nginx serves this bundle at `lantern.<apex>` and the service serves `/v1` behind the same
hostname, so the base is `''` and every request is relative. That difference is derived by comparing
origins, never from a `DEV` flag — **this repository reads no build-time configuration at all**, and
`test/no-build-time-config.test.ts` fails the build if one appears.

---

## The tests, and what they are not

```bash
pnpm typecheck && pnpm test && pnpm build
```

`node:test` only, no jsdom. Everything checked here is a pure layer: host resolution, the error
envelope, the resource state machine, the `attributes` reader including its double-encoded branch,
and the agreement between `ROUTES`, the router and `nginx.conf`.

**Sixteen frontends in this estate shipped green suites while their pages were unusable**, because
every browser harness called `page.route('**/*', …)` and answered its own requests. The harness in
`test/journeys/` is kept, and so is the name that stops it being misread:
`renderOnlyWithStubbedNetwork`. `test/harness-honesty.test.ts` asserts the name, the header that
says it cannot detect an unreachable API, a wrong host or an unrouted path, the fact that it names
`micro-beacon`'s smoke tier as the thing that can, and — against comment-stripped source — that the
interception is still really there.

Nothing in this suite is evidence that anything is reachable. That is `micro-beacon`'s smoke tier,
and a real browser driven with no interception at all.

---

## Provenance

The code in this repository was written by **Claude Opus 5** and **Claude Fable 5**, assets
generated with **FLUX 2 Pro**, under human direction and review.
