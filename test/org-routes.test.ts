import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import * as boardRoute from "../app/routes/board";
import * as loginRoute from "../app/routes/login";
import * as membersRoute from "../app/routes/members";
import * as newOrgRoute from "../app/routes/orgs.new";
import * as settingsRoute from "../app/routes/settings";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

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
  return { person, cookie: cookieFrom(response) };
}

/** A post to a route action, signed by the cookie. */
async function send(
  route: { action: (args: never) => unknown },
  path: string,
  cookie: string,
  fields: Record<string, string>,
  params: Record<string, string> = {},
): Promise<unknown> {
  const request = post(path, fields);
  request.headers.set("cookie", cookie);
  return route.action(routeArgs(request, params));
}

describe("making an org", () => {
  it("sends a signed-out request to sign-in", async () => {
    const response = await caught(newOrgRoute.loader(routeArgs(get("/orgs/new"))));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?next=%2Forgs%2Fnew");
  });

  it("makes the org, owns it, and lands on its board", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = (await send(newOrgRoute, "/orgs/new", ada.cookie, {
      name: "codeuncode",
      slug: "codeuncode",
    })) as Response;

    expect(response.headers.get("location")).toBe("/o/codeuncode/board");
    const row = await db
      .prepare(
        "SELECT o.kind, m.role FROM orgs o JOIN memberships m ON m.org_id = o.id WHERE o.slug = 'codeuncode'",
      )
      .first<{ kind: string; role: string }>();
    expect(row).toEqual({ kind: "team", role: "owner" });
  });

  it("takes the slug from the name when the field is empty", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = (await send(newOrgRoute, "/orgs/new", ada.cookie, {
      name: "Code Uncode",
      slug: "",
    })) as Response;

    expect(response.headers.get("location")).toBe("/o/code-uncode/board");
  });

  it("refuses a slug another org holds, and says which one", async () => {
    const ada = await member("ada@example.test", "Ada");
    await send(newOrgRoute, "/orgs/new", ada.cookie, { name: "codeuncode", slug: "codeuncode" });

    const again = await send(newOrgRoute, "/orgs/new", ada.cookie, { name: "Other", slug: "codeuncode" });

    expect(again).toEqual({ error: "Another org already holds /codeuncode." });
  });

  it("refuses an org with no name", async () => {
    const ada = await member("ada@example.test", "Ada");

    const answer = await send(newOrgRoute, "/orgs/new", ada.cookie, { name: "  ", slug: "" });

    expect(answer).toEqual({ error: "An org needs a name." });
    const { results } = await db.prepare("SELECT id FROM orgs WHERE kind = 'team'").all();
    expect(results).toEqual([]);
  });
});

describe("the members page", () => {
  /** Ada, her team org, and Bo, who is not in it. */
  async function team() {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    await send(newOrgRoute, "/orgs/new", ada.cookie, { name: "codeuncode", slug: "codeuncode" });
    return { ada, bo };
  }

  /** The members loader for one org slug. */
  function members(slug: string, cookie: string) {
    return membersRoute.loader(routeArgs(get(`/o/${slug}/members`, cookie), { slug }));
  }

  it("answers 404 to a person the org does not hold", async () => {
    const { bo } = await team();

    const response = await caught(members("codeuncode", bo.cookie));

    expect(response.status).toBe(404);
  });

  it("does not let a person outside the org add anybody to it", async () => {
    const { bo } = await team();

    const response = await caught(
      send(membersRoute, "/o/codeuncode/members", bo.cookie, { email: "bo@example.test" }, { slug: "codeuncode" }),
    );

    expect(response.status).toBe(404);
    const { results } = await db.prepare("SELECT user_id FROM memberships WHERE org_id IN (SELECT id FROM orgs WHERE slug = 'codeuncode')").all();
    expect(results).toHaveLength(1);
  });

  it("adds an account, and then that person reads the org", async () => {
    const { ada, bo } = await team();

    const answer = await send(
      membersRoute,
      "/o/codeuncode/members",
      ada.cookie,
      { email: "bo@example.test" },
      { slug: "codeuncode" },
    );

    expect(answer).toEqual({ ok: "bo@example.test is a member now." });
    const seen = await members("codeuncode", bo.cookie);
    expect(seen.org.slug).toBe("codeuncode");
    expect(seen.members.map((one) => one.email).sort()).toEqual(["ada@example.test", "bo@example.test"]);
  });

  it("refuses an email no account holds", async () => {
    const { ada } = await team();

    const answer = await send(
      membersRoute,
      "/o/codeuncode/members",
      ada.cookie,
      { email: "nobody@example.test" },
      { slug: "codeuncode" },
    );

    expect(answer).toEqual({
      error: "No account holds nobody@example.test. Invite them first, then add them here.",
    });
  });
});

describe("changing the slug", () => {
  /** Ada, her org at /codeuncode, and Bo, who is not in it. */
  async function team() {
    const ada = await member("ada@example.test", "Ada");
    const bo = await member("bo@example.test", "Bo");
    await send(newOrgRoute, "/orgs/new", ada.cookie, { name: "codeuncode", slug: "codeuncode" });
    return { ada, bo };
  }

  /** A post to the settings action for one slug. */
  function rename(slug: string, cookie: string, next: string) {
    return send(settingsRoute, `/o/${slug}/settings`, cookie, { slug: next }, { slug });
  }

  it("moves every page of the org to the new slug", async () => {
    const { ada } = await team();

    const response = (await rename("codeuncode", ada.cookie, "Code Uncode")) as Response;

    expect(response.headers.get("location")).toBe("/o/code-uncode/settings");
    const board = await boardRoute.loader(
      routeArgs(get("/o/code-uncode/board", ada.cookie), { slug: "code-uncode" }),
    );
    expect(board.org.slug).toBe("code-uncode");
    expect(await caught(boardRoute.loader(routeArgs(get("/o/codeuncode/board", ada.cookie), { slug: "codeuncode" })))).toMatchObject({
      status: 404,
    });
  });

  it("keeps the tasks the org already holds", async () => {
    const { ada } = await team();
    const add = post("/o/codeuncode/board", { intent: "create", status: "todo", title: "Stays" });
    add.headers.set("cookie", ada.cookie);
    await boardRoute.action(routeArgs(add, { slug: "codeuncode" }));

    await rename("codeuncode", ada.cookie, "code-uncode");

    const board = await boardRoute.loader(
      routeArgs(get("/o/code-uncode/board", ada.cookie), { slug: "code-uncode" }),
    );
    expect(board.columns.find((one) => one.status === "todo")!.tasks.map((one) => one.title)).toEqual(["Stays"]);
  });

  it("refuses a slug another org holds", async () => {
    const { ada, bo } = await team();
    await send(newOrgRoute, "/orgs/new", bo.cookie, { name: "Taken", slug: "taken" });

    const answer = await rename("codeuncode", ada.cookie, "taken");

    expect(answer).toEqual({ error: "Another org already holds /taken." });
    const row = await db.prepare("SELECT slug FROM orgs WHERE name = 'codeuncode'").first<{ slug: string }>();
    expect(row?.slug).toBe("codeuncode");
  });

  it("refuses a slug that holds no letter or number", async () => {
    const { ada } = await team();

    const answer = await rename("codeuncode", ada.cookie, " -- ");

    expect(answer).toEqual({ error: "A slug needs a letter or a number." });
  });

  it("takes the slug the org already holds as no change", async () => {
    const { ada } = await team();

    const response = (await rename("codeuncode", ada.cookie, "codeuncode")) as Response;

    expect(response.headers.get("location")).toBe("/o/codeuncode/settings");
  });

  it("does not let a person outside the org change it", async () => {
    const { bo } = await team();

    const response = await caught(rename("codeuncode", bo.cookie, "theirs"));

    expect(response.status).toBe(404);
    const row = await db.prepare("SELECT slug FROM orgs WHERE name = 'codeuncode'").first<{ slug: string }>();
    expect(row?.slug).toBe("codeuncode");
  });
});
