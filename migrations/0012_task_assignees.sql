-- An assignee is a member of the org that holds the task. A JSON list cannot
-- say that, so the set goes to a table whose foreign key reaches
-- `memberships (org_id, user_id)`. The database then keeps it true: losing the
-- membership loses the assignments. See ADR-0013.
CREATE TABLE task_assignees (
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  org_id     TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (task_id, user_id),
  FOREIGN KEY (org_id, user_id) REFERENCES memberships (org_id, user_id) ON DELETE CASCADE
);

-- The assignee filter reads one person's tasks in one org. This index serves
-- that read, and the cascade a removed membership makes.
CREATE INDEX task_assignees_member_idx ON task_assignees (org_id, user_id);

-- `0004_create_tasks.sql` shipped this column and nothing ever read it.
ALTER TABLE tasks DROP COLUMN assignees;
