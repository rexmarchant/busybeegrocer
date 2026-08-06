/** Catches mistyped email domains at sign-in.
 *
 * This is not hypothetical: the production database has a `homail.com` account
 * that was never confirmed and never signed in. Someone typed one character
 * wrong, got a silently-created dead user, and presumably decided the app was
 * broken. With `shouldCreateUser: true` and strangers signing up, that scales
 * badly -- and it costs a Resend send every time. */

const COMMON_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'comcast.net',
  'verizon.net',
  'att.net',
  'sbcglobal.net',
  'bellsouth.net',
  'cox.net',
  'charter.net',
  'earthlink.net',
  'mail.com',
  'gmx.com',
  'zoho.com',
]

/** Damerau-Levenshtein (optimal string alignment). Plain Levenshtein scores a
 * transposition as 2, which would miss `gmial.com` -- one of the most common
 * typos there is. */
function editDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m

  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) d[i][0] = i
  for (let j = 0; j <= n; j++) d[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[m][n]
}

/** Returns a corrected address, or null if nothing looks wrong.
 *
 * Only ever a suggestion -- it never blocks submission, because the cost of
 * being wrong about someone's real address is much higher than the cost of a
 * missed typo. */
export function suggestEmailCorrection(email: string): string | null {
  const trimmed = email.trim()
  const at = trimmed.lastIndexOf('@')
  if (at < 1 || at === trimmed.length - 1) return null

  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1).toLowerCase()

  if (COMMON_DOMAINS.includes(domain)) return null
  // Compound TLDs (hotmail.co.uk, yahoo.com.au) are legitimate and score close
  // to their .com cousins, so leave anything with a subdomain alone.
  if (domain.split('.').length !== 2) return null

  for (const candidate of COMMON_DOMAINS) {
    // Distance 1 only. Two edits away is usually a genuinely different provider
    // -- yahoo.ca, gmx.de -- and a confidently wrong suggestion is worse than
    // saying nothing.
    if (editDistance(domain, candidate) === 1) return `${local}@${candidate}`
  }
  return null
}
