import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useGroup } from '../contexts/GroupContext'
import type { Store } from '../types/database'

export default function StoreSettings() {
  const { user } = useAuth()
  const { currentGroup } = useGroup()
  const [stores, setStores] = useState<Store[]>([])
  const [newStoreName, setNewStoreName] = useState('')
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
      .from('stores')
      .select('*')
      .eq('group_id', currentGroup.id)
      .order('name')
    setStores((data as Store[]) ?? [])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!currentGroup || !user || !newStoreName.trim()) return
    await supabase
      .from('stores')
      .insert({ group_id: currentGroup.id, name: newStoreName.trim(), created_by: user.id })
    setNewStoreName('')
    load()
  }

  async function handleRename(id: string) {
    if (!renameDraft.trim()) return
    await supabase.from('stores').update({ name: renameDraft.trim() }).eq('id', id)
    setRenamingId(null)
    load()
  }

  async function handleDelete(id: string) {
    await supabase.from('stores').delete().eq('id', id)
    load()
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-1 flex-col bg-page px-4 py-6">
      <Link to="/settings" className="mb-4 text-text-secondary">
        ← Settings
      </Link>
      <h1 className="mb-4 text-lg font-semibold text-text-primary">Stores</h1>

      <form onSubmit={handleAdd} className="mb-4 flex gap-2">
        <input
          value={newStoreName}
          onChange={(e) => setNewStoreName(e.target.value)}
          placeholder="Add a store…"
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-text-primary outline-none focus:border-primary"
        />
        <button type="submit" className="rounded-xl bg-primary px-4 py-2.5 font-medium text-white">
          Add
        </button>
      </form>

      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {stores.map((store) => (
          <li key={store.id} className="flex items-center justify-between px-4 py-3">
            {renamingId === store.id ? (
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => handleRename(store.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename(store.id)}
                className="flex-1 rounded-lg border border-border px-2 py-1 text-text-primary"
              />
            ) : (
              <span className="text-text-primary">{store.name}</span>
            )}
            <div className="flex gap-3 text-sm">
              <button
                onClick={() => {
                  setRenamingId(store.id)
                  setRenameDraft(store.name)
                }}
                className="text-text-secondary underline"
              >
                Rename
              </button>
              <button onClick={() => handleDelete(store.id)} className="text-status-critical underline">
                Remove
              </button>
            </div>
          </li>
        ))}
        {stores.length === 0 && <li className="px-4 py-6 text-center text-text-secondary">No stores yet.</li>}
      </ul>
    </div>
  )
}
