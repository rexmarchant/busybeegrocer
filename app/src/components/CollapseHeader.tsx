import type { Block } from '../lib/itemGrouping'

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
  return (
    <button
      type="button"
      onClick={() => onToggle(block.sectionKey)}
      className={
        block.level === 1
          ? 'mt-4 flex w-full items-center justify-between rounded-lg bg-border px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-text-primary first:mt-0'
          : 'mt-1.5 ml-3 flex w-[calc(100%-0.75rem)] items-center justify-between rounded-md bg-border/60 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-text-secondary'
      }
    >
      <span>{block.label}</span>
      <span className="text-base text-text-muted">{collapsed ? '▸' : '▾'}</span>
    </button>
  )
}
