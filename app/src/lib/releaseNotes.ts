/**
 * Turns the generated `app/CHANGELOG.md` into rows for the Release History page.
 *
 * The point of parsing rather than hand-writing: semantic-release rewrites that
 * file on every release, *before* the build runs (see `.github/workflows/deploy.yml`
 * — `npx semantic-release` at step 44, `npm run build` at step 51). So a release
 * appears on the page the moment it ships, and nobody has to remember to add it.
 * Never edit CHANGELOG.md by hand to change this page; fix the parser instead.
 */

export type ChangeKind = 'feature' | 'fix' | 'breaking' | 'other'

export interface ReleaseChange {
  kind: ChangeKind
  /** What to show in the Type column. */
  label: string
  /** Paragraphs. Usually one; BREAKING CHANGES notes run long. */
  paragraphs: string[]
}

export interface Release {
  version: string
  /** ISO yyyy-mm-dd, or null if the heading had no date. */
  date: string | null
  /** Size of the jump from the previous release. Null for the earliest one. */
  step: 'major' | 'minor' | 'patch' | null
  changes: ReleaseChange[]
}

/** `# [2.3.0](url) (2026-08-14)`, `## 1.2.3 (2026-01-01)` — 1–3 hashes, linked or not. */
const VERSION_HEADING = /^#{1,3}\s+\[?(\d+\.\d+\.\d+)\]?/
const DATE_AT_END = /\((\d{4}-\d{2}-\d{2})\)\s*$/
const SECTION_HEADING = /^#{3,4}\s+(.+?)\s*$/
const BULLET = /^\*\s+(.*)$/
/** The ` ([abc1234](https://…/commit/abc…))` semantic-release appends to every bullet. */
const TRAILING_COMMIT_LINK = /\s*\(\[[0-9a-f]{6,}\]\([^)]*\)\)\s*$/
/** A conventional-commit prefix left in the text, e.g. `feat!: ` or `fix(db): `. */
const CONVENTIONAL_PREFIX = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*/
/** `**db:** …` — semantic-release's rendering of a commit scope. */
const BOLD_SCOPE = /^\*\*([^*]+):\*\*\s*/

function kindFromSection(heading: string): ChangeKind {
  const h = heading.toLowerCase()
  if (h.includes('breaking')) return 'breaking'
  if (h.startsWith('feature')) return 'feature'
  if (h.includes('bug fix') || h.startsWith('fix')) return 'fix'
  return 'other'
}

export function labelFor(kind: ChangeKind): string {
  switch (kind) {
    case 'feature':
      return 'Feature'
    case 'fix':
      return 'Fix'
    case 'breaking':
      return 'Breaking'
    case 'other':
      return 'Change'
  }
}

/** Tidy one bullet: drop the commit link, the conventional prefix and the bold
 * scope markers, and note whether the prefix declared a breaking change. */
function cleanBullet(raw: string): { text: string; kind: ChangeKind | null } {
  let text = raw.replace(TRAILING_COMMIT_LINK, '').trim()

  // A bold scope is already semantic-release's own rendering, so it must be
  // taken first *and* stop there — otherwise the conventional-prefix matcher
  // below reads "db:" as a commit type and eats it.
  const scope = text.match(BOLD_SCOPE)
  if (scope) return { text: `${scope[1]}: ${text.slice(scope[0].length)}`, kind: null }

  const prefix = text.match(CONVENTIONAL_PREFIX)
  if (!prefix) return { text, kind: null }

  text = text.slice(prefix[0].length)
  if (prefix[2]) text = `${prefix[2]}: ${text}`
  if (prefix[3]) return { text, kind: 'breaking' }
  const type = prefix[1].toLowerCase()
  if (type === 'feat') return { text, kind: 'feature' }
  if (type === 'fix') return { text, kind: 'fix' }
  return { text, kind: 'other' }
}

/** Commit subjects are written lowercase; a page anyone might read shouldn't be.
 * A leading scope ("db: ", "pwa: ") is left alone and the sentence after it
 * capitalised instead. */
export function sentenceCase(text: string): string {
  const scope = text.match(/^([a-z0-9]+:\s*)/)
  const start = scope ? scope[1].length : 0
  return text.slice(0, start) + text.charAt(start).toUpperCase() + text.slice(start + 1)
}

function versionStep(newer: string, older: string): 'major' | 'minor' | 'patch' {
  const [aMaj, aMin] = newer.split('.').map(Number)
  const [bMaj, bMin] = older.split('.').map(Number)
  if (aMaj !== bMaj) return 'major'
  if (aMin !== bMin) return 'minor'
  return 'patch'
}

export function parseChangelog(source: string): Release[] {
  const releases: Release[] = []
  let release: Release | null = null
  let section: string | null = null
  /** The entry being read. A bullet starts one; the lines under it continue it —
   * semantic-release hard-wraps a long BREAKING CHANGES note across several
   * unindented lines and separates its paragraphs with blank ones, so a bullet
   * is not reliably one line. */
  let entry: { kind: ChangeKind; lines: string[] } | null = null

  function flush() {
    const current = entry
    entry = null
    if (!current || !release) return
    const paragraphs = current.lines
      .join('\n')
      .split(/\n{2,}/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
    if (paragraphs.length === 0) return
    paragraphs[0] = sentenceCase(paragraphs[0])
    release.changes.push({ kind: current.kind, label: labelFor(current.kind), paragraphs })
  }

  for (const line of source.split(/\r?\n/)) {
    const versionMatch = line.match(VERSION_HEADING)
    if (versionMatch) {
      flush()
      section = null
      release = {
        version: versionMatch[1],
        date: line.match(DATE_AT_END)?.[1] ?? null,
        step: null,
        changes: [],
      }
      releases.push(release)
      continue
    }

    if (!release) continue

    const sectionMatch = line.match(SECTION_HEADING)
    if (sectionMatch) {
      flush()
      section = sectionMatch[1]
      continue
    }

    const bulletMatch = line.match(BULLET)
    if (bulletMatch) {
      flush()
      const { text, kind: prefixKind } = cleanBullet(bulletMatch[1])
      if (!text) continue
      // A bullet with no section of its own is the breaking commit itself, which
      // semantic-release lists bare above the BREAKING CHANGES note — so trust
      // its own prefix there, and the section heading everywhere else.
      const kind = section ? kindFromSection(section) : (prefixKind ?? 'other')
      entry = { kind, lines: [text] }
      continue
    }

    if (!line.trim()) {
      // Paragraph break inside the entry being read. Trailing blanks are dropped
      // by the filter in flush(), so this can't invent empty paragraphs.
      if (entry) entry.lines.push('')
      continue
    }
    if (entry) entry.lines.push(line.replace(TRAILING_COMMIT_LINK, ''))
    else if (section) entry = { kind: kindFromSection(section), lines: [line] }
  }
  flush()

  return releases
}

/**
 * 1.0.0 and 1.1.0, which predate the generated changelog — semantic-release only
 * started writing CHANGELOG.md with the 1.1.1 run, so the file begins there.
 * Reconstructed from the git log between the initial commit (c4dd7cc) and the
 * v1.1.0 tag (9255daa), and fixed forever: history doesn't change.
 */
export const EARLY_RELEASES: Release[] = [
  {
    version: '1.1.0',
    date: '2026-07-25',
    step: 'minor',
    changes: [
      { kind: 'feature', label: 'Feature', paragraphs: ['Collapse-all, search, and remembering how you left the screen'] },
      { kind: 'feature', label: 'Feature', paragraphs: ['Email a summary of the trip when you finish shopping'] },
      { kind: 'feature', label: 'Feature', paragraphs: ['Sign in with a one-time code when the magic link will not do'] },
      { kind: 'feature', label: 'Feature', paragraphs: ['Collapsible category and store headings, and an "In cart" list scoped to the current trip'] },
      { kind: 'feature', label: 'Feature', paragraphs: ['Set a quantity when adding or editing an item, shown as "Qty: #" above 1'] },
      { kind: 'feature', label: 'Feature', paragraphs: ['List screen settings gear, solid sort headings and a store filter'] },
      { kind: 'feature', label: 'Feature', paragraphs: ['Revoke a group invite that has not been accepted yet'] },
      { kind: 'fix', label: 'Fix', paragraphs: ['Invite page no longer hangs forever on an invite that was already accepted'] },
      { kind: 'fix', label: 'Fix', paragraphs: ['Refreshing or opening a link to any inner page no longer 404s'] },
      { kind: 'fix', label: 'Fix', paragraphs: ['Sign-in links and group invite links respect the address the app is served from'] },
      { kind: 'fix', label: 'Fix', paragraphs: ['Logo images load on the deployed site'] },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-07-20',
    step: null,
    changes: [
      {
        kind: 'feature',
        label: 'Feature',
        paragraphs: [
          'First release: shared shopping lists for a group, with stores and categories, ' +
            'a shopping mode that times the trip, group invites, and passwordless sign-in.',
        ],
      },
    ],
  },
]

/** Every release, newest first, with the size of each version jump worked out. */
export function buildReleaseHistory(changelogSource: string, early: Release[] = EARLY_RELEASES): Release[] {
  const all = [...parseChangelog(changelogSource), ...early]
  return all.map((release, i) => {
    const older = all[i + 1]
    return older ? { ...release, step: versionStep(release.version, older.version) } : release
  })
}
