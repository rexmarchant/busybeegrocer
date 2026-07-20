export type ListColor =
  | 'blue'
  | 'green'
  | 'magenta'
  | 'yellow'
  | 'aqua'
  | 'orange'
  | 'violet'
  | 'red'

export type ListIcon =
  | 'cart'
  | 'grocery'
  | 'home'
  | 'party'
  | 'travel'
  | 'pharmacy'
  | 'hardware'
  | 'pets'
  | 'baby'
  | 'holiday'
  | 'misc'
  | 'produce'
  | 'baking'

export interface Profile {
  id: string
  email: string
  display_name: string | null
  created_at: string
}

export interface Group {
  id: string
  name: string
  created_by: string
  created_at: string
}

export interface GroupMember {
  group_id: string
  user_id: string
  joined_at: string
}

export interface Invite {
  id: string
  group_id: string
  email: string
  invited_by: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  created_at: string
  expires_at: string
  accepted_at: string | null
}

export interface Store {
  id: string
  group_id: string
  name: string
  created_by: string
  created_at: string
}

export interface Department {
  id: string
  group_id: string
  name: string
  sort_order: number
  created_at: string
}

export interface CatalogItem {
  id: string
  group_id: string
  name: string
  department_id: string | null
  default_store_id: string | null
  created_by: string
  created_at: string
}

export interface ShoppingList {
  id: string
  group_id: string
  owner_id: string
  name: string
  icon: ListIcon
  color: ListColor
  is_private: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ListItem {
  id: string
  list_id: string
  catalog_item_id: string
  quantity: number
  note: string | null
  photo_url: string | null
  preferred_store_id: string | null
  is_checked: boolean
  is_favorite: boolean
  checked_count: number
  unchecked_count: number
  removed_at: string | null
  added_by: string
  added_at: string
  last_modified_by: string
  last_modified_at: string
}

export interface ShoppingSession {
  id: string
  list_id: string
  started_by: string
  started_at: string
  ended_at: string | null
  completed: boolean | null
  total_item_count: number
  checked_item_count: number
}

// Convenience joined shape used throughout the list-detail UI
export interface ListItemWithCatalog extends ListItem {
  catalog_item: CatalogItem
}
