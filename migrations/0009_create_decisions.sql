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

-- Tusker asks for a decision when a task is finished, and asks once. The move
-- to Done sets this, so a skipped prompt and a task moved out of Done and back
-- both stay quiet. See ADR-0009.
ALTER TABLE tasks ADD COLUMN decision_asked INTEGER NOT NULL DEFAULT 0
  CHECK (decision_asked IN (0, 1));
