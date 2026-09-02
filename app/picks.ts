/**
 * Where a pick lands.
 *
 * Two pages let a person pick a task: plan mode puts it in one day's plan, and
 * the week page puts it in one week's set. The acts either page makes are the
 * same acts, so they take the list rather than name it, and the route says
 * which list its picks belong to.
 */

export type Picks = {
  /**
   * True where an add is a pick as well. A task typed into plan mode or into
   * the week page joins that list; one typed into a board joins no list.
   */
  onAdd: boolean;
  /** Puts a block of tasks in the list, leaving the ones it already holds. */
  add(taskIds: string[]): Promise<void>;
  /** Takes a block of tasks out of the list. One task is a block of one. */
  remove(taskIds: string[]): Promise<void>;
};
