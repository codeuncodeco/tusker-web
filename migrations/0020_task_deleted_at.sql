-- When the task was deleted, or null for every task Tusker still shows. A
-- delete keeps the row and marks it, and every read of `tasks` leaves a marked
-- row out. Tusker clears the mark nowhere: a person with direct access to the
-- database is the only way back. See ADR-0031.
ALTER TABLE tasks ADD COLUMN deleted_at TEXT;
