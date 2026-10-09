import { describe, expect, it } from "vitest";

import { crossOver, landing, landingInOrg, settle } from "../app/drag";

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
