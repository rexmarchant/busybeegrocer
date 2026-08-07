import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Group } from '../types/database'
import { useAuth } from './AuthContext'

const CURRENT_GROUP_KEY = 'busybeegrocer:currentGroupId'
const GROUPS_CACHE_KEY = 'busybeegrocer:groupsCache'

/** Your groups, remembered across reloads.
 *
 * Without this, a reload with no signal left `groups` empty, which RequireGroup
 * could not tell apart from "this person has no groups" -- so it redirected to
 * Create-a-group, which is both wrong and useless offline. */
function readCachedGroups(): Group[] {
  try {
    const raw = localStorage.getItem(GROUPS_CACHE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? (parsed as Group[]) : []
  } catch {
    return []
  }
}

function writeCachedGroups(groups: Group[]) {
  try {
    if (groups.length === 0) localStorage.removeItem(GROUPS_CACHE_KEY)
    else localStorage.setItem(GROUPS_CACHE_KEY, JSON.stringify(groups))
  } catch {
    // Full or unavailable storage: degrade to the old behaviour, don't throw.
  }
}

interface GroupContextValue {
  groups: Group[]
  currentGroup: Group | null
  loading: boolean
  /** True when the last attempt to read groups failed. Lets callers tell
   * "you have no groups" apart from "we couldn't find out". */
  loadFailed: boolean
  /** Exposed so routing can refuse to decide anything until auth has resolved
   * too -- see groupGate(). */
  authLoading: boolean
  setCurrentGroupId: (id: string) => void
  createGroup: (name: string) => Promise<Group>
  refreshGroups: () => Promise<void>
}

const GroupContext = createContext<GroupContextValue | undefined>(undefined)

export function GroupProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [groups, setGroups] = useState<Group[]>(readCachedGroups)
  const [currentGroupId, setCurrentGroupIdState] = useState<string | null>(
    () => localStorage.getItem(CURRENT_GROUP_KEY),
  )
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const refreshGroups = useCallback(async () => {
    // While auth is restoring, `user` is null but that means nothing yet.
    // Returning without touching state is essential: the previous version
    // cleared `groups` and set loading false here, which for one render made
    // "not looked yet" indistinguishable from "has no groups" -- and sent
    // people to Create-your-group on an offline reload.
    if (authLoading) return

    if (!user) {
      // Genuinely signed out now, so the cache should go too -- it would
      // otherwise leak group names to the next person on a shared device.
      setGroups([])
      writeCachedGroups([])
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('groups')
      .select('*, group_members!inner(user_id)')
      .eq('group_members.user_id', user.id)
      .order('created_at', { ascending: true })

    if (!error && data) {
      const fresh = data as unknown as Group[]
      setGroups(fresh)
      writeCachedGroups(fresh)
      setLoadFailed(false)
    } else if (error) {
      // Keep whatever we already have. Replacing a known-good list with an
      // empty one because the network blinked is how a reload in a shop ended
      // up on the Create-a-group screen.
      console.error('refreshGroups failed:', error)
      setLoadFailed(true)
    }
    setLoading(false)
  }, [user, authLoading])

  useEffect(() => {
    refreshGroups()
  }, [refreshGroups])

  useEffect(() => {
    if (!currentGroupId && groups.length > 0) {
      setCurrentGroupIdState(groups[0].id)
      localStorage.setItem(CURRENT_GROUP_KEY, groups[0].id)
    }
  }, [groups, currentGroupId])

  function setCurrentGroupId(id: string) {
    setCurrentGroupIdState(id)
    localStorage.setItem(CURRENT_GROUP_KEY, id)
  }

  async function createGroup(name: string): Promise<Group> {
    if (!user) throw new Error('Not signed in')
    // Uses an RPC (rather than insert().select()) because a plain client
    // insert's RETURNING re-checks the groups SELECT policy, which requires
    // group_members to already exist — a same-transaction chicken-and-egg.
    const { data: group, error } = await supabase.rpc('create_group', { p_name: name }).single()
    if (error) throw error

    await refreshGroups()
    setCurrentGroupId((group as Group).id)
    return group as Group
  }

  const currentGroup = groups.find((g) => g.id === currentGroupId) ?? null

  return (
    <GroupContext.Provider
      value={{
        groups,
        currentGroup,
        loading,
        loadFailed,
        authLoading,
        setCurrentGroupId,
        createGroup,
        refreshGroups,
      }}
    >
      {children}
    </GroupContext.Provider>
  )
}

export function useGroup() {
  const ctx = useContext(GroupContext)
  if (!ctx) throw new Error('useGroup must be used within GroupProvider')
  return ctx
}
