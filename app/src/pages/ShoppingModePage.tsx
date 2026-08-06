import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useGroup } from '../contexts/GroupContext'
import { useShoppingSession } from '../contexts/ShoppingSessionContext'
import { listColorHex, listIconEmoji } from '../lib/constants'
import {
  NO_STORE_FILTER_KEY,
  NO_STORE_LABEL,
  buildBlocks,
  filterByStore,
  getAllSectionKeys,
  isBlockCollapsed,
  sortByName,
  storeFilterStateOptions,
  storeFilterStorageKey,
  toViewItems,
  type SortMode,
  type ViewItem,
} from '../lib/itemGrouping'
import { usePersistedState } from '../lib/usePersistedState'
import CollapseHeader from '../components/CollapseHeader'
import Toast, { useToast } from '../components/Toast'
import type { CatalogItem, Department, ListItem, ShoppingList, Store } from '../types/database'

const SHOP_SORT_LABELS: Record<Exclude<SortMode, 'favorites'>, string> = {
  alphabetical: 'Alphabetical',
  category: 'Category',
  store: 'Store',
  store_category: 'Store + Category',
}

function sessionItemsKey(sessionId: string) {
  return `busybeegrocer:sessionItems:${sessionId}`
}

export default function ShoppingModePage() {
  const { listId } = useParams<{ listId: string }>()
  const { currentGroup } = useGroup()
  const { activeSession, startSession, clearSession } = useShoppingSession()
  const navigate = useNavigate()

  const [list, setList] = useState<ShoppingList | null>(null)
  const [items, setItems] = useState<ListItem[]>([])
  const [catalog, setCatalog] = useState<Record<string, CatalogItem>>({})
  const [departments, setDepartments] = useState<Department[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const shopUiKey = (field: string) => (listId ? `busybeegrocer:shopUiState:${listId}:${field}` : null)
  const [sortMode, setSortMode] = usePersistedState<Exclude<SortMode, 'favorites'>>(
    shopUiKey('sortMode'),
    'alphabetical',
  )
  const [collapsedSections, setCollapsedSections] = usePersistedState<Set<string>>(
    shopUiKey('collapsedSections'),
    new Set(),
    { serialize: (s) => [...s], deserialize: (v) => new Set(v as string[]) },
  )
  // Shares its storage key with the list page, so whatever store filter is set there
  // carries straight into this trip.
  const [storeFilterIds] = usePersistedState<Set<string> | null>(
    listId ? storeFilterStorageKey(listId) : null,
    null,
    storeFilterStateOptions,
  )
  // loadItems() runs from init()'s closure, so read the filter through a ref to be sure
  // it sees the current value rather than the one captured at mount.
  const storeFilterRef = useRef(storeFilterIds)
  storeFilterRef.current = storeFilterIds
  const [elapsed, setElapsed] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const { toast, showToast, clearToast } = useToast()
  const [ended, setEnded] = useState<{
    completed: boolean
    percent: number
    seconds: number
    sessionItems: ViewItem[]
  } | null>(null)
  const intervalRef = useRef<number | null>(null)
  // Refs (not state) so finish()/loadItems() always see the current session,
  // even when called synchronously from init() before a re-render lands —
  // e.g. right after the page reloads coming back from the mail app.
  const sessionIdRef = useRef<string | null>(null)
  const startedAtRef = useRef<number | null>(null)
  // Ids of items that were ever "still needed" during this session — i.e. what
  // this trip was actually shopping for, as opposed to the whole list (which
  // may include items already checked off before this session even started).
  // Persisted to localStorage too, so a page reload mid-session doesn't lose it.
  const sessionItemIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!listId || !currentGroup) return
    init()
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, currentGroup])

  async function init() {
    if (!listId || !currentGroup) return
    const { data: listData } = await supabase.from('lists').select('*').eq('id', listId).single()
    setList(listData as ShoppingList)

    let activeSessionId: string
    let activeStartedAt: number

    if (activeSession && activeSession.listId === listId) {
      // Resuming a session that was paused, not ended.
      activeSessionId = activeSession.sessionId
      activeStartedAt = activeSession.startedAt
    } else {
      const { data: sessionIdData } = await supabase.rpc('start_shopping_session', {
        p_list_id: listId,
      })
      activeSessionId = sessionIdData as string
      activeStartedAt = Date.now()
      startSession(listId, activeSessionId, activeStartedAt)
    }

    sessionIdRef.current = activeSessionId
    startedAtRef.current = activeStartedAt
    const storedItemIds = localStorage.getItem(sessionItemsKey(activeSessionId))
    sessionItemIdsRef.current = new Set(storedItemIds ? (JSON.parse(storedItemIds) as string[]) : [])
    intervalRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - activeStartedAt) / 1000))
    }, 1000)
    setElapsed(Math.floor((Date.now() - activeStartedAt) / 1000))

    await loadItems()
  }

  async function loadItems() {
    if (!listId || !currentGroup) return
    const [{ data: itemData }, { data: catalogData }, { data: deptData }, { data: storeData }] = await Promise.all([
      supabase.from('list_items').select('*').eq('list_id', listId).is('removed_at', null),
      supabase.from('catalog_items').select('*').eq('group_id', currentGroup.id),
      supabase.from('departments').select('*').eq('group_id', currentGroup.id).order('sort_order'),
      supabase.from('stores').select('*').eq('group_id', currentGroup.id).order('name'),
    ])
    const catalogMap: Record<string, CatalogItem> = {}
    for (const c of (catalogData as CatalogItem[]) ?? []) catalogMap[c.id] = c
    const deptMap: Record<string, Department> = {}
    for (const d of (deptData as Department[]) ?? []) deptMap[d.id] = d
    const storeMapLocal: Record<string, Store> = {}
    for (const s of (storeData as Store[]) ?? []) storeMapLocal[s.id] = s

    setCatalog(catalogMap)
    setDepartments((deptData as Department[]) ?? [])
    setStores((storeData as Store[]) ?? [])

    const loadedItems = (itemData as ListItem[]) ?? []
    setItems(loadedItems)

    // Only items the current store filter lets through count towards this trip —
    // anything filtered out isn't what we're shopping for right now.
    const loadedViewItems = filterByStore(
      toViewItems(loadedItems, catalogMap, deptMap, storeMapLocal),
      storeFilterRef.current,
    )

    // Anything currently unchecked is (still) part of what this trip is
    // shopping for — accumulate rather than overwrite, so items already
    // checked off earlier in the session stay counted too.
    for (const item of loadedViewItems) {
      if (!item.is_checked) sessionItemIdsRef.current.add(item.id)
    }
    if (sessionIdRef.current) {
      localStorage.setItem(
        sessionItemsKey(sessionIdRef.current),
        JSON.stringify([...sessionItemIdsRef.current]),
      )
    }

    const remaining = loadedViewItems.filter((i) => !i.is_checked).length
    if (loadedViewItems.length > 0 && remaining === 0) {
      finish(true, loadedViewItems)
    }
  }

  function toggleSection(key: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleCollapseAll() {
    setCollapsedSections((prev) => (prev.size > 0 ? new Set() : new Set(getAllSectionKeys(remainingBlocks))))
  }

  async function handleRefresh() {
    setRefreshing(true)
    await loadItems()
    setRefreshing(false)
  }

  function handlePause() {
    if (intervalRef.current) window.clearInterval(intervalRef.current)
    // Deliberately don't end the session — it stays active so Resume picks up where we left off.
    navigate(`/lists/${listId}`)
  }

  async function toggle(item: ViewItem) {
    const nextChecked = !item.is_checked

    // Update locally first. Signal inside a shop is often the least reliable
    // thing in the building, and a checkbox that waits on a round trip before
    // moving reads as broken -- which is exactly what it used to do.
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_checked: nextChecked } : i)))

    const { error } = await supabase.rpc('toggle_list_item_checked', {
      p_item_id: item.id,
      p_checked: nextChecked,
    })

    if (error) {
      // Put it back and say so. Silently reverting is worse than not moving at
      // all -- you'd walk away believing the item was checked off.
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_checked: !nextChecked } : i)))
      showToast(
        navigator.onLine ? "Couldn't save that change" : "You're offline — that change didn't save",
      )
      return
    }

    await loadItems()
  }

  async function finish(completed: boolean, currentItems: ViewItem[]) {
    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) return
    if (intervalRef.current) window.clearInterval(intervalRef.current)
    const seconds = startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : 0
    await supabase.rpc('end_shopping_session', { p_session_id: currentSessionId, p_completed: completed })
    clearSession()
    localStorage.removeItem(sessionItemsKey(currentSessionId))

    const sessionItems = currentItems.filter((i) => sessionItemIdsRef.current.has(i.id))
    const checkedCount = sessionItems.filter((i) => i.is_checked).length
    const percent = sessionItems.length > 0 ? Math.round((checkedCount / sessionItems.length) * 100) : 0
    setEnded({ completed, percent, seconds, sessionItems })
  }

  const departmentMap = useMemo(() => {
    const m: Record<string, Department> = {}
    for (const d of departments) m[d.id] = d
    return m
  }, [departments])
  const storeMap = useMemo(() => {
    const m: Record<string, Store> = {}
    for (const s of stores) m[s.id] = s
    return m
  }, [stores])

  // Filtered by the list page's store filter, so every count and list below —
  // "left to get", "in cart", and the emailed summary — covers only what's visible.
  const viewItems = useMemo(
    () => filterByStore(toViewItems(items, catalog, departmentMap, storeMap), storeFilterIds),
    [items, catalog, departmentMap, storeMap, storeFilterIds],
  )
  const remaining = useMemo(() => viewItems.filter((i) => !i.is_checked), [viewItems])
  const filterLabel = useMemo(() => {
    if (!storeFilterIds) return null
    const names = stores.filter((s) => storeFilterIds.has(s.id)).map((s) => s.name)
    if (storeFilterIds.has(NO_STORE_FILTER_KEY)) names.push(NO_STORE_LABEL)
    return names.length > 0 ? names.join(', ') : 'nothing (no stores selected)'
  }, [storeFilterIds, stores])
  // "In cart" is scoped to this shopping trip only — items checked off elsewhere
  // (or already checked before the trip started) aren't part of what we're
  // shopping for right now, so they shouldn't clutter this list.
  const inCart = useMemo(
    () => sortByName(viewItems.filter((i) => i.is_checked && sessionItemIdsRef.current.has(i.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewItems],
  )
  const remainingBlocks = useMemo(() => buildBlocks(remaining, sortMode), [remaining, sortMode])

  if (!list) return <div className="p-6 text-text-secondary">Starting shopping mode…</div>

  const color = listColorHex(list.color)

  if (ended) {
    return ended.completed ? (
      <CongratsScreen
        list={list}
        seconds={ended.seconds}
        items={ended.sessionItems}
        onDone={() => navigate(`/lists/${list.id}`)}
      />
    ) : (
      <BetterLuckScreen
        list={list}
        percent={ended.percent}
        items={ended.sessionItems}
        onDone={() => navigate(`/lists/${list.id}`)}
      />
    )
  }

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-page">
      <Toast toast={toast} onDismiss={clearToast} />
      <header className="sticky top-0 z-10 px-4 py-4 text-white" style={{ backgroundColor: color }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <p className="text-sm opacity-90">
              {listIconEmoji(list.icon)} {list.name}
            </p>
            <p className="text-2xl font-semibold tabular-nums">{formatTime(elapsed)}</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleRefresh}
              aria-label="Refresh list"
              className={`text-xl ${refreshing ? 'animate-spin' : ''}`}
            >
              ↻
            </button>
            <div className="text-right">
              <p className="text-3xl font-bold tabular-nums">{remaining.length}</p>
              <p className="text-xs opacity-90">left to get</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        <div className="mb-3 flex flex-wrap gap-1 text-xs">
          {(Object.keys(SHOP_SORT_LABELS) as Exclude<SortMode, 'favorites'>[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`rounded-full px-3 py-1.5 ${
                sortMode === mode ? '' : 'bg-surface text-text-secondary'
              }`}
              style={sortMode === mode ? { backgroundColor: color, color: 'white' } : undefined}
            >
              {SHOP_SORT_LABELS[mode]}
            </button>
          ))}
          {remainingBlocks.some((b) => b.type === 'header') && (
            <button onClick={toggleCollapseAll} className="rounded-full bg-surface px-3 py-1.5 text-text-secondary">
              {collapsedSections.size > 0 ? 'Expand all' : 'Collapse all'}
            </button>
          )}
        </div>

        {filterLabel && (
          <p className="mb-3 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-secondary">
            🔎 Showing {filterLabel} — change the filter on the list page.
          </p>
        )}

        <ul className="mb-6 flex flex-col gap-1.5">
          {remainingBlocks.map((block, idx) => {
            if (isBlockCollapsed(block, collapsedSections)) return null
            if (block.type === 'header') {
              return (
                <li key={`h-${idx}`}>
                  <CollapseHeader
                    block={block}
                    collapsed={collapsedSections.has(block.sectionKey)}
                    onToggle={toggleSection}
                  />
                </li>
              )
            }
            return (
              <li key={block.item.id}>
                <button
                  onClick={() => toggle(block.item)}
                  className="flex w-full items-start gap-3 rounded-xl border border-border bg-surface px-3 py-3 text-left"
                >
                  <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2" style={{ borderColor: color }} />
                  <span className="flex-1">
                    <span className="block text-text-primary">
                      {block.item.name}
                      {block.item.quantity > 1 && (
                        <span className="text-text-secondary"> — Qty: {block.item.quantity}</span>
                      )}
                    </span>
                    {block.item.note?.trim() && (
                      <span className="mt-0.5 block text-sm text-text-secondary">{block.item.note}</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
          {remaining.length === 0 && items.length > 0 && (
            <p className="py-4 text-center text-text-secondary">Everything's in the cart!</p>
          )}
        </ul>

        {inCart.length > 0 && (
          <>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
              In cart ({inCart.length})
            </p>
            <ul className="flex flex-col gap-1.5">
              {inCart.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => toggle(item)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-page px-3 py-3 text-left"
                  >
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full text-xs text-white"
                      style={{ backgroundColor: color }}
                    >
                      ✓
                    </span>
                    <span className="flex-1 text-text-muted line-through">{item.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <div className="sticky bottom-0 flex gap-2 border-t border-border bg-surface p-4">
        <button
          onClick={handlePause}
          className="mx-auto block w-full max-w-2xl rounded-xl border border-border py-3 font-medium text-text-secondary"
        >
          ⏸ Pause &amp; go back
        </button>
        <button
          onClick={() => finish(false, viewItems)}
          className="mx-auto block w-full max-w-2xl rounded-xl border border-border py-3 font-medium text-text-secondary"
        >
          Finished shopping
        </button>
      </div>
    </div>
  )
}

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function buildMailtoLink(subject: string, items: ViewItem[]): string {
  const line = (i: ViewItem) => `- ${i.name}${i.quantity > 1 ? ` — Qty: ${i.quantity}` : ''}`
  const purchased = sortByName(items.filter((i) => i.is_checked))
  const notPurchased = sortByName(items.filter((i) => !i.is_checked))

  const sections: string[] = []
  if (purchased.length > 0) {
    sections.push(`PURCHASED (${purchased.length}):\n${purchased.map(line).join('\n')}`)
  }
  if (notPurchased.length > 0) {
    sections.push(`NOT PURCHASED (${notPurchased.length}):\n${notPurchased.map(line).join('\n')}`)
  }
  const body = sections.length > 0 ? sections.join('\n\n') : 'No items on this trip.'

  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function sendList(subject: string, items: ViewItem[]) {
  // A clicked anchor is less likely to trigger a full page reload on
  // mobile browsers than setting window.location.href directly — that
  // reload was wiping this screen's state when returning from Mail.
  const link = document.createElement('a')
  link.href = buildMailtoLink(subject, items)
  link.click()
}

/** A blur/focus flicker this soon after the click is the browser handing off to the
 * mail app (or declining to), not the user coming back from it. */
const MAIL_RETURN_GRACE_MS = 1000

/** "Send this list" should finish the trip the way Done does, but only once the mail
 * app has actually had the message. mailto: gives no completion callback, so the cue
 * is this tab regaining focus — i.e. the user is back from Mail — at which point we
 * leave rather than dumping them back on the finished screen. If the mail app never
 * opens, nothing fires and the buttons simply stay put. */
function useSendThenDone(onDone: () => void) {
  const pendingRef = useRef(false)
  const sentAtRef = useRef(0)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    function handleReturn() {
      if (!pendingRef.current) return
      if (document.visibilityState !== 'visible') return
      if (Date.now() - sentAtRef.current < MAIL_RETURN_GRACE_MS) return
      pendingRef.current = false
      onDoneRef.current()
    }
    window.addEventListener('focus', handleReturn)
    document.addEventListener('visibilitychange', handleReturn)
    return () => {
      window.removeEventListener('focus', handleReturn)
      document.removeEventListener('visibilitychange', handleReturn)
    }
  }, [])

  return (subject: string, items: ViewItem[]) => {
    pendingRef.current = true
    sentAtRef.current = Date.now()
    sendList(subject, items)
  }
}

function CongratsScreen({
  list,
  seconds,
  items,
  onDone,
}: {
  list: ShoppingList
  seconds: number
  items: ViewItem[]
  onDone: () => void
}) {
  const color = listColorHex(list.color)
  const sendThenDone = useSendThenDone(onDone)
  const date = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="flex min-h-svh flex-1 flex-col items-center justify-center px-6 text-center text-white" style={{ backgroundColor: color }}>
      <p className="mb-2 text-5xl">🎉</p>
      <h1 className="mb-2 text-2xl font-bold">Congratulations!</h1>
      <p className="mb-1 opacity-90">You finished {list.name}</p>
      <p className="mb-6 opacity-90">
        {date} · {formatTime(seconds)}
      </p>
      <button
        onClick={() => sendThenDone(`${list.name} — shopping list`, items)}
        className="mb-3 w-full max-w-xs rounded-xl bg-white/20 py-3 font-medium"
      >
        Send this list
      </button>
      <button onClick={onDone} className="w-full max-w-xs rounded-xl bg-white py-3 font-medium" style={{ color }}>
        Done
      </button>
    </div>
  )
}

function BetterLuckScreen({
  list,
  percent,
  items,
  onDone,
}: {
  list: ShoppingList
  percent: number
  items: ViewItem[]
  onDone: () => void
}) {
  const sendThenDone = useSendThenDone(onDone)

  return (
    <div className="flex min-h-svh flex-1 flex-col items-center justify-center bg-page px-6 text-center">
      <p className="mb-2 text-5xl">🤷</p>
      <h1 className="mb-2 text-2xl font-bold text-text-primary">Better luck next time</h1>
      <p className="mb-6 text-text-secondary">You got {percent}% of the list</p>
      <button
        onClick={() => sendThenDone(`${list.name} — shopping list`, items)}
        className="mb-3 w-full max-w-xs rounded-xl border border-border bg-surface py-3 font-medium text-text-primary"
      >
        Send this list
      </button>
      <button onClick={onDone} className="w-full max-w-xs rounded-xl bg-primary py-3 font-medium text-white">
        Done
      </button>
    </div>
  )
}
