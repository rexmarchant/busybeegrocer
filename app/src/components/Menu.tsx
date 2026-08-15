import { useEffect, useRef, useState, type ReactNode } from 'react'

/** A button that opens a small panel beneath it.
 *
 * Deliberately not a native <select>: the panel holds checkboxes, dividers and
 * a nested store picker, none of which a <select> can carry. What it does copy
 * from one is the behaviour people expect — Escape closes it, a press anywhere
 * outside closes it, and picking something closes it unless the panel says
 * otherwise (the filter menu stays open, because filters are usually set in
 * twos and threes).
 *
 * The backdrop is a real element rather than a document listener so a press
 * that closes the menu doesn't also land on whatever was underneath. */
export default function Menu({
  label,
  ariaLabel,
  active = false,
  align = 'left',
  className = '',
  panelClassName = '',
  children,
}: {
  label: ReactNode
  ariaLabel?: string
  /** Draws the trigger as "doing something right now". */
  active?: boolean
  align?: 'left' | 'right'
  /** Sizing for the wrapper — it is a flex child at every call site. */
  className?: string
  panelClassName?: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex w-full items-center justify-center gap-1 rounded-xl border px-3 py-2.5 text-xs leading-tight ${
          active ? 'border-primary bg-primary text-white' : 'border-border text-text-secondary'
        }`}
      >
        {label}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className={`absolute z-30 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-border bg-surface shadow-lg ${
              align === 'right' ? 'right-0' : 'left-0'
            } ${panelClassName}`}
          >
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  )
}

/** One row in a menu. `selected` shows a tick and marks it for assistive tech. */
export function MenuItem({
  onClick,
  selected,
  danger,
  children,
}: {
  onClick: () => void
  selected?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      aria-checked={selected}
      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm ${
        danger ? 'text-status-critical' : 'text-text-primary'
      } ${selected ? 'bg-page' : ''}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {selected && <span className="shrink-0 text-primary">✓</span>}
    </button>
  )
}
