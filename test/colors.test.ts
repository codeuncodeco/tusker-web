import { describe, expect, it } from "vitest";

import { colorCss, colorOf, isColor, readColor } from "../app/colors";

describe("the colours Tusker draws", () => {
  it("takes a palette name", () => {
    expect(isColor("blue")).toBe(true);
    expect(isColor("teal")).toBe(true);
  });

  it("takes an exact colour as #rgb or #rrggbb", () => {
    expect(isColor("#abc")).toBe(true);
    expect(isColor("#2563EB")).toBe(true);
  });

  it("refuses a CSS colour name, because a palette name is not one", () => {
    expect(isColor("rebeccapurple")).toBe(false);
    expect(isColor("hotpink")).toBe(false);
  });

  it("refuses every CSS colour form a Worker cannot read", () => {
    expect(isColor("rgb(1 2 3)")).toBe(false);
    expect(isColor("#12345")).toBe(false);
    expect(isColor("#abcdefff")).toBe(false);
  });
});

describe("the colour a person typed", () => {
  it("trims it, and reads an empty box as no colour", () => {
    expect(readColor("  blue ")).toEqual({ color: "blue" });
    expect(readColor("   ")).toEqual({ color: null });
    expect(readColor(undefined)).toEqual({ color: null });
  });

  it("names what it refuses", () => {
    expect(readColor("chartreuse")).toEqual({
      error:
        "A colour is a palette name or an exact colour, as blue or #2563eb. chartreuse is neither.",
    });
  });
});

describe("what a dot is painted with", () => {
  it("resolves a palette name to a token with a light and a dark value", () => {
    expect(colorCss("blue")).toBe("var(--dot-blue)");
  });

  it("draws an exact colour as the person typed it", () => {
    expect(colorCss("#2563eb")).toBe("#2563eb");
  });
});

describe("the colour one value carries", () => {
  const colors = { client: { c1: "blue" } };

  it("answers the colour the field gives that value", () => {
    expect(colorOf(colors, "client", "c1")).toBe("blue");
  });

  it("answers none for a value with no colour, and for no value at all", () => {
    expect(colorOf(colors, "client", "c2")).toBeNull();
    expect(colorOf(colors, "trail", "c1")).toBeNull();
    expect(colorOf(colors, "client", undefined)).toBeNull();
  });
});
