/**
 * A plan is the tasks one person chose for one day, in the order they mean to
 * work them. This module holds the rules that order needs: a task moves one
 * place at a time, or it goes to the top.
 *
 * The order is the whole value of a plan, so it is the plan that reorders, not
 * the task. One step at a time is what the board does inside a column, and the
 * two lists move the same way.
 *
 * The week set moves the same three ways, over positions rather than over an
 * array. See `app/week-order.ts` and ADR-0021.
 */

/** How a row moves: one place either way, or all the way to the top. */
export type Step = "up" | "down" | "top";

/**
 * The plan with one task one place further up or down, or at the top of it.
 *
 * A step off either end, a promote of the task already on top, and a task the
 * plan does not hold, answer with the order that came in, the same array. A
 * caller reads that as "nothing moved" and writes no row. A person who presses
 * the key once more than the list allows means nothing by it.
 */
export function moveInPlan(order: string[], taskId: string, step: Step): string[] {
  const at = order.indexOf(taskId);
  if (at === -1) return order;

  // A promote crosses the whole list, so it is not a swap: every task above
  // the one moved shifts down a place, and the rest stand.
  if (step === "top") {
    if (at === 0) return order;
    return [taskId, ...order.filter((one) => one !== taskId)];
  }

  const to = step === "up" ? at - 1 : at + 1;
  if (to < 0 || to >= order.length) return order;

  const moved = [...order];
  moved[at] = order[to];
  moved[to] = order[at];
  return moved;
}
