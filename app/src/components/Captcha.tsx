import { Turnstile } from '@marsidev/react-turnstile'

/** Cloudflare Turnstile site key.
 *
 * Public by design: it identifies the widget and is locked to the hostnames
 * registered in Cloudflare, so it is useless anywhere else.
 *
 * Hardcoded rather than read from an env var on purpose. Once CAPTCHA
 * protection is switched on, Supabase rejects every auth request that arrives
 * without a token -- so a missing env var in CI would not degrade gracefully,
 * it would lock everyone out of the app with no obvious cause. One fewer way
 * for login to break. */
export const TURNSTILE_SITE_KEY = '0x4AAAAAAEIQGxv4mPlkPOIK'

/** Turnstile tokens are single-use and time-limited, so any failed attempt
 * needs a fresh widget. Callers reset by bumping a nonce passed as `key`,
 * which remounts this component -- simpler and harder to get wrong than
 * threading an imperative handle around. */
export default function Captcha({
  onToken,
  onError,
}: {
  onToken: (token: string | null) => void
  onError?: (message: string) => void
}) {
  return (
    <div className="flex justify-center">
      <Turnstile
        siteKey={TURNSTILE_SITE_KEY}
        onSuccess={onToken}
        onExpire={() => onToken(null)}
        onError={() => {
          onToken(null)
          onError?.("Couldn't verify you're human. Check your connection and try again.")
        }}
      />
    </div>
  )
}
