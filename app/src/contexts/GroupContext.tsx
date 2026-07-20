import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Group } from '../types/database'
import { useAuth } from './AuthContext'

const CURRENT_GROUP_KEY = 'busybeegrocer:currentGroupId'

interface GroupContextValue {
  groups: Group[]
  currentGroup: Group | null
  loading: boolean
  setCurrentGroupId: (id: string) => void
  createGroup: (name: string) => Promise<Group>
  refreshGroups: () => Promise<void>
}

const GroupContext = createContext<GroupContextValue | undefined>(undefined)

export function GroupProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [groups, setGroups] = useState<Group[]>([])
  const [currentGroupId, setCurrentGroupIdState] = useState<string | null>(
    () => localStorage.getItem(CURRENT_GROUP_KEY),
  )
  const [loading, setLoading] = useState(true)

  const refreshGroups = useCallback(async () => {
    if (!user) {
      setGroups([])
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
      setGroups(data as unknown as Group[])
    } else if (error) {
      console.error('refreshGroups failed:', error)
    }
    setLoading(false)
  }, [user])

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
      value={{ groups, currentGroup, loading, setCurrentGroupId, createGroup, refreshGroups }}
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
