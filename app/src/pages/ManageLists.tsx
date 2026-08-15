import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useGroup } from '../contexts/GroupContext'
import { useGroupMembers } from '../lib/hooks'
import { personLabel } from '../lib/personName'
import ConfirmModal from '../components/ConfirmModal'
import { listColorHex, listIconEmoji } from '../lib/constants'
import type { ShoppingList } from '../types/database'
import { ArrowLeft, Chevron } from '../components/Icons'

/** Everything you do *to* a list, as opposed to everything you do *on* one.
 *
 * Ordering, sharing, duplicating, resetting and deleting all live here. None of
 * them belong on the list screen itself: that screen is for the items, and the
 * settings gear sitting in its header put a set of rare, mostly irreversible
 * actions one tap from the thing you use every day. Gathering them per-list in
 * one place also means tidying up several lists is no longer a trip into and
 * out of each one. */
export default function ManageLists() {
  const { user } = useAuth()
  const { currentGroup } = useGroup()
  const { members } = useGroupMembers(currentGroup?.id)
  const navigate = useNavigate()
  const [lists, setLists] = useState<ShoppingList[]>([])
  const [loading, setLoading] = useState(true)
  const [settingsFor, setSettingsFor] = useState<ShoppingList | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ShoppingList | null>(null)
  const [pendingReset, setPendingReset] = useState<ShoppingList | null>(null)
  const [busy, setBusy] = useState(false)
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
    setSettingsFor(null)
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

  async function handleTogglePrivate(list: ShoppingList) {
    await supabase.from('lists').update({ is_private: !list.is_private }).eq('id', list.id)
    setSettingsFor(null)
    load()
  }

  async function handleResetCounts() {
    const target = pendingReset
    if (!target) return
    setPendingReset(null)
    setSettingsFor(null)
    await supabase.rpc('reset_list_item_counts', { p_list_id: target.id })
  }

  /** Copies the list and everything currently on it, then opens the copy —
   * the point of duplicating is almost always to start editing the new one. */
  async function handleDuplicate(list: ShoppingList) {
    if (!currentGroup || !user || busy) return
    setBusy(true)
    setError(null)

    const nextSortOrder = lists.length > 0 ? Math.max(...lists.map((l) => l.sort_order)) + 1 : 0
    const { data: newList, error: insertError } = await supabase
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

    if (insertError || !newList) {
      setBusy(false)
      setError(`Couldn't duplicate "${list.name}".`)
      return
    }

    // Only what is actually on the list — a copy shouldn't inherit rows that
    // were removed from the original, and counts start fresh on the copy.
    const { data: items } = await supabase
      .from('list_items')
      .select('catalog_item_id, quantity, note, preferred_store_id')
      .eq('list_id', list.id)
      .is('removed_at', null)

    if (items && items.length > 0) {
      await supabase.from('list_items').insert(
        items.map((i) => ({ ...i, list_id: newList.id, added_by: user.id, last_modified_by: user.id })),
      )
    }

    setBusy(false)
    setSettingsFor(null)
    navigate(`/lists/${(newList as ShoppingList).id}`)
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-1 flex-col bg-page px-4 py-6">
      <Link to="/settings" className="mb-4 inline-flex items-center gap-1 text-text-secondary">
        <ArrowLeft /> Settings
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
              {/* The whole row opens that list's settings; the arrows beside it
                  stop the press from reaching it. */}
              <button
                onClick={() => setSettingsFor(list)}
                aria-label={`Settings for ${list.name}`}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="text-2xl">{listIconEmoji(list.icon)}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                  {list.name}
                </span>
                {list.is_private && (
                  <span className="shrink-0 rounded-full bg-page px-2 py-0.5 text-xs text-text-muted">
                    Private
                  </span>
                )}
                <Chevron direction="right" className="h-6 w-6 shrink-0 text-text-muted" />
              </button>

              <div className="flex shrink-0 flex-col gap-1">
                <button
                  onClick={() => moveList(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${list.name} up`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-text-secondary disabled:opacity-30"
                >
                  <Chevron direction="up" className="h-5 w-5" />
                </button>
                <button
                  onClick={() => moveList(index, 1)}
                  disabled={index === lists.length - 1}
                  aria-label={`Move ${list.name} down`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-text-secondary disabled:opacity-30"
                >
                  <Chevron direction="down" className="h-5 w-5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {settingsFor && (
        <ListSettingsModal
          list={settingsFor}
          isOwner={settingsFor.owner_id === user?.id}
          members={members}
          busy={busy}
          onClose={() => setSettingsFor(null)}
          onTogglePrivate={() => handleTogglePrivate(settingsFor)}
          onDuplicate={() => handleDuplicate(settingsFor)}
          onResetCounts={() => setPendingReset(settingsFor)}
          onDelete={() => setPendingDelete(settingsFor)}
        />
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

      {pendingReset && (
        <ConfirmModal
          title="Reset frequency counts?"
          message={`This zeroes out the lifetime checked/unchecked tally for every item on "${pendingReset.name}", and empties its Frequently Bought with it. This cannot be undone.`}
          confirmLabel="Reset counts"
          danger
          onConfirm={handleResetCounts}
          onCancel={() => setPendingReset(null)}
        />
      )}
    </div>
  )
}

function ListSettingsModal({
  list,
  isOwner,
  members,
  busy,
  onClose,
  onTogglePrivate,
  onDuplicate,
  onResetCounts,
  onDelete,
}: {
  list: ShoppingList
  isOwner: boolean
  members: ReturnType<typeof useGroupMembers>['members']
  busy: boolean
  onClose: () => void
  onTogglePrivate: () => void
  onDuplicate: () => void
  onResetCounts: () => void
  onDelete: () => void
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6">
        <h3 className="mb-1 flex items-center gap-2 text-lg font-semibold text-text-primary">
          <span>{listIconEmoji(list.icon)}</span>
          <span className="min-w-0 truncate">{list.name}</span>
        </h3>

        <p className="mb-1.5 text-sm font-medium text-text-secondary">Shared with</p>
        {list.is_private ? (
          <p className="mb-4 text-sm text-text-secondary">This list is private — only you can see it.</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-1 text-sm text-text-primary">
            {members.map((m) => (
              <li key={m.id} className="break-words">
                {personLabel(members, m)}
              </li>
            ))}
          </ul>
        )}

        {isOwner ? (
          <div className="mb-4 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
            <button onClick={onTogglePrivate} className="px-4 py-3 text-left text-text-primary">
              Make {list.is_private ? 'shared' : 'private'}
            </button>
            <button onClick={onDuplicate} disabled={busy} className="px-4 py-3 text-left text-text-primary disabled:opacity-60">
              {busy ? 'Duplicating…' : 'Duplicate list'}
            </button>
            <button onClick={onResetCounts} className="px-4 py-3 text-left text-text-primary">
              Reset Frequency Counts
            </button>
            <button onClick={onDelete} className="px-4 py-3 text-left text-status-critical">
              Delete list
            </button>
          </div>
        ) : (
          <p className="mb-4 text-sm text-text-muted">
            Only the person who created this list can change or delete it.
          </p>
        )}

        <button onClick={onClose} className="w-full rounded-xl border border-border py-2.5 text-text-secondary">
          Close
        </button>
      </div>
    </div>
  )
}
