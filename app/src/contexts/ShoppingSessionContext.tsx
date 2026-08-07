import { createContext, useContext, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'busybeegrocer:activeShoppingSession'

export interface ActiveSession {
  listId: string
  /** Null when the trip was started with no signal, so no server-side session
   * row exists yet. The trip still runs locally; it is upgraded to a real
   * session the next time the page loads with a working connection.
   *
   * This used to be typed `string` while the code cheerfully wrote null into
   * it. A stored null made finish() return early forever, so the trip could
   * never be ended -- not by the button, not by checking everything off, and
   * not by going back online, because the broken session outlived the outage
   * in localStorage. */
  sessionId: string | null
  startedAt: number
}

interface ShoppingSessionContextValue {
  activeSession: ActiveSession | null
  startSession: (listId: string, sessionId: string | null, startedAt: number) => void
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

  function startSession(listId: string, sessionId: string | null, startedAt: number) {
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
