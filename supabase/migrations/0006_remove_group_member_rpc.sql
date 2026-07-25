-- Removing someone else's group_members row needs a privileged path — RLS only
-- allows a user to delete their own row (0001_init.sql's "self can leave"
-- policy). Same convention as create_group: a security-definer RPC that checks
-- the caller is the group's owner (groups.created_by, the only ownership
-- concept in this schema) rather than adding a broader DELETE policy.
--
-- No change needed to transfer_owned_lists_on_departure — it fires on any
-- group_members delete regardless of who initiated it, so lists owned by the
-- removed member are reassigned automatically, same as a voluntary departure.
create function remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from groups where id = p_group_id and created_by = auth.uid()
  ) then
    raise exception 'Only the group owner can remove members';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Use "Leave this group" to remove yourself';
  end if;

  delete from group_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;
