import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useGroup } from '../contexts/GroupContext'
import { useGroupMembers } from '../lib/hooks'
import type { Invite } from '../types/database'

export default function GroupSettings() {
  const { user } = useAuth()
  const { groups, currentGroup, setCurrentGroupId, createGroup, refreshGroups } = useGroup()
  const { members, loading: membersLoading } = useGroupMembers(currentGroup?.id)
  const navigate = useNavigate()

  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([])
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null)

  useEffect(() => {
    if (!currentGroup) return
    loadInvites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGroup])

  async function loadInvites() {
    if (!currentGroup) return
    const { data } = await supabase
      .from('invites')
      .select('*')
      .eq('group_id', currentGroup.id)
      .eq('status', 'pending')
    setPendingInvites((data as Invite[]) ?? [])
  }

  async function handleCreateGroup(e: React.FormEvent) {
    e.preventDefault()
    if (!newGroupName.trim()) return
    await createGroup(newGroupName.trim())
    setNewGroupName('')
    setShowNewGroup(false)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!currentGroup || !user || !inviteEmail.trim()) return
    const { data: invite, error } = await supabase
      .from('invites')
      .insert({ group_id: currentGroup.id, email: inviteEmail.trim(), invited_by: user.id })
      .select()
      .single()
    if (error || !invite) return

    const link = `${window.location.origin}${import.meta.env.BASE_URL}join/${invite.id}`
    setLastInviteLink(link)
    const subject = encodeURIComponent(`Join ${currentGroup.name} on BusyBeeGrocer`)
    const body = encodeURIComponent(
      `You've been invited to join ${currentGroup.name} on BusyBeeGrocer.\n\nTap this link to join: ${link}`,
    )
    // A clicked anchor is less likely to trigger a full page reload on
    // mobile browsers than setting window.location.href directly.
    const mailLink = document.createElement('a')
    mailLink.href = `mailto:${inviteEmail.trim()}?subject=${subject}&body=${body}`
    mailLink.click()

    setInviteEmail('')
    loadInvites()
  }

  async function handleLeaveGroup() {
    if (!currentGroup || !user) return
    await supabase
      .from('group_members')
      .delete()
      .eq('group_id', currentGroup.id)
      .eq('user_id', user.id)
    await refreshGroups()
    navigate('/')
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-1 flex-col bg-page px-4 py-6">
      <Link to="/settings" className="mb-4 text-text-secondary">
        ← Settings
      </Link>
      <h1 className="mb-4 text-lg font-semibold text-text-primary">Groups</h1>

      <div className="mb-6 flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => setCurrentGroupId(g.id)}
            className="flex items-center justify-between px-4 py-3.5 text-left"
          >
            <span className="text-text-primary">{g.name}</span>
            {currentGroup?.id === g.id && <span className="text-primary">✓ Current</span>}
          </button>
        ))}
      </div>

      {showNewGroup ? (
        <form onSubmit={handleCreateGroup} className="mb-6 flex gap-2">
          <input
            autoFocus
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Group name"
            className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-text-primary outline-none focus:border-primary"
          />
          <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 font-medium text-white">
            Create
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowNewGroup(true)}
          className="mb-6 rounded-xl border border-dashed border-border py-2.5 text-sm text-text-secondary"
        >
          + Start a new group
        </button>
      )}

      {currentGroup && (
        <>
          <h2 className="mb-2 text-sm font-medium text-text-secondary">
            Members of {currentGroup.name}
          </h2>
          <ul className="mb-6 flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {!membersLoading &&
              members.map((m) => (
                <li key={m.id} className="px-4 py-3 text-text-primary">
                  {m.display_name || m.email} {m.id === user?.id && '(you)'}
                </li>
              ))}
          </ul>

          <h2 className="mb-2 text-sm font-medium text-text-secondary">Invite someone</h2>
          <form onSubmit={handleInvite} className="mb-2 flex gap-2">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-text-primary outline-none focus:border-primary"
            />
            <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 font-medium text-white">
              Invite
            </button>
          </form>
          {lastInviteLink && (
            <p className="mb-4 text-xs text-text-muted">
              Invite link: <span className="break-all">{lastInviteLink}</span>
            </p>
          )}

          {pendingInvites.length > 0 && (
            <>
              <h2 className="mb-2 text-sm font-medium text-text-secondary">Pending invites</h2>
              <ul className="mb-6 flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {pendingInvites.map((inv) => (
                  <li key={inv.id} className="px-4 py-3 text-text-primary">
                    {inv.email}
                  </li>
                ))}
              </ul>
            </>
          )}

          <button onClick={handleLeaveGroup} className="rounded-xl border border-border py-3 text-status-critical">
            Leave this group
          </button>
        </>
      )}
    </div>
  )
}
