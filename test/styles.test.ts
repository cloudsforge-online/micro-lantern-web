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

describe('the sub-nav is the design system’s, and there is no second copy of it here', () => {
  /*
   * The same shape `micro-explorer-web/test/tokens.test.ts` uses for the shared form controls, for
   * the same reason and off the same census.
   *
   * Measured 2026-08-10: ten frontends declared the section strip in their own stylesheet under six
   * class prefixes, from what was plainly one original — `ui/packages/ui/src/subnav.test.ts` holds
   * the count. This repository's copy carried the measure defect worse than the census predicted:
   * `.ln-subnav__inner` set `max-width: 84rem`, 1344px against the 1200px `.cf-bar__inner` and
   * `.cf-foot__inner` take from `--cf-max-w`, so the row of sections sat 72px proud of the bar on
   * each side. Its gap, gutter and link padding were literals, and `.ln-subnav__link.is-active`
   * marked the current section in two channels where the estate's rule is three.
   *
   * BOTH halves are asserted, and that is the point of the shape. The shared classes must EXIST,
   * because a `className` naming a class ui.css does not declare fails as silently as an undefined
   * custom property — which is the failure the top of this file is about. And the local block must
   * be GONE, because a private copy left beside the shared one is how there came to be ten.
   */
  const UI = readFileSync(
    new URL('../node_modules/@cloudsforge/ui/dist/ui.css', import.meta.url),
    'utf8',
  )

  it('the shared sub-nav exists', () => {
    const declared = new Set([...UI.matchAll(/\.(cf-[a-z0-9_-]+)/g)].map((m) => m[1] ?? ''))
    for (const present of [
      'cf-subnav',
      'cf-subnav__inner',
      'cf-subnav__link',
      'cf-subnav__link--current',
    ]) {
      assert.ok(declared.has(present), `.${present} is missing from ui.css`)
    }
  })

  it('still sticks to the bar’s own height token, never a number copied out of it', () => {
    // The assertion did not weaken when the rule moved; it followed it. `--cf-bar-h` was read by
    // exactly one rule in src/styles.css — the sticky offset — and that rule is `.cf-subnav`'s now.
    const rule = /(^|\n)\.cf-subnav\s*\{([^}]*)\}/.exec(UI)
    assert.ok(rule, 'ui.css declares no `.cf-subnav` rule')
    assert.match(rule[2] ?? '', /top:\s*var\(--cf-bar-h\)/)
  })

  it('the local copy is gone, not merely unused', () => {
    // Against CODE, which has had its comments stripped: the note explaining the deletion
    // necessarily spells the old class names.
    const survivors = [...CODE.matchAll(/\.ln-subnav[a-z0-9_-]*/g)].map((m) => m[0])
    assert.deepEqual(
      survivors,
      [],
      `src/styles.css still declares ${survivors.join(', ')}; the strip is SubNav's now`,
    )
    // And the modifier really did move: `is-active` was this repository's spelling of the current
    // section and the shared one is `cf-subnav__link--current`. Nothing else here used it, so this
    // one can be absolute.
    assert.doesNotMatch(CODE, /\.is-active\b/, 'the local current-section modifier is back')
  })
})

describe('the type scale is used rather than approximated', () => {
  /*
   * The rule that keeps the next literal out, and the reason it is worth a test rather than a
   * review comment.
   *
   * Measured 2026-08-10: this file spent SEVENTEEN literal `font-size` declarations and not one
   * token, from 0.76rem to 1.6rem, none of which moved when `--cf-text-md` was raised from 0.82rem
   * to 1rem — the note is beside the token in tokens.css. That is how a console ends up with body
   * copy at 12.2px underneath chrome the design system sets at 14 and 16, with nothing anywhere
   * recording that it had happened. A number typed into a stylesheet is invisible to every check
   * that reads the design system.
   */
  it('spends no literal rem or px font-size', () => {
    const literals = [...CODE.matchAll(/font-size:\s*[0-9.]+(?:rem|px)/g)].map((m) => m[0])
    assert.deepEqual(
      literals,
      [],
      `src/styles.css sets ${literals.join(', ')}; the scale cannot reach those`,
    )
  })

  it('allows the two `em` corrections, and says why they are not the same thing', () => {
    /*
     * `.ln-badge__glyph` and `.ln-id, .ln-code` are RELATIVE, which is the whole reason they stay:
     * a glyph beside a word and mono inside prose both run large at the same computed size, and
     * the correction has to scale with whatever surrounds them. A scale step is absolute by
     * definition and would pin them to one size regardless of context.
     *
     * Asserted as a positive rather than left silent, so that the sweep above cannot be satisfied
     * by deleting them, and so that a third one appearing is a deliberate argument with this
     * comment rather than a quiet exception.
     */
    const relative = [...CODE.matchAll(/font-size:\s*[0-9.]+em/g)].map((m) => m[0])
    assert.equal(relative.length, 2, `expected exactly two em corrections, found ${relative.length}`)
  })

  it('takes its measure from the shared token, so the page lines up with the chrome', () => {
    // `.ln-main` said `84rem` — 1344px — while the bar and the footer take 1200px from
    // `--cf-max-w`. Every heading on this console started 72px left of the wordmark above it.
    assert.match(CODE, /\.ln-main\s*\{[^}]*max-width:\s*var\(--cf-max-w\)/)
    assert.doesNotMatch(CODE, /max-width:\s*[0-9.]+rem/, 'a container measure is a literal again')
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
