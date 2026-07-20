import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useGroup } from '../contexts/GroupContext'

export default function GroupSetup() {
  const { signOut } = useAuth()
  const { groups, loading, createGroup } = useGroup()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reachable directly via URL/back-button — bounce onward if a group already exists.
  if (!loading && groups.length > 0) return <Navigate to="/" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createGroup(name.trim())
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-1 flex-col items-center justify-center bg-page px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-xl font-semibold text-text-primary">Create your group</h1>
        <p className="mb-6 text-sm text-text-secondary">
          A group is who you'll share lists with — family, roommates, anyone. You can invite
          others once it's created, and switch or add more groups later.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. The Marchants"
            className="rounded-xl border border-border bg-surface px-4 py-3 text-base text-text-primary outline-none focus:border-primary"
          />
          {error && <p className="text-sm text-status-critical">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-primary px-4 py-3 text-base font-medium text-white disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create group'}
          </button>
        </form>
        <button
          onClick={signOut}
          className="mt-6 w-full text-center text-xs text-text-muted underline"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
