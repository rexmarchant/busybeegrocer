-- Defense-in-depth: ensures the creator is always a member of any group
-- created via direct SQL too, not just through create_group() below.
create function add_creator_as_member()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into group_members (group_id, user_id) values (new.id, new.created_by)
  on conflict (group_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_group_created_add_member
  after insert on groups
  for each row execute procedure add_creator_as_member();
