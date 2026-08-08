import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseInline, parseMarkdown } from './markdown.ts'

const plain = (segments: { text: string; bold: boolean }[]) => segments.map((s) => s.text).join('')

test('splits inline bold into segments', () => {
  assert.deepEqual(parseInline('a **b** c'), [
    { text: 'a ', bold: false },
    { text: 'b', bold: true },
    { text: ' c', bold: false },
  ])
})

test('leaves an unmatched ** as literal text rather than eating the document', () => {
  const segments = parseInline('this **never closes')
  assert.equal(plain(segments), 'this **never closes')
  assert.ok(!segments.some((s) => s.bold))
})

test('handles text with no formatting at all', () => {
  assert.deepEqual(parseInline('nothing special'), [{ text: 'nothing special', bold: false }])
})

test('parses headings at both levels', () => {
  const blocks = parseMarkdown('# Privacy\n\n## What is stored')
  assert.deepEqual(
    blocks.map((b) => (b.type === 'heading' ? [b.level, plain(b.segments)] : b.type)),
    [
      [1, 'Privacy'],
      [2, 'What is stored'],
    ],
  )
})

test('joins hard-wrapped lines into flowing paragraphs', () => {
  const blocks = parseMarkdown('one line\nwrapped onto another\n\nsecond para')
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].type === 'paragraph' && plain(blocks[0].segments), 'one line wrapped onto another')
})

test('parses the same whatever the line endings are', () => {
  // Git checks out CRLF on Windows. Without normalising, "\r\n\r\n" is not a
  // blank line to /\n{2,}/ and the entire document becomes one paragraph.
  const lf = '# Title\n\nFirst para\n\n## Section\n\nSecond para'
  const crlf = lf.replace(/\n/g, '\r\n')
  const cr = lf.replace(/\n/g, '\r')

  assert.equal(parseMarkdown(crlf).length, parseMarkdown(lf).length)
  assert.equal(parseMarkdown(cr).length, parseMarkdown(lf).length)
  assert.deepEqual(
    parseMarkdown(crlf).map((b) => b.type),
    ['heading', 'paragraph', 'heading', 'paragraph'],
  )
})

test('recognises a horizontal rule', () => {
  const blocks = parseMarkdown('before\n\n---\n\nafter')
  assert.deepEqual(blocks.map((b) => b.type), ['paragraph', 'rule', 'paragraph'])
})

test('ignores blank space between blocks', () => {
  assert.deepEqual(parseMarkdown('\n\n\n   \n\n'), [])
})

test('the real policy parses into something with structure', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(new URL('../../../PRIVACY.md', import.meta.url), 'utf-8')
  const blocks = parseMarkdown(source)

  assert.ok(blocks.length > 15, 'policy should produce a substantial document')
  assert.ok(
    blocks.some((b) => b.type === 'heading' && b.level === 1),
    'policy should have a title',
  )
  assert.ok(
    blocks.filter((b) => b.type === 'heading' && b.level === 2).length >= 5,
    'policy should have several sections',
  )
  // The contact address is the one thing a policy cannot be missing.
  assert.ok(source.includes('@'), 'policy must carry a contact address')
})
