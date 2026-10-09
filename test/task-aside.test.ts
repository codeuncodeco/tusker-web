/**
 * The task aside, read off its source, as `board-frame.test.ts` reads the
 * board. Where the aside draws is layout and nothing else.
 */

import asideSource from "../app/task-aside.tsx?raw";
import taskSource from "../app/routes/task.tsx?raw";
import { expect, it } from "vitest";

/** The classes the one aside draws with, live and finished. */
const aside =
  asideSource
    .match(/const asideClass = \[([\s\S]*?)\]\.join/)?.[1]
    .match(/"([^"]*)"/g)
    ?.flatMap((line) => line.slice(1, -1).split(/\s+/)) ?? [];

it("draws one aside, live and finished, and the page draws no other", () => {
  expect(asideSource.match(/<aside className=\{asideClass\}/g)).toHaveLength(1);
  expect(taskSource).not.toMatch(/<aside/);
});

it("draws no box round the aside beside the task", () => {
  // The aside is a pane split from the task, not a box. A bare `border` is
  // all four edges, and `p-4` the inset that went with them. See #184.
  const box = aside.filter((one) => one.startsWith("rounded") || one === "border" || one === "p-4");
  expect(box).toEqual([]);
});

it("splits the aside off with a divider on its left beside the task", () => {
  for (const one of ["border-l", "border-border", "pl-6", "w-64"]) {
    expect([one, aside.includes(one)]).toEqual([one, true]);
  }
});

it("draws no aside on a phone until the drawer is open, and then fixes it to the foot", () => {
  for (const one of [
    "max-sm:hidden",
    "max-sm:[:root:has([data-task-drawer][open])_&]:flex",
    "max-sm:fixed",
    "max-sm:bottom-16",
  ]) {
    expect([one, aside.includes(one)]).toEqual([one, true]);
  }
});
