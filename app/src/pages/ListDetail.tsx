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
import { usePersistedState } from '../lib/usePersistedState'
import { isNetworkFailure, useOfflineQueue } from '../lib/useOfflineQueue'
import { describeCacheAge, listCacheKey, readCache, writeCache, type ListSnapshot } from '../lib/offlineCache'
import CollapseHeader from '../components/CollapseHeader'
import ConfirmModal from '../components/ConfirmModal'
import IconPicker from '../components/IconPicker'
import Toast, { useToast } from '../components/Toast'
import type { CatalogItem, Department, ListIcon, ListItem, ShoppingList, Store } from '../types/database'

const EMPTY_SECTION_SET = new Set<string>()


export default function ListDetail() {
  const { listId } = useParams<{ listId: string }>()
  const { user } = useAuth()
  const { currentGroup } = useGroup()
  const { activeSession } = useShoppingSession()
  const navigate = useNavigate()
  const { members } = useGroupMembers(currentGroup?.id)

  const [list, setList] = useState<ShoppingList | null>(null)
  const [items, setItems] = useState<ListItem[]>([])
  const [catalog, setCatalog] = useState<Record<string, CatalogItem>>({})
  const [departments, setDepartments] = useState<Department[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const uiKey = (field: string) => (listId ? `busybeegrocer:listUiState:${listId}:${field}` : null)
  const [sortMode, setSortMode] = usePersistedState<SortMode>(uiKey('sortMode'), 'alphabetical')
  const { toast, showToast, clearToast } = useToast()
  const { pendingCount, queueToggle } = useOfflineQueue(() => {
    loadAll()
    showToast('Back online — your changes have been saved')
  })
  const [showAddItem, setShowAddItem] = useState(false)
  const [infoItemId, setInfoItemId] = useState<string | null>(null)
  const [removeConfirmItem, setRemoveConfirmItem] = useState<ViewItem | null>(null)
  const [confirmAction, setConfirmAction] = useState<'delete' | 'reset' | 'checkAll' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [showListSettings, setShowListSettings] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [showQuickList, setShowQuickList] = usePersistedState<boolean>(uiKey('showQuickList'), false)
  const [quickListItems, setQuickListItems] = useState<(ListItem & { name: string })[]>([])
  const [showNotes, setShowNotes] = usePersistedState<boolean>(uiKey('showNotes'), false)
  const [showStoreFilter, setShowStoreFilter] = usePersistedState<boolean>(uiKey('showStoreFilter'), false)
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
    setItems(data.items)
    const catalogMap: Record<string, CatalogItem> = {}
    for (const c of data.catalog) catalogMap[c.id] = c
    setCatalog(catalogMap)
    setDepartments(data.departments)
    setStores(data.stores)
  }

  // Quick List's open/closed state is persisted, so a remount with it already
  // open (e.g. coming back from Shopping mode) needs to (re)fetch its data —
  // it isn't persisted itself, only the panel's open/closed toggle is.
  useEffect(() => {
    if (showQuickList) loadQuickList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQuickList, listId, catalog])

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

  async function loadQuickList() {
    if (!listId) return
    // Every item ever bought on this list, most-frequent first — including
    // ones already on the list (shown as "on list") or already checked off
    // (tapping "+ Add" un-checks / re-adds them).
    const { data } = await supabase
      .from('list_items')
      .select('*')
      .eq('list_id', listId)
      .order('checked_count', { ascending: false })
      .limit(25)
    const view = ((data as ListItem[]) ?? [])
      .filter((i) => i.checked_count > 0)
      .map((i) => ({ ...i, name: catalog[i.catalog_item_id]?.name ?? '(unknown item)' }))
    setQuickListItems(view)
  }

  async function quickAdd(item: ListItem) {
    await supabase
      .from('list_items')
      .update({ removed_at: null, is_checked: false, last_modified_by: user?.id, last_modified_at: new Date().toISOString() })
      .eq('id', item.id)
    loadAll()
    loadQuickList()
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

  const viewItems: ViewItem[] = useMemo(
    () => filterByStore(allViewItems, storeFilterIds),
    [allViewItems, storeFilterIds],
  )

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

  function toggleStoreFilter(key: string) {
    setStoreFilterIds((prev) => {
      const allKeys = [...stores.map((s) => s.id), NO_STORE_FILTER_KEY]
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

  async function handleTogglePrivate() {
    if (!listId || !list) return
    await supabase.from('lists').update({ is_private: !list.is_private }).eq('id', listId)
    loadAll()
  }

  async function handleDuplicate() {
    if (!listId || !list || !currentGroup || !user) return
    const { data: existingLists } = await supabase
      .from('lists')
      .select('sort_order')
      .eq('group_id', currentGroup.id)
    const nextSortOrder =
      existingLists && existingLists.length > 0 ? Math.max(...existingLists.map((l) => l.sort_order)) + 1 : 0

    const { data: newList, error } = await supabase
      .from('lists')
      .insert({
        group_id: currentGroup.id,
        owner_id: user.id,
        name: `${list.name} (copy)`,
        icon: list.icon,
        color: list.color,
        is_private: list.is_private,
        sort_order: nextSortOrder,
      })
      .select()
      .single()
    if (error || !newList) return

    for (const item of items) {
      await supabase.from('list_items').insert({
        list_id: newList.id,
        catalog_item_id: item.catalog_item_id,
        quantity: item.quantity,
        note: item.note,
        preferred_store_id: item.preferred_store_id,
        added_by: user.id,
        last_modified_by: user.id,
      })
    }
    navigate(`/lists/${newList.id}`)
  }

  async function handleDelete() {
    if (!listId) return
    await supabase.from('lists').delete().eq('id', listId)
    navigate('/')
  }

  async function handleResetCounts() {
    if (!listId) return
    await supabase.rpc('reset_list_item_counts', { p_list_id: listId })
    setConfirmAction(null)
    loadAll()
  }

  async function handleCheckAll() {
    if (!listId) return
    await supabase.rpc('check_all_list_items', { p_list_id: listId })
    setConfirmAction(null)
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
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link to="/" className="shrink-0 text-2xl text-text-secondary">
            ←
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
            onClick={() => setShowListSettings(true)}
            aria-label="List settings"
            className="shrink-0 text-xl text-text-secondary"
          >
            ⚙️
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
        <button
          onClick={() => setShowAddItem(true)}
          className="mb-4 w-full rounded-xl bg-primary py-2.5 font-medium text-white"
        >
          + Add Item
        </button>

        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setConfirmAction('checkAll')}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm text-text-secondary"
          >
            ✓ Check all
          </button>
          <button
            onClick={() => setShowQuickList((v) => !v)}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm text-text-secondary"
          >
            {showQuickList ? 'Hide' : '⚡'} Quick List
          </button>
        </div>

        {showQuickList && (
          <ul className="mb-4 flex flex-col gap-1.5">
            {quickListItems.map((item) => {
              const onList = !item.removed_at && !item.is_checked
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5"
                >
                  <span className="text-text-primary">
                    {item.name} <span className="text-xs text-text-muted">({item.checked_count}×)</span>
                  </span>
                  {onList ? (
                    <span className="text-sm text-text-muted">✓ On list</span>
                  ) : (
                    <button onClick={() => quickAdd(item)} className="text-sm font-medium text-primary">
                      + Add
                    </button>
                  )}
                </li>
              )
            })}
            {quickListItems.length === 0 && (
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

        {/* sort control + notes toggle */}
        <div className="mb-3 flex flex-wrap gap-1 text-xs">
          {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`rounded-full px-3 py-1.5 ${
                sortMode === mode ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
              }`}
            >
              {SORT_LABELS[mode]}
            </button>
          ))}
          <button
            onClick={() => setShowNotes((v) => !v)}
            className={`rounded-full px-3 py-1.5 ${
              showNotes ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
            }`}
          >
            📝 Notes
          </button>
          <button
            onClick={() => setShowStoreFilter((v) => !v)}
            className={`rounded-full px-3 py-1.5 ${
              storeFilterIds ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
            }`}
          >
            🔎 Filter{storeFilterIds ? ` (${storeFilterIds.size})` : ''}
          </button>
          {blocks.some((b) => b.type === 'header') && (
            <button onClick={toggleCollapseAll} className="rounded-full bg-surface px-3 py-1.5 text-text-secondary">
              {collapsedSections.size > 0 ? 'Expand all' : 'Collapse all'}
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

        {showStoreFilter && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
            {stores.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={!storeFilterIds || storeFilterIds.has(s.id)}
                  onChange={() => toggleStoreFilter(s.id)}
                />
                {s.name}
              </label>
            ))}
            <label className="flex items-center gap-1.5 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={!storeFilterIds || storeFilterIds.has(NO_STORE_FILTER_KEY)}
                onChange={() => toggleStoreFilter(NO_STORE_FILTER_KEY)}
              />
              No Preferred Store
            </label>
            {storeFilterIds && (
              <button onClick={() => setStoreFilterIds(null)} className="text-sm text-primary underline">
                Show all stores
              </button>
            )}
          </div>
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
                  onRemove={() => setRemoveConfirmItem(block.item)}
                />
              )
            })}
            {blocks.length === 0 && (
              <p className="py-8 text-center text-text-secondary">No items yet — add your first one above.</p>
            )}
          </ul>
        )}
      </main>

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

      {showListSettings && (
        <ListSettingsModal
          list={list}
          isOwner={isOwner}
          members={members}
          onClose={() => setShowListSettings(false)}
          onTogglePrivate={handleTogglePrivate}
          onDuplicate={handleDuplicate}
          onResetCounts={() => {
            setShowListSettings(false)
            setConfirmAction('reset')
          }}
          onDelete={() => {
            setShowListSettings(false)
            setConfirmAction('delete')
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

      {confirmAction === 'delete' && (
        <ConfirmModal
          title="Delete this list?"
          message="This permanently deletes the list and all its items. This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === 'reset' && (
        <ConfirmModal
          title="Reset all counts?"
          message="This zeroes out the lifetime checked/unchecked tally for every item on this list. This cannot be undone."
          confirmLabel="Reset counts"
          danger
          onConfirm={handleResetCounts}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === 'checkAll' && (
        <ConfirmModal
          title="Check all items?"
          message={`This marks all ${uncheckedCount} unchecked item${uncheckedCount === 1 ? '' : 's'} on this list as checked.`}
          confirmLabel="Check all"
          danger
          onConfirm={handleCheckAll}
          onCancel={() => setConfirmAction(null)}
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
  onRemove,
}: {
  item: ViewItem
  color: string
  onToggleChecked: () => void
  onToggleFavorite: () => void
  onInfo: () => void
  onRemove: () => void
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
      <input
        type="checkbox"
        checked={item.is_checked}
        onChange={onToggleChecked}
        className="h-5 w-5 accent-current"
        style={{ color }}
      />
      <div className="flex-1">
        <span className={item.is_checked ? 'text-text-muted line-through' : 'text-text-primary'}>
          {item.name}
          {item.quantity > 1 && <span className="text-text-secondary"> — Qty: {item.quantity}</span>}
        </span>{' '}
        <span className="text-xs text-text-muted">
          ({item.checked_count}/{item.unchecked_count})
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
      <button onClick={onRemove} aria-label="Remove" className="text-text-muted">
        ✕
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
  const [quantity, setQuantity] = useState(1)
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
    onAdd({ name, departmentId, storeId, note, quantity: quantity || 1 })
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
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
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
  onSave,
}: {
  item: ViewItem
  members: ReturnType<typeof useGroupMembers>['members']
  selfId?: string
  departments: Department[]
  stores: Store[]
  onClose: () => void
  onSave: (values: {
    name: string
    note: string
    departmentId: string
    storeId: string
    quantity: number
  }) => void
}) {
  const [name, setName] = useState(item.name)
  const [quantity, setQuantity] = useState(item.quantity)
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
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
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

        <dl className="mb-4 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-text-muted">Added by</dt>
          <dd className="text-text-primary">{profileLabel(members, item.added_by, selfId)}</dd>
          <dt className="text-text-muted">Added on</dt>
          <dd className="text-text-primary">{new Date(item.added_at).toLocaleDateString()}</dd>
          <dt className="text-text-muted">Last modified by</dt>
          <dd className="text-text-primary">{profileLabel(members, item.last_modified_by, selfId)}</dd>
          <dt className="text-text-muted">Last modified</dt>
          <dd className="text-text-primary">{new Date(item.last_modified_at).toLocaleDateString()}</dd>
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
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-text-secondary">
            Close
          </button>
          <button
            onClick={() => onSave({ name: name.trim(), note, departmentId, storeId, quantity })}
            className="flex-1 rounded-xl bg-primary py-2.5 font-medium text-white"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function ListSettingsModal({
  list,
  isOwner,
  members,
  onClose,
  onTogglePrivate,
  onDuplicate,
  onResetCounts,
  onDelete,
}: {
  list: ShoppingList
  isOwner: boolean
  members: ReturnType<typeof useGroupMembers>['members']
  onClose: () => void
  onTogglePrivate: () => void
  onDuplicate: () => void
  onResetCounts: () => void
  onDelete: () => void
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <h3 className="mb-3 text-lg font-semibold text-text-primary">List settings</h3>

        <p className="mb-1.5 text-sm font-medium text-text-secondary">Shared with</p>
        {list.is_private ? (
          <p className="mb-4 text-sm text-text-secondary">This list is private — only you can see it.</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-1 text-sm text-text-primary">
            {members.map((m) => (
              <li key={m.id}>{m.display_name || m.email}</li>
            ))}
          </ul>
        )}

        {isOwner && (
          <div className="mb-4 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
            <button onClick={onTogglePrivate} className="px-4 py-3 text-left text-text-primary">
              Make {list.is_private ? 'shared' : 'private'}
            </button>
            <button onClick={onDuplicate} className="px-4 py-3 text-left text-text-primary">
              Duplicate list
            </button>
            <button onClick={onResetCounts} className="px-4 py-3 text-left text-text-primary">
              Reset counts
            </button>
            <button onClick={onDelete} className="px-4 py-3 text-left text-status-critical">
              Delete list
            </button>
          </div>
        )}

        <button onClick={onClose} className="w-full rounded-xl border border-border py-2.5 text-text-secondary">
          Close
        </button>
      </div>
    </div>
  )
}
