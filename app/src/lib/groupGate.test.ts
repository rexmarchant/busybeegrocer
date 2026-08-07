import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupGate } from './groupGate.ts'

const base = { authLoading: false, groupsLoading: false, groupCount: 0, loadFailed: false }

test('waits while auth is still restoring, even though no groups are loaded yet', () => {
  // The reported bug: on a cold offline reload, auth was mid-restore and groups
  // had been cleared to []. Anything but 'loading' here sends someone to
  // "Create your group" for a render, and the redirect sticks.
  assert.equal(groupGate({ ...base, authLoading: true }), 'loading')
  assert.equal(groupGate({ ...base, authLoading: true, loadFailed: true }), 'loading')
})

test('waits while a group read is in flight', () => {
  assert.equal(groupGate({ ...base, groupsLoading: true }), 'loading')
})

test('shows the app when groups are known, fresh or cached', () => {
  assert.equal(groupGate({ ...base, groupCount: 2 }), 'ready')
})

test('shows cached groups even when the refresh failed', () => {
  // Otherwise caching them would buy nothing on the one occasion it matters.
  assert.equal(groupGate({ ...base, groupCount: 2, loadFailed: true }), 'ready')
})

test('offers setup only when confirmed to have no groups', () => {
  assert.equal(groupGate(base), 'setup')
})

test('shows the offline notice when we have nothing and could not ask', () => {
  assert.equal(groupGate({ ...base, loadFailed: true }), 'offline')
})

test('never returns setup while anything is still unknown', () => {
  for (const authLoading of [true, false]) {
    for (const groupsLoading of [true, false]) {
      for (const loadFailed of [true, false]) {
        const gate = groupGate({ ...base, authLoading, groupsLoading, loadFailed })
        if (authLoading || groupsLoading || loadFailed) {
          assert.notEqual(gate, 'setup', `setup reached with ${JSON.stringify({ authLoading, groupsLoading, loadFailed })}`)
        }
      }
    }
  }
})
