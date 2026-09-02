/**
 * Archive: the per-column sweep, the one undo for the batch, the flat list
 * newest first, and what leaves the board when a task is archived.
 * See #61 and #121.
 */

import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import * as archiveRoute from "../app/routes/archive";
import * as boardRoute from "../app/routes/board";
import * as loginRoute from "../app/routes/login";
import * as meRoute from "../app/routes/me";
import * as planRoute from "../app/routes/me.plan";
import * as taskRoute from "../app/routes/task";
import { cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";

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
  return { id: person.id, org: org!, cookie: cookieFrom(response) };
}

/** A signed request, ready for a route. */
function signed(request: Request, cookie: string) {
  request.headers.set("cookie", cookie);
  return request;
}

/** A post to the board action, signed by the cookie. */
function board(slug: string, cookie: string, fields: Record<string, string | string[]>) {
  return boardRoute.action(routeArgs(signed(post(`/o/${slug}/board`, fields), cookie), { slug }));
}

/** A read of the board, signed by the cookie. */
function readBoard(slug: string, cookie: string, query = "") {
  return boardRoute.loader(
    routeArgs(signed(get(`/o/${slug}/board${query}`), cookie), { slug }),
  ) as Promise<{ columns: { status: string; tasks: { id: string }[] }[] }>;
}

/** A read of the archive screen, signed by the cookie. */
function readArchive(slug: string, cookie: string, query = "") {
  return archiveRoute.loader(
    routeArgs(signed(get(`/o/${slug}/archive${query}`), cookie), { slug }),
  ) as Promise<{ lines: { id: string; title: string; status: string }[] }>;
}

/**
 * A task planned for today, then moved into Done. Only a live task can be
 * picked, so the plan comes first and the finish after it.
 */
async function planned(slug: string, cookie: string, title: string) {
  const id = await made(slug, cookie, "todo", title);
  await planRoute.action(
    routeArgs(signed(post("/me/plan", { intent: "plan", id, slug }), cookie), {}),
  );
  await board(slug, cookie, { intent: "move", id, status: "done" });
  return id;
}

/** A post to the task page, signed by the cookie. */
function task(slug: string, cookie: string, taskId: string, fields: Record<string, string>) {
  return taskRoute.action(
    routeArgs(signed(post(`/o/${slug}/t/${taskId}`, fields), cookie), { slug, taskId }),
  );
}

/** One task in one column, made by the board's quick add. Gives back its id. */
async function made(slug: string, cookie: string, status: string, title: string) {
  await board(slug, cookie, { intent: "create", status, title });
  const row = await db
    .prepare("SELECT id FROM tasks WHERE title = ?")
    .bind(title)
    .first<{ id: string }>();
  return row!.id;
}

/** The archive flag and stamp of one row. */
async function flagOf(id: string) {
  const row = await db
    .prepare("SELECT archived, archived_at, status FROM tasks WHERE id = ?")
    .bind(id)
    .first<{ archived: number; archived_at: string | null; status: string }>();
  return row!;
}

/** The ids a board column draws. */
async function column(slug: string, cookie: string, status: string, query = "") {
  const { columns } = await readBoard(slug, cookie, query);
  return columns.find((one) => one.status === status)?.tasks.map((card) => card.id) ?? [];
}

describe("archiving one task", () => {
  it("takes it off the board and keeps its status", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "done", "Ship it");

    await task(ada.org.slug, ada.cookie, id, { intent: "archive" });

    expect(await flagOf(id)).toMatchObject({ archived: 1, status: "done" });
    expect(await column(ada.org.slug, ada.cookie, "done")).toEqual([]);
  });

  it("stamps the time it was archived", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "done", "Ship it");

    await task(ada.org.slug, ada.cookie, id, { intent: "archive" });

    expect((await flagOf(id)).archived_at).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it("restores it to the column it held, and clears the stamp", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "cancelled", "Drop it");
    await task(ada.org.slug, ada.cookie, id, { intent: "archive" });

    await task(ada.org.slug, ada.cookie, id, { intent: "restore" });

    expect(await flagOf(id)).toMatchObject({ archived: 0, archived_at: null, status: "cancelled" });
    expect(await column(ada.org.slug, ada.cookie, "cancelled", "?cancelled=1")).toEqual([id]);
  });

  it("refuses live work, because archive keeps finished work", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "todo", "Still going");

    await task(ada.org.slug, ada.cookie, id, { intent: "archive" });

    expect(await flagOf(id)).toMatchObject({ archived: 0, archived_at: null });
  });

  it("writes nothing for a task another org holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    const id = await made(ada.org.slug, ada.cookie, "done", "Ada's work");

    await taskRoute
      .action(
        routeArgs(signed(post(`/o/${bob.org.slug}/t/${id}`, { intent: "archive" }), bob.cookie), {
          slug: bob.org.slug,
          taskId: id,
        }),
      )
      .catch(() => null);

    expect((await flagOf(id)).archived).toBe(0);
  });
});

describe("the per-column sweep", () => {
  it("archives exactly the ids the form names, and no more", async () => {
    const ada = await member("ada@example.test", "Ada");
    const swept = await made(ada.org.slug, ada.cookie, "done", "Swept");
    const left = await made(ada.org.slug, ada.cookie, "done", "Left alone");

    await board(ada.org.slug, ada.cookie, { intent: "archive", id: [swept] });

    expect((await flagOf(swept)).archived).toBe(1);
    expect((await flagOf(left)).archived).toBe(0);
    expect(await column(ada.org.slug, ada.cookie, "done")).toEqual([left]);
  });

  it("sweeps a whole unnarrowed column, which is the whole column", async () => {
    const ada = await member("ada@example.test", "Ada");
    await made(ada.org.slug, ada.cookie, "done", "One");
    await made(ada.org.slug, ada.cookie, "done", "Two");
    const onScreen = await column(ada.org.slug, ada.cookie, "done");

    await board(ada.org.slug, ada.cookie, { intent: "archive", id: onScreen });

    expect(await column(ada.org.slug, ada.cookie, "done")).toEqual([]);
    expect((await readArchive(ada.org.slug, ada.cookie)).lines).toHaveLength(2);
  });

  it("archives what the Today chip left, and leaves the rest on the board", async () => {
    const ada = await member("ada@example.test", "Ada");
    const mine = await planned(ada.org.slug, ada.cookie, "Planned");
    const other = await made(ada.org.slug, ada.cookie, "done", "Not planned");
    const onScreen = await column(ada.org.slug, ada.cookie, "done", "?today=1");

    await board(ada.org.slug, ada.cookie, { intent: "archive", id: onScreen });

    expect(onScreen).toEqual([mine]);
    expect((await flagOf(mine)).archived).toBe(1);
    expect((await flagOf(other)).archived).toBe(0);
  });

  it("counts no task the org does not hold", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    const hers = await made(bob.org.slug, bob.cookie, "done", "Bob's work");

    const swept = (await board(ada.org.slug, ada.cookie, {
      intent: "archive",
      id: [hers],
    })) as { archived: string[] };

    expect(swept.archived).toEqual([]);
    expect((await flagOf(hers)).archived).toBe(0);
  });
});

describe("the one undo for the batch", () => {
  it("restores the whole batch in one act", async () => {
    const ada = await member("ada@example.test", "Ada");
    await made(ada.org.slug, ada.cookie, "done", "One");
    await made(ada.org.slug, ada.cookie, "done", "Two");
    const onScreen = await column(ada.org.slug, ada.cookie, "done");
    const swept = (await board(ada.org.slug, ada.cookie, {
      intent: "archive",
      id: onScreen,
    })) as { archived: string[] };

    await board(ada.org.slug, ada.cookie, { intent: "restore", id: swept.archived });

    expect(await column(ada.org.slug, ada.cookie, "done")).toEqual(onScreen);
  });

  it("leaves a task archived before the sweep archived", async () => {
    const ada = await member("ada@example.test", "Ada");
    const early = await made(ada.org.slug, ada.cookie, "done", "Archived earlier");
    const late = await made(ada.org.slug, ada.cookie, "done", "Swept");
    await task(ada.org.slug, ada.cookie, early, { intent: "archive" });

    // The form names both, as a stale screen would. The sweep changed one.
    const swept = (await board(ada.org.slug, ada.cookie, {
      intent: "archive",
      id: [early, late],
    })) as { archived: string[] };
    await board(ada.org.slug, ada.cookie, { intent: "restore", id: swept.archived });

    expect(swept.archived).toEqual([late]);
    expect((await flagOf(early)).archived).toBe(1);
    expect((await flagOf(late)).archived).toBe(0);
  });
});

describe("the archive screen", () => {
  it("lists archived tasks, newest archived first", async () => {
    const ada = await member("ada@example.test", "Ada");
    const first = await made(ada.org.slug, ada.cookie, "done", "Archived first");
    const second = await made(ada.org.slug, ada.cookie, "done", "Archived second");
    await task(ada.org.slug, ada.cookie, first, { intent: "archive" });
    // The stamp is to the millisecond, so the second archive is pushed past it.
    await db
      .prepare("UPDATE tasks SET archived_at = '2020-01-01T00:00:00.000Z' WHERE id = ?")
      .bind(first)
      .run();
    await task(ada.org.slug, ada.cookie, second, { intent: "archive" });

    const { lines } = await readArchive(ada.org.slug, ada.cookie);

    expect(lines.map((line) => line.id)).toEqual([second, first]);
  });

  it("holds Cancelled whatever the board's toggle says", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "cancelled", "Dropped");
    await task(ada.org.slug, ada.cookie, id, { intent: "archive" });

    const { lines } = await readArchive(ada.org.slug, ada.cookie);

    expect(lines).toMatchObject([{ id, status: "Cancelled" }]);
  });

  it("reads the Today chip, as the board does", async () => {
    const ada = await member("ada@example.test", "Ada");
    const mine = await planned(ada.org.slug, ada.cookie, "Planned");
    const other = await made(ada.org.slug, ada.cookie, "done", "Not planned");
    await board(ada.org.slug, ada.cookie, { intent: "archive", id: [mine, other] });

    const { lines } = await readArchive(ada.org.slug, ada.cookie, "?today=1");

    expect(lines.map((line) => line.id)).toEqual([mine]);
  });

  it("shows no task of another org", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    const hers = await made(bob.org.slug, bob.cookie, "done", "Bob's work");
    await task(bob.org.slug, bob.cookie, hers, { intent: "archive" });

    const { lines } = await readArchive(ada.org.slug, ada.cookie);

    expect(lines).toEqual([]);
  });

  it("puts a task back on the board", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "done", "Ship it");
    await task(ada.org.slug, ada.cookie, id, { intent: "archive" });

    await archiveRoute.action(
      routeArgs(
        signed(post(`/o/${ada.org.slug}/archive`, { intent: "restore", id }), ada.cookie),
        { slug: ada.org.slug },
      ),
    );

    expect((await flagOf(id)).archived).toBe(0);
  });
});

describe("an archived task", () => {
  it("leaves the unified board", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await made(ada.org.slug, ada.cookie, "done", "Ship it");

    const before = (await meRoute.loader(
      routeArgs(signed(get("/me?done=1"), ada.cookie), {}),
    )) as { columns: { status: string; tasks: { id: string }[] }[] };
    await task(ada.org.slug, ada.cookie, id, { intent: "archive" });
    const after = (await meRoute.loader(
      routeArgs(signed(get("/me?done=1"), ada.cookie), {}),
    )) as { columns: { status: string; tasks: { id: string }[] }[] };

    const done = (board: typeof before) =>
      board.columns.find((one) => one.status === "done")?.tasks.map((card) => card.id) ?? [];
    expect(done(before)).toEqual([id]);
    expect(done(after)).toEqual([]);
  });

  it("drops out of a plan", async () => {
    const ada = await member("ada@example.test", "Ada");
    const id = await planned(ada.org.slug, ada.cookie, "Ship it");

    await task(ada.org.slug, ada.cookie, id, { intent: "archive" });
    const plan = (await planRoute.loader(
      routeArgs(signed(get("/me/plan"), ada.cookie), {}),
    )) as { planned: string[] };

    expect(plan.planned).toEqual([]);
  });
});
