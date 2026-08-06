/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __BUILD_DATE__: string
declare const __BUILD_NUMBER__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Absent in local dev on purpose -- no DSN means console-only reporting. */
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
