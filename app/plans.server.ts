/**
 * A plan is the tasks one person chose for one day, in the order they mean to
 * work them. The row holds that order as a JSON array.
 *
 * This module holds the reads and the writes both cross-org lists make: put a
 * task in a day's plan, take it out again, and move one a place. Every write
 * lands on the row, because a plan a person cannot close the tab on is no
 * plan. See ADR-0004.
 */

import type { Picks } from "./picks";
import { moveInPlan, type Step } from "./plan";

/**
 * The ordered task ids one person planned for one day, or null when they
 * planned no day.
 *
 * The null is not an empty list. A person who takes the last task out of a
 * plan still made one, so the page does not offer to start it again.
 */
export async function readPlan(
  db: D1Database,
  personId: string,
  day: string,
): Promise<string[] | null> {
  const row = await db
    .prepare("SELECT task_ids FROM plans WHERE user_id = ? AND day = ?")
    .bind(personId, day)
    .first<{ task_ids: string }>();
  return row ? (JSON.parse(row.task_ids) as string[]) : null;
}

/**
 * Starts a day with an order, and leaves a day already started alone.
 *
 * Three acts are this one write. Leftovers carry a day forward or start it
 * clean, and focus mode holds its batch: the first act on a batch drawn from
 * the live set writes those three as the day's plan, so they stay still.
 * A person who already planned the day keeps that plan, so a second press of
 * any of them changes nothing. See ADR-0009.
 */
export async function startPlan(
  db: D1Database,
  personId: string,
  day: string,
  taskIds: string[],
): Promise<boolean> {
  const written = await db
    .prepare(
      `INSERT INTO plans (user_id, day, task_ids) VALUES (?, ?, ?)
       ON CONFLICT (user_id, day) DO NOTHING`,
    )
    .bind(personId, day, JSON.stringify(taskIds))
    .run();
  // True where this write made the plan, which is what a caller with more to
  // write about the same act needs to know.
  return written.meta.changes > 0;
}

/**
 * Adds the tasks a day's plan does not hold at its end, in one write, where a
 * person who names one more task means it after the ones they already named.
 *
 * The caller proved the person can reach every task, through the scope helper.
 */
export async function appendToPlan(
  db: D1Database,
  personId: string,
  day: string,
  taskIds: string[],
): Promise<void> {
  const plan = (await readPlan(db, personId, day)) ?? [];
  const add = taskIds.filter((one) => !plan.includes(one));
  if (add.length === 0) return;
  await writePlan(db, personId, day, [...plan, ...add]);
}

/**
 * Moves one task a place up or down a day's plan.
 *
 * The order is what a plan says, so this is the whole of the reorder: the row
 * carries the new order, and the next read gives it back.
 */
export async function movePlan(
  db: D1Database,
  personId: string,
  day: string,
  taskId: string,
  step: Step,
): Promise<void> {
  const plan = await readPlan(db, personId, day);
  if (!plan) return;
  const moved = moveInPlan(plan, taskId, step);
  if (moved === plan) return;
  await writePlan(db, personId, day, moved);
}

/**
 * Takes a block of tasks out of a day's plan, leaving the rest in order.
 *
 * One task is a block of one. The undo of one paste is one act as well, so the
 * whole block leaves the day in one write rather than in one write per task.
 */
export async function unplanTasks(
  db: D1Database,
  personId: string,
  day: string,
  taskIds: string[],
): Promise<void> {
  const plan = await readPlan(db, personId, day);
  const drop = new Set(taskIds);
  if (!plan?.some((one) => drop.has(one))) return;
  await writePlan(
    db,
    personId,
    day,
    plan.filter((one) => !drop.has(one)),
  );
}

/** Writes the whole order of one day, making the row on the first task. */
async function writePlan(
  db: D1Database,
  personId: string,
  day: string,
  taskIds: string[],
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO plans (user_id, day, task_ids) VALUES (?, ?, ?)
       ON CONFLICT (user_id, day) DO UPDATE
         SET task_ids = excluded.task_ids,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .bind(personId, day, JSON.stringify(taskIds))
    .run();
}

/**
 * Takes a block of tasks out of every plan in a run of days.
 *
 * A task that leaves a week set leaves that week's plans with it, from the day
 * the person is on and forward. The run stops where the caller says, because
 * a past day is never rewritten: a plan records what a person meant to do on
 * that day. See ADR-0014.
 */
export async function unplanAcross(
  db: D1Database,
  personId: string,
  from: string,
  to: string,
  taskIds: string[],
): Promise<void> {
  if (taskIds.length === 0 || from > to) return;

  const drop = new Set(taskIds);
  const { results } = await db
    .prepare("SELECT day, task_ids FROM plans WHERE user_id = ? AND day >= ? AND day <= ?")
    .bind(personId, from, to)
    .all<{ day: string; task_ids: string }>();

  const writes = results
    .map((row) => ({ day: row.day, taskIds: JSON.parse(row.task_ids) as string[] }))
    .filter((one) => one.taskIds.some((id) => drop.has(id)))
    .map((one) =>
      db
        .prepare(
          `UPDATE plans SET task_ids = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE user_id = ? AND day = ?`,
        )
        .bind(JSON.stringify(one.taskIds.filter((id) => !drop.has(id))), personId, one.day),
    );

  if (writes.length > 0) await db.batch(writes);
}
