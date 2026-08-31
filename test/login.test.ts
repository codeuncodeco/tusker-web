import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import { outbox } from "../app/mail.server";
import * as authRoute from "../app/routes/api.auth";
import * as inviteRoute from "../app/routes/invite";
import * as loginRoute from "../app/routes/login";
import * as accountRoute from "../app/routes/account";
import * as resetRoute from "../app/routes/reset-password";
import { SITE, caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const EMAIL = "ada@example.test";
const PASSWORD = "correct horse battery";

beforeEach(async () => {
  await wipe();
  outbox.length = 0;
});

/** The one way in: an invitation or a hand-run script makes the account. */
async function invite(name = "Ada") {
  const auth = createAuth(env, get("/"));
  return createAccount(auth, { email: EMAIL, name, password: PASSWORD });
}

async function signInWithPassword(password = PASSWORD) {
  return (await loginRoute.action(
    routeArgs(post("/login", { intent: "password", email: EMAIL, password })),
  )) as Response;
}

describe("a new account", () => {
  it("gets a personal org and a membership", async () => {
    const user = await invite();

    const org = await db
      .prepare("SELECT id, slug, name, kind FROM orgs WHERE kind = 'personal'")
      .first<{ id: string; slug: string; name: string; kind: string }>();
    expect(org).toMatchObject({ slug: "ada", name: "Ada", kind: "personal" });

    const membership = await db
      .prepare("SELECT org_id, user_id, role FROM memberships")
      .first<{ org_id: string; user_id: string; role: string }>();
    expect(membership).toEqual({ org_id: org!.id, user_id: user.id, role: "owner" });
  });

  it("takes a second slug when the first one is gone", async () => {
    await db
      .prepare("INSERT INTO orgs (id, slug, name, kind) VALUES ('other', 'ada', 'Ada', 'team')")
      .run();

    await invite();

    const org = await db
      .prepare("SELECT slug FROM orgs WHERE kind = 'personal'")
      .first<{ slug: string }>();
    expect(org?.slug).toBe("ada-2");
  });
});

describe("sign in", () => {
  it("takes a password", async () => {
    await invite();

    const response = await signInWithPassword();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/account");
    expect(cookieFrom(response)).toContain("better-auth");
  });

  it("refuses a wrong password", async () => {
    await invite();

    const said = await loginRoute.action(
      routeArgs(post("/login", { intent: "password", email: EMAIL, password: "wrong" })),
    );

    expect(said).toMatchObject({ error: expect.stringContaining("do not match") });
    expect(outbox).toHaveLength(0);
  });

  it("sends the link and the code in one message", async () => {
    await invite();

    await loginRoute.action(routeArgs(post("/login", { intent: "link", email: EMAIL })));

    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(EMAIL);
    expect(outbox[0].text).toMatch(/\/api\/auth\/magic-link\/verify\?token=/);
    expect(outbox[0].text).toMatch(/code: \d{6}/);
  });

  it("takes the code from that message", async () => {
    await invite();
    await loginRoute.action(routeArgs(post("/login", { intent: "link", email: EMAIL })));
    const otp = outbox[0].text.match(/code: (\d{6})/)![1];

    const response = (await loginRoute.action(
      routeArgs(post("/login", { intent: "code", email: EMAIL, otp })),
    )) as Response;

    expect(response.status).toBe(302);
    expect(cookieFrom(response)).toContain("better-auth");
  });

  it("takes the link from that message", async () => {
    await invite();
    await loginRoute.action(routeArgs(post("/login", { intent: "link", email: EMAIL })));
    const url = outbox[0].text.match(/(https:\/\/\S+)/)![1];

    const response = await caught(authRoute.loader(routeArgs(get(url.slice(SITE.length)))));

    expect(response.status).toBe(302);
    expect(cookieFrom(response)).toContain("better-auth");
  });

  it("refuses an email no account holds, and says nothing either way", async () => {
    const said = await loginRoute.action(
      routeArgs(post("/login", { intent: "link", email: "nobody@example.test" })),
    );

    expect(said).toMatchObject({ sent: expect.stringContaining("Check your mail") });
    const { results } = await db.prepare('SELECT id FROM "user"').all();
    expect(results).toEqual([]);
  });
});

describe("password reset", () => {
  it("goes through the mail and sets a new password", async () => {
    await invite();

    await loginRoute.action(routeArgs(post("/login", { intent: "forgot", email: EMAIL })));
    expect(outbox).toHaveLength(1);
    const token = outbox[0].text.match(/reset-password\/([^?\s]+)/)![1];

    const done = await caught(
      resetRoute.action(routeArgs(post("/reset-password", { token, password: "a new long one" }))),
    );
    expect(done.headers.get("location")).toBe("/login");

    const response = await signInWithPassword("a new long one");
    expect(response.status).toBe(302);
  });
});

describe("/account", () => {
  it("sends a signed-out request to sign-in", async () => {
    const response = await caught(accountRoute.loader(routeArgs(get("/account"))));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?next=%2Faccount");
  });

  it("shows the signed-in person and their orgs", async () => {
    await invite();
    const cookie = cookieFrom(await signInWithPassword());

    const data = await accountRoute.loader(routeArgs(get("/account", cookie)));

    expect(data.person).toMatchObject({ name: "Ada", email: EMAIL });
    expect(data.orgs).toEqual([expect.objectContaining({ slug: "ada", kind: "personal" })]);
  });
});

describe("the invite endpoint", () => {
  const body = { email: "bo@example.test", name: "Bo", password: "another long one" };

  function invitation(headers: Record<string, string> = {}) {
    return new Request(`${SITE}/api/invite`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  it("refuses a request that carries no token", async () => {
    const response = await caught(inviteRoute.action(routeArgs(invitation())));

    expect(response.status).toBe(401);
    const { results } = await db.prepare('SELECT id FROM "user"').all();
    expect(results).toEqual([]);
  });

  it("refuses a password that is too short", async () => {
    const short = new Request(`${SITE}/api/invite`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.INVITE_TOKEN}`,
      },
      body: JSON.stringify({ email: "bo@example.test", password: "short" }),
    });

    const response = await caught(inviteRoute.action(routeArgs(short)));

    expect(response.status).toBe(400);
  });

  it("makes an account, and that account gets its personal org", async () => {
    const response = (await inviteRoute.action(
      routeArgs(invitation({ authorization: `Bearer ${env.INVITE_TOKEN}` })),
    )) as Response;

    expect(response.status).toBe(201);
    const org = await db
      .prepare("SELECT slug, kind FROM orgs")
      .first<{ slug: string; kind: string }>();
    expect(org).toEqual({ slug: "bo", kind: "personal" });
  });
});
