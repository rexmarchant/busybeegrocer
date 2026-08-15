import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useGroup } from './contexts/GroupContext'
import { groupGate } from './lib/groupGate'
import Login from './pages/Login'
import Privacy from './pages/Privacy'
import Releases from './pages/Releases'
import AcceptInvite from './pages/AcceptInvite'
import About from './pages/About'
import GroupSetup from './pages/GroupSetup'
import ListsHome from './pages/ListsHome'
import ListDetail from './pages/ListDetail'
import ShoppingModePage from './pages/ShoppingModePage'
import Settings from './pages/Settings'
import GroupSettings from './pages/GroupSettings'
import ManageLists from './pages/ManageLists'
import StoreSettings from './pages/StoreSettings'
import CategorySettings from './pages/CategorySettings'

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <FullScreenLoading />
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireGroup({ children }: { children: ReactNode }) {
  const { groups, loading, loadFailed, authLoading, refreshGroups } = useGroup()

  // The decision itself lives in groupGate() so it can be tested directly --
  // getting it wrong is invisible until someone reloads with no signal.
  const gate = groupGate({
    authLoading,
    groupsLoading: loading,
    groupCount: groups.length,
    loadFailed,
  })

  if (gate === 'loading') return <FullScreenLoading />

  if (gate !== 'ready') {
    if (gate === 'offline') {
      return (
        <div className="flex min-h-svh flex-1 flex-col items-center justify-center gap-4 bg-page px-6 text-center">
          <p className="text-4xl">📴</p>
          <h1 className="text-lg font-semibold text-text-primary">You're offline</h1>
          <p className="max-w-sm text-sm text-text-secondary">
            Your lists are saved, but we can't reach the server to load them right now. They'll be
            here as soon as you have signal again.
          </p>
          <button
            onClick={() => refreshGroups()}
            className="mt-2 rounded-xl bg-primary px-6 py-3 font-medium text-white"
          >
            Try again
          </button>
        </div>
      )
    }
    return <Navigate to="/group-setup" replace />
  }

  return <>{children}</>
}

function FullScreenLoading() {
  return (
    <div className="flex min-h-svh flex-1 items-center justify-center text-text-secondary">
      Loading…
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* No RequireAuth: you should be able to read what the app collects
          before handing over your email address, not after. */}
      <Route path="/privacy" element={<Privacy />} />
      {/* No RequireAuth either: "what changed in this version?" is a fair
          question to be able to send someone a link to. */}
      <Route path="/releases" element={<Releases />} />
      <Route path="/join/:inviteId" element={<AcceptInvite />} />

      <Route
        path="/about"
        element={
          <RequireAuth>
            <About />
          </RequireAuth>
        }
      />

      <Route
        path="/group-setup"
        element={
          <RequireAuth>
            <GroupSetup />
          </RequireAuth>
        }
      />

      <Route
        path="/"
        element={
          <RequireAuth>
            <RequireGroup>
              <ListsHome />
            </RequireGroup>
          </RequireAuth>
        }
      />
      <Route
        path="/lists/:listId"
        element={
          <RequireAuth>
            <RequireGroup>
              <ListDetail />
            </RequireGroup>
          </RequireAuth>
        }
      />
      <Route
        path="/lists/:listId/shop"
        element={
          <RequireAuth>
            <RequireGroup>
              <ShoppingModePage />
            </RequireGroup>
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <RequireGroup>
              <Settings />
            </RequireGroup>
          </RequireAuth>
        }
      />
      <Route
        path="/settings/groups"
        element={
          <RequireAuth>
            <GroupSettings />
          </RequireAuth>
        }
      />
      <Route
        path="/settings/lists"
        element={
          <RequireAuth>
            <RequireGroup>
              <ManageLists />
            </RequireGroup>
          </RequireAuth>
        }
      />
      <Route
        path="/settings/stores"
        element={
          <RequireAuth>
            <RequireGroup>
              <StoreSettings />
            </RequireGroup>
          </RequireAuth>
        }
      />
      <Route
        path="/settings/categories"
        element={
          <RequireAuth>
            <RequireGroup>
              <CategorySettings />
            </RequireGroup>
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
