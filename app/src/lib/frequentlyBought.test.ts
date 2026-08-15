import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HALF_LIFE_DAYS,
  decayFactor,
  purchaseScore,
  rankFrequentlyBought,
} from './frequentlyBought.ts'

const NOW = Date.parse('2026-08-15T12:00:00Z')
const DAY = 86_400_000

function daysAgo(n: number): string {
  return new Date(NOW - n * DAY).toISOString()
}

/** A row as the database holds it, with only the fields ranking looks at. */
function item(over: Partial<Parameters<typeof purchaseScore>[0]> & { id: string }) {
  return { checked_count: 0, purchase_score: 0, last_checked_at: null, ...over }
}

test('a purchase is worth half as much after one half-life', () => {
  assert.equal(decayFactor(0), 1)
  assert.equal(decayFactor(HALF_LIFE_DAYS), 0.5)
  assert.equal(decayFactor(HALF_LIFE_DAYS * 2), 0.25)
})

test('a timestamp in the future does not count for more than one', () => {
  // Phone clocks disagree with servers. Skew must never inflate a score.
  assert.equal(decayFactor(-30), 1)
  assert.equal(decayFactor(NaN), 1)
})

test('recent buying beats a bigger tally that stopped', () => {
  // The case this ranking exists for: 30 buys over its life, then nothing for a
  // year, against 10 buys in the last three months.
  const abandoned = item({ id: 'a', checked_count: 30, purchase_score: 30, last_checked_at: daysAgo(365) })
  const current = item({ id: 'b', checked_count: 10, purchase_score: 8, last_checked_at: daysAgo(5) })

  assert.ok(purchaseScore(current, NOW) > purchaseScore(abandoned, NOW))
  assert.deepEqual(
    rankFrequentlyBought([abandoned, current], NOW).map((i) => i.id),
    ['b', 'a'],
  )
})

test('with the same history, the one bought more recently ranks higher', () => {
  const older = item({ id: 'a', checked_count: 12, purchase_score: 6, last_checked_at: daysAgo(120) })
  const newer = item({ id: 'b', checked_count: 12, purchase_score: 6, last_checked_at: daysAgo(3) })

  assert.deepEqual(rankFrequentlyBought([older, newer], NOW).map((i) => i.id), ['b', 'a'])
})

test('with the same recency, the one bought more often ranks higher', () => {
  const rare = item({ id: 'a', checked_count: 3, purchase_score: 2, last_checked_at: daysAgo(7) })
  const staple = item({ id: 'b', checked_count: 40, purchase_score: 9, last_checked_at: daysAgo(7) })

  assert.deepEqual(rankFrequentlyBought([rare, staple], NOW).map((i) => i.id), ['b', 'a'])
})

test('an item never bought is left out entirely', () => {
  const neverBought = item({ id: 'a', checked_count: 0, purchase_score: 0 })
  const bought = item({ id: 'b', checked_count: 1, purchase_score: 1, last_checked_at: daysAgo(1) })

  assert.equal(purchaseScore(neverBought, NOW), 0)
  assert.deepEqual(rankFrequentlyBought([neverBought, bought], NOW).map((i) => i.id), ['b'])
})

test('falls back to the lifetime tally when the score columns are missing', () => {
  // What an offline snapshot cached by a build from before the migration looks
  // like. It must still rank, and still prefer the more recent item.
  const old = { id: 'a', checked_count: 20, last_modified_at: daysAgo(400) }
  const recent = { id: 'b', checked_count: 6, last_modified_at: daysAgo(10) }

  assert.ok(purchaseScore(old, NOW) > 0)
  assert.deepEqual(rankFrequentlyBought([old, recent], NOW).map((i) => i.id), ['b', 'a'])
})

test('an item with no usable timestamp still ranks on frequency alone', () => {
  const undated = { id: 'a', checked_count: 5 }
  assert.equal(purchaseScore(undated, NOW), 5)

  const junk = { id: 'b', checked_count: 5, last_checked_at: 'not a date' }
  assert.equal(purchaseScore(junk, NOW), 5)
})

test('the panel is capped, keeping the highest scorers', () => {
  const items = Array.from({ length: 40 }, (_, i) =>
    item({ id: `i${i}`, checked_count: i + 1, purchase_score: i + 1, last_checked_at: daysAgo(1) }),
  )
  const ranked = rankFrequentlyBought(items, NOW, 25)

  assert.equal(ranked.length, 25)
  assert.equal(ranked[0].id, 'i39')
  assert.ok(!ranked.some((i) => i.checked_count <= 15))
})

test('order is stable when scores tie exactly', () => {
  const a = item({ id: 'a', checked_count: 4, purchase_score: 4, last_checked_at: daysAgo(2) })
  const b = item({ id: 'b', checked_count: 4, purchase_score: 4, last_checked_at: daysAgo(2) })

  assert.deepEqual(rankFrequentlyBought([b, a], NOW).map((i) => i.id), ['a', 'b'])
  assert.deepEqual(rankFrequentlyBought([a, b], NOW).map((i) => i.id), ['a', 'b'])
})
