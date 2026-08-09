import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useGroup } from '../contexts/GroupContext'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import TutorialModal from '../components/TutorialModal'
import ConfirmModal from '../components/ConfirmModal'

const DELETE_WARNING =
  'This permanently deletes your account and removes your name from everything you have added. ' +
  'Items, stores and categories you created stay with your group, because other people are still ' +
  'using them. If you own a group, it passes to its longest-standing member. This cannot be undone.'

export default function Settings() {
  const { user, signOut } = useAuth()
  const { currentGroup } = useGroup()
  const [showTutorial, setShowTutorial] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDeleteAccount() {
    setConfirmingDelete(false)
    setDeleting(true)
    setDeleteError(null)

    // The function works out whose account to delete from the access token the
    // client library attaches -- it deliberately accepts no user id.
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' })

    if (error) {
      setDeleting(false)
      setDeleteError(
        "Couldn't delete your account. Please try again, or email busybeegrocer@gmail.com.",
      )
      return
    }

    // The session now points at a user that no longer exists; clear it so the
    // app doesn't sit there making requests that will all fail.
    await signOut()
  }

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-page">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <Link to="/" className="mb-4 inline-flex items-center gap-1 text-text-secondary">
          <span className="text-2xl leading-none">←</span> Your Lists
        </Link>
        <h1 className="mb-4 text-lg font-semibold text-text-primary">Settings</h1>

        <div className="mb-4 rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm text-text-muted">Signed in as</p>
          <p className="text-text-primary">{user?.email}</p>
        </div>

        <nav className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          <Link to="/settings/groups" className="flex items-center justify-between px-4 py-3.5">
            <span className="text-text-primary">Groups</span>
            <span className="text-sm text-text-muted">{currentGroup?.name} ›</span>
          </Link>
          <Link to="/settings/stores" className="flex items-center justify-between px-4 py-3.5">
            <span className="text-text-primary">Stores</span>
            <span className="text-text-muted">›</span>
          </Link>
          <Link to="/settings/categories" className="flex items-center justify-between px-4 py-3.5">
            <span className="text-text-primary">Categories</span>
            <span className="text-text-muted">›</span>
          </Link>
          <button
            onClick={() => setShowTutorial(true)}
            className="flex items-center justify-between px-4 py-3.5 text-left"
          >
            <span className="text-text-primary">🎬 Tutorial</span>
            <span className="text-text-muted">›</span>
          </button>
          <Link to="/privacy" className="flex items-center justify-between px-4 py-3.5">
            <span className="text-text-primary">Privacy</span>
            <span className="text-text-muted">›</span>
          </Link>
        </nav>

        <button
          onClick={signOut}
          className="mt-6 w-full rounded-xl border border-border py-3 text-status-critical"
        >
          Sign out
        </button>

        {/* Deliberately plain and low-contrast: findable when wanted, not
            competing with Sign out for a mis-tap. The privacy policy promises
            people can delete their account, so it has to actually be here. */}
        <button
          onClick={() => setConfirmingDelete(true)}
          disabled={deleting}
          className="mt-3 w-full py-3 text-sm text-text-muted underline disabled:opacity-60"
        >
          {deleting ? 'Deleting your account…' : 'Delete my account'}
        </button>

        {deleteError && (
          <p className="mt-2 text-center text-sm text-status-critical">{deleteError}</p>
        )}

        <div className="mt-10 flex flex-col items-center gap-2 pb-6 text-center">
          <img
            src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
            alt="Busy Bee Grocer"
            className="h-28 w-28 rounded-3xl"
          />
          <p className="text-sm text-text-muted">
            Version {__APP_VERSION__} (build {__BUILD_NUMBER__}) · {new Date(__BUILD_DATE__).toLocaleDateString()}
          </p>
        </div>
      </main>

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}

      {confirmingDelete && (
        <ConfirmModal
          title="Delete your account?"
          message={DELETE_WARNING}
          confirmLabel="Delete for good"
          danger
          onConfirm={handleDeleteAccount}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}
