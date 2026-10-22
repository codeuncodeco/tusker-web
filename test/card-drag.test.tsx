/**
 * A card drags from anywhere on it and holds no empty line. There is no grip:
 * movement tells a drag from a click. The keys already move a card, so the
 * drag makes no card a tab stop or a button. A control never adds a line to a
 * card: the Archive button is gone from the org board card, and the unified
 * card draws one content line, only when it holds something. See #182,
 * ADR-0025 and ADR-0041.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import Board from "../app/routes/board";
import type { Group, LiveTask } from "../app/unified";
import { UnifiedCard } from "../app/unified-card";
import { UnifiedList } from "../app/unified-list";

function live(id: number, more: Partial<LiveTask> = {}): LiveTask {
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
    ...more,
  };
}

function markup(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/", Component: () => <>{element}</> }]);
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />);
}

/** The org board, with one card in To do and one in Done. */
function orgBoard(): string {
  const card = (id: number, title: string) => ({ id, title, fields: [], assignees: [] });
  const loaderData = {
    org: { slug: "acme", name: "Acme" },
    columns: [
      { status: "todo", label: "To do", tasks: [card(1, "open")] },
      { status: "in_progress", label: "In progress", tasks: [] },
      { status: "done", label: "Done", tasks: [card(2, "shipped")] },
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

/** A card that drags: a list item with the grab cursor. */
const DRAGS = /<li[^>]*class="[^"]*\bcursor-grab\b[^"]*"[^>]*>/g;

function dragging(html: string): number {
  return html.match(DRAGS)?.length ?? 0;
}

describe("the whole-card drag", () => {
  it("draws no grip on any card", () => {
    const unified = markup(<UnifiedCard task={live(1)} selected={false} domId="c1" place={() => {}} showsOrg />);

    expect(orgBoard()).not.toContain("data-grip");
    expect(unified).not.toContain("data-grip");
  });

  it("makes every org board card drag", () => {
    expect(dragging(orgBoard())).toBe(2);
  });

  it("makes a unified board card drag", () => {
    const html = markup(<UnifiedCard task={live(1)} selected={false} domId="c1" place={() => {}} showsOrg />);

    expect(dragging(html)).toBe(1);
  });

  it("makes a row of the plan drag, and no row that does not drag", () => {
    const plan: Group[] = [{ key: "today", label: "Plan", tasks: [live(1), live(2)], sinks: false }];
    const week: Group[] = [{ key: "week", label: "This week", tasks: [live(1)], sinks: true }];
    const planned = new Set([1, 2]);

    const drags = markup(<UnifiedList groups={plan} planned={planned} day="2026-10-09" showsOrg ordered="today" drags />);
    const still = markup(<UnifiedList groups={week} planned={planned} day="2026-10-09" showsOrg ordered="week" />);

    expect(dragging(drags)).toBe(2);
    expect(dragging(still)).toBe(0);
  });

  it("makes no card a tab stop or a button, because the keys already move a card", () => {
    for (const card of orgBoard().match(DRAGS) ?? []) {
      expect(card).not.toContain("tabindex");
      expect(card).not.toContain("role=");
    }
  });
});

describe("the org board card", () => {
  it("carries no Archive button, even in Done", () => {
    const html = orgBoard();

    expect(html).not.toContain('aria-label="Archive shipped"');
    // The sweep still archives the column.
    expect(html).toContain('aria-label="Archive 1 from Done"');
  });
});

/**
 * The title line leads with the title. Nothing sits before it: a card shows
 * no rank. See #192.
 */
// The finish ring may sit before it: it finishes, and it ranks nothing.
const TITLE_LEADS = /<span class="flex items-baseline gap-2">(?:<button[^>]*aria-label="(?:Finish|Open)[^"]*"[^>]*>.*?<\/button>)?<a /g;

describe("a board card", () => {
  it("shows no rank on the org board, so the line leads with the title", () => {
    const html = orgBoard();

    expect(html.match(TITLE_LEADS)?.length).toBe(2);
  });

  it("shows no rank on the unified board, so the line leads with the title", () => {
    const html = markup(<UnifiedCard task={live(1)} selected={false} domId="c1" place={() => {}} showsOrg />);

    expect(html.match(TITLE_LEADS)?.length).toBe(1);
  });
});

/** The elements directly inside the first `<li>` of the markup: a card's lines. */
function lines(html: string): string[] {
  const VOID = new Set(["input", "br", "img", "hr"]);
  const card = html.slice(html.indexOf("<li"));
  const found: string[] = [];
  let depth = 0;
  let start = 0;
  for (const tag of card.matchAll(/<(\/?)([a-z0-9-]+)[^>]*>/g)) {
    const [whole, closing, name] = tag;
    const at = tag.index;
    if (closing) {
      depth -= 1;
      if (depth === 1) found.push(card.slice(start, at + whole.length));
      if (depth === 0) break;
    } else if (!VOID.has(name)) {
      if (depth === 1) start = at;
      depth += 1;
    }
  }
  return found;
}

describe("the unified card's lines", () => {
  function card(task: LiveTask): string {
    return markup(<UnifiedCard task={task} selected={false} domId="c1" place={() => {}} showsOrg />);
  }

  it("are the title line and the org chip's line when the task has no fields and no due date", () => {
    const [title, content, ...more] = lines(card(live(1)));

    expect(title).toContain(">Task 1<");
    expect(content).toContain("Acme");
    expect(more).toEqual([]);
  });

  it("put the org chip, the fields and the due date on one line under the title", () => {
    const [, content, ...more] = lines(
      card(
        live(1, {
          due_date: "2026-10-12",
          fields: [{ key: "size", label: "Size", value: "Large", color: "red" }],
        }),
      ),
    );

    expect(content).toContain("Acme");
    expect(content).toContain("Large");
    expect(content).toContain("2026-10-12");
    expect(more).toEqual([]);
  });
});
