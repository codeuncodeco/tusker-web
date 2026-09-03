/**
 * Where a pick lands, and what it drags with it.
 *
 * The two levels hold one invariant: every task a plan holds is in that week's
 * set. It is one rule read from two sides, so both sides are written here,
 * beside each other, rather than in the two stores they write to.
 *
 * - A pick into a day joins that day's week as well. Plan mode is a shelf and
 *   not a fence, so a Tuesday arrival is one act.
 * - A task taken out of a week set leaves that week's plans from today
 *   forward. Past days are never rewritten.
 * - A pick on a week page claims a place at the top of the set. The write-back
 *   from a day only records one, so it lands at the foot. See ADR-0021.
 *
 * See ADR-0014.
 */

import type { Picks } from "./picks";
import { appendToPlan, startPlan, unplanAcross, unplanTasks } from "./plans.server";
import { weekBounds, weekOf } from "./week";
import { addToWeek, removeFromWeek } from "./weeks.server";

/** The picks of one day: what plan mode's acts, and a board's, write. */
export function planPicks(db: D1Database, personId: string, day: string, onAdd: boolean): Picks {
  const week = weekOf(day);

  return {
    onAdd,
    add: async (taskIds) => {
      await appendToPlan(db, personId, day, taskIds);
      // The write-back. A task on a day is a task of that week, whether the
      // person picked it from the week set or met it on a Tuesday morning.
      //
      // It lands at the foot of the set. The plan already spoke for the task,
      // so it makes no claim on the week, and it must not push down the work
      // the person ranked there by hand. See ADR-0021.
      await addToWeek(db, personId, week, taskIds, "bottom");
    },
    // Taking a task out of a day says nothing about the week: the person still
    // means to finish it, on some other day.
    remove: (taskIds) => unplanTasks(db, personId, day, taskIds),
  };
}

/**
 * Starts a day with an order, and takes that order into the week as well.
 *
 * Focus mode holds its batch this way (ADR-0009), and a batch is a plan, so
 * the same invariant reaches it: every task a plan holds is in that week's
 * set. A day already planned is left alone, batch and week both.
 */
export async function startDay(
  db: D1Database,
  personId: string,
  day: string,
  taskIds: string[],
): Promise<void> {
  if (!(await startPlan(db, personId, day, taskIds))) return;
  await addToWeek(db, personId, weekOf(day), taskIds, "bottom");
}

/**
 * The picks of one week: what the week page's acts write.
 *
 * The cascade runs from the day the person is on, so a Wednesday unpick clears
 * Wednesday, Thursday and Friday and leaves Monday and Tuesday as they were.
 * A week the person is not in cascades over the whole of it, because no day of
 * it is past.
 */
export function weekPicks(
  db: D1Database,
  personId: string,
  week: string,
  onAdd: boolean,
  /** The day the browser is in, which is where the cascade starts. */
  from: string,
): Picks {
  return {
    onAdd,
    // A pick on the week page is a claim: it lands on top, where a person
    // looks for the work they just named. A pasted block keeps its typed
    // order, first line topmost. See ADR-0021.
    add: (taskIds) => addToWeek(db, personId, week, taskIds, "top"),
    remove: async (taskIds) => {
      await removeFromWeek(db, personId, week, taskIds);
      const { monday, sunday } = weekBounds(week);
      await unplanAcross(db, personId, from < monday ? monday : from, sunday, taskIds);
    },
  };
}
