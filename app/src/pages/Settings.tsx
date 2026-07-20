import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useGroup } from '../contexts/GroupContext'
import Header from '../components/Header'

export default function Settings() {
  const { user, signOut } = useAuth()
  const { currentGroup } = useGroup()

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-page">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
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
        </nav>

        <button
          onClick={signOut}
          className="mt-6 w-full rounded-xl border border-border py-3 text-status-critical"
        >
          Sign out
        </button>

        <div className="mt-10 flex flex-col items-center gap-2 pb-6 text-center">
          <img
            src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
            alt="BusyBeeGrocer"
            className="h-28 w-28 rounded-3xl"
          />
          <p className="text-sm text-text-muted">
            Version {__APP_VERSION__} · {new Date(__BUILD_DATE__).toLocaleDateString()}
          </p>
        </div>
      </main>
    </div>
  )
}
