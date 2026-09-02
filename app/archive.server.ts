/**
 * Archive takes finished work off the board and keeps it.
 *
 * Archive is a flag, not a status: an archived task keeps its Done or
 * Cancelled status, and restoring it puts it back in the column it held.
 *
 * The two writes here are batches, because the board sweeps a whole column at
 * once and one undo puts that whole batch back. Each write reports the ids it
 * changed, and that list is what the undo restores: a task archived before the
 * sweep was not the sweep's doing, so the undo leaves it archived.
 */

import type { Scope } from "./scope.server";
import { asTask, CARD_FIELDS, type Task } from "./tasks.server";

/** The time a write stamps into `archived_at` and `updated_at`. */
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/**
 * How many statements go into one batch. A sweep is as long as the column a
 * person is looking at, and D1 takes a bounded batch, so a long column is
 * written in several.
 */
const BATCH = 100;

/**
 * Archives the tasks of the org the list names, and gives back the ids it
 * changed, in the order they were named.
 *
 * A task the org does not hold, and a task already archived, change nothing
 * and are absent from the answer. The `org_id` in the WHERE clause is the
 * fence, as it is in every other write.
 */
export async function archiveTasks(
  db: D1Database,
  scope: Scope,
  taskIds: string[],
): Promise<string[]> {
  return flag(db, scope, taskIds, {
    set: `archived = 1, archived_at = ${NOW}`,
    was: 0,
  });
}

/**
 * Restores the tasks of the org the list names, and gives back the ids it
 * changed. It is the mirror of the sweep: the ids one sweep archived, put back
 * in one act.
 */
export async function restoreTasks(
  db: D1Database,
  scope: Scope,
  taskIds: string[],
): Promise<string[]> {
  return flag(db, scope, taskIds, { set: "archived = 0, archived_at = NULL", was: 1 });
}

/**
 * The write both acts make: flip the flag on the rows that still hold the old
 * value, and report which rows that was.
 *
 * The old value is in the WHERE clause rather than read first, so two people
 * sweeping the same column do not both claim the same row: only the write that
 * changed it counts it.
 */
async function flag(
  db: D1Database,
  scope: Scope,
  taskIds: string[],
  how: { set: string; was: 0 | 1 },
): Promise<string[]> {
  const changed: string[] = [];

  for (let at = 0; at < taskIds.length; at += BATCH) {
    const batch = taskIds.slice(at, at + BATCH);
    const done = await db.batch(
      batch.map((taskId) =>
        db
          .prepare(
            `UPDATE tasks SET ${how.set}, updated_at = ${NOW}
             WHERE id = ? AND org_id = ? AND archived = ?`,
          )
          .bind(taskId, scope.org.id, how.was),
      ),
    );
    batch.forEach((taskId, index) => {
      if (done[index].meta.changes > 0) changed.push(taskId);
    });
  }

  return changed;
}

/**
 * One org's archived tasks, newest archived first.
 *
 * It is a flat list and not a board: archived work is a history a person
 * scans, not a pipeline they rearrange, so the position that orders a column
 * says nothing here. A row archived before the column existed carries no
 * `archived_at`, and the last write of the row stands in for it.
 */
export async function listArchived(db: D1Database, scope: Scope): Promise<Task[]> {
  const { results } = await db
    .prepare(
      `SELECT ${CARD_FIELDS} FROM tasks
       WHERE org_id = ? AND archived = 1
       ORDER BY COALESCE(archived_at, updated_at) DESC, id`,
    )
    .bind(scope.org.id)
    .all<Omit<Task, "data"> & { data: string }>();
  return results.map(asTask);
}

/**
 * The task ids a sweep or an undo names. Both post the ids one at a time, so
 * the set is exactly what the person was looking at when they pressed.
 */
export function readTaskIds(form: FormData): string[] {
  return form.getAll("id").map(String).filter(Boolean);
}
