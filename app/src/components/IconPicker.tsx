import { LIST_ICONS } from '../lib/constants'
import type { ListIcon } from '../types/database'

export default function IconPicker({
  value,
  onChange,
}: {
  value: ListIcon
  onChange: (icon: ListIcon) => void
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {LIST_ICONS.map((icon) => (
        <button
          key={icon.key}
          type="button"
          aria-label={icon.label}
          onClick={() => onChange(icon.key)}
          className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 text-2xl transition ${
            value === icon.key ? 'border-primary bg-primary/10' : 'border-border bg-surface'
          }`}
        >
          {icon.emoji}
        </button>
      ))}
    </div>
  )
}
