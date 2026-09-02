import { describe, expect, it } from "vitest";

import { readToggles } from "../app/board";
import {
  columnsFor,
  finishedSince,
  groupsFor,
  inOrder,
  isPlannable,
  unifiedColumns,
  UNIFIED_TOGGLES,
  type LiveTask,
} from "../app/unified";

/** A row with only the parts the sort reads named. */
function live(some: Partial<LiveTask> & { id: string }): LiveTask {
  return {
    org: { slug: "ada", name: "Ada" },
    title: some.id,
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
function sorted(...rows: LiveTask[]): string[] {
  return [...rows].sort(inOrder).map((one) => one.id);
}

describe("the order inside a group", () => {
  it("puts the smaller percentile first", () => {
    expect(sorted(live({ id: "b", percentile: 0.9 }), live({ id: "a", percentile: 0.1 }))).toEqual(["a", "b"]);
  });

  it("breaks a tie on the due date, earliest first", () => {
    const rows = sorted(
      live({ id: "late", due_date: "2026-03-02" }),
      live({ id: "soon", due_date: "2026-03-01" }),
    );
    expect(rows).toEqual(["soon", "late"]);
  });

  it("sorts a dated task above an undated one", () => {
    expect(sorted(live({ id: "none" }), live({ id: "dated", due_date: "2030-12-31" }))).toEqual([
      "dated",
      "none",
    ]);
  });

  it("breaks a date tie on created_at, then on the id", () => {
    const rows = sorted(
      live({ id: "z", created_at: "2026-01-02T00:00:00.000Z" }),
      live({ id: "b", created_at: "2026-01-01T00:00:00.000Z" }),
      live({ id: "a", created_at: "2026-01-01T00:00:00.000Z" }),
    );
    expect(rows).toEqual(["a", "b", "z"]);
  });

  it("does not let an overdue task jump the list", () => {
    const rows = sorted(
      live({ id: "overdue", percentile: 0.9, due_date: "2020-01-01" }),
      live({ id: "first", percentile: 0.1 }),
    );
    expect(rows).toEqual(["first", "overdue"]);
  });

  it("gives the same order whatever order the rows arrive in", () => {
    const rows = [
      live({ id: "a", percentile: 0.2 }),
      live({ id: "b", percentile: 0.2, due_date: "2026-05-01" }),
      live({ id: "c", percentile: 0.1 }),
    ];
    expect(sorted(...rows)).toEqual(sorted(...[...rows].reverse()));
  });
});

describe("the groups", () => {
  it("draws Today, In progress and To do, in that order", () => {
    const groups = groupsFor([live({ id: "a" })], []);
    expect(groups.map((one) => one.key)).toEqual(["today", "in_progress", "todo"]);
  });

  it("holds the plan in plan order, whatever the sort would say", () => {
    const tasks = [live({ id: "a", percentile: 0.1 }), live({ id: "b", percentile: 0.9 })];
    const [today] = groupsFor(tasks, ["b", "a"]);
    expect(today.tasks.map((one) => one.id)).toEqual(["b", "a"]);
  });

  it("draws a planned task in Today and nowhere else", () => {
    const tasks = [live({ id: "a" }), live({ id: "b", status: "in_progress" })];
    const [today, inProgress, todo] = groupsFor(tasks, ["a", "b"]);
    expect(today.tasks.map((one) => one.id)).toEqual(["a", "b"]);
    expect(inProgress.tasks).toEqual([]);
    expect(todo.tasks).toEqual([]);
  });

  it("splits the rest by status", () => {
    const tasks = [live({ id: "a" }), live({ id: "b", status: "in_progress" })];
    const [, inProgress, todo] = groupsFor(tasks, []);
    expect(inProgress.tasks.map((one) => one.id)).toEqual(["b"]);
    expect(todo.tasks.map((one) => one.id)).toEqual(["a"]);
  });

  it("keeps a planned task the person finished today in Today", () => {
    const [today] = groupsFor([live({ id: "a", status: "done", finished: true })], ["a"]);
    expect(today.tasks.map((one) => [one.id, one.finished])).toEqual([["a", true]]);
  });

  it("drops a planned task the org no longer holds", () => {
    const [today] = groupsFor([live({ id: "a" })], ["a", "gone"]);
    expect(today.tasks.map((one) => one.id)).toEqual(["a"]);
  });
});

describe("the columns of the unified board", () => {
  const off = { backlog: false, done: false, cancelled: false };

  it("always draws To do and In progress", () => {
    expect(unifiedColumns(off)).toEqual(["todo", "in_progress"]);
  });

  it("draws all five in board order when every toggle is on", () => {
    expect(unifiedColumns({ backlog: true, done: true, cancelled: true })).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "done",
      "cancelled",
    ]);
  });

  it("draws Backlog on the toggle alone, and by no rule of its own", () => {
    expect(unifiedColumns(off)).not.toContain("backlog");
    expect(unifiedColumns({ ...off, backlog: true })).toContain("backlog");
  });

  it("reads each toggle out of the query string", () => {
    expect(readToggles(new URLSearchParams("?backlog=1&cancelled=1"), UNIFIED_TOGGLES)).toEqual({
      backlog: true,
      done: false,
      cancelled: true,
    });
  });

  it("puts each task in the column its status names, in the sort order", () => {
    const columns = columnsFor(
      [
        live({ id: "second", percentile: 0.9 }),
        live({ id: "running", status: "in_progress" }),
        live({ id: "first", percentile: 0.1 }),
      ],
      ["todo", "in_progress"],
    );

    expect(columns.map((one) => [one.status, one.tasks.map((task) => task.id)])).toEqual([
      ["todo", ["first", "second"]],
      ["in_progress", ["running"]],
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
    expect(isPlannable(live({ id: "a" }))).toBe(true);
    expect(isPlannable(live({ id: "b", status: "in_progress" }))).toBe(true);
  });

  it("takes no Backlog, Done or Cancelled task", () => {
    expect(isPlannable(live({ id: "a", status: "backlog" }))).toBe(false);
    expect(isPlannable(live({ id: "b", status: "done" }))).toBe(false);
    expect(isPlannable(live({ id: "c", status: "cancelled" }))).toBe(false);
  });
});
