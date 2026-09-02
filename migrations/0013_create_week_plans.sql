-- A week set is the tasks one person means to finish in one named week.
-- Membership only: no order, and no day. The week says what, the day says
-- when. See ADR-0014.
--
-- `week` is an ISO week key, as `YYYY-Www`. The browser names it, from the day
-- it already tells the server, because `toISOString()` converts to UTC first
-- and an evening east of UTC would land on the wrong week.
--
-- Two tables, not one. The parent row is what makes an empty set different
-- from no set: a person who takes the last task out still started that week.
-- No JSON array, because there is no order to keep.
CREATE TABLE week_plans (
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  week       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, week)
);

CREATE TABLE week_plan_tasks (
  user_id TEXT NOT NULL,
  week    TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, week, task_id),
  FOREIGN KEY (user_id, week) REFERENCES week_plans(user_id, week) ON DELETE CASCADE
);

-- Every read of a set is by person and week, which the primary key already
-- answers. This one serves the other direction: which weeks hold a task, so a
-- task that leaves takes its memberships with it.
CREATE INDEX week_plan_tasks_task ON week_plan_tasks (task_id);
