/** Arrows as SVG rather than text glyphs.
 *
 * They used to be characters — `←` at text-2xl, `▾` at text-base, `›` at
 * whatever the row inherited. Two problems with that. They were small and
 * hairline-thin, which is the whole reason these got flagged; and a text glyph
 * cannot be made heavier without also making it *larger*, since font-size is
 * the only dial you have. A stroked SVG separates the two: size comes from the
 * className, weight from strokeWidth, so a 28px arrow can be genuinely bold
 * without shoving the row it sits in any taller.
 *
 * Both take their color from `currentColor`, so they inherit whatever the
 * surrounding text is doing and need no color prop. */

const STROKE = 2.75

/** Back navigation. Sized generously — this is a real tap target, not decoration. */
export function ArrowLeft({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  )
}

export type ChevronDirection = 'up' | 'down' | 'left' | 'right'

const ROTATION: Record<ChevronDirection, string> = {
  down: '',
  up: 'rotate-180',
  left: 'rotate-90',
  right: '-rotate-90',
}

/** Disclosure and drill-in marker: collapse headers, menu triggers, list rows. */
export function Chevron({
  direction = 'down',
  className = 'h-6 w-6',
}: {
  direction?: ChevronDirection
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${className} ${ROTATION[direction]}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}
