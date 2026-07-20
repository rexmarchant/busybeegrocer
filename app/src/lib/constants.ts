import type { ListColor, ListIcon } from '../types/database'

// Fixed order — matches the validated categorical palette. Never reorder or
// cycle; the order itself is the colorblind-safety mechanism.
export const LIST_COLORS: { key: ListColor; label: string; hex: string }[] = [
  { key: 'blue', label: 'Blue', hex: '#2a78d6' },
  { key: 'green', label: 'Green', hex: '#008300' },
  { key: 'magenta', label: 'Magenta', hex: '#e87ba4' },
  { key: 'yellow', label: 'Yellow', hex: '#eda100' },
  { key: 'aqua', label: 'Aqua', hex: '#1baf7a' },
  { key: 'orange', label: 'Orange', hex: '#eb6834' },
  { key: 'violet', label: 'Violet', hex: '#4a3aa7' },
  { key: 'red', label: 'Red', hex: '#e34948' },
]

export function listColorHex(color: ListColor): string {
  return LIST_COLORS.find((c) => c.key === color)?.hex ?? LIST_COLORS[0].hex
}

export const LIST_ICONS: { key: ListIcon; label: string; emoji: string }[] = [
  { key: 'cart', label: 'Cart', emoji: '🛒' },
  { key: 'grocery', label: 'Grocery', emoji: '🛍️' },
  { key: 'home', label: 'Home', emoji: '🏠' },
  { key: 'party', label: 'Party', emoji: '🎉' },
  { key: 'travel', label: 'Travel', emoji: '✈️' },
  { key: 'pharmacy', label: 'Pharmacy/Health', emoji: '💊' },
  { key: 'hardware', label: 'Hardware', emoji: '🔧' },
  { key: 'pets', label: 'Pets', emoji: '🐾' },
  { key: 'baby', label: 'Baby/Kids', emoji: '👶' },
  { key: 'holiday', label: 'Holiday', emoji: '🎄' },
  { key: 'misc', label: 'Misc/Other', emoji: '📦' },
  { key: 'produce', label: 'Produce', emoji: '🍎' },
  { key: 'baking', label: 'Baking', emoji: '🎂' },
]

export function listIconEmoji(icon: ListIcon): string {
  return LIST_ICONS.find((i) => i.key === icon)?.emoji ?? LIST_ICONS[0].emoji
}
