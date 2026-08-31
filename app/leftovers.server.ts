/**
 * The one read behind the prompt: what the last plan leaves over for a day.
 *
 * The page and the write both ask it, so "what a leftover is" is settled in
 * one place. It reads the old plan's row and never writes it: a plan records
 * what a person meant to do on that day.
 */

import { unfinishedOf, type Leftovers } from "./leftovers";
import { lastPlanBefore } from "./plans.server";
import type { OrgSet } from "./scope.server";
import { listUnified } from "./unified.server";

/**
 * The unfinished tasks of the last plan before a day, or null when there is
 * nothing to offer: no earlier plan, or an earlier plan that is finished.
 *
 * Every task is read through the org set, so a plan the person can no longer
 * reach carries nothing.
 */
export async function leftoversFor(
  db: D1Database,
  set: OrgSet,
  day: string,
): Promise<Leftovers | null> {
  const last = await lastPlanBefore(db, set.personId, day);
  if (!last) return null;

  const taskIds = unfinishedOf(last.taskIds, await listUnified(db, set, last.taskIds));
  return taskIds.length > 0 ? { from: last.from, taskIds } : null;
}
