/**
 * Leftovers: the tasks the last week set holds that are still unfinished.
 *
 * A week rarely ends finished. The offer is made once a week and not once a
 * day, because carrying a list from day to day is the rolling pile the week
 * set was built to end. See ADR-0014, "It replaces the day's leftovers".
 *
 * A week set is never rewritten after its week, so carrying forward copies the
 * memberships into the new week and leaves the old ones as they were: a
 * carried task is in both sets.
 *
 * "Last week" is the last week that holds a set, so after a fortnight away it
 * is the week before that fortnight. The prompt names it.
 */

import type { LiveTask } from "./unified";

/** What one earlier week offers this one, as the prompt reads it. */
export type Leftovers = {
  /** The week the tasks come from, which is not always the week before. */
  from: string;
  /** The unfinished members of that set. */
  taskIds: string[];
};

/**
 * The ids of an old set that are worth carrying.
 *
 * Unfinished means a status other than Done or Cancelled. A task that was
 * archived or deleted, or that sits in an org the person left, is not in
 * `live` at all, so it is not carried either.
 */
export function unfinishedOf(members: string[], live: LiveTask[]): string[] {
  const open = new Set(live.filter((one) => !one.finished).map((one) => one.id));
  return members.filter((id) => open.has(id));
}
