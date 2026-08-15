import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useGroup } from '../contexts/GroupContext'
import ConfirmModal from '../components/ConfirmModal'
import { listColorHex, listIconEmoji } from '../lib/constants'
import type { ShoppingList } from '../types/database'

/** Reordering and deleting lists, together, away from the screen you use daily.
 *
 * Both are rare and neither belongs on the lists screen: reorder was a mode
 * toggle that changed the layout underneath you, and delete was buried in an
 * individual list's settings, which meant tidying up several lists was a trip
 * into and out of each one. */
export default function ManageLists() {
  const { user } = useAuth()
  const { currentGroup } = useGroup()
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<ShoppingList | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentGroup) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGroup])

  async function load() {
    if (!currentGroup) return
    setLoading(true)
    const { data } = await supabase
      .from('lists')
      .select('*')
      .eq('group_id', currentGroup.id)
      .order('sort_order', { ascending: true })
    setLists((data as ShoppingList[]) ?? [])
    setLoading(false)
  }

  async function moveList(index: number, direction: -1 | 1) {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= lists.length) return
    const a = lists[index]
    const b = lists[targetIndex]

    // Optimistic local swap so it feels instant, then persist.
    const reordered = [...lists]
    reordered[index] = b
    reordered[targetIndex] = a
    setLists(reordered)

    await Promise.all([
      supabase.from('lists').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('lists').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
  }

  async function handleDelete() {
    const target = pendingDelete
    if (!target) return
    setPendingDelete(null)
    setError(null)

    const { error: deleteError } = await supabase.from('lists').delete().eq('id', target.id)
    if (deleteError) {
      // Only the owner may delete, enforced by RLS. The button is hidden for
      // everyone else, so reaching this means something changed underneath us.
      setError(`Couldn't delete "${target.name}". Only the list's owner can delete it.`)
      return
    }
    load()
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-1 flex-col bg-page px-4 py-6">
      <Link to="/settings" className="mb-4 inline-flex items-center gap-1 text-text-secondary">
        <span className="text-2xl leading-none">←</span> Settings
      </Link>
      <h1 className="mb-1 text-lg font-semibold text-text-primary">Manage all lists</h1>
      <p className="mb-4 text-sm text-text-secondary">
        Reorder how lists appear on your home screen, or delete one for good.
      </p>

      {error && (
        <p className="mb-3 rounded-xl border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-text-secondary">Loading…</p>
      ) : lists.length === 0 ? (
        <p className="text-text-secondary">No lists yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lists.map((list, index) => (
            <li
              key={list.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5"
              style={{ borderLeft: `6px solid ${listColorHex(list.color)}` }}
            >
              <span className="text-2xl">{listIconEmoji(list.icon)}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                {list.name}
              </span>

              {/* Deleting is the owner's alone -- RLS enforces it, so offering
                  the button to anyone else would only produce a failure. */}
              {list.owner_id === user?.id && (
                <button
                  onClick={() => setPendingDelete(list)}
                  aria-label={`Delete ${list.name}`}
                  className="shrink-0 text-sm text-status-critical underline"
                >
                  Delete
                </button>
              )}

              <div className="flex shrink-0 flex-col gap-1">
                <button
                  onClick={() => moveList(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${list.name} up`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-text-secondary disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveList(index, 1)}
                  disabled={index === lists.length - 1}
                  aria-label={`Move ${list.name} down`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-text-secondary disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete this list?"
          message={`This permanently deletes "${pendingDelete.name}" and all its items. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
