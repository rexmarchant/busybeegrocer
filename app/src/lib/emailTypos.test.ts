import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestEmailCorrection } from './emailTypos.ts'

/** Domains that should be corrected.
 *
 * `homail.com` is not hypothetical -- production has a real account on that
 * domain, created and never confirmed, because someone typed one character
 * wrong and got a silently-created dead user. */
const CORRECTS: [input: string, expected: string][] = [
  ['rex@homail.com', 'rex@hotmail.com'],
  ['rex@gmial.com', 'rex@gmail.com'], // transposition -- needs Damerau, not plain Levenshtein
  ['rex@gmai.com', 'rex@gmail.com'],
  ['rex@outlok.com', 'rex@outlook.com'],
  ['rex@yaho.com', 'rex@yahoo.com'],
  ['rex@gmail.con', 'rex@gmail.com'],
  ['rex@gmail.co', 'rex@gmail.com'],
  ['rex@icloud.co', 'rex@icloud.com'],
]

/** Addresses that must be left alone.
 *
 * These matter more than the corrections: a confidently wrong suggestion on
 * someone's real address is worse than missing a typo altogether. */
const LEAVES_ALONE: string[] = [
  'rex@gmail.com', // already correct
  'rex@hotmail.com',
  'rex@proton.me',
  'rex@yahoo.ca', // legitimate ccTLD, two edits from yahoo.com
  'rex@gmx.de',
  'rex@hotmail.co.uk', // compound TLD
  'rex@yahoo.com.au',
  'rex@mycompany.com', // ordinary corporate domain
  'rex@churchofjesuschrist.org',
  'rex@', // malformed
  'rex',
  '@gmail.com',
  '',
]

test('corrects a mistyped provider domain', () => {
  for (const [input, expected] of CORRECTS) {
    assert.equal(suggestEmailCorrection(input), expected, `expected ${input} -> ${expected}`)
  }
})

test('leaves legitimate, unknown and malformed addresses alone', () => {
  for (const input of LEAVES_ALONE) {
    assert.equal(suggestEmailCorrection(input), null, `expected no suggestion for ${input}`)
  }
})
