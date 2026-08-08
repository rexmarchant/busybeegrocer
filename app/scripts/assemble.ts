/** Assembles the deploy directory: the built app, the landing page, and the
 * routing rules generated from the app's own route table.
 *
 * Run after `npm run build`. CI calls exactly this, so what you can test locally
 * with `wrangler pages dev ../dist` is what gets published.
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { redirectRulesFor } from '../src/lib/routeRedirects.ts'

const root = fileURLToPath(new URL('..', import.meta.url)) // the app/ folder
const path = (p: string) => fileURLToPath(new URL(p, import.meta.url))

const dist = path('../../dist')
const site = path('../../site')
const appDist = `${dist}/app`

if (!existsSync(`${appDist}/index.html`)) {
  console.error('dist/app is missing -- run `npm run build` first')
  process.exit(1)
}

// 1. The landing page, _headers and the _redirects header comments.
cpSync(site, dist, { recursive: true })

// 2. The SPA shell. It has to sit OUTSIDE /app/ and be referenced without an
//    extension: Cloudflare strips .html and rewrites /x/index.html to /x/,
//    either of which puts the destination back inside the pattern it is
//    supposed to serve, which Pages then discards as an infinite loop.
const shell = readFileSync(`${appDist}/index.html`, 'utf-8')
writeFileSync(`${dist}/app-shell.html`, shell)

// 3. A safety net for anything the generated rules somehow miss. Pages serves
//    the requested directory's own 404.html, so this covers one level.
writeFileSync(`${appDist}/404.html`, shell)

// 4. The rules themselves, derived from App.tsx so they cannot drift from it.
const appSource = readFileSync(path('../src/App.tsx'), 'utf-8')
const rules = redirectRulesFor(appSource)
const header = readFileSync(`${site}/_redirects`, 'utf-8').trimEnd()
writeFileSync(`${dist}/_redirects`, `${header}\n\n${rules.join('\n')}\n`)

console.log(`assembled ${dist.replace(root, '')} with ${rules.length} generated redirect rules:`)
for (const rule of rules) console.log(`  ${rule}`)
