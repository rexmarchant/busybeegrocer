import { supabase } from './supabase'

/** Finds (or creates) a catalog item by name within a group, then adds it to
 * the given list — un-removing it if it was previously taken off the list. */
export async function addItemToList(params: {
  groupId: string
  listId: string
  itemName: string
  userId: string
  quantity?: number
  departmentId?: string | null
  storeId?: string | null
  note?: string | null
}) {
  const name = params.itemName.trim()
  if (!name) throw new Error('Item name required')

  let catalogItemId: string

  const { data: existing } = await supabase
    .from('catalog_items')
    .select('id')
    .eq('group_id', params.groupId)
    .ilike('name', name)
    .maybeSingle()

  if (existing) {
    catalogItemId = existing.id
  } else {
    const { data: created, error: createError } = await supabase
      .from('catalog_items')
      .insert({
        group_id: params.groupId,
        name,
        department_id: params.departmentId ?? null,
        default_store_id: params.storeId ?? null,
        created_by: params.userId,
      })
      .select('id')
      .single()
    if (createError) throw createError
    catalogItemId = created.id
  }

  const { error: upsertError } = await supabase
    .from('list_items')
    .upsert(
      {
        list_id: params.listId,
        catalog_item_id: catalogItemId,
        quantity: params.quantity ?? 1,
        preferred_store_id: params.storeId ?? null,
        note: params.note ?? null,
        removed_at: null,
        is_checked: false,
        added_by: params.userId,
        last_modified_by: params.userId,
      },
      { onConflict: 'list_id,catalog_item_id' },
    )
  if (upsertError) throw upsertError
}

/** Soft-removes an item from a list — its lifetime counts survive for next time. */
export async function removeItemFromList(listItemId: string) {
  const { error } = await supabase
    .from('list_items')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', listItemId)
  if (error) throw error
}
