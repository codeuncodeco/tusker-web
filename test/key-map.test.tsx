import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import type { Status } from "../app/board";
import { FocusList, TakeMore } from "../app/focus-list";
import { KEY_MAP, type ActionName } from "../app/key-map";
import type { LiveTask } from "../app/unified";
import { ALL_ACTS, READ_ACTS, pressed, type Press } from "../app/unified-keys";
import { UnifiedRow } from "../app/unified-row";

/** One task, as the cross-org pages draw one. */
function live(id: string, some: { status?: Status; finished?: boolean } = {}): LiveTask {
  return {
    id,
    org: { slug: "acme", name: "Acme", color: "blue" },
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
  // One line per row of the map, and the key is written out. Reading it back
  // off the map would only prove the map equals itself. A new act with no line
  // here fails the last test of this block, so the map cannot grow a key
  // nothing fires.
  const fires: Record<ActionName, { key: string; press: () => void }> = {
    next: { key: "j", press: () => expect(press("j")).toEqual({ kind: "cursor", id: "b" }) },
    prev: { key: "k", press: () => expect(press("k")).toEqual({ kind: "cursor", id: "a" }) },
    open: { key: "Enter", press: () => expect(press("Enter")).toEqual({ kind: "open", task: ROWS[1] }) },
    plan: {
      key: "p",
      press: () =>
        expect(press("p")).toEqual({
          kind: "act",
          fields: { intent: "plan", id: "b", slug: "acme" },
        }),
    },
    unplan: {
      key: "p",
      press: () =>
        expect(press("p", ["b"])).toEqual({
          kind: "act",
          fields: { intent: "unplan", id: "b", slug: "acme" },
        }),
    },
    up: {
      key: "K",
      press: () => expect(press("K", ["b"])).toEqual({ kind: "act", fields: { intent: "up", id: "b" } }),
    },
    down: {
      key: "J",
      press: () =>
        expect(press("J", ["b"])).toEqual({ kind: "act", fields: { intent: "down", id: "b" } }),
    },
    top: {
      key: "T",
      press: () =>
        expect(press("T", ["b"])).toEqual({ kind: "act", fields: { intent: "top", id: "b" } }),
    },
    forward: {
      key: ">",
      press: () =>
        expect(press(">")).toEqual({
          kind: "act",
          fields: { intent: "move", id: "b", slug: "acme", status: "in_progress" },
        }),
    },
    back: {
      key: "<",
      press: () =>
        expect(press("<")).toEqual({
          kind: "act",
          fields: { intent: "move", id: "b", slug: "acme", status: "backlog" },
        }),
    },
    finish: {
      key: "x",
      press: () =>
        expect(press("x")).toEqual({
          kind: "act",
          fields: { intent: "finish", id: "b", slug: "acme" },
        }),
    },
    // `n` is the offer that ends a batch, so the list ignores it. The offer
    // binds it where it is drawn, which the render test below reads.
    more: { key: "n", press: () => expect(press("n")).toBe(null) },
    // The same letter, and the same answer here: `n` goes to the quick-add
    // box, which the keyed list hands the press to. See ADR-0022.
    add: { key: "n", press: () => expect(press("n")).toBe(null) },
    clear: {
      key: "Escape",
      press: () => expect(press("Escape")).toEqual({ kind: "cursor", id: null }),
    },
  };

  for (const [action, fired] of Object.entries(fires)) {
    it(`fires ${action} on ${fired.key}`, () => {
      expect(KEY_MAP[action as ActionName].key).toBe(fired.key);
      fired.press();
    });
  }

  it("covers every act the map holds", () => {
    expect(Object.keys(fires).sort()).toEqual(Object.keys(KEY_MAP).sort());
  });
});

describe("the empty cursor", () => {
  /** What one press does on a list the cursor names no row of. */
  function empty(key: string): Press | null {
    return pressed(key, ROWS, new Set(), ALL_ACTS, null);
  }

  it("comes back from outside the list, in the way of the key", () => {
    expect(empty(KEY_MAP.next.key)).toEqual({ kind: "cursor", id: "a" });
    expect(empty(KEY_MAP.prev.key)).toEqual({ kind: "cursor", id: "b" });
  });

  it("leaves every key that needs a card alone", () => {
    for (const key of [
      KEY_MAP.open.key,
      KEY_MAP.plan.key,
      KEY_MAP.up.key,
      KEY_MAP.down.key,
      KEY_MAP.top.key,
      KEY_MAP.forward.key,
      KEY_MAP.back.key,
      KEY_MAP.finish.key,
    ])
      expect(empty(key)).toBe(null);
  });

  // The header menu and the decision prompt read Escape too, so a list with
  // nothing to clear leaves the press to them.
  it("answers nothing to Escape, which has nothing to clear", () => {
    expect(empty(KEY_MAP.clear.key)).toBe(null);
  });

  it("has nothing to move on an empty list", () => {
    expect(pressed(KEY_MAP.next.key, [], new Set(), ALL_ACTS, null)).toBe(null);
    expect(pressed(KEY_MAP.prev.key, [], new Set(), ALL_ACTS, null)).toBe(null);
  });
});

describe("the rows an order ranks", () => {
  // Every key posts what a control posts, so a row the page draws no move
  // button on answers none of the three keys. A week page draws none on a
  // member finished this week. See ADR-0021.
  it("answers no move on a row the order leaves out", () => {
    for (const key of [KEY_MAP.up.key, KEY_MAP.down.key, KEY_MAP.top.key])
      expect(pressed(key, ROWS, new Set(["a", "b"]), ALL_ACTS, "b", new Set(["a"]))).toBe(null);
  });

  it("answers a move on a row it ranks", () => {
    expect(pressed(KEY_MAP.top.key, ROWS, new Set(["a", "b"]), ALL_ACTS, "b", new Set(["b"])))
      .toEqual({ kind: "act", fields: { intent: "top", id: "b" } });
  });

  // Every other page ranks whatever it picked, so the picked set is the answer.
  it("falls back to the picked set, which is every other page", () => {
    expect(pressed(KEY_MAP.up.key, ROWS, new Set(["b"]), ALL_ACTS, "b")).toEqual({
      kind: "act",
      fields: { intent: "up", id: "b" },
    });
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

  it("answers nothing to a plan, a move or a step, which is focus mode", () => {
    for (const key of [
      KEY_MAP.plan.key,
      KEY_MAP.up.key,
      KEY_MAP.down.key,
      KEY_MAP.top.key,
      KEY_MAP.forward.key,
    ])
      expect(pressed(key, ROWS, new Set(["b"]), none, "b")).toBe(null);
  });

  // A day past its own reads back. The plan is not rewritten there, and the
  // task itself is live, so a move still moves it. See #66.
  it("answers nothing to a plan or a step on a list read back, and still moves", () => {
    for (const key of [KEY_MAP.plan.key, KEY_MAP.up.key, KEY_MAP.down.key, KEY_MAP.top.key])
      expect(pressed(key, ROWS, new Set(["b"]), READ_ACTS, "b")).toBe(null);

    expect(pressed(KEY_MAP.forward.key, ROWS, new Set(["b"]), READ_ACTS, "b")).not.toBe(null);
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

describe("the cursor a page draws first", () => {
  // The cursor starts empty, so a person who has neither clicked nor pressed
  // a key has no card named at them. `aria-current` is what names one, and
  // the mark a person sees is drawn beside it. See ADR-0015.
  it("names no card until a person picks one", () => {
    const html = markup(<FocusList tasks={ROWS} />);

    expect(html).not.toContain("aria-current");
  });
});

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

    // Up, Down, Top, Plan and Finish, in the order the row draws them. The
    // promote is beside the steps, because a key is part of the control.
    expect(shortcuts(html)).toEqual(["Shift+K", "Shift+J", "Shift+T", "p", "x"]);
    expect(html).toContain("⇧K");
    // The mark is the eye's, so a screen reader passes it by, and a phone
    // never draws it: `pointer-fine:` is what hides it, and a typo there would
    // hide every hint on every device instead.
    expect(html).toContain('<kbd aria-hidden="true" class="ml-1 hidden pointer-fine:inline">');
  });

  // No `moves`, so no step and no promote: the list ranks no row of its own.
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

  it("names the key on the offer that ends a batch", () => {
    const html = markup(<TakeMore />);

    expect(shortcuts(html)).toEqual(["n"]);
    expect(html).toContain(KEY_MAP.more.label);
  });
});
