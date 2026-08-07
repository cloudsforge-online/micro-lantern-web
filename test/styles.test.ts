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
 *
 * ── THE PINNED CITATION BELOW MOVED, AND DELETING IT WAS NEVER AN OPTION ──────────────────────
 *
 * `cites the instruction it is following` asserts that src/styles.css names a LINE NUMBER in
 * @cloudsforge/ui, which looks like a test guaranteed to rot and is the opposite: it is the only
 * thing in this repository that can notice the rot. It said `594-596` and every one of the four
 * citations above said something equally wrong — 594-596 landed in a paragraph about which four
 * hues survive deuteranopia in a scatter plot, `111` in the motion tokens — because the design
 * system grew a light scheme, a severity text ramp and eleven product blocks underneath them.
 *
 * All five were re-read from source on 2026-08-06 and moved together. The quoted sentence itself
 * was unchanged, which is exactly why this went unnoticed: the QUOTATION stayed true while every
 * POINTER to it rotted, so nothing a human reads casually looked wrong. The correct response to
 * that is to re-aim the assertion, never to relax it into matching `tokens.css:\d+` — a test that
 * accepts any number accepts the wrong one, and this file's whole subject is a design system that
 * must not become a suggestion.
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

  it('declares the scheme the token layer switches on, spelled the way the standard spells it', () => {
    /*
     * The third attribute, and the meta tag beside it. Both are asserted here rather than trusted,
     * because the failure mode of each is SILENCE: an unknown `data-` attribute selects nothing
     * and an unknown meta name is ignored, so a page missing either renders, passes every other
     * check in this suite, and is simply wrong in one scheme.
     *
     * `colour-scheme` is what this file shipped with — correct English, and INERT. No browser has
     * ever parsed that name. The negative assertion is the one that has teeth: this estate's copy
     * is British throughout, so the misspelling is the natural thing for the next writer to type
     * back in while "fixing" the Americanism, and it would fail closed and silently again.
     */
    assert.match(HTML, /data-cf-scheme="auto"/)
    assert.match(HTML, /<meta name="color-scheme" content="dark light"/)
    assert.doesNotMatch(HTML, /name="colour-scheme"/)
  })

  it('leaves the scheme to the token layer — no local color-scheme, no local light block', () => {
    /*
     * `color-scheme: dark` was declared on `body` here and had to go: it overrode
     * `data-cf-scheme="auto"` for the two things the property actually controls — the UA's form
     * controls and its scrollbars — so a reader on a light desktop got the light palette from the
     * token layer with a dark date picker and dark scrollbars nailed to it.
     *
     * The `prefers-color-scheme` half is the defect `site` shipped rather than one this surface
     * did: a local media query redeclaring semantic tokens WINS over the shared layer for whichever
     * properties it names, producing a page that is half one scheme and half the other. Asserted
     * as an absence so that adding one is a deliberate argument with this comment.
     *
     * Matched against CODE, not CSS: the block that replaced the declaration explains at length
     * what it replaced, and quotes it.
     */
    assert.doesNotMatch(CODE, /color-scheme\s*:/)
    assert.doesNotMatch(CODE, /prefers-color-scheme/)
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
