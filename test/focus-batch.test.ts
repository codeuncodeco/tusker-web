import { describe, expect, it } from "vitest";

import { batchOf, BATCH } from "../app/focus";
import type { LiveTask } from "../app/unified";

/** A row with only the parts the batch rule reads named. */
function live(id: number, finished = false): LiveTask {
  return {
    id,
    org: { slug: "ada", name: "Ada", color: "blue" },
    title: `Task ${id}`,
    status: finished ? "done" : "todo",
    due_date: null,
    percentile: 0.5,
    created_at: "2026-01-01T00:00:00.000Z",
    fields: [],
    assignees: [],
    finished,
  };
}

/** The ids one batch holds. */
function ids(tasks: LiveTask[]): number[] {
  return tasks.map((one) => one.id);
}

describe("the batch", () => {
  it("takes three", () => {
    expect(BATCH).toBe(3);
    const batch = batchOf([live(1), live(2), live(3), live(4)]);
    expect(ids(batch.tasks)).toEqual([1, 2, 3]);
  });

  it("holds the batch while one of its tasks is unfinished", () => {
    const batch = batchOf([live(1, true), live(2, true), live(3), live(4)]);
    expect(ids(batch.tasks)).toEqual([1, 2, 3]);
  });

  it("shows the next batch once the batch holds no unfinished task", () => {
    const batch = batchOf([
      live(1, true),
      live(2, true),
      live(3, true),
      live(4),
      live(5),
    ]);
    expect(ids(batch.tasks)).toEqual([4, 5]);
    expect(batch.number).toBe(2);
  });

  it("shows what there is, under three", () => {
    expect(ids(batchOf([live(1), live(2)]).tasks)).toEqual([1, 2]);
  });

  it("hides every other task, and counts them", () => {
    const batch = batchOf([live(1), live(2), live(3), live(4), live(5)]);
    expect(batch.left).toBe(2);
  });

  it("answers with no batch at all when every task is finished", () => {
    expect(batchOf([live(1, true), live(2, true)])).toEqual({
      tasks: [],
      number: 0,
      left: 0,
    });
  });

  it("answers with no batch at all for no task at all", () => {
    expect(batchOf([])).toEqual({ tasks: [], number: 0, left: 0 });
  });
});
