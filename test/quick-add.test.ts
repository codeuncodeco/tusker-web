import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import * as meRoute from "../app/routes/me";
import * as planRoute from "../app/routes/me.plan";
import { member } from "./accounts";
import { caught, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const DAY = "2026-09-01";

beforeEach(wipe);

/** A second org the person is a member of. */
async function team(personId: string, slug: string) {
  const id = `org-${slug}`;
  await db.batch([
    db.prepare("INSERT INTO orgs (id, slug, name) VALUES (?, ?, ?)").bind(id, slug, slug),
    db.prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')").bind(id, personId),
  ]);
  return { id, slug };
}

/** A post to the unified view, signed by the cookie and named for a day. */
function onMe(cookie: string, fields: Record<string, string | string[]>, day = DAY) {
  const request = post("/me", fields);
  request.headers.set("cookie", `${cookie}; day=${day}`);
  return meRoute.action(routeArgs(request));
}

/** A post to plan mode, for today or for the day the path names. */
function onPlan(
  cookie: string,
  fields: Record<string, string | string[]>,
  params: Record<string, string> = {},
  day = DAY,
) {
  const request = post("/me/plan", fields);
  request.headers.set("cookie", `${cookie}; day=${day}`);
  return planRoute.action(routeArgs(request, params));
}

/** The task rows one org holds. */
function rowsIn(orgId: string) {
  return db
    .prepare("SELECT id, title, status, decides FROM tasks WHERE org_id = ?")
    .bind(orgId)
    .all<{ id: string; title: string; status: string; decides: number }>();
}

/** The ids one day's plan holds. */
async function planned(personId: string, day = DAY) {
  const row = await db
    .prepare("SELECT task_ids FROM plans WHERE user_id = ? AND day = ?")
    .bind(personId, day)
    .first<{ task_ids: string }>();
  return row ? (JSON.parse(row.task_ids) as string[]) : null;
}

/** What a create answered with, once the act says it added the tasks. */
function added(acted: unknown) {
  expect(acted).toHaveProperty("added");
  return (acted as { added: { ids: string[]; slug: string; text: string } }).added;
}

/** The titles one org holds, top of the column first. */
async function columnOf(orgId: string) {
  const { results } = await db
    .prepare("SELECT title FROM tasks WHERE org_id = ? ORDER BY position, created_at, id")
    .bind(orgId)
    .all<{ title: string }>();
  return results.map((one) => one.title);
}

describe("the add", () => {
  it("makes a To do task in the org the form names", async () => {
    const ada = await member("ada@example.test", "Ada");
    const blr = await team(ada.person.id, "blrhikes");

    const acted = await onMe(ada.cookie, {
      intent: "create",
      slug: blr.slug,
      title: "fix the map",
    });

    expect(added(acted)).toMatchObject({ slug: "blrhikes", text: "fix the map" });
    expect((await rowsIn(blr.id)).results).toEqual([
      { id: added(acted).ids[0], title: "fix the map", status: "todo", decides: 0 },
    ]);
    expect((await rowsIn(ada.org.id)).results).toEqual([]);
  });

  it("adds at the top of the To do column, where a person looks for it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "first" });
    await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "second" });

    expect(await columnOf(ada.org.id)).toEqual(["second", "first"]);
  });

  // The box sets no mark: the task page does. A post that names one anyway is
  // read as the box posts, and every task of it is unmarked. See ADR-0010.
  it("marks no task, even when the post names a mark", async () => {
    const ada = await member("ada@example.test", "Ada");

    await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "a\nb", decides: "1" });

    const rows = (await rowsIn(ada.org.id)).results;
    expect(rows.map((one) => one.decides)).toEqual([0, 0]);
  });

  it("plans nothing on the unified view", async () => {
    const ada = await member("ada@example.test", "Ada");

    await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "a" });

    expect(await planned(ada.person.id)).toBe(null);
  });

  it("appends the task to today's plan in plan mode", async () => {
    const ada = await member("ada@example.test", "Ada");

    const first = added(await onPlan(ada.cookie, { intent: "create", slug: ada.org.slug, title: "a" }));
    const next = added(await onPlan(ada.cookie, { intent: "create", slug: ada.org.slug, title: "b" }));

    expect(await planned(ada.person.id)).toEqual([first.ids[0], next.ids[0]]);
  });

  it("wants a title, and makes no row without one", async () => {
    const ada = await member("ada@example.test", "Ada");

    const acted = await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "   " });

    expect(acted).toEqual({ error: "A task needs a title." });
    expect((await rowsIn(ada.org.id)).results).toEqual([]);
  });

  it("refuses an add that names no org, and writes nothing", async () => {
    const ada = await member("ada@example.test", "Ada");
    await team(ada.person.id, "blrhikes");

    const acted = await onMe(ada.cookie, { intent: "create", slug: "", title: "fix the map" });

    expect(acted).toEqual({ error: "Pick an org to add to." });
    const { results } = await db.prepare("SELECT id FROM tasks").all();
    expect(results).toEqual([]);
  });

  it("answers 404 for an org the person is not a member of", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");

    const response = await caught(
      onMe(ada.cookie, { intent: "create", slug: bo.org.slug, title: "theirs" }),
    );

    expect(response.status).toBe(404);
    expect((await rowsIn(bo.org.id)).results).toEqual([]);
  });

  it("refuses to add to a day the path named, because a plan is never rewritten", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = await caught(
      onPlan(ada.cookie, { intent: "create", slug: ada.org.slug, title: "a" }, { day: "2026-08-31" }),
    );

    expect(response.status).toBe(400);
    expect((await rowsIn(ada.org.id)).results).toEqual([]);
  });
});

describe("the undo", () => {
  it("deletes the row the add made", async () => {
    const ada = await member("ada@example.test", "Ada");
    const one = added(await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "a" }));

    await onMe(ada.cookie, { intent: "undo", id: one.ids, slug: one.slug });

    expect((await rowsIn(ada.org.id)).results).toEqual([]);
  });

  it("drops the task from the day's plan as well", async () => {
    const ada = await member("ada@example.test", "Ada");
    const one = added(await onPlan(ada.cookie, { intent: "create", slug: ada.org.slug, title: "a" }));

    await onPlan(ada.cookie, { intent: "undo", id: one.ids, slug: one.slug });

    expect(await planned(ada.person.id)).toEqual([]);
    expect((await rowsIn(ada.org.id)).results).toEqual([]);
  });

  it("answers 404 for a task from an org the person is not a member of", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    const theirs = added(await onMe(bo.cookie, { intent: "create", slug: bo.org.slug, title: "theirs" }));

    const response = await caught(
      onMe(ada.cookie, { intent: "undo", id: theirs.ids, slug: bo.org.slug }),
    );

    expect(response.status).toBe(404);
    expect((await rowsIn(bo.org.id)).results.length).toBe(1);
  });

  it("leaves a decision the task produced, with the link cleared", async () => {
    const ada = await member("ada@example.test", "Ada");
    const one = added(
      await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "a" }),
    );
    await db
      .prepare("INSERT INTO decisions (id, org_id, task_id, title) VALUES ('d1', ?, ?, 'why')")
      .bind(ada.org.id, one.ids[0])
      .run();

    await onMe(ada.cookie, { intent: "undo", id: one.ids, slug: one.slug });

    const row = await db.prepare("SELECT task_id FROM decisions WHERE id = 'd1'").first<{ task_id: string | null }>();
    expect(row?.task_id).toBe(null);
  });

  it("deletes every row one paste made, and leaves the rest of the board", async () => {
    const ada = await member("ada@example.test", "Ada");
    await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "was here first" });
    const paste = added(
      await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "one\ntwo\nthree" }),
    );

    await onMe(ada.cookie, { intent: "undo", id: paste.ids, slug: paste.slug });

    expect(await columnOf(ada.org.id)).toEqual(["was here first"]);
  });

  it("drops every task of the paste from the day's plan", async () => {
    const ada = await member("ada@example.test", "Ada");
    const kept = added(await onPlan(ada.cookie, { intent: "create", slug: ada.org.slug, title: "keep" }));
    const paste = added(
      await onPlan(ada.cookie, { intent: "create", slug: ada.org.slug, title: "one\ntwo" }),
    );

    await onPlan(ada.cookie, { intent: "undo", id: paste.ids, slug: paste.slug });

    expect(await planned(ada.person.id)).toEqual(kept.ids);
    expect(await columnOf(ada.org.id)).toEqual(["keep"]);
  });

  it("writes nothing when one id of the list names another org's task", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    const mine = added(await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "mine" }));
    const theirs = added(await onMe(bo.cookie, { intent: "create", slug: bo.org.slug, title: "theirs" }));

    const response = await caught(
      onMe(ada.cookie, { intent: "undo", id: [...mine.ids, ...theirs.ids], slug: ada.org.slug }),
    );

    expect(response.status).toBe(404);
    expect(await columnOf(ada.org.id)).toEqual(["mine"]);
    expect(await columnOf(bo.org.id)).toEqual(["theirs"]);
  });
});

describe("a list of lines", () => {
  it("makes one task of every line, first line at the top of the column", async () => {
    const ada = await member("ada@example.test", "Ada");
    await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "was here first" });

    const acted = added(
      await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "one\ntwo\nthree" }),
    );

    expect(acted.ids.length).toBe(3);
    expect(await columnOf(ada.org.id)).toEqual(["one", "two", "three", "was here first"]);
  });

  it("makes no task of a blank line, and reads a Windows line break", async () => {
    const ada = await member("ada@example.test", "Ada");

    const acted = added(
      await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "one\r\n\n   \r\ntwo\n" }),
    );

    expect(acted.ids.length).toBe(2);
    expect(await columnOf(ada.org.id)).toEqual(["one", "two"]);
  });

  it("gives the whole text back, line breaks and all, and no mark, for the undo to refill the box", async () => {
    const ada = await member("ada@example.test", "Ada");

    const acted = added(
      await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: "one\ntwo" }),
    );

    expect(acted.text).toBe("one\ntwo");
    expect(acted).not.toHaveProperty("decides");
  });

  it("puts every task of the paste in today's plan, in plan mode", async () => {
    const ada = await member("ada@example.test", "Ada");

    const acted = added(
      await onPlan(ada.cookie, { intent: "create", slug: ada.org.slug, title: "one\ntwo\nthree" }),
    );

    expect(await planned(ada.person.id)).toEqual(acted.ids);
  });

  it("refuses a list of more than 100 lines, and writes nothing", async () => {
    const ada = await member("ada@example.test", "Ada");
    const lines = Array.from({ length: 101 }, (_, at) => `task ${at}`).join("\n");

    const acted = await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: lines });

    expect(acted).toEqual({ error: "A list makes 100 tasks at the most." });
    expect((await rowsIn(ada.org.id)).results).toEqual([]);
  });

  it("takes a list of exactly 100 lines", async () => {
    const ada = await member("ada@example.test", "Ada");
    const lines = Array.from({ length: 100 }, (_, at) => `task ${at}`).join("\n");

    const acted = added(await onMe(ada.cookie, { intent: "create", slug: ada.org.slug, title: lines }));

    expect(acted.ids.length).toBe(100);
    expect((await columnOf(ada.org.id))[0]).toBe("task 0");
  });
});

describe("where the box shows", () => {
  it("shows on today's plan and not on a day the path named", async () => {
    const ada = await member("ada@example.test", "Ada");
    const today = await planRoute.loader(routeArgs(get("/me/plan", `${ada.cookie}; day=${DAY}`)));
    const past = await planRoute.loader(
      routeArgs(get("/me/plan/2026-08-31", `${ada.cookie}; day=${DAY}`), { day: "2026-08-31" }),
    );

    expect(today.canAdd).toBe(true);
    expect(past.canAdd).toBe(false);
  });

  it("names every org the person can file into, first joined first", async () => {
    const ada = await member("ada@example.test", "Ada");
    await team(ada.person.id, "blrhikes");

    const data = await meRoute.loader(routeArgs(get("/me", `${ada.cookie}; day=${DAY}`)));

    expect(data.orgs.map((one) => one.slug)).toEqual([ada.org.slug, "blrhikes"]);
  });
});
