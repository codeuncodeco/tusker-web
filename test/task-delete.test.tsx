/**
 * Delete, from the task aside: a soft delete that keeps the row and takes the
 * task out of every page, every plan and every week set. See ADR-0031.
 */

import { env } from "cloudflare:workers";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import type { Status } from "../app/board";
import { KEY_MAP } from "../app/key-map";
import * as apiRoute from "../app/routes/api.tasks";
import * as archiveRoute from "../app/routes/archive";
import * as boardRoute from "../app/routes/board";
import * as logRoute from "../app/routes/decisions";
import * as meRoute from "../app/routes/me";
import * as focusRoute from "../app/routes/me.focus";
import * as planRoute from "../app/routes/me.plan";
import * as weekRoute from "../app/routes/me.week";
import * as settingsRoute from "../app/routes/settings";
import * as taskRoute from "../app/routes/task";
import { DeleteAsk, DeleteButton } from "../app/task-aside";
import type { TaskId } from "../app/task-number";
import { aside, member } from "./accounts";
import { caught, get, post, routeArgs, SITE, wipe } from "./routes";

const db = env.DB;
/** A Tuesday, and the week it sits in. */
const DAY = "2026-09-01";
const WEEK = "2026-W36";
/** A week long over, whose set is never rewritten but by a delete. */
const PAST = "2026-W30";

beforeEach(wipe);

/** A task, placed by hand so a test can name its number and its column. */
async function task(
  orgId: string,
  id: TaskId,
  some: { status?: Status; archived?: boolean; data?: Record<string, string> } = {},
) {
  await db
    .prepare(
      `INSERT INTO tasks (id, org_id, title, status, position, archived, archived_at, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      orgId,
      `Task ${id}`,
      some.status ?? "todo",
      id,
      some.archived ? 1 : 0,
      some.archived ? `${DAY}T09:00:00.000Z` : null,
      JSON.stringify(some.data ?? {}),
    )
    .run();
  return id;
}

/** One post to the task page, signed by one member. */
function act(cookie: string, id: TaskId, fields: Record<string, string>, query = "") {
  const request = post(`/t/${id}${query}`, fields);
  request.headers.set("cookie", cookie);
  return taskRoute.action(routeArgs(request, { n: String(id) }));
}

/** The delete, as the confirm's second click posts it. */
function remove(cookie: string, id: TaskId, query = "") {
  return caught(act(cookie, id, { intent: "delete" }, query));
}

/** The mark one row holds, or undefined when the row is gone. */
async function mark(id: TaskId) {
  const row = await db
    .prepare("SELECT deleted_at FROM tasks WHERE id = ?")
    .bind(id)
    .first<{ deleted_at: string | null }>();
  return row?.deleted_at;
}

/** A page a signed-in person reads, with the day their browser is in. */
function signed(path: string, cookie: string) {
  return get(path, `${cookie}; day=${DAY}`);
}

/** A day's plan, written as plan mode writes it. */
async function plan(personId: string, day: string, ids: TaskId[]) {
  await db
    .prepare("INSERT INTO plans (user_id, day, task_ids) VALUES (?, ?, ?)")
    .bind(personId, day, JSON.stringify(ids))
    .run();
}

/** A week set, written as the week page writes it. */
async function weekSet(personId: string, week: string, ids: TaskId[]) {
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

/** The order one plans row holds. */
async function planOf(personId: string, day: string) {
  const row = await db
    .prepare("SELECT task_ids FROM plans WHERE user_id = ? AND day = ?")
    .bind(personId, day)
    .first<{ task_ids: string }>();
  return JSON.parse(row!.task_ids) as TaskId[];
}

/** The members of one week set, in set order. */
async function setOf(personId: string, week: string) {
  const { results } = await db
    .prepare(
      "SELECT task_id FROM week_plan_tasks WHERE user_id = ? AND week = ? ORDER BY position",
    )
    .bind(personId, week)
    .all<{ task_id: TaskId }>();
  return results.map((row) => row.task_id);
}

/** Every task id a nested loader answer names, wherever it sits. */
function idsIn(data: unknown): TaskId[] {
  const found: TaskId[] = [];
  (function walk(value: unknown) {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.id === "number" && "title" in record) found.push(record.id as TaskId);
      Object.values(record).forEach(walk);
    }
  })(data);
  return found;
}

describe("the delete act", () => {
  it("marks the row, keeps it, and goes back to the task's origin with its query", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 5);
    const from = encodeURIComponent(`/o/${ada.org.slug}/board?due=today`);

    const response = await remove(ada.cookie, 5, `?from=${from}`);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`/o/${ada.org.slug}/board?due=today`);
    expect(await mark(5)).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it("goes back to the org's board for a task with no origin", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 5);

    const response = await remove(ada.cookie, 5);

    expect(response.headers.get("location")).toBe(`/o/${ada.org.slug}/board`);
  });

  it("goes back to the page address, not the .data address of a single fetch", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 5);
    const from = encodeURIComponent("/me?day=2026-09-01");
    const request = post(`/t/5.data?from=${from}&_routes=routes%2Ftask`, { intent: "delete" });
    request.headers.set("cookie", ada.cookie);

    const response = await caught(taskRoute.action(routeArgs(request, { n: "5" })));

    expect(response.headers.get("location")).toBe("/me?day=2026-09-01");
  });

  for (const some of [
    { status: "backlog" },
    { status: "in_progress" },
    { status: "done" },
    { status: "cancelled", archived: true },
  ] as const) {
    it(`deletes a ${some.status}${"archived" in some ? ", archived," : ""} task`, async () => {
      const ada = await member("ada@example.test", "Ada");
      await task(ada.org.id, 5, some);

      await remove(ada.cookie, 5);

      expect(await mark(5)).toBeTruthy();
    });
  }

  it("answers 404 to a member of another org, and writes nothing", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    await task(ada.org.id, 5);
    await plan(ada.person.id, DAY, [5]);

    const response = await remove(bo.cookie, 5);

    expect(response.status).toBe(404);
    expect(await mark(5)).toBeNull();
    expect(await planOf(ada.person.id, DAY)).toEqual([5]);
  });

  it("keeps the assignees and the field values", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 5, { data: { trail: "skandagiri" } });
    await db
      .prepare("INSERT INTO task_assignees (task_id, org_id, user_id) VALUES (?, ?, ?)")
      .bind(5, ada.org.id, ada.person.id)
      .run();

    await remove(ada.cookie, 5);

    const held = await db
      .prepare("SELECT user_id FROM task_assignees WHERE task_id = ?")
      .bind(5)
      .all<{ user_id: string }>();
    expect(held.results.map((row) => row.user_id)).toEqual([ada.person.id]);
    const row = await db.prepare("SELECT data FROM tasks WHERE id = ?").bind(5).first<{ data: string }>();
    expect(JSON.parse(row!.data)).toEqual({ trail: "skandagiri" });
  });

  it("gives the deleted number to no task made after it", async () => {
    const ada = await member("ada@example.test", "Ada");
    const request = post(`/o/${ada.org.slug}/board`, { intent: "create", status: "todo", title: "Newest" });
    request.headers.set("cookie", ada.cookie);
    await boardRoute.action(routeArgs(request, { slug: ada.org.slug }));
    const first = (await db.prepare("SELECT MAX(id) AS id FROM tasks").first<{ id: TaskId }>())!.id;

    await remove(ada.cookie, first);
    const again = post(`/o/${ada.org.slug}/board`, { intent: "create", status: "todo", title: "Next" });
    again.headers.set("cookie", ada.cookie);
    await boardRoute.action(routeArgs(again, { slug: ada.org.slug }));

    const next = await db.prepare("SELECT id FROM tasks WHERE title = 'Next'").first<{ id: TaskId }>();
    expect(next!.id).toBeGreaterThan(first);
  });
});

describe("plans and week sets", () => {
  it("takes the task out of every plan, past days too, and keeps the order of the rest", async () => {
    const ada = await member("ada@example.test", "Ada");
    for (const id of [4, 5, 6]) await task(ada.org.id, id);
    await plan(ada.person.id, "2026-07-20", [6, 5, 4]);
    await plan(ada.person.id, DAY, [4, 5, 6]);

    await remove(ada.cookie, 5);

    expect(await planOf(ada.person.id, "2026-07-20")).toEqual([6, 4]);
    expect(await planOf(ada.person.id, DAY)).toEqual([4, 6]);
  });

  it("takes the task out of every week set, past weeks too, and keeps the order of the rest", async () => {
    const ada = await member("ada@example.test", "Ada");
    for (const id of [4, 5, 6]) await task(ada.org.id, id);
    await weekSet(ada.person.id, PAST, [6, 5, 4]);
    await weekSet(ada.person.id, WEEK, [4, 5, 6]);

    await remove(ada.cookie, 5);

    expect(await setOf(ada.person.id, PAST)).toEqual([6, 4]);
    expect(await setOf(ada.person.id, WEEK)).toEqual([4, 6]);
  });

  it("takes the task out of another member's plan and week set as well", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    await db
      .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
      .bind(ada.org.id, bo.person.id)
      .run();
    await task(ada.org.id, 5);
    await plan(bo.person.id, DAY, [5]);
    await weekSet(bo.person.id, WEEK, [5]);

    await remove(ada.cookie, 5);

    expect(await planOf(bo.person.id, DAY)).toEqual([]);
    expect(await setOf(bo.person.id, WEEK)).toEqual([]);
  });
});

describe("a deleted task, on every page", () => {
  /** Ada, in two orgs so `/me` draws the unified board, with task 5 deleted. */
  async function deleted(some: { status?: Status; archived?: boolean } = {}) {
    const ada = await member("ada@example.test", "Ada");
    await aside(ada.person);
    await task(ada.org.id, 4, some);
    await task(ada.org.id, 5, some);
    await plan(ada.person.id, DAY, [4, 5]);
    await weekSet(ada.person.id, WEEK, [4, 5]);
    await remove(ada.cookie, 5);
    return ada;
  }

  it("is gone from the org board", async () => {
    const ada = await deleted();
    const data = await boardRoute.loader(
      routeArgs(signed(`/o/${ada.org.slug}/board`, ada.cookie), { slug: ada.org.slug }),
    );
    expect(idsIn(data)).toEqual([4]);
  });

  it("is gone from the unified board", async () => {
    const ada = await deleted();
    const data = await meRoute.loader(routeArgs(signed("/me", ada.cookie)));
    expect(idsIn(data)).toContain(4);
    expect(idsIn(data)).not.toContain(5);
  });

  it("is gone from plan mode", async () => {
    const ada = await deleted();
    const data = await planRoute.loader(routeArgs(signed("/me/plan", ada.cookie)));
    expect(data.planned).toEqual([4]);
    expect(idsIn(data)).toContain(4);
    expect(idsIn(data)).not.toContain(5);
  });

  it("is gone from focus mode", async () => {
    const ada = await deleted();
    const data = await focusRoute.loader(routeArgs(signed("/me/focus", ada.cookie)));
    expect(idsIn(data)).toEqual([4]);
  });

  it("is gone from the week page", async () => {
    const ada = await deleted();
    const data = await weekRoute.loader(routeArgs(signed("/me/week", ada.cookie)));
    expect(idsIn(data)).toContain(4);
    expect(idsIn(data)).not.toContain(5);
  });

  it("is gone from the archive screen", async () => {
    const ada = await deleted({ status: "done", archived: true });
    const data = await archiveRoute.loader(
      routeArgs(signed(`/o/${ada.org.slug}/archive`, ada.cookie), { slug: ada.org.slug }),
    );
    expect(idsIn(data)).toEqual([4]);
  });

  it("is gone from the task API", async () => {
    const ada = await deleted();
    const minted = post(`/o/${ada.org.slug}/settings`, { intent: "mint-key", key_name: "app" });
    minted.headers.set("cookie", ada.cookie);
    const { key } = (await settingsRoute.action(routeArgs(minted, { slug: ada.org.slug }))) as {
      key: string;
    };

    const request = new Request(`${SITE}/api/tasks`);
    request.headers.set("authorization", `Bearer ${key}`);
    const response = await caught(Promise.resolve(apiRoute.loader(routeArgs(request))));

    const body = (await response.json()) as { tasks: { id: TaskId }[] };
    expect(body.tasks.map((one) => one.id)).toEqual([4]);
  });

  it("answers the same 404 at /t/<n> as a number never handed out", async () => {
    const ada = await deleted();

    const gone = await caught(
      taskRoute.loader(routeArgs(get("/t/5", ada.cookie), { n: "5" })) as Promise<unknown>,
    );
    const never = await caught(
      taskRoute.loader(routeArgs(get("/t/999", ada.cookie), { n: "999" })) as Promise<unknown>,
    );

    expect(gone.status).toBe(404);
    expect(await gone.text()).toBe(await never.text());
  });

  for (const fields of [
    { intent: "delete" },
    { intent: "finish" },
    { intent: "archive" },
    { intent: "restore" },
    { intent: "reopen" },
    { intent: "title", title: "Back again" },
    { intent: "describe", description: "words" },
    { intent: "tick", box: "0" },
  ] as Record<string, string>[]) {
    it(`answers 404 to ${fields.intent} on the task page`, async () => {
      const ada = await deleted();
      const before = await db.prepare("SELECT * FROM tasks WHERE id = 5").first();

      const response = await caught(act(ada.cookie, 5, fields));

      expect(response.status).toBe(404);
      expect(await db.prepare("SELECT * FROM tasks WHERE id = 5").first()).toEqual(before);
    });
  }

  it("answers 404 to a move on the board, and writes nothing", async () => {
    const ada = await deleted();
    const before = await db.prepare("SELECT * FROM tasks WHERE id = 5").first();
    const request = post(`/o/${ada.org.slug}/board`, { intent: "move", id: "5", status: "done" });
    request.headers.set("cookie", ada.cookie);

    const response = await caught(boardRoute.action(routeArgs(request, { slug: ada.org.slug })));

    expect(response.status).toBe(404);
    expect(await db.prepare("SELECT * FROM tasks WHERE id = 5").first()).toEqual(before);
  });

  it("answers 404 to a pick in plan mode, and the plan stays as it was", async () => {
    const ada = await deleted();
    const request = post("/me/plan", { intent: "plan", id: "5", slug: ada.org.slug });
    request.headers.set("cookie", `${ada.cookie}; day=${DAY}`);

    const response = await caught(planRoute.action(routeArgs(request)));

    expect(response.status).toBe(404);
    expect(await planOf(ada.person.id, DAY)).toEqual([4]);
  });
});

describe("the decision a deleted task produced", () => {
  it("stays, holds its task, and the log draws it with no link and no title", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, 5, { status: "done" });
    await db
      .prepare(
        "INSERT INTO decisions (id, org_id, task_id, decided_by, title) VALUES ('d1', ?, 5, ?, 'Go left')",
      )
      .bind(ada.org.id, ada.person.id)
      .run();

    await remove(ada.cookie, 5);

    const row = await db.prepare("SELECT task_id FROM decisions WHERE id = 'd1'").first();
    expect(row).toEqual({ task_id: 5 });
    const data = await logRoute.loader(
      routeArgs(get(`/o/${ada.org.slug}/decisions`, ada.cookie), { slug: ada.org.slug }),
    );
    expect(data.decisions).toMatchObject([{ id: "d1", title: "Go left", task: null }]);
  });
});

describe("the confirm in the aside", () => {
  /** One element, drawn inside a router so a `<Form>` has one. */
  function drawn(element: React.ReactNode) {
    const Stub = createRoutesStub([{ path: "*", Component: () => <>{element}</> }]);
    return renderToStaticMarkup(<Stub initialEntries={["/t/1234"]} />);
  }

  it("starts as a plain button, which posts nothing", () => {
    const html = drawn(<DeleteButton onAsk={() => {}} />);

    expect(html).toContain(">Delete<");
    expect(html).toContain('type="button"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain('value="delete"');
  });

  it("asks by the task's number, with a Delete that posts and a Keep that does not", () => {
    const html = drawn(<DeleteAsk taskId={1234 as TaskId} onKeep={() => {}} />);

    expect(html).toContain("Delete #1234?");
    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toMatch(/<button[^>]*value="delete"[^>]*name="intent"[^>]*>Delete</);
    expect(html).toMatch(/type="button"[^>]*>Keep</);
  });

  for (const some of [
    { status: "todo" },
    { status: "done" },
    { status: "cancelled", archived: true },
  ] as const) {
    it(`is drawn on a ${some.status}${"archived" in some ? ", archived," : ""} task's page`, async () => {
      const ada = await member("ada@example.test", "Ada");
      await task(ada.org.id, 5, some);
      const loaderData = await taskRoute.loader(routeArgs(get("/t/5", ada.cookie), { n: "5" }));
      const Page = taskRoute.default as unknown as (props: {
        loaderData: typeof loaderData;
        actionData: undefined;
      }) => React.ReactNode;

      const html = drawn(<Page loaderData={loaderData} actionData={undefined} />);

      expect(html).toContain(">Delete<");
    });
  }

  it("binds no key: a delete is a button and nothing else", () => {
    expect(Object.keys(KEY_MAP)).not.toContain("delete");
    expect(Object.values(KEY_MAP).map((row) => row.label)).not.toContain("Delete");
  });
});
