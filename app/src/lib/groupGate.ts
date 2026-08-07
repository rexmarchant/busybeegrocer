/** Decides what to show while we work out whether someone has any groups.
 *
 * Pulled out as a pure function because getting it wrong is invisible until
 * someone is standing in a shop: an earlier version sent people to "Create your
 * group" on an offline reload, because for one render it could not tell
 * "you have no groups" apart from "we haven't looked yet".
 *
 * The ordering below is the whole point -- every "we don't know" case must be
 * exhausted before any decision is made. */

export type GroupGate =
  | 'loading' // still finding out -- decide nothing
  | 'offline' // we asked, we couldn't reach the server, and we have nothing cached
  | 'setup' // confirmed: this person genuinely has no groups
  | 'ready' // we have groups to show, cached or fresh

export function groupGate(state: {
  /** Auth is still restoring, so `user` being absent means nothing yet. */
  authLoading: boolean
  /** A group read is in flight. */
  groupsLoading: boolean
  groupCount: number
  /** The last group read failed. */
  loadFailed: boolean
}): GroupGate {
  // Never decide while either question is still open. This is the case that
  // caused the bug: auth was mid-restore, groups had been cleared to [], and
  // loading had already been set false.
  if (state.authLoading || state.groupsLoading) return 'loading'

  // Cached groups are worth showing even if the refresh failed -- that is the
  // entire point of caching them.
  if (state.groupCount > 0) return 'ready'

  // No groups AND we couldn't ask. "Create your group" would be both wrong and
  // useless here, since creating one also needs the network.
  if (state.loadFailed) return 'offline'

  return 'setup'
}
