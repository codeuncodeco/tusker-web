/**
 * A plan is the tasks one person chose for one day, in the order they mean to
 * work them. The row holds that order as a JSON array.
 *
 * This module holds the reads and the writes both cross-org lists make: put a
 * task in a day's plan, take it out again, and move one a place. Every write
 * lands on the row, because a plan a person cannot close the tab on is no
 * plan. See ADR-0004.
 */

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
 * Adds a task at the end of a day's plan, where a person who names one more
 * task means it after the ones they already named. A task the plan holds is
 * left where it is.
 *
 * The caller proved the person can reach the task, through the scope helper.
 */
export async function addToPlan(
  db: D1Database,
  personId: string,
  day: string,
  taskId: string,
): Promise<void> {
  const plan = (await readPlan(db, personId, day)) ?? [];
  if (plan.includes(taskId)) return;
  await writePlan(db, personId, day, [...plan, taskId]);
}

/**
 * Writes a day's plan, and only where the person has planned no day yet.
 *
 * Focus mode holds its batch this way: the first act on a batch drawn from the
 * unified view writes that batch as the day's plan, so the three stay still.
 * A day that already has a plan keeps it. See ADR-0009.
 */
export async function startPlan(
  db: D1Database,
  personId: string,
  day: string,
  taskIds: string[],
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO plans (user_id, day, task_ids) VALUES (?, ?, ?)
       ON CONFLICT (user_id, day) DO NOTHING`,
    )
    .bind(personId, day, JSON.stringify(taskIds))
    .run();
}

/** Adds tasks the plan does not hold at the end of a day's plan, in one write. */
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
 * Moves a task to the end of a day's plan, where focus mode drops one out of a
 * batch. A task the plan does not hold is left alone: a drop says "not now"
 * about a task the person already planned. See ADR-0009.
 */
export async function pushDownPlan(
  db: D1Database,
  personId: string,
  day: string,
  taskId: string,
): Promise<void> {
  const plan = await readPlan(db, personId, day);
  if (!plan?.includes(taskId) || plan[plan.length - 1] === taskId) return;
  await writePlan(db, personId, day, [...plan.filter((one) => one !== taskId), taskId]);
}

/** Takes a task out of a day's plan, leaving the rest in order. */
export async function dropFromPlan(
  db: D1Database,
  personId: string,
  day: string,
  taskId: string,
): Promise<void> {
  const plan = await readPlan(db, personId, day);
  if (!plan?.includes(taskId)) return;
  await writePlan(
    db,
    personId,
    day,
    plan.filter((one) => one !== taskId),
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
