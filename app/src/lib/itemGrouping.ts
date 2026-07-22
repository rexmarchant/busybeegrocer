import type { Department, ListItem, Store } from '../types/database'

export type SortMode = 'alphabetical' | 'category' | 'store' | 'store_category' | 'favorites'

export const SORT_LABELS: Record<SortMode, string> = {
  alphabetical: 'Alphabetical',
  category: 'Category',
  store: 'Store',
  store_category: 'Store + Category',
  favorites: 'Favorites',
}

export const NO_STORE_LABEL = 'No Preferred Store'

export interface ViewItem extends ListItem {
  name: string
  note: string | null
  departmentName: string
  departmentSort: number
  storeName: string
  resolvedStoreId: string | null
}

export type Block<T extends ViewItem = ViewItem> =
  | { type: 'header'; level: 1 | 2; label: string; sectionKey: string; parentKey?: string }
  | { type: 'item'; item: T; sectionKey: string; parentKey?: string }

/** Given the currently-collapsed section keys, is this block hidden? A block is hidden
 * if its own section is collapsed, or (for level-2 headers/items) its parent section is. */
export function isBlockCollapsed(block: Block, collapsedKeys: Set<string>): boolean {
  if (block.parentKey && collapsedKeys.has(block.parentKey)) return true
  if (block.type === 'item' && collapsedKeys.has(block.sectionKey)) return true
  return false
}

export function sortByName<T extends ViewItem>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

export function buildCategoryBlocks<T extends ViewItem>(items: T[]): Block<T>[] {
  const groups = new Map<string, { sortOrder: number; items: T[] }>()
  for (const item of items) {
    const key = item.departmentName
    if (!groups.has(key)) groups.set(key, { sortOrder: item.departmentSort, items: [] })
    groups.get(key)!.items.push(item)
  }
  const ordered = [...groups.entries()].sort((a, b) => a[1].sortOrder - b[1].sortOrder)
  const blocks: Block<T>[] = []
  for (const [label, group] of ordered) {
    const sectionKey = `cat:${label}`
    blocks.push({ type: 'header', level: 1, label, sectionKey })
    for (const item of sortByName(group.items)) blocks.push({ type: 'item', item, sectionKey })
  }
  return blocks
}

export function buildStoreBlocks<T extends ViewItem>(items: T[]): Block<T>[] {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = item.storeName || NO_STORE_LABEL
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    if (a[0] === NO_STORE_LABEL) return 1
    if (b[0] === NO_STORE_LABEL) return -1
    return a[0].localeCompare(b[0])
  })
  const blocks: Block<T>[] = []
  for (const [label, groupItems] of ordered) {
    const sectionKey = `store:${label}`
    blocks.push({ type: 'header', level: 1, label, sectionKey })
    for (const item of sortByName(groupItems)) blocks.push({ type: 'item', item, sectionKey })
  }
  return blocks
}

export function buildStoreCategoryBlocks<T extends ViewItem>(items: T[]): Block<T>[] {
  const storeGroups = new Map<string, T[]>()
  for (const item of items) {
    const key = item.storeName || NO_STORE_LABEL
    if (!storeGroups.has(key)) storeGroups.set(key, [])
    storeGroups.get(key)!.push(item)
  }
  const orderedStores = [...storeGroups.entries()].sort((a, b) => {
    if (a[0] === NO_STORE_LABEL) return 1
    if (b[0] === NO_STORE_LABEL) return -1
    return a[0].localeCompare(b[0])
  })
  const blocks: Block<T>[] = []
  for (const [storeLabel, storeItems] of orderedStores) {
    const storeKey = `store:${storeLabel}`
    blocks.push({ type: 'header', level: 1, label: storeLabel, sectionKey: storeKey })
    const catGroups = new Map<string, { sortOrder: number; items: T[] }>()
    for (const item of storeItems) {
      const key = item.departmentName
      if (!catGroups.has(key)) catGroups.set(key, { sortOrder: item.departmentSort, items: [] })
      catGroups.get(key)!.items.push(item)
    }
    const orderedCats = [...catGroups.entries()].sort((a, b) => a[1].sortOrder - b[1].sortOrder)
    for (const [catLabel, catGroup] of orderedCats) {
      const catKey = `${storeKey}::cat:${catLabel}`
      blocks.push({ type: 'header', level: 2, label: catLabel, sectionKey: catKey, parentKey: storeKey })
      for (const item of sortByName(catGroup.items))
        blocks.push({ type: 'item', item, sectionKey: catKey, parentKey: storeKey })
    }
  }
  return blocks
}

export function buildBlocks<T extends ViewItem>(items: T[], sortMode: SortMode): Block<T>[] {
  switch (sortMode) {
    case 'alphabetical':
      return sortByName(items).map((item) => ({ type: 'item', item, sectionKey: 'flat' }))
    case 'favorites':
      return [...items]
        .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || a.name.localeCompare(b.name))
        .map((item) => ({ type: 'item', item, sectionKey: 'flat' }))
    case 'category':
      return buildCategoryBlocks(items)
    case 'store':
      return buildStoreBlocks(items)
    case 'store_category':
      return buildStoreCategoryBlocks(items)
  }
}

export function toViewItems<Item extends ListItem>(
  items: Item[],
  catalogById: Record<string, { name: string; department_id: string | null; default_store_id: string | null }>,
  departmentById: Record<string, Department>,
  storeById: Record<string, Store>,
): (Item & ViewItem)[] {
  return items.map((item) => {
    const c = catalogById[item.catalog_item_id]
    const dept = c?.department_id ? departmentById[c.department_id] : undefined
    const storeId = item.preferred_store_id ?? c?.default_store_id ?? null
    const store = storeId ? storeById[storeId] : undefined
    return {
      ...item,
      name: c?.name ?? '(unknown item)',
      departmentName: dept?.name ?? 'Other',
      departmentSort: dept?.sort_order ?? 999,
      storeName: store?.name ?? '',
      resolvedStoreId: storeId,
    }
  })
}
