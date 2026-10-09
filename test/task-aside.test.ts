/**
 * The task page aside, read off its source, as `board-frame.test.ts` reads the
 * board. The aside is layout and nothing else.
 */

import taskSource from "../app/routes/task.tsx?raw";
import { expect, it } from "vitest";

/** The one class string both asides, live and finished, draw with. */
const aside = taskSource.match(/const asideClass =\s*"([^"\n]*)"/)?.[1].split(/\s+/) ?? [];

it("draws both asides, live and finished, with the one class", () => {
  expect(taskSource.match(/<aside className=\{asideClass\}>/g)).toHaveLength(2);
  expect(taskSource).not.toMatch(/<aside className="/);
});

it("draws no box round the aside", () => {
  // The aside is a pane split from the fields, not a box. A bare `border` is
  // all four edges, and `p-4` the inset that went with them. See #184.
  const box = aside.filter((one) => one.startsWith("rounded") || one === "border" || one === "p-4");
  expect(box).toEqual([]);
});

it("splits the aside off with a divider, on top when it stacks and on the left beside", () => {
  for (const one of ["border-t", "border-border", "sm:border-t-0", "sm:border-l"]) {
    expect([one, aside.includes(one)]).toEqual([one, true]);
  }
});
