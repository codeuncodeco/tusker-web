-- The week set takes an order. See ADR-0021, which amends ADR-0014.
--
-- ADR-0014 made the week membership only, and drew the set in percentile
-- order: a task's fractional place inside its own org column. Across three
-- orgs that number compares nothing, so the top of the week page was
-- arbitrary, which is the one place a person reads. The set now carries its
-- own order, and no surface carries two: the board is the column's order, and
-- plan mode is the plan's.
--
-- A position is a fraction, as it is on a column (`app/order.ts`): a promote
-- takes one step past the first, and a step swaps two rows, so no other row is
-- renumbered.
--
-- A set that exists reshuffles once. The backfill is `rowid`, which is the
-- order the rows were written. That order means nothing, and it is the right
-- kind of nothing: copying the percentile window in would freeze one day's
-- board shape into a file that can never change again.
ALTER TABLE week_plan_tasks ADD COLUMN position REAL NOT NULL DEFAULT 0;

UPDATE week_plan_tasks SET position = rowid;
