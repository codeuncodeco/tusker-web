import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import { isFinished, type Status } from "../app/board";
import * as loginRoute from "../app/routes/login";
import * as meRoute from "../app/routes/me";
import * as planRoute from "../app/routes/me.plan";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";
const DAY = "2026-09-01";

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

/** A second org the person is a member of. */
async function team(personId: string, slug: string) {
  const id = `org-${slug}`;
  await db.batch([
    db.prepare("INSERT INTO orgs (id, slug, name, kind) VALUES (?, ?, ?, 'team')").bind(id, slug, slug),
    db.prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')").bind(id, personId),
  ]);
  return { id, slug };
}

/** A task, placed by hand so a test can state the column order it wants. */
async function task(
  orgId: string,
  id: string,
  some: {
    status?: Status;
    position?: number;
    due?: string | null;
    created?: string;
    /** The last write of the row. The cap does not read it. */
    updated?: string;
    /**
     * When the work was over, which is what the seven-day cap reads. A
     * finished task carries today by default, so a test that says nothing
     * about the time gets a task inside the cap.
     */
    finished?: string;
  } = {},
) {
  const over = isFinished(some.status ?? "todo");
  await db
    .prepare(
      `INSERT INTO tasks (id, org_id, title, status, position, due_date, created_at, updated_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      orgId,
      id,
      some.status ?? "todo",
      some.position ?? 1,
      some.due ?? null,
      some.created ?? "2026-01-01T00:00:00.000Z",
      some.updated ?? `${DAY}T09:00:00.000Z`,
      some.finished ?? (over ? `${DAY}T09:00:00.000Z` : null),
    )
    .run();
  return id;
}

/** The unified board, as one person reads it on one day. */
function page(cookie: string, query = "", day = DAY) {
  return meRoute.loader(routeArgs(get(`/me${query}`, `${cookie}; day=${day}`)));
}

/** A post to the page, signed by the cookie and named for a day. */
function act(cookie: string, fields: Record<string, string>, day = DAY) {
  const request = post("/me", fields);
  request.headers.set("cookie", `${cookie}; day=${day}`);
  return meRoute.action(routeArgs(request));
}

/** The columns the board drew, in board order. */
function columns(data: Awaited<ReturnType<typeof page>>): Status[] {
  return data.columns.map((one) => one.status);
}

/** The ids one column holds, in the order the board draws them. */
function ids(data: Awaited<ReturnType<typeof page>>, status: Status): string[] {
  return data.columns.find((one) => one.status === status)?.tasks.map((one) => one.id) ?? [];
}

describe("who can read the unified board", () => {
  it("sends a signed-out request to sign-in", async () => {
    const response = await caught(meRoute.loader(routeArgs(get("/me"))));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?next=%2Fme");
  });
});

describe("the org set", () => {
  it("holds every org the person belongs to", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await task(ada.org.id, "mine");
    await task(other.id, "ours");

    expect(ids(await page(ada.cookie), "todo").sort()).toEqual(["mine", "ours"]);
  });

  it("holds no task from an org the person is not in", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    await task(bo.org.id, "theirs");
    await task(ada.org.id, "mine");

    expect(ids(await page(ada.cookie), "todo")).toEqual(["mine"]);
  });

  it("holds no archived task", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "gone");
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 'gone'").run();
    await task(ada.org.id, "shown");

    expect(ids(await page(ada.cookie), "todo")).toEqual(["shown"]);
  });
});

describe("the columns", () => {
  it("draws To do and In progress, and nothing else, by default", async () => {
    const ada = await member("ada@example.test", "Ada");

    expect(columns(await page(ada.cookie))).toEqual(["todo", "in_progress"]);
  });

  it("draws Backlog, To do, In progress, Done and Cancelled, in that order", async () => {
    const ada = await member("ada@example.test", "Ada");

    const data = await page(ada.cookie, "?backlog=1&done=1&cancelled=1");

    expect(columns(data)).toEqual(["backlog", "todo", "in_progress", "done", "cancelled"]);
  });

  it("draws Backlog only when the toggle asks, whatever the live columns hold", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "later", { status: "backlog" });

    // The org board would show Backlog here, because no live task is left.
    expect(columns(await page(ada.cookie))).toEqual(["todo", "in_progress"]);
    expect(ids(await page(ada.cookie, "?backlog=1"), "backlog")).toEqual(["later"]);
  });

  it("puts each task in the column its status names", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "later", { status: "backlog" });
    await task(ada.org.id, "now", { status: "in_progress" });
    await task(ada.org.id, "over", { status: "done" });
    await task(ada.org.id, "dropped", { status: "cancelled" });
    await task(ada.org.id, "next");

    const data = await page(ada.cookie, "?backlog=1&done=1&cancelled=1");

    expect(ids(data, "backlog")).toEqual(["later"]);
    expect(ids(data, "todo")).toEqual(["next"]);
    expect(ids(data, "in_progress")).toEqual(["now"]);
    expect(ids(data, "done")).toEqual(["over"]);
    expect(ids(data, "cancelled")).toEqual(["dropped"]);
  });
});

describe("the seven-day cap", () => {
  it("holds a task finished inside the last seven days", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "recent", { status: "done", finished: "2026-08-27T00:00:00.000Z" });

    expect(ids(await page(ada.cookie, "?done=1"), "done")).toEqual(["recent"]);
  });

  it("drops a task finished more than seven days ago", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "old", { status: "done", finished: "2026-08-20T00:00:00.000Z" });
    await task(ada.org.id, "gone", { status: "cancelled", finished: "2026-08-20T00:00:00.000Z" });

    const data = await page(ada.cookie, "?done=1&cancelled=1");

    expect(ids(data, "done")).toEqual([]);
    expect(ids(data, "cancelled")).toEqual([]);
  });

  it("reads the finish time, so an edit does not drag an old task back in", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "typo-fixed", {
      status: "done",
      finished: "2026-03-01T00:00:00.000Z",
      updated: `${DAY}T08:00:00.000Z`,
    });

    expect(ids(await page(ada.cookie, "?done=1"), "done")).toEqual([]);
  });

  it("holds a task finished this week and untouched since", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "clean", {
      status: "done",
      finished: "2026-08-30T00:00:00.000Z",
      updated: "2026-08-30T00:00:00.000Z",
    });

    expect(ids(await page(ada.cookie, "?done=1"), "done")).toEqual(["clean"]);
  });

  it("caps no live column, so an old To do task still shows", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ancient", { updated: "2020-01-01T00:00:00.000Z" });

    expect(ids(await page(ada.cookie), "todo")).toEqual(["ancient"]);
  });
});

describe("the order inside a column", () => {
  it("is the percentile: the place in its own org column over its length", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    // Second of two is 1.0 and second of four is 0.5, so the short column's
    // second card falls to the end.
    await task(ada.org.id, "short-1", { position: 1 });
    await task(ada.org.id, "short-2", { position: 2 });
    for (let place = 1; place <= 4; place++) await task(other.id, `long-${place}`, { position: place });

    expect(ids(await page(ada.cookie), "todo")).toEqual([
      "long-1",
      "long-2",
      "short-1",
      "long-3",
      "long-4",
      "short-2",
    ]);
  });

  it("measures a Done card against its own Done column", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "live-1", { position: 1 });
    await task(ada.org.id, "over-1", { status: "done", position: 1 });
    await task(ada.org.id, "over-2", { status: "done", position: 2 });

    const done = (await page(ada.cookie, "?done=1")).columns.find((one) => one.status === "done")!;

    expect(done.tasks.map((one) => one.percentile)).toEqual([0.5, 1]);
  });

  it("breaks a percentile tie on the due date, a dated task above an undated one", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    // Two columns of two, so each org's first card is 0.5 and its second is 1.
    await task(ada.org.id, "late", { position: 1, due: "2026-03-02" });
    await task(ada.org.id, "none", { position: 2 });
    await task(other.id, "soon", { position: 1, due: "2026-03-01" });
    await task(other.id, "dated", { position: 2, due: "2030-12-31" });

    expect(ids(await page(ada.cookie), "todo")).toEqual(["soon", "late", "dated", "none"]);
  });

  it("breaks a date tie on created_at, and then on the id", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await task(ada.org.id, "b", { position: 1, created: "2026-01-01T00:00:00.000Z" });
    await task(ada.org.id, "d", { position: 2, created: "2026-01-03T00:00:00.000Z" });
    await task(other.id, "a", { position: 1, created: "2026-01-01T00:00:00.000Z" });
    await task(other.id, "c", { position: 2, created: "2026-01-02T00:00:00.000Z" });

    expect(ids(await page(ada.cookie), "todo")).toEqual(["a", "b", "c", "d"]);
  });

  it("gives the same order on two loads of an unchanged board", async () => {
    const ada = await member("ada@example.test", "Ada");
    for (const id of ["a", "b", "c", "d"]) await task(ada.org.id, id, { position: 1 });

    const first = await page(ada.cookie);
    const again = await page(ada.cookie);

    expect(ids(again, "todo")).toEqual(ids(first, "todo"));
    expect(ids(first, "todo")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("what a card carries", () => {
  it("names the org, the due date and the assignees", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await task(other.id, "a", { due: "2026-10-01" });
    await db
      .prepare("INSERT INTO task_assignees (task_id, org_id, user_id) VALUES ('a', ?, ?)")
      .bind(other.id, ada.person.id)
      .run();

    const card = (await page(ada.cookie)).columns[0].tasks[0];

    expect(card).toMatchObject({
      org: { slug: "codeuncode", name: "codeuncode" },
      due_date: "2026-10-01",
    });
    expect(card.assignees.map((one) => one.initials)).toEqual(["A"]);
  });

  it("shows the org's card fields, and a ref id the cache does not hold raw", async () => {
    const ada = await member("ada@example.test", "Ada");
    await db.batch([
      db
        .prepare(
          `INSERT INTO org_fields (org_id, key, label, type, refs_path, show_on_card, position)
           VALUES (?, 'trail', 'Trail', 'reference', 'trails', 1, 1)`,
        )
        .bind(ada.org.id),
      db
        .prepare(
          "INSERT INTO org_ref_options (org_id, field_key, ext_id, label) VALUES (?, 'trail', 'known', 'Kumara Parvatha')",
        )
        .bind(ada.org.id),
    ]);
    await task(ada.org.id, "cached", { position: 1 });
    await task(ada.org.id, "missed", { position: 2 });
    await db.prepare("UPDATE tasks SET data = '{\"trail\":\"known\"}' WHERE id = 'cached'").run();
    await db.prepare("UPDATE tasks SET data = '{\"trail\":\"gone\"}' WHERE id = 'missed'").run();

    const cards = (await page(ada.cookie)).columns[0].tasks;

    expect(cards.map((one) => one.fields.map((field) => field.value))).toEqual([
      ["Kumara Parvatha"],
      ["gone"],
    ]);
  });

  it("gives a card the dot the org board draws", async () => {
    const ada = await member("ada@example.test", "Ada");
    await db.batch([
      db
        .prepare(
          `INSERT INTO org_fields (org_id, key, label, type, refs_path, show_on_card, position)
           VALUES (?, 'client', 'Client', 'reference', 'clients', 1, 1)`,
        )
        .bind(ada.org.id),
      db
        .prepare("INSERT INTO org_field_colors (org_id, field_key, value, color) VALUES (?, 'client', 'acme', 'teal')")
        .bind(ada.org.id),
    ]);
    await task(ada.org.id, "a");
    await db.prepare("UPDATE tasks SET data = '{\"client\":\"acme\"}' WHERE id = 'a'").run();

    const cards = (await page(ada.cookie)).columns[0].tasks;

    expect(cards[0].fields).toEqual([
      { key: "client", label: "Client", value: "acme", color: "teal" },
    ]);
  });
});

describe("moving a task", () => {
  it("moves it to the column the select names", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "move", id: "a", slug: ada.org.slug, status: "in_progress" });

    expect(ids(await page(ada.cookie), "in_progress")).toEqual(["a"]);
  });

  it("lands it at the bottom of that column in its own org", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "first", { status: "in_progress", position: 1 });
    await task(ada.org.id, "second", { status: "in_progress", position: 2 });
    await task(ada.org.id, "moved");

    await act(ada.cookie, { intent: "move", id: "moved", slug: ada.org.slug, status: "in_progress" });

    expect(ids(await page(ada.cookie), "in_progress")).toEqual(["first", "second", "moved"]);
  });

  it("does not move a task from an org the person is not in", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    await task(bo.org.id, "theirs");

    const response = await caught(
      act(ada.cookie, { intent: "move", id: "theirs", slug: bo.org.slug, status: "done" }),
    );

    expect(response.status).toBe(404);
    const row = await db.prepare("SELECT status FROM tasks WHERE id = 'theirs'").first<{ status: string }>();
    expect(row?.status).toBe("todo");
  });

  it("refuses a column that is not a status", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    const response = await caught(
      act(ada.cookie, { intent: "move", id: "a", slug: ada.org.slug, status: "someday" }),
    );

    expect(response.status).toBe(400);
  });

  it("raises the decision prompt when the move finishes a marked task", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await db.prepare("UPDATE tasks SET decides = 1 WHERE id = 'a'").run();

    const response = (await act(ada.cookie, {
      intent: "move",
      id: "a",
      slug: ada.org.slug,
      status: "done",
    })) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("ask=a");
  });
});

describe("the quick-add box", () => {
  it("files the task into the column the box sits on", async () => {
    const ada = await member("ada@example.test", "Ada");

    await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "start it",
      status: "in_progress",
    });

    const row = await db
      .prepare("SELECT status FROM tasks WHERE title = 'start it'")
      .first<{ status: string }>();
    expect(row?.status).toBe("in_progress");
  });

  it("files into the org the picker names", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");

    await act(ada.cookie, { intent: "create", slug: other.slug, title: "ours", status: "todo" });

    const row = await db
      .prepare("SELECT org_id FROM tasks WHERE title = 'ours'")
      .first<{ org_id: string }>();
    expect(row?.org_id).toBe(other.id);
  });

  it("files into To do when the box names no column", async () => {
    const ada = await member("ada@example.test", "Ada");

    await act(ada.cookie, { intent: "create", slug: ada.org.slug, title: "loose" });

    const row = await db
      .prepare("SELECT status FROM tasks WHERE title = 'loose'")
      .first<{ status: string }>();
    expect(row?.status).toBe("todo");
  });

  it("asks a marked task typed straight into Done for its decision", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = (await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "decided",
      status: "done",
      decides: "1",
    })) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("ask=");
  });

  it("leaves an unmarked task typed into Done alone, and offers the undo", async () => {
    const ada = await member("ada@example.test", "Ada");

    const acted = await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "over",
      status: "done",
    });

    expect(acted).toMatchObject({ added: { slug: ada.org.slug, text: "over" } });
  });

  it("does not file into an org the person is not in", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");

    const response = await caught(
      act(ada.cookie, { intent: "create", slug: bo.org.slug, title: "theirs", status: "todo" }),
    );

    expect(response.status).toBe(404);
  });
});

describe("the Today chip", () => {
  it("narrows every column to the tasks today's plan holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "planned");
    await task(ada.org.id, "running", { status: "in_progress" });
    await task(ada.org.id, "loose");

    await act(ada.cookie, { intent: "plan", id: "planned", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "running", slug: ada.org.slug });
    const data = await page(ada.cookie, "?today=1");

    expect(data.today).toBe(true);
    expect(ids(data, "todo")).toEqual(["planned"]);
    expect(ids(data, "in_progress")).toEqual(["running"]);
  });

  it("draws no chip for a person with no plan for today", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    expect((await page(ada.cookie)).hasPlan).toBe(false);
  });

  it("draws no chip once the plan is emptied, and narrows nothing", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });
    const data = await page(ada.cookie, "?today=1");

    expect(data.hasPlan).toBe(false);
    expect(data.today).toBe(false);
    expect(ids(data, "todo")).toEqual(["a"]);
  });

  it("keeps a planned task in its own column, not in a Today column", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    const data = await page(ada.cookie);

    expect(columns(data)).toEqual(["todo", "in_progress"]);
    expect(ids(data, "todo")).toEqual(["a"]);
    expect(data.planned).toEqual(["a"]);
  });
});

describe("plan mode keeps the list", () => {
  it("draws the live set as groups, and no Done or Cancelled column", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "next");
    await task(ada.org.id, "now", { status: "in_progress" });
    await task(ada.org.id, "later", { status: "backlog" });
    await task(ada.org.id, "over", { status: "done" });

    const data = await planRoute.loader(
      routeArgs(get("/me/plan", `${ada.cookie}; day=${DAY}`), {}),
    );

    expect(data.groups.map((one) => one.key)).toEqual(["today", "in_progress", "todo"]);
    expect(data.groups.flatMap((one) => one.tasks.map((task) => task.id)).sort()).toEqual([
      "next",
      "now",
    ]);
  });
});

describe("what the page refuses", () => {
  it("does not plan a task from an org the person is not in", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    await task(bo.org.id, "theirs");

    const response = await caught(act(ada.cookie, { intent: "plan", id: "theirs", slug: bo.org.slug }));

    expect(response.status).toBe(404);
    const { results } = await db.prepare("SELECT day FROM plans").all();
    expect(results).toEqual([]);
  });

  it("does not finish a task from an org the person is not in", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    await task(bo.org.id, "theirs");

    const response = await caught(act(ada.cookie, { intent: "finish", id: "theirs", slug: bo.org.slug }));

    expect(response.status).toBe(404);
    const row = await db.prepare("SELECT status FROM tasks WHERE id = 'theirs'").first<{ status: string }>();
    expect(row?.status).toBe("todo");
  });

  it("does not plan a Backlog task, which must move to To do first", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "later", { status: "backlog" });

    const response = await caught(act(ada.cookie, { intent: "plan", id: "later", slug: ada.org.slug }));

    expect(response.status).toBe(400);
    const { results } = await db.prepare("SELECT day FROM plans").all();
    expect(results).toEqual([]);
  });

  it("does not plan a task already Done", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "over", { status: "done" });

    const response = await caught(act(ada.cookie, { intent: "plan", id: "over", slug: ada.org.slug }));

    expect(response.status).toBe(400);
  });

  it("leaves a task that is already Done where it is", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });
    const first = await db.prepare("SELECT position FROM tasks WHERE id = 'a'").first<{ position: number }>();

    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });

    const again = await db.prepare("SELECT status, position FROM tasks WHERE id = 'a'").first<{
      status: string;
      position: number;
    }>();
    expect(again).toEqual({ status: "done", position: first!.position });
  });

  it("refuses a form that names no act", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    const response = await caught(act(ada.cookie, { intent: "shout", id: "a", slug: ada.org.slug }));

    expect(response.status).toBe(400);
  });
});
