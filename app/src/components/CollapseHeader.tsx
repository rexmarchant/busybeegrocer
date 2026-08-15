import type { Block } from '../lib/itemGrouping'
import { Chevron } from './Icons'

type HeaderBlock = Extract<Block, { type: 'header' }>

export default function CollapseHeader({
  block,
  collapsed,
  onToggle,
}: {
  block: HeaderBlock
  collapsed: boolean
  onToggle: (sectionKey: string) => void
}) {
  const isMajor = block.level === 1

  return (
    <button
      type="button"
      onClick={() => onToggle(block.sectionKey)}
      className={
        isMajor
          ? 'mt-4 flex w-full items-center justify-between gap-2 rounded-lg bg-section-major px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-text-primary first:mt-0'
          : 'mt-1.5 ml-3 flex w-[calc(100%-0.75rem)] items-center justify-between gap-2 rounded-md bg-section-minor px-2.5 py-1 text-sm font-semibold text-text-secondary'
      }
    >
      {/* Stores are shouted in caps; categories are not. Caps on both made the
          two levels read as the same thing, and a category name like "Meat &
          Seafood" is easier to scan in its natural case. `kind` rather than
          `level` decides, so sorting by category alone — which puts categories
          at level 1 — still renders them in sentence case. */}
      <span className={`min-w-0 truncate ${block.kind === 'store' ? 'uppercase' : ''}`}>
        {block.label}
      </span>
      {/* Sized to be unmistakable without forcing these short rows taller — a
          stroked icon can be bold at 24px where a text glyph would be thin. */}
      <Chevron
        direction={collapsed ? 'right' : 'down'}
        className="-my-1 h-6 w-6 shrink-0 text-text-secondary"
      />
    </button>
  )
}
