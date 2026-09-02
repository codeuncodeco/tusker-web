import { describe, expect, it } from "vitest";

import { stepped, STATUS_RUN } from "../app/board";

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
