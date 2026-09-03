import { describe, expect, it } from "vitest";

import { between, placesAbove, placesBelow } from "../app/order";

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

describe("the positions a block of new tasks takes", () => {
  it("puts one task below the card that was on top", () => {
    expect(placesAbove(1, 1)).toEqual([0]);
    expect(placesAbove(-4.5, 1)).toEqual([-5.5]);
  });

  it("puts a block below that card, in the order it was typed", () => {
    expect(placesAbove(1, 3)).toEqual([-2, -1, 0]);
  });

  it("puts a block in an empty column in the order it was typed", () => {
    expect(placesAbove(null, 1)).toEqual([0]);
    expect(placesAbove(null, 3)).toEqual([-2, -1, 0]);
  });

  it("gives back nothing for a block of no tasks", () => {
    expect(placesAbove(1, 0)).toEqual([]);
  });
});

describe("the positions a block takes at the foot", () => {
  it("puts one task past the card that was at the foot", () => {
    expect(placesBelow(1, 1)).toEqual([2]);
    expect(placesBelow(-4.5, 1)).toEqual([-3.5]);
  });

  it("puts a block past that card, in the order it was typed", () => {
    expect(placesBelow(1, 3)).toEqual([2, 3, 4]);
  });

  it("puts a block in an empty list in the order it was typed", () => {
    expect(placesBelow(null, 1)).toEqual([0]);
    expect(placesBelow(null, 3)).toEqual([0, 1, 2]);
  });

  it("gives back nothing for a block of no tasks", () => {
    expect(placesBelow(1, 0)).toEqual([]);
  });
});
