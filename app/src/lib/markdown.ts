/** A deliberately tiny Markdown subset -- enough to render PRIVACY.md in the
 * app without duplicating it.
 *
 * The alternative was keeping the policy text in two places, one for GitHub and
 * one for the app, which drift the moment either is edited. A privacy policy
 * that disagrees with itself is worse than an ugly one, so the file stays the
 * single source and this turns it into something presentable.
 *
 * Supports headings, paragraphs, horizontal rules and inline bold. Anything
 * else passes through as literal text -- which is the right failure mode for a
 * document that must stay readable no matter what. */

export interface MdSegment {
  text: string
  bold: boolean
}

export type MdBlock =
  | { type: 'heading'; level: 1 | 2; segments: MdSegment[] }
  | { type: 'paragraph'; segments: MdSegment[] }
  | { type: 'rule' }

/** Splits on **bold** pairs. An unmatched ** is left as literal text rather
 * than swallowing the rest of the document. */
export function parseInline(text: string): MdSegment[] {
  const segments: MdSegment[] = []
  let rest = text

  while (rest.length > 0) {
    const open = rest.indexOf('**')
    if (open === -1) break

    const close = rest.indexOf('**', open + 2)
    if (close === -1) break // unmatched: treat the remainder as plain

    if (open > 0) segments.push({ text: rest.slice(0, open), bold: false })
    const inner = rest.slice(open + 2, close)
    if (inner.length > 0) segments.push({ text: inner, bold: true })
    rest = rest.slice(close + 2)
  }

  if (rest.length > 0) segments.push({ text: rest, bold: false })
  return segments
}

export function parseMarkdown(source: string): MdBlock[] {
  const blocks: MdBlock[] = []

  for (const raw of source.split(/\n{2,}/)) {
    const chunk = raw.trim()
    if (chunk.length === 0) continue

    if (/^-{3,}$/.test(chunk)) {
      blocks.push({ type: 'rule' })
      continue
    }

    const heading = /^(#{1,2})\s+(.*)$/.exec(chunk)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2,
        segments: parseInline(heading[2].trim()),
      })
      continue
    }

    // Hard-wrapped source should read as flowing prose, not as broken lines.
    blocks.push({ type: 'paragraph', segments: parseInline(chunk.replace(/\s*\n\s*/g, ' ')) })
  }

  return blocks
}
