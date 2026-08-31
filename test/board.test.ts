import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import type { Status } from "../app/board";
import * as boardRoute from "../app/routes/board";
import * as loginRoute from "../app/routes/login";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";

beforeEach(wipe);

/** An account, its personal org and a cookie that signs its requests. */
async function member(email: string, name: string) {
  const auth = createAuth(env, get("/"));
  const person = await createAccount(auth, { email, name, password: PASSWORD });
  const response = (await loginRoute.action(
    routeArgs(post("/login", { intent: "password", email, password: PASSWORD })),
  )) as Response;
  const org = await db
    .prepare("SELECT id, slug FROM orgs JOIN memberships ON org_id = id WHERE user_id = ?")
    .bind(person.id)
    .first<{ id: string; slug: string }>();
  return { person, org: org!, cookie: cookieFrom(response) };
}

/** The board loader for one org, as that org's member sees it. */
function board(slug: string, cookie: string, query = "") {
  return boardRoute.loader(routeArgs(get(`/o/${slug}/board${query}`, cookie), { slug }));
}

/** A post to the board action, signed by the cookie. */
function act(slug: string, cookie: string, fields: Record<string, string>) {
  const request = post(`/o/${slug}/board`, fields);
  request.headers.set("cookie", cookie);
  return boardRoute.action(routeArgs(request, { slug }));
}

/** The tasks the loader put in one column. */
function column(data: Awaited<ReturnType<typeof board>>, status: Status) {
  return data.columns.find((one) => one.status === status);
}

describe("who can load the board", () => {
  it("sends a signed-out request to sign-in", async () => {
    const response = await caught(board("ada", ""));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?next=%2Fo%2Fada%2Fboard");
  });

  it("does not show the board to a person outside the org", async () => {
    await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");

    const response = await caught(board("ada", bo.cookie));

    expect(response.status).toBe(404);
  });

  it("does not let a person outside the org write to it", async () => {
    await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");

    const response = await caught(act("ada", bo.cookie, { intent: "create", status: "todo", title: "Theirs" }));

    expect(response.status).toBe(404);
    const { results } = await db.prepare("SELECT id FROM tasks").all();
    expect(results).toEqual([]);
  });
});

describe("the org switcher", () => {
  it("lists the orgs the person belongs to, and marks the personal one", async () => {
    const ada = await member("ada@example.test", "Ada");
    await db.prepare("INSERT INTO orgs (id, slug, name, kind) VALUES ('t1', 'codeuncode', 'codeuncode', 'team')").run();
    await db.prepare("INSERT INTO memberships (org_id, user_id, role) VALUES ('t1', ?, 'member')").bind(ada.person.id).run();
    await member("bo@example.test", "Bo");

    const data = await board("ada", ada.cookie);

    expect(data.orgs.map((one) => [one.slug, one.kind])).toEqual([
      ["ada", "personal"],
      ["codeuncode", "team"],
    ]);
  });
});

describe("quick add", () => {
  it("creates a task in that column's status", async () => {
    const ada = await member("ada@example.test", "Ada");

    await act("ada", ada.cookie, { intent: "create", status: "in_progress", title: "Write the board" });

    const data = await board("ada", ada.cookie);
    expect(column(data, "in_progress")!.tasks).toEqual([
      expect.objectContaining({ title: "Write the board" }),
    ]);
    expect(column(data, "todo")!.tasks).toEqual([]);
  });

  it("refuses an empty title", async () => {
    const ada = await member("ada@example.test", "Ada");

    await act("ada", ada.cookie, { intent: "create", status: "todo", title: "   " });

    const { results } = await db.prepare("SELECT id FROM tasks").all();
    expect(results).toEqual([]);
  });

  it("refuses a status the board does not hold", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = await caught(act("ada", ada.cookie, { intent: "create", status: "later", title: "No" }));

    expect(response.status).toBe(400);
  });
});

describe("dragging a card", () => {
  it("changes the status, and the change survives a reload", async () => {
    const ada = await member("ada@example.test", "Ada");
    await act("ada", ada.cookie, { intent: "create", status: "todo", title: "Move me" });
    const { id } = (await board("ada", ada.cookie)).columns.find((c) => c.status === "todo")!.tasks[0];

    await act("ada", ada.cookie, { intent: "move", id, status: "done" });

    const data = await board("ada", ada.cookie);
    expect(column(data, "todo")!.tasks).toEqual([]);
    expect(column(data, "done")!.tasks).toEqual([expect.objectContaining({ id, title: "Move me" })]);
  });

  it("leaves a task in another org alone", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    await act("bo", bo.cookie, { intent: "create", status: "todo", title: "Theirs" });
    const theirs = await db.prepare("SELECT id FROM tasks").first<{ id: string }>();

    const response = await caught(act("ada", ada.cookie, { intent: "move", id: theirs!.id, status: "done" }));

    expect(response.status).toBe(404);
    const row = await db.prepare("SELECT status FROM tasks WHERE id = ?").bind(theirs!.id).first<{ status: string }>();
    expect(row?.status).toBe("todo");
  });
});

describe("the columns the board shows", () => {
  it("shows Backlog on an empty board and drops it once To do fills", async () => {
    const ada = await member("ada@example.test", "Ada");

    expect((await board("ada", ada.cookie)).columns.map((one) => one.status)).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "done",
    ]);

    await act("ada", ada.cookie, { intent: "create", status: "todo", title: "Something" });

    expect((await board("ada", ada.cookie)).columns.map((one) => one.status)).toEqual([
      "todo",
      "in_progress",
      "done",
    ]);
  });

  it("leaves the Backlog toggle out while the rule already shows the column", async () => {
    const ada = await member("ada@example.test", "Ada");

    expect((await board("ada", ada.cookie)).backlogByRule).toBe(true);

    await act("ada", ada.cookie, { intent: "create", status: "todo", title: "Something" });

    expect((await board("ada", ada.cookie)).backlogByRule).toBe(false);
  });

  it("shows Backlog and Cancelled when the toggles ask for them", async () => {
    const ada = await member("ada@example.test", "Ada");
    await act("ada", ada.cookie, { intent: "create", status: "todo", title: "Something" });

    const data = await board("ada", ada.cookie, "?backlog=1&cancelled=1");

    expect(data.columns.map((one) => one.status)).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "done",
      "cancelled",
    ]);
    expect(data.toggles).toEqual({ backlog: true, cancelled: true });
  });
});

describe("the order inside a column", () => {
  /** Three cards in To do, top first, with the ids the board shows. */
  async function threeCards(cookie: string) {
    for (const title of ["Third", "Second", "First"]) {
      await act("ada", cookie, { intent: "create", status: "todo", title });
    }
    const data = await board("ada", cookie);
    return column(data, "todo")!.tasks;
  }

  /** The position of one row, straight from the table. */
  async function positionOf(id: string) {
    const row = await db.prepare("SELECT position FROM tasks WHERE id = ?").bind(id).first<{ position: number }>();
    return row!.position;
  }

  it("puts a new task at the top of its column", async () => {
    const ada = await member("ada@example.test", "Ada");

    const cards = await threeCards(ada.cookie);

    expect(cards.map((one) => one.title)).toEqual(["First", "Second", "Third"]);
  });

  it("writes the midpoint of the new neighbours, and leaves every other row alone", async () => {
    const ada = await member("ada@example.test", "Ada");
    const [first, second, third] = await threeCards(ada.cookie);
    const before = {
      first: await positionOf(first.id),
      second: await positionOf(second.id),
      third: await positionOf(third.id),
    };

    // First lands above Third, so it takes the midpoint of Second and Third.
    await act("ada", ada.cookie, { intent: "move", id: first.id, status: "todo", before: third.id });

    expect(await positionOf(first.id)).toBe(before.second + (before.third - before.second) / 2);
    expect(await positionOf(second.id)).toBe(before.second);
    expect(await positionOf(third.id)).toBe(before.third);
  });

  it("keeps the new order after a reload", async () => {
    const ada = await member("ada@example.test", "Ada");
    const [first, second, third] = await threeCards(ada.cookie);

    await act("ada", ada.cookie, { intent: "move", id: third.id, status: "todo", before: second.id });

    const cards = column(await board("ada", ada.cookie), "todo")!.tasks;
    expect(cards.map((one) => one.title)).toEqual(["First", "Third", "Second"]);
  });

  it("drops a card at the bottom when the drop names no neighbour", async () => {
    const ada = await member("ada@example.test", "Ada");
    const [first] = await threeCards(ada.cookie);

    await act("ada", ada.cookie, { intent: "move", id: first.id, status: "todo" });

    const cards = column(await board("ada", ada.cookie), "todo")!.tasks;
    expect(cards.map((one) => one.title)).toEqual(["Second", "Third", "First"]);
  });

  it("renumbers the column when the gap is too tight to split", async () => {
    const ada = await member("ada@example.test", "Ada");
    const [first, second, third] = await threeCards(ada.cookie);
    // Two cards a hair apart leave no fraction between them.
    await db
      .prepare("UPDATE tasks SET position = ? WHERE id = ?")
      .bind(1 + Number.EPSILON, third.id)
      .run();
    await db.prepare("UPDATE tasks SET position = 1 WHERE id = ?").bind(second.id).run();

    await act("ada", ada.cookie, { intent: "move", id: first.id, status: "todo", before: third.id });

    const cards = column(await board("ada", ada.cookie), "todo")!.tasks;
    expect(cards.map((one) => one.title)).toEqual(["Second", "First", "Third"]);
  });

  it("reads an empty neighbour, as the arrow at the foot of a column sends", async () => {
    const ada = await member("ada@example.test", "Ada");
    const [first] = await threeCards(ada.cookie);

    await act("ada", ada.cookie, { intent: "move", id: first.id, status: "todo", before: "" });

    const cards = column(await board("ada", ada.cookie), "todo")!.tasks;
    expect(cards.map((one) => one.title)).toEqual(["Second", "Third", "First"]);
  });

  it("lands a card dropped into another column at the bottom of it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await act("ada", ada.cookie, { intent: "create", status: "done", title: "Older" });
    const [first] = await threeCards(ada.cookie);

    await act("ada", ada.cookie, { intent: "move", id: first.id, status: "done" });

    const cards = column(await board("ada", ada.cookie), "done")!.tasks;
    expect(cards.map((one) => one.title)).toEqual(["Older", "First"]);
  });
});

describe("one person's own order", () => {
  /** A team org that both Ada and Bo belong to, and their cookies. */
  async function team() {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    await db.prepare("INSERT INTO orgs (id, slug, name, kind) VALUES ('t1', 'team', 'Team', 'team')").run();
    for (const one of [ada, bo]) {
      await db
        .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES ('t1', ?, 'member')")
        .bind(one.person.id)
        .run();
    }
    for (const title of ["Third", "Second", "First"]) {
      await act("team", ada.cookie, { intent: "create", status: "todo", title });
    }
    return { ada, bo };
  }

  /** The titles one member reads down a column. */
  async function titles(cookie: string, status: Status = "todo") {
    return column(await board("team", cookie), status)!.tasks.map((one) => one.title);
  }

  /** Every task of the org, with its shared position and one person's rank. */
  async function rows(personId: string) {
    const { results } = await db
      .prepare(
        `SELECT title, position, ranks.rank FROM tasks
         LEFT JOIN task_ranks AS ranks ON ranks.task_id = tasks.id AND ranks.user_id = ?`,
      )
      .bind(personId)
      .all<{ title: string; position: number; rank: number | null }>();
    return results;
  }

  it("writes a rank for the person who dragged, and leaves the shared position alone", async () => {
    const { ada } = await team();
    const before = await rows(ada.person.id);
    const first = column(await board("team", ada.cookie), "todo")!.tasks[0];

    await act("team", ada.cookie, { intent: "rank", status: "todo", id: first.id });

    expect(await titles(ada.cookie)).toEqual(["Second", "Third", "First"]);
    const after = await rows(ada.person.id);
    expect(after.map((one) => one.position)).toEqual(before.map((one) => one.position));
    expect(after.filter((one) => one.rank !== null).map((one) => one.title)).toEqual(["First"]);
  });

  it("leaves the other member's board as the org left it", async () => {
    const { ada, bo } = await team();
    const first = column(await board("team", ada.cookie), "todo")!.tasks[0];

    await act("team", ada.cookie, { intent: "rank", status: "todo", id: first.id });

    expect(await titles(bo.cookie)).toEqual(["First", "Second", "Third"]);
  });

  it("marks the cards that differ from the board, for the person who ranked them", async () => {
    const { ada, bo } = await team();
    const first = column(await board("team", ada.cookie), "todo")!.tasks[0];

    await act("team", ada.cookie, { intent: "rank", status: "todo", id: first.id });

    const mine = column(await board("team", ada.cookie), "todo")!.tasks;
    expect(mine.filter((one) => one.marked).map((one) => one.title)).toEqual(["First"]);
    const theirs = column(await board("team", bo.cookie), "todo")!.tasks;
    expect(theirs.every((one) => !one.marked)).toBe(true);
  });

  it("marks a card once a teammate moves the shared order under it", async () => {
    const { ada, bo } = await team();
    const [, second, third] = column(await board("team", ada.cookie), "todo")!.tasks;
    // Ada drops Second where the board already puts it, so nothing differs.
    await act("team", ada.cookie, { intent: "rank", status: "todo", id: second.id, before: third.id });
    expect(column(await board("team", ada.cookie), "todo")!.tasks.some((one) => one.marked)).toBe(false);

    // Bo moves the shared position of the same card to the bottom.
    await act("team", bo.cookie, { intent: "move", status: "todo", id: second.id });

    expect(await titles(ada.cookie)).toEqual(["First", "Second", "Third"]);
    expect(
      column(await board("team", ada.cookie), "todo")!
        .tasks.filter((one) => one.marked)
        .map((one) => one.title),
    ).toEqual(["Second"]);
  });

  it("clears that person's ranks for one column, and leaves another column alone", async () => {
    const { ada } = await team();
    await act("team", ada.cookie, { intent: "create", status: "done", title: "Older" });
    await act("team", ada.cookie, { intent: "create", status: "done", title: "Newer" });
    const todo = column(await board("team", ada.cookie), "todo")!.tasks;
    const done = column(await board("team", ada.cookie), "done")!.tasks;
    await act("team", ada.cookie, { intent: "rank", status: "todo", id: todo[0].id });
    await act("team", ada.cookie, { intent: "rank", status: "done", id: done[0].id });

    await act("team", ada.cookie, { intent: "reset", status: "todo" });

    expect(await titles(ada.cookie)).toEqual(["First", "Second", "Third"]);
    expect(await titles(ada.cookie, "done")).toEqual(["Older", "Newer"]);
  });

  it("leaves the ranks of the other members where they are", async () => {
    const { ada, bo } = await team();
    const first = column(await board("team", ada.cookie), "todo")!.tasks[0];
    await act("team", ada.cookie, { intent: "rank", status: "todo", id: first.id });
    await act("team", bo.cookie, { intent: "rank", status: "todo", id: first.id });

    await act("team", bo.cookie, { intent: "reset", status: "todo" });

    expect(await titles(ada.cookie)).toEqual(["Second", "Third", "First"]);
    expect(await titles(bo.cookie)).toEqual(["First", "Second", "Third"]);
  });

  it("spreads that person's order when the gap is too tight to split", async () => {
    const { ada, bo } = await team();
    const [first, second, third] = column(await board("team", ada.cookie), "todo")!.tasks;
    // Two ranks a hair apart leave no fraction between them.
    for (const [task, rank] of [[second, 1], [third, 1 + Number.EPSILON]] as const) {
      await db
        .prepare("INSERT INTO task_ranks (task_id, user_id, rank) VALUES (?, ?, ?)")
        .bind(task.id, ada.person.id, rank)
        .run();
    }

    await act("team", ada.cookie, { intent: "rank", status: "todo", id: first.id, before: third.id });

    expect(await titles(ada.cookie)).toEqual(["Second", "First", "Third"]);
    expect(await titles(bo.cookie)).toEqual(["First", "Second", "Third"]);
  });

  it("keeps one person's rank while another member moves the card on the board", async () => {
    const { ada, bo } = await team();
    const first = column(await board("team", ada.cookie), "todo")!.tasks[0];
    await act("team", ada.cookie, { intent: "rank", status: "todo", id: first.id });

    await act("team", bo.cookie, { intent: "move", status: "done", id: first.id });

    const row = await db
      .prepare("SELECT user_id FROM task_ranks WHERE task_id = ?")
      .bind(first.id)
      .first<{ user_id: string }>();
    expect(row?.user_id).toBe(ada.person.id);
  });

  it("does not let a person outside the org rank a task in it", async () => {
    const { ada } = await team();
    const first = column(await board("team", ada.cookie), "todo")!.tasks[0];
    const outsider = await member("cy@example.test", "Cy");

    const response = await caught(act("team", outsider.cookie, { intent: "rank", status: "todo", id: first.id }));

    expect(response.status).toBe(404);
    const { results } = await db.prepare("SELECT task_id FROM task_ranks").all();
    expect(results).toEqual([]);
  });
});
