/**
 * The boot sequence. The order is not arbitrary.
 *
 *   1. Observability first, so an exception thrown by anything below is reported rather than lost.
 *      A crash during the first render is the single most valuable event this app can send — and
 *      it is sent to Lantern, which is the service this very page reads. This console reporting
 *      its own errors into the table it renders is the correct arrangement and worth noticing.
 *   2. `bootstrapSession()` second, and AWAITED, so the SSO hand-off code in the URL fragment is
 *      redeemed before React mounts. It strips `#cf_code` from the address bar before the exchange
 *      goes over the wire — see the note in @cloudsforge/ui. Rendering first would show the
 *      sign-in wall to somebody who has just signed in, which on a gated surface is not a cosmetic
 *      flash: it is a button that sends them round the loop they have just completed.
 *   3. Render last — UNLESS there is nothing to render because the browser is leaving. With no
 *      session, step 2 asks the portal (once) whether the reader already holds one; the whole
 *      point of that ask is that an operator never sees a sign-in prompt for a session they are
 *      already carrying, and painting the wall over a departing page would put one on screen.
 *      `.finally()` could not express it, which is why the boot reports three outcomes and not a
 *      boolean.
 *
 * The three stylesheet imports are in this order and all three are required. `tokens.css` declares
 * the custom properties, `ui.css` styles the shared bar, and `styles.css` is this app's own —
 * which contains no hex literal and consumes the tokens. Three surfaces in this estate rendered
 * completely unstyled because the tokens were delivered and never imported, with green suites
 * throughout.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@cloudsforge/ui/tokens.css'
import '@cloudsforge/ui/ui.css'
import './styles.css'
import { App } from './app.tsx'
import { bootstrapSession, type BootResult } from './lib/api.ts'
import { initObs } from './lib/obs.ts'

initObs()

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

void bootstrapSession()
  // A boot that THREW is a signed-out boot, not a blank page: the wall and its footer are the two
  // things a reader can still use. Only a deliberate departure suppresses the render.
  .catch((): BootResult => 'signed-out')
  .then((boot) => {
    if (boot === 'asking-the-portal') return
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
