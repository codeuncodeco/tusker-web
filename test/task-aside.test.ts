/**
 * The task page aside, read off its source, as `board-frame.test.ts` reads the
 * board. The aside is layout and nothing else.
 */

import taskSource from "../app/routes/task.tsx?raw";
import { expect, it } from "vitest";

/** The class string of every <aside>, live and finished. */
const asides = [...taskSource.matchAll(/<aside className="([^"\n]*)"/g)].map((match) =>
  match[1].split(/\s+/),
);

it("finds the two asides, live and finished", () => {
  expect(asides).toHaveLength(2);
});

it("draws no box round the aside", () => {
  // The aside is a pane split from the description, not a box. See #184.
  for (const aside of asides) {
    // A bare `border` is all four edges, and `p-4` the inset that went with them.
    const box = aside.filter((one) => one.startsWith("rounded") || one === "border" || one === "p-4");
    expect(box).toEqual([]);
  }
});

it("splits the aside off with a divider, on top when it stacks and on the left beside", () => {
  for (const aside of asides) {
    for (const one of ["border-t", "border-border", "sm:border-t-0", "sm:border-l"]) {
      expect([one, aside.includes(one)]).toEqual([one, true]);
    }
  }
});
