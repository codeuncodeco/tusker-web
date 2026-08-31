import { describe, expect, it } from "vitest";

import { columnsToShow, type Status } from "../app/board";

/** A count for every status, with the ones a test names on top. */
function counts(some: Partial<Record<Status, number>>): Record<Status, number> {
  return { backlog: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0, ...some };
}

const off = { backlog: false, cancelled: false };

describe("which columns the board shows", () => {
  it("shows To do, In progress and Done, and nothing else", () => {
    expect(columnsToShow(counts({ todo: 1 }), off)).toEqual(["todo", "in_progress", "done"]);
  });

  it("shows Backlog while To do and In progress are both empty", () => {
    expect(columnsToShow(counts({ done: 3 }), off)).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "done",
    ]);
  });

  it("hides Backlog again as soon as To do holds a task", () => {
    expect(columnsToShow(counts({ backlog: 2, todo: 1 }), off)).not.toContain("backlog");
  });

  it("hides Backlog while In progress holds a task", () => {
    expect(columnsToShow(counts({ in_progress: 1 }), off)).not.toContain("backlog");
  });

  it("shows Backlog when the toggle is on, whatever the columns hold", () => {
    expect(columnsToShow(counts({ todo: 1 }), { ...off, backlog: true })[0]).toBe("backlog");
  });

  it("hides Cancelled until the toggle is on", () => {
    expect(columnsToShow(counts({ cancelled: 4, todo: 1 }), off)).not.toContain("cancelled");
    expect(columnsToShow(counts({ todo: 1 }), { ...off, cancelled: true })).toEqual([
      "todo",
      "in_progress",
      "done",
      "cancelled",
    ]);
  });
});
