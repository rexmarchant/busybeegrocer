/** Single funnel for "something broke and nobody would otherwise know".
 *
 * Right now this only logs to the console. When a Sentry DSN is wired up, this
 * is the one function that needs to change -- the error boundary and both
 * global handlers already route through it. */

export interface ErrorContext {
  /** Where it came from: 'render', 'unhandledrejection', or 'window.onerror'. */
  source: string
  componentStack?: string
}

export function buildLabel() {
  return `v${__APP_VERSION__} (build ${__BUILD_NUMBER__})`
}

export function reportError(error: unknown, context: ErrorContext) {
  console.error(`[BusyBeeGrocer ${buildLabel()}] ${context.source}:`, error, context.componentStack ?? '')
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
