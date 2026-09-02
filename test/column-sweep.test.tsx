/**
 * Where the org board draws the sweep, and which columns carry it. See #121.
 *
 * The sweep sits in the column head, beside the name and the count, the way
 * the Tusker extension drew it. Narrowing decides the set the column holds,
 * and never whether the button is there.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import Board from "../app/routes/board";
import type { Status } from "../app/board";

/** One column, as the loader hands it over. */
function column(status: Status, label: string, titles: string[]) {
  return {
    status,
    label,
    tasks: titles.map((title) => ({ id: title, title, fields: [], assignees: [] })),
  };
}

/** The board, drawn from the data a loader would give it. */
function board(columns: ReturnType<typeof column>[]): string {
  const loaderData = {
    org: { slug: "acme", name: "Acme" },
    columns,
    ask: null,
    toggles: { backlog: false, cancelled: true },
    today: false,
    search: "",
    day: "2026-09-02",
    hasPlan: false,
    backlogByRule: false,
  };
  // The page reads its loader data and nothing else of what a route hands it.
  const props = { loaderData } as unknown as React.ComponentProps<typeof Board>;
  const Stub = createRoutesStub([{ path: "/o/:slug/board", Component: () => <Board {...props} /> }]);
  return renderToStaticMarkup(<Stub initialEntries={["/o/acme/board"]} />);
}

/** The head of one column: its name, its count, and whatever sits beside them. */
function head(html: string, label: string): string {
  const heads = html
    .split("<h2")
    .slice(1)
    .map((one) => one.slice(0, one.indexOf("<ul")));
  const one = heads.find((head) => head.includes(label));
  expect(one).toBeDefined();
  return one!;
}

describe("the sweep on a finished column", () => {
  it("sits in the head, beside the name and the count", () => {
    const html = board([column("done", "Done", ["One", "Two"])]);

    expect(head(html, "Done")).toContain("Archive 2");
  });

  it("is there with nothing narrowing the board", () => {
    const html = board([column("cancelled", "Cancelled", ["Dropped"])]);

    expect(html).toContain('aria-label="Archive 1 from Cancelled"');
  });

  it("names every card the column draws, and no other", () => {
    const html = board([
      column("done", "Done", ["One", "Two"]),
      column("cancelled", "Cancelled", ["Three"]),
    ]);
    const sweep = head(html, "Done");

    expect([...sweep.matchAll(/name="id" value="([^"]*)"/g)].map((one) => one[1])).toEqual([
      "One",
      "Two",
    ]);
  });
});

describe("the columns that carry none", () => {
  it("leaves an empty finished column without one", () => {
    const html = board([column("done", "Done", [])]);

    expect(html).not.toContain("Archive 0");
    expect(html).not.toContain("from Done");
  });

  it("leaves a live column without one, however full it is", () => {
    const html = board([column("todo", "To do", ["One", "Two"])]);

    expect(html).not.toContain("from To do");
  });
});
