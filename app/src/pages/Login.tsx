import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { session, requestLoginLink } = useAuth()
  const [step, setStep] = useState<'email' | 'sent'>('email')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleRequestLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await requestLoginLink(email.trim())
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    setStep('sent')
  }

  return (
    <div className="flex min-h-svh flex-1 flex-col items-center justify-center bg-page px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/icons/icon-192.png" alt="" className="h-16 w-16 rounded-2xl" />
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
                placeholder="you@example.com"
                className="rounded-xl border border-border bg-surface px-4 py-3 text-base text-text-primary outline-none focus:border-primary"
              />
            </label>
            {error && <p className="text-sm text-status-critical">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-primary px-4 py-3 text-base font-medium text-white transition hover:bg-primary-hover disabled:opacity-60"
            >
              {submitting ? 'Sending link…' : 'Continue'}
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
            <button
              type="button"
              onClick={() => setStep('email')}
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
