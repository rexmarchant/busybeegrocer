import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useGroup } from '../contexts/GroupContext'
import Header from '../components/Header'
import IconPicker from '../components/IconPicker'
import ColorPicker from '../components/ColorPicker'
import { listColorHex, listIconEmoji } from '../lib/constants'
import type { ListColor, ListIcon, ShoppingList } from '../types/database'

export default function ListsHome() {
  const { user } = useAuth()
  const { currentGroup } = useGroup()
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (!currentGroup) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGroup])

  async function load() {
    if (!currentGroup) return
    setLoading(true)
    const { data: listData } = await supabase
      .from('lists')
      .select('*')
      .eq('group_id', currentGroup.id)
      .order('sort_order', { ascending: true })

    const lists = (listData as ShoppingList[]) ?? []
    setLists(lists)

    if (lists.length > 0) {
      const { data: itemRows } = await supabase
        .from('list_items')
        .select('list_id')
        .in('list_id', lists.map((l) => l.id))
        .is('removed_at', null)
        .eq('is_checked', false)

      const tally: Record<string, number> = {}
      for (const row of itemRows ?? []) {
        tally[row.list_id] = (tally[row.list_id] ?? 0) + 1
      }
      setCounts(tally)
    }
    setLoading(false)
  }

  const nextSortOrder = lists.length > 0 ? Math.max(...lists.map((l) => l.sort_order)) + 1 : 0

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-page">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-text-primary">Your Lists</h1>
          {/* Reordering and deleting now live together under Settings → Manage
              all lists. They are both rare, and both were cluttering the screen
              you actually use every day. */}
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            + New list
          </button>
        </div>

        {loading ? (
          <p className="text-text-secondary">Loading…</p>
        ) : lists.length === 0 ? (
          <p className="text-text-secondary">No lists yet — create your first one.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {lists.map((list) => (
              <Link
                key={list.id}
                to={`/lists/${list.id}`}
                // px stays at 4; only the vertical padding comes off, which is
                // all that drives the row's height.
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2.5 transition hover:shadow-sm"
                style={{ borderLeft: `6px solid ${listColorHex(list.color)}` }}
              >
                <span className="text-2xl">{listIconEmoji(list.icon)}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">{list.name}</span>
                    {list.is_private && (
                      <span className="rounded-full bg-page px-2 py-0.5 text-xs text-text-muted">
                        Private
                      </span>
                    )}
                  </div>
                  {list.owner_id !== user?.id && (
                    <span className="text-xs text-text-muted">Shared with you</span>
                  )}
                </div>
                {/* Nothing rather than "0 items". An empty list has nothing
                    worth saying about it, and a column of zeroes reads as
                    clutter on the screen you look at most. */}
                {counts[list.id] > 0 && (
                  <span className="shrink-0 text-sm text-text-secondary">
                    {counts[list.id]} item{counts[list.id] === 1 ? '' : 's'}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>

      {showCreate && currentGroup && (
        <CreateListModal
          groupId={currentGroup.id}
          ownerId={user!.id}
          sortOrder={nextSortOrder}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function CreateListModal({
  groupId,
  ownerId,
  sortOrder,
  onClose,
  onCreated,
}: {
  groupId: string
  ownerId: string
  sortOrder: number
  onClose: () => void
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<ListIcon>('cart')
  const [color, setColor] = useState<ListColor>('blue')
  const [isPrivate, setIsPrivate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.from('lists').insert({
      group_id: groupId,
      owner_id: ownerId,
      name: name.trim(),
      icon,
      color,
      is_private: isPrivate,
      sort_order: sortOrder,
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 sm:items-center">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-6 sm:rounded-2xl"
      >
        <h2 className="mb-4 text-lg font-semibold text-text-primary">New list</h2>
        <label className="mb-4 flex flex-col gap-1.5 text-sm text-text-secondary">
          Name
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weekly Groceries"
            className="rounded-xl border border-border bg-page px-4 py-2.5 text-base text-text-primary outline-none focus:border-primary"
          />
        </label>

        <p className="mb-1.5 text-sm text-text-secondary">Icon</p>
        <div className="mb-4">
          <IconPicker value={icon} onChange={setIcon} />
        </div>

        <p className="mb-1.5 text-sm text-text-secondary">Color</p>
        <div className="mb-4">
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <label className="mb-4 flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          Private (only you can see this list)
        </label>

        {error && <p className="mb-3 text-sm text-status-critical">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-text-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-xl bg-primary py-2.5 font-medium text-white disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
