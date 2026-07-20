import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useGroup } from '../contexts/GroupContext'

interface Preview {
  group_name: string
  email: string
  status: string
}

export default function AcceptInvite() {
  const { inviteId } = useParams<{ inviteId: string }>()
  const { session, requestLoginLink } = useAuth()
  const { setCurrentGroupId, refreshGroups } = useGroup()
  const navigate = useNavigate()

  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState<'email' | 'sent' | 'joining'>('email')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [alreadyAttempted, setAlreadyAttempted] = useState(false)

  useEffect(() => {
    if (!inviteId) return
    supabase
      .rpc('get_invite_preview', { p_invite_id: inviteId })
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setLoadError('This invite link is invalid.')
        } else {
          setPreview(data as Preview)
        }
      })
  }, [inviteId])

  const acceptInvite = async () => {
    if (!inviteId || alreadyAttempted) return
    setAlreadyAttempted(true)
    setStep('joining')
    const { data: groupId, error } = await supabase.rpc('accept_invite', {
      p_invite_id: inviteId,
    })

    if (error) {
      // Might just be a duplicate call (e.g. another tab already accepted it) —
      // if we're already in the group, treat it as success rather than an error.
      const { data: preview } = await supabase
        .rpc('get_invite_preview', { p_invite_id: inviteId })
        .single()
      if ((preview as Preview | null)?.status !== 'accepted') {
        setError(error.message)
        return
      }
    }

    await refreshGroups()
    if (groupId) setCurrentGroupId(groupId as string)
    navigate('/', { replace: true })
  }

  useEffect(() => {
    if (session && preview && preview.status === 'pending') {
      acceptInvite()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, preview])

  async function handleRequestLink() {
    if (!preview || !inviteId) return
    setError(null)
    setSubmitting(true)
    const { error } = await requestLoginLink(preview.email, `join/${inviteId}`)
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    setStep('sent')
  }

  if (loadError) {
    return (
      <Centered>
        <p className="text-status-critical">{loadError}</p>
      </Centered>
    )
  }

  if (!preview) {
    return <Centered>Loading invite…</Centered>
  }

  if (preview.status === 'accepted' && !session) {
    return <Centered>This invite has already been used.</Centered>
  }
  if (preview.status !== 'pending' && preview.status !== 'accepted') {
    return <Centered>This invite is no longer valid.</Centered>
  }

  if (session || step === 'joining') {
    return <Centered>Joining {preview.group_name}…</Centered>
  }

  return (
    <Centered>
      <div className="w-full max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold text-text-primary">
          Join {preview.group_name} on BusyBeeGrocer
        </h1>
        <p className="mb-6 text-sm text-text-secondary">
          Invited as <strong>{preview.email}</strong>
        </p>

        {step === 'email' ? (
          <button
            onClick={handleRequestLink}
            disabled={submitting}
            className="w-full rounded-xl bg-primary px-4 py-3 text-base font-medium text-white disabled:opacity-60"
          >
            {submitting ? 'Sending link…' : 'Send me a link to join'}
          </button>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-4xl">📬</p>
            <p className="text-sm text-text-secondary">
              Open the link we sent to <strong>{preview.email}</strong> on this device to join.
            </p>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-status-critical">{error}</p>}
      </div>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-1 flex-col items-center justify-center bg-page px-6 text-text-primary">
      {children}
    </div>
  )
}
