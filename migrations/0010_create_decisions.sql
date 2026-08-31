-- A decision is a record of what was decided, kept by the org.
--
-- A decision outlives the task that produced it, so `task_id` is nullable and
-- the delete clears it. The log keeps the record when the work is gone.
CREATE TABLE decisions (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  task_id    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  decided_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  rationale  TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The log reads one org, newest first. This index serves that read.
CREATE INDEX decisions_org_created_idx ON decisions (org_id, created_at);

-- A person marks a task as one that holds a decision, and only that task
-- raises the prompt. It is off by default: most tasks decide nothing, and a
-- prompt people learn to dismiss is how a log goes empty. See ADR-0010.
--
-- Nothing records the ask. The `decisions` table is the once-only guard, so a
-- skipped prompt is raised again the next time the task is finished.
ALTER TABLE tasks ADD COLUMN decides INTEGER NOT NULL DEFAULT 0
  CHECK (decides IN (0, 1));
