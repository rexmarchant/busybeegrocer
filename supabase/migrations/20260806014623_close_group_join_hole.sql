-- ============================================================================
-- Close the open group-join policy.
-- ============================================================================
-- The dropped policy checked only that you were inserting *yourself* into
-- group_members -- never that you had any right to the group. So any
-- authenticated user could add themselves to any group given only its UUID.
--
-- That UUID is not a secret from anyone who has ever been a member: the app
-- stores it in localStorage as `busybeegrocer:currentGroupId`
-- (GroupContext.tsx). The practical consequence is that remove_group_member()
-- did not actually remove anyone -- a removed member could rejoin with a single
-- REST call, silently, at any time.
--
-- Verified exploitable against production before this change (probe ran inside
-- an aborted transaction: the simulated non-member joined and immediately saw
-- 2 lists, 436 items and 7 stores).
--
-- Dropping the policy leaves group_members with no INSERT policy at all, which
-- is correct: joining must go through create_group() or accept_invite(). Both
-- are SECURITY DEFINER, so their own inserts are unaffected by RLS here. No
-- client code inserts into this table -- the only write from the app is the
-- DELETE behind "Leave this group" in GroupSettings.tsx, which keeps its
-- "self can leave" policy.
drop policy "group_members: self can join" on group_members;

-- ============================================================================
-- Pin search_path on the SECURITY DEFINER functions that were missing it.
-- ============================================================================
-- These three run with the definer's privileges and resolve unqualified table
-- names at call time, so an attacker-controlled search_path could point them at
-- shadow tables. is_group_member() and list_is_visible() are especially
-- sensitive: every RLS policy in the schema is built on them. The other
-- SECURITY DEFINER functions in this schema already pin search_path; these were
-- the exceptions.
alter function is_group_member(uuid)    set search_path = public;
alter function list_is_visible(uuid)    set search_path = public;
alter function get_invite_preview(uuid) set search_path = public;
