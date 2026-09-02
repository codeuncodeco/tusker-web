import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import type { Status } from "../app/board";
import * as loginRoute from "../app/routes/login";
import * as weekRoute from "../app/routes/me.week";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";
/** A Tuesday, and the week it sits in. */
const DAY = "2026-09-01";
const WEEK = "2026-W36";

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
async function task(
  orgId: string,
  id: string,
  some: { status?: Status; position?: number; decides?: boolean } = {},
) {
  await db
    .prepare(
      "INSERT INTO tasks (id, org_id, title, status, position, decides) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, orgId, id, some.status ?? "todo", some.position ?? 1, some.decides ? 1 : 0)
    .run();
  return id;
}

/** The week page, as one person reads it on the day their browser is in. */
function weekPage(cookie: string, day = DAY) {
  return weekRoute.loader(routeArgs(get("/me/week", `${cookie}; day=${day}`)));
}

/** The week page for a week the path names, which the browser cannot talk out of. */
function namedPage(cookie: string, named: string, day = DAY) {
  return weekRoute.loader(
    routeArgs(get(`/me/week/${named}`, `${cookie}; day=${day}`), { week: named }),
  );
}

/** A post to the week page, signed by the cookie and named for a day. */
function act(
  cookie: string,
  fields: Record<string, string | string[]>,
  params: Record<string, string> = {},
  day = DAY,
) {
  const request = post("/me/week", fields);
  request.headers.set("cookie", `${cookie}; day=${day}`);
  return weekRoute.action(routeArgs(request, params));
}

/** The ids one group holds, in the order the page draws them. */
function ids(data: { groups: { key: string; tasks: { id: string }[] }[] }, key: string) {
  return data.groups.find((one) => one.key === key)!.tasks.map((one) => one.id);
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
      "SELECT task_id FROM week_plan_tasks WHERE user_id = ? AND week = ? ORDER BY task_id",
    )
    .bind(personId, week)
    .all<{ task_id: string }>();
  return results.map((row) => row.task_id);
}

/** The ids one add wrote, as the box reads them back. */
function added(acted: unknown) {
  return (acted as { added: { ids: string[]; slug: string; text: string } }).added;
}

describe("who can read the week page", () => {
  it("sends a signed-out request to sign-in", async () => {
    const response = await caught(weekRoute.loader(routeArgs(get("/me/week"))));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?next=%2Fme%2Fweek");
  });
});

describe("the week a page speaks for", () => {
  it("is the week the browser is in", async () => {
    const ada = await member("ada@example.test", "Ada");

    const data = await weekPage(ada.cookie);

    expect(data.week).toBe(WEEK);
    expect(data.named).toBe(false);
  });

  it("draws the week Monday to Friday", async () => {
    const ada = await member("ada@example.test", "Ada");

    expect((await weekPage(ada.cookie)).span).toBe("Mon 31 Aug – Fri 4 Sept");
  });

  it("is the week the path names, whatever week the browser is in", async () => {
    const ada = await member("ada@example.test", "Ada");

    const data = await namedPage(ada.cookie, "2026-W37");

    expect(data.week).toBe("2026-W37");
    expect(data.named).toBe(true);
  });

  it("answers 404 for a key no calendar holds", async () => {
    const ada = await member("ada@example.test", "Ada");

    expect((await caught(namedPage(ada.cookie, "2026-W54"))).status).toBe(404);
    expect((await caught(namedPage(ada.cookie, "2025-W53"))).status).toBe(404);
    expect((await caught(namedPage(ada.cookie, "next week"))).status).toBe(404);
  });
});

describe("the candidate list", () => {
  it("is the live set: To do and In progress, every org", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await task(ada.org.id, "mine");
    await task(other.id, "ours", { status: "in_progress" });
    await task(ada.org.id, "later", { status: "backlog" });

    const data = await weekPage(ada.cookie);

    expect(data.groups.map((one) => one.key)).toEqual(["week", "in_progress", "todo"]);
    expect(ids(data, "in_progress")).toEqual(["ours"]);
    expect(ids(data, "todo")).toEqual(["mine"]);
  });

  it("refuses a Backlog task, which must move to To do first", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "later", { status: "backlog" });

    const response = await caught(
      act(ada.cookie, { intent: "plan", id: "later", slug: ada.org.slug }),
    );

    expect(response.status).toBe(400);
    expect(await stored(ada.person.id)).toBe(null);
  });
});

describe("picking a week", () => {
  it("writes a membership, and the first pick makes the week's row", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    expect(await stored(ada.person.id)).toBe(null);
    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });

    expect(await stored(ada.person.id)).toEqual(["a"]);
    expect(ids(await weekPage(ada.cookie), "week")).toEqual(["a"]);
  });

  it("draws a picked task in the set and nowhere else", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "picked", { status: "in_progress" });
    await task(ada.org.id, "loose");

    await act(ada.cookie, { intent: "plan", id: "picked", slug: ada.org.slug });
    const data = await weekPage(ada.cookie);

    expect(ids(data, "week")).toEqual(["picked"]);
    expect(ids(data, "in_progress")).toEqual([]);
    expect(ids(data, "todo")).toEqual(["loose"]);
  });

  it("draws the set in percentile order, whatever order it was picked in", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "first", { position: 1 });
    await task(ada.org.id, "second", { position: 2 });

    await act(ada.cookie, { intent: "plan", id: "second", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "first", slug: ada.org.slug });

    expect(ids(await weekPage(ada.cookie), "week")).toEqual(["first", "second"]);
  });

  it("counts one membership however often a task is picked", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });

    expect(await stored(ada.person.id)).toEqual(["a"]);
  });

  it("names the org of every row, because a set holds several", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await task(ada.org.id, "mine");
    await task(other.id, "ours");

    await act(ada.cookie, { intent: "plan", id: "mine", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "ours", slug: other.slug });
    const picked = (await weekPage(ada.cookie)).groups[0].tasks;

    expect(picked.map((one) => one.org.slug).sort()).toEqual([ada.org.slug, "codeuncode"].sort());
  });

  it("holds one set per week, so another week is another row", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug }, {}, "2026-09-07");

    expect(await stored(ada.person.id, "2026-W37")).toEqual(["a"]);
    expect(await stored(ada.person.id, WEEK)).toBe(null);
  });

  it("picks into the week the path names", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug }, { week: "2026-W40" });

    expect(await stored(ada.person.id, "2026-W40")).toEqual(["a"]);
    expect(await stored(ada.person.id, WEEK)).toBe(null);
  });

  it("refuses a form that names no act", async () => {
    const ada = await member("ada@example.test", "Ada");

    expect((await caught(act(ada.cookie, { intent: "sideways", id: "a" }))).status).toBe(400);
  });
});

describe("unpicking", () => {
  it("removes the membership and gives the task back to its column", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });
    const data = await weekPage(ada.cookie);

    expect(ids(data, "week")).toEqual([]);
    expect(ids(data, "todo")).toEqual(["a"]);
  });

  it("leaves the week's row behind, because that row says the week was planned", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });

    // An empty set, and not "no set": the row outlives its last membership.
    expect(await stored(ada.person.id)).toEqual([]);
  });
});

describe("a task the set holds", () => {
  it("keeps its membership once it is finished, and is marked finished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });
    const data = await weekPage(ada.cookie);

    expect(ids(data, "week")).toEqual(["a"]);
    expect(data.groups[0].tasks[0].finished).toBe(true);
  });

  it("says six of nine on the Friday", async () => {
    const ada = await member("ada@example.test", "Ada");
    for (let at = 0; at < 9; at++) await task(ada.org.id, `t${at}`, { position: at });
    for (let at = 0; at < 9; at++) {
      await act(ada.cookie, { intent: "plan", id: `t${at}`, slug: ada.org.slug });
    }
    for (let at = 0; at < 6; at++) {
      await act(ada.cookie, { intent: "finish", id: `t${at}`, slug: ada.org.slug });
    }

    // Friday of the same week, so the set is the one that was picked on Tuesday.
    const friday = await weekPage(ada.cookie, "2026-09-04");

    expect(friday.week).toBe(WEEK);
    expect(friday.done).toBe(6);
    expect(friday.picked).toHaveLength(9);
  });

  it("raises the decision prompt where the task is marked", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a", { decides: true });

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    const asked = (await act(ada.cookie, {
      intent: "finish",
      id: "a",
      slug: ada.org.slug,
    })) as Response;

    expect(asked.status).toBe(302);
    expect(asked.headers.get("location")).toContain("/me/week");
    expect(asked.headers.get("location")).toContain("a");
  });

  it("drops out without an error once it is archived", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 'a'").run();
    const data = await weekPage(ada.cookie);

    expect(data.groups.every((one) => one.tasks.length === 0)).toBe(true);
  });

  it("drops out without an error once the person leaves its org", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await task(other.id, "ours");

    await act(ada.cookie, { intent: "plan", id: "ours", slug: "codeuncode" });
    await db
      .prepare("DELETE FROM memberships WHERE org_id = ? AND user_id = ?")
      .bind(other.id, ada.person.id)
      .run();
    const data = await weekPage(ada.cookie);

    expect(data.groups.every((one) => one.tasks.length === 0)).toBe(true);
    // The membership is untouched: the person left the org, not the week.
    expect(await stored(ada.person.id)).toEqual(["ours"]);
  });
});

describe("the quick-add box on the week page", () => {
  it("makes the task and picks it, in one act", async () => {
    const ada = await member("ada@example.test", "Ada");

    const one = added(await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "fix the map",
    }));

    expect(one.ids).toHaveLength(1);
    expect(await stored(ada.person.id)).toEqual(one.ids);
    expect(ids(await weekPage(ada.cookie), "week")).toEqual(one.ids);
  });

  it("joins one task per line to the set as a block", async () => {
    const ada = await member("ada@example.test", "Ada");

    const block = added(await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "first\nsecond\nthird",
    }));

    expect(block.ids).toHaveLength(3);
    expect((await stored(ada.person.id))!.sort()).toEqual([...block.ids].sort());
  });

  it("gives the title back on an undo, and takes the membership with the row", async () => {
    const ada = await member("ada@example.test", "Ada");

    const one = added(await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "typed in the wrong org",
    }));
    expect(one.text).toBe("typed in the wrong org");

    await act(ada.cookie, { intent: "undo", id: one.ids, slug: one.slug });

    expect(await stored(ada.person.id)).toEqual([]);
    const rows = await db.prepare("SELECT id FROM tasks").all();
    expect(rows.results).toEqual([]);
  });

  it("takes a whole pasted block back in one undo", async () => {
    const ada = await member("ada@example.test", "Ada");

    const block = added(await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "first\nsecond\nthird",
    }));
    await act(ada.cookie, { intent: "undo", id: block.ids, slug: block.slug });

    expect(await stored(ada.person.id)).toEqual([]);
    expect((await db.prepare("SELECT id FROM tasks").all()).results).toEqual([]);
  });
});
