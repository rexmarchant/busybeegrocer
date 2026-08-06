-- ============================================================================
-- Make user accounts deletable, and stop groups being orphaned.
-- ============================================================================
-- Every column that records "who did this" was NOT NULL REFERENCES profiles(id)
-- with NO ACTION on delete. The moment a user added a single item, their
-- account became permanently undeletable: deleting the auth.users row cascades
-- to profiles, and profiles then fails against eight foreign keys. Verified
-- against production -- the delete failed with:
--
--   23503: update or delete on table "profiles" violates foreign key
--          constraint "groups_created_by_fkey" on table "groups"
--
-- That blocks any "delete my account" request, which matters a great deal more
-- once strangers are signing up.
--
-- Attribution columns become nullable with ON DELETE SET NULL. Losing the name
-- is the correct trade: the rows themselves (items, stores, past trips) still
-- belong to the group and other people are still using them. The UI already
-- copes -- profileLabel() in lib/hooks.ts returns 'Unknown' for a null user id.

-- --- attribution: null it out, keep the row ---------------------------------
alter table catalog_items     alter column created_by       drop not null;
alter table invites           alter column invited_by       drop not null;
alter table list_items        alter column added_by         drop not null;
alter table list_items        alter column last_modified_by drop not null;
alter table shopping_sessions alter column started_by       drop not null;
alter table stores            alter column created_by       drop not null;

alter table catalog_items drop constraint catalog_items_created_by_fkey,
  add constraint catalog_items_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table invites drop constraint invites_invited_by_fkey,
  add constraint invites_invited_by_fkey
  foreign key (invited_by) references profiles(id) on delete set null;

alter table list_items drop constraint list_items_added_by_fkey,
  add constraint list_items_added_by_fkey
  foreign key (added_by) references profiles(id) on delete set null;

alter table list_items drop constraint list_items_last_modified_by_fkey,
  add constraint list_items_last_modified_by_fkey
  foreign key (last_modified_by) references profiles(id) on delete set null;

alter table shopping_sessions drop constraint shopping_sessions_started_by_fkey,
  add constraint shopping_sessions_started_by_fkey
  foreign key (started_by) references profiles(id) on delete set null;

alter table stores drop constraint stores_created_by_fkey,
  add constraint stores_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- --- ownership: transfer first, null only as a last resort -------------------
-- These two are not mere attribution. lists.owner_id gates who may rename or
-- delete a list; groups.created_by gates who may remove members. The existing
-- BEFORE DELETE trigger on group_members already reassigns lists on departure,
-- and it fires during the cascade from a profiles delete too -- so ownership
-- normally moves to a surviving member before SET NULL could ever apply. SET
-- NULL is the floor for the case where nobody is left to inherit.
alter table lists  alter column owner_id   drop not null;
alter table groups alter column created_by drop not null;

alter table lists drop constraint lists_owner_id_fkey,
  add constraint lists_owner_id_fkey
  foreign key (owner_id) references profiles(id) on delete set null;

alter table groups drop constraint groups_created_by_fkey,
  add constraint groups_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- ============================================================================
-- Keep groups.created_by pointing at an actual member.
-- ============================================================================
-- Previously this trigger moved lists but never groups.created_by. If the
-- creator left, the group was owned by a non-member and remove_group_member()
-- -- which requires created_by = auth.uid() -- could never succeed again for
-- anyone. The group became permanently unmanageable with no way to recover.
create or replace function transfer_owned_lists_on_departure()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_owner uuid;
begin
  -- longest-standing remaining member, if there is one
  select user_id into new_owner
  from group_members
  where group_id = old.group_id and user_id != old.user_id
  order by joined_at asc
  limit 1;

  if new_owner is not null then
    update lists
    set owner_id = new_owner, updated_at = now()
    where group_id = old.group_id and owner_id = old.user_id;

    -- hand the group itself over too, so it always has a manager
    update groups
    set created_by = new_owner
    where id = old.group_id and created_by = old.user_id;
  end if;

  return old;
end;
$$;

-- ============================================================================
-- Don't let a null owner freeze a list.
-- ============================================================================
-- With owner_id nullable, "owner can update" would lock everyone out of a list
-- whose owner is gone. Fall back to group membership in that case. This also
-- quietly fixes a long-standing annoyance: an ownerless shared list can now be
-- renamed by the people actually using it.
drop policy "lists: owner can update" on lists;
create policy "lists: owner or, if ownerless, any member can update" on lists for update
  using (owner_id = auth.uid() or (owner_id is null and is_group_member(group_id)));

drop policy "lists: owner can delete" on lists;
create policy "lists: owner or, if ownerless, any member can delete" on lists for delete
  using (owner_id = auth.uid() or (owner_id is null and is_group_member(group_id)));
