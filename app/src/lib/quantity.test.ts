import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_QUANTITY, normalizeQuantity, sanitizeQuantityInput } from './quantity.ts'

test('an emptied box stays empty while typing', () => {
  // The reported bug: backspacing over the 1 snapped straight back to 1, so the
  // value could never be changed to anything else.
  assert.equal(sanitizeQuantityInput(''), '')
})

test('keeps digits and drops everything else', () => {
  assert.equal(sanitizeQuantityInput('2'), '2')
  assert.equal(sanitizeQuantityInput('12'), '12')
  assert.equal(sanitizeQuantityInput('1e5'), '15')
  assert.equal(sanitizeQuantityInput('-3'), '3')
  assert.equal(sanitizeQuantityInput('abc'), '')
})

test('drops leading zeros without eating a lone zero mid-type', () => {
  assert.equal(sanitizeQuantityInput('05'), '5')
  assert.equal(sanitizeQuantityInput('0'), '0')
})

test('caps at the maximum', () => {
  assert.equal(sanitizeQuantityInput('1000'), String(MAX_QUANTITY))
})

test('saving turns anything unusable into 1', () => {
  assert.equal(normalizeQuantity(''), 1)
  assert.equal(normalizeQuantity('0'), 1)
  assert.equal(normalizeQuantity('abc'), 1)
})

test('saving keeps a real quantity', () => {
  assert.equal(normalizeQuantity('2'), 2)
  assert.equal(normalizeQuantity('12'), 12)
  assert.equal(normalizeQuantity('99999'), MAX_QUANTITY)
})
