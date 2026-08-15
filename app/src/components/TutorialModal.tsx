import { useEffect } from 'react'
import { ArrowLeft } from './Icons'

// Served straight out of app/public/video/ — BASE_URL covers the /busybeegrocer/
// subpath in the Pages build. The source recording lives in assets/video/ and is
// far too large to ship as-is; this is the web-encoded copy.
const TUTORIAL_VIDEO_SRC = `${import.meta.env.BASE_URL}video/tutorial.mp4`

/** Full-screen tutorial player. Sits above the settings modal (z-40 vs z-30) so
 * backing out of it lands you right back where you opened it from. */
export default function TutorialModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black">
      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
        <button onClick={onClose} className="flex items-center gap-1.5 text-white" aria-label="Back">
          <ArrowLeft />
          <span className="text-sm font-medium">Back</span>
        </button>
        <p className="text-sm text-white/70">Tutorial</p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
        {/* autoPlay rides the tap that opened this, so it counts as a user gesture;
            if a browser blocks it anyway the controls are right there. */}
        <video
          src={TUTORIAL_VIDEO_SRC}
          controls
          autoPlay
          playsInline
          className="max-h-full max-w-full rounded-xl"
        >
          <p className="p-6 text-center text-white">
            Your browser can't play this video.{' '}
            <a href={TUTORIAL_VIDEO_SRC} className="underline">
              Download it instead
            </a>
            .
          </p>
        </video>
      </div>
    </div>
  )
}
