import { describe, expect, it } from "vitest";

import { crossOver, landing, landingInOrg, settle } from "../app/drag";
import { whereOver } from "../app/drag-lists";

const board = { todo: [1, 2, 3], doing: [4, 5], done: [] };

describe("a card dragged over another list", () => {
  it("joins that list above the card it is over", () => {
    expect(crossOver(board, 1, 5, false)).toEqual({
      todo: [2, 3],
      doing: [4, 1, 5],
      done: [],
    });
  });

  it("joins below the card it is over when the pointer is past its middle", () => {
    expect(crossOver(board, 1, 5, true).doing).toEqual([4, 5, 1]);
  });

  it("joins at the foot when it is over the list and no card", () => {
    expect(crossOver(board, 1, "doing", false).doing).toEqual([4, 5, 1]);
    expect(crossOver(board, 1, "done", false).done).toEqual([1]);
  });

  it("answers with the same lists while it is over its own list", () => {
    expect(crossOver(board, 1, 3, false)).toBe(board);
    expect(crossOver(board, 1, "todo", false)).toBe(board);
  });

  it("answers with the same lists over nothing it knows", () => {
    expect(crossOver(board, 1, 9, false)).toBe(board);
    expect(crossOver(board, 9, 5, false)).toBe(board);
  });
});

describe("a card let go inside its list", () => {
  it("takes the place of the card it is over", () => {
    expect(settle(board, 1, 3).todo).toEqual([2, 3, 1]);
    expect(settle(board, 3, 1).todo).toEqual([3, 1, 2]);
  });

  it("stays where it is over the list itself, or over itself", () => {
    expect(settle(board, 1, "todo")).toBe(board);
    expect(settle(board, 1, 1)).toBe(board);
  });
});

describe("where a drop lands", () => {
  it("names the card just below the dragged one", () => {
    expect(landing([1, 2, 3], 1)).toBe(2);
  });

  it("names no card at the foot of the list", () => {
    expect(landing([1, 2, 3], 3)).toBeNull();
  });
});

describe("where a drop lands on a list of several orgs", () => {
  const org: Record<number, string> = { 1: "acme", 2: "blr", 3: "acme", 4: "blr", 6: "acme" };
  const orgOf = (id: number) => org[id];

  it("names the nearest card of the same org below the dragged one", () => {
    expect(landingInOrg([6, 2, 4, 3], 6, orgOf)).toBe(3);
  });

  it("names no card when no card of that org is below", () => {
    expect(landingInOrg([1, 6, 2, 4], 6, orgOf)).toBeNull();
  });

  it("names no card of the org above the dragged one", () => {
    expect(landingInOrg([1, 6], 6, orgOf)).toBeNull();
  });
});

describe("what a dragged card is over, on a board as long as its columns", () => {
  // Two columns side by side, each as tall as the board, as they are since the
  // page scrolls and no column does. To do holds a card at every height, and
  // Done holds one card at the top. See #191.
  const lists = { todo: [1, 2, 3], done: [9] };
  const rect = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
  const rects = new Map<string | number, ReturnType<typeof rect>>([
    ["todo", rect(0, 0, 300, 2000)],
    [1, rect(0, 0, 300, 60)],
    [2, rect(0, 600, 300, 60)],
    [3, rect(0, 1200, 300, 60)],
    ["done", rect(320, 0, 300, 2000)],
    [9, rect(320, 0, 300, 60)],
  ]);

  /** What the card is over when the pointer, and the copy under it, are at one point. */
  function overAt(x: number, y: number) {
    const collisions = whereOver(lists)({
      active: { id: 2 },
      collisionRect: rect(x - 150, y - 30, 300, 60),
      droppableRects: rects,
      droppableContainers: [...rects.keys()].map((id) => ({ id })),
      pointerCoordinates: { x, y },
    } as unknown as Parameters<ReturnType<typeof whereOver>>[0]);
    return collisions[0]?.id;
  }

  it("is the column the pointer is in, though a card of another sits closer", () => {
    // Done's own corners are far off, and To do's `c` is level with the
    // pointer. The pointer is in Done, so the card is over Done.
    expect(overAt(470, 1230)).toBe("done");
  });

  it("is the closest card of the column the pointer is in", () => {
    expect(overAt(470, 40)).toBe(9);
    expect(overAt(150, 1230)).toBe(3);
  });

  it("is the closest of everything when the pointer is in no column", () => {
    expect(overAt(310, 630)).toBe(2);
  });
});
