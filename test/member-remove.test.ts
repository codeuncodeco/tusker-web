import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import * as boardRoute from "../app/routes/board";
import * as loginRoute from "../app/routes/login";
import * as membersRoute from "../app/routes/members";
import * as newOrgRoute from "../app/routes/orgs.new";
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
  const org = await db
    .prepare("SELECT slug FROM orgs JOIN memberships ON org_id = id WHERE user_id = ?")
    .bind(person.id)
    .first<{ slug: string }>();
  return { person, personal: org!.slug, cookie: cookieFrom(response) };
}

/** A post to the members page of one org, signed by the cookie. */
function onMembers(cookie: string, slug: string, fields: Record<string, string>) {
  const request = post(`/o/${slug}/members`, fields);
  request.headers.set("cookie", cookie);
  return membersRoute.action(routeArgs(request, { slug }));
}

/** The members loader for one org slug. */
function membersPage(slug: string, cookie: string) {
  return membersRoute.loader(routeArgs(get(`/o/${slug}/members`, cookie), { slug }));
}

/** Ada, who owns /codeuncode, Bo, a member of it, and Cy, who is outside. */
async function team() {
  const ada = await member("ada@example.test", "Ada");
  const bo = await member("bo@example.test", "Bo");
  const cy = await member("cy@example.test", "Cy");
  await newOrgRoute.action(
    routeArgs(withCookie(post("/orgs/new", { name: "codeuncode", slug: "codeuncode" }), ada.cookie)),
  );
  await onMembers(ada.cookie, "codeuncode", { email: "bo@example.test" });
  return { ada, bo, cy };
}

function withCookie(request: Request, cookie: string): Request {
  request.headers.set("cookie", cookie);
  return request;
}

/** A live task of /codeuncode, held by the named members. */
async function taskFor(cookie: string, title: string, assignees: string[]) {
  const request = post("/o/codeuncode", { intent: "create", status: "todo", title, assignee: assignees });
  request.headers.set("cookie", cookie);
  await boardRoute.action(routeArgs(request, { slug: "codeuncode" }));
}

/** The user ids the org still holds a membership for. */
async function membershipIds(): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT user_id FROM memberships WHERE org_id IN (SELECT id FROM orgs WHERE slug = 'codeuncode') ORDER BY user_id",
    )
    .all<{ user_id: string }>();
  return results.map((row) => row.user_id);
}

describe("removing a member", () => {
  it("says how many live tasks lose a holder, and removes nobody yet", async () => {
    const { ada, bo } = await team();
    await taskFor(ada.cookie, "Held", [bo.person.id]);
    await taskFor(ada.cookie, "Also held", [bo.person.id]);
    await taskFor(ada.cookie, "Nobody's", []);

    const answer = await onMembers(ada.cookie, "codeuncode", {
      intent: "remove",
      member: bo.person.id,
    });

    expect(answer).toEqual({ confirm: { id: bo.person.id, name: "Bo", you: false, tasks: 2 } });
    expect(await membershipIds()).toContain(bo.person.id);
  });

  it("counts no task that is finished or archived", async () => {
    const { ada, bo } = await team();
    await taskFor(ada.cookie, "Held", [bo.person.id]);
    await db
      .prepare("UPDATE tasks SET status = 'done' WHERE title = 'Held'")
      .run();

    const answer = await onMembers(ada.cookie, "codeuncode", {
      intent: "remove",
      member: bo.person.id,
    });

    expect(answer).toMatchObject({ confirm: { tasks: 0 } });
  });

  it("removes the member once it is confirmed, and that person loses the org", async () => {
    const { ada, bo } = await team();

    const answer = await onMembers(ada.cookie, "codeuncode", {
      intent: "remove",
      member: bo.person.id,
      confirmed: "1",
    });

    expect(answer).toEqual({ ok: "Bo is out of codeuncode." });
    expect(await membershipIds()).toEqual([ada.person.id]);
    expect((await caught(membersPage("codeuncode", bo.cookie))).status).toBe(404);
  });

  it("keeps the tasks the removed person held, and drops the assignments", async () => {
    const { ada, bo } = await team();
    await taskFor(ada.cookie, "Held", [bo.person.id]);

    await onMembers(ada.cookie, "codeuncode", {
      intent: "remove",
      member: bo.person.id,
      confirmed: "1",
    });

    const task = await db.prepare("SELECT title FROM tasks WHERE title = 'Held'").first<{ title: string }>();
    expect(task?.title).toBe("Held");
    const { results } = await db.prepare("SELECT user_id FROM task_assignees").all();
    expect(results).toEqual([]);
  });

  it("refuses to remove the last owner, and says why", async () => {
    const { ada } = await team();

    const answer = await onMembers(ada.cookie, "codeuncode", {
      intent: "remove",
      member: ada.person.id,
      confirmed: "1",
    });

    expect(answer).toEqual({
      error: "codeuncode must keep one owner. Make somebody else an owner first.",
    });
    expect(await membershipIds()).toContain(ada.person.id);
  });

  it("lets a person leave, and lands them on a page they still reach", async () => {
    const { bo } = await team();

    const response = (await onMembers(bo.cookie, "codeuncode", {
      intent: "remove",
      member: bo.person.id,
      confirmed: "1",
    })) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/me");
    expect(await membershipIds()).not.toContain(bo.person.id);
  });

  it("names the person as themselves before they leave", async () => {
    const { bo } = await team();

    const answer = await onMembers(bo.cookie, "codeuncode", {
      intent: "remove",
      member: bo.person.id,
    });

    expect(answer).toMatchObject({ confirm: { you: true } });
  });

  it("keeps a person outside the org out", async () => {
    const { bo, cy } = await team();

    const response = await caught(
      onMembers(cy.cookie, "codeuncode", { intent: "remove", member: bo.person.id, confirmed: "1" }),
    );

    expect(response.status).toBe(404);
    expect(await membershipIds()).toContain(bo.person.id);
  });

  it("answers an id the org holds no membership for", async () => {
    const { ada, cy } = await team();

    const answer = await onMembers(ada.cookie, "codeuncode", {
      intent: "remove",
      member: cy.person.id,
      confirmed: "1",
    });

    expect(answer).toEqual({ error: "codeuncode has no such member." });
  });
});

describe("changing a role", () => {
  it("makes a member an owner, and the page reads it back", async () => {
    const { ada, bo } = await team();

    const answer = await onMembers(ada.cookie, "codeuncode", {
      intent: "role",
      member: bo.person.id,
      role: "owner",
    });

    expect(answer).toEqual({ ok: "Bo is an owner of codeuncode now." });
    const page = await membersPage("codeuncode", ada.cookie);
    expect(page.members.find((one) => one.id === bo.person.id)?.role).toBe("owner");
  });

  it("refuses to demote the last owner, and says why", async () => {
    const { ada } = await team();

    const answer = await onMembers(ada.cookie, "codeuncode", {
      intent: "role",
      member: ada.person.id,
      role: "member",
    });

    expect(answer).toEqual({
      error: "codeuncode must keep one owner. Make somebody else an owner first.",
    });
    const page = await membersPage("codeuncode", ada.cookie);
    expect(page.members.find((one) => one.id === ada.person.id)?.role).toBe("owner");
  });

  it("demotes an owner once the org holds a second one", async () => {
    const { ada, bo } = await team();
    await onMembers(ada.cookie, "codeuncode", { intent: "role", member: bo.person.id, role: "owner" });

    const answer = await onMembers(ada.cookie, "codeuncode", {
      intent: "role",
      member: ada.person.id,
      role: "member",
    });

    expect(answer).toEqual({ ok: "Ada is a member of codeuncode now." });
  });

  it("refuses a role the column does not hold", async () => {
    const { ada, bo } = await team();

    const answer = await onMembers(ada.cookie, "codeuncode", {
      intent: "role",
      member: bo.person.id,
      role: "admin",
    });

    expect(answer).toEqual({ error: "A member is an owner or a member." });
  });

  it("keeps a person outside the org out", async () => {
    const { bo, cy } = await team();

    const response = await caught(
      onMembers(cy.cookie, "codeuncode", { intent: "role", member: bo.person.id, role: "owner" }),
    );

    expect(response.status).toBe(404);
  });
});

describe("a personal org", () => {
  it("draws neither control, and refuses both acts", async () => {
    const ada = await member("ada@example.test", "Ada");

    const page = await membersPage(ada.personal, ada.cookie);
    expect(page.org.kind).toBe("personal");

    const removed = await onMembers(ada.cookie, ada.personal, {
      intent: "remove",
      member: ada.person.id,
      confirmed: "1",
    });
    const roled = await onMembers(ada.cookie, ada.personal, {
      intent: "role",
      member: ada.person.id,
      role: "member",
    });

    expect(removed).toMatchObject({ error: expect.stringContaining("A personal org holds one person") });
    expect(roled).toMatchObject({ error: expect.stringContaining("A personal org holds one person") });
    const row = await db
      .prepare("SELECT role FROM memberships WHERE user_id = ?")
      .bind(ada.person.id)
      .first<{ role: string }>();
    expect(row?.role).toBe("owner");
  });
});
