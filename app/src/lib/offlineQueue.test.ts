import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enqueue, flush, type QueuedMutation } from './offlineQueue.ts'

function toggle(itemId: string, checked: boolean, queuedAt = 0): QueuedMutation {
  return { kind: 'toggleChecked', itemId, checked, queuedAt }
}

test('queues operations for distinct items in order', () => {
  let q: QueuedMutation[] = []
  q = enqueue(q, toggle('a', true, 1))
  q = enqueue(q, toggle('b', true, 2))
  assert.deepEqual(
    q.map((m) => [m.itemId, m.checked]),
    [
      ['a', true],
      ['b', true],
    ],
  )
})

test('a newer operation supersedes a pending one for the same item', () => {
  let q: QueuedMutation[] = []
  q = enqueue(q, toggle('a', true, 1))
  q = enqueue(q, toggle('a', false, 2))
  assert.equal(q.length, 1, 'should not accumulate one entry per tap')
  assert.equal(q[0].checked, false, 'the latest intent is the one that matters')
})

test('superseding moves the item to the back, preserving latest-intent ordering', () => {
  let q: QueuedMutation[] = []
  q = enqueue(q, toggle('a', true, 1))
  q = enqueue(q, toggle('b', true, 2))
  q = enqueue(q, toggle('a', false, 3))
  assert.deepEqual(q.map((m) => m.itemId), ['b', 'a'])
})

test('queue stays bounded under repeated tapping', () => {
  let q: QueuedMutation[] = []
  for (let i = 0; i < 600; i++) q = enqueue(q, toggle(`item-${i}`, true, i))
  assert.equal(q.length, 500)
  // the oldest are dropped, not the newest
  assert.equal(q[q.length - 1].itemId, 'item-599')
})

test('flush sends everything and empties the queue when all succeed', async () => {
  const q = [toggle('a', true), toggle('b', false)]
  const seen: string[] = []
  const res = await flush(q, async (m) => {
    seen.push(m.itemId)
    return { error: null }
  })
  assert.deepEqual(seen, ['a', 'b'])
  assert.equal(res.sent, 2)
  assert.deepEqual(res.remaining, [])
})

test('flush stops at the first failure and keeps the rest, in order', async () => {
  const q = [toggle('a', true), toggle('b', true), toggle('c', true)]
  const seen: string[] = []
  const res = await flush(q, async (m) => {
    seen.push(m.itemId)
    return { error: m.itemId === 'b' ? new Error('offline again') : null }
  })
  assert.deepEqual(seen, ['a', 'b'], 'must not keep trying after the network drops')
  assert.equal(res.sent, 1)
  assert.deepEqual(
    res.remaining.map((m) => m.itemId),
    ['b', 'c'],
    'the failed operation is retained, not dropped',
  )
})

test('flush on an empty queue is a no-op', async () => {
  let called = 0
  const res = await flush([], async () => {
    called++
    return { error: null }
  })
  assert.equal(called, 0)
  assert.equal(res.sent, 0)
})
