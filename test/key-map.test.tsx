import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import type { Status } from "../app/board";
import { TakeMore } from "../app/focus-list";
import { KEY_MAP, type ActionName } from "../app/key-map";
import { ALL_ACTS, pressed, type Press } from "../app/unified-keys";
import { UnifiedCard } from "../app/unified-card";
import type { LiveTask } from "../app/unified";
import { UnifiedRow } from "../app/unified-row";

/** One task, as the cross-org pages draw one. */
function live(id: string, some: { status?: Status; finished?: boolean } = {}): LiveTask {
  return {
    id,
    org: { slug: "acme", name: "Acme" },
    title: id,
    status: some.status ?? "todo",
    due_date: null,
    percentile: 0.5,
    created_at: "2026-09-01",
    fields: [],
    assignees: [],
    finished: some.finished ?? false,
  };
}

const ROWS = [live("a"), live("b")];

/** What one press does on the second of two rows, with the first planned. */
function press(key: string, planned: string[] = []): Press | null {
  return pressed(key, ROWS, new Set(planned), ALL_ACTS, "b");
}

describe("the key each act binds", () => {
  // One expectation per row of the map. A new act with no line here fails the
  // last test of this block, so the map cannot grow a key nothing fires.
  const fires: Record<ActionName, () => void> = {
    next: () => expect(press(KEY_MAP.next.key)).toEqual({ kind: "cursor", id: "b" }),
    prev: () => expect(press(KEY_MAP.prev.key)).toEqual({ kind: "cursor", id: "a" }),
    open: () => expect(press(KEY_MAP.open.key)).toEqual({ kind: "open", task: ROWS[1] }),
    plan: () =>
      expect(press(KEY_MAP.plan.key)).toEqual({
        kind: "act",
        fields: { intent: "plan", id: "b", slug: "acme" },
      }),
    unplan: () =>
      expect(press(KEY_MAP.unplan.key, ["b"])).toEqual({
        kind: "act",
        fields: { intent: "unplan", id: "b", slug: "acme" },
      }),
    up: () =>
      expect(press(KEY_MAP.up.key, ["b"])).toEqual({
        kind: "act",
        fields: { intent: "up", id: "b" },
      }),
    down: () =>
      expect(press(KEY_MAP.down.key, ["b"])).toEqual({
        kind: "act",
        fields: { intent: "down", id: "b" },
      }),
    forward: () =>
      expect(press(KEY_MAP.forward.key)).toEqual({
        kind: "act",
        fields: { intent: "move", id: "b", slug: "acme", status: "in_progress" },
      }),
    back: () =>
      expect(press(KEY_MAP.back.key)).toEqual({
        kind: "act",
        fields: { intent: "move", id: "b", slug: "acme", status: "backlog" },
      }),
    finish: () =>
      expect(press(KEY_MAP.finish.key)).toEqual({
        kind: "act",
        fields: { intent: "finish", id: "b", slug: "acme" },
      }),
    // `n` is the offer that ends a batch, and it is bound where the offer is
    // drawn rather than on the list.
    more: () => expect(press(KEY_MAP.more.key)).toBe(null),
  };

  for (const [action, fired] of Object.entries(fires)) {
    it(`fires ${action} on ${KEY_MAP[action as ActionName].key}`, fired);
  }

  it("covers every act the map holds", () => {
    expect(Object.keys(fires).sort()).toEqual(Object.keys(KEY_MAP).sort());
  });
});

describe("the acts a page withholds", () => {
  const none = { plan: false, step: false, move: false };

  it("leaves the cursor, the open and the finish to every list", () => {
    expect(pressed(KEY_MAP.next.key, ROWS, new Set(), none, "a")).toEqual({
      kind: "cursor",
      id: "b",
    });
    expect(pressed(KEY_MAP.open.key, ROWS, new Set(), none, "b")).toEqual({
      kind: "open",
      task: ROWS[1],
    });
    expect(pressed(KEY_MAP.finish.key, ROWS, new Set(), none, "b")).toEqual({
      kind: "act",
      fields: { intent: "finish", id: "b", slug: "acme" },
    });
  });

  it("answers nothing to a plan, a step or a move, which is focus mode", () => {
    for (const key of [KEY_MAP.plan.key, KEY_MAP.up.key, KEY_MAP.down.key, KEY_MAP.forward.key])
      expect(pressed(key, ROWS, new Set(["b"]), none, "b")).toBe(null);
  });
});

/** The markup one control draws, through a router the fetchers need. */
function markup(element: React.ReactNode): string {
  const Stub = createRoutesStub([{ path: "/", Component: () => <>{element}</> }]);
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />);
}

/** The `aria-keyshortcuts` values one piece of markup carries, in page order. */
function shortcuts(html: string): string[] {
  return [...html.matchAll(/aria-keyshortcuts="([^"]*)"/g)].map((match) => match[1]);
}

describe("the hint a control carries", () => {
  it("names the key of every act a row draws a button for", () => {
    const html = markup(
      <ul>
        <UnifiedRow
          task={ROWS[0]}
          planned={false}
          selected={false}
          domId="row-a"
          moves={{ up: true, down: true }}
        />
      </ul>,
    );

    // Up, Down, Plan and Finish, in the order the row draws them.
    expect(shortcuts(html)).toEqual(["Shift+K", "Shift+J", "p", "x"]);
    expect(html).toContain("<kbd aria-hidden=\"true\"");
    expect(html).toContain("⇧K");
  });

  it("turns the plan hint over with the verb, and keeps the key", () => {
    const html = markup(
      <ul>
        <UnifiedRow task={ROWS[0]} planned={true} selected={false} domId="row-a" />
      </ul>,
    );

    expect(shortcuts(html)).toEqual(["p", "x"]);
    expect(html).toContain("Unplan");
  });

  it("draws no plan hint where nothing is plannable, which is focus mode", () => {
    const html = markup(
      <ul>
        <UnifiedRow
          task={ROWS[0]}
          planned={false}
          selected={false}
          domId="row-a"
          plannable={false}
        />
      </ul>,
    );

    expect(shortcuts(html)).toEqual(["x"]);
  });

  it("names the plan key on a card, and nothing on the select", () => {
    const html = markup(
      <ul>
        <UnifiedCard
          task={ROWS[0]}
          rank={1}
          planned={false}
          selected={false}
          domId="card-a"
          place={() => {}}
        />
      </ul>,
    );

    expect(shortcuts(html)).toEqual(["p"]);
  });

  it("names the key on the offer that ends a batch", () => {
    const html = markup(<TakeMore />);

    expect(shortcuts(html)).toEqual(["n"]);
    expect(html).toContain(KEY_MAP.more.label);
  });
});
