/**
 * A week set is the tasks one person means to finish in one named week.
 * Membership is the whole statement: no order, and no day. See ADR-0014.
 *
 * Two tables carry it, so an empty set is not the same as no set. The parent
 * row says the person started that week, and it stays when the last task
 * leaves.
 */

import type { Picks } from "./picks";

/**
 * The task ids one person's week set holds, or null when they started no such
 * week.
 *
 * The null is not an empty list. A person who takes the last task out of a set
 * still planned that week.
 *
 * The ids come back in no meaningful order: a week set has none, and the page
 * draws it in percentile order like every other cross-org list.
 */
export async function readWeekSet(
  db: D1Database,
  personId: string,
  week: string,
): Promise<string[] | null> {
  const started = await db
    .prepare("SELECT week FROM week_plans WHERE user_id = ? AND week = ?")
    .bind(personId, week)
    .first<{ week: string }>();
  if (!started) return null;

  const { results } = await db
    .prepare("SELECT task_id FROM week_plan_tasks WHERE user_id = ? AND week = ? ORDER BY task_id")
    .bind(personId, week)
    .all<{ task_id: string }>();
  return results.map((row) => row.task_id);
}

/**
 * Puts a block of tasks in a week's set, and makes the week's row on the first
 * of them.
 *
 * One task is a block of one, and a pasted list is one act: the whole block
 * joins in one write rather than in one write per task. A task the set already
 * holds is left alone, because membership is a fact and not a count.
 *
 * The caller proved the person can reach every task, through the scope helper.
 */
export async function addToWeek(
  db: D1Database,
  personId: string,
  week: string,
  taskIds: string[],
): Promise<void> {
  if (taskIds.length === 0) return;

  await db.batch([
    db
      .prepare(
        `INSERT INTO week_plans (user_id, week) VALUES (?, ?)
         ON CONFLICT (user_id, week) DO UPDATE
           SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .bind(personId, week),
    ...taskIds.map((taskId) =>
      db
        .prepare(
          `INSERT INTO week_plan_tasks (user_id, week, task_id) VALUES (?, ?, ?)
           ON CONFLICT (user_id, week, task_id) DO NOTHING`,
        )
        .bind(personId, week, taskId),
    ),
  ]);
}

/**
 * Takes a block of tasks out of a week's set.
 *
 * The parent row stays, empty set and all: that row is what says the week was
 * planned, so emptying a set does not read as never having planned one.
 */
export async function removeFromWeek(
  db: D1Database,
  personId: string,
  week: string,
  taskIds: string[],
): Promise<void> {
  if (taskIds.length === 0) return;

  const holes = taskIds.map(() => "?").join(", ");
  await db
    .prepare(
      `DELETE FROM week_plan_tasks
       WHERE user_id = ? AND week = ? AND task_id IN (${holes})`,
    )
    .bind(personId, week, ...taskIds)
    .run();
}

/** The picks of one week: what the week page's acts write. */
export function weekPicks(
  db: D1Database,
  personId: string,
  week: string,
  onAdd: boolean,
): Picks {
  return {
    onAdd,
    add: (taskIds) => addToWeek(db, personId, week, taskIds),
    remove: (taskIds) => removeFromWeek(db, personId, week, taskIds),
  };
}
