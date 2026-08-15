/** How group members are named to each other.
 *
 * People are shown by the part of their address before the @. The full address
 * is more than anyone needs to tell a household apart, it is the longest string
 * on several screens — it was overflowing the item modal — and it is somebody's
 * contact details shown to everyone else in the group.
 *
 * The trim has to apply to display_name as well as email: sign-up seeds
 * display_name *with* the address, so every existing profile carries the full
 * address in both columns and trimming only the email fallback would have had
 * no visible effect at all.
 *
 * The catch is that trimming can make two different people look like one
 * person. rexmarchant@gmail.com and rexmarchant@yahoo.com are both
 * "rexmarchant", and a Shared with list that names the same person twice is
 * worse than one that shows two long addresses. So the short form is only used
 * when it is unambiguous *within the set being displayed* — see personLabel. */

/** The minimum a profile needs for naming. */
export interface NameableProfile {
  id: string
  email?: string | null
  display_name?: string | null
}

/** The part before the @. Anything that isn't an address is returned unchanged,
 * so a real display name like "Rex" stays "Rex". */
export function personName(value: string | null | undefined): string {
  if (!value) return ''
  const at = value.indexOf('@')
  return at > 0 ? value.slice(0, at) : value
}

/** What this profile would be called if nothing else were on screen. */
function shortName(profile: NameableProfile): string {
  return personName(profile.display_name || profile.email)
}

/** The name to show for `profile`, given everyone it appears alongside.
 *
 * Falls back to the full address — not a truncated one — when another profile
 * in `among` shortens to the same name, because the domain is the only thing
 * that tells them apart. Comparison is case-insensitive: addresses are, and two
 * rows differing only in capitalisation would read as a duplicate. */
export function personLabel(
  among: readonly NameableProfile[],
  profile: NameableProfile | null | undefined,
): string {
  if (!profile) return 'Someone'
  const short = shortName(profile)
  if (!short) return 'Someone'

  const collides = among.some(
    (other) => other.id !== profile.id && shortName(other).toLowerCase() === short.toLowerCase(),
  )
  if (!collides) return short

  // Prefer the email over display_name here: it is guaranteed to differ, where
  // two people could genuinely share a display name.
  return profile.email || profile.display_name || short
}
