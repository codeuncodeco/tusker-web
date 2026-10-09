import { describe, expect, it } from "vitest";

import { BOARD_TOGGLES, readToggles } from "../app/board";
import {
  columnsFor,
  finishedSince,
  groupsFor,
  planGroups,
  inOrder,
  isPlannable,
  unifiedColumns,
  type LiveTask,
} from "../app/unified";
import type { TaskId } from "../app/task-number";

/** A row with only the parts the sort reads named. */
function live(some: Partial<LiveTask> & { id: TaskId }): LiveTask {
  return {
    org: { slug: "ada", name: "Ada", color: "blue" },
    title: String(some.id),
    status: "todo",
    due_date: null,
    percentile: 0.5,
    created_at: "2026-01-01T00:00:00.000Z",
    fields: [],
    assignees: [],
    finished: false,
    ...some,
  };
}

/** The ids the sort leaves in order. */
function sorted(...rows: LiveTask[]): TaskId[] {
  return [...rows].sort(inOrder).map((one) => one.id);
}

describe("the order inside a group", () => {
  it("puts the smaller percentile first", () => {
    expect(sorted(live({ id: 2, percentile: 0.9 }), live({ id: 1, percentile: 0.1 }))).toEqual([1, 2]);
  });

  it("breaks a tie on the due date, earliest first", () => {
    const rows = sorted(
      live({ id: 1, due_date: "2026-03-02" }),
      live({ id: 2, due_date: "2026-03-01" }),
    );
    expect(rows).toEqual([2, 1]);
  });

  it("sorts a dated task above an undated one", () => {
    expect(sorted(live({ id: 1 }), live({ id: 2, due_date: "2030-12-31" }))).toEqual([
      2,
      1,
    ]);
  });

  it("breaks a date tie on created_at, then on the id", () => {
    const rows = sorted(
      live({ id: 3, created_at: "2026-01-02T00:00:00.000Z" }),
      live({ id: 2, created_at: "2026-01-01T00:00:00.000Z" }),
      live({ id: 1, created_at: "2026-01-01T00:00:00.000Z" }),
    );
    expect(rows).toEqual([1, 2, 3]);
  });

  it("does not let an overdue task jump the list", () => {
    const rows = sorted(
      live({ id: 1, percentile: 0.9, due_date: "2020-01-01" }),
      live({ id: 3, percentile: 0.1 }),
    );
    expect(rows).toEqual([3, 1]);
  });

  it("gives the same order whatever order the rows arrive in", () => {
    const rows = [
      live({ id: 1, percentile: 0.2 }),
      live({ id: 2, percentile: 0.2, due_date: "2026-05-01" }),
      live({ id: 3, percentile: 0.1 }),
    ];
    expect(sorted(...rows)).toEqual(sorted(...[...rows].reverse()));
  });
});

describe("the groups", () => {
  it("draws Today, In progress and To do, in that order", () => {
    const groups = groupsFor([live({ id: 1 })], []);
    expect(groups.map((one) => one.key)).toEqual(["today", "in_progress", "todo"]);
  });

  it("holds the plan in plan order, whatever the sort would say", () => {
    const tasks = [live({ id: 1, percentile: 0.1 }), live({ id: 2, percentile: 0.9 })];
    const [today] = groupsFor(tasks, [2, 1]);
    expect(today.tasks.map((one) => one.id)).toEqual([2, 1]);
  });

  it("draws a planned task in Today and nowhere else", () => {
    const tasks = [live({ id: 1 }), live({ id: 2, status: "in_progress" })];
    const [today, inProgress, todo] = groupsFor(tasks, [1, 2]);
    expect(today.tasks.map((one) => one.id)).toEqual([1, 2]);
    expect(inProgress.tasks).toEqual([]);
    expect(todo.tasks).toEqual([]);
  });

  it("splits the rest by status", () => {
    const tasks = [live({ id: 1 }), live({ id: 2, status: "in_progress" })];
    const [, inProgress, todo] = groupsFor(tasks, []);
    expect(inProgress.tasks.map((one) => one.id)).toEqual([2]);
    expect(todo.tasks.map((one) => one.id)).toEqual([1]);
  });

  it("keeps a planned task the person finished today in Today", () => {
    const [today] = groupsFor([live({ id: 1, status: "done", finished: true })], [1]);
    expect(today.tasks.map((one) => [one.id, one.finished])).toEqual([[1, true]]);
  });

  it("drops a planned task the org no longer holds", () => {
    const [today] = groupsFor([live({ id: 1 })], [1, 99]);
    expect(today.tasks.map((one) => one.id)).toEqual([1]);
  });
});

describe("the groups plan mode draws", () => {
  it("draws the plan, this week, In progress and To do, in that order", () => {
    const groups = planGroups([live({ id: 1 })], [], []);
    expect(groups.map((one) => one.key)).toEqual(["today", "week", "in_progress", "todo"]);
  });

  it("draws the week set in week order, whatever the columns sort like", () => {
    const tasks = [live({ id: 1, percentile: 0.9 }), live({ id: 2, percentile: 0.1 })];
    const [, week] = planGroups(tasks, [], [1, 2]);
    expect(week.tasks.map((one) => one.id)).toEqual([1, 2]);
  });

  // The week page sinks a finished member; a plan keeps one where the day put
  // it. See ADR-0021.
  it("sinks a finished member of the week set under the live ones", () => {
    const tasks = [live({ id: 1, status: "done", finished: true }), live({ id: 2 })];
    const [, week] = planGroups(tasks, [], [1, 2]);
    expect(week.tasks.map((one) => one.id)).toEqual([2, 1]);
  });

  it("draws a task the plan holds in the plan and not in the week", () => {
    const tasks = [live({ id: 1 }), live({ id: 2 })];
    const [today, week] = planGroups(tasks, [1], [1, 2]);
    expect(today.tasks.map((one) => one.id)).toEqual([1]);
    expect(week.tasks.map((one) => one.id)).toEqual([2]);
  });

  it("leaves the rest of the live set under its own headings", () => {
    const tasks = [live({ id: 1 }), live({ id: 2, status: "in_progress" }), live({ id: 3 })];
    const [, , inProgress, todo] = planGroups(tasks, [1], []);
    expect(inProgress.tasks.map((one) => one.id)).toEqual([2]);
    expect(todo.tasks.map((one) => one.id)).toEqual([3]);
  });

  it("keeps the plan in plan order", () => {
    const tasks = [live({ id: 1, percentile: 0.1 }), live({ id: 2, percentile: 0.9 })];
    const [today] = planGroups(tasks, [2, 1], [1, 2]);
    expect(today.tasks.map((one) => one.id)).toEqual([2, 1]);
  });

  it("drops a member no org answers for", () => {
    const [, week] = planGroups([live({ id: 1 })], [], [1, 99]);
    expect(week.tasks.map((one) => one.id)).toEqual([1]);
  });
});

describe("the columns of the unified board", () => {
  const off = { backlog: false, cancelled: false };

  it("always draws To do, In progress and Done", () => {
    expect(unifiedColumns(off)).toEqual(["todo", "in_progress", "done"]);
  });

  it("draws all five in board order when both switches are on", () => {
    expect(unifiedColumns({ backlog: true, cancelled: true })).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "done",
      "cancelled",
    ]);
  });

  it("draws Backlog on the switch alone, and by no rule of its own", () => {
    expect(unifiedColumns(off)).not.toContain("backlog");
    expect(unifiedColumns({ ...off, backlog: true })).toContain("backlog");
  });

  it("takes no switch over Done, so a `done` in the address changes nothing", () => {
    expect(unifiedColumns({ ...off, done: true })).toEqual(unifiedColumns(off));
  });

  it("offers the two switches both boards offer", () => {
    expect(BOARD_TOGGLES).toEqual(["backlog", "cancelled"]);
  });

  it("reads each switch out of the query string", () => {
    expect(readToggles(new URLSearchParams("?backlog=1&cancelled=1"), BOARD_TOGGLES)).toEqual({
      backlog: true,
      cancelled: true,
    });
  });

  it("puts each task in the column its status names, in the sort order", () => {
    const columns = columnsFor(
      [
        live({ id: 1, percentile: 0.9 }),
        live({ id: 2, status: "in_progress" }),
        live({ id: 3, percentile: 0.1 }),
      ],
      ["todo", "in_progress"],
    );

    expect(columns.map((one) => [one.status, one.tasks.map((task) => task.id)])).toEqual([
      ["todo", [3, 1]],
      ["in_progress", [2]],
    ]);
  });

  it("names a column the way the org board names it", () => {
    expect(columnsFor([], ["in_progress"])[0].label).toBe("In progress");
  });
});

describe("the seven-day cap", () => {
  it("reaches back a week from the day the person is in", () => {
    expect(finishedSince("2026-09-01")).toBe("2026-08-25T00:00:00.000Z");
  });

  it("crosses a month and a year end", () => {
    expect(finishedSince("2026-01-03")).toBe("2025-12-27T00:00:00.000Z");
  });
});

describe("what a plan can hold", () => {
  it("takes a To do or an In progress task", () => {
    expect(isPlannable(live({ id: 1 }))).toBe(true);
    expect(isPlannable(live({ id: 2, status: "in_progress" }))).toBe(true);
  });

  it("takes no Backlog, Done or Cancelled task", () => {
    expect(isPlannable(live({ id: 1, status: "backlog" }))).toBe(false);
    expect(isPlannable(live({ id: 2, status: "done" }))).toBe(false);
    expect(isPlannable(live({ id: 3, status: "cancelled" }))).toBe(false);
  });
});
