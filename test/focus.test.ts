import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import type { Status } from "../app/board";
import * as focusRoute from "../app/routes/me.focus";
import * as loginRoute from "../app/routes/login";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";
const DAY = "2026-09-01";
/** The week that Tuesday sits in. */
const WEEK = "2026-W36";

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
    db
      .prepare("INSERT INTO orgs (id, slug, name, kind) VALUES (?, ?, ?, 'team')")
      .bind(id, slug, slug),
    db
      .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
      .bind(id, personId),
  ]);
  return { id, slug };
}

/** A task, placed by hand so a test can state the column order it wants. */
async function task(orgId: string, id: string, some: { status?: Status; position?: number } = {}) {
  await db
    .prepare("INSERT INTO tasks (id, org_id, title, status, position) VALUES (?, ?, ?, ?, ?)")
    .bind(id, orgId, id, some.status ?? "todo", some.position ?? 1)
    .run();
  return id;
}

/** Several To do tasks of one org, in the order the column holds them. */
async function column(orgId: string, ...ids: string[]) {
  for (const [at, id] of ids.entries()) await task(orgId, id, { position: at + 1 });
}

/** A week set, written as if the week page wrote it. */
async function weekSet(personId: string, ids: string[], week = WEEK) {
  await db.batch([
    db.prepare("INSERT INTO week_plans (user_id, week) VALUES (?, ?)").bind(personId, week),
    ...ids.map((id, at) =>
      db
        .prepare(
          "INSERT INTO week_plan_tasks (user_id, week, task_id, position) VALUES (?, ?, ?, ?)",
        )
        .bind(personId, week, id, at + 1),
    ),
  ]);
}

/** A day's plan, written as if plan mode wrote it. */
async function plan(personId: string, ids: string[], day = DAY) {
  await db
    .prepare("INSERT INTO plans (user_id, day, task_ids) VALUES (?, ?, ?)")
    .bind(personId, day, JSON.stringify(ids))
    .run();
}

/** Focus mode, as one person reads it on one day. */
function focus(cookie: string, day = DAY) {
  return focusRoute.loader(routeArgs(get("/me/focus", `${cookie}; day=${day}`)));
}

/** A post to focus mode, signed by the cookie and named for a day. */
function act(cookie: string, fields: Record<string, string>, day = DAY) {
  const request = post("/me/focus", fields);
  request.headers.set("cookie", `${cookie}; day=${day}`);
  return focusRoute.action(routeArgs(request));
}

/** The ids the batch holds, in the order the screen draws them. */
function batch(data: Awaited<ReturnType<typeof focus>>) {
  return data.focus.batch.tasks.map((one) => one.id);
}

/** The order one plans row holds. */
async function stored(personId: string, day = DAY) {
  const row = await db
    .prepare("SELECT task_ids FROM plans WHERE user_id = ? AND day = ?")
    .bind(personId, day)
    .first<{ task_ids: string }>();
  return row ? (JSON.parse(row.task_ids) as string[]) : null;
}

describe("who can read focus mode", () => {
  it("sends a signed-out request to sign-in", async () => {
    const response = await caught(focusRoute.loader(routeArgs(get("/me/focus"))));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?next=%2Fme%2Ffocus");
  });
});

describe("the batch a plan draws", () => {
  it("is the first three of the plan, in plan order", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b", "c", "d");
    await plan(ada.person.id, ["d", "c", "b", "a"]);

    const data = await focus(ada.cookie);

    expect(batch(data)).toEqual(["d", "c", "b"]);
    expect(data.focus.batch.left).toBe(1);
    expect(data.focus.batch.number).toBe(1);
  });

  it("holds tasks of several orgs", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await task(ada.org.id, "mine");
    await task(other.id, "ours");
    await plan(ada.person.id, ["ours", "mine"]);

    const data = await focus(ada.cookie);

    expect(data.focus.batch.tasks.map((one) => one.org.slug)).toEqual(["codeuncode", ada.org.slug]);
  });

  it("shows what there is, under three", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b");
    await plan(ada.person.id, ["a", "b"]);

    expect(batch(await focus(ada.cookie))).toEqual(["a", "b"]);
  });

  it("says so when the plan is empty", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a");
    await plan(ada.person.id, []);

    const data = await focus(ada.cookie);

    expect(data.focus.batch.tasks).toEqual([]);
    expect(data.focus.planEmpty).toBe(true);
  });

  it("leaves out a planned task that was archived, without an error", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b", "c", "d");
    await plan(ada.person.id, ["a", "b", "c", "d"]);
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 'b'").run();

    expect(batch(await focus(ada.cookie))).toEqual(["a", "c", "d"]);
  });
});

describe("the batch with no plan", () => {
  it("is the first three of the unified view, in that page's order", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await column(ada.org.id, "a", "b", "c");
    await task(other.id, "now", { status: "in_progress" });

    const data = await focus(ada.cookie);

    // In progress before To do, which is the order `/me` draws.
    expect(batch(data)).toEqual(["now", "a", "b"]);
    expect(data.focus.planned).toBe(false);
    expect(data.focus.batch.left).toBe(1);
  });

  it("hides a Backlog task, which is not work for today", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a");
    await task(ada.org.id, "later", { status: "backlog" });

    expect(batch(await focus(ada.cookie))).toEqual(["a"]);
  });
});

describe("the batch with no plan but a week set", () => {
  it("is the first three of the week set, in week order", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b", "c", "d", "e");
    await weekSet(ada.person.id, ["e", "d", "c", "b"]);

    const data = await focus(ada.cookie);

    // The order is the person's own, so the three are the three they ranked
    // first and not the three their columns happen to lead with. See ADR-0021.
    expect(batch(data)).toEqual(["e", "d", "c"]);
    expect(data.focus.planned).toBe(false);
  });

  it("takes the week order over the status split, as a plan does", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await column(ada.org.id, "a", "b");
    await task(other.id, "now", { status: "in_progress" });
    await weekSet(ada.person.id, ["a", "b", "now"]);

    expect(batch(await focus(ada.cookie))).toEqual(["a", "b", "now"]);
  });

  it("leaves out a member no live task answers for", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b", "gone");
    await task(ada.org.id, "later", { status: "backlog" });
    await weekSet(ada.person.id, ["a", "later", "gone"]);
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 'gone'").run();

    // Backlog is not work for today, and an archived task is not work at all.
    expect(batch(await focus(ada.cookie))).toEqual(["a"]);
  });

  it("draws from the unified view where the person started no week", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b");

    expect(batch(await focus(ada.cookie))).toEqual(["a", "b"]);
  });

  it("draws nothing where the set is started and holds no work", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b");
    await weekSet(ada.person.id, []);

    const data = await focus(ada.cookie);

    // An empty set is not the same as no set, so the live set does not step
    // in for it. See ADR-0014.
    expect(data.focus.batch.tasks).toEqual([]);
    expect(data.focus.weekEmpty).toBe(true);
    expect(data.focus.more).toBe(2);
  });

  it("draws nothing where every member of the set is finished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b");
    await weekSet(ada.person.id, ["a"]);
    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });

    const data = await focus(ada.cookie);

    // The finish wrote the batch as the day's plan, so the plan answers from
    // here on and the page says the plan is done, not the set.
    expect(data.focus.planned).toBe(true);
    expect(data.focus.weekEmpty).toBe(false);
    expect(data.focus.planEmpty).toBe(false);
    expect(data.focus.batch.tasks).toEqual([]);
  });

  it("reads the set of the week the day sits in, and no other", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b");
    await weekSet(ada.person.id, ["b"], "2026-W37");

    expect(batch(await focus(ada.cookie))).toEqual(["a", "b"]);
  });

  it("writes the batch as the day's plan on the first finish", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b", "c", "d");
    await weekSet(ada.person.id, ["b", "c", "d"]);

    await act(ada.cookie, { intent: "finish", id: "b", slug: ada.org.slug });

    expect(await stored(ada.person.id)).toEqual(["b", "c", "d"]);
    // The plan holds the batch from here on, so no fourth task slides in.
    expect(batch(await focus(ada.cookie))).toEqual(["b", "c", "d"]);
  });

  it("takes nothing more while the week set still holds unfinished work", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b", "c", "d");
    await weekSet(ada.person.id, ["a"]);

    await act(ada.cookie, { intent: "more" });

    expect(await stored(ada.person.id)).toBe(null);
  });

  it("takes the first three of the live set once the set is done", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b", "c", "d");
    await weekSet(ada.person.id, []);

    await act(ada.cookie, { intent: "more" });

    expect(await stored(ada.person.id)).toEqual(["a", "b", "c"]);
  });

  it("takes nothing more while the live set itself draws the batch", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b", "c", "d");

    await act(ada.cookie, { intent: "more" });

    // The button is drawn only under a batch that is done, and the guard says
    // the same, whichever list drew that batch.
    expect(await stored(ada.person.id)).toBe(null);
  });
});

describe("finishing from focus", () => {
  it("finishes the task, and keeps it in the batch struck through", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b", "c", "d");
    await plan(ada.person.id, ["a", "b", "c", "d"]);

    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });
    const data = await focus(ada.cookie);

    expect(batch(data)).toEqual(["a", "b", "c"]);
    expect(data.focus.batch.tasks[0].finished).toBe(true);
  });

  it("shows the next batch only once the batch holds no unfinished task", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b", "c", "d", "e");
    await plan(ada.person.id, ["a", "b", "c", "d", "e"]);

    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "finish", id: "b", slug: ada.org.slug });
    expect(batch(await focus(ada.cookie))).toEqual(["a", "b", "c"]);

    await act(ada.cookie, { intent: "finish", id: "c", slug: ada.org.slug });
    const data = await focus(ada.cookie);

    expect(batch(data)).toEqual(["d", "e"]);
    expect(data.focus.batch.number).toBe(2);
  });

  it("writes the batch as the day's plan, so no fourth task slides in", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b", "c", "d");

    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });

    expect(await stored(ada.person.id)).toEqual(["a", "b", "c"]);
    expect(batch(await focus(ada.cookie))).toEqual(["a", "b", "c"]);
  });

  it("says the plan is done once every planned task is finished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a");
    await plan(ada.person.id, ["a"]);

    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });
    const data = await focus(ada.cookie);

    expect(data.focus.batch.tasks).toEqual([]);
    expect(data.focus.batch.number).toBe(0);
    expect(data.focus.planEmpty).toBe(false);
    expect(data.focus.planned).toBe(true);
  });
});

describe("taking three more", () => {
  it("appends the next three of the unified view, once the batch is done", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b", "c", "d", "e");
    await plan(ada.person.id, ["a"]);
    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });

    await act(ada.cookie, { intent: "more" });

    expect(await stored(ada.person.id)).toEqual(["a", "b", "c", "d"]);
    expect(batch(await focus(ada.cookie))).toEqual(["a", "b", "c"]);
  });

  it("takes nothing while the batch still holds an unfinished task", async () => {
    const ada = await member("ada@example.test", "Ada");
    await column(ada.org.id, "a", "b", "c", "d");
    await plan(ada.person.id, ["a"]);

    await act(ada.cookie, { intent: "more" });

    expect(await stored(ada.person.id)).toEqual(["a"]);
  });
});

describe("the form focus answers", () => {
  it("refuses a form that names no act", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = await caught(act(ada.cookie, { intent: "nonsense" }));

    expect(response.status).toBe(400);
  });
});
