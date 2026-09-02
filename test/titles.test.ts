import { describe, expect, it } from "vitest";

import { MAX_TITLES, titlesIn } from "../app/titles";

describe("the lines a paste makes tasks from", () => {
  it("makes one title of a single line", () => {
    expect(titlesIn("fix the map")).toEqual(["fix the map"]);
  });

  it("makes one title of every line, in the order they appear", () => {
    expect(titlesIn("first\nsecond\nthird")).toEqual(["first", "second", "third"]);
  });

  it("reads a Windows line break as a line break", () => {
    expect(titlesIn("first\r\nsecond")).toEqual(["first", "second"]);
  });

  it("drops a trailing line break", () => {
    expect(titlesIn("first\nsecond\n")).toEqual(["first", "second"]);
  });

  it("drops a blank line and a line of spaces", () => {
    expect(titlesIn("first\n\n   \nsecond")).toEqual(["first", "second"]);
  });

  it("trims every line", () => {
    expect(titlesIn("  first  \n\tsecond\t")).toEqual(["first", "second"]);
  });

  it("makes no title of a text of blanks", () => {
    expect(titlesIn("  \n\n\t\n")).toEqual([]);
    expect(titlesIn("")).toEqual([]);
  });

  it("counts the lines a cap can measure", () => {
    const lines = Array.from({ length: MAX_TITLES + 1 }, (_, at) => `task ${at}`);

    expect(titlesIn(lines.join("\n")).length).toBe(MAX_TITLES + 1);
  });
});
