/**
 * An org of one has no unassigned live task: its one member holds every one,
 * and no screen shows it. See ADR-0032.
 */

import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import * as boardRoute from "../app/routes/board";
import * as meRoute from "../app/routes/me";
import * as membersRoute from "../app/routes/members";
import migration from "../migrations/0021_solo_assignees.sql?raw";
import { aside, member } from "./accounts";
import { post, routeArgs, wipe } from "./routes";

const db = env.DB;
const DAY = "2026-09-01";

beforeEach(wipe);

/** A post to the org board, signed by the cookie. */
function onBoard(cookie: string, slug: string, fields: Record<string, string | string[]>) {
  const request = post(`/o/${slug}`, fields);
  request.headers.set("cookie", `${cookie}; day=${DAY}`);
  return boardRoute.action(routeArgs(request, { slug }));
}

/** A post to the unified view, signed by the cookie. */
function onMe(cookie: string, fields: Record<string, string | string[]>) {
  const request = post("/me", fields);
  request.headers.set("cookie", `${cookie}; day=${DAY}`);
  return meRoute.action(routeArgs(request));
}

/** A post to the members page of one org, signed by the cookie. */
function onMembers(cookie: string, slug: string, fields: Record<string, string>) {
  const request = post(`/o/${slug}/members`, fields);
  request.headers.set("cookie", cookie);
  return membersRoute.action(routeArgs(request, { slug }));
}

/** Who holds each task of one org, keyed by title. */
async function heldIn(orgId: string) {
  const { results } = await db
    .prepare(
      `SELECT t.title, a.user_id FROM tasks t
       LEFT JOIN task_assignees a ON a.task_id = t.id
       WHERE t.org_id = ? ORDER BY t.title, a.user_id`,
    )
    .bind(orgId)
    .all<{ title: string; user_id: string | null }>();

  const held = new Map<string, string[]>();
  for (const row of results) {
    const ids = held.get(row.title) ?? [];
    if (row.user_id) ids.push(row.user_id);
    held.set(row.title, ids);
  }
  return held;
}

/** Writes tasks straight into one org, held by nobody. */
async function bare(orgId: string, titles: string[], set = "") {
  for (const title of titles) {
    await db
      .prepare(`INSERT INTO tasks (org_id, title, status, position) VALUES (?, ?, 'todo', 0)`)
      .bind(orgId, title)
      .run();
    if (set) await db.prepare(`UPDATE tasks SET ${set} WHERE title = ?`).bind(title).run();
  }
}

/** The backfill, read from the migration file so the two cannot drift apart. */
async function backfill() {
  await db.prepare(migration.slice(migration.indexOf("INSERT INTO"))).run();
}

describe("an add in an org of one", () => {
  it("holds a task added from the org board with the one member", async () => {
    const ada = await member("ada@example.test", "Ada");

    await onBoard(ada.cookie, ada.org.slug, { intent: "create", status: "todo", title: "Pack" });

    expect(await heldIn(ada.org.id)).toEqual(new Map([["Pack", [ada.person.id]]]));
  });

  it("holds a task added from the unified board with the one member", async () => {
    const ada = await member("ada@example.test", "Ada");
    await aside(ada.person);

    await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "Pack" });

    expect(await heldIn(ada.org.id)).toEqual(new Map([["Pack", [ada.person.id]]]));
  });

  it("holds every task of a many-line add, once each, and answers every id", async () => {
    const ada = await member("ada@example.test", "Ada");
    await aside(ada.person);

    const answer = await onMe(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "one\ntwo\nthree",
      assignee: ada.person.id,
    });

    expect(await heldIn(ada.org.id)).toEqual(
      new Map([
        ["one", [ada.person.id]],
        ["three", [ada.person.id]],
        ["two", [ada.person.id]],
      ]),
    );
    const { results } = await db
      .prepare("SELECT id FROM tasks WHERE org_id = ? ORDER BY id")
      .bind(ada.org.id)
      .all<{ id: number }>();
    expect(answer).toMatchObject({ added: { ids: results.map((row) => row.id) } });
  });

  it("leaves a task of an org of two unassigned when nobody was named", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    await db
      .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
      .bind(ada.org.id, bo.person.id)
      .run();

    await onBoard(ada.cookie, ada.org.slug, { intent: "create", status: "todo", title: "Open" });

    expect(await heldIn(ada.org.id)).toEqual(new Map([["Open", []]]));
  });
});

describe("the backfill", () => {
  it("gives every live task of an org of one its member, and nothing else", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    const cy = await member("cy@example.test", "Cy");
    // Bo's org holds two members, so a task there stays unassigned.
    await db
      .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
      .bind(bo.org.id, cy.person.id)
      .run();
    await bare(ada.org.id, ["Live", "Done"]);
    await db.prepare("UPDATE tasks SET status = 'done' WHERE title = 'Done'").run();
    await bare(ada.org.id, ["Filed"], "archived = 1");
    await bare(ada.org.id, ["Gone"], "deleted_at = '2026-09-01T00:00:00.000Z'");
    await bare(bo.org.id, ["Shared"]);

    await backfill();

    expect(await heldIn(ada.org.id)).toEqual(
      new Map([
        ["Done", [ada.person.id]],
        ["Filed", []],
        ["Gone", []],
        ["Live", [ada.person.id]],
      ]),
    );
    expect(await heldIn(bo.org.id)).toEqual(new Map([["Shared", []]]));
  });

  it("adds no row the second time it runs", async () => {
    const ada = await member("ada@example.test", "Ada");
    await bare(ada.org.id, ["Live"]);
    await backfill();

    await backfill();

    const row = await db.prepare("SELECT COUNT(*) AS n FROM task_assignees").first<{ n: number }>();
    expect(row?.n).toBe(1);
  });
});

describe("an org that drops to one member", () => {
  /** Ada's org, with Bo in it too, and Cy too when asked. */
  async function team(withCy = false) {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    const cy = await member("cy@example.test", "Cy");
    const joining = withCy ? [bo, cy] : [bo];
    for (const one of joining) {
      await db
        .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
        .bind(ada.org.id, one.person.id)
        .run();
    }
    return { ada, bo, cy };
  }

  function remove(cookie: string, slug: string, personId: string) {
    return onMembers(cookie, slug, { intent: "remove", member: personId, confirmed: "1" });
  }

  it("hands the one who stays every live task that has no holder", async () => {
    const { ada, bo } = await team();
    await onBoard(ada.cookie, ada.org.slug, {
      intent: "create",
      status: "todo",
      title: "Bo's",
      assignee: bo.person.id,
    });
    await onBoard(ada.cookie, ada.org.slug, { intent: "create", status: "todo", title: "Nobody's" });
    await onBoard(ada.cookie, ada.org.slug, {
      intent: "create",
      status: "todo",
      title: "Filed",
      assignee: bo.person.id,
    });
    await db.prepare("UPDATE tasks SET archived = 1 WHERE title = 'Filed'").run();
    await bare(ada.org.id, ["Gone"], "deleted_at = '2026-09-01T00:00:00.000Z'");

    await remove(ada.cookie, ada.org.slug, bo.person.id);

    expect(await heldIn(ada.org.id)).toEqual(
      new Map([
        ["Bo's", [ada.person.id]],
        ["Filed", []],
        ["Gone", []],
        ["Nobody's", [ada.person.id]],
      ]),
    );
  });

  it("hands nothing on when two members stay", async () => {
    const { ada, bo } = await team(true);
    await onBoard(ada.cookie, ada.org.slug, {
      intent: "create",
      status: "todo",
      title: "Bo's",
      assignee: bo.person.id,
    });

    await remove(ada.cookie, ada.org.slug, bo.person.id);

    expect(await heldIn(ada.org.id)).toEqual(new Map([["Bo's", []]]));
  });

  it("hands nothing on when the removal is refused", async () => {
    const ada = await member("ada@example.test", "Ada");
    await bare(ada.org.id, ["Nobody's"]);

    const answer = await remove(ada.cookie, ada.org.slug, ada.person.id);

    expect(answer).toMatchObject({ error: expect.stringContaining("must keep one owner") });
    expect(await heldIn(ada.org.id)).toEqual(new Map([["Nobody's", []]]));
  });
});
