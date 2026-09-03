/**
 * A week set is the tasks one person means to finish in one named week, in the
 * order they mean to take them. It holds no day: the week says what and how it
 * ranks, and the day says when. See ADR-0014 and ADR-0021.
 *
 * Two tables carry it, so an empty set is not the same as no set. The parent
 * row says the person started that week, and it stays when the last task
 * leaves. The order rides on the membership row as a `position` fraction, so a
 * task that leaves takes its memberships with it.
 */

import { placesAbove, placesBelow } from "./order";
import type { Step } from "./plan";
import { movedInSet, type Member } from "./week-order";

/**
 * Where a block lands in a week set.
 *
 * An act on a week page claims a place, so a hand pick and a pasted block land
 * at the top. A write-back only records one: a task picked into a day the set
 * does not hold lands at the bottom, because the plan already spoke for it and
 * it must not push down the work a person ranked. See ADR-0021.
 */
export type Landing = "top" | "bottom";

/**
 * The task ids one person's week set holds, in the order the set ranks them,
 * or null when they started no such week.
 *
 * The null is not an empty list. A person who takes the last task out of a set
 * still planned that week.
 *
 * The order is the person's own, and the week page is where they make it. A
 * finished member keeps the rank it had, and the page sinks it under the live
 * ones as it draws: nothing is written on a finish, so unfinishing a task
 * gives the rank back.
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
    .prepare(
      `SELECT task_id FROM week_plan_tasks
       WHERE user_id = ? AND week = ? ORDER BY position, task_id`,
    )
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
 * holds keeps the place it has, because membership is a fact and not a count,
 * and a second pick is not a claim to re-rank it.
 *
 * The block keeps the order it came in, first line topmost, at whichever end
 * the caller names.
 *
 * The caller proved the person can reach every task, through the scope helper.
 */
export async function addToWeek(
  db: D1Database,
  personId: string,
  week: string,
  taskIds: string[],
  at: Landing,
): Promise<void> {
  if (taskIds.length === 0) return;

  const set = await setPlaces(db, personId, week);
  const held = new Set(set.map((one) => one.taskId));
  const fresh = taskIds.filter((id) => !held.has(id));
  const places =
    at === "top"
      ? placesAbove(set[0]?.position ?? null, fresh.length)
      : placesBelow(set[set.length - 1]?.position ?? null, fresh.length);

  await db.batch([
    db
      .prepare(
        `INSERT INTO week_plans (user_id, week) VALUES (?, ?)
         ON CONFLICT (user_id, week) DO UPDATE
           SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .bind(personId, week),
    ...fresh.map((taskId, index) =>
      db
        .prepare(
          `INSERT INTO week_plan_tasks (user_id, week, task_id, position) VALUES (?, ?, ?, ?)
           ON CONFLICT (user_id, week, task_id) DO NOTHING`,
        )
        .bind(personId, week, taskId, places[index]),
    ),
  ]);
}

/**
 * Takes a block of tasks out of a week's set.
 *
 * Nothing is renumbered. A hole in a fraction space is not a hole in the
 * order, and the members left keep the ranks the person gave them.
 *
 * The parent row stays, empty set and all: that row is what says the week was
 * planned, so emptying a set does not read as never having planned one. It is
 * touched, because unpicking is work on the week as much as picking is.
 */
export async function removeFromWeek(
  db: D1Database,
  personId: string,
  week: string,
  taskIds: string[],
): Promise<void> {
  if (taskIds.length === 0) return;

  const holes = taskIds.map(() => "?").join(", ");
  await db.batch([
    db
      .prepare(
        `DELETE FROM week_plan_tasks
         WHERE user_id = ? AND week = ? AND task_id IN (${holes})`,
      )
      .bind(personId, week, ...taskIds),
    touch(db, personId, week),
  ]);
}

/**
 * Moves one member of a week's set: one place up or down, or to the top.
 *
 * A step off either end, a promote of the member already on top, and a task
 * the set does not hold write no row. A person who presses the key once more
 * than the list allows means nothing by it.
 */
export async function moveInWeek(
  db: D1Database,
  personId: string,
  week: string,
  taskId: string,
  step: Step,
): Promise<void> {
  const moved = movedInSet(await setPlaces(db, personId, week), taskId, step);
  if (moved.length === 0) return;

  await db.batch([
    ...moved.map((one) =>
      db
        .prepare(
          `UPDATE week_plan_tasks SET position = ?
           WHERE user_id = ? AND week = ? AND task_id = ?`,
        )
        .bind(one.position, personId, week, one.taskId),
    ),
    touch(db, personId, week),
  ]);
}

/**
 * The memberships of one week in stored order, each saying whether the list
 * still ranks it.
 *
 * A member the person no longer works — finished, cancelled or archived — is
 * one the page draws under the live ones or not at all, so a step reads past
 * it rather than swapping a row a person cannot see move.
 */
async function setPlaces(db: D1Database, personId: string, week: string): Promise<Member[]> {
  const { results } = await db
    .prepare(
      `SELECT week_plan_tasks.task_id, week_plan_tasks.position,
              (tasks.archived = 1 OR tasks.status IN ('done', 'cancelled')) AS done
       FROM week_plan_tasks JOIN tasks ON tasks.id = week_plan_tasks.task_id
       WHERE week_plan_tasks.user_id = ? AND week_plan_tasks.week = ?
       ORDER BY week_plan_tasks.position, week_plan_tasks.task_id`,
    )
    .bind(personId, week)
    .all<{ task_id: string; position: number; done: number }>();

  return results.map((row) => ({
    taskId: row.task_id,
    position: row.position,
    finished: row.done === 1,
  }));
}

/** Says the week was worked on, which every write on its set is. */
function touch(db: D1Database, personId: string, week: string): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE week_plans SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE user_id = ? AND week = ?`,
    )
    .bind(personId, week);
}

/**
 * The last week set before a week, or null when the person started no earlier
 * week.
 *
 * The week it names is the last week that holds a set, so a fortnight away
 * offers the week before that fortnight and not an empty one. A set for a
 * later week says nothing about this one.
 *
 * The ids come back in that week's own order, which is what lets a carry keep
 * it: work ranked once is the same work, later.
 *
 * The key sorts as text, which is the ISO key doing its work: `2026-W02`
 * follows `2026-W01`, and a year turns over on its own.
 */
export async function lastWeekSetBefore(
  db: D1Database,
  personId: string,
  week: string,
): Promise<{ from: string; taskIds: string[] } | null> {
  const row = await db
    .prepare("SELECT week FROM week_plans WHERE user_id = ? AND week < ? ORDER BY week DESC LIMIT 1")
    .bind(personId, week)
    .first<{ week: string }>();
  if (!row) return null;

  return { from: row.week, taskIds: (await readWeekSet(db, personId, row.week)) ?? [] };
}

/**
 * Starts a week with a set, and leaves a week already started alone.
 *
 * Both ways out of the leftovers prompt are this one write: carrying forward
 * copies the unfinished members in, and starting clean writes the row with
 * nothing in it. Either way the row is what says the week was planned, so the
 * prompt is not raised again.
 *
 * A carry keeps the order of the week it came from, so the block goes in as it
 * was given, first id topmost.
 *
 * A week the person already started keeps the set it holds, so a second press
 * changes nothing.
 */
export async function startWeek(
  db: D1Database,
  personId: string,
  week: string,
  taskIds: string[],
): Promise<void> {
  const started = await db
    .prepare(
      `INSERT INTO week_plans (user_id, week) VALUES (?, ?)
       ON CONFLICT (user_id, week) DO NOTHING`,
    )
    .bind(personId, week)
    .run();
  // The week was already planned, so its set is the person's and stands.
  if (started.meta.changes === 0 || taskIds.length === 0) return;

  const places = placesBelow(null, taskIds.length);
  await db.batch(
    taskIds.map((taskId, index) =>
      db
        .prepare(
          `INSERT INTO week_plan_tasks (user_id, week, task_id, position) VALUES (?, ?, ?, ?)
           ON CONFLICT (user_id, week, task_id) DO NOTHING`,
        )
        .bind(personId, week, taskId, places[index]),
    ),
  );
}
