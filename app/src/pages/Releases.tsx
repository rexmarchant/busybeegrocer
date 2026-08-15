import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
// The generated changelog is the single source of truth, and CI rewrites it
// before the build runs — so every release appears here on the day it ships
// without anyone editing this page. See lib/releaseNotes.ts.
import changelogSource from '../../CHANGELOG.md?raw'
import { buildReleaseHistory, type ChangeKind } from '../lib/releaseNotes'
import { ArrowLeft } from '../components/Icons'

const KIND_STYLES: Record<ChangeKind, string> = {
  feature: 'bg-primary/10 text-primary',
  fix: 'bg-border/60 text-text-secondary',
  breaking: 'bg-status-critical/10 text-status-critical',
  other: 'bg-border/60 text-text-muted',
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  // Split rather than `new Date(iso)`: a bare yyyy-mm-dd is parsed as UTC, which
  // shows the previous day for anyone west of Greenwich.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Deliberately reachable without signing in: it's the answer to "what changed?",
 * and that should be linkable to anyone, not just people with an account. */
export default function Releases() {
  const navigate = useNavigate()
  const releases = useMemo(() => buildReleaseHistory(changelogSource), [])
  const changeCount = releases.reduce((n, r) => n + r.changes.length, 0)

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-page">
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <button
          // Unlike the rest of the app, people arrive here from a link someone
          // sent them, with no history to go back to. Send them into the app
          // rather than leave a button that does nothing.
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          className="inline-flex items-center gap-1 text-text-secondary"
        >
          <ArrowLeft /> Back
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-16">
        <h1 className="mb-2 text-2xl font-semibold text-text-primary">Release History</h1>
        <p className="mb-6 text-sm leading-relaxed text-text-secondary">
          Every change to Busy Bee Grocer, newest first — {changeCount} of them across{' '}
          {releases.length} releases since {formatDate(releases.at(-1)?.date ?? null)}. The version
          you're running is shown at the bottom of Settings.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-3 font-medium">Version</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 font-medium">What changed</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((release) =>
                release.changes.map((change, i) => (
                  <tr
                    key={`${release.version}-${i}`}
                    className={i === 0 ? 'border-t-2 border-border' : 'border-t border-border/50'}
                  >
                    {i === 0 && (
                      <td
                        rowSpan={release.changes.length}
                        className="w-24 py-2.5 pr-3 align-top"
                      >
                        <span className="block font-semibold tabular-nums text-text-primary">
                          {release.version}
                        </span>
                        <span className="block text-xs text-text-muted">
                          {formatDate(release.date)}
                        </span>
                        {release.step === 'major' && (
                          <span className="mt-1 block text-xs font-medium text-status-critical">
                            Major update
                          </span>
                        )}
                        {release.version === __APP_VERSION__ && (
                          <span className="mt-1 block text-xs text-text-secondary">
                            You're on this
                          </span>
                        )}
                      </td>
                    )}
                    <td className="w-20 py-2.5 pr-3 align-top">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${KIND_STYLES[change.kind]}`}
                      >
                        {change.label}
                      </span>
                    </td>
                    <td className="py-2.5 align-top text-text-secondary">
                      {change.paragraphs.map((p, j) => (
                        <p key={j} className={j > 0 ? 'mt-2' : undefined}>
                          {p}
                        </p>
                      ))}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-text-muted">
          This page is generated from the project's changelog when the app is built, so it is
          always current. "Breaking" means something everyone had to act on.
        </p>
      </main>
    </div>
  )
}
