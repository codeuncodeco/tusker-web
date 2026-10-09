import { env } from "cloudflare:workers";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouterContextProvider, StaticRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { currentOrg, rememberOrg, slugOfCurrentOrg } from "../app/current-org";
import { Header } from "../app/header";
import * as orgLayout from "../app/layouts/org";
import * as personLayout from "../app/layouts/person";
import { addMember, type Org } from "../app/orgs.server";
import * as newOrgRoute from "../app/routes/orgs.new";
import { orgScope, requireScope } from "../app/scope.server";
import { member } from "./accounts";
import { caught, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;

beforeEach(wipe);

/** An org row as the header reads one. Only the slug matters here. */
function org(slug: string): Org {
  return { id: slug, slug, name: slug, created_at: "2026-09-01", color: "blue", members: 1 };
}

describe("the current org", () => {
  // In the order the person joined them, as `listOrgsForPerson` answers.
  const first = org("ada");
  const acme = org("acme");

  it("is the org the cookie names", () => {
    expect(currentOrg([first, acme], "acme")).toEqual(acme);
  });

  it("is the first joined while no cookie names one", () => {
    expect(currentOrg([first, acme], null)).toEqual(first);
  });

  it("is the first joined again when the cookie names an org the person left", () => {
    expect(currentOrg([first, acme], "gone")).toEqual(first);
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
      .bind(ada.org.slug)
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
    expect(answer.data.orgs.map((one) => one.slug)).toEqual([ada.org.slug, acme]);
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

  it("names the org the person joined first before any visit", async () => {
    const ada = await member("ada@example.test", "Ada");
    await team(ada.cookie, "acme");

    const answer = await personLayout.loader(routeArgs(get("/me", ada.cookie)));

    expect(answer.org?.slug).toBe(ada.org.slug);
    expect(answer.orgs.map((one) => one.slug)).toEqual([ada.org.slug, "acme"]);
  });

  it("goes by the day the person joined an org, not the day it was made", async () => {
    // Bo's org is older than Ada's, but Ada joins it only after she makes hers.
    const bo = await member("bo@example.test", "Bo");
    const ada = await member("ada@example.test", "Ada");
    await addMember(db, bo.org.id, "ada@example.test");

    const answer = await personLayout.loader(routeArgs(get("/me", ada.cookie)));

    expect(answer.orgs.map((one) => one.slug)).toEqual([ada.org.slug, bo.org.slug]);
    expect(answer.org?.slug).toBe(ada.org.slug);
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
      get(`/o/${ada.org.slug}/board`, ada.cookie),
      env,
      ada.org.slug,
      context,
    );

    expect(read.org.slug).toBe(ada.org.slug);
  });
});

/** The header's markup for one address, as one string of HTML. */
function headerAt(pathname: string, org: Org | null = null): string {
  return renderToStaticMarkup(
    createElement(
      StaticRouter,
      { location: pathname },
      createElement(Header, { orgs: org ? [org] : [], org }),
    ),
  );
}

describe("the header", () => {
  // Colour marks the page a person stands on, so this keeps the signal a
  // screen reader reads honest.
  it("marks the page a person stands on, and offers it no link", () => {
    const markup = headerAt("/me/week");

    expect(markup).toContain('<span aria-current="page"');
    expect(markup).toMatch(/aria-current="page"[^>]*>Week</);
    expect(markup).not.toMatch(/<a[^>]*href="\/me\/week"/);
    // Every other page is still a link, so only one page loses one.
    expect(markup).toMatch(/<a[^>]*href="\/me"/);
  });

  it("marks a page of the current org the same way", () => {
    const markup = headerAt("/o/acme/decisions", org("acme"));

    expect(markup).toMatch(/aria-current="page"[^>]*>Decisions</);
    expect(markup).not.toMatch(/<a[^>]*href="\/o\/acme\/decisions"/);
    expect(markup).toMatch(/<a[^>]*href="\/o\/acme\/board"/);
  });
});
