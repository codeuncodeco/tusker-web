import { describe, expect, it } from "vitest";

import css from "../app/app.css?raw";
import { colorCss, colorOf, isColor, PALETTE, readColor } from "../app/colors";

describe("the colours Tusker draws", () => {
  it("takes a palette name, in any case", () => {
    expect(isColor("blue")).toBe(true);
    expect(isColor("Blue")).toBe(true);
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

  it("stores a palette name as the token names it, and an exact colour as typed", () => {
    expect(readColor("Blue")).toEqual({ color: "blue" });
    expect(readColor("#2563EB")).toEqual({ color: "#2563EB" });
  });

  it("names what it refuses", () => {
    expect(readColor("chartreuse")).toEqual({
      error:
        "A colour is a palette name or an exact colour, for example blue or #2563eb. chartreuse is neither.",
    });
  });
});

describe("what a dot is painted with", () => {
  it("resolves a palette name to the token that holds its two values", () => {
    expect(colorCss("blue")).toBe("var(--color-opt-blue)");
  });

  it("draws an exact colour as the person typed it", () => {
    expect(colorCss("#2563eb")).toBe("#2563eb");
  });

  it("falls back to grey for a name the palette no longer holds", () => {
    // A colour outlives the palette that named it, so a row written before a
    // rename must still draw a dot rather than throw the page away.
    expect(colorCss("chartreuse")).toBe("var(--color-opt-grey)");
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

describe("the palette", () => {
  it("holds the nine names, and nothing that looks like a colour", () => {
    expect(PALETTE).toHaveLength(9);
    for (const name of PALETTE) expect(name).toMatch(/^[a-z]+$/);
  });

  it("gives every name a token, so a name and its values cannot drift apart", () => {
    for (const name of PALETTE) {
      expect(css).toContain(`--color-opt-${name}: light-dark(`);
    }
  });
});
