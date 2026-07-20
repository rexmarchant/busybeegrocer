import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Profile } from '../types/database'

export function useGroupMembers(groupId: string | undefined) {
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!groupId) return
    setLoading(true)
    supabase
      .from('group_members')
      .select('profiles(*)')
      .eq('group_id', groupId)
      .then(({ data }) => {
        const profiles = (data ?? []).flatMap((row) => (row.profiles ? [row.profiles] : []))
        setMembers(profiles as unknown as Profile[])
        setLoading(false)
      })
  }, [groupId])

  return { members, loading }
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
