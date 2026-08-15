import { test } from 'node:test'
import assert from 'node:assert/strict'
import { personLabel, personName } from './personName.ts'

/** Sign-up seeds display_name with the address, which is what the real profiles
 * look like — every one of them carries the email in both columns. */
function seeded(id: string, email: string) {
  return { id, email, display_name: email }
}

test('shows the part before the @', () => {
  assert.equal(personName('juanitamarchant@yahoo.com'), 'juanitamarchant')
})

test('leaves a real name alone', () => {
  assert.equal(personName('Rex'), 'Rex')
  assert.equal(personName(''), '')
  assert.equal(personName(null), '')
})

test('an address with nothing before the @ is left as-is', () => {
  // Not a real address, but slicing at 0 would produce an empty label.
  assert.equal(personName('@nobody.com'), '@nobody.com')
})

test('trims display_name too, not just the email fallback', () => {
  // The bug this exists to prevent: trimming only the fallback changed nothing
  // on screen, because display_name is seeded with the address and always won.
  const p = seeded('a', 'rexmarchant@gmail.com')
  assert.equal(personLabel([p], p), 'rexmarchant')
})

test('two people who shorten to the same name both show their address', () => {
  const gmail = seeded('a', 'rexmarchant@gmail.com')
  const yahoo = seeded('b', 'rexmarchant@yahoo.com')
  const group = [gmail, yahoo]

  assert.equal(personLabel(group, gmail), 'rexmarchant@gmail.com')
  assert.equal(personLabel(group, yahoo), 'rexmarchant@yahoo.com')
})

test('a collision only affects the people who collide', () => {
  const gmail = seeded('a', 'rexmarchant@gmail.com')
  const yahoo = seeded('b', 'rexmarchant@yahoo.com')
  const other = seeded('c', 'juanitamarchant@yahoo.com')
  const group = [gmail, yahoo, other]

  assert.equal(personLabel(group, other), 'juanitamarchant')
})

test('capitalisation does not hide a collision', () => {
  const lower = seeded('a', 'rexmarchant@gmail.com')
  const upper = seeded('b', 'RexMarchant@yahoo.com')
  const group = [lower, upper]

  assert.equal(personLabel(group, lower), 'rexmarchant@gmail.com')
  assert.equal(personLabel(group, upper), 'RexMarchant@yahoo.com')
})

test('a real display name is preferred, and disambiguates by address', () => {
  const rex = { id: 'a', email: 'rexmarchant@gmail.com', display_name: 'Rex' }
  const juanita = { id: 'b', email: 'juanitamarchant@yahoo.com', display_name: 'Juanita' }
  assert.equal(personLabel([rex, juanita], rex), 'Rex')

  // Two people who genuinely share a display name fall back to the address,
  // which is the only thing guaranteed to differ.
  const otherRex = { id: 'c', email: 'rex@work.example', display_name: 'Rex' }
  assert.equal(personLabel([rex, otherRex], otherRex), 'rex@work.example')
})

test('someone not in the set, or with nothing to show, still gets a label', () => {
  assert.equal(personLabel([], null), 'Someone')
  assert.equal(personLabel([], { id: 'a', email: null, display_name: null }), 'Someone')
})

test('comparing against itself is not a collision', () => {
  const p = seeded('a', 'rexmarchant@gmail.com')
  assert.equal(personLabel([p, p], p), 'rexmarchant')
})
