import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import type { Status } from "../app/board";
import { dayOf } from "../app/day";
import * as boardRoute from "../app/routes/board";
import * as loginRoute from "../app/routes/login";
import * as planRoute from "../app/routes/me.plan";
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
async function task(orgId: string, id: string, some: { status?: Status; position?: number } = {}) {
  await db
    .prepare(
      "INSERT INTO tasks (id, org_id, title, status, position) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, orgId, id, some.status ?? "todo", some.position ?? 1)
    .run();
  return id;
}

/** Plan mode, as one person reads it on the day their browser is in. */
function planPage(cookie: string, day = DAY) {
  return planRoute.loader(routeArgs(get("/me/plan", `${cookie}; day=${day}`)));
}

/** Plan mode for a day the path names, which the browser cannot talk out of. */
function dayPage(cookie: string, named: string, browserDay = DAY) {
  return planRoute.loader(
    routeArgs(get(`/me/plan/${named}`, `${cookie}; day=${browserDay}`), { day: named }),
  );
}

/** A post to plan mode, signed by the cookie and named for a day. */
function act(cookie: string, fields: Record<string, string>, day = DAY) {
  const request = post("/me/plan", fields);
  request.headers.set("cookie", `${cookie}; day=${day}`);
  return planRoute.action(routeArgs(request));
}

/** The ids one group holds, in the order the page draws them. */
function ids(data: { groups: { key: string; tasks: { id: string }[] }[] }, key: string) {
  return data.groups.find((one) => one.key === key)!.tasks.map((one) => one.id);
}

/** The order one plans row holds. */
async function stored(personId: string, day = DAY) {
  const row = await db
    .prepare("SELECT task_ids FROM plans WHERE user_id = ? AND day = ?")
    .bind(personId, day)
    .first<{ task_ids: string }>();
  return row ? (JSON.parse(row.task_ids) as string[]) : null;
}

/** The board, as one person reads it on one day. */
function board(cookie: string, slug: string, query = "", day = DAY) {
  return boardRoute.loader(
    routeArgs(get(`/o/${slug}/board${query}`, `${cookie}; day=${day}`), { slug }),
  );
}

describe("who can read plan mode", () => {
  it("sends a signed-out request to sign-in", async () => {
    const response = await caught(planRoute.loader(routeArgs(get("/me/plan"))));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?next=%2Fme%2Fplan");
  });
});

describe("the candidate list", () => {
  it("is the live set: To do and In progress, every org", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await task(ada.org.id, "mine");
    await task(other.id, "ours", { status: "in_progress" });
    await task(ada.org.id, "later", { status: "backlog" });

    const data = await planPage(ada.cookie);

    expect(data.groups.map((one) => one.key)).toEqual(["today", "week", "in_progress", "todo"]);
    expect(ids(data, "in_progress")).toEqual(["ours"]);
    expect(ids(data, "todo")).toEqual(["mine"]);
  });

  it("names the org of every row, because a plan holds several", async () => {
    const ada = await member("ada@example.test", "Ada");
    const other = await team(ada.person.id, "codeuncode");
    await task(ada.org.id, "mine");
    await task(other.id, "ours");

    await act(ada.cookie, { intent: "plan", id: "mine", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "ours", slug: other.slug });
    const picked = (await planPage(ada.cookie)).groups[0].tasks;

    expect(picked.map((one) => one.id)).toEqual(["mine", "ours"]);
    expect(picked.map((one) => one.org.slug)).toEqual([ada.org.slug, "codeuncode"]);
    expect((await planPage(ada.cookie)).planned).toEqual(["mine", "ours"]);
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

describe("a task the plan holds", () => {
  it("is drawn in Today and nowhere else", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "planned", { status: "in_progress" });
    await task(ada.org.id, "loose");

    await act(ada.cookie, { intent: "plan", id: "planned", slug: ada.org.slug });
    const data = await planPage(ada.cookie);

    expect(ids(data, "today")).toEqual(["planned"]);
    expect(ids(data, "in_progress")).toEqual([]);
    expect(ids(data, "todo")).toEqual(["loose"]);
  });

  it("stays in Today once it is finished, and is marked finished", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });
    const data = await planPage(ada.cookie);

    expect(ids(data, "today")).toEqual(["a"]);
    expect(data.groups[0].tasks[0].finished).toBe(true);
  });

  it("drops out of the day once it rolls over, and keeps its place in the week", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "finish", id: "a", slug: ada.org.slug });
    // The next day of the same week: a new plan, and the one week set.
    const data = await planPage(ada.cookie, "2026-09-02");

    expect(ids(data, "today")).toEqual([]);
    // A finished member keeps its membership, struck through. See ADR-0014.
    expect(ids(data, "week")).toEqual(["a"]);
    expect(data.groups[1].tasks[0].finished).toBe(true);
  });

  it("drops out without an error once it is archived", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 'a'").run();
    const data = await planPage(ada.cookie);

    expect(data.groups.every((one) => one.tasks.length === 0)).toBe(true);
  });

  it("comes back out of the plan onto the week shelf it joined", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });
    const data = await planPage(ada.cookie);

    // Leaving a day is not leaving the week: the person still means to finish
    // it, on some other day. See ADR-0014.
    expect(ids(data, "today")).toEqual([]);
    expect(ids(data, "week")).toEqual(["a"]);
    expect(ids(data, "todo")).toEqual([]);
  });
});

describe("picking and ordering a day", () => {
  it("writes one row per person per day, holding the picked ids", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await task(ada.org.id, "b", { position: 2 });

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "b", slug: ada.org.slug });

    expect(await stored(ada.person.id)).toEqual(["a", "b"]);
    const { results } = await db.prepare("SELECT day FROM plans").all();
    expect(results).toEqual([{ day: DAY }]);
  });

  it("moves a picked task up, and the new order is what the row holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await task(ada.org.id, "b", { position: 2 });

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "b", slug: ada.org.slug });
    await act(ada.cookie, { intent: "up", id: "b" });

    expect(await stored(ada.person.id)).toEqual(["b", "a"]);
    expect(ids(await planPage(ada.cookie), "today")).toEqual(["b", "a"]);
  });

  it("moves a picked task down", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await task(ada.org.id, "b", { position: 2 });

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "b", slug: ada.org.slug });
    await act(ada.cookie, { intent: "down", id: "a" });

    expect(await stored(ada.person.id)).toEqual(["b", "a"]);
  });

  it("leaves the order alone at either end of the plan", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "up", id: "a" });
    await act(ada.cookie, { intent: "down", id: "a" });
    await act(ada.cookie, { intent: "top", id: "a" });

    expect(await stored(ada.person.id)).toEqual(["a"]);
  });

  // `T` binds wherever a page owns an order, so plan mode takes it as the
  // week page does. See ADR-0021.
  it("promotes a picked task to the top of the plan", async () => {
    const ada = await member("ada@example.test", "Ada");
    for (const [at, id] of ["a", "b", "c"].entries()) {
      await task(ada.org.id, id, { position: at + 1 });
      await act(ada.cookie, { intent: "plan", id, slug: ada.org.slug });
    }

    await act(ada.cookie, { intent: "top", id: "c" });

    expect(await stored(ada.person.id)).toEqual(["c", "a", "b"]);
    expect(ids(await planPage(ada.cookie), "today")).toEqual(["c", "a", "b"]);
  });

  it("takes a picked task back out", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });
    const data = await planPage(ada.cookie);

    expect(await stored(ada.person.id)).toEqual([]);
    expect(ids(data, "today")).toEqual([]);
    expect(ids(data, "week")).toEqual(["a"]);
  });

  it("refuses a form that names no act", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = await caught(act(ada.cookie, { intent: "sideways", id: "a" }));

    expect(response.status).toBe(400);
  });

  it("drops a picked task that was archived, without an error", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await db.prepare("UPDATE tasks SET archived = 1 WHERE id = 'a'").run();
    const data = await planPage(ada.cookie);

    expect(ids(data, "today")).toEqual([]);
    expect(data.groups.every((one) => one.tasks.length === 0)).toBe(true);
  });

  it("drops a picked task that was deleted, without an error", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await task(ada.org.id, "b", { position: 2 });

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "b", slug: ada.org.slug });
    await db.prepare("DELETE FROM tasks WHERE id = 'a'").run();

    expect(ids(await planPage(ada.cookie), "today")).toEqual(["b"]);
  });
});

describe("re-opening a day", () => {
  it("loads the plan that was committed, and can change it", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await task(ada.org.id, "b", { position: 2 });
    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "plan", id: "b", slug: ada.org.slug });

    const again = await dayPage(ada.cookie, DAY, "2026-09-05");
    expect(again.day).toBe(DAY);
    expect(again.named).toBe(true);
    expect(ids(again, "today")).toEqual(["a", "b"]);

    await act(ada.cookie, { intent: "up", id: "b" });
    expect(ids(await dayPage(ada.cookie, DAY, "2026-09-05"), "today")).toEqual(["b", "a"]);
  });

  it("holds one plan per day, so another day is another row", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug }, "2026-09-02");

    expect(await stored(ada.person.id, "2026-09-02")).toEqual(["a"]);
    expect(await stored(ada.person.id, DAY)).toBe(null);
  });

  it("answers 404 for a path that names no calendar date", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = await caught(dayPage(ada.cookie, "tomorrow"));

    expect(response.status).toBe(404);
  });
});

describe("the day a plan lands on", () => {
  /** The day a browser in one zone reads off its own clock. */
  function dayIn(zone: string, at: Date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  }

  const KOLKATA = "Asia/Kolkata";
  // 23:00 on 2026-09-01 in Asia/Kolkata, and 00:30 on 2026-09-02 there. The
  // second one is the reading a UTC clock gets wrong, because the Worker is
  // still on 2026-09-01.
  const EVENING = new Date("2026-09-01T17:30:00.000Z");
  const AFTER_MIDNIGHT = new Date("2026-09-01T19:00:00.000Z");

  it("takes 23:00 in Asia/Kolkata as that day, not the next one", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    const there = dayIn(KOLKATA, EVENING);
    expect(there).toBe("2026-09-01");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug }, there);

    expect(await stored(ada.person.id, "2026-09-01")).toEqual(["a"]);
    expect(await stored(ada.person.id, "2026-09-02")).toBe(null);
    expect(dayOf(get("/me/plan", `day=${there}`), EVENING)).toBe("2026-09-01");
  });

  it("takes the day in Asia/Kolkata where the Worker is still on the day before", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    const there = dayIn(KOLKATA, AFTER_MIDNIGHT);
    expect(there).toBe("2026-09-02");

    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug }, there);

    expect(await stored(ada.person.id, "2026-09-02")).toEqual(["a"]);
    // The Worker's own clock alone would have said the day before.
    expect(dayOf(get("/me/plan"), AFTER_MIDNIGHT)).toBe("2026-09-01");
    expect(dayOf(get("/me/plan", `day=${there}`), AFTER_MIDNIGHT)).toBe("2026-09-02");
  });
});

describe("the Today chip on a board", () => {
  it("narrows the board to today's plan, and clearing it gives the board back", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "picked");
    await task(ada.org.id, "loose", { position: 2 });
    await act(ada.cookie, { intent: "plan", id: "picked", slug: ada.org.slug });

    const narrowed = await board(ada.cookie, ada.org.slug, "?today=1");
    const whole = await board(ada.cookie, ada.org.slug);

    expect(narrowed.today).toBe(true);
    expect(narrowed.columns.flatMap((one) => one.tasks.map((card) => card.id))).toEqual(["picked"]);
    expect(whole.today).toBe(false);
    expect(whole.columns.flatMap((one) => one.tasks.map((card) => card.id))).toEqual([
      "picked",
      "loose",
    ]);
  });

  it("is absent while today's plan holds nothing", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    expect((await board(ada.cookie, ada.org.slug)).hasPlan).toBe(false);
    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    expect((await board(ada.cookie, ada.org.slug)).hasPlan).toBe(true);
    // Another day is another plan, so the chip goes with it.
    expect((await board(ada.cookie, ada.org.slug, "", "2026-09-02")).hasPlan).toBe(false);
    // An emptied plan narrows to nothing, so it carries no chip either.
    await act(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });
    expect((await board(ada.cookie, ada.org.slug)).hasPlan).toBe(false);
  });

  it("narrows nothing once the plan is emptied", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");
    await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug });
    await act(ada.cookie, { intent: "unplan", id: "a", slug: ada.org.slug });

    const data = await board(ada.cookie, ada.org.slug, "?today=1");

    expect(data.today).toBe(false);
    expect(data.columns.flatMap((one) => one.tasks.map((card) => card.id))).toEqual(["a"]);
  });

  it("narrows nothing when no plan for today exists", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    const data = await board(ada.cookie, ada.org.slug, "?today=1");

    expect(data.today).toBe(false);
    expect(data.columns.flatMap((one) => one.tasks.map((card) => card.id))).toEqual(["a"]);
  });

  it("keeps the columns the board shows, so narrowing changes no shape", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "picked");
    await task(ada.org.id, "later", { status: "backlog" });
    await act(ada.cookie, { intent: "plan", id: "picked", slug: ada.org.slug });

    const narrowed = await board(ada.cookie, ada.org.slug, "?today=1&backlog=1");

    expect(narrowed.columns.map((one) => one.status)).toEqual(
      (await board(ada.cookie, ada.org.slug, "?backlog=1")).columns.map((one) => one.status),
    );
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

  // The page draws the live set, so a task stepped into Done leaves it.
  it("drops the task off the page when it steps to Done", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "ship", { status: "in_progress" });

    await act(ada.cookie, { intent: "move", id: "ship", slug: ada.org.slug, status: "done" });

    expect(await columnOf("ship")).toBe("done");
    expect(ids(await planPage(ada.cookie), "in_progress")).toEqual([]);
  });
});

/** A day before `DAY`, whose plan is written and then read back. */
const PAST = "2026-08-25";

/** A post to a day the path names, which the browser cannot talk out of. */
function actOn(cookie: string, named: string, fields: Record<string, string>, browserDay = DAY) {
  const request = post(`/me/plan/${named}`, fields);
  request.headers.set("cookie", `${cookie}; day=${browserDay}`);
  return planRoute.action(routeArgs(request, { day: named }));
}

/** A person with a plan of two tasks on `PAST`, made on that day. */
async function planned() {
  const ada = await member("ada@example.test", "Ada");
  await task(ada.org.id, "a");
  await task(ada.org.id, "b", { position: 2 });
  await act(ada.cookie, { intent: "plan", id: "a", slug: ada.org.slug }, PAST);
  await act(ada.cookie, { intent: "plan", id: "b", slug: ada.org.slug }, PAST);
  return ada;
}

describe("walking to another day", () => {
  it("offers the day before and the day after", async () => {
    const ada = await member("ada@example.test", "Ada");

    const data = await planPage(ada.cookie);

    expect(data.day).toBe(DAY);
    expect(data.prev).toBe("2026-08-31");
    expect(data.next).toBe("2026-09-02");
    expect(data.onToday).toBe(true);
  });

  it("walks both ways from a day the path names", async () => {
    const ada = await member("ada@example.test", "Ada");

    const data = await dayPage(ada.cookie, PAST);

    expect(data.prev).toBe("2026-08-24");
    expect(data.next).toBe("2026-08-26");
    // The walk went somewhere, so the page offers the way home.
    expect(data.onToday).toBe(false);
  });

  it("knows it is on today when the path names today", async () => {
    const ada = await member("ada@example.test", "Ada");

    expect((await dayPage(ada.cookie, DAY)).onToday).toBe(true);
  });
});

describe("a day past its own", () => {
  it("draws the plan alone: no shelf, and no box", async () => {
    const ada = await planned();
    // A live task nothing planned, which today's page would offer to pick.
    await task(ada.org.id, "loose", { position: 3 });

    const data = await dayPage(ada.cookie, PAST);

    expect(data.canPlan).toBe(false);
    expect(data.canAdd).toBe(false);
    expect(data.groups.map((one) => one.key)).toEqual(["today"]);
    expect(ids(data, "today")).toEqual(["a", "b"]);
  });

  // The task is live whichever day is on screen, so a finish still finishes.
  it("still finishes a task, because that writes the task and not the plan", async () => {
    const ada = await planned();

    await actOn(ada.cookie, PAST, { intent: "finish", id: "a", slug: ada.org.slug });

    const row = await db.prepare("SELECT status FROM tasks WHERE id = 'a'").first<{
      status: string;
    }>();
    expect(row!.status).toBe("done");
  });

  // The refusal names the acts that stand, so an act added later is refused
  // here until someone says it is safe.
  it("refuses an act it does not know", async () => {
    const ada = await planned();

    const response = await caught(actOn(ada.cookie, PAST, { intent: "rewrite", id: "a" }));

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("A plan is never rewritten after its day.");
  });

  // A plan is made on its day and ahead of it, and read back after it.
  it("is only the days behind: a day still to come plans as today does", async () => {
    const ada = await member("ada@example.test", "Ada");
    await task(ada.org.id, "a");

    const ahead = await dayPage(ada.cookie, "2026-09-02");
    expect(ahead.canPlan).toBe(true);
    await actOn(ada.cookie, "2026-09-02", { intent: "plan", id: "a", slug: ada.org.slug });

    expect(await stored(ada.person.id, "2026-09-02")).toEqual(["a"]);
  });

  it("refuses a step and a promote, and leaves the order as the day left it", async () => {
    const ada = await planned();

    for (const intent of ["up", "top"]) {
      const response = await caught(actOn(ada.cookie, PAST, { intent, id: "b" }));
      expect(response.status).toBe(400);
    }

    expect(await stored(ada.person.id, PAST)).toEqual(["a", "b"]);
  });

  it("refuses a pick", async () => {
    const ada = await planned();
    await task(ada.org.id, "late", { position: 3 });

    const response = await caught(
      actOn(ada.cookie, PAST, { intent: "plan", id: "late", slug: ada.org.slug }),
    );

    expect(response.status).toBe(400);
    expect(await stored(ada.person.id, PAST)).toEqual(["a", "b"]);
  });

  it("refuses to drop a task the day holds", async () => {
    const ada = await planned();

    const response = await caught(
      actOn(ada.cookie, PAST, { intent: "unplan", id: "a", slug: ada.org.slug }),
    );

    expect(response.status).toBe(400);
    expect(await stored(ada.person.id, PAST)).toEqual(["a", "b"]);
  });

  it("still takes the day it is, so today writes as it did", async () => {
    const ada = await planned();

    await actOn(ada.cookie, DAY, { intent: "plan", id: "a", slug: ada.org.slug });

    expect(await stored(ada.person.id, DAY)).toEqual(["a"]);
  });
});
