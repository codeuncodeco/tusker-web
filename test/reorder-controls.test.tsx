/**
 * A row that drags carries no reorder button: the drag and the keys reorder
 * it. A ranked row that does not drag keeps its buttons, because a phone has
 * no other way to move it. See ADR-0026.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import Board from "../app/routes/board";
import type { Group, LiveTask } from "../app/unified";
import { UnifiedList } from "../app/unified-list";

function live(id: number): LiveTask {
  return {
    id,
    org: { slug: "acme", name: "Acme", color: "blue" },
    title: `Task ${id}`,
    status: "todo",
    due_date: null,
    percentile: 0.5,
    created_at: "2026-09-01",
    fields: [],
    assignees: [],
    finished: false,
  };
}

function markup(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/", Component: () => <>{element}</> }]);
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />);
}

const REORDERS = /value="(up|down|top|bottom)"/;

describe("the reorder buttons", () => {
  it("are gone from a plan that drags", () => {
    const groups: Group[] = [
      { key: "today", label: "Plan", tasks: [live(1), live(2)], sinks: false },
    ];
    const html = markup(
      <UnifiedList groups={groups} planned={new Set([1, 2])} day="2026-10-09" showsOrg ordered="today" drags />,
    );

    expect(html).not.toMatch(REORDERS);
  });

  it("stay on a ranked list that does not drag, which is the week set", () => {
    const groups: Group[] = [
      { key: "week", label: "This week", tasks: [live(1), live(2)], sinks: true },
    ];
    const html = markup(
      <UnifiedList groups={groups} planned={new Set([1, 2])} day="2026-10-09" showsOrg ordered="week" />,
    );

    expect(html).toMatch(REORDERS);
  });
});

/** The org board, with two cards in To do, drawn from a loader's data. */
function orgBoard(): string {
  const card = (id: number) => ({ id, title: `Task ${id}`, fields: [], assignees: [] });
  const loaderData = {
    org: { slug: "acme", name: "Acme" },
    columns: [
      { status: "todo", label: "To do", tasks: [card(1), card(2)] },
      { status: "in_progress", label: "In progress", tasks: [] },
      { status: "done", label: "Done", tasks: [] },
    ],
    members: [],
    ask: null,
    toggles: { backlog: false, cancelled: false },
    today: false,
    search: "",
    assignee: "",
    filters: [],
    day: "2026-10-09",
    hasPlan: false,
    backlogByRule: false,
  };
  const props = { loaderData } as unknown as React.ComponentProps<typeof Board>;
  const Stub = createRoutesStub([{ path: "/o/:slug/board", Component: () => <Board {...props} /> }]);
  return renderToStaticMarkup(<Stub initialEntries={["/o/acme/board"]} />);
}

describe("the org board card", () => {
  // The step keys are named in the Key guide, and nowhere on the board.
  it("carries no reorder button", () => {
    expect(orgBoard()).not.toMatch(REORDERS);
  });
});
