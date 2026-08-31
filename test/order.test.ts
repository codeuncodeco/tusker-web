import { describe, expect, it } from "vitest";

import { between } from "../app/order";

describe("the position a drop takes", () => {
  it("takes the midpoint of its two neighbours", () => {
    expect(between(1, 2)).toBe(1.5);
    expect(between(1.5, 2)).toBe(1.75);
  });

  it("takes a place below the first card when it lands at the top", () => {
    expect(between(null, 1)).toBe(0);
    expect(between(null, -4.5)).toBe(-5.5);
  });

  it("takes a place above the last card when it lands at the bottom", () => {
    expect(between(1, null)).toBe(2);
    expect(between(-5.5, null)).toBe(-4.5);
  });

  it("takes a place of its own in an empty column", () => {
    expect(between(null, null)).toBe(0);
  });

  it("gives back nothing when the gap is too tight to split", () => {
    const tight = 1 + Number.EPSILON;

    expect(between(1, tight)).toBeNull();
    expect(between(1, 1)).toBeNull();
  });

  it("gives back nothing when the neighbours are the wrong way round", () => {
    expect(between(2, 1)).toBeNull();
  });
});
