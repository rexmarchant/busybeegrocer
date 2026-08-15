/** Ranking for the Frequently Bought panel.
 *
 * "Bought 30 times, but not since last spring" should not outrank "bought 10
 * times since May". A lifetime tally cannot tell those apart -- it only ever
 * grows, so a staple you have stopped buying sits at the top of the panel
 * forever, and the thing you actually buy every week is somewhere below it.
 *
 * So a purchase is worth less the older it is. The database keeps a
 * `purchase_score` on each item: an exponentially decayed count, updated on
 * every check-off (migration 20260815125948) by decaying whatever was there and
 * adding 1. Decaying it again here, by the time since that last purchase, gives
 * a number that reads as "roughly how many times this has been bought lately"
 * and keeps falling while an item goes unbought -- without the app having to
 * store a purchase history anywhere.
 *
 * The half-life is the one knob. At 90 days a purchase counts for half as much
 * three months later and a quarter as much six months later. It MUST match the
 * constant in that migration; if the two drift apart, the stored score and the
 * score shown are measuring different things. */

export const HALF_LIFE_DAYS = 90

/** How many rows the panel shows. */
export const FREQUENTLY_BOUGHT_LIMIT = 25

const MS_PER_DAY = 86_400_000

/** The shape ranking needs. The two newer fields are optional because they can
 * genuinely be missing at runtime: an offline snapshot cached by a build from
 * before the migration has neither. */
export interface RankableItem {
  id: string
  checked_count: number
  purchase_score?: number | null
  last_checked_at?: string | null
  last_modified_at?: string | null
}

export interface RankedItem<T> {
  item: T
  score: number
}

/** What a purchase made `ageDays` ago is worth today. Never more than 1: a
 * timestamp in the future means a clock disagreement, not a purchase that
 * counts extra. */
export function decayFactor(ageDays: number): number {
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
}

/** Frequency and recency as a single number. Higher is more worth suggesting. */
export function purchaseScore(item: RankableItem, now: number): number {
  if (!(item.checked_count > 0)) return 0

  // Falling back to the lifetime tally covers two cases: a row the migration
  // backfilled from counts it had no history for, and a cached snapshot written
  // by an older build. Both are approximations, and both are the same
  // approximation the backfill makes, so the panel degrades rather than breaks.
  const base =
    typeof item.purchase_score === 'number' && item.purchase_score > 0
      ? item.purchase_score
      : item.checked_count

  const stamp = item.last_checked_at ?? item.last_modified_at
  const at = stamp ? Date.parse(stamp) : NaN
  // No usable timestamp at all: fall back to frequency alone rather than
  // scoring it zero and hiding an item that has genuinely been bought.
  if (!Number.isFinite(at)) return base

  return base * decayFactor((now - at) / MS_PER_DAY)
}

/** Highest-scoring first. Ties fall back to the lifetime tally, then to id so
 * the order is stable across reloads rather than reshuffling. */
export function rankFrequentlyBought<T extends RankableItem>(
  items: T[],
  now: number,
  limit = FREQUENTLY_BOUGHT_LIMIT,
): T[] {
  return items
    .filter((i) => i.checked_count > 0)
    .map((item): RankedItem<T> => ({ item, score: purchaseScore(item, now) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.item.checked_count - a.item.checked_count ||
        a.item.id.localeCompare(b.item.id),
    )
    .slice(0, limit)
    .map((r) => r.item)
}
