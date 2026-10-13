-- A task is named by a number, and the number is its id. The UUID goes. See
-- ADR-0030.
--
-- SQLite cannot change the type of a primary key in place, so `tasks` and the
-- three tables that point at it are made again, and `plans.task_ids` is
-- rewritten. The old tables step aside under an `_old` name first, so each new
-- one takes its own name and its rows go in after the tasks they point at.
PRAGMA defer_foreign_keys = true;

ALTER TABLE tasks RENAME TO tasks_old;
ALTER TABLE task_assignees RENAME TO task_assignees_old;
ALTER TABLE week_plan_tasks RENAME TO week_plan_tasks_old;
ALTER TABLE decisions RENAME TO decisions_old;

-- An index keeps its name through a rename, and each new table makes its own
-- under the same name.
DROP INDEX tasks_org_status_idx;
DROP INDEX tasks_org_archived_idx;
DROP INDEX tasks_id_org_idx;
DROP INDEX task_assignees_member_idx;
DROP INDEX week_plan_tasks_task;
DROP INDEX decisions_org_created_idx;

-- The number each task takes: from 1, in the order the tasks were made, and
-- the old UUID breaks a tie, so two runs over the same rows agree.
CREATE TABLE task_numbers (
  old_id TEXT PRIMARY KEY,
  n      INTEGER NOT NULL UNIQUE
);

INSERT INTO task_numbers (old_id, n)
SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) FROM tasks_old;

-- `AUTOINCREMENT` and not a plain rowid. A rowid hands out the highest id
-- plus one, so deleting the newest task would give its number to the next. The
-- counter only goes up, so a number names one task for good.
CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
  position    REAL NOT NULL DEFAULT 0,
  due_date    TEXT,
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  data        TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  decides     INTEGER NOT NULL DEFAULT 0 CHECK (decides IN (0, 1)),
  finished_at TEXT,
  archived_at TEXT
);

INSERT INTO tasks
  (id, org_id, title, description, status, position, due_date, archived, data,
   created_at, updated_at, decides, finished_at, archived_at)
SELECT n.n, t.org_id, t.title, t.description, t.status, t.position, t.due_date,
       t.archived, t.data, t.created_at, t.updated_at, t.decides, t.finished_at,
       t.archived_at
FROM tasks_old t JOIN task_numbers n ON n.old_id = t.id
ORDER BY n.n;

CREATE INDEX tasks_org_status_idx ON tasks (org_id, status, position);
CREATE INDEX tasks_org_archived_idx ON tasks (org_id, archived, archived_at);
-- The assignees' second key points at this pair. See 0012.
CREATE UNIQUE INDEX tasks_id_org_idx ON tasks (id, org_id);

CREATE TABLE task_assignees (
  task_id INTEGER NOT NULL,
  org_id  TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (task_id, user_id),
  FOREIGN KEY (task_id, org_id) REFERENCES tasks (id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, user_id) REFERENCES memberships (org_id, user_id) ON DELETE CASCADE
);

INSERT INTO task_assignees (task_id, org_id, user_id)
SELECT n.n, a.org_id, a.user_id
FROM task_assignees_old a JOIN task_numbers n ON n.old_id = a.task_id;

CREATE INDEX task_assignees_member_idx ON task_assignees (org_id, user_id);

CREATE TABLE week_plan_tasks (
  user_id  TEXT NOT NULL,
  week     TEXT NOT NULL,
  task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  position REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, week, task_id),
  FOREIGN KEY (user_id, week) REFERENCES week_plans(user_id, week) ON DELETE CASCADE
);

INSERT INTO week_plan_tasks (user_id, week, task_id, position)
SELECT w.user_id, w.week, n.n, w.position
FROM week_plan_tasks_old w JOIN task_numbers n ON n.old_id = w.task_id;

CREATE INDEX week_plan_tasks_task ON week_plan_tasks (task_id);

CREATE TABLE decisions (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  task_id    INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  decided_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  rationale  TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A decision whose task is gone keeps a null, as the delete left it.
INSERT INTO decisions (id, org_id, task_id, decided_by, title, rationale, created_at)
SELECT d.id, d.org_id, n.n, d.decided_by, d.title, d.rationale, d.created_at
FROM decisions_old d LEFT JOIN task_numbers n ON n.old_id = d.task_id;

CREATE INDEX decisions_org_created_idx ON decisions (org_id, created_at);

-- A plan keeps its order. An id that names no task any more is dropped, as
-- every read of a plan already drops it.
UPDATE plans SET task_ids = (
  SELECT json_group_array(n) FROM (
    SELECT n.n FROM json_each(plans.task_ids) j
    JOIN task_numbers n ON n.old_id = j.value
    ORDER BY j.key
  )
);

-- The children go first, so dropping the old tasks cascades into nothing.
DROP TABLE task_assignees_old;
DROP TABLE week_plan_tasks_old;
DROP TABLE decisions_old;
DROP TABLE tasks_old;
DROP TABLE task_numbers;
