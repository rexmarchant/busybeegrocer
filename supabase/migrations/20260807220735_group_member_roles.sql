-- ============================================================================
-- Make ownership a property of membership, not a column on groups.
-- ============================================================================
-- Until now the only ownership concept was groups.created_by: one person, set
-- once, with no way to hand it over. Everything hung off it -- the Owner badge,
-- and remove_group_member(), which refused unless created_by = auth.uid(). If
-- that person left, nobody could manage the group at all. Migration
-- 20260806020359 patched the worst of it by making the departure trigger rewrite
-- created_by, but that is a workaround for a missing concept rather than a
-- design.
--
-- A household does not have a single person in charge, so groups may have
-- several owners. created_by stays, but purely as attribution -- who made this
-- group -- and no longer governs anything.

alter table group_members
  add column role text not null default 'member'
  check (role in ('owner', 'member'));

-- Existing groups: whoever created it becomes an owner.
update group_members gm
set role = 'owner'
from groups g
where g.id = gm.group_id and g.created_by = gm.user_id;

-- Any group whose creator has since left would otherwise start life with no
-- owner at all. Promote the longest-standing remaining member instead.
with ownerless as (
  select g.id
  from groups g
  where not exists (
    select 1 from group_members m where m.group_id = g.id and m.role = 'owner'
  )
),
successor as (
  select distinct on (m.group_id) m.group_id, m.user_id
  from group_members m
  join ownerless o on o.id = m.group_id
  order by m.group_id, m.joined_at asc
)
update group_members gm
set role = 'owner'
from successor s
where gm.group_id = s.group_id and gm.user_id = s.user_id;

-- ============================================================================
-- Authorization now asks about roles.
-- ============================================================================
create function is_group_owner(target_group_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = target_group_id and user_id = auth.uid() and role = 'owner'
  );
$$;

/* Number of owners a group has, used by the guards below. */
create function group_owner_count(target_group_id uuid)
returns int
language sql security definer stable set search_path = public
as $$
  select count(*)::int from group_members
  where group_id = target_group_id and role = 'owner';
$$;

create or replace function remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_group_owner(p_group_id) then
    raise exception 'Only a group owner can remove members';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Use "Leave this group" to remove yourself';
  end if;

  -- Owners may remove other owners, but never the last one -- the caller can
  -- promote somebody else first if that is really what they want.
  if group_owner_count(p_group_id) <= 1
     and exists (
       select 1 from group_members
       where group_id = p_group_id and user_id = p_user_id and role = 'owner'
     )
  then
    raise exception 'That is the only owner of this group. Make someone else an owner first.';
  end if;

  delete from group_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;

/* Promote or demote somebody. Owner-only, and cannot leave a group ownerless.
 *
 * SECURITY DEFINER rather than an RLS UPDATE policy on group_members: the rules
 * here are conditional on how many owners remain, which a policy expression
 * cannot express clearly, and there is deliberately no UPDATE policy on that
 * table so this is the only way a role can change. */
create function set_group_member_role(p_group_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_role not in ('owner', 'member') then
    raise exception 'Unknown role: %', p_role;
  end if;

  if not is_group_owner(p_group_id) then
    raise exception 'Only a group owner can change roles';
  end if;

  if not exists (
    select 1 from group_members where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'That person is not in this group';
  end if;

  if p_role = 'member'
     and group_owner_count(p_group_id) <= 1
     and exists (
       select 1 from group_members
       where group_id = p_group_id and user_id = p_user_id and role = 'owner'
     )
  then
    raise exception 'A group needs at least one owner. Make someone else an owner first.';
  end if;

  update group_members set role = p_role
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

-- ============================================================================
-- New groups: the creator owns them.
-- ============================================================================
create or replace function create_group(p_name text)
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

  insert into group_members (group_id, user_id, role)
  values (new_group.id, auth.uid(), 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';

  return new_group;
end;
$$;

create or replace function add_creator_as_member()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (group_id, user_id) do nothing;
  return new;
end;
$$;

-- ============================================================================
-- Leaving is always allowed; the group promotes a successor if it must.
-- ============================================================================
-- Deliberately different from demotion and removal, which refuse to take the
-- last owner. Someone leaving has no alternative to offer them -- blocking it
-- would trap a person in a group -- so the group repairs itself instead.
create or replace function transfer_owned_lists_on_departure()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  successor uuid;
begin
  select user_id into successor
  from group_members
  where group_id = old.group_id and user_id != old.user_id
  order by joined_at asc
  limit 1;

  if successor is not null then
    update lists
    set owner_id = successor, updated_at = now()
    where group_id = old.group_id and owner_id = old.user_id;

    -- created_by is only attribution now, but keeping it pointed at a current
    -- member stops the UI showing a name nobody recognises.
    update groups
    set created_by = successor
    where id = old.group_id and created_by = old.user_id;

    -- Only promote if this departure would otherwise leave nobody in charge.
    if old.role = 'owner'
       and not exists (
         select 1 from group_members
         where group_id = old.group_id and user_id != old.user_id and role = 'owner'
       )
    then
      update group_members set role = 'owner'
      where group_id = old.group_id and user_id = successor;
    end if;
  end if;

  return old;
end;
$$;
