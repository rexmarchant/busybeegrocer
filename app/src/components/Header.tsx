import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useGroup } from '../contexts/GroupContext'
import { useShoppingSession } from '../contexts/ShoppingSessionContext'
import { useOnlineStatus } from '../lib/hooks'
import { listColorHex, listIconEmoji } from '../lib/constants'
import type { ShoppingList } from '../types/database'

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
  const online = useOnlineStatus()
  const location = useLocation()
  // On Settings itself the gear would just link to the page you're already on,
  // so it reads as a dead button. Sub-pages keep it — there it navigates up.
  const onSettingsPage = location.pathname === '/settings'
  // The group switcher lives on Settings alone. Switching group isn't something
  // you do on the way to a list, and on a phone it was one more thing competing
  // for the width the list names actually need.
  const hasSwitcher = onSettingsPage && groups.length > 1 && !!currentGroup

  return (
    <div className="sticky top-0 z-10">
      <ResumeShoppingBanner />
      {/* Every child used to be fixed-width with nothing allowed to shrink, so
          on a phone the row simply overflowed: the wordmark was clipped
          mid-letter, the group name ran off the edge, and the settings gear --
          last in the row -- was pushed off screen entirely. */}
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-3">
        <Link to="/about" className="flex shrink-0 items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className="h-10 w-10 rounded-lg" />
          {/* With a group switcher present there is no room for the wordmark on
              a phone, and the icon identifies the app perfectly well. */}
          <span
            className={`font-semibold text-text-primary ${hasSwitcher ? 'hidden sm:inline' : ''}`}
          >
            Busy Bee Grocer
          </span>
        </Link>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {!online && (
            <span className="shrink-0 rounded-full bg-status-warning/20 px-2.5 py-1 text-xs font-medium whitespace-nowrap text-status-warning">
              ● Offline
            </span>
          )}
          {hasSwitcher && currentGroup && (
            // The one element allowed to give: group names are arbitrary and
            // can be long, so this truncates instead of shoving the gear out.
            <select
              value={currentGroup.id}
              onChange={(e) => setCurrentGroupId(e.target.value)}
              aria-label="Current group"
              className="min-w-0 max-w-[10rem] flex-1 truncate rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text-primary"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}

          {!onSettingsPage && (
            <Link
              to="/settings"
              aria-label="Settings"
              className="shrink-0 rounded-full p-1.5 text-xl text-text-secondary hover:bg-page"
            >
              ⚙️
            </Link>
          )}
        </div>
      </header>
    </div>
  )
}
