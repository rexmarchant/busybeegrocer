import { useEffect, useMemo } from 'react'
import { listColorHex, listIconEmoji } from '../lib/constants'
import {
  SHOP_SORT_LABELS,
  buildBlocks,
  describeStoreFilter,
  getAllSectionKeys,
  isBlockCollapsed,
  shopUiStateKey,
  type SortMode,
  type ViewItem,
} from '../lib/itemGrouping'
import { usePersistedState } from '../lib/usePersistedState'
import CollapseHeader from './CollapseHeader'
import type { ShoppingList, Store } from '../types/database'

/**
 * Shopping mode, read-only: what you'd be shopping for, grouped and sorted the
 * way the trip itself will be, without starting a trip. Nothing here writes to
 * an item — no timer runs, no session is opened, nothing can be ticked off by
 * accident while you're only looking.
 *
 * It shares shopping mode's persisted sort and collapsed-section state (and
 * inherits the list page's store filter, as shopping mode does), so what you
 * see here is what you'll get when you tap the trolley.
 */
export default function ShoppingPreview({
  list,
  items,
  stores,
  storeFilterIds,
  startLabel,
  onClose,
  onStartShopping,
}: {
  list: ShoppingList
  /** Every item on the list, already store-filtered. Unchecked ones are the preview. */
  items: ViewItem[]
  stores: Store[]
  storeFilterIds: Set<string> | null
  /** "Start shopping", or "Resume shopping" when a trip is already open. */
  startLabel: string
  onClose: () => void
  onStartShopping: () => void
}) {
  const [sortMode, setSortMode] = usePersistedState<Exclude<SortMode, 'favorites'>>(
    shopUiStateKey(list.id, 'sortMode'),
    'alphabetical',
  )
  const [collapsedSections, setCollapsedSections] = usePersistedState<Set<string>>(
    shopUiStateKey(list.id, 'collapsedSections'),
    new Set(),
    { serialize: (s) => [...s], deserialize: (v) => new Set(v as string[]) },
  )

  const remaining = useMemo(() => items.filter((i) => !i.is_checked), [items])
  const checkedCount = items.length - remaining.length
  const blocks = useMemo(() => buildBlocks(remaining, sortMode), [remaining, sortMode])
  const filterLabel = useMemo(() => describeStoreFilter(storeFilterIds, stores), [storeFilterIds, stores])
  const color = listColorHex(list.color)

  // Escape closes it, like every other overlay in the app.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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

  return (
    <div className="fixed inset-0 z-30 flex flex-col overflow-y-auto bg-page">
      <header className="sticky top-0 z-10 px-4 py-4 text-white" style={{ backgroundColor: color }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide opacity-90">👁 Shopping preview</p>
            <p className="truncate text-sm opacity-90">
              {listIconEmoji(list.icon)} {list.name}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-3xl font-bold tabular-nums">{remaining.length}</p>
              <p className="text-xs opacity-90">to get</p>
            </div>
            <button onClick={onClose} aria-label="Close preview" className="text-2xl leading-none">
              ✕
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
        <div className="mb-3 flex flex-wrap gap-1 text-xs">
          {(Object.keys(SHOP_SORT_LABELS) as Exclude<SortMode, 'favorites'>[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`rounded-full px-3 py-1.5 ${sortMode === mode ? '' : 'bg-surface text-text-secondary'}`}
              style={sortMode === mode ? { backgroundColor: color, color: 'white' } : undefined}
            >
              {SHOP_SORT_LABELS[mode]}
            </button>
          ))}
          {blocks.some((b) => b.type === 'header') && (
            <button onClick={toggleCollapseAll} className="rounded-full bg-surface px-3 py-1.5 text-text-secondary">
              {collapsedSections.size > 0 ? 'Expand all' : 'Collapse all'}
            </button>
          )}
        </div>

        <p className="mb-3 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-secondary">
          Everything still to get, as shopping mode will show it. Nothing here can be
          ticked off — start shopping to do that.
          {checkedCount > 0 && ` ${checkedCount} already-checked item${checkedCount === 1 ? ' is' : 's are'} hidden.`}
        </p>

        {filterLabel && (
          <p className="mb-3 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-secondary">
            🔎 Showing {filterLabel} — change the filter on the list page.
          </p>
        )}

        <ul className="mb-6 flex flex-col gap-1.5">
          {blocks.map((block, idx) => {
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
              <li
                key={block.item.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-surface px-3 py-3"
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
              </li>
            )
          })}
          {remaining.length === 0 && (
            <p className="py-8 text-center text-text-secondary">
              {items.length === 0
                ? 'Nothing on this list yet.'
                : "Nothing left to get — it's all checked off."}
            </p>
          )}
        </ul>
      </main>

      <div className="sticky bottom-0 border-t border-border bg-surface p-4">
        <div className="mx-auto flex max-w-2xl gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-3 font-medium text-text-secondary"
          >
            Close
          </button>
          <button
            onClick={onStartShopping}
            className="flex-1 rounded-xl py-3 font-medium text-white"
            style={{ backgroundColor: color }}
          >
            {startLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
