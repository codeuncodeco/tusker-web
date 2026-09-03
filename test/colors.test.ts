import { describe, expect, it } from "vitest";

import css from "../app/app.css?raw";
import {
  ASSIGNABLE,
  colorCss,
  colorHex,
  colorOf,
  isColor,
  nextColor,
  PALETTE,
  readColor,
} from "../app/colors";

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

describe("the colour a new org is assigned", () => {
  it("never hands out grey, because grey is what no colour draws", () => {
    expect(ASSIGNABLE).not.toContain("grey");
    expect(ASSIGNABLE).toHaveLength(PALETTE.length - 1);
  });

  it("gives a person who holds no org the first name", () => {
    expect(nextColor([])).toBe(ASSIGNABLE[0]);
  });

  it("skips every name the person already holds", () => {
    expect(nextColor(["red"])).toBe("orange");
    expect(nextColor(["orange", "red"])).toBe("amber");
  });

  it("counts a colourless org and an exact colour as no palette name", () => {
    expect(nextColor([null])).toBe("red");
    expect(nextColor(["#2563eb"])).toBe("red");
  });

  it("takes a name back only once the person holds them all", () => {
    const all = [...ASSIGNABLE];
    expect(nextColor(all)).toBe(ASSIGNABLE[0]);
    expect(nextColor([...all, ASSIGNABLE[0]])).toBe(ASSIGNABLE[1]);
  });
});

describe("the hex a colour picker opens on", () => {
  it("seeds a palette name with the light value the token holds", () => {
    expect(css).toContain(`--color-opt-blue: light-dark(${colorHex("blue")},`);
  });

  it("keeps an exact colour, and writes a short one in full", () => {
    expect(colorHex("#2563eb")).toBe("#2563eb");
    expect(colorHex("#abc")).toBe("#aabbcc");
  });

  it("seeds no colour, and a name the palette dropped, with grey", () => {
    expect(colorHex(null)).toBe(colorHex("grey"));
    expect(colorHex("chartreuse")).toBe(colorHex("grey"));
  });
});
