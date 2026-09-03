/**
 * Where a board draws the sweep, which columns carry it, and what the batch
 * says once it is done. See #121 and #126.
 *
 * One module draws the control for both boards. The sweep sits in the column
 * head, beside the name and the count, the way the Tusker extension drew it.
 * Narrowing decides the set the column holds, and never whether the button is
 * there.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import Board from "../app/routes/board";
import type { Status } from "../app/board";
import { KEY_MAP } from "../app/key-map";
import { sweptToast } from "../app/sweep";
import type { LiveTask } from "../app/unified";
import { UnifiedBoard } from "../app/unified-board";

/** One column of the org board, as its loader hands it over. */
function column(status: Status, label: string, titles: string[]) {
  return {
    status,
    label,
    tasks: titles.map((title) => ({ id: title, title, fields: [], assignees: [] })),
  };
}

/** The org board, drawn from the data a loader would give it. */
function board(columns: ReturnType<typeof column>[]): string {
  const loaderData = {
    org: { slug: "acme", name: "Acme" },
    columns,
    // A team org's members, for the picker on every quick-add box. This board
    // draws none, and the picker is not what these tests read.
    members: [],
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

/** One card of the unified board, of the org the test names. */
function card(id: string, slug: string, status: Status): LiveTask {
  return {
    id,
    org: { slug, name: slug, color: "blue" },
    title: id,
    status,
    due_date: null,
    percentile: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    fields: [],
    assignees: [],
    finished: true,
  };
}

/** The unified board, drawn from the columns a loader would give it. */
function unified(columns: { status: Status; label: string; tasks: LiveTask[] }[]): string {
  const orgs = [
    { slug: "acme", name: "Acme", kind: "team" as const, color: "blue" },
    { slug: "ada", name: "Ada", kind: "personal" as const, color: "red" },
  ];
  const Stub = createRoutesStub([
    {
      path: "/me",
      Component: () => (
        <UnifiedBoard
          columns={columns}
          orgs={orgs}
          members={{}}
          planned={new Set()}
          day="2026-09-02"
        />
      ),
    },
  ]);
  return renderToStaticMarkup(<Stub initialEntries={["/me"]} />);
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

/** The id and slug pairs one sweep form posts, in card order. */
function posts(sweep: string): { id: string; slug: string }[] {
  const ids = [...sweep.matchAll(/name="id" value="([^"]*)"/g)].map((one) => one[1]);
  const slugs = [...sweep.matchAll(/name="slug" value="([^"]*)"/g)].map((one) => one[1]);
  return ids.map((id, at) => ({ id, slug: slugs[at] }));
}

describe("the sweep on a finished column of the org board", () => {
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

    expect(posts(head(html, "Done"))).toEqual([
      { id: "One", slug: "acme" },
      { id: "Two", slug: "acme" },
    ]);
  });
});

describe("the sweep on a finished column of the unified board", () => {
  it("sits in the head of Done and of Cancelled", () => {
    const html = unified([
      { status: "done", label: "Done", tasks: [card("one", "acme", "done")] },
      { status: "cancelled", label: "Cancelled", tasks: [card("two", "ada", "cancelled")] },
    ]);

    expect(head(html, "Done")).toContain("Archive 1");
    expect(head(html, "Cancelled")).toContain("Archive 1");
  });

  it("posts the org of every card beside its id", () => {
    const html = unified([
      {
        status: "done",
        label: "Done",
        tasks: [card("one", "acme", "done"), card("two", "ada", "done")],
      },
    ]);

    expect(posts(head(html, "Done"))).toEqual([
      { id: "one", slug: "acme" },
      { id: "two", slug: "ada" },
    ]);
  });

  it("leaves an empty finished column without one", () => {
    const html = unified([{ status: "done", label: "Done", tasks: [] }]);

    expect(html).not.toContain("from Done");
  });

  it("leaves a live column without one, however full it is", () => {
    const html = unified([
      { status: "todo", label: "To do", tasks: [card("one", "acme", "todo")] },
    ]);

    expect(html).not.toContain("from To do");
  });
});

describe("the columns the org board leaves without one", () => {
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

describe("what a finished sweep says", () => {
  const swept = (archived: { id: string; slug: string }[], names?: Record<string, string>) =>
    sweptToast({ label: "Done", undoAt: "/o/acme/board", archived, names });

  it("names the count and the column it swept", () => {
    expect(swept([{ id: "a", slug: "acme" }, { id: "b", slug: "acme" }]).text).toBe(
      "Archived 2 from Done.",
    );
  });

  it("offers one undo, which posts the cards the sweep changed", () => {
    // The sweep was given three cards and changed two: one was already
    // archived.
    expect(swept([{ id: "a", slug: "acme" }, { id: "b", slug: "ada" }]).act).toEqual({
      label: "Undo",
      action: "/o/acme/board",
      post: { intent: "restore", id: ["a", "b"], slug: ["acme", "ada"] },
    });
  });

  it("offers no undo when nothing changed", () => {
    expect(swept([]).act).toBeUndefined();
  });

  it("links to the archive of every org it touched, once each", () => {
    const toast = swept(
      [
        { id: "a", slug: "acme" },
        { id: "b", slug: "ada" },
        { id: "c", slug: "acme" },
      ],
      { acme: "Acme", ada: "Ada" },
    );

    expect(toast.links).toEqual([
      { label: "Acme", to: "/o/acme/archive" },
      { label: "Ada", to: "/o/ada/archive" },
    ]);
  });

  it("links nowhere for the board that stands in its own org", () => {
    expect(swept([{ id: "a", slug: "acme" }]).links).toEqual([]);
  });

  it("says so when one org did not answer", () => {
    const toast = sweptToast({
      label: "Done",
      undoAt: "/me",
      archived: [{ id: "a", slug: "acme" }],
      partial: true,
    });

    expect(toast.text).toBe("Archived 1 from Done. One org did not answer.");
    expect(toast.act?.post).toEqual({ intent: "restore", id: ["a"], slug: ["acme"] });
  });
});

describe("what binds the sweep", () => {
  it("is a button and no key: it is the widest act, and it asks nothing first", () => {
    expect(Object.values(KEY_MAP).map((row) => row.label)).not.toContain("Archive");

    const html = unified([
      { status: "done", label: "Done", tasks: [card("one", "acme", "done")] },
    ]);

    // A keyed control carries its key, the way every row control does.
    expect(head(html, "Done")).not.toContain("aria-keyshortcuts");
  });
});
