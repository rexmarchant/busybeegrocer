import { createContext, useContext, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'busybeegrocer:activeShoppingSession'

export interface ActiveSession {
  listId: string
  sessionId: string
  startedAt: number
}

interface ShoppingSessionContextValue {
  activeSession: ActiveSession | null
  startSession: (listId: string, sessionId: string, startedAt: number) => void
  clearSession: () => void
}

const ShoppingSessionContext = createContext<ShoppingSessionContextValue | undefined>(undefined)

function readStoredSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ActiveSession) : null
  } catch {
    return null
  }
}

export function ShoppingSessionProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(readStoredSession)

  function startSession(listId: string, sessionId: string, startedAt: number) {
    const session = { listId, sessionId, startedAt }
    setActiveSession(session)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  }

  function clearSession() {
    setActiveSession(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <ShoppingSessionContext.Provider value={{ activeSession, startSession, clearSession }}>
      {children}
    </ShoppingSessionContext.Provider>
  )
}

export function useShoppingSession() {
  const ctx = useContext(ShoppingSessionContext)
  if (!ctx) throw new Error('useShoppingSession must be used within ShoppingSessionProvider')
  return ctx
}
