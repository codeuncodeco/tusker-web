/**
 * A plan is the tasks one person chose for one day, in the order they mean to
 * work them. This module holds the one rule that order needs: a task moves one
 * place at a time.
 *
 * The order is the whole value of a plan, so it is the plan that reorders, not
 * the task. One step at a time is what the board does inside a column, and the
 * two lists move the same way.
 */

/** Which way a step goes. */
export type Step = "up" | "down";

/**
 * The plan with one task one place further up or down.
 *
 * A step off either end, and a task the plan does not hold, answer with the
 * order that came in, the same array. A caller reads that as "nothing moved"
 * and writes no row. A person who presses the key once more than the list
 * allows means nothing by it.
 */
export function moveInPlan(order: string[], taskId: string, step: Step): string[] {
  const at = order.indexOf(taskId);
  const to = step === "up" ? at - 1 : at + 1;
  if (at === -1 || to < 0 || to >= order.length) return order;

  const moved = [...order];
  moved[at] = order[to];
  moved[to] = order[at];
  return moved;
}
