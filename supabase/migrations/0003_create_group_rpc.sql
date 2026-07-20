-- INSERT ... RETURNING re-checks the table's SELECT policy against the new
-- row, which requires group_members to already exist — a chicken-and-egg
-- that a same-statement AFTER trigger doesn't resolve in time. Do the whole
-- "create group + add creator as member" as one atomic function instead,
-- returning the row directly (not through a second RLS-gated read).
create function create_group(p_name text)
returns groups
language plpgsql security definer set search_path = public
as $$
declare
  new_group groups%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to create a group';
  end if;

  insert into groups (name, created_by) values (p_name, auth.uid())
  returning * into new_group;

  insert into group_members (group_id, user_id) values (new_group.id, auth.uid())
  on conflict (group_id, user_id) do nothing;

  return new_group;
end;
$$;
