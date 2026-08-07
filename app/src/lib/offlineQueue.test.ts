import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyQueuedToggles, enqueue, flush, type QueuedMutation } from './offlineQueue.ts'

function toggle(itemId: string, checked: boolean, queuedAt = 0): QueuedMutation {
  return { kind: 'toggleChecked', itemId, checked, queuedAt }
}

function endSession(sessionId: string, completed = true, queuedAt = 0): QueuedMutation {
  return { kind: 'endSession', sessionId, completed, queuedAt }
}

/** Target of an operation, whatever its kind -- keeps the assertions readable. */
const targetOf = (m: QueuedMutation) => (m.kind === 'toggleChecked' ? m.itemId : m.sessionId)

test('queues operations for distinct items in order', () => {
  let q: QueuedMutation[] = []
  q = enqueue(q, toggle('a', true, 1))
  q = enqueue(q, toggle('b', true, 2))
  assert.deepEqual(q.map(targetOf), ['a', 'b'])
})

test('a newer operation supersedes a pending one for the same item', () => {
  let q: QueuedMutation[] = []
  q = enqueue(q, toggle('a', true, 1))
  q = enqueue(q, toggle('a', false, 2))
  assert.equal(q.length, 1, 'should not accumulate one entry per tap')
  assert.equal(q[0].kind === 'toggleChecked' && q[0].checked, false, 'latest intent wins')
})

test('superseding moves the item to the back, preserving latest-intent ordering', () => {
  let q: QueuedMutation[] = []
  q = enqueue(q, toggle('a', true, 1))
  q = enqueue(q, toggle('b', true, 2))
  q = enqueue(q, toggle('a', false, 3))
  assert.deepEqual(q.map(targetOf), ['b', 'a'])
})

test('queue stays bounded under repeated tapping', () => {
  let q: QueuedMutation[] = []
  for (let i = 0; i < 600; i++) q = enqueue(q, toggle(`item-${i}`, true, i))
  assert.equal(q.length, 500)
  assert.equal(targetOf(q[q.length - 1]), 'item-599', 'oldest are dropped, not newest')
})

test('a session end is queued alongside toggles', () => {
  let q: QueuedMutation[] = []
  q = enqueue(q, toggle('a', true, 1))
  q = enqueue(q, endSession('sess-1', true, 2))
  assert.deepEqual(q.map((m) => m.kind), ['toggleChecked', 'endSession'])
})

test('a session end supersedes only an earlier end of the same session', () => {
  let q: QueuedMutation[] = []
  q = enqueue(q, endSession('sess-1', false, 1))
  q = enqueue(q, endSession('sess-2', true, 2))
  q = enqueue(q, endSession('sess-1', true, 3))
  assert.deepEqual(q.map(targetOf), ['sess-2', 'sess-1'])
  assert.equal(q[1].kind === 'endSession' && q[1].completed, true)
})

test('a toggle and a session end sharing an id string do not collide', () => {
  // Identity is prefixed by kind. Without that, a session whose id happened to
  // match an item id would silently delete that item's pending toggle.
  let q: QueuedMutation[] = []
  q = enqueue(q, toggle('same-id', true, 1))
  q = enqueue(q, endSession('same-id', true, 2))
  assert.equal(q.length, 2, 'different kinds are different targets')
})

test('flush sends everything and empties the queue when all succeed', async () => {
  const q = [toggle('a', true), endSession('sess-1')]
  const seen: string[] = []
  const res = await flush(q, async (m) => {
    seen.push(targetOf(m))
    return { error: null }
  })
  assert.deepEqual(seen, ['a', 'sess-1'])
  assert.equal(res.sent, 2)
  assert.deepEqual(res.remaining, [])
})

test('flush stops at the first failure and keeps the rest, in order', async () => {
  const q = [toggle('a', true), toggle('b', true), toggle('c', true)]
  const seen: string[] = []
  const res = await flush(q, async (m) => {
    seen.push(targetOf(m))
    return { error: targetOf(m) === 'b' ? new Error('offline again') : null }
  })
  assert.deepEqual(seen, ['a', 'b'], 'must not keep trying after the network drops')
  assert.equal(res.sent, 1)
  assert.deepEqual(res.remaining.map(targetOf), ['b', 'c'], 'failed operation is retained')
})

test('pending toggles are overlaid onto cached items', () => {
  // The reported bug: reloading offline showed the cache (11:47, unchecked)
  // directly under a banner saying two changes were saved on the phone.
  const cached = [
    { id: 'brauts', is_checked: false },
    { id: 'bacon', is_checked: false },
    { id: 'milk', is_checked: true },
  ]
  const queue = [toggle('brauts', true), toggle('bacon', true)]

  assert.deepEqual(applyQueuedToggles(cached, queue), [
    { id: 'brauts', is_checked: true },
    { id: 'bacon', is_checked: true },
    { id: 'milk', is_checked: true },
  ])
})

test('an overlay can uncheck as well as check', () => {
  const items = [{ id: 'a', is_checked: true }]
  assert.deepEqual(applyQueuedToggles(items, [toggle('a', false)]), [{ id: 'a', is_checked: false }])
})

test('session ends in the queue never affect items', () => {
  const items = [{ id: 'a', is_checked: false }]
  assert.deepEqual(applyQueuedToggles(items, [endSession('a')]), items)
})

test('an empty queue returns the very same array', () => {
  const items = [{ id: 'a', is_checked: false }]
  assert.equal(applyQueuedToggles(items, []), items, 'should not churn identity for no reason')
})

test('overlay ignores queued items no longer on the list', () => {
  const items = [{ id: 'a', is_checked: false }]
  assert.deepEqual(applyQueuedToggles(items, [toggle('deleted-item', true)]), items)
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
