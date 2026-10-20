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

describe("Backlog and Cancelled, kept off the board", () => {
  /** The two tabs, drawn at one address. */
  async function tabs(path: string, open: { backlog: boolean; cancelled: boolean }, counts: { backlog: number; cancelled: number }) {
    const { BacklogTab, CancelledTab } = await import("../app/side-drawer");
    const Stub = createRoutesStub([
      {
        path: "/me",
        Component: () => (
          <>
            <BacklogTab open={open.backlog} count={counts.backlog} />
            <CancelledTab open={open.cancelled} count={counts.cancelled} />
          </>
        ),
      },
    ]);
    return renderToStaticMarkup(<Stub initialEntries={[path]} />);
  }

  it("pull out from tabs, each a link that keeps the rest of the address", async () => {
    const html = await tabs("/me?assignee=anyone", { backlog: false, cancelled: false }, { backlog: 4, cancelled: 1 });

    expect(html).toContain('href="/me?assignee=anyone&amp;backlog=1"');
    expect(html).toContain('href="/me?assignee=anyone&amp;cancelled=1"');
    expect(html).toContain('aria-label="Pull out Backlog, 4 tasks"');
    expect(html).toContain('aria-label="Pull out Cancelled, 1 task"');
    expect(html).not.toContain('type="checkbox"');
  });

  it("draw no tab for a column that holds nothing", async () => {
    const html = await tabs("/me", { backlog: false, cancelled: false }, { backlog: 0, cancelled: 0 });

    expect(html).toBe("");
  });

  it("put a pulled-out column away from its tab, now its handle", async () => {
    const html = await tabs("/me?backlog=1", { backlog: true, cancelled: false }, { backlog: 0, cancelled: 0 });

    expect(html).toContain('aria-label="Put away Backlog, 0 tasks"');
    expect(html).not.toContain("Cancelled");
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
