/**
 * The cross-org pages: one person's tasks across every org they belong to.
 *
 * This module holds the sort, the groups plan mode draws and the columns the
 * unified board draws. The three pages share the live set and the sort,
 * because two cross-org lists that sort differently go wrong as soon as one of
 * them changes. The layout is each page's own.
 */

import type { Assignee } from "./assignees";
import { ALWAYS_SHOWN, STATUS_LABEL, type Status, type Toggles } from "./board";
import type { Shown } from "./fields";

/** The org a card names. It carries no id, because a screen reads this. */
export type CardOrg = { slug: string; name: string; color: string | null };

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
  /**
   * True for a picked task already finished. It stays in the list that holds
   * it, struck through: in Today where the day put it, and under the live
   * members on a week page.
   */
  finished: boolean;
};

/**
 * The group the picked tasks fill, which is the page's own: plan mode picks
 * into a day, and the week page into a week.
 */
export type Head = "today" | "week";

/**
 * The two groups every cross-org list draws under its head, in page order.
 * They are statuses, so a task falls into one by what it is.
 */
export const UNDER_HEAD = ["in_progress", "todo"] as const;

export type GroupKey = Head | (typeof UNDER_HEAD)[number];

/** The heading each group carries. */
export const GROUP_LABEL: Record<GroupKey, string> = {
  today: "Today",
  week: "This week",
  in_progress: "In progress",
  todo: "To do",
};

export type Group = {
  key: GroupKey;
  label: string;
  tasks: LiveTask[];
  /**
   * True where the finished tasks are drawn under the live ones, and so are
   * out of the order the person ranks. The list reads this to know which rows
   * still move. See ADR-0021.
   */
  sinks: boolean;
};

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
 * A task a head group holds is drawn there and nowhere else, so no task is
 * drawn twice. A picked id no org answers for is left out: a task that was
 * archived or deleted drops out of the list rather than raising an error.
 *
 * Both head groups keep the order they were given, because that order is the
 * whole value of a plan and, since ADR-0021, of a week set as well.
 */
export function groupsFor(tasks: LiveTask[], picked: string[], head: Head = "today"): Group[] {
  return drawn(tasks, [{ key: head, ids: picked, sinks: head === "week" }]);
}

/**
 * The groups plan mode draws: the plan, then this week's set, then the rest of
 * the live set.
 *
 * Plan mode is a shelf and not a fence. The week set is what a person means to
 * finish, so it is offered first, and everything else is offered under it: a
 * Tuesday arrival is picked here in one act, and the pick puts it in the week
 * as well. See ADR-0014, "A shelf, not a fence".
 *
 * A task the plan already holds is drawn in the plan and nowhere else, week
 * member or not.
 *
 * The plan is drawn above the shelf. The shelf comes first of the lists a
 * person picks from, which is what ADR-0014 asks for; the plan is not one of
 * them. It is the thing being built, and it holds the one order on the page.
 *
 * The shelf is drawn in week order, which is the order the week page made.
 * Plan mode reads that order and never writes it: the one order it owns is the
 * plan's. See ADR-0021.
 */
export function planGroups(tasks: LiveTask[], plan: string[], members: string[]): Group[] {
  const planned = new Set(plan);
  return drawn(tasks, [
    { key: "today", ids: plan },
    { key: "week", ids: members.filter((id) => !planned.has(id)), sinks: true },
  ]);
}

/**
 * The one group a page read back draws: what it picked, in its own order, and
 * nothing else.
 *
 * A plan is never rewritten after its day and a week set is never rewritten
 * after its week, so on either page a list to pick from is noise. A picked id
 * no org answers for is left out, as it is everywhere.
 *
 * A week set sinks its finished members here as it does anywhere: reading a
 * week back is what the sink is for.
 */
export function pickedOnly(tasks: LiveTask[], picked: string[], key: Head = "today"): Group[] {
  const byId = new Map(tasks.map((one) => [one.id, one]));
  return [head(byId, { key, ids: picked, sinks: key === "week" })];
}

/** How a page names one of its head groups. */
type HeadGroup = {
  key: GroupKey;
  /** The ids the page picked, in the order it means them to be read. */
  ids: string[];
  /** True where a finished member sinks under the live ones as the group draws. */
  sinks?: boolean;
};

/**
 * The head groups a page names, and under them the rest of the live set split
 * by status.
 *
 * A head group keeps the order it was given. The groups under it take the sort
 * every cross-org list has, because the only orders a person owns are a plan's
 * and a week set's.
 */
function drawn(tasks: LiveTask[], heads: HeadGroup[]): Group[] {
  const byId = new Map(tasks.map((one) => [one.id, one]));
  const inHead = new Set(heads.flatMap((one) => one.ids));
  const rest = tasks.filter((one) => !inHead.has(one.id)).sort(inOrder);

  return [
    ...heads.map((named) => head(byId, named)),
    ...UNDER_HEAD.map((key) => ({
      key,
      label: GROUP_LABEL[key],
      tasks: rest.filter((one) => one.status === key),
      sinks: false,
    })),
  ];
}

/**
 * One head group: the tasks a page picked, in the order the page named them.
 *
 * An id no org answers for is left out here and nowhere else, so a task that
 * was archived or deleted drops out of every list by one rule.
 *
 * A group that sinks draws its finished members under its live ones, each half
 * keeping its rank. Nothing is written on a finish, so the sink happens as the
 * page draws and unfinishing a task gives it its place back. A plan does not
 * sink: a task finished today stays where the day put it. See ADR-0021.
 */
function head(byId: Map<string, LiveTask>, { key, ids, sinks = false }: HeadGroup): Group {
  const rows = ids.map((id) => byId.get(id)).filter((one) => one !== undefined);
  const tasks = sinks
    ? [...rows.filter((one) => !one.finished), ...rows.filter((one) => one.finished)]
    : rows;
  return { key, label: GROUP_LABEL[key], tasks, sinks };
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

/**
 * The columns to draw, in board order. The switches are `BOARD_TOGGLES`, the
 * same two the org board offers, and the rest is `ALWAYS_SHOWN`: this board
 * and the org board draw one list, not two that must stay equal.
 *
 * Backlog is a switch here and it is a rule on the org board. There the column
 * appears on its own when To do and In progress are both empty. Across every
 * org that reads "this person holds no live task anywhere", which is near
 * enough never, so the rule is dead and the switch is all there is.
 */
export function unifiedColumns(toggles: Toggles): Status[] {
  return [
    ...(toggles.backlog ? (["backlog"] as Status[]) : []),
    ...ALWAYS_SHOWN,
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

/** How far back Done and Cancelled reach on the unified board. */
const FINISHED_DAYS = 7;

/**
 * The earliest `finished_at` a finished task may carry and still be drawn.
 *
 * Done and Cancelled have no cap on the org board. Across every org they are
 * every task the person ever finished, so the unified board caps them to the
 * last week.
 *
 * The cap reads the finish time, not the last write of the row, so an edit to
 * a task finished in March does not drag it back into Done.
 */
export function finishedSince(day: string): string {
  const at = new Date(`${day}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() - FINISHED_DAYS);
  return at.toISOString();
}
