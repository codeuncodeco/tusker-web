/**
 * The one read behind the prompt: what the last week set leaves over.
 *
 * The page and the write both ask it, so "what a leftover is" is settled in
 * one place. It reads the old set and never writes it: a week set records what
 * a person meant to finish in that week.
 */

import { unfinishedOf, type Leftovers } from "./leftovers";
import type { OrgSet } from "./scope.server";
import { listUnified } from "./unified.server";
import { lastWeekSetBefore } from "./weeks.server";

/**
 * The unfinished members of the last set before a week, or null when there is
 * nothing to offer: no earlier week, or an earlier week that is finished.
 *
 * Every task is read through the org set, so a set holding tasks the person
 * can no longer reach carries nothing of them.
 */
export async function leftoversFor(
  db: D1Database,
  set: OrgSet,
  week: string,
): Promise<Leftovers | null> {
  const last = await lastWeekSetBefore(db, set.personId, week);
  if (!last) return null;

  const taskIds = unfinishedOf(last.taskIds, await listUnified(db, set, last.taskIds));
  return taskIds.length > 0 ? { from: last.from, taskIds } : null;
}
