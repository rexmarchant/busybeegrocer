import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useGroup } from '../contexts/GroupContext'
import { useShoppingSession } from '../contexts/ShoppingSessionContext'
import { useGroupMembers, profileLabel } from '../lib/hooks'
import { addItemToList, removeItemFromList } from '../lib/listActions'
import { listColorHex, listIconEmoji } from '../lib/constants'
import { SORT_LABELS, buildBlocks, toViewItems, type SortMode, type ViewItem } from '../lib/itemGrouping'
import ConfirmModal from '../components/ConfirmModal'
import IconPicker from '../components/IconPicker'
import type { CatalogItem, Department, ListIcon, ListItem, ShoppingList, Store } from '../types/database'

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
  const [sortMode, setSortMode] = useState<SortMode>('alphabetical')
  const [newItemName, setNewItemName] = useState('')
  const [newItemDept, setNewItemDept] = useState('')
  const [newItemStore, setNewItemStore] = useState('')
  const [pendingBlankConfirm, setPendingBlankConfirm] = useState(false)
  const [infoItemId, setInfoItemId] = useState<string | null>(null)
  const [removeConfirmItem, setRemoveConfirmItem] = useState<ViewItem | null>(null)
  const [confirmAction, setConfirmAction] = useState<'delete' | 'reset' | 'checkAll' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [showShared, setShowShared] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [showQuickList, setShowQuickList] = useState(false)
  const [quickListItems, setQuickListItems] = useState<(ListItem & { name: string })[]>([])
  const [showNotes, setShowNotes] = useState(false)

  const isOwner = list?.owner_id === user?.id
  const isResuming = activeSession?.listId === listId

  useEffect(() => {
    if (!listId || !currentGroup) return
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, currentGroup])

  async function loadAll() {
    if (!listId || !currentGroup) return
    const [{ data: listData }, { data: itemData }, { data: catalogData }, { data: deptData }, { data: storeData }] =
      await Promise.all([
        supabase.from('lists').select('*').eq('id', listId).single(),
        supabase.from('list_items').select('*').eq('list_id', listId).is('removed_at', null),
        supabase.from('catalog_items').select('*').eq('group_id', currentGroup.id),
        supabase.from('departments').select('*').eq('group_id', currentGroup.id).order('sort_order'),
        supabase.from('stores').select('*').eq('group_id', currentGroup.id).order('name'),
      ])

    if (listData) {
      setList(listData as ShoppingList)
      setNameDraft((listData as ShoppingList).name)
    }
    setItems((itemData as ListItem[]) ?? [])
    const catalogMap: Record<string, CatalogItem> = {}
    for (const c of (catalogData as CatalogItem[]) ?? []) catalogMap[c.id] = c
    setCatalog(catalogMap)
    setDepartments((deptData as Department[]) ?? [])
    setStores((storeData as Store[]) ?? [])
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

  const viewItems: ViewItem[] = useMemo(
    () => toViewItems(items, catalog, departmentMap, storeMap),
    [items, catalog, departmentMap, storeMap],
  )

  const uncheckedCount = useMemo(() => viewItems.filter((i) => !i.is_checked).length, [viewItems])

  const blocks = useMemo(() => buildBlocks(viewItems, sortMode), [viewItems, sortMode])

  const notesItems = useMemo(
    () => viewItems.filter((i) => !i.is_checked && i.note?.trim()).sort((a, b) => a.name.localeCompare(b.name)),
    [viewItems],
  )

  function resetAddForm() {
    setNewItemName('')
    setNewItemDept('')
    setNewItemStore('')
    setPendingBlankConfirm(false)
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    if (!listId || !currentGroup || !user || !newItemName.trim()) return

    const missingChoice = !newItemDept || !newItemStore
    if (missingChoice && !pendingBlankConfirm) {
      setPendingBlankConfirm(true)
      return
    }

    await addItemToList({
      groupId: currentGroup.id,
      listId,
      itemName: newItemName,
      userId: user.id,
      departmentId: newItemDept || null,
      storeId: newItemStore || null,
    })
    resetAddForm()
    loadAll()
  }

  async function toggleChecked(item: ViewItem) {
    await supabase.rpc('toggle_list_item_checked', {
      p_item_id: item.id,
      p_checked: !item.is_checked,
    })
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
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3" style={{ borderTop: `4px solid ${color}` }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link to="/" className="text-text-secondary">
            ←
          </Link>
          <button
            onClick={() => isOwner && setShowIconPicker(true)}
            className="text-2xl"
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
              className="flex-1 text-lg font-semibold text-text-primary"
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
          <span className="whitespace-nowrap text-sm text-text-secondary">
            {uncheckedCount} item{uncheckedCount === 1 ? '' : 's'}
          </span>
          <button
            onClick={() => navigate(`/lists/${list.id}/shop`)}
            className="rounded-full px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: color }}
          >
            {isResuming ? '▶ Resume Shopping' : 'Start Shopping'}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        {/* owner tools */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <button onClick={() => setShowShared(true)} className="text-text-secondary underline">
            Shared with {list.is_private ? 'only you' : `${members.length} group member(s)`}
          </button>
          {isOwner && (
            <>
              <span className="text-text-muted">·</span>
              <button onClick={handleTogglePrivate} className="text-text-secondary underline">
                Make {list.is_private ? 'shared' : 'private'}
              </button>
              <span className="text-text-muted">·</span>
              <button onClick={handleDuplicate} className="text-text-secondary underline">
                Duplicate
              </button>
              <span className="text-text-muted">·</span>
              <button
                onClick={() => setConfirmAction('reset')}
                className="text-text-secondary underline"
              >
                Reset counts
              </button>
              <span className="text-text-muted">·</span>
              <button
                onClick={() => setConfirmAction('delete')}
                className="text-status-critical underline"
              >
                Delete list
              </button>
            </>
          )}
        </div>

        {/* add item */}
        <form onSubmit={handleAddItem} className="mb-2 flex gap-2">
          <input
            value={newItemName}
            onChange={(e) => {
              setNewItemName(e.target.value)
              setPendingBlankConfirm(false)
            }}
            placeholder="Add an item…"
            list="catalog-suggestions"
            className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-text-primary outline-none focus:border-primary"
          />
          <datalist id="catalog-suggestions">
            {Object.values(catalog).map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 font-medium text-white">
            Add
          </button>
        </form>
        <div className="mb-1 flex gap-2">
          <select
            value={newItemDept}
            onChange={(e) => {
              setNewItemDept(e.target.value)
              setPendingBlankConfirm(false)
            }}
            className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-secondary outline-none focus:border-primary"
          >
            <option value="">No Category</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={newItemStore}
            onChange={(e) => {
              setNewItemStore(e.target.value)
              setPendingBlankConfirm(false)
            }}
            className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-secondary outline-none focus:border-primary"
          >
            <option value="">No Store</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {pendingBlankConfirm && (
          <p className="mb-4 text-xs text-status-warning">
            No category and/or store selected — tap Add again to add it as "No Category" / "No Store" anyway.
          </p>
        )}
        {!pendingBlankConfirm && <div className="mb-4" />}

        <button
          onClick={() => setConfirmAction('checkAll')}
          className="mb-4 w-full rounded-xl border border-border py-2.5 text-sm text-text-secondary"
        >
          ✓ Check all items
        </button>

        <button
          onClick={() => {
            const next = !showQuickList
            setShowQuickList(next)
            if (next) loadQuickList()
          }}
          className="mb-4 w-full rounded-xl border border-border py-2.5 text-sm text-text-secondary"
        >
          {showQuickList ? 'Hide' : '⚡ Show'} Quick List (most bought)
        </button>

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
        </div>

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
            {blocks.map((block, idx) =>
              block.type === 'header' ? (
                <li
                  key={`h-${idx}`}
                  className={
                    block.level === 1
                      ? 'mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-text-muted first:mt-0'
                      : 'mt-1 pl-3 text-xs font-medium text-text-muted'
                  }
                >
                  {block.label}
                </li>
              ) : (
                <ItemRow
                  key={block.item.id}
                  item={block.item}
                  color={color}
                  onToggleChecked={() => toggleChecked(block.item)}
                  onToggleFavorite={() => toggleFavorite(block.item)}
                  onInfo={() => setInfoItemId(block.item.id)}
                  onRemove={() => setRemoveConfirmItem(block.item)}
                />
              ),
            )}
            {blocks.length === 0 && (
              <p className="py-8 text-center text-text-secondary">No items yet — add your first one above.</p>
            )}
          </ul>
        )}
      </main>

      {infoItem && (
        <ItemInfoModal
          item={infoItem}
          members={members}
          selfId={user?.id}
          departments={departments}
          stores={stores}
          onClose={() => setInfoItemId(null)}
          onSave={async ({ name, note, departmentId, storeId }) => {
            await supabase
              .from('catalog_items')
              .update({ name, department_id: departmentId || null })
              .eq('id', infoItem.catalog_item_id)
            await supabase
              .from('list_items')
              .update({
                note,
                preferred_store_id: storeId || null,
                last_modified_by: user?.id,
                last_modified_at: new Date().toISOString(),
              })
              .eq('id', infoItem.id)
            setInfoItemId(null)
            loadAll()
          }}
        />
      )}

      {showShared && (
        <SharedWithModal members={members} isPrivate={list.is_private} onClose={() => setShowShared(false)} />
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
          {item.quantity > 1 && ` (${item.quantity})`}
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
  onSave: (values: { name: string; note: string; departmentId: string; storeId: string }) => void
}) {
  const [name, setName] = useState(item.name)
  const [note, setNote] = useState(item.note ?? '')
  const [departmentId, setDepartmentId] = useState('')
  const [storeId, setStoreId] = useState(item.preferred_store_id ?? '')

  useEffect(() => {
    // department_id isn't on ViewItem directly; derive it from the departments list by matching name
    const match = departments.find((d) => d.name === item.departmentName)
    setDepartmentId(match?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <label className="mb-3 flex flex-col gap-1.5 text-sm text-text-secondary">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border border-border bg-page px-3 py-2 text-text-primary outline-none focus:border-primary"
          />
        </label>
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
            onClick={() => onSave({ name: name.trim(), note, departmentId, storeId })}
            className="flex-1 rounded-xl bg-primary py-2.5 font-medium text-white"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function SharedWithModal({
  members,
  isPrivate,
  onClose,
}: {
  members: ReturnType<typeof useGroupMembers>['members']
  isPrivate: boolean
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <h3 className="mb-3 text-lg font-semibold text-text-primary">Shared with</h3>
        {isPrivate ? (
          <p className="text-sm text-text-secondary">This list is private — only you can see it.</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-1.5 text-sm text-text-primary">
            {members.map((m) => (
              <li key={m.id}>{m.display_name || m.email}</li>
            ))}
          </ul>
        )}
        <button onClick={onClose} className="w-full rounded-xl border border-border py-2.5 text-text-secondary">
          Close
        </button>
      </div>
    </div>
  )
}
