import { Component, type ErrorInfo, type ReactNode } from 'react'
import { buildLabel, reportError } from '../lib/reportError'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Catches render-time crashes so a thrown error shows something recoverable
 * instead of a white screen nobody ever reports.
 *
 * Deliberately mounted outside the providers in main.tsx, so a crash inside
 * AuthProvider/GroupProvider is caught too. That means this fallback cannot use
 * any app context or the router -- it has to stand entirely on its own. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { source: 'render', componentStack: info.componentStack ?? undefined })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-page px-6 text-center">
        <img
          src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
          alt=""
          className="h-20 w-20 rounded-2xl opacity-60"
        />
        <h1 className="text-lg font-semibold text-text-primary">Something went wrong</h1>
        <p className="max-w-sm text-sm text-text-secondary">
          BusyBeeGrocer hit an error it couldn't recover from. Reloading usually fixes it — your
          lists are stored on the server, so nothing has been lost.
        </p>

        <button
          onClick={() => window.location.reload()}
          className="mt-2 rounded-xl bg-primary px-6 py-3 text-base font-medium text-white transition hover:bg-primary-hover"
        >
          Reload BusyBeeGrocer
        </button>

        {/* Collapsed by default: useless to most people, but it's the only thing
            that makes a bug report actionable when someone does send one. */}
        <details className="mt-4 w-full max-w-sm text-left">
          <summary className="cursor-pointer text-xs text-text-muted">Technical details</summary>
          <p className="mt-2 text-xs text-text-muted">{buildLabel()}</p>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-surface p-3 text-xs text-text-secondary">
            {error.message}
          </pre>
        </details>
      </div>
    )
  }
}
