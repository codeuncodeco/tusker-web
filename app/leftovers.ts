/**
 * Leftovers: the tasks the last plan holds that are still unfinished.
 *
 * Yesterday's plan is rarely finished. A plan records what a person meant to
 * do on that day, so it is never rewritten after its day: carrying forward
 * copies the leftovers into today's row and leaves the old row as it was.
 *
 * "Yesterday" is the last day that holds a plan, which after a weekend is
 * Friday, so the prompt names the day rather than saying yesterday.
 */

import type { LiveTask } from "./unified";

/** What one earlier plan offers today, as the prompt reads it. */
export type Leftovers = {
  /** The day the tasks come from, which is not always yesterday. */
  from: string;
  /** The unfinished ids, in the order the old plan held them. */
  taskIds: string[];
};

/**
 * The ids of an old plan that are worth carrying, in that plan's order.
 *
 * Unfinished means a status other than Done or Cancelled. A task that was
 * archived or deleted is not in `live` at all, so it is not carried either.
 */
export function unfinishedOf(order: string[], live: LiveTask[]): string[] {
  const open = new Set(live.filter((one) => !one.finished).map((one) => one.id));
  return order.filter((id) => open.has(id));
}
