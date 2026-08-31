/**
 * The reads and the writes behind focus mode.
 *
 * Focus stores nothing of its own. The batch is the plan cut into threes, and
 * a day with no plan gets one from the first act a person takes. See ADR-0009.
 */

import { batchOf, BATCH, type Batch } from "./focus";
import { appendToPlan, readPlan, startPlan } from "./plans.server";
import type { OrgSet } from "./scope.server";
import { groupsFor, type GroupKey, type LiveTask } from "./unified";
import { listUnified } from "./unified.server";

export type Focus = {
  /** The three tasks on the screen, and what they hide. */
  batch: Batch;
  /** True for a day the person has a plan for, which is what holds the batch. */
  planned: boolean;
  /** True for a plan row that holds no task the person can still work. */
  planEmpty: boolean;
  /** How many tasks focus could take three of, once this batch is done. */
  more: number;
};

/**
 * The batch a person is on, and what surrounds it.
 *
 * The batch draws from today's plan when a plan exists, in plan order. With no
 * plan it draws from the unified view, in that page's order, which is the same
 * list `/me` reads.
 */
export async function readFocus(
  db: D1Database,
  set: OrgSet,
  personId: string,
  day: string,
): Promise<Focus> {
  const plan = await readPlan(db, personId, day);
  const { inPlan, rest } = await bothLists(db, set, plan);
  const source = plan === null ? rest : inPlan;

  return {
    batch: batchOf(source),
    planned: plan !== null,
    planEmpty: plan !== null && inPlan.length === 0,
    more: rest.length,
  };
}

/**
 * Writes the batch on the screen as today's plan, where the person has planned
 * no day. It is what a first finish or first drop does before it acts, so the
 * three tasks stay still from then on.
 */
export async function holdBatch(
  db: D1Database,
  personId: string,
  day: string,
  focus: Focus,
): Promise<void> {
  if (focus.planned) return;
  await startPlan(db, personId, day, focus.batch.tasks.map((one) => one.id));
}

/**
 * Takes three more tasks into the plan, from the unified view.
 *
 * A batch that still holds an unfinished task takes nothing: the next three
 * appear when this three are done, and not before.
 */
export async function takeMore(
  db: D1Database,
  set: OrgSet,
  personId: string,
  day: string,
): Promise<void> {
  const plan = await readPlan(db, personId, day);
  const { inPlan, rest } = await bothLists(db, set, plan);
  if (plan !== null && batchOf(inPlan).tasks.length > 0) return;

  const next = rest.slice(0, BATCH).map((one) => one.id);
  if (plan === null) await startPlan(db, personId, day, next);
  else await appendToPlan(db, personId, day, next);
}

/** The plan in plan order, and every other live task in the unified order. */
async function bothLists(
  db: D1Database,
  set: OrgSet,
  plan: string[] | null,
): Promise<{ inPlan: LiveTask[]; rest: LiveTask[] }> {
  const tasks = await listUnified(db, set, plan ?? []);
  const groups = groupsFor(tasks, plan ?? []);
  const of = (key: GroupKey) => groups.find((group) => group.key === key)!.tasks;

  // The two groups that are not the plan, in the order `/me` draws them.
  return { inPlan: of("today"), rest: [...of("in_progress"), ...of("todo")] };
}
