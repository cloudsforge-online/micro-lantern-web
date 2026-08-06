/**
 * The stylesheet consumes the design system rather than copying it, and the accent decision holds.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * TWO RULES, BOTH OF WHICH THIS ESTATE HAS ALREADY BROKEN.
 *
 * 1. NO HEX LITERALS. Three surfaces rendered completely unstyled on the night this repository was
 *    written, because micro-ui's tokens were delivered and never consumed — the values existed and
 *    nothing read them. Every colour here must be a `var(--cf-*)`, so a change in the design system
 *    reaches this surface and a drift from it is impossible rather than merely discouraged.
 *
 * 2. THE ACCENT IS EMBER, BY INDIRECTION. `ui/packages/ui/src/tokens.css` says Lantern's
 *    own UI forces ember "because amber is also its WARN severity and a surface must not wear the
 *    colour of one of the states it reports". Lantern's registry accent (`surfaces.ts`) and
 *    `--cf-warn` (`tokens.css`) are the same six digits. The override must therefore exist,
 *    and it must be var() indirection — writing `#e8622c` here would satisfy the eye and break
 *    rule 1, which is how a design system quietly becomes a suggestion.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const CSS = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const MAIN = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')

/** The stylesheet with comments stripped: the header quotes hex values while explaining them. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

describe('the stylesheet', () => {
  it('contains no hex colour literal at all', () => {
    const found = CODE.match(/#[0-9a-fA-F]{3,8}\b/g)
    assert.equal(
      found,
      null,
      `src/styles.css must consume var(--cf-*) tokens; found ${JSON.stringify(found)}`,
    )
  })

  it('re-points all five accent tokens to the ember ramp', () => {
    // All five, not three: a surface with an ember background and an amber focus ring is worse
    // than one that is consistently amber, because the inconsistency reads as a rendering bug.
    for (const suffix of ['', '-hover', '-ink', '-text', '-glow']) {
      const rule = new RegExp(`--cf-accent${suffix}:\\s*var\\(--cf-ember${suffix}\\)`)
      assert.match(CODE, rule, `--cf-accent${suffix} is not re-pointed to the ember ramp`)
    }
  })

  it('scopes the override to the product block the page actually declares', () => {
    assert.match(CODE, /\[data-cf-product='lantern'\]/)
  })

  it('cites the instruction it is following, so the next reader can check it', () => {
    assert.match(CSS, /tokens\.css/)
  })
})

describe('the page names a declared product block', () => {
  it('sets data-cf-product to the real registry key', () => {
    // tokens.css says every key an app may set is declared, precisely so a surface cannot
    // fall through to the company ember in silence — which is what `admin` did. `lantern` has a
    // block at tokens.css, so naming it is both honest and safe.
    assert.match(HTML, /data-cf-product="lantern"/)
    assert.match(HTML, /data-cf-substrate="warm"/)
  })
})

describe('the stylesheets are actually imported', () => {
  it('imports tokens, then the shared UI, then this app, in that order', () => {
    const tokens = MAIN.indexOf("'@cloudsforge/ui/tokens.css'")
    const ui = MAIN.indexOf("'@cloudsforge/ui/ui.css'")
    const own = MAIN.indexOf("'./styles.css'")
    // The whole failure mode: the tokens were delivered and never imported, so every var() below
    // resolved to nothing and three surfaces painted as unstyled HTML with a green suite.
    assert.ok(tokens >= 0, 'tokens.css is not imported')
    assert.ok(ui > tokens, 'ui.css must come after tokens.css')
    assert.ok(own > ui, "this app's own stylesheet must come last")
  })
})
