import { LIST_COLORS } from '../lib/constants'
import type { ListColor } from '../types/database'

export default function ColorPicker({
  value,
  onChange,
}: {
  value: ListColor
  onChange: (color: ListColor) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {LIST_COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          aria-label={c.label}
          onClick={() => onChange(c.key)}
          className="flex h-10 w-10 items-center justify-center rounded-full ring-offset-2 transition"
          style={{
            backgroundColor: c.hex,
            boxShadow: value === c.key ? `0 0 0 2px white, 0 0 0 4px ${c.hex}` : 'none',
          }}
        >
          {value === c.key && <span className="text-sm text-white">✓</span>}
        </button>
      ))}
    </div>
  )
}
