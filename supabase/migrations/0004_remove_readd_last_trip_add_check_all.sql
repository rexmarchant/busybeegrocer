-- "Add all items from last shopping trip" is removed: shopping_session_items
-- snapshotted every active item on the list (not just what that trip was
-- shopping for), so readd_session_items ended up unchecking everything.
drop function if exists readd_session_items(uuid);

create or replace function end_shopping_session(p_session_id uuid, p_completed boolean)
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
end;
$$;

drop table if exists shopping_session_items;

-- bulk-check every unchecked item on a list (e.g. clearing hundreds of items
-- without shopping mode). Same lifetime-count semantics as the single-item
-- toggle: each check transition increments checked_count.
create function check_all_list_items(p_list_id uuid)
returns void
language plpgsql
as $$
begin
  update list_items
  set is_checked = true,
      checked_count = checked_count + 1,
      last_modified_by = auth.uid(),
      last_modified_at = now()
  where list_id = p_list_id and removed_at is null and is_checked = false;
end;
$$;
