import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import type { Status } from "../app/board";
import * as planRoute from "../app/routes/me.plan";
import * as loginRoute from "../app/routes/login";
import * as boardRoute from "../app/routes/me";
import * as weekRoute from "../app/routes/me.week";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";
/** One week, and the days of it this file plans. */
const WEEK = "2026-W36";
const MONDAY = "2026-08-31";
const WEDNESDAY = "2026-09-02";
const THURSDAY = "2026-09-03";
const SATURDAY = "2026-09-05";
/** The Monday of the week after, which no cascade of this week reaches. */
const NEXT_MONDAY = "2026-09-07";

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

/** Plan mode, as one person reads it on the day their browser is in. */
function planPage(cookie: string, day = WEDNESDAY) {
  return planRoute.loader(routeArgs(get("/me/plan", `${cookie}; day=${day}`)));
}

/** A post to plan mode, signed by the cookie and named for a day. */
function act(cookie: string, fields: Record<string, string>, day = WEDNESDAY) {
  const request = post("/me/plan", fields);
  request.headers.set("cookie", `${cookie}; day=${day}`);
  return planRoute.action(routeArgs(request));
}

/** A post to the week page, signed by the cookie and named for a day. */
function weekAct(cookie: string, fields: Record<string, string>, day = WEDNESDAY) {
  const request = post("/me/week", fields);
  request.headers.set("cookie", `${cookie}; day=${day}`);
  return weekRoute.action(routeArgs(request));
}

/** The ids one group holds, in the order the page draws them. */
function ids(data: { groups: { key: string; tasks: { id: string }[] }[] }, key: string) {
  return data.groups.find((one) => one.key === key)!.tasks.map((one) => one.id);
}

/** The order one plans row holds, or null where the person planned no day. */
async function planned(personId: string, day = WEDNESDAY) {
  const row = await db
    .prepare("SELECT task_ids FROM plans WHERE user_id = ? AND day = ?")
    .bind(personId, day)
    .first<{ task_ids: string }>();
  return row ? (JSON.parse(row.task_ids) as string[]) : null;
}

/** The set one week holds, or null where the person started no such week. */
async function inWeek(personId: string, week = WEEK) {
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

describe("the shelf plan mode draws", () => {
  it("draws the plan, this week, and the rest of the live set under it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "planned");
    await task(ada.org.id, "committed", { position: 2 });
    await task(ada.org.id, "working", { status: "in_progress", position: 3 });
    await task(ada.org.id, "loose", { position: 4 });
    await weekSet(ada.person.id, WEEK, ["planned", "committed"]);
    await plan(ada.person.id, WEDNESDAY, ["planned"]);

    const data = await planPage(ada.cookie);

    expect(data.groups.map((one) => one.key)).toEqual(["today", "week", "in_progress", "todo"]);
    expect(ids(data, "today")).toEqual(["planned"]);
    expect(ids(data, "week")).toEqual(["committed"]);
    expect(ids(data, "in_progress")).toEqual(["working"]);
    expect(ids(data, "todo")).toEqual(["loose"]);
  });

  it("draws the week set in percentile order", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "last", { position: 3 });
    await task(ada.org.id, "first", { position: 1 });
    await weekSet(ada.person.id, WEEK, ["last", "first"]);

    expect(ids(await planPage(ada.cookie), "week")).toEqual(["first", "last"]);
  });

  it("draws the set of the week the day sits in, and not of this week", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "next");
    await weekSet(ada.person.id, "2026-W37", ["next"]);

    const data = await planRoute.loader(
      routeArgs(get(`/me/plan/${NEXT_MONDAY}`, `${ada.cookie}; day=${WEDNESDAY}`), {
        day: NEXT_MONDAY,
      }),
    );

    expect(ids(data, "week")).toEqual(["next"]);
    expect(ids(await planPage(ada.cookie), "week")).toEqual([]);
  });

  it("keeps a member finished this week in the shelf, struck through", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "done", { status: "done" });
    await weekSet(ada.person.id, WEEK, ["done"]);

    const [, week] = (await planPage(ada.cookie)).groups;

    expect(week.tasks.map((one) => [one.id, one.finished])).toEqual([["done", true]]);
  });
});

describe("a pick from outside the week", () => {
  it("joins the week set, so a Tuesday arrival is one act", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "urgent");

    await act(ada.cookie, { intent: "plan", id: "urgent", slug: ada.org.slug });

    expect(await planned(ada.person.id)).toEqual(["urgent"]);
    expect(await inWeek(ada.person.id)).toEqual(["urgent"]);
  });

  it("joins the week the planned day sits in", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "next");
    const request = post(`/me/plan/${NEXT_MONDAY}`, {
      intent: "plan",
      id: "next",
      slug: ada.org.slug,
    });
    request.headers.set("cookie", `${ada.cookie}; day=${WEDNESDAY}`);

    await planRoute.action(routeArgs(request, { day: NEXT_MONDAY }));

    expect(await inWeek(ada.person.id, "2026-W37")).toEqual(["next"]);
    expect(await inWeek(ada.person.id)).toBe(null);
  });

  it("leaves a member the set already holds where it is", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "known");
    await weekSet(ada.person.id, WEEK, ["known"]);

    await act(ada.cookie, { intent: "plan", id: "known", slug: ada.org.slug });

    expect(await inWeek(ada.person.id)).toEqual(["known"]);
  });

  it("takes a task typed into plan mode into the week as well", async () => {
    const ada = await member("ada@example.test", "Ada");

    const acted = (await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "write it down",
    })) as { added: { ids: string[] } };

    expect(await inWeek(ada.person.id)).toEqual(acted.added.ids);
  });

  it("takes the membership back with the row when the add is undone", async () => {
    const ada = await member("ada@example.test", "Ada");
    const acted = (await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "typed by mistake",
    })) as { added: { ids: string[] } };

    await act(ada.cookie, { intent: "undo", slug: ada.org.slug, id: acted.added.ids[0] });

    expect(await planned(ada.person.id)).toEqual([]);
    expect(await inWeek(ada.person.id)).toEqual([]);
  });

  it("leaves the week set alone when a task is dropped from the day", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });

    await act(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });

    expect(await planned(ada.person.id)).toEqual([]);
    expect(await inWeek(ada.person.id)).toEqual(["a"]);
  });
});

describe("a pick made anywhere else", () => {
  it("takes a board pick into the week as well, so the invariant holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    const request = post("/me", { intent: "plan", id: "a", slug: ada.org.slug });
    request.headers.set("cookie", `${ada.cookie}; day=${WEDNESDAY}`);

    await boardRoute.action(routeArgs(request));

    expect(await planned(ada.person.id)).toEqual(["a"]);
    expect(await inWeek(ada.person.id)).toEqual(["a"]);
  });
});

describe("leaving the week set", () => {
  it("takes the task out of this day's plan and the days after it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await task(ada.org.id, "b", { position: 2 });
    await weekSet(ada.person.id, WEEK, ["a"]);
    await plan(ada.person.id, WEDNESDAY, ["a", "b"]);
    await plan(ada.person.id, THURSDAY, ["a"]);
    await plan(ada.person.id, SATURDAY, ["a"]);

    await weekAct(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });

    expect(await planned(ada.person.id, WEDNESDAY)).toEqual(["b"]);
    expect(await planned(ada.person.id, THURSDAY)).toEqual([]);
    // The week holds seven days, whatever the page draws.
    expect(await planned(ada.person.id, SATURDAY)).toEqual([]);
    expect(await inWeek(ada.person.id)).toEqual([]);
  });

  it("never rewrites a past day", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await weekSet(ada.person.id, WEEK, ["a"]);
    await plan(ada.person.id, MONDAY, ["a"]);

    await weekAct(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });

    expect(await planned(ada.person.id, MONDAY)).toEqual(["a"]);
  });

  it("reaches no day outside the week it names", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await weekSet(ada.person.id, WEEK, ["a"]);
    await plan(ada.person.id, NEXT_MONDAY, ["a"]);

    await weekAct(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });

    expect(await planned(ada.person.id, NEXT_MONDAY)).toEqual(["a"]);
  });

  it("clears the whole of a week the person is not in yet", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await weekSet(ada.person.id, "2026-W37", ["a"]);
    await plan(ada.person.id, NEXT_MONDAY, ["a"]);
    const request = post("/me/week/2026-W37", { intent: "unplan", id: "a", slug: ada.org.slug });
    request.headers.set("cookie", `${ada.cookie}; day=${WEDNESDAY}`);

    await weekRoute.action(routeArgs(request, { week: "2026-W37" }));

    expect(await planned(ada.person.id, NEXT_MONDAY)).toEqual([]);
  });

  it("leaves a plan of another person alone", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    await task(ada.org.id, "a");
    await weekSet(ada.person.id, WEEK, ["a"]);
    await plan(bob.person.id, WEDNESDAY, ["a"]);

    await weekAct(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });

    expect(await planned(bob.person.id, WEDNESDAY)).toEqual(["a"]);
  });
});

describe("the day carries nothing", () => {
  it("starts every plan empty, whatever the day before left", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await plan(ada.person.id, MONDAY, ["a"]);

    const data = await planPage(ada.cookie);

    expect(data.planned).toEqual([]);
    expect(await planned(ada.person.id)).toBe(null);
    expect(ids(data, "todo")).toEqual(["a"]);
  });

  it("answers 400 to the carry a plan page once took", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await plan(ada.person.id, MONDAY, ["a"]);

    expect((await caught(act(ada.cookie, { intent: "carry" }))).status).toBe(400);
    expect((await caught(act(ada.cookie, { intent: "clean" }))).status).toBe(400);
    expect(await planned(ada.person.id)).toBe(null);
  });
});
