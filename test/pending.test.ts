/**
 * What a page draws while its posts are in flight: the server's answer, with
 * every post it has not answered yet laid over it. See #168.
 */

import { describe, expect, it } from "vitest";

import {
  addsSent,
  boardSent,
  failureText,
  taskSent,
  tasksSent,
  tickedSent,
} from "../app/pending";
import type { TaskId } from "../app/task-number";
import type { LiveTask } from "../app/unified";

/** One post, as a fetcher holds it while it is in flight. A form posts text, so a task number goes out as its digits. */
function sent(fields: Record<string, string | number | (string | number)[]>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) form.append(name, String(one));
  }
  return form;
}

/** An org board with To do and Done, each card named by its id. */
function board(todo: TaskId[], done: TaskId[] = []) {
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
    expect(ids(boardSent(board([1, 2]), []))).toEqual([[1, 2], []]);
  });

  it("draws a moved card in its new column at once, at the bottom", () => {
    const columns = boardSent(board([1, 2], [3]), [
      sent({ intent: "move", id: 1, status: "done", before: "" }),
    ]);

    expect(ids(columns)).toEqual([[2], [3, 1]]);
  });

  it("draws a dropped card above the card it was dropped on", () => {
    const columns = boardSent(board([1, 2], [3]), [
      sent({ intent: "move", id: 2, status: "done", before: 3 }),
    ]);

    expect(ids(columns)).toEqual([[1], [2, 3]]);
  });

  it("takes a card off the board when it moves to a column the board does not draw", () => {
    const columns = boardSent(board([1, 2]), [
      sent({ intent: "move", id: 1, status: "backlog", before: "" }),
    ]);

    expect(ids(columns)).toEqual([[2], []]);
  });

  it("steps a card one place inside its column", () => {
    expect(ids(boardSent(board([1, 2, 3]), [sent({ intent: "down", id: 1 })]))).toEqual([
      [2, 1, 3],
      [],
    ]);
    expect(ids(boardSent(board([1, 2, 3]), [sent({ intent: "up", id: 3 })]))).toEqual([
      [1, 3, 2],
      [],
    ]);
  });

  it("lays a burst of steps over each other, so a held key walks the card", () => {
    const burst = [1, 2, 3].map(() => sent({ intent: "down", id: 1 }));

    expect(ids(boardSent(board([1, 2, 3, 4]), burst))).toEqual([[2, 3, 4, 1], []]);
  });

  it("stops a step at the end of the column", () => {
    expect(ids(boardSent(board([1, 2]), [sent({ intent: "up", id: 1 })]))).toEqual([
      [1, 2],
      [],
    ]);
  });

  it("takes archived cards off the board at once", () => {
    const columns = boardSent(board([1], [2, 3, 4]), [
      sent({ intent: "archive", id: [2, 4], slug: ["acme", "acme"] }),
    ]);

    expect(ids(columns)).toEqual([[1], [3]]);
  });

  it("ignores a post it has nothing to draw for", () => {
    const columns = boardSent(board([1]), [sent({ intent: "restore", id: 9 })]);

    expect(ids(columns)).toEqual([[1], []]);
  });
});

/** A live task of one org, named by its id. */
function task(id: TaskId, status: LiveTask["status"] = "todo", percentile = 0): LiveTask {
  return {
    id,
    org: { slug: "me", name: "Me", color: null },
    title: `Task ${id}`,
    status,
    due_date: null,
    percentile,
    created_at: "2026-10-01T00:00:00.000Z",
    fields: [],
    assignees: [],
    finished: status === "done" || status === "cancelled",
  };
}

describe("the cross-org lists, while a post is in flight", () => {
  const tasks = [task(1), task(2), task(3, "in_progress")];

  it("draws a moved task in its new column, at the bottom of it", () => {
    const after = tasksSent(tasks, [], [sent({ intent: "move", id: 1, slug: "me", status: "done" })]);
    const moved = after.tasks.find((one) => one.id === 1)!;

    expect(moved.status).toBe("done");
    expect(moved.finished).toBe(true);
    expect(moved.percentile).toBe(1);
  });

  it("draws a finished task as done", () => {
    const after = tasksSent(tasks, [], [sent({ intent: "finish", id: 3, slug: "me" })]);

    expect(after.tasks.find((one) => one.id === 3)).toMatchObject({ status: "done", finished: true });
  });

  it("takes archived tasks away", () => {
    const after = tasksSent(tasks, [], [sent({ intent: "archive", id: [1, 3], slug: ["me", "me"] })]);

    expect(after.tasks.map((one) => one.id)).toEqual([2]);
  });

  it("puts a pick at the foot of a plan, and takes an unpick out", () => {
    expect(tasksSent(tasks, [2], [sent({ intent: "plan", id: 1, slug: "me" })]).picked).toEqual([
      2,
      1,
    ]);
    expect(tasksSent(tasks, [2, 1], [sent({ intent: "unplan", id: 2, slug: "me" })]).picked).toEqual([
      1,
    ]);
  });

  it("puts a pick on top where the page's picks claim the top", () => {
    const after = tasksSent(tasks, [2], [sent({ intent: "plan", id: 1, slug: "me" })], "top");

    expect(after.picked).toEqual([1, 2]);
  });

  it("reads a second press against the first, so `p` twice is a pick and an unpick", () => {
    const after = tasksSent(tasks, [], [
      sent({ intent: "plan", id: 1, slug: "me" }),
      sent({ intent: "unplan", id: 1, slug: "me" }),
    ]);

    expect(after.picked).toEqual([]);
  });

  it("moves a row through the picked order, one step at a time or to either end", () => {
    const order = [1, 2, 3];

    expect(tasksSent(tasks, order, [sent({ intent: "down", id: 1 })]).picked).toEqual([2, 1, 3]);
    expect(tasksSent(tasks, order, [sent({ intent: "top", id: 3 })]).picked).toEqual([3, 1, 2]);
    expect(tasksSent(tasks, order, [sent({ intent: "bottom", id: 1 })]).picked).toEqual([
      2,
      3,
      1,
    ]);
  });

  it("lays a burst of `J` presses over each other", () => {
    const burst = [1, 2].map(() => sent({ intent: "down", id: 1 }));

    expect(tasksSent(tasks, [1, 2, 3], burst).picked).toEqual([2, 3, 1]);
  });

  // A drag names the card of the same org it lands above. The server places
  // it there inside the org, so the guess draws it just above that card.
  // See ADR-0025.
  it("draws a dragged task just above the card the drop named", () => {
    const spread = [task(1, "todo", 0.2), task(2, "todo", 0.5), task(3, "todo", 0.8)];
    const after = tasksSent(spread, [], [
      sent({ intent: "move", id: 3, slug: "me", status: "todo", before: 2 }),
    ]);
    const moved = after.tasks.find((one) => one.id === 3)!;

    expect(moved.percentile).toBeGreaterThan(0.2);
    expect(moved.percentile).toBeLessThan(0.5);
  });

  it("places a dragged row of the plan above the row the drop named, or at the foot", () => {
    const order = [1, 2, 3];

    expect(tasksSent(tasks, order, [sent({ intent: "place", id: 3, before: 1 })]).picked).toEqual([
      3,
      1,
      2,
    ]);
    expect(tasksSent(tasks, order, [sent({ intent: "place", id: 1, before: "" })]).picked).toEqual([
      2,
      3,
      1,
    ]);
  });

  it("leaves the server's lists alone when nothing is in flight", () => {
    const after = tasksSent(tasks, [1], []);

    expect(after.tasks).toEqual(tasks);
    expect(after.picked).toEqual([1]);
  });
});

describe("the tasks an add in flight draws", () => {
  it("draws one title per line, in the order typed", () => {
    expect(addsSent([sent({ intent: "create", title: "one\n\n two " })])).toEqual(["one", "two"]);
  });

  it("draws nothing for a post that is not an add", () => {
    expect(addsSent([sent({ intent: "move", id: 1, status: "todo" })])).toEqual([]);
  });
});

describe("a description box, while its ticks are in flight", () => {
  it("flips once for each tick in flight, because the server flips once for each post", () => {
    const one = [sent({ intent: "tick", box: "2" })];
    const two = [...one, sent({ intent: "tick", box: "2" })];

    expect(tickedSent(false, 2, one)).toBe(true);
    expect(tickedSent(false, 2, two)).toBe(false);
  });

  it("reads only the ticks of its own box", () => {
    expect(tickedSent(true, 0, [sent({ intent: "tick", box: "1" })])).toBe(true);
  });
});

describe("the task page, while its controls post", () => {
  const held = {
    title: "Pack",
    status: "todo" as const,
    due_date: "2026-12-01",
    decides: true,
    data: { client: "Acme", kind: "Bug" },
    assignees: ["ada"],
  };

  it("draws what the server said when nothing is in flight", () => {
    expect(taskSent(held, [])).toEqual(held);
  });

  it("draws each control's posted value at once, and leaves the others", () => {
    expect(
      taskSent(held, [
        sent({ intent: "title", title: " Pack the tent " }),
        sent({ intent: "status", status: "in_progress" }),
        sent({ intent: "due", due_date: "" }),
        sent({ intent: "mark", decides: "0" }),
        sent({ intent: "field", key: "kind", "field.kind": "Chore" }),
        sent({ intent: "field", key: "client", "field.client": "" }),
      ]),
    ).toEqual({
      ...held,
      title: "Pack the tent",
      status: "in_progress",
      due_date: null,
      decides: false,
      data: { kind: "Chore" },
    });
  });

  it("draws one tick per assignee, the later post over the earlier", () => {
    expect(
      taskSent(held, [
        sent({ intent: "assign", assignee: "grace", held: "1" }),
        sent({ intent: "assign", assignee: "ada", held: "0" }),
        sent({ intent: "assign", assignee: "bo", held: "1" }),
        sent({ intent: "assign", assignee: "bo", held: "0" }),
      ]).assignees,
    ).toEqual(["grace"]);
  });

  it("reads a post of another page's kind as nothing", () => {
    expect(taskSent(held, [sent({ intent: "tick", box: "0" })])).toEqual(held);
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
