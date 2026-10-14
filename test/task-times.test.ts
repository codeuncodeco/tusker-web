/**
 * The times the task aside lists, and which of them it shows. See #218.
 */

import { describe, expect, it } from "vitest";

import { taskTimes } from "../app/task-times";

const MADE = "2026-10-01T09:00:00.000Z";
const EDITED = "2026-10-02T09:00:00.000Z";
const DONE = "2026-10-03T09:00:00.000Z";
const TICKED = "2026-10-04T09:00:00.000Z";
const SHELVED = "2026-10-05T09:00:00.000Z";

/** A task's stored times, open and never written since it was made. */
function stored(some: Partial<Parameters<typeof taskTimes>[0]> = {}) {
  return {
    created_at: MADE,
    updated_at: MADE,
    finished_at: null,
    archived_at: null,
    ...some,
  };
}

describe("the times a task lists", () => {
  it("lists Created alone on a task never written since it was made", () => {
    expect(taskTimes(stored())).toEqual([{ label: "Created", at: MADE }]);
  });

  it("lists Updated after Created once the task was written", () => {
    expect(taskTimes(stored({ updated_at: EDITED }))).toEqual([
      { label: "Created", at: MADE },
      { label: "Updated", at: EDITED },
    ]);
  });

  it("lists no Updated on a task whose last write was its finish", () => {
    expect(taskTimes(stored({ finished_at: DONE, updated_at: DONE }))).toEqual([
      { label: "Created", at: MADE },
      { label: "Finished", at: DONE },
    ]);
  });

  it("lists Updated after Finished when a box was ticked after the finish", () => {
    expect(taskTimes(stored({ finished_at: DONE, updated_at: TICKED }))).toEqual([
      { label: "Created", at: MADE },
      { label: "Finished", at: DONE },
      { label: "Updated", at: TICKED },
    ]);
  });

  it("lists Archived and never Updated on an archived task", () => {
    expect(
      taskTimes(stored({ finished_at: DONE, archived_at: SHELVED, updated_at: "2026-10-06T09:00:00.000Z" })),
    ).toEqual([
      { label: "Created", at: MADE },
      { label: "Finished", at: DONE },
      { label: "Archived", at: SHELVED },
    ]);
  });

  it("lists Updated again on a restored task, which holds no archive time", () => {
    expect(taskTimes(stored({ finished_at: DONE, updated_at: SHELVED }))).toEqual([
      { label: "Created", at: MADE },
      { label: "Finished", at: DONE },
      { label: "Updated", at: SHELVED },
    ]);
  });
});
