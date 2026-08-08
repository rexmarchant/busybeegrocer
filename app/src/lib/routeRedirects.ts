/** Derives the Cloudflare Pages SPA rules from the app's own route table.
 *
 * These used to be maintained by hand, which meant adding a route to App.tsx and
 * forgetting the rule left that route serving a 404 status -- working, but
 * wrong, and nothing would notice. Reading the routes instead makes the two
 * impossible to disagree.
 *
 * A catch-all cannot be used in its place: Cloudflare evaluates _redirects
 * BEFORE static files, so /app/* would serve the HTML shell for every script,
 * the stylesheet, the manifest and the service worker, and the app would never
 * boot. Hence real prefixes, and the guards below. */

/** Built asset folders. A rule matching one of these would shadow real files. */
const ASSET_DIRS = ['assets', 'icons', 'screenshots', 'video']

/** Extracts the `path="..."` values from an App.tsx source file. */
export function routePathsFrom(appSource: string): string[] {
  return [...appSource.matchAll(/path="([^"]+)"/g)].map((m) => m[1])
}

/** Turns one route path into the prefix Cloudflare should match, or null when
 * no rule is needed.
 *
 *   /login              -> /app/login
 *   /lists/:listId      -> /app/lists/*
 *   /lists/:listId/shop -> /app/lists/*      (same prefix; deduplicated later)
 *   /                   -> null   served as the /app/ directory index
 *   *                   -> null   react-router's own catch-all, not a real URL
 */
export function prefixForRoute(routePath: string): string | null {
  if (routePath === '/' || routePath === '*') return null

  const segments = routePath.replace(/^\//, '').split('/')
  const firstParam = segments.findIndex((s) => s.startsWith(':'))

  // Everything from the first dynamic segment onwards collapses into a splat --
  // the values are unknowable, and any deeper route shares the same prefix.
  if (firstParam === 0) {
    // A route like /:something at the top level would produce /app/*, the exact
    // catch-all that breaks every asset.
    throw new Error(`Route "${routePath}" would generate the /app/* catch-all, which shadows assets`)
  }
  const kept = firstParam === -1 ? segments : segments.slice(0, firstParam)
  const prefix = `/app/${kept.join('/')}`

  if (ASSET_DIRS.includes(kept[0])) {
    throw new Error(`Route "${routePath}" collides with the built asset folder /app/${kept[0]}`)
  }

  return firstParam === -1 ? prefix : `${prefix}/*`
}

/** The complete rules block, ready to append to _redirects. */
export function redirectRulesFor(appSource: string): string[] {
  const prefixes = new Set<string>()
  for (const routePath of routePathsFrom(appSource)) {
    const prefix = prefixForRoute(routePath)
    if (prefix) prefixes.add(prefix)
  }
  if (prefixes.size === 0) throw new Error('No routes found in App.tsx -- refusing to write an empty rules block')

  return [...prefixes].sort().map((prefix) => `${prefix.padEnd(28)}/app-shell    200`)
}
