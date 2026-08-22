import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useGroup } from '../contexts/GroupContext'
import { useShoppingSession } from '../contexts/ShoppingSessionContext'
import { useGroupMembers, profileLabel } from '../lib/hooks'
import { addItemToList, removeItemFromList } from '../lib/listActions'
import { listColorHex, listIconEmoji } from '../lib/constants'
import {
  NO_STORE_FILTER_KEY,
  NO_STORE_LABEL,
  SORT_LABELS,
  buildBlocks,
  filterByStore,
  getAllSectionKeys,
  isBlockCollapsed,
  storeFilterStateOptions,
  storeFilterStorageKey,
  toViewItems,
  type SortMode,
  type ViewItem,
} from '../lib/itemGrouping'
import { FREQUENTLY_BOUGHT_LIMIT, rankFrequentlyBought } from '../lib/frequentlyBought'
import { normalizeQuantity, sanitizeQuantityInput } from '../lib/quantity'
import { usePersistedState } from '../lib/usePersistedState'
import { isNetworkFailure, useOfflineQueue } from '../lib/useOfflineQueue'
import { applyQueuedToggles, loadQueue } from '../lib/offlineQueue'
import { describeCacheAge, listCacheKey, readCache, writeCache, type ListSnapshot } from '../lib/offlineCache'
import CollapseHeader from '../components/CollapseHeader'
import ConfirmModal from '../components/ConfirmModal'
import Menu, { MenuItem } from '../components/Menu'
import { ArrowLeft, Chevron } from '../components/Icons'
import IconPicker from '../components/IconPicker'
import ShoppingPreview from '../components/ShoppingPreview'
import Toast, { useToast } from '../components/Toast'
import type { CatalogItem, Department, ListIcon, ListItem, ShoppingList, Store } from '../types/database'

const EMPTY_SECTION_SET = new Set<string>()

/** The sort modes this screen offers.
 *
 * 'favorites' is deliberately not among them any more. It was a *sort* that
 * floated starred items to the top, which sat oddly beside four real orderings;
 * starring is now a filter, under Filter, where it shows only what you starred.
 * The mode still exists in itemGrouping so an old persisted preference keeps
 * rendering rather than crashing — normalizeSortMode below retires it on sight. */
const LIST_SORT_LABELS = {
  alphabetical: SORT_LABELS.alphabetical,
  category: SORT_LABELS.category,
  store: SORT_LABELS.store,
  store_category: SORT_LABELS.store_category,
} as const

type ListSortMode = keyof typeof LIST_SORT_LABELS

const DEFAULT_SORT: ListSortMode = 'store_category'

function normalizeSortMode(mode: SortMode): ListSortMode {
  return mode in LIST_SORT_LABELS ? (mode as ListSortMode) : DEFAULT_SORT
}

/** The sort preference moved to a new storage key, and this is why.
 *
 * usePersistedState writes on mount, so merely *opening* a list stamped the
 * then-default 'alphabetical' into storage. Every existing list therefore has a
 * saved preference that nobody ever chose, and a new default would never be
 * reached. Reading from a fresh key sidesteps that — and the old key is still
 * consulted once, so a deliberate Category/Store/Store+Category choice carries
 * over. Only 'alphabetical' is discarded, because it is indistinguishable from
 * the default that wrote itself. */
function initialSortMode(sortKey: string | null, legacyKey: string | null): ListSortMode {
  if (!sortKey || !legacyKey) return DEFAULT_SORT
  try {
    if (localStorage.getItem(sortKey) !== null) return DEFAULT_SORT // the hook will read it
    const legacy = localStorage.getItem(legacyKey)
    if (legacy !== null) {
      const value = JSON.parse(legacy) as SortMode
      if (value !== 'alphabetical') return normalizeSortMode(value)
    }
  } catch {
    // Unreadable storage is not a reason to fail to render a list.
  }
  return DEFAULT_SORT
}


export default function ListDetail() {
  const { listId } = useParams<{ listId: string }>()
  const { user } = useAuth()
  const { currentGroup, groups } = useGroup()
  const { activeSession } = useShoppingSession()
  const navigate = useNavigate()
  const { members } = useGroupMembers(currentGroup?.id)

  const [list, setList] = useState<ShoppingList | null>(null)
  const [items, setItems] = useState<ListItem[]>([])
  const [catalog, setCatalog] = useState<Record<string, CatalogItem>>({})
  const [departments, setDepartments] = useState<Department[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const uiKey = (field: string) => (listId ? `busybeegrocer:listUiState:${listId}:${field}` : null)
  const sortDefault = useMemo(
    () => initialSortMode(uiKey('sortOrder'), uiKey('sortMode')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listId],
  )
  const [storedSortMode, setSortMode] = usePersistedState<SortMode>(uiKey('sortOrder'), sortDefault)
  const sortMode = normalizeSortMode(storedSortMode)
  const { toast, showToast, clearToast } = useToast()
  const { pendingCount, queueToggle } = useOfflineQueue(() => {
    loadAll()
    showToast('Back online — your changes have been saved')
  })
  const [showAddItem, setShowAddItem] = useState(false)
  const [infoItemId, setInfoItemId] = useState<string | null>(null)
  const [removeConfirmItem, setRemoveConfirmItem] = useState<ViewItem | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [showFrequentlyBought, setShowFrequentlyBought] = usePersistedState<boolean>(
    uiKey('showFrequentlyBought'),
    false,
  )
  const [frequentItems, setFrequentItems] = useState<(ListItem & { name: string })[]>([])
  const [showShoppingPreview, setShowShoppingPreview] = useState(false)
  const [showNotes, setShowNotes] = usePersistedState<boolean>(uiKey('showNotes'), false)
  const [favoritesOnly, setFavoritesOnly] = usePersistedState<boolean>(uiKey('favoritesOnly'), false)
  /** Which view the Filter menu is showing. The store picker used to be a pane
   * that stayed open under the toolbar, remembered between visits; it is a step
   * inside the menu now, so it starts at the top every time the menu opens. */
  const [showStorePicker, setShowStorePicker] = useState(false)
  const [storeFilterIds, setStoreFilterIds] = usePersistedState<Set<string> | null>(
    listId ? storeFilterStorageKey(listId) : null,
    null,
    storeFilterStateOptions,
  )
  const [collapsedSections, setCollapsedSections] = usePersistedState<Set<string>>(
    uiKey('collapsedSections'),
    new Set(),
    { serialize: (s) => [...s], deserialize: (v) => new Set(v as string[]) },
  )
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  /** When set, the screen is showing cached data of this age rather than
   * anything the server has confirmed. */
  const [staleSince, setStaleSince] = useState<number | null>(null)

  const isOwner = list?.owner_id === user?.id
  const isResuming = activeSession?.listId === listId

  useEffect(() => {
    if (!listId || !currentGroup) return
    // Paint the last-known list first so a cold start -- especially one made
    // standing in a shop with no signal -- shows something usable immediately,
    // rather than an empty list while a request that will never arrive times
    // out. loadAll() replaces it the moment real data lands.
    const cached = readCache<ListSnapshot>(listCacheKey(listId))
    if (cached) {
      applyListData(cached.data)
      setStaleSince(cached.at)
    }
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, currentGroup])

  function applyListData(data: ListSnapshot) {
    if (data.list) {
      setList(data.list)
      setNameDraft(data.list.name)
    }
    // Overlay anything still queued: the snapshot is the last server-confirmed
    // state, the queue is what has happened since. Without this a reload with
    // no signal shows items unchecked under a banner saying they were saved.
    setItems(applyQueuedToggles(data.items, loadQueue()))
    const catalogMap: Record<string, CatalogItem> = {}
    for (const c of data.catalog) catalogMap[c.id] = c
    setCatalog(catalogMap)
    setDepartments(data.departments)
    setStores(data.stores)
  }

  // Frequently Bought's open/closed state is persisted, so a remount with it
  // already open (e.g. coming back from Shopping mode) needs to (re)fetch its
  // data — it isn't persisted itself, only the panel's open/closed toggle is.
  useEffect(() => {
    if (showFrequentlyBought) loadFrequentlyBought()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFrequentlyBought, listId, catalog])

  async function loadAll() {
    if (!listId || !currentGroup) return
    const [listRes, itemRes, catalogRes, deptRes, storeRes] = await Promise.all([
      supabase.from('lists').select('*').eq('id', listId).single(),
      supabase.from('list_items').select('*').eq('list_id', listId).is('removed_at', null),
      supabase.from('catalog_items').select('*').eq('group_id', currentGroup.id),
      supabase.from('departments').select('*').eq('group_id', currentGroup.id).order('sort_order'),
      supabase.from('stores').select('*').eq('group_id', currentGroup.id).order('name'),
    ])

    // A failed read must never blank the screen. This runs after every mutation,
    // and coercing the failure to `[]` used to wipe a list that was there a
    // moment ago. Whatever is already in state is at least as fresh as the
    // cache -- it includes optimistic changes the cache doesn't -- so on failure
    // the right move is to leave it alone and just say the data is stale.
    if (itemRes.error || itemRes.data == null) {
      const cached = readCache<ListSnapshot>(listCacheKey(listId))
      setStaleSince(cached ? cached.at : Date.now())
      return
    }

    const fresh: ListSnapshot = {
      list: (listRes.data as ShoppingList) ?? null,
      items: itemRes.data as ListItem[],
      catalog: (catalogRes.data as CatalogItem[]) ?? [],
      departments: (deptRes.data as Department[]) ?? [],
      stores: (storeRes.data as Store[]) ?? [],
    }
    applyListData(fresh)
    writeCache(listCacheKey(listId), fresh)
    setStaleSince(null)
  }

  async function loadFrequentlyBought() {
    if (!listId) return
    // Everything ever bought on this list, ranked by how often *and* how
    // recently — including items already on the list (shown as "on list") or
    // already checked off (tapping "+ Add" un-checks / re-adds them).
    //
    // Ranking happens here rather than in the query because the score keeps
    // falling with time and the database only holds its value as of the last
    // purchase — see lib/frequentlyBought.ts.
    //
    // The 200 is a candidate cap, not the panel's size. It only bites on a list
    // with more than 200 items that have ever been bought, and what it drops is
    // the least-bought of them.
    const { data } = await supabase
      .from('list_items')
      .select('*')
      .eq('list_id', listId)
      .gt('checked_count', 0)
      .order('checked_count', { ascending: false })
      .limit(200)
    const ranked = rankFrequentlyBought((data as ListItem[]) ?? [], Date.now(), FREQUENTLY_BOUGHT_LIMIT)
    setFrequentItems(ranked.map((i) => ({ ...i, name: catalog[i.catalog_item_id]?.name ?? '(unknown item)' })))
  }

  async function addFromFrequentlyBought(item: ListItem) {
    await supabase
      .from('list_items')
      .update({ removed_at: null, is_checked: false, last_modified_by: user?.id, last_modified_at: new Date().toISOString() })
      .eq('id', item.id)
    loadAll()
    loadFrequentlyBought()
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

  const allViewItems: ViewItem[] = useMemo(
    () => toViewItems(items, catalog, departmentMap, storeMap),
    [items, catalog, departmentMap, storeMap],
  )

  const viewItems: ViewItem[] = useMemo(() => {
    const byStore = filterByStore(allViewItems, storeFilterIds)
    return favoritesOnly ? byStore.filter((i) => i.is_favorite) : byStore
  }, [allViewItems, storeFilterIds, favoritesOnly])

  /** Every store plus the bucket for items without a preferred one: the rows the
   * picker offers, and the yardstick for "all ticked", which means no filter. */
  const storeFilterOptions = useMemo(
    () => [
      ...stores.map((s) => ({ key: s.id, name: s.name })),
      { key: NO_STORE_FILTER_KEY, name: NO_STORE_LABEL },
    ],
    [stores],
  )

  /** What the Filter button counts. Visiting the store picker isn't a filter;
   * having chosen stores in it is. */
  const activeFilterCount =
    (favoritesOnly ? 1 : 0) + (showNotes ? 1 : 0) + (storeFilterIds ? 1 : 0)

  function toggleSection(key: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleCollapseAll() {
    setCollapsedSections((prev) => (prev.size > 0 ? new Set() : new Set(getAllSectionKeys(blocks))))
  }

  function clearFilters() {
    setFavoritesOnly(false)
    setShowNotes(false)
    setStoreFilterIds(null)
  }

  function toggleStoreFilter(key: string) {
    setStoreFilterIds((prev) => {
      const allKeys = storeFilterOptions.map((o) => o.key)
      const base = prev ?? new Set(allKeys)
      const next = new Set(base)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next.size === allKeys.length ? null : next
    })
  }

  const uncheckedCount = useMemo(() => viewItems.filter((i) => !i.is_checked).length, [viewItems])

  const searchedItems = useMemo(() => {
    if (!searchQuery.trim()) return viewItems
    const q = searchQuery.trim().toLowerCase()
    return viewItems.filter((i) => i.name.toLowerCase().includes(q))
  }, [viewItems, searchQuery])

  const blocks = useMemo(() => buildBlocks(searchedItems, sortMode), [searchedItems, sortMode])

  // While actively searching, ignore collapsed-section state so a match hiding
  // inside a collapsed category/store isn't invisible — without touching the
  // real (persisted) collapsedSections, which is restored once search clears.
  const isSearching = searchQuery.trim().length > 0
  const effectiveCollapsed = isSearching ? EMPTY_SECTION_SET : collapsedSections

  const notesItems = useMemo(
    () => viewItems.filter((i) => !i.is_checked && i.note?.trim()).sort((a, b) => a.name.localeCompare(b.name)),
    [viewItems],
  )

  async function handleAddItem(values: {
    name: string
    departmentId: string
    storeId: string
    note: string
    quantity: number
  }) {
    if (!listId || !currentGroup || !user || !values.name.trim()) return
    await addItemToList({
      groupId: currentGroup.id,
      listId,
      itemName: values.name,
      userId: user.id,
      departmentId: values.departmentId || null,
      storeId: values.storeId || null,
      note: values.note.trim() || null,
      quantity: values.quantity,
    })
    setShowAddItem(false)
    loadAll()
  }

  async function toggleChecked(item: ViewItem) {
    const nextChecked = !item.is_checked

    // Same optimistic-then-queue treatment as shopping mode -- see
    // ShoppingModePage.toggle for the reasoning.
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_checked: nextChecked } : i)))

    const { error } = await supabase.rpc('toggle_list_item_checked', {
      p_item_id: item.id,
      p_checked: nextChecked,
    })

    if (error) {
      if (isNetworkFailure(error)) {
        queueToggle(item.id, nextChecked)
        showToast("Offline — saved on your phone, will sync later")
      } else {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_checked: !nextChecked } : i)))
        showToast("Couldn't save that change")
      }
      return
    }

    loadAll()
  }

  async function toggleFavorite(item: ViewItem) {
    await supabase.from('list_items').update({ is_favorite: !item.is_favorite }).eq('id', item.id)
    loadAll()
  }

  async function confirmRemove() {
    if (!removeConfirmItem) return
    await removeItemFromList(removeConfirmItem.id)
    setRemoveConfirmItem(null)
    loadAll()
  }

  async function handleRename() {
    if (!listId || !nameDraft.trim()) return
    await supabase.from('lists').update({ name: nameDraft.trim() }).eq('id', listId)
    setRenaming(false)
    loadAll()
  }

  async function handleChangeIcon(icon: ListIcon) {
    if (!listId) return
    await supabase.from('lists').update({ icon }).eq('id', listId)
    setShowIconPicker(false)
    loadAll()
  }

  if (!list) {
    return <div className="p-6 text-text-secondary">Loading…</div>
  }

  const color = listColorHex(list.color)
  const infoItem = viewItems.find((i) => i.id === infoItemId)

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-page">
      <Toast toast={toast} onDismiss={clearToast} />
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3" style={{ borderTop: `4px solid ${color}` }}>
        {/* Only when there's more than one group to confuse it with. Two groups
            can each hold a "Weekly Shopping", and without this nothing on the
            screen says which one you're adding to. */}
        {groups.length > 1 && currentGroup && (
          <p className="mx-auto mb-1 max-w-2xl text-xs text-text-muted">{currentGroup.name}</p>
        )}
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link to="/" aria-label="Back to your lists" className="shrink-0 text-text-secondary">
            <ArrowLeft />
          </Link>
          <button
            onClick={() => isOwner && setShowIconPicker(true)}
            className="shrink-0 text-2xl"
            aria-label="Change icon"
          >
            {listIconEmoji(list.icon)}
          </button>
          {renaming ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              className="flex-1 rounded-lg border border-border px-2 py-1 text-lg font-semibold text-text-primary"
            />
          ) : (
            <h1
              className="min-w-0 flex-1 truncate text-lg font-semibold text-text-primary"
              onClick={() => isOwner && setRenaming(true)}
            >
              {list.name}
              {list.is_private && (
                <span className="ml-2 rounded-full bg-page px-2 py-0.5 text-xs text-text-muted">
                  Private
                </span>
              )}
            </h1>
          )}
          <span className="shrink-0 whitespace-nowrap text-sm text-text-secondary">
            {uncheckedCount} item{uncheckedCount === 1 ? '' : 's'}
          </span>
          <button
            onClick={() => {
              setShowSearch((v) => !v)
              setSearchQuery('')
            }}
            aria-label="Search items"
            className="shrink-0 text-xl text-text-secondary"
          >
            🔍
          </button>
          <button
            onClick={() => navigate(`/lists/${list.id}/shop`)}
            aria-label={isResuming ? 'Resume shopping' : 'Start shopping'}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: color }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            {isResuming && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400">
                <svg viewBox="0 0 24 24" fill="white" className="h-2.5 w-2.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        {/* Three tiers of emphasis, deliberately: one filled button for the
            thing you came here to do, two soft-blue ones for the panels you
            open beside it, and outlined controls below for changing the view.
            Add Item keeps half the row; Frequently Bought and Shop Preview
            split the rest evenly so neither reads as the lesser of the two. */}
        {/* min-w on the two soft buttons is what stops "Frequently" being cut in
            half on a 320px screen: below that width they wrap to their own line
            and split it evenly instead of clipping. From 360px up they sit
            beside Add Item as intended.

            Frequently Bought carries no chevron. One would cost ~18px of a
            ~70px label area — the single thing that made the text clip — and
            the panel being open is already shown by filling the button, which
            is both louder and free. */}
        <div className="mb-2 flex flex-wrap items-stretch gap-2">
          <button
            onClick={() => setShowAddItem(true)}
            className="w-full shrink-0 rounded-xl bg-primary py-2.5 font-medium text-white min-[360px]:w-1/2"
          >
            + Add Item
          </button>
          <button
            onClick={() => setShowFrequentlyBought((v) => !v)}
            aria-expanded={showFrequentlyBought}
            className={`min-w-[4.5rem] flex-1 rounded-xl border px-1.5 py-2.5 text-xs leading-tight ${
              showFrequentlyBought
                ? 'border-primary bg-primary text-white'
                : 'border-primary-soft-border bg-primary-soft text-primary-hover'
            }`}
          >
            Frequently Bought
          </button>
          <button
            onClick={() => setShowShoppingPreview(true)}
            className="min-w-[4.5rem] flex-1 rounded-xl border border-primary-soft-border bg-primary-soft px-1.5 py-2.5 text-xs leading-tight text-primary-hover"
          >
            👁 Shop Preview
          </button>
        </div>

        {showFrequentlyBought && (
          <ul className="mb-4 flex flex-col gap-1.5">
            {frequentItems.map((item) => {
              const onList = !item.removed_at && !item.is_checked
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2.5"
                >
                  <span className="min-w-0 flex-1 text-text-primary">
                    {item.name} <span className="text-xs text-text-muted">({item.checked_count}×)</span>
                  </span>
                  {onList ? (
                    <span className="shrink-0 text-sm text-text-muted">✓ On list</span>
                  ) : (
                    <button
                      onClick={() => addFromFrequentlyBought(item)}
                      className="shrink-0 text-sm font-medium text-primary"
                    >
                      + Add
                    </button>
                  )}
                </li>
              )
            })}
            {frequentItems.length === 0 && (
              <p className="py-4 text-center text-text-secondary">No purchase history yet on this list.</p>
            )}
          </ul>
        )}

        {showSearch && !showNotes && (
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items…"
            className="mb-3 w-full rounded-xl border border-border bg-surface px-4 py-3 text-base text-text-primary outline-none focus:border-primary"
          />
        )}

        {/* Two menus rather than a wrapping strip of nine chips. The strip made
            every option shout equally and, at four sort modes plus three
            filters, took two lines before a single item was on screen. */}
        <div className="mb-3 flex gap-2">
          <Menu
            className="min-w-0 flex-1"
            label={
              <>
                <span className="min-w-0 truncate">Sort: {LIST_SORT_LABELS[sortMode]}</span>
                <Chevron className="h-4 w-4 shrink-0" />
              </>
            }
          >
            {(close) => (
              <>
                {(Object.keys(LIST_SORT_LABELS) as ListSortMode[]).map((mode) => (
                  <MenuItem
                    key={mode}
                    selected={sortMode === mode}
                    onClick={() => {
                      setSortMode(mode)
                      close()
                    }}
                  >
                    {LIST_SORT_LABELS[mode]}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>

          {/* Filter now behaves exactly like Sort: pick one thing, the menu
              closes, and the count on the button says how many are set. It
              used to stay open after every tap and leave the store picker
              stranded in a pane below — two different ways of dismissing one
              control, which is what made it fiddly. Stores are a step inside
              this menu instead, with Done as the way out. */}
          <Menu
            className="min-w-0 flex-1"
            align="right"
            panelClassName="w-64"
            active={activeFilterCount > 0}
            onClose={() => setShowStorePicker(false)}
            label={
              <>
                <span className="min-w-0 truncate">
                  Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                </span>
                <Chevron className="h-4 w-4 shrink-0" />
              </>
            }
          >
            {(close) =>
              showStorePicker ? (
                <>
                  <div className="flex items-center gap-1 border-b border-border px-2 py-2">
                    <button
                      onClick={() => setShowStorePicker(false)}
                      aria-label="Back to filters"
                      className="shrink-0 rounded-lg p-1 text-text-secondary"
                    >
                      <Chevron direction="left" className="h-5 w-5" />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                      🏬 Store filter
                    </span>
                  </div>

                  {/* Checkboxes, not menu rows: several stores are usually on
                      at once, so ticking one must not dismiss the picker. */}
                  <div className="max-h-56 overflow-y-auto py-1">
                    {storeFilterOptions.map((option) => (
                      <label
                        key={option.key}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-text-primary"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0"
                          checked={!storeFilterIds || storeFilterIds.has(option.key)}
                          onChange={() => toggleStoreFilter(option.key)}
                        />
                        <span className="min-w-0 flex-1">{option.name}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                    {storeFilterIds ? (
                      <button
                        onClick={() => setStoreFilterIds(null)}
                        className="text-sm text-primary underline"
                      >
                        Show all stores
                      </button>
                    ) : (
                      <span className="text-xs text-text-secondary">All stores</span>
                    )}
                    <button
                      onClick={close}
                      className="shrink-0 rounded-lg bg-primary px-4 py-1.5 text-sm text-white"
                    >
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <MenuItem
                    selected={favoritesOnly}
                    onClick={() => {
                      setFavoritesOnly((v) => !v)
                      close()
                    }}
                  >
                    ★ Favorites
                  </MenuItem>
                  <MenuItem
                    selected={showNotes}
                    onClick={() => {
                      setShowNotes((v) => !v)
                      close()
                    }}
                  >
                    📝 Notes
                  </MenuItem>
                  {/* The one row that drills in rather than closing. */}
                  <MenuItem
                    selected={!!storeFilterIds}
                    onClick={() => setShowStorePicker(true)}
                    trailing={<Chevron direction="right" className="h-4 w-4 shrink-0" />}
                  >
                    🏬 Store filter{storeFilterIds ? ` (${storeFilterIds.size})` : ''}
                  </MenuItem>
                  {activeFilterCount > 0 && (
                    <MenuItem
                      onClick={() => {
                        clearFilters()
                        close()
                      }}
                    >
                      Clear filters
                    </MenuItem>
                  )}
                </>
              )
            }
          </Menu>

          {/* Collapsing every section was the only thing left in the old ☰
              menu, so it is the button now — one tap instead of two, and no
              menu to open to find out what is in it. Kept to the same narrow
              width the menu trigger had so the two dropdowns beside it keep
              their room. */}
          {blocks.some((b) => b.type === 'header') && (
            <button
              onClick={toggleCollapseAll}
              aria-label={collapsedSections.size > 0 ? 'Expand all sections' : 'Collapse all sections'}
              className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-border py-2.5 text-text-secondary"
            >
              <Chevron
                direction={collapsedSections.size > 0 ? 'down' : 'up'}
                className="h-5 w-5"
              />
            </button>
          )}
        </div>

        {/* Say plainly that this is a saved copy. A list that silently might be
            out of date is worse than one you know is. */}
        {staleSince !== null && (
          <p className="mb-3 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-secondary">
            📴 Offline — showing your list as saved at {describeCacheAge(staleSince)}.
          </p>
        )}

        {/* Queued work is otherwise invisible, and "did that save?" is exactly
            the doubt this whole change exists to remove. */}
        {pendingCount > 0 && (
          <p className="mb-3 rounded-xl border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-text-secondary">
            ⏳ {pendingCount} change{pendingCount === 1 ? '' : 's'} saved on this phone — they'll sync
            when you're back online.
          </p>
        )}

        {showNotes ? (
          <ul className="flex flex-col gap-1.5">
            {notesItems.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-surface px-3 py-2.5">
                <p className="text-text-primary">
                  {item.name}
                  {item.quantity > 1 && ` (${item.quantity})`}
                </p>
                <p className="mt-0.5 text-sm text-text-secondary">{item.note}</p>
              </li>
            ))}
            {notesItems.length === 0 && (
              <p className="py-8 text-center text-text-secondary">
                No unchecked items have notes right now.
              </p>
            )}
          </ul>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {blocks.map((block, idx) => {
              if (isBlockCollapsed(block, effectiveCollapsed)) return null
              if (block.type === 'header') {
                return (
                  <li key={`h-${idx}`}>
                    <CollapseHeader
                      block={block}
                      collapsed={effectiveCollapsed.has(block.sectionKey)}
                      onToggle={toggleSection}
                    />
                  </li>
                )
              }
              return (
                <ItemRow
                  key={block.item.id}
                  item={block.item}
                  color={color}
                  onToggleChecked={() => toggleChecked(block.item)}
                  onToggleFavorite={() => toggleFavorite(block.item)}
                  onInfo={() => setInfoItemId(block.item.id)}
                />
              )
            })}
            {/* Three different reasons for an empty list, and telling them apart
                matters: "No items yet" in front of a list that is merely
                filtered sends you off to re-add things you already own. Ask in
                the order the items were narrowed — the list itself, then the
                filters, then the search — so the message names the outermost
                cause rather than the last one applied. */}
            {blocks.length === 0 && (
              <li className="py-8 text-center text-text-secondary">
                {allViewItems.length === 0 ? (
                  <p>No items yet — add your first one above.</p>
                ) : viewItems.length === 0 ? (
                  <>
                    <p>Nothing matches the filters you've set.</p>
                    <button onClick={clearFilters} className="mt-2 text-sm text-primary underline">
                      Clear filters
                    </button>
                  </>
                ) : (
                  <p>No items match "{searchQuery.trim()}".</p>
                )}
              </li>
            )}
          </ul>
        )}
      </main>

      {showShoppingPreview && (
        <ShoppingPreview
          list={list}
          items={viewItems}
          stores={stores}
          storeFilterIds={storeFilterIds}
          startLabel={isResuming ? 'Resume shopping' : 'Start shopping'}
          onClose={() => setShowShoppingPreview(false)}
          onStartShopping={() => navigate(`/lists/${list.id}/shop`)}
        />
      )}

      {showAddItem && (
        <AddItemModal
          catalogNames={Object.values(catalog).map((c) => c.name)}
          departments={departments}
          stores={stores}
          onClose={() => setShowAddItem(false)}
          onAdd={handleAddItem}
        />
      )}

      {infoItem && (
        <ItemInfoModal
          item={infoItem}
          members={members}
          selfId={user?.id}
          departments={departments}
          stores={stores}
          onClose={() => setInfoItemId(null)}
          onRemove={() => {
            setInfoItemId(null)
            setRemoveConfirmItem(infoItem)
          }}
          onSave={async ({ name, note, departmentId, storeId, quantity }) => {
            await supabase
              .from('catalog_items')
              .update({ name, department_id: departmentId || null })
              .eq('id', infoItem.catalog_item_id)
            await supabase
              .from('list_items')
              .update({
                note,
                preferred_store_id: storeId || null,
                quantity,
                last_modified_by: user?.id,
                last_modified_at: new Date().toISOString(),
              })
              .eq('id', infoItem.id)
            setInfoItemId(null)
            loadAll()
          }}
        />
      )}

      {showIconPicker && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
            <h3 className="mb-3 text-lg font-semibold text-text-primary">Change icon</h3>
            <IconPicker value={list.icon} onChange={handleChangeIcon} />
            <button
              onClick={() => setShowIconPicker(false)}
              className="mt-4 w-full rounded-xl border border-border py-2.5 text-text-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {removeConfirmItem && (
        <ConfirmModal
          title="Remove this item?"
          message={`Take "${removeConfirmItem.name}" off this list? Its history is kept, so counts pick back up if you add it again.`}
          confirmLabel="Remove"
          danger
          onConfirm={confirmRemove}
          onCancel={() => setRemoveConfirmItem(null)}
        />
      )}
    </div>
  )
}

function ItemRow({
  item,
  color,
  onToggleChecked,
  onToggleFavorite,
  onInfo,
}: {
  item: ViewItem
  color: string
  onToggleChecked: () => void
  onToggleFavorite: () => void
  onInfo: () => void
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition-opacity ${
        item.is_checked ? 'opacity-55' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={item.is_checked}
        onChange={onToggleChecked}
        className="h-5 w-5 accent-current"
        style={{ color }}
      />
      {/* Checked items fade rather than strike through. Strikethrough draws the
          eye — a rule straight across the word is more visual noise, not less —
          where the point of checking something off is for it to stop competing
          with what you still need. The lifetime tallies that used to sit here
          are still counted; they are just a statistic, and not one worth a
          bracket beside every line. */}
      <div className="flex-1">
        <span className={item.is_checked ? 'text-text-secondary' : 'text-text-primary'}>
          {item.name}
          {item.quantity > 1 && <span className="text-text-secondary"> — Qty: {item.quantity}</span>}
        </span>
      </div>
      <button
        onClick={onToggleFavorite}
        aria-label="Favorite"
        className={item.is_favorite ? 'text-status-warning' : 'text-text-muted'}
      >
        ★
      </button>
      <button
        onClick={onInfo}
        aria-label="Item info"
        className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-xs text-text-muted"
      >
        i
      </button>
    </li>
  )
}

function AddItemModal({
  catalogNames,
  departments,
  stores,
  onClose,
  onAdd,
}: {
  catalogNames: string[]
  departments: Department[]
  stores: Store[]
  onClose: () => void
  onAdd: (values: {
    name: string
    departmentId: string
    storeId: string
    note: string
    quantity: number
  }) => void
}) {
  const [name, setName] = useState('')
  // Text, not a number — see lib/quantity.ts for why.
  const [quantity, setQuantity] = useState('1')
  const [departmentId, setDepartmentId] = useState('')
  const [storeId, setStoreId] = useState('')
  const [note, setNote] = useState('')
  const [pendingBlankConfirm, setPendingBlankConfirm] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const missingChoice = !departmentId || !storeId
    if (missingChoice && !pendingBlankConfirm) {
      setPendingBlankConfirm(true)
      return
    }
    onAdd({ name, departmentId, storeId, note, quantity: normalizeQuantity(quantity) })
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-surface p-6"
      >
        <h3 className="mb-3 text-lg font-semibold text-text-primary">Add item</h3>
        <div className="mb-3 flex gap-2">
          <label className="flex flex-1 flex-col gap-1.5 text-sm text-text-secondary">
            Name
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setPendingBlankConfirm(false)
              }}
              placeholder="e.g. Milk"
              list="catalog-suggestions"
              className="rounded-xl border border-border bg-page px-3 py-2 text-text-primary outline-none focus:border-primary"
            />
            <datalist id="catalog-suggestions">
              {catalogNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <label className="flex w-20 flex-col gap-1.5 text-sm text-text-secondary">
            Qty
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={quantity}
              // Focusing selects what's there, so typing a new number replaces it
              // rather than landing beside it and making 12 out of 1 and 2.
              onFocus={(e) => e.target.select()}
              onChange={(e) => setQuantity(sanitizeQuantityInput(e.target.value))}
              onBlur={() => setQuantity((q) => String(normalizeQuantity(q)))}
              className="rounded-xl border border-border bg-page px-3 py-2 text-text-primary outline-none focus:border-primary"
            />
          </label>
        </div>

        <div className="mb-3 flex gap-2">
          <label className="flex flex-1 flex-col gap-1.5 text-sm text-text-secondary">
            Category
            <select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value)
                setPendingBlankConfirm(false)
              }}
              className="rounded-xl border border-border bg-page px-3 py-2 text-text-primary outline-none focus:border-primary"
            >
              <option value="">No Category</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1.5 text-sm text-text-secondary">
            Store
            <select
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value)
                setPendingBlankConfirm(false)
              }}
              className="rounded-xl border border-border bg-page px-3 py-2 text-text-primary outline-none focus:border-primary"
            >
              <option value="">No Store</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mb-4 flex flex-col gap-1.5 text-sm text-text-secondary">
          Note (optional)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="rounded-xl border border-border bg-page px-3 py-2 text-text-primary outline-none focus:border-primary"
          />
        </label>

        {pendingBlankConfirm && (
          <p className="mb-3 text-xs text-status-warning">
            No category and/or store selected — tap Add again to add it as "No Category" / "No Store" anyway.
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-text-secondary"
          >
            Cancel
          </button>
          <button type="submit" className="flex-1 rounded-xl bg-primary py-2.5 font-medium text-white">
            Add
          </button>
        </div>
      </form>
    </div>
  )
}

function ItemInfoModal({
  item,
  members,
  selfId,
  departments,
  stores,
  onClose,
  onRemove,
  onSave,
}: {
  item: ViewItem
  members: ReturnType<typeof useGroupMembers>['members']
  selfId?: string
  departments: Department[]
  stores: Store[]
  onClose: () => void
  onRemove: () => void
  onSave: (values: {
    name: string
    note: string
    departmentId: string
    storeId: string
    quantity: number
  }) => void
}) {
  const [name, setName] = useState(item.name)
  // Text, not a number — see lib/quantity.ts for why.
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [note, setNote] = useState(item.note ?? '')
  const [departmentId, setDepartmentId] = useState('')
  const [storeId, setStoreId] = useState(item.resolvedStoreId ?? '')

  useEffect(() => {
    // department_id isn't on ViewItem directly; derive it from the departments list by matching name
    const match = departments.find((d) => d.name === item.departmentName)
    setDepartmentId(match?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <div className="mb-3 flex gap-2">
          <label className="flex flex-1 flex-col gap-1.5 text-sm text-text-secondary">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border border-border bg-page px-3 py-2 text-text-primary outline-none focus:border-primary"
            />
          </label>
          <label className="flex w-20 flex-col gap-1.5 text-sm text-text-secondary">
            Qty
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={quantity}
              // Focusing selects what's there, so typing a new number replaces it
              // rather than landing beside it and making 12 out of 1 and 2.
              onFocus={(e) => e.target.select()}
              onChange={(e) => setQuantity(sanitizeQuantityInput(e.target.value))}
              onBlur={() => setQuantity((q) => String(normalizeQuantity(q)))}
              className="rounded-xl border border-border bg-page px-3 py-2 text-text-primary outline-none focus:border-primary"
            />
          </label>
        </div>
        <div className="mb-3 flex gap-2">
          <label className="flex flex-1 flex-col gap-1.5 text-sm text-text-secondary">
            Category
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="rounded-xl border border-border bg-page px-3 py-2 text-text-primary outline-none focus:border-primary"
            >
              <option value="">No Category</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1.5 text-sm text-text-secondary">
            Store
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="rounded-xl border border-border bg-page px-3 py-2 text-text-primary outline-none focus:border-primary"
            >
              <option value="">No Store</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* `min-w-0` on the grid columns is the fix for a long address running
            off the side of the modal: a grid track's default minimum is its
            content, so an unbreakable string like an email widens the column
            instead of wrapping. break-words then lets it wrap mid-address —
            emails have no spaces to break at. */}
        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="min-w-0 text-text-muted">Added by</dt>
          <dd className="min-w-0 break-words text-text-primary">
            {profileLabel(members, item.added_by, selfId)}
          </dd>
          <dt className="min-w-0 text-text-muted">Added on</dt>
          <dd className="min-w-0 text-text-primary">{new Date(item.added_at).toLocaleDateString()}</dd>
          <dt className="min-w-0 text-text-muted">Last modified by</dt>
          <dd className="min-w-0 break-words text-text-primary">
            {profileLabel(members, item.last_modified_by, selfId)}
          </dd>
          <dt className="min-w-0 text-text-muted">Last modified</dt>
          <dd className="min-w-0 text-text-primary">
            {new Date(item.last_modified_at).toLocaleDateString()}
          </dd>
        </dl>
        <label className="mb-4 flex flex-col gap-1.5 text-sm text-text-secondary">
          Note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="rounded-xl border border-border bg-page px-3 py-2 text-text-primary outline-none focus:border-primary"
          />
        </label>
        {/* Where the row's ✕ went. Same action, same confirmation — but reached
            deliberately, from inside the item, rather than sitting beside the
            favourite star where a mis-tap removed something silently. */}
        <button
          onClick={onRemove}
          className="mb-4 w-full rounded-xl border border-status-critical/40 py-2.5 text-sm text-status-critical"
        >
          Remove from list
        </button>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-text-secondary">
            Close
          </button>
          <button
            onClick={() =>
              onSave({ name: name.trim(), note, departmentId, storeId, quantity: normalizeQuantity(quantity) })
            }
            className="flex-1 rounded-xl bg-primary py-2.5 font-medium text-white"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
