import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { enqueue, flush, loadQueue, saveQueue, type QueuedMutation } from './offlineQueue'

/** Was this failure the network, or the server saying no?
 *
 * The distinction decides whether keeping the change is honest. A dropped
 * connection means "we'll send this shortly", so queueing is right. A rejection
 * -- the item was deleted, RLS refused -- means the change is never going to
 * land, and pretending otherwise would leave someone shopping from a list that
 * disagrees with the server. Those get reverted and reported instead. */
export function isNetworkFailure(error: unknown): boolean {
  if (!navigator.onLine) return true
  const message = String((error as { message?: string } | null)?.message ?? '')
  return /failed to fetch|networkerror|network request failed|load failed|timeout/i.test(message)
}

async function sendMutation(mutation: QueuedMutation): Promise<{ error: unknown }> {
  if (mutation.kind === 'endSession') {
    const { error } = await supabase.rpc('end_shopping_session', {
      p_session_id: mutation.sessionId,
      p_completed: mutation.completed,
    })
    return { error }
  }

  const { error } = await supabase.rpc('toggle_list_item_checked', {
    p_item_id: mutation.itemId,
    p_checked: mutation.checked,
  })
  return { error }
}

/**
 * Holds writes that couldn't be sent and replays them when the network returns.
 *
 * `onFlushed` runs only after something was actually sent, so callers can
 * refresh from the server without a redundant fetch on every reconnect.
 */
export function useOfflineQueue(onFlushed?: () => void) {
  const [pendingCount, setPendingCount] = useState(() => loadQueue().length)
  const onFlushedRef = useRef(onFlushed)
  onFlushedRef.current = onFlushed
  // Guards against the mount flush and an 'online' event racing each other and
  // sending the same operation twice. Harmless thanks to the idempotent RPC,
  // but no reason to do it.
  const flushingRef = useRef(false)

  const flushNow = useCallback(async () => {
    if (flushingRef.current) return
    const queued = loadQueue()
    if (queued.length === 0) return

    flushingRef.current = true
    try {
      const { sent, remaining } = await flush(queued, sendMutation)
      saveQueue(remaining)
      setPendingCount(remaining.length)
      if (sent > 0) onFlushedRef.current?.()
    } finally {
      flushingRef.current = false
    }
  }, [])

  useEffect(() => {
    // On mount as well as on reconnect: the browser may have been closed while
    // offline, so 'online' would never fire for work queued in a past session.
    flushNow()
    window.addEventListener('online', flushNow)
    return () => window.removeEventListener('online', flushNow)
  }, [flushNow])

  const queueToggle = useCallback((itemId: string, checked: boolean) => {
    const next = enqueue(loadQueue(), {
      kind: 'toggleChecked',
      itemId,
      checked,
      queuedAt: Date.now(),
    })
    saveQueue(next)
    setPendingCount(next.length)
  }, [])

  /** Queued so a trip finished with no signal still reaches the server.
   * Otherwise the session row stays open forever and the trip's duration and
   * outcome are never recorded.
   *
   * The replay recomputes checked_item_count from the list as it stands when it
   * lands rather than when you finished. In practice that's moments later and
   * identical; it would only differ if someone edited the list in between. */
  const queueSessionEnd = useCallback((sessionId: string, completed: boolean) => {
    const next = enqueue(loadQueue(), {
      kind: 'endSession',
      sessionId,
      completed,
      queuedAt: Date.now(),
    })
    saveQueue(next)
    setPendingCount(next.length)
  }, [])

  return { pendingCount, queueToggle, queueSessionEnd, flushNow }
}
