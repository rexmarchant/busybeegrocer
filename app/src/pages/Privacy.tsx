import { useNavigate } from 'react-router-dom'
// The repo-root file is the single source of truth. Rendering it here rather
// than keeping a second copy means the policy can never disagree with itself.
import privacySource from '../../../PRIVACY.md?raw'
import { parseMarkdown, type MdSegment } from '../lib/markdown'

// Parsed once at module load: the document never changes at runtime.
const blocks = parseMarkdown(privacySource)

function Segments({ segments }: { segments: MdSegment[] }) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.bold ? (
          <strong key={i} className="font-semibold text-text-primary">
            {segment.text}
          </strong>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  )
}

/** Deliberately reachable without signing in -- you should be able to read what
 * the app collects before handing over your email address, not after. */
export default function Privacy() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-page">
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-text-secondary"
        >
          <span className="text-2xl leading-none">←</span> Back
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-16">
        {blocks.map((block, i) => {
          if (block.type === 'rule') {
            return <hr key={i} className="my-6 border-border" />
          }
          if (block.type === 'heading') {
            return block.level === 1 ? (
              <h1 key={i} className="mb-4 text-2xl font-semibold text-text-primary">
                <Segments segments={block.segments} />
              </h1>
            ) : (
              <h2 key={i} className="mt-8 mb-2 text-lg font-semibold text-text-primary">
                <Segments segments={block.segments} />
              </h2>
            )
          }
          return (
            <p key={i} className="mb-3 text-sm leading-relaxed text-text-secondary">
              <Segments segments={block.segments} />
            </p>
          )
        })}
      </main>
    </div>
  )
}
