import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

interface Options<T> {
  serialize?: (value: T) => unknown
  deserialize?: (value: unknown) => T
}

function readValue<T>(key: string, defaultValue: T, deserialize?: (v: unknown) => T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return defaultValue
    const parsed = JSON.parse(raw)
    return deserialize ? deserialize(parsed) : (parsed as T)
  } catch {
    return defaultValue
  }
}

/** Like useState, but backed by localStorage under `key`. Pass `serialize`/`deserialize`
 * for values that aren't JSON-safe as-is (e.g. Set). `key` may be null (e.g. before a
 * route param like listId is available) — the hook then behaves as plain in-memory
 * state and doesn't touch storage until a real key shows up. */
export function usePersistedState<T>(
  key: string | null,
  defaultValue: T,
  options?: Options<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const { serialize, deserialize } = options ?? {}
  const keyRef = useRef(key)
  const skipWriteRef = useRef(false)
  const [state, setState] = useState<T>(() => (key ? readValue(key, defaultValue, deserialize) : defaultValue))

  // Key changed (e.g. navigated to a different list while this page stayed mounted) —
  // reload from the new key's storage instead of persisting the old key's in-memory value.
  useEffect(() => {
    if (key === keyRef.current) return
    keyRef.current = key
    skipWriteRef.current = true
    setState(key ? readValue(key, defaultValue, deserialize) : defaultValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (skipWriteRef.current) {
      skipWriteRef.current = false
      return
    }
    if (!key) return
    try {
      localStorage.setItem(key, JSON.stringify(serialize ? serialize(state) : state))
    } catch {
      // storage full / unavailable (e.g. Safari private mode) — fail silently
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, state])

  return [state, setState]
}
