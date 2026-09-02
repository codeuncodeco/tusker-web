import { describe, expect, it } from "vitest";

import { memoryKey, narrowingOf } from "../app/remembered";
import { readSearch, withoutSearch } from "../app/search";
import { holdsText } from "../app/tasks.server";

/** The address a board carries, as the search helpers read it. */
function query(text: string) {
  return new URLSearchParams(text);
}

describe("the text the box holds", () => {
  it("is empty when the board carries no search", () => {
    expect(readSearch(query("backlog=1"))).toBe("");
  });

  it("drops the space around what a person typed", () => {
    expect(readSearch(query("q=%20%20board%20%20"))).toBe("board");
  });

  it("is empty when the box holds space and nothing else", () => {
    expect(readSearch(query("q=%20%20"))).toBe("");
  });
});

describe("the clause the search makes", () => {
  it("reads the two columns apart, so nothing matches across the seam", () => {
    expect(holdsText("board").sql).toBe(
      "(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')",
    );
  });

  it("finds the text anywhere in a column", () => {
    expect(holdsText("board").values).toEqual(["%board%", "%board%"]);
  });

  it("makes a per cent sign a character to find", () => {
    expect(holdsText("100%").values[0]).toBe("%100\\%%");
  });

  it("makes an underscore a character to find", () => {
    expect(holdsText("a_b").values[0]).toBe("%a\\_b%");
  });

  it("makes a backslash a character to find", () => {
    expect(holdsText("a\\b").values[0]).toBe("%a\\\\b%");
  });
});

describe("what a board remembers", () => {
  it("keeps the search", () => {
    expect(narrowingOf(query("q=board"))).toBe("q=board");
  });

  it("leaves the column toggles out, because they are not a narrowing", () => {
    expect(narrowingOf(query("q=board&backlog=1&today=1"))).toBe("q=board");
  });

  it("is empty for a board a person cleared by hand", () => {
    expect(narrowingOf(query("q=&backlog=1"))).toBe("");
  });

  it("is empty for a link that carries a toggle and no search", () => {
    expect(narrowingOf(query("cancelled=1"))).toBe("");
  });

  it("gives one org its own place, so two boards do not share a search", () => {
    expect(memoryKey("ada")).not.toBe(memoryKey("blrhikes"));
  });
});

describe("the rest of the address the box carries over", () => {
  it("keeps every name but the search", () => {
    expect(withoutSearch(query("q=board&backlog=1&today=1"))).toEqual([
      ["backlog", "1"],
      ["today", "1"],
    ]);
  });
});
