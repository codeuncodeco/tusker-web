import { describe, expect, it } from "vitest";

import { stepInColumn, stepped, STATUS_RUN } from "../app/board";

describe("the run a card steps along", () => {
  it("walks Backlog to To do to In progress to Done", () => {
    expect(STATUS_RUN).toEqual(["backlog", "todo", "in_progress", "done"]);
  });

  it("steps forward one column", () => {
    expect(stepped("backlog", 1)).toBe("todo");
    expect(stepped("todo", 1)).toBe("in_progress");
    expect(stepped("in_progress", 1)).toBe("done");
  });

  it("steps back one column", () => {
    expect(stepped("done", -1)).toBe("in_progress");
    expect(stepped("in_progress", -1)).toBe("todo");
    expect(stepped("todo", -1)).toBe("backlog");
  });

  it("stops at both ends", () => {
    expect(stepped("done", 1)).toBeNull();
    expect(stepped("backlog", -1)).toBeNull();
  });

  // An outcome is not the next step, so it costs a drag or the select.
  it("leaves a cancelled task where it is, both ways", () => {
    expect(stepped("cancelled", 1)).toBeNull();
    expect(stepped("cancelled", -1)).toBeNull();
  });
});

describe("the place a step inside a column names", () => {
  const ids = ["a", "b", "c", "d"];

  it("lands above the card overhead", () => {
    expect(stepInColumn(ids, 2, -1)).toEqual({ before: "b" });
  });

  it("lands above the card after the next one", () => {
    expect(stepInColumn(ids, 0, 1)).toEqual({ before: "c" });
  });

  // The card leaves its own place as it moves, so the second-last card has
  // nothing left below it to land above.
  it("names the bottom of the column for the second-last card", () => {
    expect(stepInColumn(ids, 2, 1)).toEqual({ before: null });
  });

  it("stops at both ends", () => {
    expect(stepInColumn(ids, 0, -1)).toBeNull();
    expect(stepInColumn(ids, 3, 1)).toBeNull();
  });

  it("has nowhere to step a card the column does not draw", () => {
    expect(stepInColumn(ids, -1, 1)).toBeNull();
    expect(stepInColumn(ids, -1, -1)).toBeNull();
  });
});
