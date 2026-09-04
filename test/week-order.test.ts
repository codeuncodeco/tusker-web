import { describe, expect, it } from "vitest";

import { movedInSet, type Member } from "../app/week-order";

/** One membership, live unless the test says it is finished. */
function member(taskId: string, position: number, finished = false): Member {
  return { taskId, position, finished };
}

/** Three live members, one apart, as a backfilled set holds them. */
const SET = [member("a", 1), member("b", 2), member("c", 3)];

describe("stepping a member of a week set", () => {
  it("swaps the positions of the member and the one above it", () => {
    expect(movedInSet(SET, "b", "up")).toEqual([
      { taskId: "b", position: 1 },
      { taskId: "a", position: 2 },
    ]);
  });

  it("swaps the positions of the member and the one below it", () => {
    expect(movedInSet(SET, "b", "down")).toEqual([
      { taskId: "b", position: 3 },
      { taskId: "c", position: 2 },
    ]);
  });

  it("writes nothing for a step off the top", () => {
    expect(movedInSet(SET, "a", "up")).toEqual([]);
  });

  it("writes nothing for a step off the foot", () => {
    expect(movedInSet(SET, "c", "down")).toEqual([]);
  });

  it("writes nothing for a task the set does not hold", () => {
    expect(movedInSet(SET, "elsewhere", "up")).toEqual([]);
  });

  it("keeps the fractions a set already holds, so no other row is touched", () => {
    const tight = [member("a", 1), member("b", 1.5), member("c", 3)];

    expect(movedInSet(tight, "c", "up")).toEqual([
      { taskId: "c", position: 1.5 },
      { taskId: "b", position: 3 },
    ]);
  });
});

describe("promoting a member of a week set", () => {
  it("takes one step past the first, so nothing else is renumbered", () => {
    expect(movedInSet(SET, "c", "top")).toEqual([{ taskId: "c", position: 0 }]);
  });

  it("writes nothing for the member already on top", () => {
    expect(movedInSet(SET, "a", "top")).toEqual([]);
  });

  it("clears a set that has already been promoted into", () => {
    const promoted = [member("c", 0), member("a", 1), member("b", 2)];

    expect(movedInSet(promoted, "b", "top")).toEqual([{ taskId: "b", position: -1 }]);
  });
});

describe("a finished member", () => {
  // The page sinks it under the live ones and never re-ranks it, so a step
  // that swapped with it would move a row nobody sees move.
  it("takes no step and no promote of its own", () => {
    const set = [member("a", 1), member("done", 2, true), member("c", 3)];

    expect(movedInSet(set, "done", "up")).toEqual([]);
    expect(movedInSet(set, "done", "down")).toEqual([]);
    expect(movedInSet(set, "done", "top")).toEqual([]);
  });

  it("is read past, so a step lands on the live row a person sees", () => {
    const set = [member("a", 1), member("done", 2, true), member("c", 3)];

    expect(movedInSet(set, "c", "up")).toEqual([
      { taskId: "c", position: 1 },
      { taskId: "a", position: 3 },
    ]);
  });

  it("is no floor to step onto, so the last live member holds still", () => {
    const set = [member("a", 1), member("b", 2), member("done", 3, true)];

    expect(movedInSet(set, "b", "down")).toEqual([]);
  });

  it("is no ceiling either: the first live member is already on top", () => {
    const set = [member("done", 1, true), member("a", 2), member("b", 3)];

    expect(movedInSet(set, "a", "top")).toEqual([]);
    expect(movedInSet(set, "a", "up")).toEqual([]);
    // And a promote from below still clears every position there is.
    expect(movedInSet(set, "b", "top")).toEqual([{ taskId: "b", position: 0 }]);
  });
});

describe("sinking a member of a week set", () => {
  it("takes one step past the last, so nothing else is renumbered", () => {
    expect(movedInSet(SET, "a", "bottom")).toEqual([{ taskId: "a", position: 4 }]);
  });

  it("writes nothing for the member already at the foot", () => {
    expect(movedInSet(SET, "c", "bottom")).toEqual([]);
  });

  it("writes nothing for a task the set does not hold", () => {
    expect(movedInSet(SET, "elsewhere", "bottom")).toEqual([]);
  });

  // The page draws a finished member under the live ones, so the last live
  // member is the last row a person sees, whatever sits below it in store.
  it("reads the last live member as the foot, and sinks past the stored last", () => {
    const set = [member("a", 1), member("b", 2), member("done", 3, true)];

    expect(movedInSet(set, "b", "bottom")).toEqual([]);
    expect(movedInSet(set, "a", "bottom")).toEqual([{ taskId: "a", position: 4 }]);
  });

  it("takes no sink of its own from a finished member", () => {
    const set = [member("a", 1), member("done", 2, true), member("c", 3)];

    expect(movedInSet(set, "done", "bottom")).toEqual([]);
  });
});
