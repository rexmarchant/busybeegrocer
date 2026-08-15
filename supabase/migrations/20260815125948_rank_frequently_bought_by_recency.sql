-- ============================================================================
-- Rank the Frequently Bought panel by recency as well as frequency.
-- ============================================================================
-- The panel (formerly "Quick List") ordered by checked_count, the lifetime
-- tally. That number only ever grows, so an item bought 30 times and then
-- abandoned a year ago outranked one bought 10 times in the last three months
-- -- exactly backwards from what the panel is for.
--
-- Rather than keep a purchase history, each item carries an exponentially
-- decayed count. On every check-off the stored score is decayed by the time
-- since the previous check-off and then 1 is added:
--
--     score := score * 0.5 ^ (days_since_last_purchase / HALF_LIFE) + 1
--
-- The reader decays it once more, by the time since last_checked_at, so the
-- score keeps falling while an item goes unbought without anything having to
-- write to the row. The result reads as "roughly how many times this has been
-- bought lately".
--
-- HALF_LIFE is 90 days, written inline below because a plpgsql function cannot
-- reference a constant. It is duplicated in app/src/lib/frequentlyBought.ts and
-- the two MUST stay in step -- otherwise the stored score and the displayed
-- score are measuring different things.

alter table list_items
  add column if not exists last_checked_at timestamptz,
  add column if not exists purchase_score double precision not null default 0;

comment on column list_items.last_checked_at is
  'When this item was last checked off. Null until it has been bought once.';
comment on column list_items.purchase_score is
  'Exponentially decayed purchase count as of last_checked_at, 90-day half-life. Decay again by the age of last_checked_at to get the current value.';

-- ----------------------------------------------------------------------------
-- Maintain the score on check-off.
-- ----------------------------------------------------------------------------
-- The `is_checked is distinct from p_checked` guard is load-bearing and stays:
-- it is what makes replaying the offline queue safe (migration 20260806175526).
-- It now protects the score as well as the tallies -- without it a replayed
-- toggle would add a purchase that never happened.
--
-- Unchecking leaves the score and last_checked_at alone. Unchecking is undoing
-- a mistake or putting something back on the list, not un-buying it, and the
-- tally it belongs in (unchecked_count) already exists.
create or replace function toggle_list_item_checked(p_item_id uuid, p_checked boolean)
returns void
language plpgsql
as $$
begin
  update list_items
  set is_checked = p_checked,
      checked_count = checked_count + case when p_checked then 1 else 0 end,
      unchecked_count = unchecked_count + case when p_checked then 0 else 1 end,
      purchase_score = case
        when p_checked then
          purchase_score * power(
            0.5,
            extract(epoch from (now() - coalesce(last_checked_at, now()))) / (86400 * 90)
          ) + 1
        else purchase_score
      end,
      last_checked_at = case when p_checked then now() else last_checked_at end,
      last_modified_by = auth.uid(),
      last_modified_at = now()
  where id = p_item_id
    and is_checked is distinct from p_checked;
end;
$$;

-- "Check all" is a purchase for every item it touches, so it scores the same
-- way. Its `is_checked = false` guard already made it safe to replay.
create or replace function check_all_list_items(p_list_id uuid)
returns void
language plpgsql
as $$
begin
  update list_items
  set is_checked = true,
      checked_count = checked_count + 1,
      purchase_score = purchase_score * power(
        0.5,
        extract(epoch from (now() - coalesce(last_checked_at, now()))) / (86400 * 90)
      ) + 1,
      last_checked_at = now(),
      last_modified_by = auth.uid(),
      last_modified_at = now()
  where list_id = p_list_id and removed_at is null and is_checked = false;
end;
$$;

-- "Reset counts" says it clears the lifetime history, so it has to clear the
-- ranking too. Leaving the score behind would zero the visible tallies while
-- the panel carried on ordering itself by the history it claimed to have thrown
-- away.
create or replace function reset_list_item_counts(p_list_id uuid)
returns void
language plpgsql
as $$
begin
  if not exists (select 1 from lists where id = p_list_id and owner_id = auth.uid()) then
    raise exception 'Only the list owner can reset counts';
  end if;

  update list_items
  set checked_count = 0,
      unchecked_count = 0,
      purchase_score = 0,
      last_checked_at = null
  where list_id = p_list_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Backfill.
-- ----------------------------------------------------------------------------
-- There is no purchase history to rebuild a real score from, so this seeds the
-- best approximation available: the lifetime tally, dated to the last time the
-- row was touched. It is rough -- last_modified_at also moves when an item is
-- edited or unchecked -- but it decays from something rather than from zero, so
-- long-dormant items sink and active ones stay up, and every genuine check-off
-- from here on corrects it.
update list_items
set purchase_score = checked_count,
    last_checked_at = last_modified_at
where checked_count > 0
  and purchase_score = 0
  and last_checked_at is null;
