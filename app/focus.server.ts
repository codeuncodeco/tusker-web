/**
 * The reads and the writes behind focus mode.
 *
 * Focus stores nothing of its own. The batch is the plan cut into threes, and
 * a day with no plan gets one from the first act a person takes. See ADR-0009.
 *
 * The three lists it reads, in order: today's plan, this week's set, and the
 * live set. Each is read only where the one before it is not there at all: an
 * empty set is not the same as no set. See ADR-0014.
 *
 * The first two carry an order of the person's own, so the batch is cut from
 * the head of the list they ranked. See ADR-0021.
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
  /** True for a week set that holds no task the person can still work. */
  weekEmpty: boolean;
  /** How many tasks focus could take three of, once this batch is done. */
  more: number;
};

/**
 * The batch a person is on, and what surrounds it.
 *
 * The batch draws from today's plan when a plan exists, in plan order. With no
 * plan it draws from this week's set, in week order, and with no set either
 * from the live set, in the order `/me` sorts it.
 */
export async function readFocus(
  db: D1Database,
  set: OrgSet,
  personId: string,
  day: string,
): Promise<Focus> {
  const { planned, source, rest, empty } = await focusSource(db, set, personId, day);

  return {
    batch: batchOf(source),
    planned,
    planEmpty: planned && empty,
    weekEmpty: !planned && empty,
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
  const { planned, source, rest } = await focusSource(db, set, personId, day);
  // The batch on the screen is what the guard reads, whichever list drew it.
  if (batchOf(source).tasks.length > 0) return;

  const next = rest.slice(0, BATCH).map((one) => one.id);
  if (planned) await planPicks(db, personId, day, false).add(next);
  else await startDay(db, personId, day, next);
}

/**
 * The list the batch is cut from, the live set behind it, and whether that
 * list holds any work left.
 *
 * Three lists, in the order focus asks for them: today's plan, then the live
 * members of this week's set, then the whole live set. An empty set is not the
 * same as no set (ADR-0014), so a week the person started and left empty draws
 * an empty batch, as an emptied plan does. The live set is what a person with
 * no set at all gets, and what "take three more" reaches for either way.
 */
async function focusSource(
  db: D1Database,
  set: OrgSet,
  personId: string,
  day: string,
): Promise<{
  /** True for a day the person has a plan for. */
  planned: boolean;
  source: LiveTask[];
  rest: LiveTask[];
  /** True where the source is a plan or a set that holds no work left. */
  empty: boolean;
}> {
  const plan = await readPlan(db, personId, day);
  const { inPlan, rest } = await bothLists(db, set, plan);
  if (plan !== null) return { planned: true, source: inPlan, rest, empty: inPlan.length === 0 };

  // The set carries its own order, so the first three are the three the week
  // page ranked first, and not the three one org column happens to lead with.
  // A member no live task answers for — finished, archived, or back in the
  // backlog — is not work, so it is not in the list either. See ADR-0021.
  const members = await readWeekSet(db, personId, weekOf(day));
  if (members === null) return { planned: false, source: rest, rest, empty: false };

  const live = new Map(rest.map((one) => [one.id, one]));
  const inWeek = members.map((id) => live.get(id)).filter((one) => one !== undefined);
  return { planned: false, source: inWeek, rest, empty: inWeek.length === 0 };
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
