import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EARLY_RELEASES, buildReleaseHistory, parseChangelog, sentenceCase } from './releaseNotes.ts'

const SAMPLE = `# [2.3.0](https://github.com/o/r/compare/v2.2.0...v2.3.0) (2026-08-14)


### Bug Fixes

* let the item quantity actually be changed ([5d5c5dd](https://github.com/o/r/commit/5d5c5dd))


### Features

* add a read-only Shopping Preview ([cdea7a4](https://github.com/o/r/commit/cdea7a4))

# [2.0.0](https://github.com/o/r/compare/v1.8.1...v2.0.0) (2026-08-08)


* feat!: move BusyBeeGrocer to busybeegrocer.com ([b3a3dcb](https://github.com/o/r/commit/b3a3dcb))


### BREAKING CHANGES

* The app has moved to a new domain, and every existing
home-screen install is orphaned by it.

Nothing server-side is affected.

## [1.6.0](https://github.com/o/r/compare/v1.5.1...v1.6.0) (2026-08-06)


### Bug Fixes

* **db:** close open group-join policy ([7214fa5](https://github.com/o/r/commit/7214fa5))
`

test('reads version and date out of a linked heading', () => {
  const [latest] = parseChangelog(SAMPLE)
  assert.equal(latest.version, '2.3.0')
  assert.equal(latest.date, '2026-08-14')
})

test('sorts each bullet under the heading it appeared beneath', () => {
  const [latest] = parseChangelog(SAMPLE)
  assert.deepEqual(
    latest.changes.map((c) => [c.kind, c.paragraphs[0]]),
    [
      ['fix', 'Let the item quantity actually be changed'],
      ['feature', 'Add a read-only Shopping Preview'],
    ],
  )
})

test('strips the commit link off every bullet', () => {
  for (const release of parseChangelog(SAMPLE)) {
    for (const change of release.changes) {
      for (const p of change.paragraphs) {
        assert.doesNotMatch(p, /github\.com|\(\[/)
      }
    }
  }
})

test('a sectionless bullet takes its kind from its own prefix', () => {
  // 2.0.0's breaking commit is listed bare, above the BREAKING CHANGES note.
  const v2 = parseChangelog(SAMPLE).find((r) => r.version === '2.0.0')!
  assert.equal(v2.changes[0].kind, 'breaking')
  assert.equal(v2.changes[0].paragraphs[0], 'Move BusyBeeGrocer to busybeegrocer.com')
})

test('a breaking-change note keeps its paragraphs and loses its line wrapping', () => {
  const v2 = parseChangelog(SAMPLE).find((r) => r.version === '2.0.0')!
  const note = v2.changes[1]
  assert.equal(note.kind, 'breaking')
  assert.deepEqual(note.paragraphs, [
    'The app has moved to a new domain, and every existing home-screen install is orphaned by it.',
    'Nothing server-side is affected.',
  ])
})

test('a bold scope becomes plain text, and keeps its lowercase scope', () => {
  const v16 = parseChangelog(SAMPLE).find((r) => r.version === '1.6.0')!
  assert.equal(v16.changes[0].paragraphs[0], 'db: Close open group-join policy')
})

test('commit subjects are capitalised for reading, scopes left alone', () => {
  assert.equal(sentenceCase('let the quantity be changed'), 'Let the quantity be changed')
  assert.equal(sentenceCase('pwa: add install screenshots'), 'pwa: Add install screenshots')
  assert.equal(sentenceCase('Already capitalised'), 'Already capitalised')
  assert.equal(sentenceCase(''), '')
})

test('works out how big each version jump was', () => {
  const history = buildReleaseHistory(SAMPLE, [])
  assert.equal(history.find((r) => r.version === '2.3.0')!.step, 'minor') // 2.0.0 is next in this sample
  assert.equal(history.find((r) => r.version === '2.0.0')!.step, 'major')
  assert.equal(history.at(-1)!.step, null) // nothing older to compare against
})

test('the real changelog parses, and every release has a version and a date', () => {
  // Guards against semantic-release changing its output format under us: the
  // page would quietly go blank rather than fail the build.
  const source = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8')
  const history = buildReleaseHistory(source)

  assert.ok(history.length > 20, `expected the whole history, got ${history.length}`)
  for (const release of history) {
    assert.match(release.version, /^\d+\.\d+\.\d+$/)
    assert.match(release.date ?? '', /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(release.changes.length > 0, `${release.version} has no entries`)
  }
})

test('history runs unbroken back to 1.0.0', () => {
  const source = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8')
  const history = buildReleaseHistory(source)
  assert.equal(history.at(-1)!.version, '1.0.0')
  assert.equal(history.at(-1)!.step, null)
  // The two hand-written ones must not also appear in the generated file.
  const versions = history.map((r) => r.version)
  assert.equal(new Set(versions).size, versions.length)
})

test('the early releases are the ones the changelog is missing', () => {
  assert.deepEqual(
    EARLY_RELEASES.map((r) => r.version),
    ['1.1.0', '1.0.0'],
  )
})
