-- BusyBeeGrocer initial schema
-- Convention: every table scoped to a group is reachable only through group_members
-- membership in RLS. Lists add a further private/owner-only gate.

create extension if not exists "pgcrypto";

-- ============================================================================
-- profiles (1:1 with auth.users)
-- ============================================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================================
-- groups & membership
-- ============================================================================
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  email text not null,
  invited_by uuid not null references profiles(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);

-- ============================================================================
-- stores & departments (group-scoped, user-managed)
-- ============================================================================
create table stores (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

-- ============================================================================
-- catalog items (the "full list to choose from")
-- ============================================================================
create table catalog_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  department_id uuid references departments(id) on delete set null,
  default_store_id uuid references stores(id) on delete set null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

-- ============================================================================
-- lists
-- ============================================================================
create table lists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  owner_id uuid not null references profiles(id),
  name text not null,
  icon text not null default 'cart',
  color text not null default 'blue',
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- current + historical items tied to a list. Rows are soft-removed (removed_at)
-- rather than deleted so lifetime checked/unchecked counts survive add/remove cycles.
create table list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  quantity int not null default 1,
  note text,
  photo_url text,
  preferred_store_id uuid references stores(id) on delete set null,
  is_checked boolean not null default false,
  is_favorite boolean not null default false,
  checked_count int not null default 0,
  unchecked_count int not null default 0,
  removed_at timestamptz,
  added_by uuid not null references profiles(id),
  added_at timestamptz not null default now(),
  last_modified_by uuid not null references profiles(id),
  last_modified_at timestamptz not null default now(),
  unique (list_id, catalog_item_id)
);

-- ============================================================================
-- shopping sessions
-- ============================================================================
create table shopping_sessions (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  started_by uuid not null references profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  completed boolean, -- true = all items checked, false = manually ended early, null = in progress
  total_item_count int not null,
  checked_item_count int not null default 0
);

-- snapshot of what was on the list during a session, so "re-add most recent trip"
-- works even after list_items have since changed.
create table shopping_session_items (
  session_id uuid not null references shopping_sessions(id) on delete cascade,
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  quantity int not null default 1,
  was_checked boolean not null default false,
  primary key (session_id, catalog_item_id)
);

-- ============================================================================
-- helper functions for RLS
-- ============================================================================
create function is_group_member(target_group_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from group_members
    where group_id = target_group_id and user_id = auth.uid()
  );
$$;

create function list_is_visible(target_list_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from lists
    where id = target_list_id
      and is_group_member(group_id)
      and (is_private = false or owner_id = auth.uid())
  );
$$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table invites enable row level security;
alter table stores enable row level security;
alter table departments enable row level security;
alter table catalog_items enable row level security;
alter table lists enable row level security;
alter table list_items enable row level security;
alter table shopping_sessions enable row level security;
alter table shopping_session_items enable row level security;

create policy "profiles: self and groupmates readable" on profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from group_members gm1
      join group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid() and gm2.user_id = profiles.id
    )
  );
create policy "profiles: self writable" on profiles for update using (id = auth.uid());

create policy "groups: members can read" on groups for select
  using (is_group_member(id));
create policy "groups: authenticated can create" on groups for insert
  with check (created_by = auth.uid());

create policy "group_members: members can read roster" on group_members for select
  using (is_group_member(group_id));
create policy "group_members: self can join" on group_members for insert
  with check (user_id = auth.uid());
create policy "group_members: self can leave" on group_members for delete
  using (user_id = auth.uid());

create policy "invites: members can read group invites" on invites for select
  using (is_group_member(group_id));
create policy "invites: members can create" on invites for insert
  with check (is_group_member(group_id) and invited_by = auth.uid());
create policy "invites: members can update status" on invites for update
  using (is_group_member(group_id));

create policy "stores: members can read" on stores for select
  using (is_group_member(group_id));
create policy "stores: members can write" on stores for insert
  with check (is_group_member(group_id) and created_by = auth.uid());
create policy "stores: members can update" on stores for update
  using (is_group_member(group_id));
create policy "stores: members can delete" on stores for delete
  using (is_group_member(group_id));

create policy "departments: members can read" on departments for select
  using (is_group_member(group_id));
create policy "departments: members can write" on departments for insert
  with check (is_group_member(group_id));
create policy "departments: members can update" on departments for update
  using (is_group_member(group_id));
create policy "departments: members can delete" on departments for delete
  using (is_group_member(group_id));

create policy "catalog_items: members can read" on catalog_items for select
  using (is_group_member(group_id));
create policy "catalog_items: members can write" on catalog_items for insert
  with check (is_group_member(group_id) and created_by = auth.uid());
create policy "catalog_items: members can update" on catalog_items for update
  using (is_group_member(group_id));

create policy "lists: visible per privacy rule" on lists for select
  using (is_group_member(group_id) and (is_private = false or owner_id = auth.uid()));
create policy "lists: members can create" on lists for insert
  with check (is_group_member(group_id) and owner_id = auth.uid());
create policy "lists: owner can update" on lists for update
  using (owner_id = auth.uid());
create policy "lists: owner can delete" on lists for delete
  using (owner_id = auth.uid());

create policy "list_items: visible if list visible" on list_items for select
  using (list_is_visible(list_id));
create policy "list_items: writable if list visible" on list_items for insert
  with check (list_is_visible(list_id) and added_by = auth.uid());
create policy "list_items: updatable if list visible" on list_items for update
  using (list_is_visible(list_id));
create policy "list_items: deletable if list visible" on list_items for delete
  using (list_is_visible(list_id));

create policy "shopping_sessions: visible if list visible" on shopping_sessions for select
  using (list_is_visible(list_id));
create policy "shopping_sessions: writable if list visible" on shopping_sessions for insert
  with check (list_is_visible(list_id) and started_by = auth.uid());
create policy "shopping_sessions: updatable if list visible" on shopping_sessions for update
  using (list_is_visible(list_id));

create policy "shopping_session_items: visible if session visible" on shopping_session_items for select
  using (exists (select 1 from shopping_sessions s where s.id = session_id and list_is_visible(s.list_id)));
create policy "shopping_session_items: writable if session visible" on shopping_session_items for insert
  with check (exists (select 1 from shopping_sessions s where s.id = session_id and list_is_visible(s.list_id)));

-- ============================================================================
-- seed defaults for a new group
-- ============================================================================
create function seed_group_defaults()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into departments (group_id, name, sort_order) values
    (new.id, 'Produce', 0), (new.id, 'Dairy', 1), (new.id, 'Meat & Seafood', 2),
    (new.id, 'Bakery', 3), (new.id, 'Frozen', 4), (new.id, 'Pantry', 5),
    (new.id, 'Canned Goods', 6), (new.id, 'Beverages', 7), (new.id, 'Snacks', 8),
    (new.id, 'Household', 9), (new.id, 'Personal Care', 10), (new.id, 'Baby', 11),
    (new.id, 'Pet', 12), (new.id, 'Other', 13);
  return new;
end;
$$;

create trigger on_group_created
  after insert on groups
  for each row execute procedure seed_group_defaults();

-- ============================================================================
-- ownership transfer: when a list owner leaves the group, transfer the list
-- to the longest-standing remaining member of that group.
-- ============================================================================
create function transfer_owned_lists_on_departure()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_owner uuid;
  affected_list record;
begin
  for affected_list in
    select id from lists where group_id = old.group_id and owner_id = old.user_id
  loop
    select user_id into new_owner
    from group_members
    where group_id = old.group_id and user_id != old.user_id
    order by joined_at asc
    limit 1;

    if new_owner is not null then
      update lists set owner_id = new_owner, updated_at = now() where id = affected_list.id;
    end if;
  end loop;
  return old;
end;
$$;

create trigger on_group_member_removed
  before delete on group_members
  for each row execute procedure transfer_owned_lists_on_departure();

-- ============================================================================
-- invite acceptance — targeted RPCs instead of open RLS, since an invite id
-- is a bearer token: anyone with the link should see the preview, but only
-- the invited email (once authenticated) can actually join.
-- ============================================================================
create function get_invite_preview(p_invite_id uuid)
returns table (group_name text, email text, status text)
language sql security definer stable
as $$
  select g.name, i.email, i.status
  from invites i
  join groups g on g.id = i.group_id
  where i.id = p_invite_id;
$$;

create function accept_invite(p_invite_id uuid)
returns uuid -- returns the group_id joined
language plpgsql security definer set search_path = public
as $$
declare
  target_invite invites%rowtype;
  caller_email text;
begin
  select email into caller_email from auth.users where id = auth.uid();
  if caller_email is null then
    raise exception 'Must be signed in to accept an invite';
  end if;

  select * into target_invite from invites where id = p_invite_id for update;
  if target_invite is null then
    raise exception 'Invite not found';
  end if;
  if target_invite.status != 'pending' then
    raise exception 'Invite is no longer valid';
  end if;
  if target_invite.expires_at < now() then
    update invites set status = 'expired' where id = p_invite_id;
    raise exception 'Invite has expired';
  end if;
  if lower(target_invite.email) != lower(caller_email) then
    raise exception 'This invite was sent to a different email address';
  end if;

  insert into group_members (group_id, user_id)
  values (target_invite.group_id, auth.uid())
  on conflict (group_id, user_id) do nothing;

  update invites set status = 'accepted', accepted_at = now() where id = p_invite_id;

  return target_invite.group_id;
end;
$$;

-- ============================================================================
-- checked/unchecked tallies — atomic increment, runs as the caller so the
-- existing list_items RLS policy still governs who may call this.
-- ============================================================================
create function toggle_list_item_checked(p_item_id uuid, p_checked boolean)
returns void
language plpgsql
as $$
begin
  update list_items
  set is_checked = p_checked,
      checked_count = checked_count + case when p_checked then 1 else 0 end,
      unchecked_count = unchecked_count + case when p_checked then 0 else 1 end,
      last_modified_by = auth.uid(),
      last_modified_at = now()
  where id = p_item_id;
end;
$$;

-- owner-only, double-confirmed from the UI: zero out lifetime tallies for
-- every item on a list without touching current on/off-list state.
create function reset_list_item_counts(p_list_id uuid)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from lists where id = p_list_id and owner_id = auth.uid()) then
    raise exception 'Only the list owner can reset counts';
  end if;

  update list_items
  set checked_count = 0, unchecked_count = 0
  where list_id = p_list_id;
end;
$$;

-- ============================================================================
-- shopping sessions
-- ============================================================================
create function start_shopping_session(p_list_id uuid)
returns uuid
language plpgsql
as $$
declare
  new_session_id uuid;
  item_total int;
begin
  select count(*) into item_total from list_items where list_id = p_list_id and removed_at is null;

  insert into shopping_sessions (list_id, started_by, total_item_count)
  values (p_list_id, auth.uid(), item_total)
  returning id into new_session_id;

  return new_session_id;
end;
$$;

-- ends a session, snapshotting current list items (for "re-add most recent trip")
-- and recording whether it was a full completion or an early manual stop.
create function end_shopping_session(p_session_id uuid, p_completed boolean)
returns void
language plpgsql
as $$
declare
  target_list_id uuid;
  checked_total int;
begin
  select list_id into target_list_id from shopping_sessions where id = p_session_id;
  if target_list_id is null then
    raise exception 'Session not found';
  end if;

  select count(*) into checked_total
  from list_items where list_id = target_list_id and removed_at is null and is_checked = true;

  update shopping_sessions
  set ended_at = now(), completed = p_completed, checked_item_count = checked_total
  where id = p_session_id;

  insert into shopping_session_items (session_id, catalog_item_id, quantity, was_checked)
  select p_session_id, catalog_item_id, quantity, is_checked
  from list_items
  where list_id = target_list_id and removed_at is null
  on conflict (session_id, catalog_item_id) do nothing;
end;
$$;

-- re-adds every item from a past session back onto its list (un-removes if
-- still present, resets checked state so it starts fresh for the next trip).
create function readd_session_items(p_session_id uuid)
returns void
language plpgsql
as $$
declare
  target_list_id uuid;
  session_item record;
begin
  select list_id into target_list_id from shopping_sessions where id = p_session_id;
  if target_list_id is null then
    raise exception 'Session not found';
  end if;

  for session_item in
    select catalog_item_id, quantity from shopping_session_items where session_id = p_session_id
  loop
    insert into list_items (list_id, catalog_item_id, quantity, added_by, last_modified_by)
    values (target_list_id, session_item.catalog_item_id, session_item.quantity, auth.uid(), auth.uid())
    on conflict (list_id, catalog_item_id) do update
      set removed_at = null,
          is_checked = false,
          quantity = excluded.quantity,
          last_modified_by = auth.uid(),
          last_modified_at = now();
  end loop;
end;
$$;
