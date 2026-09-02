import { describe, expect, it } from "vitest";

import { likeAnywhere, memoryKey, narrowingOf, readSearch, withoutSearch } from "../app/search";

/** The query string a board carries, as the search helpers read it. */
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

describe("the pattern the search makes", () => {
  it("matches the text anywhere in the column", () => {
    expect(likeAnywhere("board")).toBe("%board%");
  });

  it("makes a per cent sign a character to find", () => {
    expect(likeAnywhere("100%")).toBe("%100\\%%");
  });

  it("makes an underscore a character to find", () => {
    expect(likeAnywhere("a_b")).toBe("%a\\_b%");
  });

  it("makes a backslash a character to find", () => {
    expect(likeAnywhere("a\\b")).toBe("%a\\\\b%");
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
});

describe("where a board keeps its narrowing", () => {
  it("gives one org its own place, so two boards do not share a search", () => {
    expect(memoryKey("ada")).not.toBe(memoryKey("blrhikes"));
  });
});

describe("the rest of the query the box carries over", () => {
  it("keeps every name but the search", () => {
    expect(withoutSearch(query("q=board&backlog=1&today=1"))).toEqual([
      ["backlog", "1"],
      ["today", "1"],
    ]);
  });
});
