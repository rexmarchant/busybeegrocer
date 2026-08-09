import { useEffect, useMemo } from 'react'
import { encode } from 'uqr'

/** Where the QR points.
 *
 * Derived at runtime instead of hardcoded, so it follows the app: BASE_URL is
 * '/busybeegrocer/' today and '/app/' once we move to busybeegrocer.com. The
 * printed poster's QR went stale precisely because it baked the URL in -- this
 * one cannot. */
export function appUrl() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}

function QrSvg({ text }: { text: string }) {
  const { size, path } = useMemo(() => {
    // 'Q' (25% recovery) encodes to the same 35 modules as 'M' at this URL
    // length, so the extra robustness is free -- and it is worth having when
    // someone is scanning off a phone screen under shop lighting.
    const { size, data } = encode(text, { ecc: 'Q' })
    let d = ''
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (data[y][x]) d += `M${x} ${y}h1v1h-1z`
      }
    }
    return { size, path: d }
  }, [text])

  // Scanners need a 4-module quiet zone; without it many refuse to read at all.
  const quiet = 4
  const extent = size + quiet * 2

  return (
    <svg
      viewBox={`${-quiet} ${-quiet} ${extent} ${extent}`}
      className="h-auto w-full max-w-[min(78vw,58vh)]"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code linking to ${text}`}
    >
      <rect x={-quiet} y={-quiet} width={extent} height={extent} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  )
}

/** Full-screen QR for showing someone else in the aisle.
 *
 * Deliberately white-on-black-text rather than following the app's theme: this
 * exists to be photographed by a stranger's phone, so contrast beats styling.
 * Everything is bundled -- uqr generates the code on device -- because the
 * whole point is that it works standing in a shop with no signal. */
export default function QrModal({ onClose }: { onClose: () => void }) {
  const url = appUrl()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white">
      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
        <button onClick={onClose} className="flex items-center gap-1.5 text-black" aria-label="Back">
          <span className="text-2xl leading-none">←</span>
          <span className="text-sm font-medium">Back</span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 pb-10">
        <p className="text-center text-lg font-semibold text-black">Scan to get Busy Bee Grocer</p>
        <QrSvg text={url} />
        {/* Also spelled out, so it still works if the camera won't cooperate. */}
        <p className="break-all text-center text-sm text-neutral-600">{url}</p>
      </div>
    </div>
  )
}
