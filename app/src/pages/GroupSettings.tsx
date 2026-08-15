import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useGroup } from '../contexts/GroupContext'
import { useGroupMembers } from '../lib/hooks'
import { suggestEmailCorrection } from '../lib/emailTypos'
import ConfirmModal from '../components/ConfirmModal'
import type { GroupRole, Invite, Profile } from '../types/database'
import { ArrowLeft } from '../components/Icons'

export default function GroupSettings() {
  const { user } = useAuth()
  const { groups, currentGroup, setCurrentGroupId, createGroup, refreshGroups } = useGroup()
  const { members, loading: membersLoading, refetch: refetchMembers } = useGroupMembers(currentGroup?.id)
  const navigate = useNavigate()

  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteTouched, setInviteTouched] = useState(false)
  const inviteSuggestion = useMemo(
    () => (inviteTouched ? suggestEmailCorrection(inviteEmail) : null),
    [inviteEmail, inviteTouched],
  )
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([])
  const [lastInvite, setLastInvite] = useState<{ email: string; link: string } | null>(null)
  /** Which link was just copied, so the button can confirm it worked. */
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)

  function inviteLink(inviteId: string) {
    return `${window.location.origin}${import.meta.env.BASE_URL}join/${inviteId}`
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopyFailed(false)
      setCopiedLink(link)
      window.setTimeout(() => setCopiedLink((c) => (c === link ? null : c)), 2500)
    } catch {
      // Browsers refuse clipboard access in plenty of ordinary situations --
      // an unfocused window, an insecure context, older WebViews. Swallowing
      // that leaves someone tapping a button that does nothing, so point them
      // at the link instead; it is on screen and selectable.
      setCopyFailed(true)
    }
  }
  const [removeTarget, setRemoveTarget] = useState<Profile | null>(null)

  // Ownership is the role held in *this* group, not groups.created_by -- which
  // is now only a record of who made it. Someone can own one group and simply
  // belong to another.
  const myRole = members.find((m) => m.id === user?.id)?.role
  const isGroupOwner = myRole === 'owner'
  const ownerCount = members.filter((m) => m.role === 'owner').length

  const [roleBusyFor, setRoleBusyFor] = useState<string | null>(null)
  const [roleError, setRoleError] = useState<string | null>(null)

  async function changeRole(userId: string, role: GroupRole) {
    if (!currentGroup) return
    setRoleBusyFor(userId)
    setRoleError(null)
    const { error } = await supabase.rpc('set_group_member_role', {
      p_group_id: currentGroup.id,
      p_user_id: userId,
      p_role: role,
    })
    setRoleBusyFor(null)
    // The database enforces these rules regardless of what the UI offers, so
    // surface what it said rather than a generic failure.
    if (error) {
      setRoleError(error.message)
      return
    }
    await refetchMembers()
  }

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

    const link = inviteLink(invite.id)
    const invitedEmail = inviteEmail.trim()
    setLastInvite({ email: invitedEmail, link })
    const subject = encodeURIComponent(`Join ${currentGroup.name} on Busy Bee Grocer`)
    const body = encodeURIComponent(
      `You've been invited to join ${currentGroup.name} on Busy Bee Grocer.\n\nTap this link to join: ${link}`,
    )
    // A clicked anchor is less likely to trigger a full page reload on
    // mobile browsers than setting window.location.href directly.
    const mailLink = document.createElement('a')
    mailLink.href = `mailto:${inviteEmail.trim()}?subject=${subject}&body=${body}`
    mailLink.click()

    setInviteEmail('')
    loadInvites()
  }

  async function handleRevokeInvite(inviteId: string) {
    await supabase.from('invites').update({ status: 'revoked' }).eq('id', inviteId)
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

  async function handleRemoveMember() {
    if (!currentGroup || !removeTarget) return
    await supabase.rpc('remove_group_member', {
      p_group_id: currentGroup.id,
      p_user_id: removeTarget.id,
    })
    setRemoveTarget(null)
    await refetchMembers()
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-1 flex-col bg-page px-4 py-6">
      <Link to="/settings" className="mb-4 inline-flex items-center gap-1 text-text-secondary">
        <ArrowLeft /> Settings
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
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span className="text-text-primary">
                    {m.display_name || m.email} {m.id === user?.id && '(you)'}
                    {m.role === 'owner' && (
                      <span className="ml-2 rounded-full bg-page px-2 py-0.5 text-xs text-text-muted">
                        Owner
                      </span>
                    )}
                  </span>

                  {isGroupOwner && (
                    <span className="flex items-center gap-3">
                      {m.role === 'member' ? (
                        <button
                          onClick={() => changeRole(m.id, 'owner')}
                          disabled={roleBusyFor === m.id}
                          className="text-sm text-primary underline disabled:opacity-50"
                        >
                          Make owner
                        </button>
                      ) : (
                        // Hidden rather than disabled when this is the last
                        // owner: the database refuses it anyway, and offering a
                        // button that can only fail is worse than not offering
                        // one.
                        ownerCount > 1 && (
                          <button
                            onClick={() => changeRole(m.id, 'member')}
                            disabled={roleBusyFor === m.id}
                            className="text-sm text-text-secondary underline disabled:opacity-50"
                          >
                            {m.id === user?.id ? 'Step down' : 'Remove owner'}
                          </button>
                        )
                      )}

                      {m.id !== user?.id && (
                        <button
                          onClick={() => setRemoveTarget(m)}
                          className="text-sm text-status-critical underline"
                        >
                          Remove
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
          </ul>

          {roleError && <p className="-mt-4 mb-4 text-sm text-status-critical">{roleError}</p>}

          {/* Leaving is never blocked -- the group promotes a successor -- but
              being told in advance beats discovering it afterwards. */}
          {isGroupOwner && ownerCount === 1 && members.length > 1 && (
            <p className="-mt-4 mb-6 text-xs text-text-muted">
              You're the only owner. If you leave, the longest-standing member becomes owner
              automatically — or make someone an owner first to choose who.
            </p>
          )}

          <h2 className="mb-2 text-sm font-medium text-text-secondary">Invite someone</h2>
          <form onSubmit={handleInvite} className="mb-2 flex gap-2">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onBlur={() => setInviteTouched(true)}
              placeholder="email@example.com"
              className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-text-primary outline-none focus:border-primary"
            />
            <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 font-medium text-white">
              Invite
            </button>
          </form>

          {/* A mistyped invite is worse than a mistyped sign-in: accept_invite()
              matches on the address, so the person you meant to invite can never
              use it, and nobody finds out why. */}
          {inviteSuggestion && (
            <button
              type="button"
              onClick={() => {
                setInviteEmail(inviteSuggestion)
                setInviteTouched(false)
              }}
              className="mb-2 text-left text-sm text-text-secondary"
            >
              Did you mean <span className="font-medium text-primary underline">{inviteSuggestion}</span>?
            </button>
          )}
          {/* Nothing has been emailed by the app. The row exists and the link
              works, but whether a message actually goes out is entirely down to
              the person hitting send in their own mail app -- so say that,
              rather than implying an invite is on its way. The link is the
              reliable path and is presented as the primary action, because
              mailto: does nothing at all on a device with no mail app set up. */}
          {lastInvite && (
            <div className="mb-4 rounded-2xl border border-border bg-surface p-4">
              <p className="mb-1 text-sm font-medium text-text-primary">
                Invite created for {lastInvite.email}
              </p>
              <p className="mb-3 text-xs text-text-secondary">
                Your email app should have opened with a message ready to go —{' '}
                <strong className="font-medium">you still need to send it.</strong> Or copy the link
                and share it any way you like.
              </p>
              <button
                onClick={() => copyLink(lastInvite.link)}
                className="mb-2 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white"
              >
                {copiedLink === lastInvite.link ? '✓ Link copied' : 'Copy invite link'}
              </button>
              {copyFailed && (
                <p className="mb-1 text-xs text-status-critical">
                  Couldn't copy automatically — select the link below and copy it by hand.
                </p>
              )}
              <p className="cursor-text break-all select-all text-xs text-text-muted">
                {lastInvite.link}
              </p>
            </div>
          )}

          {pendingInvites.length > 0 && (
            <>
              {/* "Pending" means the invite has not been accepted -- not that
                  anyone has been contacted. The app never sends these, so a row
                  here is no evidence an email left anyone's outbox. */}
              <h2 className="mb-1 text-sm font-medium text-text-secondary">Waiting to be accepted</h2>
              <p className="mb-2 text-xs text-text-muted">
                Created but not yet accepted. If someone says they never got it, copy the link and
                send it again — no need to invite them twice.
              </p>
              <ul className="mb-6 flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {pendingInvites.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-text-primary">{inv.email}</span>
                    <button
                      onClick={() => copyLink(inviteLink(inv.id))}
                      className="shrink-0 text-sm text-primary underline"
                    >
                      {copiedLink === inviteLink(inv.id) ? '✓ Copied' : 'Copy link'}
                    </button>
                    <button
                      onClick={() => handleRevokeInvite(inv.id)}
                      className="shrink-0 text-sm text-status-critical underline"
                    >
                      Revoke
                    </button>
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

      {removeTarget && (
        <ConfirmModal
          title="Remove member?"
          message={`${removeTarget.display_name || removeTarget.email} will lose access to this group's lists. Any lists they own will be reassigned to another member.`}
          confirmLabel="Remove"
          danger
          onConfirm={handleRemoveMember}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  )
}
