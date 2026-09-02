/**
 * The reads and the writes behind focus mode.
 *
 * Focus stores nothing of its own. The batch is the plan cut into threes, and
 * a day with no plan gets one from the first act a person takes. See ADR-0009.
 *
 * The three lists it reads, in order: today's plan, this week's set, and the
 * live set. See ADR-0014.
 */

import { batchOf, BATCH, type Batch } from "./focus";
import { planPicks, startDay } from "./picks.server";
import { readPlan } from "./plans.server";
import type { OrgSet } from "./scope.server";
import { groupsFor, type GroupKey, type LiveTask } from "./unified";
import { listUnified } from "./unified.server";
import { weekOf } from "./week";
import { readWeekSet } from "./weeks.server";

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
 * plan it draws from this week's set, and with no work in that set it draws
 * from the live set, both in the order `/me` sorts them.
 */
export async function readFocus(
  db: D1Database,
  set: OrgSet,
  personId: string,
  day: string,
): Promise<Focus> {
  const { plan, source, rest, inPlan } = await lists(db, set, personId, day);

  return {
    batch: batchOf(source),
    planned: plan !== null,
    planEmpty: plan !== null && inPlan.length === 0,
    more: rest.length,
  };
}

/**
 * Writes the batch on the screen as today's plan, where the person has planned
 * no day. It is what a first finish does before it acts, so the three
 * tasks stay still from then on.
 */
export async function holdBatch(
  db: D1Database,
  personId: string,
  day: string,
  focus: Focus,
): Promise<void> {
  if (focus.planned) return;
  await startDay(db, personId, day, focus.batch.tasks.map((one) => one.id));
}

/**
 * Takes three more tasks into the plan, from the live set.
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
  const { plan, source, rest } = await lists(db, set, personId, day);
  // The batch on the screen is what the guard reads, whichever list drew it.
  if (batchOf(source).tasks.length > 0) return;

  const next = rest.slice(0, BATCH).map((one) => one.id);
  if (plan === null) await startDay(db, personId, day, next);
  else await planPicks(db, personId, day, false).add(next);
}

/**
 * The list the batch is cut from, and the live set behind it.
 *
 * Three lists, in the order focus asks for them: today's plan, then the live
 * members of this week's set, then the whole live set. A week the person
 * started but left empty is no source at all — the set is a shelf and not a
 * fence, so it holds work back from nobody. See ADR-0014.
 */
async function lists(
  db: D1Database,
  set: OrgSet,
  personId: string,
  day: string,
): Promise<{ plan: string[] | null; source: LiveTask[]; rest: LiveTask[]; inPlan: LiveTask[] }> {
  const plan = await readPlan(db, personId, day);
  const { inPlan, rest } = await bothLists(db, set, plan);
  if (plan !== null) return { plan, source: inPlan, rest, inPlan };

  // The set carries no order, so its members draw in the order `/me` sorts
  // them, which is the order `rest` already holds. A member no live task
  // answers for — finished, archived, or back in the backlog — is not work,
  // so it is not in the list either.
  const members = new Set((await readWeekSet(db, personId, weekOf(day))) ?? []);
  const inWeek = rest.filter((one) => members.has(one.id));
  return { plan, source: inWeek.length > 0 ? inWeek : rest, rest, inPlan };
}

/** The plan in plan order, and every other live task in percentile order. */
async function bothLists(
  db: D1Database,
  set: OrgSet,
  plan: string[] | null,
): Promise<{ inPlan: LiveTask[]; rest: LiveTask[] }> {
  const tasks = await listUnified(db, set, plan ?? []);
  const groups = groupsFor(tasks, plan ?? []);
  const of = (key: GroupKey) => groups.find((group) => group.key === key)!.tasks;

  // The two groups that are not the plan, in percentile order.
  return { inPlan: of("today"), rest: [...of("in_progress"), ...of("todo")] };
}
