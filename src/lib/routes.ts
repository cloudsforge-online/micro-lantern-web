/**
 * The client routes, declared once.
 *
 * This list is the single declaration three other things are derived from or checked against:
 * the route table in `src/app.tsx`, the section navigation in `src/components/shell.tsx`, and the
 * ENUMERATION in `nginx.conf`. `test/routes.test.ts` asserts all three agree, because the cost of
 * the honest-404 rule is exactly this agreement: a route present in React and absent from nginx
 * 404s on a hard refresh, and a route present in nginx and absent from React answers 200 with a
 * not-found screen — the failure the enumeration exists to prevent.
 */

export interface RouteDef {
  /** The client path, leading slash, no trailing slash. `/` is the index. */
  readonly path: string
  /** The label in the section navigation, or null for a route that is not navigated to. */
  readonly label: string | null
  /** What the route is for, in a sentence. Used by the tests to keep this honest. */
  readonly purpose: string
}

export const ROUTES: readonly RouteDef[] = [
  {
    path: '/',
    label: 'Issues',
    purpose: 'faults gathered under one fingerprint, newest occurrence first — GET /v1/issues',
  },
  {
    path: '/events',
    label: 'Events',
    purpose: 'one row per ingested log line, narrowed by service and severity — GET /v1/events',
  },
  {
    path: '/browser',
    label: 'Browser',
    purpose: 'what instrumented pages reported, with the attributes bag opened — GET /v1/rum',
  },
  {
    path: '/request',
    label: 'Request lookup',
    purpose: 'follow one id across every service that touched it — GET /v1/requests/:requestId',
  },
]

/** The navigation, which is every route with a label. */
export const NAV = ROUTES.filter((r) => r.label !== null)

/**
 * The non-index routes, as nginx sees them: no leading slash, for the alternation in the
 * `location ~ ^/(…)/?$` block.
 *
 * The request lookup takes its id from the QUERY STRING (`/request?id=…`) rather than from a path
 * segment, and that is a decision about this file. A path parameter would mean a route with a
 * child, and nginx.conf's own header records what the estate does with those: `^/(request)(/|$)`
 * is a PREFIX that matches `/request/anything/at/all` and would serve the not-found screen with a
 * 200. A query string keeps the enumeration to one exact shape per route, which is the shape the
 * honest 404 is cheap to hold.
 */
export const NGINX_ROUTES = ROUTES.filter((r) => r.path !== '/').map((r) => r.path.slice(1))
