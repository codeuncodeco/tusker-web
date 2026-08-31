-- One task belongs to one org. `data` holds the custom field values from
-- ticket 8 and stays empty until then.
CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL CHECK (status IN ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
  position    REAL NOT NULL DEFAULT 0,
  due_date    TEXT,
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  assignees   TEXT NOT NULL DEFAULT '[]',
  data        TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The board reads one org's column at a time, in order.
CREATE INDEX tasks_org_status_idx ON tasks (org_id, status, position);
