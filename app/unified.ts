/**
 * The unified view: one person's tasks across every org they belong to.
 *
 * This module holds the sort and the grouping. Plan mode (#36) draws the same
 * list from the same rules, because two cross-org lists that sort differently
 * go wrong as soon as one of them changes.
 */

import type { Status } from "./board";
import type { Shown } from "./fields";

/** The org a card names. It carries no id, because a screen reads this. */
export type CardOrg = { slug: string; name: string };

/** One task of any org, as the unified view sorts and draws it. */
export type LiveTask = {
  id: string;
  org: CardOrg;
  title: string;
  status: Status;
  due_date: string | null;
  /**
   * The task's place in its own org column over that column's length: the
   * third of twelve is 0.25. It is the only measure that means the same thing
   * in two orgs, because a `position` fraction does not.
   */
  percentile: number;
  created_at: string;
  /** The org's `show_on_card` fields the task holds a value for. */
  fields: Shown[];
  /** True for a planned task already finished. It stays in Today, struck through. */
  finished: boolean;
};

/** The three groups, in the order the page draws them. */
export const GROUPS = ["today", "in_progress", "todo"] as const;

export type GroupKey = (typeof GROUPS)[number];

/** The heading each group carries. */
export const GROUP_LABEL: Record<GroupKey, string> = {
  today: "Today",
  in_progress: "In progress",
  todo: "To do",
};

export type Group = { key: GroupKey; label: string; tasks: LiveTask[] };

/**
 * The order inside a group: percentile, due date, `created_at`, id. The tail
 * matches `IN_ORDER` in `tasks.server.ts`.
 *
 * A dated task sorts above an undated one, earliest first. Nothing overrides
 * the sort — an overdue task does not jump the list, because that is priority
 * under a new name.
 */
export function inOrder(a: LiveTask, b: LiveTask): number {
  return (
    a.percentile - b.percentile ||
    byDueDate(a.due_date, b.due_date) ||
    compare(a.created_at, b.created_at) ||
    compare(a.id, b.id)
  );
}

/**
 * The list a person reads, in group order.
 *
 * A task the plan holds is drawn in Today and nowhere else, so no task is
 * drawn twice. A planned id no org answers for is left out: a task that was
 * archived or deleted drops out of the plan rather than raising an error.
 */
export function groupsFor(tasks: LiveTask[], plan: string[]): Group[] {
  const byId = new Map(tasks.map((one) => [one.id, one]));
  const planned = new Set(plan);

  const today = plan.map((id) => byId.get(id)).filter((one) => one !== undefined);
  const rest = tasks.filter((one) => !planned.has(one.id)).sort(inOrder);

  return GROUPS.map((key) => ({
    key,
    label: GROUP_LABEL[key],
    tasks: key === "today" ? today : rest.filter((one) => one.status === key),
  }));
}

/** A dated task above an undated one, and the earlier date first. */
function byDueDate(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compare(a, b);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
