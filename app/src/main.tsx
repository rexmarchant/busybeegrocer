import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { installGlobalErrorHandlers } from './lib/reportError'
import { AuthProvider } from './contexts/AuthContext'
import { GroupProvider } from './contexts/GroupContext'
import { ShoppingSessionProvider } from './contexts/ShoppingSessionContext'

const queryClient = new QueryClient()

// Before anything renders, so a crash during startup is still reported.
installGlobalErrorHandlers()

// BASE_URL is '/' in dev and '/busybeegrocer/' in the GitHub Pages build.
// Without this, react-router's own navigation (Navigate, useNavigate, Link)
// treats paths as relative to the site root, not the app's deployed
// subpath — routes still render (client-side history changes don't hit the
// server), but the address bar ends up wrong, and a refresh at that wrong
// URL then 404s for real.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Outside the providers on purpose -- a crash inside AuthProvider or
        GroupProvider is exactly the kind that produces a white screen. */}
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter basename={basename}>
          <AuthProvider>
            <GroupProvider>
              <ShoppingSessionProvider>
                <App />
              </ShoppingSessionProvider>
            </GroupProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
