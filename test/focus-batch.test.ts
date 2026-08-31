import { describe, expect, it } from "vitest";

import { batchOf, BATCH } from "../app/focus";
import type { LiveTask } from "../app/unified";

/** A row with only the parts the batch rule reads named. */
function live(id: string, finished = false): LiveTask {
  return {
    id,
    org: { slug: "ada", name: "Ada" },
    title: id,
    status: finished ? "done" : "todo",
    due_date: null,
    percentile: 0.5,
    created_at: "2026-01-01T00:00:00.000Z",
    fields: [],
    finished,
  };
}

/** The ids one batch holds. */
function ids(tasks: LiveTask[]): string[] {
  return tasks.map((one) => one.id);
}

describe("the batch", () => {
  it("takes three", () => {
    expect(BATCH).toBe(3);
    const batch = batchOf([live("a"), live("b"), live("c"), live("d")]);
    expect(ids(batch.tasks)).toEqual(["a", "b", "c"]);
  });

  it("holds the batch while one of its tasks is unfinished", () => {
    const batch = batchOf([live("a", true), live("b", true), live("c"), live("d")]);
    expect(ids(batch.tasks)).toEqual(["a", "b", "c"]);
  });

  it("shows the next batch once the batch holds no unfinished task", () => {
    const batch = batchOf([
      live("a", true),
      live("b", true),
      live("c", true),
      live("d"),
      live("e"),
    ]);
    expect(ids(batch.tasks)).toEqual(["d", "e"]);
    expect(batch.number).toBe(2);
  });

  it("shows what there is, under three", () => {
    expect(ids(batchOf([live("a"), live("b")]).tasks)).toEqual(["a", "b"]);
  });

  it("hides every other task, and counts them", () => {
    const batch = batchOf([live("a"), live("b"), live("c"), live("d"), live("e")]);
    expect(batch.left).toBe(2);
  });

  it("answers with no batch at all when every task is finished", () => {
    expect(batchOf([live("a", true), live("b", true)])).toEqual({
      tasks: [],
      number: 0,
      left: 0,
    });
  });

  it("answers with no batch at all for no task at all", () => {
    expect(batchOf([])).toEqual({ tasks: [], number: 0, left: 0 });
  });
});
