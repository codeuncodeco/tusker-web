import { describe, expect, it } from "vitest";

import { crossOver, landing, landingInOrg, settle } from "../app/drag";
import { whereOver } from "../app/drag-lists";

const board = { todo: ["a", "b", "c"], doing: ["d", "e"], done: [] };

describe("a card dragged over another list", () => {
  it("joins that list above the card it is over", () => {
    expect(crossOver(board, "a", "e", false)).toEqual({
      todo: ["b", "c"],
      doing: ["d", "a", "e"],
      done: [],
    });
  });

  it("joins below the card it is over when the pointer is past its middle", () => {
    expect(crossOver(board, "a", "e", true).doing).toEqual(["d", "e", "a"]);
  });

  it("joins at the foot when it is over the list and no card", () => {
    expect(crossOver(board, "a", "doing", false).doing).toEqual(["d", "e", "a"]);
    expect(crossOver(board, "a", "done", false).done).toEqual(["a"]);
  });

  it("answers with the same lists while it is over its own list", () => {
    expect(crossOver(board, "a", "c", false)).toBe(board);
    expect(crossOver(board, "a", "todo", false)).toBe(board);
  });

  it("answers with the same lists over nothing it knows", () => {
    expect(crossOver(board, "a", "z", false)).toBe(board);
    expect(crossOver(board, "z", "e", false)).toBe(board);
  });
});

describe("a card let go inside its list", () => {
  it("takes the place of the card it is over", () => {
    expect(settle(board, "a", "c").todo).toEqual(["b", "c", "a"]);
    expect(settle(board, "c", "a").todo).toEqual(["c", "a", "b"]);
  });

  it("stays where it is over the list itself, or over itself", () => {
    expect(settle(board, "a", "todo")).toBe(board);
    expect(settle(board, "a", "a")).toBe(board);
  });
});

describe("where a drop lands", () => {
  it("names the card just below the dragged one", () => {
    expect(landing(["a", "b", "c"], "a")).toBe("b");
  });

  it("names no card at the foot of the list", () => {
    expect(landing(["a", "b", "c"], "c")).toBeNull();
  });
});

describe("where a drop lands on a list of several orgs", () => {
  const org: Record<string, string> = { a: "acme", b: "blr", c: "acme", d: "blr", x: "acme" };
  const orgOf = (id: string) => org[id];

  it("names the nearest card of the same org below the dragged one", () => {
    expect(landingInOrg(["x", "b", "d", "c"], "x", orgOf)).toBe("c");
  });

  it("names no card when no card of that org is below", () => {
    expect(landingInOrg(["a", "x", "b", "d"], "x", orgOf)).toBeNull();
  });

  it("names no card of the org above the dragged one", () => {
    expect(landingInOrg(["a", "x"], "x", orgOf)).toBeNull();
  });
});

describe("what a dragged card is over, on a board as long as its columns", () => {
  // Two columns side by side, each as tall as the board, as they are since the
  // page scrolls and no column does. To do holds a card at every height, and
  // Done holds one card at the top. See #191.
  const lists = { todo: ["a", "b", "c"], done: ["z"] };
  const rect = (left: number, top: number, width: number, height: number) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  });
  const rects = new Map([
    ["todo", rect(0, 0, 300, 2000)],
    ["a", rect(0, 0, 300, 60)],
    ["b", rect(0, 600, 300, 60)],
    ["c", rect(0, 1200, 300, 60)],
    ["done", rect(320, 0, 300, 2000)],
    ["z", rect(320, 0, 300, 60)],
  ]);

  /** What the card is over when the pointer, and the copy under it, are at one point. */
  function overAt(x: number, y: number) {
    const collisions = whereOver(lists)({
      active: { id: "b" },
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
    expect(overAt(470, 40)).toBe("z");
    expect(overAt(150, 1230)).toBe("c");
  });

  it("is the closest of everything when the pointer is in no column", () => {
    expect(overAt(310, 630)).toBe("b");
  });
});
