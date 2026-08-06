import { useCallback, useEffect, useRef, useState } from 'react'

const DISMISS_MS = 4000

export interface ToastMessage {
  text: string
  /** Bumped on every show so repeating the same text still restarts the timer. */
  id: number
}

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const showToast = useCallback((text: string) => setToast({ text, id: Date.now() }), [])
  const clearToast = useCallback(() => setToast(null), [])
  return { toast, showToast, clearToast }
}

/** Transient failure banner.
 *
 * Sits at bottom-24 rather than bottom-4 so it clears shopping mode's sticky
 * footer — covering Pause/Finish with an error message would be worse than the
 * error. Tapping it dismisses early. */
export default function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastMessage | null
  onDismiss: () => void
}) {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  const toastId = toast?.id
  useEffect(() => {
    if (toastId === undefined) return
    const timer = window.setTimeout(() => onDismissRef.current(), DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [toastId])

  if (!toast) return null

  return (
    <div role="alert" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <button
        type="button"
        onClick={onDismiss}
        className="pointer-events-auto rounded-xl bg-status-critical px-4 py-3 text-sm font-medium text-white shadow-lg"
      >
        {toast.text}
      </button>
    </div>
  )
}
