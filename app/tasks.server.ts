import type { Status } from "./board";

export type Task = {
  id: string;
  org_id: string;
  title: string;
  status: Status;
  position: number;
  due_date: string | null;
  archived: number;
  created_at: string;
};

/** The fields a card needs. `description`, `assignees` and `data` wait for the task page. */
const CARD_FIELDS = "id, org_id, title, status, position, due_date, archived, created_at";

/** One org's live tasks, in column order. Ticket 5 makes `position` mean more. */
export async function listTasks(db: D1Database, orgId: string): Promise<Task[]> {
  const { results } = await db
    .prepare(`SELECT ${CARD_FIELDS} FROM tasks WHERE org_id = ? AND archived = 0 ORDER BY position, created_at, id`)
    .bind(orgId)
    .all<Task>();
  return results;
}

/**
 * Adds a task at the end of its column. The caller has already checked that
 * the person is a member of the org, because `org_id` is the only fence.
 */
export async function createTask(
  db: D1Database,
  task: { orgId: string; title: string; status: Status },
): Promise<Task> {
  const id = crypto.randomUUID();
  const last = await db
    .prepare("SELECT MAX(position) AS at FROM tasks WHERE org_id = ? AND status = ?")
    .bind(task.orgId, task.status)
    .first<{ at: number | null }>();

  await db
    .prepare("INSERT INTO tasks (id, org_id, title, status, position) VALUES (?, ?, ?, ?, ?)")
    .bind(id, task.orgId, task.title, task.status, (last?.at ?? 0) + 1)
    .run();

  const made = await db.prepare(`SELECT ${CARD_FIELDS} FROM tasks WHERE id = ?`).bind(id).first<Task>();
  if (!made) throw new Error("The task disappeared right after the insert.");
  return made;
}

/**
 * Moves a task to another column. The `org_id` in the WHERE clause is what
 * stops one org from writing to another org's row.
 *
 * Returns false when no row matched, so the route can answer 404.
 */
export async function setTaskStatus(
  db: D1Database,
  move: { orgId: string; taskId: string; status: Status },
): Promise<boolean> {
  const last = await db
    .prepare("SELECT MAX(position) AS at FROM tasks WHERE org_id = ? AND status = ?")
    .bind(move.orgId, move.status)
    .first<{ at: number | null }>();

  const done = await db
    .prepare(
      `UPDATE tasks
       SET status = ?, position = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND org_id = ?`,
    )
    .bind(move.status, (last?.at ?? 0) + 1, move.taskId, move.orgId)
    .run();

  return done.meta.changes > 0;
}
