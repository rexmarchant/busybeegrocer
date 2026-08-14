/** Quantity is edited as *text*, not as a number.
 *
 * The bug this exists to prevent: the field used to coerce every keystroke back
 * to a number with `Math.max(1, parseInt(value) || 1)`. Clearing it produced an
 * empty string, which became 1 again before the browser had repainted — so
 * backspace appeared to do nothing and the 1 could never be replaced. An empty
 * box is a legitimate state to pass through on the way from 1 to 2; only what
 * gets *saved* has to be a real quantity. */

export const MAX_QUANTITY = 999

/** What to keep as someone types. Digits only, leading zeros dropped, capped —
 * and empty is allowed, deliberately. */
export function sanitizeQuantityInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
  if (digits === '') return ''
  return String(Math.min(parseInt(digits, 10), MAX_QUANTITY))
}

/** The value actually saved. Anything unusable — empty, zero, junk — means 1. */
export function normalizeQuantity(raw: string): number {
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, MAX_QUANTITY)
}
