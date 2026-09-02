-- When the task was archived. The archive screen is a history a person scans
-- newest first, and `updated_at` cannot say it: an archived task that was
-- retitled would jump to the top. See #61.
--
-- The column is null for every task on the board. Archiving writes it, and
-- restoring clears it, so the flag and the time say the same thing.
ALTER TABLE tasks ADD COLUMN archived_at TEXT;

-- The rows already archived take the last write of the row, because nothing
-- better is on record.
UPDATE tasks SET archived_at = updated_at WHERE archived = 1;

-- The archive screen reads one org's archived rows, newest first. This index
-- serves that read, as the board's index serves the columns.
CREATE INDEX tasks_org_archived_idx ON tasks (org_id, archived, archived_at);
