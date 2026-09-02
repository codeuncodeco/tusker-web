import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import type { Status } from "../app/board";
import * as loginRoute from "../app/routes/login";
import * as weekRoute from "../app/routes/me.week";
import { cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";
/** A Tuesday, the week it sits in, and the two weeks before it. */
const DAY = "2026-09-01";
const WEEK = "2026-W36";
const LAST = "2026-W35";
const BEFORE = "2026-W34";

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

/** A week one person planned, written as that week left it. */
async function weekSet(personId: string, week: string, taskIds: string[]) {
  await db.batch([
    db.prepare("INSERT INTO week_plans (user_id, week) VALUES (?, ?)").bind(personId, week),
    ...taskIds.map((id) =>
      db
        .prepare("INSERT INTO week_plan_tasks (user_id, week, task_id) VALUES (?, ?, ?)")
        .bind(personId, week, id),
    ),
  ]);
}

/** The week page, as one person reads it on the day their browser is in. */
function weekPage(cookie: string, day = DAY) {
  return weekRoute.loader(routeArgs(get("/me/week", `${cookie}; day=${day}`)));
}

/** A post to the week page, signed by the cookie and named for a day. */
function act(cookie: string, fields: Record<string, string>, day = DAY) {
  const request = post("/me/week", fields);
  request.headers.set("cookie", `${cookie}; day=${day}`);
  return weekRoute.action(routeArgs(request));
}

/** The set one week holds, or null where the person started no such week. */
async function stored(personId: string, week = WEEK) {
  const started = await db
    .prepare("SELECT week FROM week_plans WHERE user_id = ? AND week = ?")
    .bind(personId, week)
    .first();
  if (!started) return null;
  const { results } = await db
    .prepare("SELECT task_id FROM week_plan_tasks WHERE user_id = ? AND week = ? ORDER BY task_id")
    .bind(personId, week)
    .all<{ task_id: string }>();
  return results.map((row) => row.task_id);
}

describe("the prompt", () => {
  it("offers the unfinished members of the last week set", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await task(ada.org.id, "b", { position: 2 });
    await weekSet(ada.person.id, LAST, ["a", "b"]);

    const data = await weekPage(ada.cookie);

    expect(data.leftovers).toEqual({ from: LAST, taskIds: ["a", "b"] });
  });

  it("names the week it carries from, which is not always the week before", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await weekSet(ada.person.id, BEFORE, ["a"]);

    expect((await weekPage(ada.cookie)).leftovers?.from).toBe(BEFORE);
  });

  it("is absent when the last week left nothing unfinished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a", { status: "done" });
    await weekSet(ada.person.id, LAST, ["a"]);

    expect((await weekPage(ada.cookie)).leftovers).toBe(null);
  });

  it("is absent when the person planned no earlier week", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    expect((await weekPage(ada.cookie)).leftovers).toBe(null);
  });

  it("is absent once this week holds a row, however empty the set is", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await weekSet(ada.person.id, LAST, ["a"]);
    await weekSet(ada.person.id, WEEK, []);

    expect((await weekPage(ada.cookie)).leftovers).toBe(null);
  });

  it("reads the last week that holds a set, not the week before this one", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await task(ada.org.id, "b", { position: 2 });
    await weekSet(ada.person.id, BEFORE, ["b"]);
    await weekSet(ada.person.id, LAST, ["a"]);

    expect((await weekPage(ada.cookie)).leftovers).toEqual({ from: LAST, taskIds: ["a"] });
  });

  it("says nothing about a set for a later week", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await weekSet(ada.person.id, "2026-W37", ["a"]);

    expect((await weekPage(ada.cookie)).leftovers).toBe(null);
  });

  it("is raised on a week the path names as it is on this one", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await weekSet(ada.person.id, LAST, ["a"]);

    const data = await weekRoute.loader(
      routeArgs(get("/me/week/2026-W37", `${ada.cookie}; day=${DAY}`), { week: "2026-W37" }),
    );

    expect(data.leftovers).toEqual({ from: LAST, taskIds: ["a"] });
  });
});

describe("what a leftover is", () => {
  it("skips a task now Done or Cancelled, and keeps the rest", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "done", { status: "done" });
    await task(ada.org.id, "dropped", { status: "cancelled" });
    await task(ada.org.id, "working", { status: "in_progress" });
    await task(ada.org.id, "open", { position: 2 });
    await weekSet(ada.person.id, LAST, ["done", "open", "dropped", "working"]);

    expect((await weekPage(ada.cookie)).leftovers?.taskIds).toEqual(["open", "working"]);
  });

  it("skips a task that was archived or deleted", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "gone");
    await task(ada.org.id, "filed", { position: 2 });
    await task(ada.org.id, "open", { position: 3 });
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 'filed'").run();
    await weekSet(ada.person.id, LAST, ["gone", "filed", "open"]);
    await db.prepare("DELETE FROM tasks WHERE id = 'gone'").run();

    expect((await weekPage(ada.cookie)).leftovers?.taskIds).toEqual(["open"]);
  });

  it("holds tasks of every org the person belongs to", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await task(other.id, "ours");
    await task(ada.org.id, "mine");
    await weekSet(ada.person.id, LAST, ["ours", "mine"]);

    expect((await weekPage(ada.cookie)).leftovers?.taskIds.sort()).toEqual(["mine", "ours"]);
  });

  it("says nothing about another person's week", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    await task(bob.org.id, "theirs");
    await weekSet(bob.person.id, LAST, ["theirs"]);

    expect((await weekPage(ada.cookie)).leftovers).toBe(null);
  });
});

describe("carrying forward", () => {
  it("copies the unfinished members into this week's set", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "first");
    await task(ada.org.id, "second", { position: 2 });
    await task(ada.org.id, "done", { status: "done", position: 3 });
    await weekSet(ada.person.id, LAST, ["first", "done", "second"]);

    await act(ada.cookie, { intent: "carry" });

    expect(await stored(ada.person.id)).toEqual(["first", "second"]);
    const data = await weekPage(ada.cookie);
    expect(data.leftovers).toBe(null);
    expect(data.picked).toEqual(["first", "second"]);
  });

  it("leaves the old set as its week left it, so a carried task is in both", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "done", { status: "done" });
    await task(ada.org.id, "open", { position: 2 });
    await weekSet(ada.person.id, LAST, ["done", "open"]);

    await act(ada.cookie, { intent: "carry" });
    await act(ada.cookie, { intent: "unplan", id: "open", slug: ada.org.slug });

    expect(await stored(ada.person.id, LAST)).toEqual(["done", "open"]);
  });

  it("writes an empty set when the old week left nothing to carry", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "done", { status: "done" });
    await weekSet(ada.person.id, LAST, ["done"]);

    await act(ada.cookie, { intent: "carry" });

    expect(await stored(ada.person.id)).toEqual([]);
  });

  it("skips a task archived or deleted since the old week", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "gone");
    await task(ada.org.id, "filed", { position: 2 });
    await task(ada.org.id, "open", { position: 3 });
    await weekSet(ada.person.id, LAST, ["gone", "filed", "open"]);
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 'filed'").run();
    await db.prepare("DELETE FROM tasks WHERE id = 'gone'").run();

    await act(ada.cookie, { intent: "carry" });

    expect(await stored(ada.person.id)).toEqual(["open"]);
  });

  it("keeps the set this week already holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "old");
    await task(ada.org.id, "this", { position: 2 });
    await weekSet(ada.person.id, LAST, ["old"]);
    await act(ada.cookie, { intent: "plan", id: "this", slug: ada.org.slug });

    await act(ada.cookie, { intent: "carry" });

    expect(await stored(ada.person.id)).toEqual(["this"]);
  });
});

describe("starting clean", () => {
  it("starts the week with an empty set and drops the prompt", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await weekSet(ada.person.id, LAST, ["a"]);

    await act(ada.cookie, { intent: "clean" });
    const data = await weekPage(ada.cookie);

    expect(await stored(ada.person.id)).toEqual([]);
    expect(data.leftovers).toBe(null);
    expect(data.picked).toEqual([]);
    // The tasks are all still there to pick, in their own groups.
    expect(data.groups.find((one) => one.key === "todo")!.tasks.map((one) => one.id)).toEqual(["a"]);
  });

  it("leaves the old set alone", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await weekSet(ada.person.id, LAST, ["a"]);

    await act(ada.cookie, { intent: "clean" });

    expect(await stored(ada.person.id, LAST)).toEqual(["a"]);
  });

  it("keeps the set this week already holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await weekSet(ada.person.id, LAST, ["a"]);
    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });

    await act(ada.cookie, { intent: "clean" });

    expect(await stored(ada.person.id)).toEqual(["a"]);
  });
});
