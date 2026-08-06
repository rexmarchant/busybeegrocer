import * as Sentry from '@sentry/react'

/** Single funnel for "something broke and nobody would otherwise know".
 *
 * Everything routes through here: render crashes caught by ErrorBoundary,
 * unhandled promise rejections, and uncaught window errors. */

export interface ErrorContext {
  /** Where it came from: 'render', 'unhandledrejection', or 'window.onerror'. */
  source: string
  componentStack?: string
}

const DSN = import.meta.env.VITE_SENTRY_DSN

export function buildLabel() {
  return `v${__APP_VERSION__} (build ${__BUILD_NUMBER__})`
}

/** Call once, before anything renders. Without a DSN -- which is the normal
 * state locally -- this does nothing and reporting stays console-only, so dev
 * noise never reaches the real project or burns its quota. */
export function initErrorReporting() {
  if (!DSN) return

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // Ties an issue to the exact deploy that produced it. BUILD_NUMBER comes
    // from the commit count in CI, so it increments on every deploy.
    release: `busybeegrocer@${__APP_VERSION__}+${__BUILD_NUMBER__}`,

    // Off deliberately, and worth keeping off: this app's error context would
    // otherwise carry other people's grocery lists and email addresses to a
    // third party. Session Replay and tracing are opt-in in v10 -- not adding
    // those integrations keeps them out of the bundle as well as switched off.
    sendDefaultPii: false,
    tracesSampleRate: 0,
  })
}

export function reportError(error: unknown, context: ErrorContext) {
  console.error(`[BusyBeeGrocer ${buildLabel()}] ${context.source}:`, error, context.componentStack ?? '')

  if (!DSN) return
  Sentry.captureException(error, {
    tags: { source: context.source },
    extra: context.componentStack ? { componentStack: context.componentStack } : undefined,
  })
}

/** Async failures never reach a React error boundary. An awaited call that
 * rejects inside an event handler -- which is most of what this app does --
 * simply vanishes. These two listeners are the only way to see those at all,
 * and they matter more here than the boundary itself. */
export function installGlobalErrorHandlers() {
  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, { source: 'unhandledrejection' })
  })
  window.addEventListener('error', (event) => {
    reportError(event.error ?? event.message, { source: 'window.onerror' })
  })
}
