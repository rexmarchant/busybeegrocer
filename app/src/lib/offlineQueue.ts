/** Durable queue for writes made while offline.
 *
 * The app is used in shops, which are reliably the worst signal in anyone's
 * week. Before this, a failed toggle was reverted and forgotten -- honest, but
 * it still meant you couldn't check anything off until you found a bar of
 * signal. Now the intent is kept and replayed when the network returns.
 *
 * Replay is only safe because toggle_list_item_checked is idempotent (see
 * migration 20260806173725): calling it with the value an item already has does
 * nothing, so a replayed operation can never inflate the lifetime tallies. */

const QUEUE_KEY = 'busybeegrocer:mutationQueue'

/** A whole trip is a few dozen items; anything beyond this is a bug or abuse,
 * and an unbounded queue in localStorage would eventually break the app. */
const MAX_QUEUED = 500

export interface QueuedToggle {
  kind: 'toggleChecked'
  itemId: string
  checked: boolean
  queuedAt: number
}

export type QueuedMutation = QueuedToggle

/** Adds an operation, superseding any pending one for the same item.
 *
 * Only the latest intent per item is worth sending: the RPC sets absolute
 * state rather than applying a delta, so replaying an older value for the same
 * item could only ever be wrong. This also keeps the queue bounded when someone
 * taps a row repeatedly.
 *
 * The trade-off: a check-then-uncheck done entirely offline arrives as a single
 * transition, so the lifetime tallies record one change rather than two. The
 * tallies are a statistic; the checkbox state is what people actually rely on. */
export function enqueue(queue: QueuedMutation[], mutation: QueuedMutation): QueuedMutation[] {
  const withoutItem = queue.filter((m) => m.itemId !== mutation.itemId)
  const next = [...withoutItem, mutation]
  return next.length > MAX_QUEUED ? next.slice(next.length - MAX_QUEUED) : next
}

/** Sends queued operations in order, stopping at the first failure.
 *
 * Stopping rather than skipping matters: a failure almost always means the
 * network went away again, so continuing would just burn through the rest of
 * the queue turning every one into a failure. Whatever hasn't been sent is
 * returned so the caller can persist it and try again later. */
export async function flush(
  queue: QueuedMutation[],
  send: (mutation: QueuedMutation) => Promise<{ error: unknown }>,
): Promise<{ sent: number; remaining: QueuedMutation[] }> {
  for (let i = 0; i < queue.length; i++) {
    const { error } = await send(queue[i])
    if (error) return { sent: i, remaining: queue.slice(i) }
  }
  return { sent: queue.length, remaining: [] }
}

export function loadQueue(): QueuedMutation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QueuedMutation[]) : []
  } catch {
    // Corrupt or unreadable storage must never stop the app loading. Losing a
    // queued toggle is a far smaller failure than a white screen.
    return []
  }
}

export function saveQueue(queue: QueuedMutation[]) {
  try {
    if (queue.length === 0) localStorage.removeItem(QUEUE_KEY)
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // Private mode or a full quota. Nothing useful to do, and it must not throw
    // in the middle of someone's shopping trip.
  }
}
