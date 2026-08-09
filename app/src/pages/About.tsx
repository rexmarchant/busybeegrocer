import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QrModal from '../components/QrModal'

export default function About() {
  const navigate = useNavigate()
  const [showQr, setShowQr] = useState(false)

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-page">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-text-secondary"
        >
          <span className="text-2xl leading-none">←</span> Back
        </button>

        {/* Generated on device rather than baked into the poster, so it always
            points at wherever the app currently lives -- and so it still works
            standing in a shop with no signal. */}
        <button
          onClick={() => setShowQr(true)}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
        >
          Share QR
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 items-start justify-center p-4">
        {/* 1440px WebP (216 KB), down from a 2 MB JPEG that was fetched from the
            header logo on every screen. Displays at ~640 CSS px, so 1440 still
            covers a 2x screen. The print master lives in assets/promo-master.jpg,
            outside the deployed bundle. */}
        <img
          src={`${import.meta.env.BASE_URL}promo.webp`}
          alt="Busy Bee Grocer — the ultimate shopping list and shopping helper"
          width={1440}
          height={1922}
          className="h-auto w-full rounded-2xl"
        />
      </main>

      {showQr && <QrModal onClose={() => setShowQr(false)} />}
    </div>
  )
}
