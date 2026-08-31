import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { INVITE_TTL, createAuth } from "../app/auth.server";
import { outbox } from "../app/mail.server";
import * as authRoute from "../app/routes/api.auth";
import * as loginRoute from "../app/routes/login";
import * as membersRoute from "../app/routes/members";
import * as newOrgRoute from "../app/routes/orgs.new";
import { SITE, caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";

beforeEach(async () => {
  await wipe();
  outbox.length = 0;
});

/** An account, its personal org and a cookie that signs its requests. */
async function member(email: string, name: string) {
  const auth = createAuth(env, get("/"));
  const person = await createAccount(auth, { email, name, password: PASSWORD });
  const response = (await loginRoute.action(
    routeArgs(post("/login", { intent: "password", email, password: PASSWORD })),
  )) as Response;
  return { person, cookie: cookieFrom(response) };
}

/** Ada and her team org, with the outbox emptied of the sign-in mails. */
async function team() {
  const ada = await member("ada@example.test", "Ada");
  const request = post("/orgs/new", { name: "Code Uncode", slug: "codeuncode" });
  request.headers.set("cookie", ada.cookie);
  await newOrgRoute.action(routeArgs(request));
  outbox.length = 0;
  return ada;
}

/** The members action, signed by one member's cookie. */
async function invite(cookie: string, email: string, slug = "codeuncode") {
  const request = post(`/o/${slug}/members`, { email });
  request.headers.set("cookie", cookie);
  return membersRoute.action(routeArgs(request, { slug })) as Promise<{ ok?: string; error?: string }>;
}

/** How many people the org holds. */
async function memberCount(slug = "codeuncode") {
  const row = await db
    .prepare(
      "SELECT count(*) AS n FROM memberships WHERE org_id = (SELECT id FROM orgs WHERE slug = ?)",
    )
    .bind(slug)
    .first<{ n: number }>();
  return row!.n;
}

describe("inviting from the members page", () => {
  it("makes the account, adds it, and mails a link that signs the person in", async () => {
    const ada = await team();

    const answer = await invite(ada.cookie, "bo@example.test");

    expect(answer.ok).toBe("bo@example.test is a member now. Tusker mailed them a link to sign in.");
    expect(await memberCount()).toBe(2);

    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe("bo@example.test");
    expect(outbox[0].subject).toBe("Ada added you to Code Uncode on Tusker");
    expect(outbox[0].text).toContain("Ada added you to Code Uncode on Tusker.");

    const url = outbox[0].text.match(/(https:\/\/\S+)/)![1];
    const response = await caught(authRoute.loader(routeArgs(get(url.slice(SITE.length)))));
    expect(response.status).toBe(302);
    expect(cookieFrom(response)).toContain("better-auth");
  });

  it("gives the invited account its own personal org", async () => {
    const ada = await team();

    await invite(ada.cookie, "bo@example.test");

    const org = await db
      .prepare("SELECT slug, kind FROM orgs WHERE kind = 'personal' AND slug = 'bo'")
      .first<{ slug: string; kind: string }>();
    expect(org).toEqual({ slug: "bo", kind: "personal" });
  });

  it("gives the invitation link the invitation TTL, not the sign-in one", async () => {
    const ada = await team();
    const before = Date.now();

    await invite(ada.cookie, "bo@example.test");

    const token = outbox[0].text.match(/token=([A-Za-z]+)/)![1];
    const row = await db
      .prepare('SELECT "expiresAt" FROM verification WHERE identifier = ?')
      .bind(token)
      .first<{ expiresAt: string | number }>();
    const life = new Date(row!.expiresAt).getTime() - before;
    expect(life).toBeGreaterThan((INVITE_TTL - 60) * 1000);
    expect(life).toBeLessThanOrEqual(INVITE_TTL * 1000 + 60_000);
  });

  it("adds an account that already exists, and mails it no sign-in link", async () => {
    const ada = await team();
    await member("bo@example.test", "Bo");
    outbox.length = 0;

    const answer = await invite(ada.cookie, "bo@example.test");

    expect(answer.ok).toBe("bo@example.test is a member now. Tusker mailed them.");
    expect(await memberCount()).toBe(2);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].text).toContain("Ada added you to Code Uncode on Tusker.");
    expect(outbox[0].text).toContain(`${SITE}/o/codeuncode/board`);
    expect(outbox[0].text).not.toContain("magic-link/verify");
  });

  it("changes nothing and mails nobody when the email is a member already", async () => {
    const ada = await team();
    await invite(ada.cookie, "bo@example.test");
    outbox.length = 0;

    const answer = await invite(ada.cookie, "bo@example.test");

    expect(answer.error).toBe("bo@example.test is already a member.");
    expect(await memberCount()).toBe(2);
    expect(outbox).toEqual([]);
  });

  it("takes an email in any case as the account it already holds", async () => {
    const ada = await team();
    await member("bo@example.test", "Bo");
    outbox.length = 0;

    const answer = await invite(ada.cookie, "BO@Example.test");

    expect(answer.ok).toBe("bo@example.test is a member now. Tusker mailed them.");
    expect(await memberCount()).toBe(2);
    const { results } = await db.prepare('SELECT id FROM "user"').all();
    expect(results).toHaveLength(2);
  });

  it("refuses a second member in a personal org", async () => {
    const ada = await member("ada@example.test", "Ada");
    outbox.length = 0;

    const answer = await invite(ada.cookie, "bo@example.test", "ada");

    expect(answer.error).toContain("A personal org holds one person");
    expect(await memberCount("ada")).toBe(1);
    expect(outbox).toEqual([]);
    const { results } = await db.prepare('SELECT id FROM "user"').all();
    expect(results).toHaveLength(1);
  });

  it("refuses an empty email", async () => {
    const ada = await team();

    const answer = await invite(ada.cookie, "   ");

    expect(answer.error).toBe("Name the email of the person to invite.");
    expect(outbox).toEqual([]);
  });
});
