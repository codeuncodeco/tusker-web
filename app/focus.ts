/**
 * Focus: one batch of three tasks, and nothing else on the screen.
 *
 * Three is the whole feature. A plan of fourteen tasks is a list a person
 * reads; three is work they do. This module holds the one rule that says
 * which three, and it reads a list somebody else ordered — the plan when a
 * plan exists, the live set when it does not.
 */

import type { LiveTask } from "./unified";

/** How many tasks a batch holds. */
export const BATCH = 3;

export type Batch = {
  /** The tasks on the screen, in the order the list gave them. */
  tasks: LiveTask[];
  /** Which batch of the day this is, counting from one. Zero where there is none. */
  number: number;
  /** How many tasks the batch hides, so the page can say how much is left. */
  left: number;
};

/**
 * The batch a person is on.
 *
 * The list cuts into threes from the top, and the batch is the first three
 * that still hold an unfinished task. Cutting from the top is what keeps the
 * batch still: a task finished inside the batch stays in it, struck through,
 * and no fourth task slides in to take its place. Only a batch with nothing
 * unfinished left in it gives way to the next one.
 *
 * The rule reads the list and nothing else, so leaving the page and coming
 * back draws the same batch, and no row remembers one.
 */
export function batchOf(tasks: LiveTask[]): Batch {
  for (let at = 0; at < tasks.length; at += BATCH) {
    const batch = tasks.slice(at, at + BATCH);
    if (batch.some((one) => !one.finished)) {
      return { tasks: batch, number: at / BATCH + 1, left: tasks.length - at - batch.length };
    }
  }
  // No batch: every task the list holds is finished, or it holds none.
  return { tasks: [], number: 0, left: 0 };
}
