import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useGroup } from '../contexts/GroupContext'
import { useShoppingSession } from '../contexts/ShoppingSessionContext'
import { useOnlineStatus } from '../lib/hooks'
import { listColorHex, listIconEmoji } from '../lib/constants'
import type { ShoppingList } from '../types/database'

export function useGroupItemCount(groupId: string | undefined) {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!groupId) {
      setCount(null)
      return
    }
    let cancelled = false

    async function load() {
      const { count: c } = await supabase
        .from('list_items')
        .select('id, lists!inner(group_id)', { count: 'exact', head: true })
        .eq('lists.group_id', groupId)
        .is('removed_at', null)
        .eq('is_checked', false)
      if (!cancelled) setCount(c ?? 0)
    }
    load()

    const channel = supabase
      .channel(`list-items-count-${groupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items' }, load)
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [groupId])

  return count
}

function ResumeShoppingBanner() {
  const { activeSession } = useShoppingSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [list, setList] = useState<ShoppingList | null>(null)

  useEffect(() => {
    if (!activeSession) {
      setList(null)
      return
    }
    supabase
      .from('lists')
      .select('*')
      .eq('id', activeSession.listId)
      .single()
      .then(({ data }) => setList((data as ShoppingList) ?? null))
  }, [activeSession])

  if (!activeSession || !list) return null
  if (location.pathname === `/lists/${activeSession.listId}/shop`) return null

  const color = listColorHex(list.color)

  return (
    <button
      onClick={() => navigate(`/lists/${activeSession.listId}/shop`)}
      className="flex w-full items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white"
      style={{ backgroundColor: color }}
    >
      ▶ Resume Shopping — {listIconEmoji(list.icon)} {list.name}
    </button>
  )
}

export default function Header() {
  const { currentGroup, groups, setCurrentGroupId } = useGroup()
  const itemCount = useGroupItemCount(currentGroup?.id)
  const online = useOnlineStatus()

  return (
    <div className="sticky top-0 z-10">
      <ResumeShoppingBanner />
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className="h-11 w-11 rounded-lg" />
          <span className="font-semibold text-text-primary">BusyBeeGrocer</span>
        </Link>

        <div className="flex items-center gap-3">
          {!online && (
            <span className="rounded-full bg-status-warning/20 px-3 py-1 text-xs font-medium text-status-warning">
              ● Offline
            </span>
          )}
          {itemCount !== null && (
            <span className="rounded-full bg-page px-3 py-1 text-sm font-medium text-text-secondary">
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </span>
          )}

          {groups.length > 1 && currentGroup && (
            <select
              value={currentGroup.id}
              onChange={(e) => setCurrentGroupId(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text-primary"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}

          <Link
            to="/settings"
            aria-label="Settings"
            className="rounded-full p-2 text-xl text-text-secondary hover:bg-page"
          >
            ⚙️
          </Link>
        </div>
      </header>
    </div>
  )
}
