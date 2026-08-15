import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { GroupMemberProfile, GroupRole, Profile } from '../types/database'
import { personLabel } from './personName'

export function useGroupMembers(groupId: string | undefined) {
  const [members, setMembers] = useState<GroupMemberProfile[]>([])
  const [loading, setLoading] = useState(true)

  async function refetch() {
    if (!groupId) return
    setLoading(true)
    const { data } = await supabase
      .from('group_members')
      .select('role, profiles(*)')
      .eq('group_id', groupId)
    const rows = (data ?? []) as unknown as { role: GroupRole; profiles: Profile | null }[]
    setMembers(rows.flatMap((row) => (row.profiles ? [{ ...row.profiles, role: row.role }] : [])))
    setLoading(false)
  }

  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  return { members, loading, refetch }
}

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}

export function profileLabel(profiles: Profile[], userId: string | null | undefined, selfId?: string) {
  if (!userId) return 'Unknown'
  if (userId === selfId) return 'You'
  // The whole set is passed in, not just the one profile, so a name that would
  // be ambiguous alongside someone else falls back to the full address — see
  // lib/personName.ts.
  return personLabel(profiles, profiles.find((m) => m.id === userId))
}
