alter table lists add column sort_order int not null default 0;

-- backfill existing lists in their current creation order, per group
with ordered as (
  select id, row_number() over (partition by group_id order by created_at) - 1 as rn
  from lists
)
update lists set sort_order = ordered.rn
from ordered
where lists.id = ordered.id;
