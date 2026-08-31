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
 * Carrying forward and starting clean are both this write. A person who
 * already planned the day keeps that plan, so a second press of either button
 * changes nothing.
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
