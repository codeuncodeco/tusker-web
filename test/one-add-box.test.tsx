/**
 * Where a board draws its quick-add box. See #165 and #199.
 *
 * Each board draws one box, above the row of columns and outside every column,
 * and the box names no column: what it adds lands in To do. The box takes the
 * left of the board's top row, and the filters take the right.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import Board from "../app/routes/board";
import type { Status } from "../app/board";
import Me from "../app/routes/me";

const COLUMNS: { status: Status; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
  { status: "cancelled", label: "Cancelled" },
];

/** The org board with every column, drawn from the data a loader would give it. */
function orgBoard(): string {
  const loaderData = {
    org: { slug: "acme", name: "Acme" },
    columns: COLUMNS.map((one) => ({ ...one, tasks: [] })),
    members: [],
    ask: null,
    toggles: { backlog: true, cancelled: true },
    today: false,
    search: "",
    assignee: "",
    filters: [],
    day: "2026-09-02",
    hasPlan: false,
    backlogByRule: false,
  };
  const props = { loaderData } as unknown as React.ComponentProps<typeof Board>;
  const Stub = createRoutesStub([{ path: "/o/:slug/board", Component: () => <Board {...props} /> }]);
  return renderToStaticMarkup(<Stub initialEntries={["/o/acme/board"]} />);
}

/** The unified board with every column, drawn from the data a loader would give it. */
function unifiedBoard(): string {
  const loaderData = {
    orgs: [
      { slug: "ada", name: "Ada", color: "red" },
      { slug: "acme", name: "Acme", color: "blue" },
    ],
    members: {},
    clients: [],
    client: null,
    columns: COLUMNS.map((one) => ({ ...one, tasks: [] })),
    planned: [],
    toggles: { backlog: true, cancelled: true },
    today: false,
    hasPlan: false,
    week: false,
    hasSet: false,
    day: "2026-09-02",
    ask: null,
  };
  const props = { loaderData } as unknown as React.ComponentProps<typeof Me>;
  const Stub = createRoutesStub([{ path: "/me", Component: () => <Me {...props} /> }]);
  return renderToStaticMarkup(<Stub initialEntries={["/me"]} />);
}

/** The forms that post an add. */
function boxes(html: string): string[] {
  return html.split("<form").slice(1).filter((form) => form.includes('value="create"'));
}

describe.each([
  ["the org board", orgBoard],
  ["the unified board", unifiedBoard],
])("the quick-add box on %s", (_, draw) => {
  it("is drawn once", () => {
    expect(boxes(draw())).toHaveLength(1);
  });

  it("heads To do, under its heading and above its cards, outside the keyed list", () => {
    const html = draw();
    // The board draws no bar: the box sits in To do, where what it adds
    // lands. See ADR-0038.
    const todo = html.indexOf(">To do<");
    const box = html.indexOf('value="create"');
    const list = html.indexOf("<ul", box);

    expect(todo).toBeGreaterThan(-1);
    expect(box).toBeGreaterThan(todo);
    expect(html.indexOf('name="title"', box)).toBeLessThan(list);
    expect(html.indexOf(">In progress<")).toBeGreaterThan(box);
  });

  it("draws no decision tick: the task page sets the mark", () => {
    const [box] = boxes(draw());

    expect(box).not.toContain('name="decides"');
    expect(box).not.toContain("Holds a decision");
  });

  it("names no column, so what it adds lands in To do", () => {
    const [box] = boxes(draw());

    expect(box.slice(0, box.indexOf("</form>"))).not.toContain('name="status"');
  });
});
