import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { useGroup } from './contexts/GroupContext'
import Login from './pages/Login'
import AcceptInvite from './pages/AcceptInvite'
import GroupSetup from './pages/GroupSetup'
import ListsHome from './pages/ListsHome'
import ListDetail from './pages/ListDetail'
import ShoppingModePage from './pages/ShoppingModePage'
import Settings from './pages/Settings'
import GroupSettings from './pages/GroupSettings'
import StoreSettings from './pages/StoreSettings'
import CategorySettings from './pages/CategorySettings'

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <FullScreenLoading />
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireGroup({ children }: { children: ReactNode }) {
  const { groups, loading } = useGroup()
  if (loading) return <FullScreenLoading />
  if (groups.length === 0) return <Navigate to="/group-setup" replace />
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
      <Route path="/join/:inviteId" element={<AcceptInvite />} />

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
