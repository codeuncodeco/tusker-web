/**
 * A plan is the tasks one person chose for one day, in the order they mean to
 * work them. The row holds that order as a JSON array.
 *
 * This module holds the reads and the two writes the unified view makes: put a
 * task in today's plan, and take it out again. Plan mode (#36) builds the
 * reorder and the commit on the same row.
 */

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
