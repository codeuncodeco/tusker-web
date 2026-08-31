-- One person's own number for one task, in the same fraction space as the
-- task's shared `position`. A row exists only for a task that person dragged,
-- and the order they see is COALESCE(rank, position). See ADR-0003.
CREATE TABLE task_ranks (
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  rank       REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (task_id, user_id)
);

-- Every read joins one person's ranks onto one org's column, and a reset
-- deletes that person's rows. Both start from the person.
CREATE INDEX task_ranks_user_id_idx ON task_ranks (user_id);
