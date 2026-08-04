/**
 * The not-found page, served UNDER A REAL 404.
 *
 * nginx enumerates the client routes and everything else falls through to
 * `error_page 404 /index.html`, which serves this bundle while keeping the status. So this
 * component renders inside a genuine 404 rather than inside a 200 that says "not found" — see the
 * header of nginx.conf for what the estate lost to the other arrangement.
 *
 * It lists the routes rather than offering a bare "go home", because the address that got somebody
 * here mid-incident is usually a link from a runbook that has drifted, and the next most useful
 * thing is the current list.
 */
import { Link } from 'react-router-dom'
import { ROUTES } from '../lib/routes.ts'

export function NotFoundPage() {
  return (
    <section className="ln-page" aria-labelledby="notfound-title">
      <header className="ln-page__head">
        <h1 className="ln-page__title" id="notfound-title">
          Lantern does not serve this address
        </h1>
        <p className="ln-page__lede">
          This page is being delivered with a real <code className="cf-num ln-code">404</code>, not
          a 200 that says "not found" — so a link checker, a crawler and an uptime probe all see
          what you see.
        </p>
      </header>
      <ul className="ln-routes">
        {ROUTES.map((route) => (
          <li className="ln-routes__item" key={route.path}>
            <Link className="ln-link" to={route.path}>
              {route.label ?? route.path}
            </Link>
            <span className="ln-hint">{route.purpose}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
