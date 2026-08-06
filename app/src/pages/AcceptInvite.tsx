import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useGroup } from '../contexts/GroupContext'
import Captcha from '../components/Captcha'

interface Preview {
  group_name: string
  email: string
  status: string
}

export default function AcceptInvite() {
  const { inviteId } = useParams<{ inviteId: string }>()
  const { session, requestLoginLink, verifyOtpCode } = useAuth()
  const { setCurrentGroupId, refreshGroups } = useGroup()
  const navigate = useNavigate()

  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState<'email' | 'sent' | 'joining'>('email')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaNonce, setCaptchaNonce] = useState(0)
  const [alreadyAttempted, setAlreadyAttempted] = useState(false)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

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
    if (!session || !preview) return
    if (preview.status === 'pending') {
      acceptInvite()
    } else if (preview.status === 'accepted') {
      // Already joined earlier (e.g. revisiting the link, or a second email
      // from the same invite) — nothing to do, just go into the app instead
      // of hanging on "Joining…" forever.
      navigate('/', { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, preview])

  async function handleRequestLink() {
    if (!preview || !inviteId) return
    setError(null)
    setSubmitting(true)
    const { error } = await requestLoginLink(
      preview.email,
      `join/${inviteId}`,
      captchaToken ?? undefined,
    )
    setSubmitting(false)
    if (error) {
      setError(error)
      // Token is spent either way; a retry needs a fresh widget.
      setCaptchaToken(null)
      setCaptchaNonce((n) => n + 1)
      return
    }
    setStep('sent')
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    if (!preview) return
    setError(null)
    setVerifying(true)
    const { error } = await verifyOtpCode(preview.email, code.trim())
    setVerifying(false)
    if (error) setError(error)
    // On success, the effect above (watching `session`) calls acceptInvite() automatically.
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
          <div className="flex flex-col gap-4">
            {/* This path calls signInWithOtp too, so it needs a token for the
                same reason the login form does -- without it, accepting an
                invite would fail once CAPTCHA protection is switched on. */}
            <Captcha key={captchaNonce} onToken={setCaptchaToken} onError={setError} />
            <button
              onClick={handleRequestLink}
              disabled={submitting || !captchaToken}
              className="w-full rounded-xl bg-primary px-4 py-3 text-base font-medium text-white disabled:opacity-60"
            >
              {submitting ? 'Sending link…' : captchaToken ? 'Send me a link to join' : 'Checking…'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-4xl">📬</p>
            <p className="text-sm text-text-secondary">
              Open the link we sent to <strong>{preview.email}</strong> on this device to join.
            </p>

            <form onSubmit={handleVerifyCode} className="flex w-full flex-col gap-3 border-t border-border pt-4">
              <p className="text-xs text-text-secondary">
                Using the app from your home screen? Enter the code from the email instead:
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Code from email"
                className="rounded-xl border border-border bg-surface px-4 py-3 text-center text-lg tracking-widest text-text-primary outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={verifying || code.trim().length === 0}
                className="rounded-xl bg-primary px-4 py-3 text-base font-medium text-white disabled:opacity-60"
              >
                {verifying ? 'Verifying…' : 'Verify code'}
              </button>
            </form>
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
