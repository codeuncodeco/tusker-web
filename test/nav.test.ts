import { env } from "cloudflare:workers";
import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import { currentOrg, rememberOrg, slugOfCurrentOrg } from "../app/current-org";
import * as orgLayout from "../app/layouts/org";
import * as personLayout from "../app/layouts/person";
import type { Org } from "../app/orgs.server";
import * as loginRoute from "../app/routes/login";
import * as newOrgRoute from "../app/routes/orgs.new";
import { orgScope, requireScope } from "../app/scope.server";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;
const PASSWORD = "correct horse battery";

beforeEach(wipe);

/** An org row as the header reads one. Only the four columns matter here. */
function org(slug: string, kind: Org["kind"]): Org {
  return { id: slug, slug, name: slug, kind, created_at: "2026-09-01" };
}

describe("the current org", () => {
  const personal = org("ada", "personal");
  const acme = org("acme", "team");

  it("is the org the cookie names", () => {
    expect(currentOrg([personal, acme], "acme")).toEqual(acme);
  });

  it("is the personal org while no cookie names one", () => {
    expect(currentOrg([personal, acme], null)).toEqual(personal);
  });

  it("is the personal org again when the cookie names an org the person left", () => {
    expect(currentOrg([personal, acme], "gone")).toEqual(personal);
  });

  it("is the first org when the person holds no personal one", () => {
    expect(currentOrg([acme], null)).toEqual(acme);
  });

  it("is nothing when the person belongs to nothing", () => {
    expect(currentOrg([], "acme")).toBe(null);
  });

  it("reads its slug from the cookie the header wrote", () => {
    expect(slugOfCurrentOrg(get("/me", "org=acme"))).toBe("acme");
    expect(slugOfCurrentOrg(get("/me"))).toBe(null);
  });

  it("writes a cookie the whole app reads, and no script can", () => {
    const cookie = rememberOrg("acme");
    expect(cookie).toContain("org=acme");
    expect(cookie).toContain("path=/");
    expect(cookie.toLowerCase()).toContain("httponly");
  });
});

/** An account, its personal org and a cookie that signs its requests. */
async function member(email: string, name: string) {
  const auth = createAuth(env, get("/"));
  const person = await createAccount(auth, { email, name, password: PASSWORD });
  const response = (await loginRoute.action(
    routeArgs(post("/login", { intent: "password", email, password: PASSWORD })),
  )) as Response;
  const own = await db
    .prepare("SELECT slug FROM orgs JOIN memberships ON org_id = id WHERE user_id = ?")
    .bind(person.id)
    .first<{ slug: string }>();
  return { person, personal: own!.slug, cookie: cookieFrom(response) };
}

/** Makes a team org, as its owner, and answers its slug. */
async function team(cookie: string, name: string): Promise<string> {
  const request = post("/orgs/new", { name, slug: name });
  request.headers.set("cookie", cookie);
  await newOrgRoute.action(routeArgs(request));
  return name;
}

describe("the org layout", () => {
  it("sends a signed-out request to sign-in", async () => {
    const response = await caught(
      orgLayout.loader(routeArgs(get("/o/acme/board"), { slug: "acme" })),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?next=%2Fo%2Facme%2Fboard");
  });

  it("answers 404 for an org the person is no member of", async () => {
    const ada = await member("ada@example.test", "Ada");
    await member("bob@example.test", "Bob");
    const bobs = await db
      .prepare("SELECT slug FROM orgs WHERE slug <> ? ORDER BY created_at DESC")
      .bind(ada.personal)
      .first<{ slug: string }>();

    const response = await caught(
      orgLayout.loader(routeArgs(get(`/o/${bobs!.slug}/board`, ada.cookie), { slug: bobs!.slug })),
    );

    expect(response.status).toBe(404);
  });

  it("names the org, lists every org, and remembers the visit", async () => {
    const ada = await member("ada@example.test", "Ada");
    const acme = await team(ada.cookie, "acme");

    const answer = await orgLayout.loader(
      routeArgs(get(`/o/${acme}/board`, ada.cookie), { slug: acme }),
    );

    expect(answer.data.org.slug).toBe(acme);
    expect(answer.data.orgs.map((one) => one.slug)).toEqual([ada.personal, acme]);
    expect(answer.init?.headers).toBeDefined();
    expect(new Headers(answer.init!.headers).get("set-cookie")).toContain(`org=${acme}`);
  });
});

describe("the person layout", () => {
  it("sends a signed-out request to sign-in", async () => {
    const response = await caught(personLayout.loader(routeArgs(get("/me"))));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?next=%2Fme");
  });

  it("names the org the last visit remembered", async () => {
    const ada = await member("ada@example.test", "Ada");
    const acme = await team(ada.cookie, "acme");

    const answer = await personLayout.loader(
      routeArgs(get("/me", `${ada.cookie}; org=${acme}`)),
    );

    expect(answer.org?.slug).toBe(acme);
  });

  it("names the personal org before any visit", async () => {
    const ada = await member("ada@example.test", "Ada");
    await team(ada.cookie, "acme");

    const answer = await personLayout.loader(routeArgs(get("/me", ada.cookie)));

    expect(answer.org?.slug).toBe(ada.personal);
  });
});

describe("the scope of a page under the org layout", () => {
  it("is the one the layout proved, so one visit is one membership check", async () => {
    const ada = await member("ada@example.test", "Ada");
    const acme = await team(ada.cookie, "acme");

    const context = new RouterContextProvider();
    const proved = await requireScope(get(`/o/${acme}/board`, ada.cookie), env, acme);
    context.set(orgScope, proved);

    // The request carries no session cookie at all, so an answer here can only
    // come from the scope the layout left behind.
    const read = await requireScope(get(`/o/${acme}/board`), env, acme, context);

    expect(read).toBe(proved);
  });

  it("is proved again when the context holds another org", async () => {
    const ada = await member("ada@example.test", "Ada");
    const acme = await team(ada.cookie, "acme");

    const context = new RouterContextProvider();
    context.set(orgScope, await requireScope(get(`/o/${acme}/board`, ada.cookie), env, acme));

    const read = await requireScope(
      get(`/o/${ada.personal}/board`, ada.cookie),
      env,
      ada.personal,
      context,
    );

    expect(read.org.slug).toBe(ada.personal);
  });
});
