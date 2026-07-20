import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useGroup } from '../contexts/GroupContext'
import type { Department } from '../types/database'

export default function CategorySettings() {
  const { currentGroup } = useGroup()
  const [categories, setCategories] = useState<Department[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  useEffect(() => {
    if (!currentGroup) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGroup])

  async function load() {
    if (!currentGroup) return
    const { data } = await supabase
      .from('departments')
      .select('*')
      .eq('group_id', currentGroup.id)
      .order('sort_order')
    setCategories((data as Department[]) ?? [])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!currentGroup || !newCategoryName.trim()) return
    const nextSortOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.sort_order)) + 1 : 0
    await supabase
      .from('departments')
      .insert({ group_id: currentGroup.id, name: newCategoryName.trim(), sort_order: nextSortOrder })
    setNewCategoryName('')
    load()
  }

  async function handleRename(id: string) {
    if (!renameDraft.trim()) return
    await supabase.from('departments').update({ name: renameDraft.trim() }).eq('id', id)
    setRenamingId(null)
    load()
  }

  async function handleDelete(id: string) {
    await supabase.from('departments').delete().eq('id', id)
    load()
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-1 flex-col bg-page px-4 py-6">
      <Link to="/settings" className="mb-4 text-text-secondary">
        ← Settings
      </Link>
      <h1 className="mb-4 text-lg font-semibold text-text-primary">Categories</h1>
      <p className="mb-4 text-sm text-text-secondary">
        Categories group items by store department or aisle (e.g. Produce, Dairy) so lists can be
        organized to match how you shop.
      </p>

      <form onSubmit={handleAdd} className="mb-4 flex gap-2">
        <input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="Add a category…"
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-text-primary outline-none focus:border-primary"
        />
        <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 font-medium text-white">
          Add
        </button>
      </form>

      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {categories.map((category) => (
          <li key={category.id} className="flex items-center justify-between px-4 py-3">
            {renamingId === category.id ? (
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => handleRename(category.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename(category.id)}
                className="flex-1 rounded-lg border border-border px-2 py-1 text-text-primary"
              />
            ) : (
              <span className="text-text-primary">{category.name}</span>
            )}
            <div className="flex gap-3 text-sm">
              <button
                onClick={() => {
                  setRenamingId(category.id)
                  setRenameDraft(category.name)
                }}
                className="text-text-secondary underline"
              >
                Rename
              </button>
              <button onClick={() => handleDelete(category.id)} className="text-status-critical underline">
                Remove
              </button>
            </div>
          </li>
        ))}
        {categories.length === 0 && (
          <li className="px-4 py-6 text-center text-text-secondary">No categories yet.</li>
        )}
      </ul>
    </div>
  )
}
