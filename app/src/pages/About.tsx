import { useNavigate } from 'react-router-dom'

export default function About() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-svh flex-1 flex-col bg-page">
      <header className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-text-secondary"
        >
          <span className="text-2xl leading-none">←</span> Back
        </button>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 items-start justify-center p-4">
        <img src={`${import.meta.env.BASE_URL}promo.jpg`} alt="BusyBeeGrocer" className="w-full rounded-2xl" />
      </main>
    </div>
  )
}
