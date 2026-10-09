import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import type { Status } from "../app/board";
import * as weekRoute from "../app/routes/me.week";
import { member } from "./accounts";
import { caught, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
/** A Tuesday, the week it sits in, and the two weeks before it. */
const DAY = "2026-09-01";
const WEEK = "2026-W36";
const LAST = "2026-W35";
const BEFORE = "2026-W34";

beforeEach(wipe);

/** A second org the person is a member of. */
async function team(personId: string, slug: string) {
  const id = `org-${slug}`;
  await db.batch([
    db
      .prepare("INSERT INTO orgs (id, slug, name) VALUES (?, ?, ?)")
      .bind(id, slug, slug),
    db
      .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
      .bind(id, personId),
  ]);
  return { id, slug };
}

/** A task, placed by hand so a test can state the column order it wants. */
async function task(orgId: string, id: number, some: { status?: Status; position?: number } = {}) {
  await db
    .prepare("INSERT INTO tasks (id, org_id, title, status, position) VALUES (?, ?, ?, ?, ?)")
    .bind(id, orgId, String(id), some.status ?? "todo", some.position ?? 1)
    .run();
  return id;
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
    .prepare(
      "SELECT task_id FROM week_plan_tasks WHERE user_id = ? AND week = ? ORDER BY position, task_id",
    )
    .bind(personId, week)
    .all<{ task_id: number }>();
  return results.map((row) => row.task_id);
}

describe("the prompt", () => {
  it("offers the unfinished members of the last week set", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await task(ada.org.id, 2, { position: 2 });
    await weekSet(ada.person.id, LAST, [1, 2]);

    const data = await weekPage(ada.cookie);

    expect(data.leftovers).toEqual({ from: LAST, taskIds: [1, 2] });
  });

  it("names the week it carries from, which is not always the week before", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, BEFORE, [1]);

    expect((await weekPage(ada.cookie)).leftovers?.from).toBe(BEFORE);
  });

  it("is absent when the last week left nothing unfinished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1, { status: "done" });
    await weekSet(ada.person.id, LAST, [1]);

    expect((await weekPage(ada.cookie)).leftovers).toBe(null);
  });

  it("is absent when the person planned no earlier week", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);

    expect((await weekPage(ada.cookie)).leftovers).toBe(null);
  });

  it("is absent once this week holds a row, however empty the set is", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, LAST, [1]);
    await weekSet(ada.person.id, WEEK, []);

    expect((await weekPage(ada.cookie)).leftovers).toBe(null);
  });

  it("reads the last week that holds a set, not the week before this one", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await task(ada.org.id, 2, { position: 2 });
    await weekSet(ada.person.id, BEFORE, [2]);
    await weekSet(ada.person.id, LAST, [1]);

    expect((await weekPage(ada.cookie)).leftovers).toEqual({ from: LAST, taskIds: [1] });
  });

  it("says nothing about a set for a later week", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, "2026-W37", [1]);

    expect((await weekPage(ada.cookie)).leftovers).toBe(null);
  });

  it("is absent on a week that is over, which is never rewritten", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, BEFORE, [1]);

    const data = await weekRoute.loader(
      routeArgs(get(`/me/week/${LAST}`, `${ada.cookie}; day=${DAY}`), { week: LAST }),
    );

    expect(data.leftovers).toBe(null);
  });

  it("is raised on a week the path names as it is on this one", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, LAST, [1]);

    const data = await weekRoute.loader(
      routeArgs(get("/me/week/2026-W37", `${ada.cookie}; day=${DAY}`), { week: "2026-W37" }),
    );

    expect(data.leftovers).toEqual({ from: LAST, taskIds: [1] });
  });
});

describe("what a leftover is", () => {
  it("skips a task now Done or Cancelled, and keeps the rest", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 6, { status: "done" });
    await task(ada.org.id, 16, { status: "cancelled" });
    await task(ada.org.id, 10, { status: "in_progress" });
    await task(ada.org.id, 7, { position: 2 });
    await weekSet(ada.person.id, LAST, [6, 7, 16, 10]);

    expect((await weekPage(ada.cookie)).leftovers?.taskIds).toEqual([7, 10]);
  });

  it("skips a task that was archived or deleted", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 8);
    await task(ada.org.id, 9, { position: 2 });
    await task(ada.org.id, 7, { position: 3 });
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 9").run();
    await weekSet(ada.person.id, LAST, [8, 9, 7]);
    await db.prepare("DELETE FROM tasks WHERE id = 8").run();

    expect((await weekPage(ada.cookie)).leftovers?.taskIds).toEqual([7]);
  });

  it("holds tasks of every org the person belongs to", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await task(other.id, 13);
    await task(ada.org.id, 12);
    await weekSet(ada.person.id, LAST, [13, 12]);

    expect((await weekPage(ada.cookie)).leftovers?.taskIds.sort((x, y) => x - y)).toEqual([12, 13]);
  });

  it("says nothing about another person's week", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    await task(bob.org.id, 14);
    await weekSet(bob.person.id, LAST, [14]);

    expect((await weekPage(ada.cookie)).leftovers).toBe(null);
  });
});

describe("carrying forward", () => {
  it("copies the unfinished members into this week's set", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 3);
    await task(ada.org.id, 4, { position: 2 });
    await task(ada.org.id, 6, { status: "done", position: 3 });
    await weekSet(ada.person.id, LAST, [3, 6, 4]);

    await act(ada.cookie, { intent: "carry" });

    expect(await stored(ada.person.id)).toEqual([3, 4]);
    const data = await weekPage(ada.cookie);
    expect(data.leftovers).toBe(null);
    expect(data.picked).toEqual([3, 4]);
  });

  // Work ranked once is the same work, later. See ADR-0021.
  it("keeps the order of the week it came from", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 5, { position: 1 });
    await task(ada.org.id, 3, { position: 2 });
    await weekSet(ada.person.id, LAST, [3, 5]);

    await act(ada.cookie, { intent: "carry" });

    expect(await stored(ada.person.id)).toEqual([3, 5]);
    expect((await weekPage(ada.cookie)).picked).toEqual([3, 5]);
  });

  it("leaves the old set as its week left it, so a carried task is in both", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 6, { status: "done" });
    await task(ada.org.id, 7, { position: 2 });
    await weekSet(ada.person.id, LAST, [6, 7]);

    await act(ada.cookie, { intent: "carry" });
    await act(ada.cookie, { intent: "unplan", id: "7", slug: ada.org.slug });

    expect(await stored(ada.person.id, LAST)).toEqual([6, 7]);
  });

  it("writes an empty set when the old week left nothing to carry", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 6, { status: "done" });
    await weekSet(ada.person.id, LAST, [6]);

    await act(ada.cookie, { intent: "carry" });

    expect(await stored(ada.person.id)).toEqual([]);
  });

  it("skips a task archived or deleted since the old week", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 8);
    await task(ada.org.id, 9, { position: 2 });
    await task(ada.org.id, 7, { position: 3 });
    await weekSet(ada.person.id, LAST, [8, 9, 7]);
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 9").run();
    await db.prepare("DELETE FROM tasks WHERE id = 8").run();

    await act(ada.cookie, { intent: "carry" });

    expect(await stored(ada.person.id)).toEqual([7]);
  });

  it("keeps the set this week already holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 15);
    await task(ada.org.id, 11, { position: 2 });
    await weekSet(ada.person.id, LAST, [15]);
    await act(ada.cookie, { intent: "plan", id: "11", slug: ada.org.slug });

    await act(ada.cookie, { intent: "carry" });

    expect(await stored(ada.person.id)).toEqual([11]);
  });
});

describe("a week that is over", () => {
  it("takes no carry, because a week set is never rewritten after its week", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, BEFORE, [1]);
    const request = post(`/me/week/${LAST}`, { intent: "carry" });
    request.headers.set("cookie", `${ada.cookie}; day=${DAY}`);

    const response = await caught(weekRoute.action(routeArgs(request, { week: LAST })));

    expect(response.status).toBe(400);
    expect(await stored(ada.person.id, LAST)).toBe(null);
  });
});

describe("starting clean", () => {
  it("starts the week with an empty set and drops the prompt", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, LAST, [1]);

    await act(ada.cookie, { intent: "clean" });
    const data = await weekPage(ada.cookie);

    expect(await stored(ada.person.id)).toEqual([]);
    expect(data.leftovers).toBe(null);
    expect(data.picked).toEqual([]);
    // The tasks are all still there to pick, in their own groups.
    expect(data.groups.find((one) => one.key === "todo")!.tasks.map((one) => one.id)).toEqual([1]);
  });

  it("leaves the old set alone", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, LAST, [1]);

    await act(ada.cookie, { intent: "clean" });

    expect(await stored(ada.person.id, LAST)).toEqual([1]);
  });

  it("keeps the set this week already holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, LAST, [1]);
    await act(ada.cookie, { intent: "plan", id: "1", slug: ada.org.slug });

    await act(ada.cookie, { intent: "clean" });

    expect(await stored(ada.person.id)).toEqual([1]);
  });
});
