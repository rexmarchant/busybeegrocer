import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { prefixForRoute, redirectRulesFor, routePathsFrom } from './routeRedirects.ts'

test('reads route paths out of App.tsx source', () => {
  const src = '<Route path="/login" element={<Login />} />\n<Route path="/lists/:listId" />'
  assert.deepEqual(routePathsFrom(src), ['/login', '/lists/:listId'])
})

test('static routes become literal prefixes', () => {
  assert.equal(prefixForRoute('/login'), '/app/login')
  assert.equal(prefixForRoute('/settings/groups'), '/app/settings/groups')
})

test('a dynamic segment collapses to a splat', () => {
  assert.equal(prefixForRoute('/lists/:listId'), '/app/lists/*')
  assert.equal(prefixForRoute('/join/:inviteId'), '/app/join/*')
})

test('routes deeper than the dynamic segment share its prefix', () => {
  // /lists/:listId/shop must not produce /app/lists/*/shop -- Cloudflare would
  // never match it, and the splat already covers it.
  assert.equal(prefixForRoute('/lists/:listId/shop'), '/app/lists/*')
})

test('the index route and the router catch-all produce no rule', () => {
  // /app/ is served as a directory index; "*" is react-router's own, not a URL.
  assert.equal(prefixForRoute('/'), null)
  assert.equal(prefixForRoute('*'), null)
})

test('refuses to generate the /app/* catch-all', () => {
  // This is the rule that serves HTML for every script and stops the app
  // booting. A top-level dynamic route would otherwise produce it.
  assert.throws(() => prefixForRoute('/:anything'), /catch-all/)
})

test('refuses a route that would shadow a built asset folder', () => {
  for (const dir of ['assets', 'icons', 'screenshots', 'video']) {
    assert.throws(() => prefixForRoute(`/${dir}/:id`), /collides/, `should reject /${dir}`)
  }
})

test('rules are deduplicated and sorted', () => {
  const src = '<Route path="/lists/:listId" /><Route path="/lists/:listId/shop" /><Route path="/about" />'
  const rules = redirectRulesFor(src).map((r) => r.split(/\s+/)[0])
  assert.deepEqual(rules, ['/app/about', '/app/lists/*'])
})

test('refuses to emit nothing at all', () => {
  assert.throws(() => redirectRulesFor('no routes here'), /No routes found/)
})

test('every route in the real App.tsx is covered', () => {
  const src = readFileSync(new URL('../App.tsx', import.meta.url), 'utf-8')
  const rules = redirectRulesFor(src)
  const prefixes = rules.map((r) => r.split(/\s+/)[0])

  for (const routePath of routePathsFrom(src)) {
    const expected = prefixForRoute(routePath)
    if (expected === null) continue
    assert.ok(prefixes.includes(expected), `no rule covers ${routePath} (expected ${expected})`)
  }
  assert.ok(!prefixes.includes('/app/*'), 'the catch-all must never be generated')
})
