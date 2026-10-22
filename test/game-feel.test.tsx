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

describe("Backlog and Cancelled sheets", () => {
  it("are separate sheets, one hung from the top and one from the bottom", async () => {
    const { SideSheet } = await import("../app/side-drawer");
    const Stub = createRoutesStub([
      {
        path: "/me",
        Component: () => (
          <>
            <SideSheet status="backlog">
              <section>b</section>
            </SideSheet>
            <SideSheet status="cancelled">
              <section>c</section>
            </SideSheet>
          </>
        ),
      },
    ]);
    const html = renderToStaticMarkup(<Stub initialEntries={["/me?backlog=1&cancelled=1"]} />);

    const sheets = html.match(/<aside[^>]*>/g) ?? [];
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toContain('aria-label="Backlog"');
    expect(sheets[0]).toContain("top-3");
    expect(sheets[1]).toContain('aria-label="Cancelled"');
    expect(sheets[1]).toContain("bottom-3");
  });

  it("leave a shut tab at the edge while the other sheet is out", async () => {
    const { BacklogTab, CancelledTab } = await import("../app/side-drawer");
    const Stub = createRoutesStub([
      {
        path: "/me",
        Component: () => (
          <>
            <BacklogTab open count={3} />
            <CancelledTab open={false} count={2} />
          </>
        ),
      },
    ]);
    const html = renderToStaticMarkup(<Stub initialEntries={["/me?backlog=1"]} />);

    expect(html).toMatch(/aria-label="Put away Backlog[^"]*"[^>]*style="left:20rem"/);
    expect(html).toMatch(/aria-label="Pull out Cancelled[^"]*"[^>]*style="left:0"/);
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

describe("the view dial", () => {
  it("lays the views on a third of a turn, from the button's left round past straight above it", async () => {
    const { onDial } = await import("../app/dock");

    const first = onDial(0, 4);
    const last = onDial(3, 4);
    expect(first.x).toBeLessThan(0);
    expect(Math.abs(first.y)).toBeLessThanOrEqual(1);
    expect(last.x).toBeGreaterThan(0);
    expect(last.y).toBeLessThan(0);
    // Every pill sits as far from the centre as every other, and close to it.
    const reach = (one: { x: number; y: number }) => Math.hypot(one.x, one.y);
    const reaches = [0, 1, 2, 3].map((at) => reach(onDial(at, 4)));
    expect(Math.max(...reaches) - Math.min(...reaches)).toBeLessThanOrEqual(1);
    expect(Math.max(...reaches)).toBeLessThan(100);
  });

  it("keeps a gap between two pills side by side, each 48px across", async () => {
    const { onDial } = await import("../app/dock");

    for (let at = 0; at < 3; at++) {
      const one = onDial(at, 4);
      const next = onDial(at + 1, 4);
      expect(Math.hypot(next.x - one.x, next.y - one.y)).toBeGreaterThan(48);
    }
  });
});

describe("a bento tile", () => {
  it("spans the columns it names, with its label, and draws no box inside itself", async () => {
    const { Bento, Tile } = await import("../app/bento");
    const html = renderToStaticMarkup(
      <Bento>
        <Tile span={3} label="Title">
          words
        </Tile>
        <Tile span={1} rows={2} label="Acts" />
      </Bento>,
    );

    expect(html).toContain("sm:grid-cols-4");
    expect(html).toMatch(/<section class="[^"]*col-span-2 sm:col-span-3[^"]*"/);
    expect(html).toMatch(/<section class="[^"]*sm:row-span-2[^"]*"/);
    expect(html).toContain(">Title<");
    expect(html).not.toMatch(/<section[^>]*border/);
  });
});
