/**
 * What this surface tells a crawler, and the single registry field all of it is derived from.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THIS FILE IS THE OPPOSITE OF ITS SIBLING IN `site` AND `foresight-web`, AND THAT IS THE POINT.
 *
 * Those two check that a sitemap LISTS the right addresses. Here there is no sitemap, /robots.txt
 * refuses every crawler unconditionally, and this console is absent from the estate's sitemap as
 * well. So every assertion below is about an ABSENCE — which is precisely the kind of property
 * that rots without a test, because nothing looks wrong on the day somebody adds a `Sitemap:` line
 * "for consistency with the other surfaces".
 *
 * ── NOTHING HERE WAS DECIDED IN THIS REPOSITORY ───────────────────────────────────────────────
 *
 * `robotsDirective` (ui/packages/ui/src/seo.ts) reads `servesUi` and `adminOnly` and
 * nothing else. Lantern's registry row carries `servesUi: true` (surfaces.ts) and
 * `adminOnly: true` (surfaces.ts), so it resolves to `noindex, nofollow`, and the three places
 * this surface states that — index.html's static tag, `DocumentMeta`'s runtime one, and
 * nginx.conf's /robots.txt — are three COPIES of one registry fact rather than three opinions.
 *
 * Three copies is two too many to maintain by hand, so none of them is maintained by hand: the
 * assertions below regenerate each from the design system and compare. Flip `adminOnly` in
 * surfaces.ts and this file goes red, naming every artefact that has to move with it. That is the
 * only arrangement under which writing the string into a config file is honest.
 *
 * ── AND WHY A BODY IN A CONFIG FILE NEEDS A TEST AT ALL ───────────────────────────────────────
 *
 * A body pasted into nginx.conf is a copy, and this estate has been bitten by exactly one of
 * those: `site/index.html`'s title drifted from its application's, the suite stayed green, and
 * every search result carried a sentence the owner had asked to have removed until somebody opened
 * the served HTML rather than the page. The block is therefore treated as GENERATED OUTPUT that
 * happens to live in a config file.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT THIS FILE CANNOT SEE, AND WHAT DID SEE IT ────────────────────────────────────────────
 *
 * It reads nginx.conf as text. It does not run nginx, so it cannot tell you that `return 404` is
 * intercepted by `error_page 404 /index.html` — which it is, and which the comment beside that
 * block records as a MEASURED fact rather than an assumed one. The config was driven against
 * nginxinc/nginx-unprivileged:1.27 on 2026-08-06, on the apex-style host and on both testnet
 * shapes, and every address this surface owns was probed. The estate tier that repeats that on
 * every push is `served-headers` in .github/workflows/ci.yml, which builds the real image and
 * curls it.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ENV_LABELS, surface } from '@cloudsforge/ui'
import { robotsDirective, surfaceMeta } from '@cloudsforge/ui/seo'
import { SITEMAP_SURFACES, robotsTxt } from '@cloudsforge/ui/sitemap'
import { PRODUCT } from '../src/lib/hosts.ts'

const nginx = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../src/components/shell.tsx', import.meta.url), 'utf8')

/**
 * The shell with every comment LINE removed — what it DOES, with what it SAYS taken out.
 *
 * Same technique and same reason as `test/harness-honesty.test.ts`: that file records an assertion
 * which could not fail because the prose it searched quoted the very thing it was looking for.
 * This one searches for a `robots:` override, and the block above the component explains at length
 * why there is no `robots` override — so matched against the raw source it would be reading the
 * explanation rather than the code.
 */
const SHELL_CODE = shell
  .split('\n')
  .filter((line) => !/^\s*(?:\/\*|\*|\/\/)/.test(line))
  .join('\n')

/** The body of an exact-match location's `return 200 '…';`. */
function servedBody(path: string): string {
  const block = new RegExp(`location = ${path.replace('.', '\\.')} \\{([\\s\\S]*?)\\n {4}\\}`).exec(
    nginx,
  )
  assert.ok(block, `nginx.conf has no exact-match location for ${path}`)
  // Anchored to a `return` at the start of its own line. The sibling surfaces carry a CONDITIONAL
  // `if ($cf_env) { return 200 '…'; }` above the unconditional one, and a regex that took the
  // first match would read the wrong body; this surface has no such branch, and the anchor is kept
  // so that copying this file to a surface which does still reads the right one.
  const body = /\n {8}return 200 '([\s\S]*?)';/.exec(block[1] ?? '')
  assert.ok(body, `the ${path} location does not return an unconditional literal body`)
  return body[1] ?? ''
}

/** The whole text of an exact-match location, braces included, for asserting what is NOT in it. */
function locationBlock(path: string): string {
  const block = new RegExp(`location = ${path.replace('.', '\\.')} \\{([\\s\\S]*?)\\n {4}\\}`).exec(
    nginx,
  )
  assert.ok(block, `nginx.conf has no exact-match location for ${path}`)
  return block[1] ?? ''
}

describe('the indexing decision, derived from the registry and not from this repository', () => {
  it('resolves to noindex, nofollow because the surface is adminOnly', () => {
    /*
     * The root fact, asserted at its source. If this ever changes, every other assertion in this
     * file is describing the wrong surface — so it is checked first and by name, rather than left
     * implicit in the strings below.
     */
    const s = surface(PRODUCT)
    assert.equal(s.adminOnly, true, 'lantern is no longer adminOnly in the registry')
    assert.equal(s.servesUi, true)
    assert.equal(robotsDirective(s), 'noindex, nofollow')
  })

  it('is what index.html hands a crawler that executes no JavaScript', () => {
    // The static tag and the derivation must be the SAME STRING. A tag reading `noindex` where the
    // registry says `noindex, nofollow` would look correct in review and would still invite a
    // crawler to follow every link off this console.
    const tag = /<meta name="robots" content="([^"]*)"/.exec(html)
    assert.ok(tag, 'index.html carries no robots meta tag')
    assert.equal(tag[1], robotsDirective(surface(PRODUCT)))
  })

  it('is what `surfaceMeta` produces at runtime, on every route, with no local override', () => {
    /*
     * `DocumentMeta` rewrites the tag above on every navigation. The two must agree, or the answer
     * a crawler gets depends on whether it ran the bundle — and the JavaScript one wins, silently,
     * because it is applied last.
     *
     * Checked for the root AND for a named page, because `surfaceMeta` composes a different title
     * for each and this asserts the robots directive does NOT vary with it.
     */
    const directive = robotsDirective(surface(PRODUCT))
    assert.equal(surfaceMeta(PRODUCT, { path: '/' }).robots, directive)
    assert.equal(surfaceMeta(PRODUCT, { title: 'Events', path: '/events' }).robots, directive)
    assert.equal(surfaceMeta(PRODUCT, { path: '/request' }).robots, directive)
  })

  it('is never overridden in the shell — the whole value of deriving it is that it cannot be', () => {
    // `surfaceMeta` accepts a `robots` key. Passing one here would let this console come to
    // disagree with surfaces.ts about whether it may be indexed, which is the exact disagreement
    // the derivation exists to make impossible. Asserted as an absence in the source.
    assert.doesNotMatch(SHELL_CODE, /\brobots\s*:/)
    // And the call really is the derived one, so the assertion above is guarding a live call site
    // rather than a component somebody replaced with a hand-written title.
    assert.match(SHELL_CODE, /surfaceMeta\(PRODUCT, \{/)
  })
})

describe('the /robots.txt nginx serves', () => {
  it('is byte for byte what the design system generates for a surface that is not indexable', () => {
    /*
     * Generated, not retyped. `robotsTxt` owns the shape — the `User-agent: *` line, the ordering,
     * the trailing newline — and a hand-written body here would drift from the sixteen surfaces
     * that use the generator without anything going red.
     */
    assert.equal(servedBody('/robots.txt'), robotsTxt({ indexable: false }))
  })

  it('refuses every crawler with no environment branch, unlike every sibling surface', () => {
    /*
     * `site` and `foresight-web` wrap this in `if ($cf_env) { … }`, because their answer is
     * "indexable on mainnet, not elsewhere". This surface's answer does not vary with the estate
     * it is deployed into: `adminOnly` is a property of what the console IS. A branch appearing
     * here would mean somebody had copied a sibling's block, and the mainnet arm of that copy says
     * `Allow: /`.
     */
    const block = locationBlock('/robots.txt')
    assert.match(servedBody('/robots.txt'), /^User-agent: \*\nDisallow: \/\n$/)
    assert.doesNotMatch(block, /\$cf_env/)
    assert.doesNotMatch(block, /Allow: \//)
  })

  it('names no sitemap, because pointing at one under Disallow is a contradiction', () => {
    /*
     * A `Sitemap:` line is an invitation, and several crawlers fetch it whether or not the
     * `Disallow` above it applies to them. There is nothing to point at in any case — see the
     * sitemap block below. `robotsTxt` emits no such line when given no URL, so the byte-for-byte
     * assertion above already covers this; it is stated separately because the failure it guards
     * against is somebody ADDING the line by hand, and a reader scanning for "why is there no
     * sitemap here" should find this test rather than infer it from an equality.
     */
    assert.doesNotMatch(locationBlock('/robots.txt'), /Sitemap:/)
    assert.equal(robotsTxt({ indexable: false }).includes('Sitemap:'), false)
  })
})

describe('the sitemap this surface deliberately does not have', () => {
  it('answers 404 at its own address, and lists nothing', () => {
    const block = locationBlock('/sitemap.xml')
    assert.match(block, /return 404;/)
    assert.doesNotMatch(block, /urlset/, 'a sitemap body has appeared in the 404 location')
    assert.doesNotMatch(block, /<loc>/)
  })

  it('is absent from the ESTATE sitemap too, by the shared filter and not by omission', () => {
    /*
     * The other half, and the one this repository cannot enforce from here: `site` is the only
     * surface that may compose sibling addresses, because it is the only one whose `$host` is the
     * apex. `SITEMAP_SURFACES` (ui/packages/ui/src/sitemap.ts) filters `adminOnly` out, so
     * `site` never lists this console.
     *
     * Asserted from THIS repository because this is where the consequence lands. A change to that
     * filter would publish the operator console's address from the marketing site, and nothing in
     * `site`'s own suite would describe that as a regression — it would simply be one more entry.
     */
    const keys = SITEMAP_SURFACES.map((s) => s.key)
    assert.equal(keys.includes(PRODUCT), false, 'the estate sitemap now lists the operator console')
    // And the filter is still the one doing it, rather than this key having quietly left SURFACES.
    assert.equal(
      SITEMAP_SURFACES.every((s) => s.adminOnly !== true),
      true,
      'SITEMAP_SURFACES no longer excludes adminOnly surfaces',
    )
  })
})

describe('the $cf_env map, which decides nothing here and is kept anyway', () => {
  /**
   * The alternation of environment labels inside the map.
   *
   * Parsed rather than restated: the point of the assertion is that this file's copy agrees with
   * `ENV_LABELS`, and a copy of the list here to compare against would be a third copy with the
   * same problem.
   */
  function alternation(): string[] {
    const map = /map \$host \$cf_env \{[\s\S]*?~\^[^\n]*?\(\?:([^)]*)\)\\\./.exec(nginx)
    assert.ok(map, 'the $cf_env map is missing from nginx.conf')
    return (map[1] ?? '').split('|')
  }

  it('recognises exactly the labels the registry reserves', () => {
    /*
     * ENV_LABELS (ui/packages/ui/src/surfaces.ts) is the estate's single list —
     * `deploy/scripts/check-apex-prefix.py` reads the same export. An alternation that had drifted
     * from it would either miss an environment or refuse a surface, and both fail silently.
     */
    assert.deepEqual(alternation().sort(), [...ENV_LABELS].sort())
  })

  it('matches a suffixed subdomain as well as a bare environment apex', () => {
    // The environment is a SUFFIX on the first label now (`lantern-testnet.`) and was an apex
    // prefix (`testnet.`) before. Both shapes still resolve — surfaces.ts keeps the old one
    // deliberately — so the pattern has to catch both.
    const map = /map \$host \$cf_env \{[\s\S]*?\n\}/.exec(nginx)
    assert.ok(map, 'the $cf_env map is missing')
    assert.match(map[0], /\(\?:\[\^\.\]\+-\)\?/, 'the map does not allow a suffixed subdomain')
  })

  it('is read by nothing on this surface, and that is deliberate rather than a leftover', () => {
    /*
     * THE ASSERTION THAT WOULD OTHERWISE BE MISSING, and the one that keeps the map honest.
     *
     * Every sibling reads `$cf_env` in the two blocks above. This surface reads it nowhere,
     * because both of its answers are unconditional. Without this test the map is indistinguishable
     * from a half-finished copy of a sibling's config, and the obvious "fix" — wiring it up — is
     * exactly the change that would make this console indexable on mainnet.
     *
     * It is kept because it is the shared mechanism, because the assertion above pins the label
     * list, and because the day `adminOnly` is flipped the person doing it should find the
     * environment guard already here rather than have to remember to invent one.
     */
    const uses = nginx
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .filter((line) => line.includes('$cf_env'))
    assert.deepEqual(
      uses.map((l) => l.trim()),
      ["map $host $cf_env {"],
      'something now reads $cf_env; both of this surface’s answers are meant to be unconditional',
    )
  })
})
