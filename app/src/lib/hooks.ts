import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Profile } from '../types/database'

export function useGroupMembers(groupId: string | undefined) {
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  async function refetch() {
    if (!groupId) return
    setLoading(true)
    const { data } = await supabase.from('group_members').select('profiles(*)').eq('group_id', groupId)
    const profiles = (data ?? []).flatMap((row) => (row.profiles ? [row.profiles] : []))
    setMembers(profiles as unknown as Profile[])
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
  const p = profiles.find((m) => m.id === userId)
  return p?.display_name || p?.email || 'Someone'
}
