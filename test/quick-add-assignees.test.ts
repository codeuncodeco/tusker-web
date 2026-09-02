import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import * as boardRoute from "../app/routes/board";
import * as loginRoute from "../app/routes/login";
import * as meRoute from "../app/routes/me";
import * as planRoute from "../app/routes/me.plan";
import { cookieFrom, get, post, routeArgs, wipe } from "./routes";

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

/** A team org, with everybody named as a member of it. */
async function team(slug: string, people: { id: string }[]) {
  const id = `org-${slug}`;
  await db.batch([
    db.prepare("INSERT INTO orgs (id, slug, name, kind) VALUES (?, ?, ?, 'team')").bind(id, slug, slug),
    ...people.map((person) =>
      db
        .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
        .bind(id, person.id),
    ),
  ]);
  return { id, slug };
}

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

describe("an add that names assignees", () => {
  it("holds the task with the members the org board box named", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo Kim");
    const blr = await team("blrhikes", [ada.person, bo.person]);

    await onBoard(ada.cookie, blr.slug, {
      intent: "create",
      status: "todo",
      title: "fix the map",
      assignee: [ada.person.id, bo.person.id],
    });

    expect(await heldIn(blr.id)).toEqual(
      new Map([["fix the map", [ada.person.id, bo.person.id].sort()]]),
    );
  });

  it("holds the task with the members a cross-org box named", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo Kim");
    const blr = await team("blrhikes", [ada.person, bo.person]);

    await onMe(ada.cookie, {
      intent: "create",
      slug: blr.slug,
      title: "fix the map",
      assignee: bo.person.id,
    });

    expect(await heldIn(blr.id)).toEqual(new Map([["fix the map", [bo.person.id]]]));
  });

  it("puts the set on every task a pasted list makes", async () => {
    const ada = await member("ada@example.test", "Ada");
    const blr = await team("blrhikes", [ada.person]);

    await onMe(ada.cookie, {
      intent: "create",
      slug: blr.slug,
      title: "one\ntwo\nthree",
      assignee: ada.person.id,
    });

    expect(await heldIn(blr.id)).toEqual(
      new Map([
        ["one", [ada.person.id]],
        ["two", [ada.person.id]],
        ["three", [ada.person.id]],
      ]),
    );
  });

  it("leaves the task unassigned when the box names nobody", async () => {
    const ada = await member("ada@example.test", "Ada");
    const blr = await team("blrhikes", [ada.person]);

    await onMe(ada.cookie, { intent: "create", slug: blr.slug, title: "nobody holds this" });

    expect(await heldIn(blr.id)).toEqual(new Map([["nobody holds this", []]]));
  });

  it("makes no task at all when an id names nobody the org holds", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo Kim");
    const blr = await team("blrhikes", [ada.person]);

    const acted = await onMe(ada.cookie, {
      intent: "create",
      slug: blr.slug,
      title: "fix the map",
      assignee: bo.person.id,
    });

    expect(acted).toEqual({ error: "blrhikes has no such member. Pick from the list." });
    expect(await heldIn(blr.id)).toEqual(new Map());
  });

  it("makes no task at all when the org board box names a member who left", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo Kim");
    const blr = await team("blrhikes", [ada.person]);

    const acted = await onBoard(ada.cookie, blr.slug, {
      intent: "create",
      status: "todo",
      title: "fix the map",
      assignee: bo.person.id,
    });

    expect(acted).toEqual({ error: "blrhikes has no such member. Pick from the list." });
    expect(await heldIn(blr.id)).toEqual(new Map());
  });
});

describe("the member lists a box draws from", () => {
  it("answers the org's members on a team board, in name order", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo Kim");
    const blr = await team("blrhikes", [bo.person, ada.person]);

    const data = await boardRoute.loader(
      routeArgs(get(`/o/${blr.slug}`, `${ada.cookie}; day=${DAY}`), { slug: blr.slug }),
    );

    expect(data.members).toEqual([
      { id: ada.person.id, name: "Ada", initials: "A" },
      { id: bo.person.id, name: "Bo Kim", initials: "BK" },
    ]);
  });

  it("answers no member on a personal board, which draws no picker", async () => {
    const ada = await member("ada@example.test", "Ada");

    const data = await boardRoute.loader(
      routeArgs(get(`/o/${ada.org.slug}`, `${ada.cookie}; day=${DAY}`), { slug: ada.org.slug }),
    );

    expect(data.members).toEqual([]);
  });

  it("answers the members of every team org to a cross-org page, keyed by slug", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo Kim");
    const blr = await team("blrhikes", [ada.person, bo.person]);
    await team("solo", [ada.person]);

    const data = await meRoute.loader(routeArgs(get("/me", `${ada.cookie}; day=${DAY}`)));

    expect(Object.keys(data.members).sort()).toEqual(["blrhikes", "solo"]);
    expect(data.members[blr.slug]).toEqual([
      { id: ada.person.id, name: "Ada", initials: "A" },
      { id: bo.person.id, name: "Bo Kim", initials: "BK" },
    ]);
  });

  it("names no personal org in the lists, because one member draws no picker", async () => {
    const ada = await member("ada@example.test", "Ada");

    const data = await planRoute.loader(routeArgs(get("/me/plan", `${ada.cookie}; day=${DAY}`)));

    expect(data.members).toEqual({});
  });
});
