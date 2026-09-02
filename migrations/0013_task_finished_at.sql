-- When the work was over. `updated_at` moves on every edit, so it cannot say
-- it: a task finished in March and retitled yesterday reads as finished
-- yesterday. The unified board caps Done and Cancelled to the last seven days,
-- and it needs the finish time to cap them by. See #84.
--
-- The column is null for every task that is not done or cancelled. A move into
-- one of those two writes it, and a move out clears it.
ALTER TABLE tasks ADD COLUMN finished_at TEXT;

-- The rows already finished take the last write of the row, because nothing
-- better is on record. It is right for every task nobody edited after
-- finishing it, and no worse than the cap was before this column.
UPDATE tasks SET finished_at = updated_at WHERE status IN ('done', 'cancelled');
