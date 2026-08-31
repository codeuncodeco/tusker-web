import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import type { Status } from "../app/board";
import { dayName } from "../app/day";
import * as loginRoute from "../app/routes/login";
import * as planRoute from "../app/routes/me.plan";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";
// A Monday, so a plan from the Friday before it reads over a weekend.
const MONDAY = "2026-08-31";
const FRIDAY = "2026-08-28";

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

/** A plan one person made on one day, written as that day left it. */
async function plan(personId: string, day: string, taskIds: string[]) {
  await db
    .prepare("INSERT INTO plans (user_id, day, task_ids) VALUES (?, ?, ?)")
    .bind(personId, day, JSON.stringify(taskIds))
    .run();
}

/** Plan mode, as one person reads it on the day their browser is in. */
function planPage(cookie: string, day = MONDAY) {
  return planRoute.loader(routeArgs(get("/me/plan", `${cookie}; day=${day}`)));
}

/** A post to plan mode, signed by the cookie and named for a day. */
function act(cookie: string, fields: Record<string, string>, day = MONDAY) {
  const request = post("/me/plan", fields);
  request.headers.set("cookie", `${cookie}; day=${day}`);
  return planRoute.action(routeArgs(request));
}

/** The order one plans row holds. */
async function stored(personId: string, day = MONDAY) {
  const row = await db
    .prepare("SELECT task_ids FROM plans WHERE user_id = ? AND day = ?")
    .bind(personId, day)
    .first<{ task_ids: string }>();
  return row ? (JSON.parse(row.task_ids) as string[]) : null;
}

describe("the prompt", () => {
  it("offers the leftovers of the last plan", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await task(ada.org.id, "b", { position: 2 });
    await plan(ada.person.id, FRIDAY, ["a", "b"]);

    const data = await planPage(ada.cookie);

    expect(data.leftovers).toEqual({ from: FRIDAY, taskIds: ["a", "b"] });
  });

  it("names the day it carries from, which over a weekend is Friday", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await plan(ada.person.id, FRIDAY, ["a"]);

    expect((await planPage(ada.cookie)).leftovers?.from).toBe(FRIDAY);
    expect(dayName(FRIDAY)).toBe("Friday 2026-08-28");
  });

  it("is absent when the last plan left nothing unfinished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a", { status: "done" });
    await plan(ada.person.id, FRIDAY, ["a"]);

    expect((await planPage(ada.cookie)).leftovers).toBe(null);
  });

  it("is absent when the person planned no earlier day", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    expect((await planPage(ada.cookie)).leftovers).toBe(null);
  });

  it("is absent once this day holds a plan, emptied plan included", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await plan(ada.person.id, FRIDAY, ["a"]);
    await plan(ada.person.id, MONDAY, []);

    expect((await planPage(ada.cookie)).leftovers).toBe(null);
  });

  it("reads the last day that holds a plan, not the day before this one", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await task(ada.org.id, "b", { position: 2 });
    await plan(ada.person.id, "2026-08-27", ["b"]);
    await plan(ada.person.id, FRIDAY, ["a"]);

    expect((await planPage(ada.cookie)).leftovers).toEqual({ from: FRIDAY, taskIds: ["a"] });
  });

  it("is absent on a day the path names, because leftovers carry into today", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await plan(ada.person.id, FRIDAY, ["a"]);

    const named = await planRoute.loader(
      routeArgs(get("/me/plan/2026-12-25", `${ada.cookie}; day=${MONDAY}`), { day: "2026-12-25" }),
    );

    expect(named.leftovers).toBe(null);
  });

  it("says nothing about a plan for a later day", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await plan(ada.person.id, "2026-09-05", ["a"]);

    expect((await planPage(ada.cookie)).leftovers).toBe(null);
  });
});

describe("what a leftover is", () => {
  it("skips a task now Done or Cancelled, and keeps the rest in order", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "done", { status: "done" });
    await task(ada.org.id, "dropped", { status: "cancelled" });
    await task(ada.org.id, "working", { status: "in_progress" });
    await task(ada.org.id, "open", { position: 2 });
    await plan(ada.person.id, FRIDAY, ["done", "open", "dropped", "working"]);

    expect((await planPage(ada.cookie)).leftovers?.taskIds).toEqual(["open", "working"]);
  });

  it("skips a task that was archived or deleted", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "gone");
    await task(ada.org.id, "filed", { position: 2 });
    await task(ada.org.id, "open", { position: 3 });
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 'filed'").run();
    await db.prepare("DELETE FROM tasks WHERE id = 'gone'").run();
    await plan(ada.person.id, FRIDAY, ["gone", "filed", "open"]);

    expect((await planPage(ada.cookie)).leftovers?.taskIds).toEqual(["open"]);
  });

  it("holds tasks of every org the person belongs to", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await task(other.id, "ours");
    await task(ada.org.id, "mine");
    await plan(ada.person.id, FRIDAY, ["ours", "mine"]);

    expect((await planPage(ada.cookie)).leftovers?.taskIds).toEqual(["ours", "mine"]);
  });

  it("says nothing about another person's plan", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    await task(bob.org.id, "theirs");
    await plan(bob.person.id, FRIDAY, ["theirs"]);

    expect((await planPage(ada.cookie)).leftovers).toBe(null);
  });
});

describe("carrying forward", () => {
  it("copies the unfinished tasks into this day, in the old plan's order", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "second");
    await task(ada.org.id, "first", { position: 2 });
    await task(ada.org.id, "done", { status: "done", position: 3 });
    await plan(ada.person.id, FRIDAY, ["first", "done", "second"]);

    await act(ada.cookie, { intent: "carry" });

    expect(await stored(ada.person.id)).toEqual(["first", "second"]);
    const data = await planPage(ada.cookie);
    expect(data.leftovers).toBe(null);
    expect(data.planned).toEqual(["first", "second"]);
  });

  it("leaves the old plan's row as that day left it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "done", { status: "done" });
    await task(ada.org.id, "open", { position: 2 });
    await plan(ada.person.id, FRIDAY, ["done", "open"]);

    await act(ada.cookie, { intent: "carry" });
    await act(ada.cookie, { intent: "unplan", id: "open", slug: ada.org.slug });

    expect(await stored(ada.person.id, FRIDAY)).toEqual(["done", "open"]);
  });

  it("writes an empty plan when the old day left nothing to carry", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "done", { status: "done" });
    await plan(ada.person.id, FRIDAY, ["done"]);

    await act(ada.cookie, { intent: "carry" });

    expect(await stored(ada.person.id)).toEqual([]);
  });

  it("skips a task archived or deleted since the old day", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "gone");
    await task(ada.org.id, "filed", { position: 2 });
    await task(ada.org.id, "open", { position: 3 });
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 'filed'").run();
    await db.prepare("DELETE FROM tasks WHERE id = 'gone'").run();
    await plan(ada.person.id, FRIDAY, ["gone", "filed", "open"]);

    await act(ada.cookie, { intent: "carry" });

    expect(await stored(ada.person.id)).toEqual(["open"]);
  });

  it("refuses a day the path names, which is not the day to carry into", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await plan(ada.person.id, FRIDAY, ["a"]);
    const request = post("/me/plan/2026-12-25", { intent: "carry" });
    request.headers.set("cookie", `${ada.cookie}; day=${MONDAY}`);

    const response = await caught(planRoute.action(routeArgs(request, { day: "2026-12-25" })));

    expect(response.status).toBe(400);
    expect(await stored(ada.person.id, "2026-12-25")).toBe(null);
  });

  it("keeps the plan this day already holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "old");
    await task(ada.org.id, "today", { position: 2 });
    await plan(ada.person.id, FRIDAY, ["old"]);
    await act(ada.cookie, { intent: "plan", id: "today", slug: ada.org.slug });

    await act(ada.cookie, { intent: "carry" });

    expect(await stored(ada.person.id)).toEqual(["today"]);
  });
});

describe("starting clean", () => {
  it("starts the day with an empty plan and drops the prompt", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await plan(ada.person.id, FRIDAY, ["a"]);

    await act(ada.cookie, { intent: "clean" });
    const data = await planPage(ada.cookie);

    expect(await stored(ada.person.id)).toEqual([]);
    expect(data.leftovers).toBe(null);
    expect(data.planned).toEqual([]);
    // The tasks are all still there to pick, in their own groups.
    expect(data.groups.find((one) => one.key === "todo")!.tasks.map((one) => one.id)).toEqual(["a"]);
  });

  it("leaves the old plan's row alone", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await plan(ada.person.id, FRIDAY, ["a"]);

    await act(ada.cookie, { intent: "clean" });

    expect(await stored(ada.person.id, FRIDAY)).toEqual(["a"]);
  });

  it("keeps the plan this day already holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await plan(ada.person.id, FRIDAY, ["a"]);
    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });

    await act(ada.cookie, { intent: "clean" });

    expect(await stored(ada.person.id)).toEqual(["a"]);
  });
});
