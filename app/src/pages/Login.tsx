import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { suggestEmailCorrection } from '../lib/emailTypos'
import Captcha from '../components/Captcha'

export default function Login() {
  const { session, requestLoginLink, verifyOtpCode } = useAuth()
  const [step, setStep] = useState<'email' | 'sent'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  // Only look for typos once they've left the field -- suggesting "gmail.com"
  // while someone is still partway through typing it is just noise.
  const [emailTouched, setEmailTouched] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  // Bumped to remount the widget: tokens are single-use, so a failed attempt
  // must not be retried with the same one.
  const [captchaNonce, setCaptchaNonce] = useState(0)
  const suggestion = useMemo(
    () => (emailTouched ? suggestEmailCorrection(email) : null),
    [email, emailTouched],
  )

  if (session) return <Navigate to="/" replace />

  async function handleRequestLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await requestLoginLink(email.trim(), '', captchaToken ?? undefined)
    setSubmitting(false)
    if (error) {
      setError(error)
      // The token is spent whether or not the request succeeded, so a retry
      // needs a fresh one.
      setCaptchaToken(null)
      setCaptchaNonce((n) => n + 1)
      return
    }
    setStep('sent')
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setVerifying(true)
    const { error } = await verifyOtpCode(email.trim(), code.trim())
    setVerifying(false)
    if (error) setError(error)
    // On success, the `session` state flips and the redirect above fires automatically.
  }

  return (
    <div className="flex min-h-svh flex-1 flex-col items-center justify-center bg-page px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className="h-16 w-16 rounded-2xl" />
          <h1 className="text-xl font-semibold text-text-primary">BusyBeeGrocer</h1>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleRequestLink} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
              Email address
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                placeholder="you@example.com"
                className="rounded-xl border border-border bg-surface px-4 py-3 text-base text-text-primary outline-none focus:border-primary"
              />
            </label>

            {/* A suggestion, never a block -- being confidently wrong about
                someone's real address is worse than missing a typo. */}
            {suggestion && (
              <button
                type="button"
                onClick={() => {
                  setEmail(suggestion)
                  setEmailTouched(false)
                }}
                className="-mt-2 text-left text-sm text-text-secondary"
              >
                Did you mean <span className="font-medium text-primary underline">{suggestion}</span>?
              </button>
            )}

            <Captcha key={captchaNonce} onToken={setCaptchaToken} onError={setError} />

            {error && <p className="text-sm text-status-critical">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !captchaToken}
              className="rounded-xl bg-primary px-4 py-3 text-base font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
            >
              {submitting ? 'Sending link…' : captchaToken ? 'Continue' : 'Checking…'}
            </button>
            <p className="text-center text-xs text-text-muted">
              No password needed — we'll email you a sign-in link.
            </p>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-4xl">📬</p>
            <p className="text-text-primary">
              We sent a sign-in link to <strong>{email}</strong>
            </p>
            <p className="text-sm text-text-secondary">
              Open it on this device to finish signing in — this page will update automatically.
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
              {error && <p className="text-sm text-status-critical">{error}</p>}
              <button
                type="submit"
                disabled={verifying || code.trim().length === 0}
                className="rounded-xl bg-primary px-4 py-3 text-base font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
              >
                {verifying ? 'Verifying…' : 'Verify code'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setStep('email')
                setError(null)
                setCode('')
                // The previous token was consumed by the send that got us here.
                setCaptchaToken(null)
                setCaptchaNonce((n) => n + 1)
              }}
              className="text-center text-xs text-text-muted underline"
            >
              Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
