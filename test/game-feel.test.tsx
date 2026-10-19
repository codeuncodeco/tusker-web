import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { EMPTY_LINE, STATUSES } from "../app/board";
import { HoldButton } from "../app/hold-button";
import { nextStatus } from "../app/task-aside";
import { TodayMeter } from "../app/today-meter";

/** One element, inside a router, so a link has one. */
function drawn(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "*", Component: () => <>{element}</> }]);
  return renderToStaticMarkup(<Stub initialEntries={["/me"]} />);
}

describe("the Today meter", () => {
  it("fills to the share of today's plan that is done, and says so in words", () => {
    const html = drawn(<TodayMeter done={2} planned={5} />);

    expect(html).toContain('aria-label="Today&#x27;s plan: 2 of 5 done"');
    expect(html).toContain("width:40%");
    expect(html).toContain('href="/me/plan"');
  });

  it("says the day is cleared when every planned task is done", () => {
    expect(drawn(<TodayMeter done={3} planned={3} />)).toContain("Day cleared");
  });

  it("draws nothing for a day with no plan", () => {
    expect(drawn(<TodayMeter done={0} planned={0} />)).toBe("");
  });
});

describe("the phone bar's status step", () => {
  it("walks a task along the board, and a finished one back to To do", () => {
    expect(nextStatus("backlog")).toBe("todo");
    expect(nextStatus("todo")).toBe("in_progress");
    expect(nextStatus("in_progress")).toBe("done");
    expect(nextStatus("done")).toBe("todo");
    expect(nextStatus("cancelled")).toBe("todo");
  });
});

it("gives every column a line for when it is empty", () => {
  for (const status of STATUSES) expect(EMPTY_LINE[status]).toMatch(/\.$/);
});

it("draws a hold button that posts nothing by itself", () => {
  const html = drawn(<HoldButton label="Delete" onConfirm={() => {}} />);

  expect(html).toContain('type="button"');
  expect(html).toContain("Hold to delete, or click twice");
  expect(html).not.toContain("<form");
});

describe("Backlog, folded into a bar", () => {
  it("opens the column with one click, keeping the rest of the address, and counts what waits", async () => {
    const { BacklogBar } = await import("../app/board-chrome");
    const Stub = createRoutesStub([{ path: "/me", Component: () => <BacklogBar count={4} /> }]);
    const html = renderToStaticMarkup(<Stub initialEntries={["/me?assignee=anyone"]} />);

    expect(html).toContain('href="/me?assignee=anyone&amp;backlog=1"');
    expect(html).toContain('aria-label="Open Backlog, 4 tasks"');
    expect(html).not.toContain('type="checkbox"');
  });

  it("folds back from the column's head", async () => {
    const { ColumnHead } = await import("../app/board-chrome");
    const html = drawn(<ColumnHead status="backlog" label="Backlog" count={2} fold="?" />);

    expect(html).toContain('aria-label="Fold Backlog away"');
    expect(drawn(<ColumnHead status="todo" label="To do" count={2} />)).not.toContain("Fold");
  });
});

describe("the View button's ring", () => {
  it("steps Board, Week, Plan, Focus and round, and back with Shift", async () => {
    const { nextView } = await import("../app/dock");

    expect(nextView("board")).toBe("week");
    expect(nextView("focus")).toBe("board");
    expect(nextView("board", true)).toBe("focus");
    expect(nextView(null)).toBe("board");
  });

  it("reads which view a page is", async () => {
    const { viewOf } = await import("../app/dock");

    expect(viewOf("/o/acme/board", true)).toBe("board");
    expect(viewOf("/me/week/2026-W43", false)).toBe("week");
    expect(viewOf("/me/plan", false)).toBe("plan");
    expect(viewOf("/o/acme/clients", false)).toBeNull();
  });
});
