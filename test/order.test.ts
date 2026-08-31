import { describe, expect, it } from "vitest";

import { between, marked, seenBy } from "../app/order";

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

describe("the order one person sees", () => {
  /** A column in the board's own order, with the ranks one person set. */
  const column = [
    { id: "a", position: 1, rank: null },
    { id: "b", position: 2, rank: null },
    { id: "c", position: 3, rank: null },
  ];

  it("keeps the board's order for a person who never dragged", () => {
    expect(seenBy(column).map((one) => one.id)).toEqual(["a", "b", "c"]);
  });

  it("interleaves a ranked card with the unranked ones around it", () => {
    const ranked = [
      { id: "a", position: 1, rank: null },
      { id: "b", position: 2, rank: null },
      { id: "c", position: 3, rank: 1.5 },
    ];

    expect(seenBy(ranked).map((one) => one.id)).toEqual(["a", "c", "b"]);
  });

  it("reads a rank of zero as a rank, not as a card without one", () => {
    const ranked = [
      { id: "a", position: 1, rank: null },
      { id: "b", position: 2, rank: 0 },
    ];

    expect(seenBy(ranked).map((one) => one.id)).toEqual(["b", "a"]);
  });

  it("leaves two cards of the same number in the order the board gave them", () => {
    const tied = [
      { id: "a", position: 1, rank: null },
      { id: "b", position: 1, rank: null },
    ];

    expect(seenBy(tied).map((one) => one.id)).toEqual(["a", "b"]);
  });
});

describe("the marker a card shows when it differs from the board", () => {
  it("marks nothing while no card is ranked", () => {
    const column = [
      { id: "a", position: 1, rank: null },
      { id: "b", position: 2, rank: null },
    ];

    expect(marked(column)).toEqual(new Set());
  });

  it("marks the ranked card that sits in another place than the board puts it", () => {
    const column = [
      { id: "a", position: 1, rank: null },
      { id: "b", position: 2, rank: null },
      { id: "c", position: 3, rank: 1.5 },
    ];

    // c moved up. b slid down to make room, but b has no rank to differ with.
    expect(marked(column)).toEqual(new Set(["c"]));
  });

  it("marks no card while a rank asks for the place the board already gives", () => {
    const column = [
      { id: "a", position: 1, rank: 0.5 },
      { id: "b", position: 2, rank: null },
    ];

    expect(marked(column)).toEqual(new Set());
  });

  it("marks a card once the board moves out from under its rank", () => {
    // The person ranked b where the board had it, and the board then moved b
    // to the foot of the column.
    const column = [
      { id: "a", position: 1, rank: null },
      { id: "c", position: 2, rank: null },
      { id: "b", position: 3, rank: 1.5 },
    ];

    expect(marked(column)).toEqual(new Set(["b"]));
  });
});
