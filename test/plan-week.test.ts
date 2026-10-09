import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import type { Status } from "../app/board";
import * as planRoute from "../app/routes/me.plan";
import * as boardRoute from "../app/routes/me";
import * as weekRoute from "../app/routes/me.week";
import { member } from "./accounts";
import { caught, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
/** One week, and the days of it this file plans. */
const WEEK = "2026-W36";
const MONDAY = "2026-08-31";
const WEDNESDAY = "2026-09-02";
const THURSDAY = "2026-09-03";
const SATURDAY = "2026-09-05";
/** The Monday of the week after, which no cascade of this week reaches. */
const NEXT_MONDAY = "2026-09-07";

beforeEach(wipe);

/** A task, placed by hand so a test can state the column order it wants. */
async function task(orgId: string, id: number, some: { status?: Status; position?: number } = {}) {
  await db
    .prepare("INSERT INTO tasks (id, org_id, title, status, position) VALUES (?, ?, ?, ?, ?)")
    .bind(id, orgId, String(id), some.status ?? "todo", some.position ?? 1)
    .run();
  return id;
}

/** A plan one person made on one day, written as that day left it. */
async function plan(personId: string, day: string, taskIds: number[]) {
  await db
    .prepare("INSERT INTO plans (user_id, day, task_ids) VALUES (?, ?, ?)")
    .bind(personId, day, JSON.stringify(taskIds))
    .run();
}

/** A week one person planned, written as that week left it. */
async function weekSet(personId: string, week: string, taskIds: number[]) {
  await db.batch([
    db.prepare("INSERT INTO week_plans (user_id, week) VALUES (?, ?)").bind(personId, week),
    ...taskIds.map((id, at) =>
      db
        .prepare(
          "INSERT INTO week_plan_tasks (user_id, week, task_id, position) VALUES (?, ?, ?, ?)",
        )
        .bind(personId, week, id, at + 1),
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
function ids(data: { groups: { key: string; tasks: { id: number }[] }[] }, key: string) {
  return data.groups.find((one) => one.key === key)!.tasks.map((one) => one.id);
}

/** The order one plans row holds, or null where the person planned no day. */
async function planned(personId: string, day = WEDNESDAY) {
  const row = await db
    .prepare("SELECT task_ids FROM plans WHERE user_id = ? AND day = ?")
    .bind(personId, day)
    .first<{ task_ids: string }>();
  return row ? (JSON.parse(row.task_ids) as number[]) : null;
}

/** The set one week holds, in the order the week ranks it. */
async function weekOrder(personId: string, week = WEEK) {
  const { results } = await db
    .prepare(
      "SELECT task_id FROM week_plan_tasks WHERE user_id = ? AND week = ? ORDER BY position, task_id",
    )
    .bind(personId, week)
    .all<{ task_id: number }>();
  return results.map((row) => row.task_id);
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
    .all<{ task_id: number }>();
  return results.map((row) => row.task_id);
}

describe("the shelf plan mode draws", () => {
  it("draws the plan, this week, and the rest of the live set under it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 3);
    await task(ada.org.id, 4, { position: 2 });
    await task(ada.org.id, 5, { status: "in_progress", position: 3 });
    await task(ada.org.id, 6, { position: 4 });
    await weekSet(ada.person.id, WEEK, [3, 4]);
    await plan(ada.person.id, WEDNESDAY, [3]);

    const data = await planPage(ada.cookie);

    expect(data.groups.map((one) => one.key)).toEqual(["today", "week", "in_progress", "todo"]);
    expect(ids(data, "today")).toEqual([3]);
    expect(ids(data, "week")).toEqual([4]);
    expect(ids(data, "in_progress")).toEqual([5]);
    expect(ids(data, "todo")).toEqual([6]);
  });

  it("draws the week set in week order, not in the order the columns sort", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 7, { position: 3 });
    await task(ada.org.id, 8, { position: 1 });
    // The week ranked task 7 first, and plan mode reads that rank. See ADR-0021.
    await weekSet(ada.person.id, WEEK, [7, 8]);

    expect(ids(await planPage(ada.cookie), "week")).toEqual([7, 8]);
  });

  it("sinks a member finished this week under the live ones", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 9, { status: "done" });
    await task(ada.org.id, 10);
    await weekSet(ada.person.id, WEEK, [9, 10]);

    expect(ids(await planPage(ada.cookie), "week")).toEqual([10, 9]);
  });

  it("draws the set of the week the day sits in, and not of this week", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 11);
    await weekSet(ada.person.id, "2026-W37", [11]);

    const data = await planRoute.loader(
      routeArgs(get(`/me/plan/${NEXT_MONDAY}`, `${ada.cookie}; day=${WEDNESDAY}`), {
        day: NEXT_MONDAY,
      }),
    );

    expect(ids(data, "week")).toEqual([11]);
    expect(ids(await planPage(ada.cookie), "week")).toEqual([]);
  });

  it("keeps a member finished this week in the shelf, struck through", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 9, { status: "done" });
    await weekSet(ada.person.id, WEEK, [9]);

    const [, week] = (await planPage(ada.cookie)).groups;

    expect(week.tasks.map((one) => [one.id, one.finished])).toEqual([[9, true]]);
  });
});

describe("a pick from outside the week", () => {
  it("joins the week set, so a Tuesday arrival is one act", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 12);

    await act(ada.cookie, { intent: "plan", id: "12", slug: ada.org.slug });

    expect(await planned(ada.person.id)).toEqual([12]);
    expect(await inWeek(ada.person.id)).toEqual([12]);
  });

  it("joins the week the planned day sits in", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 11);
    const request = post(`/me/plan/${NEXT_MONDAY}`, {
      intent: "plan",
      id: "11",
      slug: ada.org.slug,
    });
    request.headers.set("cookie", `${ada.cookie}; day=${WEDNESDAY}`);

    await planRoute.action(routeArgs(request, { day: NEXT_MONDAY }));

    expect(await inWeek(ada.person.id, "2026-W37")).toEqual([11]);
    expect(await inWeek(ada.person.id)).toBe(null);
  });

  it("leaves a member the set already holds where it is", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 13);
    await weekSet(ada.person.id, WEEK, [13]);

    await act(ada.cookie, { intent: "plan", id: "13", slug: ada.org.slug });

    expect(await inWeek(ada.person.id)).toEqual([13]);
  });

  it("takes a task typed into plan mode into the week as well", async () => {
    const ada = await member("ada@example.test", "Ada");

    const acted = (await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "write it down",
    })) as { added: { ids: number[] } };

    expect(await inWeek(ada.person.id)).toEqual(acted.added.ids);
  });

  it("takes the membership back with the row when the add is undone", async () => {
    const ada = await member("ada@example.test", "Ada");
    const acted = (await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "typed by mistake",
    })) as { added: { ids: number[] } };

    await act(ada.cookie, { intent: "undo", slug: ada.org.slug, id: String(acted.added.ids[0]) });

    expect(await planned(ada.person.id)).toEqual([]);
    expect(await inWeek(ada.person.id)).toEqual([]);
  });

  it("leaves the week set alone when a task is dropped from the day", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await act(ada.cookie, { intent: "plan", id: "1", slug: ada.org.slug });

    await act(ada.cookie, { intent: "unplan", id: "1", slug: ada.org.slug });

    expect(await planned(ada.person.id)).toEqual([]);
    expect(await inWeek(ada.person.id)).toEqual([1]);
  });
});

describe("where a write-back lands", () => {
  // The plan already spoke for the task, so it makes no claim on the week and
  // must not push down the work a person ranked by hand. See ADR-0021.
  it("puts a task picked into a day at the foot of the week set", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 14);
    await task(ada.org.id, 12);
    await weekSet(ada.person.id, WEEK, [14]);

    await act(ada.cookie, { intent: "plan", id: "12", slug: ada.org.slug });

    expect(await weekOrder(ada.person.id)).toEqual([14, 12]);
  });

  it("keeps a pasted block in the order it was typed", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 14);
    await weekSet(ada.person.id, WEEK, [14]);

    await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "first\nsecond\nthird",
    });

    const order = await weekOrder(ada.person.id);
    expect(order[0]).toBe(14);
    expect(order).toHaveLength(4);
  });
});

describe("a pick made anywhere else", () => {
  it("takes a board pick into the week as well, so the invariant holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    const request = post("/me", { intent: "plan", id: "1", slug: ada.org.slug });
    request.headers.set("cookie", `${ada.cookie}; day=${WEDNESDAY}`);

    await boardRoute.action(routeArgs(request));

    expect(await planned(ada.person.id)).toEqual([1]);
    expect(await inWeek(ada.person.id)).toEqual([1]);
  });
});

describe("leaving the week set", () => {
  it("takes the task out of this day's plan and the days after it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await task(ada.org.id, 2, { position: 2 });
    await weekSet(ada.person.id, WEEK, [1]);
    await plan(ada.person.id, WEDNESDAY, [1, 2]);
    await plan(ada.person.id, THURSDAY, [1]);
    await plan(ada.person.id, SATURDAY, [1]);

    await weekAct(ada.cookie, { intent: "unplan", id: "1", slug: ada.org.slug });

    expect(await planned(ada.person.id, WEDNESDAY)).toEqual([2]);
    expect(await planned(ada.person.id, THURSDAY)).toEqual([]);
    // The week holds seven days, whatever the page draws.
    expect(await planned(ada.person.id, SATURDAY)).toEqual([]);
    expect(await inWeek(ada.person.id)).toEqual([]);
  });

  it("never rewrites a past day", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, WEEK, [1]);
    await plan(ada.person.id, MONDAY, [1]);

    await weekAct(ada.cookie, { intent: "unplan", id: "1", slug: ada.org.slug });

    expect(await planned(ada.person.id, MONDAY)).toEqual([1]);
  });

  it("reaches no day outside the week it names", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, WEEK, [1]);
    await plan(ada.person.id, NEXT_MONDAY, [1]);

    await weekAct(ada.cookie, { intent: "unplan", id: "1", slug: ada.org.slug });

    expect(await planned(ada.person.id, NEXT_MONDAY)).toEqual([1]);
  });

  it("clears the whole of a week the person is not in yet", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, "2026-W37", [1]);
    await plan(ada.person.id, NEXT_MONDAY, [1]);
    const request = post("/me/week/2026-W37", { intent: "unplan", id: "1", slug: ada.org.slug });
    request.headers.set("cookie", `${ada.cookie}; day=${WEDNESDAY}`);

    await weekRoute.action(routeArgs(request, { week: "2026-W37" }));

    expect(await planned(ada.person.id, NEXT_MONDAY)).toEqual([]);
  });

  it("leaves a plan of another person alone", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, WEEK, [1]);
    await plan(bob.person.id, WEDNESDAY, [1]);

    await weekAct(ada.cookie, { intent: "unplan", id: "1", slug: ada.org.slug });

    expect(await planned(bob.person.id, WEDNESDAY)).toEqual([1]);
  });
});

describe("the day carries nothing", () => {
  it("starts every plan empty, whatever the day before left", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await plan(ada.person.id, MONDAY, [1]);

    const data = await planPage(ada.cookie);

    expect(data.planned).toEqual([]);
    expect(await planned(ada.person.id)).toBe(null);
    expect(ids(data, "todo")).toEqual([1]);
  });

  it("answers 400 to the carry a plan page once took", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await plan(ada.person.id, MONDAY, [1]);

    expect((await caught(act(ada.cookie, { intent: "carry" }))).status).toBe(400);
    expect((await caught(act(ada.cookie, { intent: "clean" }))).status).toBe(400);
    expect(await planned(ada.person.id)).toBe(null);
  });
});
