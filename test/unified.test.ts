import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import type { Status } from "../app/board";
import * as loginRoute from "../app/routes/login";
import * as meRoute from "../app/routes/me";
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
  some: { status?: Status; position?: number; due?: string | null; created?: string } = {},
) {
  await db
    .prepare(
      `INSERT INTO tasks (id, org_id, title, status, position, due_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      orgId,
      id,
      some.status ?? "todo",
      some.position ?? 1,
      some.due ?? null,
      some.created ?? "2026-01-01T00:00:00.000Z",
    )
    .run();
  return id;
}

/** The unified view, as one person reads it on one day. */
function page(cookie: string, day = DAY) {
  return meRoute.loader(routeArgs(get("/me", `${cookie}; day=${day}`)));
}

/** A post to the page, signed by the cookie and named for a day. */
function act(cookie: string, fields: Record<string, string>, day = DAY) {
  const request = post("/me", fields);
  request.headers.set("cookie", `${cookie}; day=${day}`);
  return meRoute.action(routeArgs(request));
}

/** The ids one group holds, in the order the page draws them. */
function ids(data: Awaited<ReturnType<typeof page>>, key: string) {
  return data.groups.find((one) => one.key === key)!.tasks.map((one) => one.id);
}

describe("who can read the unified view", () => {
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

    const data = await page(ada.cookie);

    expect(ids(data, "todo").sort()).toEqual(["mine", "ours"]);
  });

  it("holds no task from an org the person is not in", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    await task(bo.org.id, "theirs");
    await task(ada.org.id, "mine");

    const data = await page(ada.cookie);

    expect(ids(data, "todo")).toEqual(["mine"]);
  });

  it("holds no archived task, and nothing from Backlog, Done or Cancelled", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "live");
    await task(ada.org.id, "backlog", { status: "backlog" });
    await task(ada.org.id, "done", { status: "done" });
    await task(ada.org.id, "cancelled", { status: "cancelled" });
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 'live'").run();
    await task(ada.org.id, "shown");

    const data = await page(ada.cookie);

    expect(ids(data, "todo")).toEqual(["shown"]);
  });
});

describe("the percentile", () => {
  it("is the task's place in its own org column over that column's length", async () => {
    const ada = await member("ada@example.test", "Ada");
    for (let place = 1; place <= 12; place++) await task(ada.org.id, `t${place}`, { position: place });

    const data = await page(ada.cookie);
    const third = data.groups.find((one) => one.key === "todo")!.tasks[2];

    expect(third.id).toBe("t3");
    expect(third.percentile).toBeCloseTo(0.25);
  });

  it("measures each org column on its own, so two orgs interleave", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    // Second of two is 1.0 and second of four is 0.5, so the short column's
    // second card falls to the end. The 0.5 and the 1.0 ties break on the id.
    await task(ada.org.id, "short-1", { position: 1 });
    await task(ada.org.id, "short-2", { position: 2 });
    for (let place = 1; place <= 4; place++) await task(other.id, `long-${place}`, { position: place });

    const data = await page(ada.cookie);

    expect(ids(data, "todo")).toEqual(["long-1", "long-2", "short-1", "long-3", "long-4", "short-2"]);
  });

  it("counts the place from one, so the last card of a column is 1", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a", { position: 1 });
    await task(ada.org.id, "b", { position: 2 });
    await task(ada.org.id, "c", { position: 3 });

    const data = await page(ada.cookie);

    expect(data.groups.find((one) => one.key === "todo")!.tasks.map((one) => one.percentile)).toEqual([
      1 / 3,
      2 / 3,
      1,
    ]);
  });

  it("gives the same order on two loads of an unchanged list", async () => {
    const ada = await member("ada@example.test", "Ada");
    for (const id of ["a", "b", "c", "d"]) await task(ada.org.id, id, { position: 1 });

    const first = await page(ada.cookie);
    const again = await page(ada.cookie);

    expect(ids(again, "todo")).toEqual(ids(first, "todo"));
    expect(ids(first, "todo")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("the groups", () => {
  it("draws Today, In progress and To do, in that order", async () => {
    const ada = await member("ada@example.test", "Ada");

    const data = await page(ada.cookie);

    expect(data.groups.map((one) => one.key)).toEqual(["today", "in_progress", "todo"]);
  });

  it("says so in one line when no org holds a live task", async () => {
    const ada = await member("ada@example.test", "Ada");

    const data = await page(ada.cookie);

    expect(data.groups.every((one) => one.tasks.length === 0)).toBe(true);
  });
});

describe("today's plan", () => {
  it("draws a planned task in Today and nowhere else", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "planned", { status: "in_progress" });
    await task(ada.org.id, "loose");

    await act(ada.cookie, { intent: "plan", id: "planned", slug: ada.org.slug });
    const data = await page(ada.cookie);

    expect(ids(data, "today")).toEqual(["planned"]);
    expect(ids(data, "in_progress")).toEqual([]);
    expect(ids(data, "todo")).toEqual(["loose"]);
  });

  it("holds the plan in plan order, not in percentile order", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "first", { position: 1 });
    await task(ada.org.id, "second", { position: 2 });

    await act(ada.cookie, { intent: "plan", id: "second", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "first", slug: ada.org.slug });
    const data = await page(ada.cookie);

    expect(ids(data, "today")).toEqual(["second", "first"]);
  });

  it("keeps a planned task finished today in Today, and marks it finished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });
    const data = await page(ada.cookie);

    expect(ids(data, "today")).toEqual(["a"]);
    expect(data.groups[0].tasks[0].finished).toBe(true);
  });

  it("drops the finished task once the day rolls over", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });
    const data = await page(ada.cookie, "2026-09-02");

    expect(data.groups.every((one) => one.tasks.length === 0)).toBe(true);
  });

  it("offers to plan the day while no plan for it exists", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    expect((await page(ada.cookie)).planStarted).toBe(false);
    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    expect((await page(ada.cookie)).planStarted).toBe(true);
  });

  it("takes a task back out of the plan", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });
    const data = await page(ada.cookie);

    expect(ids(data, "today")).toEqual([]);
    expect(ids(data, "todo")).toEqual(["a"]);
  });

  it("holds tasks from several orgs", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await task(ada.org.id, "mine");
    await task(other.id, "ours");

    await act(ada.cookie, { intent: "plan", id: "mine", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "ours", slug: other.slug });
    const data = await page(ada.cookie);

    expect(ids(data, "today")).toEqual(["mine", "ours"]);
  });

  it("drops a planned task that was archived, without an error", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 'a'").run();
    const data = await page(ada.cookie);

    expect(data.groups.every((one) => one.tasks.length === 0)).toBe(true);
  });
});

describe("what a row carries", () => {
  it("names the org and the due date", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a", { due: "2026-10-01" });

    const data = await page(ada.cookie);

    expect(data.groups.find((one) => one.key === "todo")!.tasks[0]).toMatchObject({
      org: { slug: "ada", name: "Ada" },
      due_date: "2026-10-01",
    });
  });

  it("shows the org's card fields, and a ref id the cache does not hold raw", async () => {
    const ada = await member("ada@example.test", "Ada");
    await db.batch([
      db
        .prepare(
          `INSERT INTO org_fields (org_id, key, label, type, source_url, show_on_card, position)
           VALUES (?, 'trail', 'Trail', 'reference', 'https://blrhikes.test/trails', 1, 1)`,
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

    const rows = (await page(ada.cookie)).groups.find((one) => one.key === "todo")!.tasks;

    expect(rows.map((one) => one.fields.map((field) => field.value))).toEqual([
      ["Kumara Parvatha"],
      ["gone"],
    ]);
  });
});

describe("the option colour", () => {
  it("gives a card the dot the board draws", async () => {
    const ada = await member("ada@example.test", "Ada");
    await db.batch([
      db
        .prepare(
          `INSERT INTO org_fields (org_id, key, label, type, source_url, show_on_card, position)
           VALUES (?, 'client', 'Client', 'reference', 'https://blrhikes.test/clients', 1, 1)`,
        )
        .bind(ada.org.id),
      db
        .prepare("INSERT INTO org_field_colors (org_id, field_key, value, color) VALUES (?, 'client', 'acme', 'teal')")
        .bind(ada.org.id),
    ]);
    await task(ada.org.id, "a");
    await db.prepare("UPDATE tasks SET data = '{\"client\":\"acme\"}' WHERE id = 'a'").run();

    const rows = (await page(ada.cookie)).groups.find((one) => one.key === "todo")!.tasks;

    expect(rows[0].fields).toEqual([
      { key: "client", label: "Client", value: "acme", color: "teal" },
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
    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
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
