import { describe, expect, it } from "vitest";

import { boardPress, type KeyedColumn } from "../app/board-keys";

/** A board of three columns, the way the loader hands them over. */
const COLUMNS: KeyedColumn[] = [
  { status: "todo", ids: ["a", "b", "c"] },
  { status: "in_progress", ids: ["d"] },
  { status: "done", ids: ["e"] },
];

describe("the cursor", () => {
  it("walks the whole board, column by column", () => {
    expect(boardPress("j", COLUMNS, "c")).toEqual({ act: "on", id: "d" });
    expect(boardPress("k", COLUMNS, "d")).toEqual({ act: "on", id: "c" });
  });

  it("stops at both ends", () => {
    expect(boardPress("k", COLUMNS, "a")).toEqual({ act: "on", id: "a" });
    expect(boardPress("j", COLUMNS, "e")).toEqual({ act: "on", id: "e" });
  });

  it("starts at the first card where it names none", () => {
    expect(boardPress("j", COLUMNS, null)).toEqual({ act: "on", id: "a" });
    expect(boardPress("k", COLUMNS, null)).toEqual({ act: "on", id: "a" });
  });

  it("has nothing to move on an empty board", () => {
    expect(boardPress("j", [], null)).toBeNull();
  });
});

describe("the keys that need a card", () => {
  it("does nothing where the cursor names no card", () => {
    for (const key of ["Enter", ">", "<", "x", "J", "K"]) {
      expect(boardPress(key, COLUMNS, null)).toBeNull();
    }
  });

  it("does nothing for a key the board does not bind", () => {
    expect(boardPress("q", COLUMNS, "a")).toBeNull();
  });
});

describe("Enter", () => {
  it("opens the card the cursor names", () => {
    expect(boardPress("Enter", COLUMNS, "b")).toEqual({ act: "open", id: "b" });
  });
});

describe("the run keys", () => {
  it("walks the card one column along, to the bottom of it", () => {
    expect(boardPress(">", COLUMNS, "a")).toEqual({
      act: "move",
      id: "a",
      status: "in_progress",
    });
    expect(boardPress("<", COLUMNS, "d")).toEqual({
      act: "move",
      id: "d",
      status: "todo",
    });
  });

  it("reaches Backlog, which the board may not be showing", () => {
    expect(boardPress("<", [{ status: "todo", ids: ["a"] }], "a")).toEqual({
      act: "move",
      id: "a",
      status: "backlog",
    });
  });

  it("stops at the end of the run", () => {
    expect(boardPress(">", COLUMNS, "e")).toBeNull();
  });

  it("leaves a cancelled card where it is", () => {
    const columns: KeyedColumn[] = [{ status: "cancelled", ids: ["z"] }];
    expect(boardPress(">", columns, "z")).toBeNull();
    expect(boardPress("<", columns, "z")).toBeNull();
  });
});

describe("x", () => {
  it("finishes the card, at the bottom of Done", () => {
    expect(boardPress("x", COLUMNS, "b")).toEqual({
      act: "move",
      id: "b",
      status: "done",
    });
  });

  it("has nothing to finish in Done or in Cancelled", () => {
    expect(boardPress("x", COLUMNS, "e")).toBeNull();
    expect(boardPress("x", [{ status: "cancelled", ids: ["z"] }], "z")).toBeNull();
  });
});

describe("the step keys", () => {
  // The step names no place: the server reads the card it lands above out of
  // the order as it stands, because the page's copy is one load old.
  it("steps the card up its own column", () => {
    expect(boardPress("K", COLUMNS, "b")).toEqual({ act: "step", id: "b", way: "up" });
  });

  it("steps the card down its own column", () => {
    expect(boardPress("J", COLUMNS, "a")).toEqual({ act: "step", id: "a", way: "down" });
  });

  it("stops at both ends of the column", () => {
    expect(boardPress("K", COLUMNS, "a")).toBeNull();
    expect(boardPress("J", COLUMNS, "c")).toBeNull();
    expect(boardPress("J", COLUMNS, "d")).toBeNull();
    expect(boardPress("K", COLUMNS, "d")).toBeNull();
  });
});
