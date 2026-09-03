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
      "SELECT task_id FROM week_plan_tasks WHERE user_id = ? AND week = ? ORDER BY position, task_id",
    )
    .bind(personId, week)
    .all<{ task_id: string }>();
  return results.map((row) => row.task_id);
}

/** A week before the one the browser is in, which is read back and not built. */
const PAST = "2026-W30";

/** A set written straight into the store, so a past week can hold one. */
async function heldIn(personId: string, week: string, taskIds: string[]) {
  await db
    .prepare("INSERT INTO week_plans (user_id, week) VALUES (?, ?)")
    .bind(personId, week)
    .run();
  if (taskIds.length === 0) return;
  await db.batch(
    taskIds.map((id, at) =>
      db
        .prepare(
          "INSERT INTO week_plan_tasks (user_id, week, task_id, position) VALUES (?, ?, ?, ?)",
        )
        .bind(personId, week, id, at + 1),
    ),
  );
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

    expect((await weekPage(ada.cookie)).span).toMatch(/^Mon 31 Aug – Fri 4 Sept?$/);
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

  // A pick claims a place, and the place it claims is the top: the work a
  // person just named is the work they are looking at. See ADR-0021.
  it("puts each pick on top, whatever order the columns sort in", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "first", { position: 1 });
    await task(ada.org.id, "second", { position: 2 });

    await act(ada.cookie, { intent: "plan", id: "second", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "first", slug: ada.org.slug });

    expect(ids(await weekPage(ada.cookie), "week")).toEqual(["first", "second"]);
    expect(await stored(ada.person.id)).toEqual(["first", "second"]);
  });

  it("leaves a member already held where the person put it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await task(ada.org.id, "b");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "b", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });

    expect(await stored(ada.person.id)).toEqual(["b", "a"]);
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

  it("touches the week's row, because unpicking is work on the week", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await db
      .prepare("UPDATE week_plans SET updated_at = '2000-01-01T00:00:00.000Z'")
      .run();
    await act(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });

    const row = await db
      .prepare("SELECT updated_at FROM week_plans WHERE user_id = ?")
      .bind(ada.person.id)
      .first<{ updated_at: string }>();
    expect(row!.updated_at).not.toBe("2000-01-01T00:00:00.000Z");
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

  it("joins one task per line to the set as a block, first line topmost", async () => {
    const ada = await member("ada@example.test", "Ada");

    const block = added(await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "first\nsecond\nthird",
    }));

    expect(block.ids).toHaveLength(3);
    expect(await stored(ada.person.id)).toEqual(block.ids);
  });

  it("lands a pasted block above the members already ranked", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ranked");
    await act(ada.cookie, { intent: "plan", id: "ranked", slug: ada.org.slug });

    const block = added(await act(ada.cookie, {
      intent: "create",
      slug: ada.org.slug,
      title: "one\ntwo",
    }));

    expect(await stored(ada.person.id)).toEqual([...block.ids, "ranked"]);
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

describe("stepping a task between columns", () => {
  /** The column one task sits in now. */
  async function columnOf(id: string) {
    const row = await db
      .prepare("SELECT status FROM tasks WHERE id = ?")
      .bind(id)
      .first<{ status: string }>();
    return row?.status ?? null;
  }

  it("takes the move the > key posts", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");

    await act(ada.cookie, { intent: "move", id: "ship", slug: ada.org.slug, status: "in_progress" });

    expect(await columnOf("ship")).toBe("in_progress");
  });

  // A step to Done finishes the task, and the set keeps it: the week says what
  // a person meant to finish, and finishing it is not leaving the set.
  it("keeps a picked task in the set when it steps to Done", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");
    await act(ada.cookie, { intent: "plan", id: "ship", slug: ada.org.slug });

    await act(ada.cookie, { intent: "move", id: "ship", slug: ada.org.slug, status: "done" });

    expect(await columnOf("ship")).toBe("done");
    expect(await stored(ada.person.id)).toEqual(["ship"]);
  });
});

describe("the order the week set holds", () => {
  /** A set picked from the bottom up, so the page reads it a, b, c. */
  async function ranked(cookie: string, orgSlug: string, orgId: string) {
    for (const id of ["c", "b", "a"]) {
      await task(orgId, id);
      await act(cookie, { intent: "plan", id, slug: orgSlug });
    }
  }

  it("steps a member up a place", async () => {
    const ada = await member("ada@example.test", "Ada");
    await ranked(ada.cookie, ada.org.slug, ada.org.id);

    await act(ada.cookie, { intent: "up", id: "b" });

    expect(ids(await weekPage(ada.cookie), "week")).toEqual(["b", "a", "c"]);
  });

  it("steps a member down a place", async () => {
    const ada = await member("ada@example.test", "Ada");
    await ranked(ada.cookie, ada.org.slug, ada.org.id);

    await act(ada.cookie, { intent: "down", id: "b" });

    expect(ids(await weekPage(ada.cookie), "week")).toEqual(["a", "c", "b"]);
  });

  it("writes no row for a step off either end", async () => {
    const ada = await member("ada@example.test", "Ada");
    await ranked(ada.cookie, ada.org.slug, ada.org.id);

    await act(ada.cookie, { intent: "up", id: "a" });
    await act(ada.cookie, { intent: "down", id: "c" });

    expect(await stored(ada.person.id)).toEqual(["a", "b", "c"]);
  });

  it("promotes a member to the top", async () => {
    const ada = await member("ada@example.test", "Ada");
    await ranked(ada.cookie, ada.org.slug, ada.org.id);

    await act(ada.cookie, { intent: "top", id: "c" });

    expect(ids(await weekPage(ada.cookie), "week")).toEqual(["c", "a", "b"]);
  });

  it("moves nothing for a task the set does not hold", async () => {
    const ada = await member("ada@example.test", "Ada");
    await ranked(ada.cookie, ada.org.slug, ada.org.id);
    await task(ada.org.id, "loose");

    await act(ada.cookie, { intent: "top", id: "loose" });
    await act(ada.cookie, { intent: "up", id: "loose" });

    expect(await stored(ada.person.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps the ranks of the members left when one is unpicked", async () => {
    const ada = await member("ada@example.test", "Ada");
    await ranked(ada.cookie, ada.org.slug, ada.org.id);

    await act(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });

    expect(await stored(ada.person.id)).toEqual(["b", "c"]);
  });

  it("says the week was worked on, because a step is work on it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await ranked(ada.cookie, ada.org.slug, ada.org.id);
    await db.prepare("UPDATE week_plans SET updated_at = '2000-01-01T00:00:00.000Z'").run();

    await act(ada.cookie, { intent: "top", id: "c" });

    const row = await db
      .prepare("SELECT updated_at FROM week_plans WHERE user_id = ?")
      .bind(ada.person.id)
      .first<{ updated_at: string }>();
    expect(row!.updated_at).not.toBe("2000-01-01T00:00:00.000Z");
  });
});

describe("a member finished this week", () => {
  it("sinks under the live ones, struck through and still counted", async () => {
    const ada = await member("ada@example.test", "Ada");
    for (const id of ["c", "b", "a"]) {
      await task(ada.org.id, id);
      await act(ada.cookie, { intent: "plan", id, slug: ada.org.slug });
    }

    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });
    const data = await weekPage(ada.cookie);

    expect(ids(data, "week")).toEqual(["b", "c", "a"]);
    expect(data.done).toBe(1);
    expect(data.picked).toHaveLength(3);
  });

  // Nothing is written on a finish, so the rank the person gave is still there.
  it("gives its rank back once it is unfinished", async () => {
    const ada = await member("ada@example.test", "Ada");
    for (const id of ["c", "b", "a"]) {
      await task(ada.org.id, id);
      await act(ada.cookie, { intent: "plan", id, slug: ada.org.slug });
    }

    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "move", id: "a", slug: ada.org.slug, status: "todo" });

    expect(ids(await weekPage(ada.cookie), "week")).toEqual(["a", "b", "c"]);
  });

  it("takes no step of its own, and is read past by the live rows", async () => {
    const ada = await member("ada@example.test", "Ada");
    for (const id of ["c", "b", "a"]) {
      await task(ada.org.id, id);
      await act(ada.cookie, { intent: "plan", id, slug: ada.org.slug });
    }
    await act(ada.cookie, { intent: "finish", id: "b", slug: ada.org.slug });

    await act(ada.cookie, { intent: "up", id: "b" });
    expect(await stored(ada.person.id)).toEqual(["a", "b", "c"]);

    // "c" reads past the finished "b" to the live "a" it sits under on screen.
    await act(ada.cookie, { intent: "up", id: "c" });
    expect(ids(await weekPage(ada.cookie), "week")).toEqual(["c", "a", "b"]);
  });
});

/**
 * A week that is over. See #142: a past week is read, not rewritten, and what
 * it left unfinished is fetched into the week the person is in.
 */
describe("a week that is over", () => {
  it("reads back, so the page draws no pick and no step", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");
    await heldIn(ada.person.id, PAST, ["ship"]);

    const data = await namedPage(ada.cookie, PAST);

    expect(data.canPick).toBe(false);
    expect(ids(data, "week")).toEqual(["ship"]);
  });

  it("plans as it always did while the week is still to come", async () => {
    const ada = await member("ada@example.test", "Ada");

    expect((await namedPage(ada.cookie, "2026-W40")).canPick).toBe(true);
    expect((await weekPage(ada.cookie)).canPick).toBe(true);
  });

  /** Every act that writes the set, as a form posts it. `slug` is filled in. */
  const WRITES: Record<string, string>[] = [
    { intent: "plan", id: "ship", slug: "" },
    { intent: "unplan", id: "ship", slug: "" },
    { intent: "up", id: "ship" },
    { intent: "top", id: "ship" },
    { intent: "create", title: "Ship it", slug: "" },
    { intent: "carry" },
    { intent: "clean" },
  ];

  for (const fields of WRITES) {
    it(`refuses ${fields.intent}, whoever posts it`, async () => {
      const ada = await member("ada@example.test", "Ada");
      await task(ada.org.id, "ship");
      await heldIn(ada.person.id, PAST, ["ship"]);

      const response = await caught(
        act(ada.cookie, { ...fields, slug: "slug" in fields ? ada.org.slug : "" }, { week: PAST }),
      );

      expect(response.status).toBe(400);
      expect(await stored(ada.person.id, PAST)).toEqual(["ship"]);
    });
  }

  // The task is live wherever it is drawn, and a record of the week is not a
  // freeze of the work.
  it("still finishes a task and still moves one between columns", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship");
    await task(ada.org.id, "write");
    await heldIn(ada.person.id, PAST, ["ship", "write"]);

    await act(ada.cookie, { intent: "finish", id: "ship", slug: ada.org.slug }, { week: PAST });
    await act(
      ada.cookie,
      { intent: "move", id: "write", slug: ada.org.slug, status: "in_progress" },
      { week: PAST },
    );

    const columns = await db.prepare("SELECT id, status FROM tasks ORDER BY id").all();
    expect(columns.results).toEqual([
      { id: "ship", status: "done" },
      { id: "write", status: "in_progress" },
    ]);
  });
});

describe("the take", () => {
  /** A past week holding two live tasks and one already finished. */
  async function unfinished(ada: { person: { id: string }; org: { id: string } }) {
    await task(ada.org.id, "a");
    await task(ada.org.id, "b");
    await task(ada.org.id, "done-one", { status: "done" });
    await heldIn(ada.person.id, PAST, ["a", "b", "done-one"]);
  }

  it("names the count and the week the browser is in", async () => {
    const ada = await member("ada@example.test", "Ada");
    await unfinished(ada);

    expect((await namedPage(ada.cookie, PAST)).take).toEqual({ into: WEEK, count: 2 });
  });

  it("offers nothing where the week left nothing unfinished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "done-one", { status: "done" });
    await heldIn(ada.person.id, PAST, ["done-one"]);

    expect((await namedPage(ada.cookie, PAST)).take).toBeNull();
  });

  it("offers nothing on a week that is still to be worked", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await heldIn(ada.person.id, WEEK, ["a"]);

    expect((await weekPage(ada.cookie)).take).toBeNull();
  });

  it("starts the week it takes into, as a carry does", async () => {
    const ada = await member("ada@example.test", "Ada");
    await unfinished(ada);

    await act(ada.cookie, { intent: "take" }, { week: PAST });

    expect(await stored(ada.person.id)).toEqual(["a", "b"]);
  });

  it("lands the block on top of the set already there, in its own order", async () => {
    const ada = await member("ada@example.test", "Ada");
    await unfinished(ada);
    await task(ada.org.id, "z");
    await act(ada.cookie, { intent: "plan", id: "z", slug: ada.org.slug });

    await act(ada.cookie, { intent: "take" }, { week: PAST });

    expect(await stored(ada.person.id)).toEqual(["a", "b", "z"]);
  });

  it("writes the target week alone, so a taken task is in both sets", async () => {
    const ada = await member("ada@example.test", "Ada");
    await unfinished(ada);

    await act(ada.cookie, { intent: "take" }, { week: PAST });

    expect(await stored(ada.person.id, PAST)).toEqual(["a", "b", "done-one"]);
  });

  it("leaves out a member no org answers for", async () => {
    const ada = await member("ada@example.test", "Ada");
    await unfinished(ada);
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 'b'").run();

    await act(ada.cookie, { intent: "take" }, { week: PAST });

    expect(await stored(ada.person.id)).toEqual(["a"]);
  });

  it("is refused on a week the person is still working", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await heldIn(ada.person.id, WEEK, ["a"]);

    const response = await caught(act(ada.cookie, { intent: "take" }));

    expect(response.status).toBe(400);
  });
});
