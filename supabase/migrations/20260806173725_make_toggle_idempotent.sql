-- ============================================================================
-- Make toggle_list_item_checked safe to replay.
-- ============================================================================
-- The offline queue replays whatever it could not send at the time, and a
-- replay can legitimately arrive after the change already landed -- the request
-- succeeded but the response never came back, the tab was closed mid-flight, or
-- a groupmate made the same change first. As written, every call incremented a
-- counter regardless of whether it changed anything, so a replayed toggle
-- quietly inflated the lifetime checked/unchecked tallies.
--
-- Adding a state guard makes the function idempotent: calling it with the value
-- an item already has does nothing at all. Replaying is then free, and a queue
-- never has to reason about whether an operation already succeeded.
--
-- This also fixes a smaller pre-existing bug with no queue involved: checking
-- an already-checked item -- two people tapping the same row at once, or a
-- double tap -- previously incremented checked_count a second time.
--
-- check_all_list_items already guards with `and is_checked = false`, so it was
-- always safe to replay and is left alone.
create or replace function toggle_list_item_checked(p_item_id uuid, p_checked boolean)
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
  where id = p_item_id
    -- The whole point: no state change, no row touched, no counter moved.
    and is_checked is distinct from p_checked;
end;
$$;
