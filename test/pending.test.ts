/**
 * What a page draws while its posts are in flight: the server's answer, with
 * every post it has not answered yet laid over it. See #168.
 */

import { describe, expect, it } from "vitest";

import { addsSent, boardSent, failureText, tasksSent } from "../app/pending";
import type { LiveTask } from "../app/unified";

/** One post, as a fetcher holds it while it is in flight. */
function sent(fields: Record<string, string | string[]>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) form.append(name, one);
  }
  return form;
}

/** An org board with To do and Done, each card named by its id. */
function board(todo: string[], done: string[] = []) {
  return [
    { status: "todo" as const, label: "To do", tasks: todo.map((id) => ({ id })) },
    { status: "done" as const, label: "Done", tasks: done.map((id) => ({ id })) },
  ];
}

/** The ids each column draws, in order. */
function ids(columns: ReturnType<typeof board>) {
  return columns.map((column) => column.tasks.map((card) => card.id));
}

describe("the org board, while a post is in flight", () => {
  it("draws what the server said when nothing is in flight", () => {
    expect(ids(boardSent(board(["a", "b"]), []))).toEqual([["a", "b"], []]);
  });

  it("draws a moved card in its new column at once, at the bottom", () => {
    const columns = boardSent(board(["a", "b"], ["c"]), [
      sent({ intent: "move", id: "a", status: "done", before: "" }),
    ]);

    expect(ids(columns)).toEqual([["b"], ["c", "a"]]);
  });

  it("draws a dropped card above the card it was dropped on", () => {
    const columns = boardSent(board(["a", "b"], ["c"]), [
      sent({ intent: "move", id: "b", status: "done", before: "c" }),
    ]);

    expect(ids(columns)).toEqual([["a"], ["b", "c"]]);
  });

  it("takes a card off the board when it moves to a column the board does not draw", () => {
    const columns = boardSent(board(["a", "b"]), [
      sent({ intent: "move", id: "a", status: "backlog", before: "" }),
    ]);

    expect(ids(columns)).toEqual([["b"], []]);
  });

  it("steps a card one place inside its column", () => {
    expect(ids(boardSent(board(["a", "b", "c"]), [sent({ intent: "down", id: "a" })]))).toEqual([
      ["b", "a", "c"],
      [],
    ]);
    expect(ids(boardSent(board(["a", "b", "c"]), [sent({ intent: "up", id: "c" })]))).toEqual([
      ["a", "c", "b"],
      [],
    ]);
  });

  it("lays a burst of steps over each other, so a held key walks the card", () => {
    const burst = [1, 2, 3].map(() => sent({ intent: "down", id: "a" }));

    expect(ids(boardSent(board(["a", "b", "c", "d"]), burst))).toEqual([["b", "c", "d", "a"], []]);
  });

  it("stops a step at the end of the column", () => {
    expect(ids(boardSent(board(["a", "b"]), [sent({ intent: "up", id: "a" })]))).toEqual([
      ["a", "b"],
      [],
    ]);
  });

  it("takes archived cards off the board at once", () => {
    const columns = boardSent(board(["a"], ["b", "c", "d"]), [
      sent({ intent: "archive", id: ["b", "d"], slug: ["acme", "acme"] }),
    ]);

    expect(ids(columns)).toEqual([["a"], ["c"]]);
  });

  it("ignores a post it has nothing to draw for", () => {
    const columns = boardSent(board(["a"]), [sent({ intent: "restore", id: "x" })]);

    expect(ids(columns)).toEqual([["a"], []]);
  });
});

/** A live task of the personal org, named by its id. */
function task(id: string, status: LiveTask["status"] = "todo"): LiveTask {
  return {
    id,
    org: { slug: "me", name: "Me", color: null },
    title: id,
    status,
    due_date: null,
    percentile: 0,
    created_at: "2026-10-01T00:00:00.000Z",
    fields: [],
    assignees: [],
    finished: status === "done" || status === "cancelled",
  };
}

describe("the cross-org lists, while a post is in flight", () => {
  const tasks = [task("a"), task("b"), task("c", "in_progress")];

  it("draws a moved task in its new column, at the bottom of it", () => {
    const after = tasksSent(tasks, [], [sent({ intent: "move", id: "a", slug: "me", status: "done" })]);
    const moved = after.tasks.find((one) => one.id === "a")!;

    expect(moved.status).toBe("done");
    expect(moved.finished).toBe(true);
    expect(moved.percentile).toBe(1);
  });

  it("draws a finished task as done", () => {
    const after = tasksSent(tasks, [], [sent({ intent: "finish", id: "c", slug: "me" })]);

    expect(after.tasks.find((one) => one.id === "c")).toMatchObject({ status: "done", finished: true });
  });

  it("takes archived tasks away", () => {
    const after = tasksSent(tasks, [], [sent({ intent: "archive", id: ["a", "c"], slug: ["me", "me"] })]);

    expect(after.tasks.map((one) => one.id)).toEqual(["b"]);
  });

  it("puts a pick at the foot of a plan, and takes an unpick out", () => {
    expect(tasksSent(tasks, ["b"], [sent({ intent: "plan", id: "a", slug: "me" })]).picked).toEqual([
      "b",
      "a",
    ]);
    expect(tasksSent(tasks, ["b", "a"], [sent({ intent: "unplan", id: "b", slug: "me" })]).picked).toEqual([
      "a",
    ]);
  });

  it("puts a pick on top where the page's picks claim the top", () => {
    const after = tasksSent(tasks, ["b"], [sent({ intent: "plan", id: "a", slug: "me" })], "top");

    expect(after.picked).toEqual(["a", "b"]);
  });

  it("reads a second press against the first, so `p` twice is a pick and an unpick", () => {
    const after = tasksSent(tasks, [], [
      sent({ intent: "plan", id: "a", slug: "me" }),
      sent({ intent: "unplan", id: "a", slug: "me" }),
    ]);

    expect(after.picked).toEqual([]);
  });

  it("moves a row through the picked order, one step at a time or to either end", () => {
    const order = ["a", "b", "c"];

    expect(tasksSent(tasks, order, [sent({ intent: "down", id: "a" })]).picked).toEqual(["b", "a", "c"]);
    expect(tasksSent(tasks, order, [sent({ intent: "top", id: "c" })]).picked).toEqual(["c", "a", "b"]);
    expect(tasksSent(tasks, order, [sent({ intent: "bottom", id: "a" })]).picked).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("lays a burst of `J` presses over each other", () => {
    const burst = [1, 2].map(() => sent({ intent: "down", id: "a" }));

    expect(tasksSent(tasks, ["a", "b", "c"], burst).picked).toEqual(["b", "c", "a"]);
  });

  it("leaves the server's lists alone when nothing is in flight", () => {
    const after = tasksSent(tasks, ["a"], []);

    expect(after.tasks).toEqual(tasks);
    expect(after.picked).toEqual(["a"]);
  });
});

describe("the tasks an add in flight draws", () => {
  it("draws one title per line, in the order typed", () => {
    expect(addsSent([sent({ intent: "create", title: "one\n\n two " })])).toEqual(["one", "two"]);
  });

  it("draws only the adds of the column the box sits on, where a page names one", () => {
    const posts = [
      sent({ intent: "create", status: "todo", title: "here" }),
      sent({ intent: "create", status: "done", title: "there" }),
    ];

    expect(addsSent(posts, "todo")).toEqual(["here"]);
  });

  it("draws nothing for a post that is not an add", () => {
    expect(addsSent([sent({ intent: "move", id: "a", status: "todo" })], "todo")).toEqual([]);
  });
});

describe("what a failed post tells the person", () => {
  it("names the reason the server gave", () => {
    const refused = { status: 400, statusText: "Bad Request", internal: false, data: "A plan is never rewritten after its day." };

    expect(failureText(refused)).toBe("Not saved. A plan is never rewritten after its day.");
  });

  it("says the server could not be reached when the post never arrived", () => {
    expect(failureText(new TypeError("Failed to fetch"))).toBe(
      "Not saved. Tusker could not reach the server.",
    );
  });
});
