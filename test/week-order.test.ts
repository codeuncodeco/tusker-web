import { describe, expect, it } from "vitest";

import { movedInSet, type Member } from "../app/week-order";

/** One membership, live unless the test says it is finished. */
function member(taskId: number, position: number, finished = false): Member {
  return { taskId, position, finished };
}

/** Three live members, one apart, as a backfilled set holds them. */
const SET = [member(1, 1), member(2, 2), member(3, 3)];

describe("stepping a member of a week set", () => {
  it("swaps the positions of the member and the one above it", () => {
    expect(movedInSet(SET, 2, "up")).toEqual([
      { taskId: 2, position: 1 },
      { taskId: 1, position: 2 },
    ]);
  });

  it("swaps the positions of the member and the one below it", () => {
    expect(movedInSet(SET, 2, "down")).toEqual([
      { taskId: 2, position: 3 },
      { taskId: 3, position: 2 },
    ]);
  });

  it("writes nothing for a step off the top", () => {
    expect(movedInSet(SET, 1, "up")).toEqual([]);
  });

  it("writes nothing for a step off the foot", () => {
    expect(movedInSet(SET, 3, "down")).toEqual([]);
  });

  it("writes nothing for a task the set does not hold", () => {
    expect(movedInSet(SET, 99, "up")).toEqual([]);
  });

  it("keeps the fractions a set already holds, so no other row is touched", () => {
    const tight = [member(1, 1), member(2, 1.5), member(3, 3)];

    expect(movedInSet(tight, 3, "up")).toEqual([
      { taskId: 3, position: 1.5 },
      { taskId: 2, position: 3 },
    ]);
  });
});

describe("promoting a member of a week set", () => {
  it("takes one step past the first, so nothing else is renumbered", () => {
    expect(movedInSet(SET, 3, "top")).toEqual([{ taskId: 3, position: 0 }]);
  });

  it("writes nothing for the member already on top", () => {
    expect(movedInSet(SET, 1, "top")).toEqual([]);
  });

  it("clears a set that has already been promoted into", () => {
    const promoted = [member(3, 0), member(1, 1), member(2, 2)];

    expect(movedInSet(promoted, 2, "top")).toEqual([{ taskId: 2, position: -1 }]);
  });
});

describe("a finished member", () => {
  // The page sinks it under the live ones and never re-ranks it, so a step
  // that swapped with it would move a row nobody sees move.
  it("takes no step and no promote of its own", () => {
    const set = [member(1, 1), member(4, 2, true), member(3, 3)];

    expect(movedInSet(set, 4, "up")).toEqual([]);
    expect(movedInSet(set, 4, "down")).toEqual([]);
    expect(movedInSet(set, 4, "top")).toEqual([]);
  });

  it("is read past, so a step lands on the live row a person sees", () => {
    const set = [member(1, 1), member(4, 2, true), member(3, 3)];

    expect(movedInSet(set, 3, "up")).toEqual([
      { taskId: 3, position: 1 },
      { taskId: 1, position: 3 },
    ]);
  });

  it("is no floor to step onto, so the last live member holds still", () => {
    const set = [member(1, 1), member(2, 2), member(4, 3, true)];

    expect(movedInSet(set, 2, "down")).toEqual([]);
  });

  it("is no ceiling either: the first live member is already on top", () => {
    const set = [member(4, 1, true), member(1, 2), member(2, 3)];

    expect(movedInSet(set, 1, "top")).toEqual([]);
    expect(movedInSet(set, 1, "up")).toEqual([]);
    // And a promote from below still clears every position there is.
    expect(movedInSet(set, 2, "top")).toEqual([{ taskId: 2, position: 0 }]);
  });
});

describe("sinking a member of a week set", () => {
  it("takes one step past the last, so nothing else is renumbered", () => {
    expect(movedInSet(SET, 1, "bottom")).toEqual([{ taskId: 1, position: 4 }]);
  });

  it("writes nothing for the member already at the foot", () => {
    expect(movedInSet(SET, 3, "bottom")).toEqual([]);
  });

  it("writes nothing for a task the set does not hold", () => {
    expect(movedInSet(SET, 99, "bottom")).toEqual([]);
  });

  // The page draws a finished member under the live ones, so the last live
  // member is the last row a person sees, whatever sits below it in store.
  it("reads the last live member as the foot, and sinks past the stored last", () => {
    const set = [member(1, 1), member(2, 2), member(4, 3, true)];

    expect(movedInSet(set, 2, "bottom")).toEqual([]);
    expect(movedInSet(set, 1, "bottom")).toEqual([{ taskId: 1, position: 4 }]);
  });

  it("takes no sink of its own from a finished member", () => {
    const set = [member(1, 1), member(4, 2, true), member(3, 3)];

    expect(movedInSet(set, 4, "bottom")).toEqual([]);
  });
});
