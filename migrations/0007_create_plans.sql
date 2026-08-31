-- A plan is the tasks one person chose for one day, in the order they mean to
-- work them. It belongs to the person, not to an org, so one plan can hold
-- tasks from several orgs.
--
-- `day` is a local calendar date, as `YYYY-MM-DD`. The browser names it,
-- because `toISOString()` converts to UTC first and an evening plan east of
-- UTC would land on tomorrow.
--
-- `task_ids` holds the order as a JSON array. The order is the whole value of
-- the row, and a row per task would need a second order to keep it.
CREATE TABLE plans (
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  task_ids   TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, day)
);
