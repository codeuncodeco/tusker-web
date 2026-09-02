/**
 * The cross-org pages: one person's tasks across every org they belong to.
 *
 * This module holds the sort, the groups plan mode draws and the columns the
 * unified board draws. The three pages share the live set and the sort,
 * because two cross-org lists that sort differently go wrong as soon as one of
 * them changes. The layout is each page's own.
 */

import type { Assignee } from "./assignees";
import { STATUS_LABEL, type Status } from "./board";
import type { Shown } from "./fields";

/** The org a card names. It carries no id, because a screen reads this. */
export type CardOrg = { slug: string; name: string };

/** One task of any org, as the cross-org pages sort and draw them. */
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
  /** The members who hold the task. A personal org draws none. See ADR-0013. */
  assignees: Assignee[];
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

/**
 * What a quick add left behind, so the box can offer to undo it and then give
 * the person their words back. See ADR-0012.
 *
 * One add is one act, whether it made one task or a pasted list of them: it
 * carries every id it wrote, and the text as the person typed it, line breaks
 * and all.
 */
export type Added = { ids: string[]; slug: string; text: string; decides: boolean };

/**
 * True for a task a plan can hold. Picking a task for today is the act of
 * taking it out of the backlog, so a person moves it to To do first, and a
 * task already finished is nothing to plan.
 */
export function isPlannable(task: LiveTask): boolean {
  return task.status === "todo" || task.status === "in_progress";
}

/**
 * The unified board: the same five columns the org board draws, across every
 * org at once. A person who learns the board on one org meets the same page on
 * all of them.
 */

/** The two columns the unified board always draws. */
const ALWAYS_SHOWN: Status[] = ["todo", "in_progress"];

/**
 * The three columns a person turns on.
 *
 * Backlog is one of them here and it is not on the org board. There the column
 * appears on its own when To do and In progress are both empty. Across every
 * org that reads "this person holds no live task anywhere", which is near
 * enough never, so the rule is dead and the toggle is all there is.
 */
export const UNIFIED_TOGGLES = ["backlog", "done", "cancelled"] as const;

export type UnifiedToggle = (typeof UNIFIED_TOGGLES)[number];

export type UnifiedToggles = Record<UnifiedToggle, boolean>;

/** Which of the three hidden columns the query string asks for. */
export function readToggles(params: URLSearchParams): UnifiedToggles {
  return {
    backlog: params.get("backlog") === "1",
    done: params.get("done") === "1",
    cancelled: params.get("cancelled") === "1",
  };
}

/** The columns to draw, in board order. */
export function unifiedColumns(toggles: UnifiedToggles): Status[] {
  return [
    ...(toggles.backlog ? (["backlog"] as Status[]) : []),
    ...ALWAYS_SHOWN,
    ...(toggles.done ? (["done"] as Status[]) : []),
    ...(toggles.cancelled ? (["cancelled"] as Status[]) : []),
  ];
}

/** One column of the unified board. */
export type Column = { status: Status; label: string; tasks: LiveTask[] };

/**
 * The columns the board draws, each in the one order the page has.
 *
 * The order is the sort and nothing else. No card is dragged and no card
 * steps: the column is derived, and to say "this first" is to plan it. See
 * ADR-0006, "One order per column".
 */
export function columnsFor(tasks: LiveTask[], shown: Status[]): Column[] {
  return shown.map((status) => ({
    status,
    label: STATUS_LABEL[status],
    tasks: tasks.filter((one) => one.status === status).sort(inOrder),
  }));
}

/** The statuses that hold finished work, and so carry the cap. */
export const FINISHED_STATUSES: Status[] = ["done", "cancelled"];

/** How far back Done and Cancelled reach on the unified board. */
export const FINISHED_DAYS = 7;

/**
 * The earliest `updated_at` a finished task may carry and still be drawn.
 *
 * Done and Cancelled have no cap on the org board. Across every org they are
 * every task the person ever finished, so the unified board caps them to the
 * last week.
 *
 * `tasks` holds no finish time, so this reads the last write of the row and is
 * wrong for a task edited after it was finished. #84 closes that.
 */
export function finishedSince(day: string, days = FINISHED_DAYS): string {
  const at = new Date(`${day}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString();
}
