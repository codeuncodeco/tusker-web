import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { narrowedTo, readNarrowing, type Status } from "../app/board";
import * as boardRoute from "../app/routes/board";
import * as unifiedRoute from "../app/routes/me";
import type { TaskId } from "../app/task-number";
import { aside, member } from "./accounts";
import { get, routeArgs, wipe } from "./routes";

const db = env.DB;
/** A Tuesday, and the week it sits in. */
const DAY = "2026-09-01";
const WEEK = "2026-W36";

beforeEach(wipe);

/** A task, placed by hand so a test can state the column order it wants. */
async function task(orgId: string, id: TaskId, some: { status?: Status; position?: number } = {}) {
  await db
    .prepare("INSERT INTO tasks (id, org_id, title, status, position) VALUES (?, ?, ?, ?, ?)")
    .bind(id, orgId, id, some.status ?? "todo", some.position ?? 1)
    .run();
  return id;
}

/** A team org, with everybody named as a member of it. */
async function team(slug: string, people: { id: string }[]) {
  const id = `org-${slug}`;
  await db.batch([
    db
      .prepare("INSERT INTO orgs (id, slug, name) VALUES (?, ?, ?)")
      .bind(id, slug, slug),
    ...people.map((person) =>
      db
        .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
        .bind(id, person.id),
    ),
  ]);
  return { id, slug };
}

/** A week one person planned, written as that week left it. */
async function weekSet(personId: string, taskIds: TaskId[], week = WEEK) {
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

/** A day's plan, written as plan mode wrote it. */
async function plan(personId: string, taskIds: TaskId[], day = DAY) {
  await db
    .prepare("INSERT INTO plans (user_id, day, task_ids) VALUES (?, ?, ?)")
    .bind(personId, day, JSON.stringify(taskIds))
    .run();
}

/** The org board, as one person reads it on the day their browser is in. */
function board(cookie: string, slug: string, query = "", day = DAY) {
  return boardRoute.loader(
    routeArgs(get(`/o/${slug}/board${query}`, `${cookie}; day=${day}`), { slug }),
  );
}

/** The unified board, as one person reads it on that day. */
function unified(cookie: string, query = "", day = DAY) {
  return unifiedRoute.loader(routeArgs(get(`/me${query}`, `${cookie}; day=${day}`)));
}

/** Every task one board draws, in column order. */
function drawn(data: { columns: { tasks: { id: TaskId }[] }[] }) {
  return data.columns.flatMap((one) => one.tasks.map((card) => card.id));
}

describe("the Week chip on the org board", () => {
  it("narrows the board to this week's set, and clearing it gives the board back", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 4);
    await task(ada.org.id, 3, { position: 2 });
    await weekSet(ada.person.id, [4]);

    const narrowed = await board(ada.cookie, ada.org.slug, "?week=1");
    const whole = await board(ada.cookie, ada.org.slug);

    expect(narrowed.week).toBe(true);
    expect(drawn(narrowed)).toEqual([4]);
    expect(whole.week).toBe(false);
    expect(drawn(whole)).toEqual([4, 3]);
  });

  it("is drawn whether or not the week holds a set", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);

    expect((await board(ada.cookie, ada.org.slug)).hasSet).toBe(false);
    await weekSet(ada.person.id, [1]);
    expect((await board(ada.cookie, ada.org.slug)).hasSet).toBe(true);
  });

  it("narrows nothing while the week holds no set", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);

    const data = await board(ada.cookie, ada.org.slug, "?week=1");

    expect(data.week).toBe(false);
    expect(drawn(data)).toEqual([1]);
  });

  it("narrows nothing once the set is emptied", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, []);

    const data = await board(ada.cookie, ada.org.slug, "?week=1");

    expect(data.hasSet).toBe(false);
    expect(data.week).toBe(false);
    expect(drawn(data)).toEqual([1]);
  });

  it("reads the set of the week the day sits in, and no other", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1);
    await weekSet(ada.person.id, [1], "2026-W37");

    expect((await board(ada.cookie, ada.org.slug)).hasSet).toBe(false);
    expect((await board(ada.cookie, ada.org.slug, "", "2026-09-08")).hasSet).toBe(true);
  });

  // The week set carries an order of its own now, and a board still does not
  // read it: a column holds one order, and it is the org's. See ADR-0006 and
  // ADR-0021.
  it("narrows a column and does not reorder it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 1, { position: 1 });
    await task(ada.org.id, 2, { position: 2 });
    await task(ada.org.id, 3, { position: 3 });
    await weekSet(ada.person.id, [3, 1]);

    const narrowed = await board(ada.cookie, ada.org.slug, "?week=1");

    expect(drawn(narrowed)).toEqual([1, 3]);
  });

  it("keeps the columns the board shows, so narrowing changes no shape", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 4);
    await task(ada.org.id, 5, { status: "backlog" });
    await weekSet(ada.person.id, [4]);

    const narrowed = await board(ada.cookie, ada.org.slug, "?week=1&backlog=1");

    expect(narrowed.columns.map((one) => one.status)).toEqual(
      (await board(ada.cookie, ada.org.slug, "?backlog=1")).columns.map((one) => one.status),
    );
  });
});

describe("the Week chip and the assignee filter", () => {
  it("lets the filter narrow what the chip left", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    const acme = await team("acme", [ada.person, bo.person]);
    await task(acme.id, 1, { position: 1 });
    await task(acme.id, 2, { position: 2 });
    await task(acme.id, 3, { position: 3 });
    await db.batch([
      db
        .prepare("INSERT INTO task_assignees (task_id, org_id, user_id) VALUES (?, ?, ?)")
        .bind(1, acme.id, ada.person.id),
      db
        .prepare("INSERT INTO task_assignees (task_id, org_id, user_id) VALUES (?, ?, ?)")
        .bind(2, acme.id, bo.person.id),
    ]);
    await weekSet(ada.person.id, [1, 2]);

    // Every narrowing is AND: the week set leaves two, and Ada keeps one.
    const data = await board(ada.cookie, acme.slug, `?week=1&assignee=${ada.person.id}`);

    expect(data.week).toBe(true);
    expect(drawn(data)).toEqual([1]);
  });
});

describe("the two narrowings are exclusive", () => {
  it("takes Today over Week where the address holds both", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 6);
    await task(ada.org.id, 4, { position: 2 });
    await plan(ada.person.id, [6]);
    await weekSet(ada.person.id, [4]);

    const data = await board(ada.cookie, ada.org.slug, "?today=1&week=1");

    expect(data.today).toBe(true);
    expect(data.week).toBe(false);
    expect(drawn(data)).toEqual([6]);
  });

  it("reads one narrowing out of the address", () => {
    expect(readNarrowing(new URLSearchParams("today=1"))).toBe("today");
    expect(readNarrowing(new URLSearchParams("week=1"))).toBe("week");
    expect(readNarrowing(new URLSearchParams("today=1&week=1"))).toBe("today");
    expect(readNarrowing(new URLSearchParams("backlog=1"))).toBe(null);
  });

  it("drops the other narrowing as it presses one, and keeps the rest", () => {
    expect(narrowedTo(new URLSearchParams("today=1&backlog=1"), "week", false)).toBe(
      "?backlog=1&week=1",
    );
    expect(narrowedTo(new URLSearchParams("week=1&backlog=1"), "today", false)).toBe(
      "?backlog=1&today=1",
    );
    // Pressing the chip that is already on gives the whole board back.
    expect(narrowedTo(new URLSearchParams("week=1&backlog=1"), "week", true)).toBe("?backlog=1");
  });
});

describe("the Week chip on the unified board", () => {
  it("narrows every column to the tasks this week's set holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    await aside(ada.person);
    await task(ada.org.id, 4);
    await task(ada.org.id, 7, { status: "in_progress" });
    await task(ada.org.id, 3);
    await weekSet(ada.person.id, [4, 7]);

    const data = await unified(ada.cookie, "?week=1");

    expect(data.week).toBe(true);
    expect(drawn(data).sort((x, y) => x - y)).toEqual([4, 7]);
  });

  it("narrows a column there too, and leaves its order alone", async () => {
    const ada = await member("ada@example.test", "Ada");
    await aside(ada.person);
    await task(ada.org.id, 1, { position: 1 });
    await task(ada.org.id, 2, { position: 2 });
    await task(ada.org.id, 3, { position: 3 });
    await weekSet(ada.person.id, [3, 1]);

    expect(drawn(await unified(ada.cookie, "?week=1"))).toEqual([1, 3]);
  });

  it("draws no chip for a person with no set this week", async () => {
    const ada = await member("ada@example.test", "Ada");
    await aside(ada.person);
    await task(ada.org.id, 1);

    expect((await unified(ada.cookie)).hasSet).toBe(false);
    await weekSet(ada.person.id, [1]);
    expect((await unified(ada.cookie)).hasSet).toBe(true);
  });

  it("takes Today over Week there as well", async () => {
    const ada = await member("ada@example.test", "Ada");
    await aside(ada.person);
    await task(ada.org.id, 6);
    await task(ada.org.id, 4);
    await plan(ada.person.id, [6]);
    await weekSet(ada.person.id, [4]);

    const data = await unified(ada.cookie, "?today=1&week=1");

    expect(data.today).toBe(true);
    expect(data.week).toBe(false);
    expect(drawn(data)).toEqual([6]);
  });
});
