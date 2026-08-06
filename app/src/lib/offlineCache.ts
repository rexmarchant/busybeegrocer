/** Last-known-good copy of a list, so the app is useful before the network is.
 *
 * The service worker caches the app shell, but every screen read straight from
 * Supabase -- so opening the app cold inside a shop gave you a working shell
 * wrapped around an empty list. Worse, loadAll() runs after every mutation and
 * coerced a failed read to `[]`, which blanked a list that was on screen a
 * moment earlier.
 *
 * Reads now fall back to this cache instead of to nothing. */

// Explicit .ts extension: this module is typechecked both by tsconfig.app.json
// (bundler resolution) and, via its test, by tsconfig.node.json (nodenext),
// and nodenext requires it. Both configs set allowImportingTsExtensions.
import type { CatalogItem, Department, ListItem, ShoppingList, Store } from '../types/database.ts'

/** Bump when the cached shape changes; mismatched envelopes are discarded
 * rather than fed to code that expects different fields. */
const CACHE_VERSION = 1

/** Everything a list screen needs to render.
 *
 * Defined once because the list page and shopping mode share a cache key --
 * whichever you open first populates it for the other. If these drifted apart,
 * one page would silently read fields the other never wrote. */
export interface ListSnapshot {
  list: ShoppingList | null
  items: ListItem[]
  catalog: CatalogItem[]
  departments: Department[]
  stores: Store[]
}

interface CacheEnvelope<T> {
  v: number
  at: number
  data: T
}

export function encodeCache<T>(data: T, now = Date.now()): string {
  const envelope: CacheEnvelope<T> = { v: CACHE_VERSION, at: now, data }
  return JSON.stringify(envelope)
}

/** Returns null for anything unusable -- absent, malformed, or written by an
 * older version of the app. Callers treat null as "no cache" and carry on. */
export function decodeCache<T>(raw: string | null): { data: T; at: number } | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T> | null
    if (!parsed || parsed.v !== CACHE_VERSION || parsed.data == null) return null
    if (typeof parsed.at !== 'number') return null
    return { data: parsed.data, at: parsed.at }
  } catch {
    return null
  }
}

export function listCacheKey(listId: string) {
  return `busybeegrocer:listCache:${listId}`
}

export function readCache<T>(key: string): { data: T; at: number } | null {
  try {
    return decodeCache<T>(localStorage.getItem(key))
  } catch {
    return null
  }
}

export function writeCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, encodeCache(data))
  } catch {
    // Quota exceeded or private mode. A missing cache is a degraded experience,
    // never a broken one, so there is nothing worth doing here.
  }
}

/** "as of 14:32" / "as of Tue 14:32" -- enough to judge whether the list is
 * stale enough to worry about, without a date library. */
export function describeCacheAge(at: number, now = Date.now()): string {
  const cached = new Date(at)
  const sameDay = new Date(now).toDateString() === cached.toDateString()
  const time = cached.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return time
  return `${cached.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`
}
