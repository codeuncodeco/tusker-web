/**
 * A plan is the tasks one person chose for one day, in the order they mean to
 * work them. The row holds that order as a JSON array.
 *
 * This module holds the reads and the writes both cross-org lists make: put a
 * task in a day's plan, take it out again, and move one a place. Every write
 * lands on the row, because a plan a person cannot close the tab on is no
 * plan. See ADR-0004.
 */

import type { Leftovers } from "./leftovers";
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
 * The last plan before a day, or null when the person planned no earlier day.
 *
 * The day it names is the last day that holds a plan, so after a weekend it is
 * Friday and not yesterday. A plan for a later day says nothing about this
 * one.
 */
export async function lastPlanBefore(
  db: D1Database,
  personId: string,
  day: string,
): Promise<Leftovers | null> {
  const row = await db
    .prepare(
      "SELECT day, task_ids FROM plans WHERE user_id = ? AND day < ? ORDER BY day DESC LIMIT 1",
    )
    .bind(personId, day)
    .first<{ day: string; task_ids: string }>();
  return row ? { from: row.day, taskIds: JSON.parse(row.task_ids) as string[] } : null;
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
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO plans (user_id, day, task_ids) VALUES (?, ?, ?)
       ON CONFLICT (user_id, day) DO NOTHING`,
    )
    .bind(personId, day, JSON.stringify(taskIds))
    .run();
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
