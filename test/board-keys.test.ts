import { describe, expect, it } from "vitest";

import { boardPress, type KeyedColumn } from "../app/board-keys";

/** A board of three columns, the way the loader hands them over. */
const COLUMNS: KeyedColumn[] = [
  { status: "todo", ids: [1, 2, 3] },
  { status: "in_progress", ids: [4] },
  { status: "done", ids: [5] },
];

describe("the cursor", () => {
  it("walks the whole board, column by column", () => {
    expect(boardPress("j", COLUMNS, 3)).toEqual({ act: "on", id: 4 });
    expect(boardPress("k", COLUMNS, 4)).toEqual({ act: "on", id: 3 });
  });

  it("stops at both ends", () => {
    expect(boardPress("k", COLUMNS, 1)).toEqual({ act: "on", id: 1 });
    expect(boardPress("j", COLUMNS, 5)).toEqual({ act: "on", id: 5 });
  });

  it("comes back from outside the list, in the way of the key", () => {
    expect(boardPress("j", COLUMNS, null)).toEqual({ act: "on", id: 1 });
    expect(boardPress("k", COLUMNS, null)).toEqual({ act: "on", id: 5 });
  });

  it("has nothing to move on an empty board", () => {
    expect(boardPress("j", [], null)).toBeNull();
    expect(boardPress("k", [], null)).toBeNull();
  });
});

describe("Escape", () => {
  it("takes the cursor off the board", () => {
    expect(boardPress("Escape", COLUMNS, 2)).toEqual({ act: "on", id: null });
  });

  // The header menu and the decision prompt read Escape too. A cursor that
  // names no card has nothing to clear, so the press stays theirs.
  it("answers nothing where the cursor already names none", () => {
    expect(boardPress("Escape", COLUMNS, null)).toBeNull();
  });
});

describe("the keys that need a card", () => {
  it("does nothing where the cursor names no card", () => {
    for (const key of ["Enter", ">", "<", "x", "J", "K"]) {
      expect(boardPress(key, COLUMNS, null)).toBeNull();
    }
  });

  it("does nothing for a key the board does not bind", () => {
    expect(boardPress("q", COLUMNS, 1)).toBeNull();
  });
});

describe("Enter", () => {
  it("opens the card the cursor names", () => {
    expect(boardPress("Enter", COLUMNS, 2)).toEqual({ act: "open", id: 2 });
  });
});

describe("the run keys", () => {
  it("walks the card one column along, to the bottom of it", () => {
    expect(boardPress(">", COLUMNS, 1)).toEqual({
      act: "move",
      id: 1,
      status: "in_progress",
    });
    expect(boardPress("<", COLUMNS, 4)).toEqual({
      act: "move",
      id: 4,
      status: "todo",
    });
  });

  it("reaches Backlog, which the board may not be showing", () => {
    expect(boardPress("<", [{ status: "todo", ids: [1] }], 1)).toEqual({
      act: "move",
      id: 1,
      status: "backlog",
    });
  });

  it("stops at the end of the run", () => {
    expect(boardPress(">", COLUMNS, 5)).toBeNull();
  });

  it("leaves a cancelled card where it is", () => {
    const columns: KeyedColumn[] = [{ status: "cancelled", ids: [9] }];
    expect(boardPress(">", columns, 9)).toBeNull();
    expect(boardPress("<", columns, 9)).toBeNull();
  });
});

describe("x", () => {
  it("finishes the card, at the bottom of Done", () => {
    expect(boardPress("x", COLUMNS, 2)).toEqual({
      act: "move",
      id: 2,
      status: "done",
    });
  });

  it("has nothing to finish in Done or in Cancelled", () => {
    expect(boardPress("x", COLUMNS, 5)).toBeNull();
    expect(boardPress("x", [{ status: "cancelled", ids: [9] }], 9)).toBeNull();
  });
});

describe("the step keys", () => {
  // The step names no place: the server reads the card it lands above out of
  // the order as it stands, because the page's copy is one load old.
  it("steps the card up its own column", () => {
    expect(boardPress("K", COLUMNS, 2)).toEqual({ act: "step", id: 2, way: "up" });
  });

  it("steps the card down its own column", () => {
    expect(boardPress("J", COLUMNS, 1)).toEqual({ act: "step", id: 1, way: "down" });
  });

  it("stops at both ends of the column", () => {
    expect(boardPress("K", COLUMNS, 1)).toBeNull();
    expect(boardPress("J", COLUMNS, 3)).toBeNull();
    expect(boardPress("J", COLUMNS, 4)).toBeNull();
    expect(boardPress("K", COLUMNS, 4)).toBeNull();
  });
});
