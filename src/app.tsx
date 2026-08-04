/**
 * The route table, and the gate.
 *
 * Two facts about the table are enforced elsewhere and must stay in agreement with it: `ROUTES` in
 * `lib/routes.ts` is the declaration the navigation is derived from, and `nginx.conf` enumerates
 * the same paths so that an address which is NOT here answers 404 rather than 200.
 * `test/routes.test.ts` checks all three.
 *
 * ── THE GATE STOPS REQUESTS, IT DOES NOT DECIDE AUTHORISATION ─────────────────────────────────
 *
 * `explorer-web`, which most of this repository was copied from, has no gate and says at length
 * why: its reads are anonymous. Every read here is credentialled
 * (`authorise`, `lantern/src/server.ts:623-636`) and the surface is `adminOnly`
 * (`ui/packages/ui/src/surfaces.ts:388`), so the opposite decision is the correct one — and the
 * full argument lives in the header of `lib/auth.tsx` rather than being half-stated in both.
 *
 * What matters at this level is the SHAPE of the gate. With no session, `SignInWall` renders and
 * the pages are not mounted at all, so no request is issued: a signed-out operator sees one
 * explanation and a button, never four panels of 401 that read as "Lantern is down". With a
 * session, every page mounts and asks, and if Lantern refuses anyway the refusal is rendered from
 * the ANSWER — its status, its code, its request id. The gate never inspects `roles`. A client
 * that predicts an authorisation decision is a client that will eventually disagree with the
 * service making it.
 *
 * `status === 'loading'` renders neither: there are tokens in storage and `/auth/me` is in flight,
 * and flashing the sign-in wall at somebody who is signed in is how a console teaches an operator
 * to distrust it.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/shell.tsx'
import { Loading, SignInWall } from './components/states.tsx'
import { AuthProvider, useSession } from './lib/auth.tsx'
import { placementIsKnown } from './lib/hosts.ts'
import { IssuesPage } from './pages/issues.tsx'
import { EventsPage } from './pages/events.tsx'
import { BrowserPage } from './pages/browser.tsx'
import { RequestPage } from './pages/request.tsx'
import { NotFoundPage } from './pages/not-found.tsx'

function Gate({ children }: { children: React.ReactNode }) {
  const { status, signIn } = useSession()
  if (status === 'loading') return <Loading label="Checking your session" />
  if (status === 'anonymous') return <SignInWall onSignIn={() => signIn()} />
  return <>{children}</>
}

export function App() {
  const unregistered = !placementIsKnown()

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell unregistered={unregistered} />}>
            <Route
              index
              element={
                <Gate>
                  <IssuesPage />
                </Gate>
              }
            />
            <Route
              path="events"
              element={
                <Gate>
                  <EventsPage />
                </Gate>
              }
            />
            <Route
              path="browser"
              element={
                <Gate>
                  <BrowserPage />
                </Gate>
              }
            />
            <Route
              path="request"
              element={
                <Gate>
                  <RequestPage />
                </Gate>
              }
            />
            {/* Unknown paths render inside the shell, so the reader keeps the navigation they need
                to get back out — under a real 404, which nginx.conf preserves. Deliberately NOT
                gated: a wrong address is a wrong address whether or not you are signed in, and
                asking somebody to sign in before being told the page does not exist wastes the one
                minute an incident cannot spare. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
