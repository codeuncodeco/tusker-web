-- An org of one has no unassigned, unarchived task: its one member holds every
-- one.
-- `createTasks` writes the row for each new task, and `removeMember` writes it
-- when an org drops to one. This gives the tasks made before that their row.
-- Archived and deleted tasks stay as they are, and a task that has a holder
-- already is skipped, so a second run adds nothing. See ADR-0032.
INSERT INTO task_assignees (task_id, org_id, user_id)
SELECT t.id, t.org_id, m.user_id
  FROM tasks t
  JOIN memberships m ON m.org_id = t.org_id
 WHERE t.archived = 0 AND t.deleted_at IS NULL
   AND (SELECT COUNT(*) FROM memberships WHERE org_id = t.org_id) = 1
   AND NOT EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.id);
