-- An assignee is a member of the org that holds the task. A JSON list cannot
-- say that, so the set goes to a table whose foreign keys say both halves of
-- it. The database then keeps it true: losing the membership loses the
-- assignments. See ADR-0013.
--
-- The org reaches `memberships (org_id, user_id)` for the member half, and
-- `tasks (id, org_id)` for the task half, so one row cannot name a task of one
-- org and a member of another. `tasks.id` is the primary key on its own, so
-- the second key needs this index to point at.
CREATE UNIQUE INDEX tasks_id_org_idx ON tasks (id, org_id);

CREATE TABLE task_assignees (
  task_id TEXT NOT NULL,
  org_id  TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (task_id, user_id),
  FOREIGN KEY (task_id, org_id) REFERENCES tasks (id, org_id) ON DELETE CASCADE,
  FOREIGN KEY (org_id, user_id) REFERENCES memberships (org_id, user_id) ON DELETE CASCADE
);

-- The cascade a removed membership makes reads by org and member, and no
-- index of this table starts with those two columns.
CREATE INDEX task_assignees_member_idx ON task_assignees (org_id, user_id);

-- `0004_create_tasks.sql` shipped this column and nothing ever read it.
ALTER TABLE tasks DROP COLUMN assignees;
