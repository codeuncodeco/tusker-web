import { env } from "cloudflare:workers";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouterContextProvider, StaticRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { Header } from "../app/header";
import * as orgLayout from "../app/layouts/org";
import * as personLayout from "../app/layouts/person";
import { boardOf, namedOrg } from "../app/org-select";
import { addMember, type Org } from "../app/orgs.server";
import * as goRoute from "../app/routes/go";
import * as homeRoute from "../app/routes/home";
import * as meRoute from "../app/routes/me";
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

describe("the org a header names", () => {
  const ada = org("ada");
  const acme = org("acme");

  it("is the org the address names", () => {
    expect(namedOrg([ada, acme], "acme")).toEqual(acme);
  });

  it("is none on a person page for a person in several orgs", () => {
    expect(namedOrg([ada, acme], null)).toBe(null);
  });

  it("is the one org of a person in one, on every page", () => {
    expect(namedOrg([ada], null)).toEqual(ada);
  });

  it("is none for a person in no org", () => {
    expect(namedOrg([], null)).toBe(null);
  });
});

describe("the board of a scope", () => {
  it("is the unified board for All, and the org board for one org", () => {
    expect(boardOf(null)).toBe("/me");
    expect(boardOf("acme")).toBe("/o/acme/board");
  });
});

describe("the select with no script", () => {
  it("redirects a pick of one org to that org's board", async () => {
    const response = await caught(goRoute.loader(routeArgs(get("/go?to=acme"))));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/o/acme/board");
  });

  it("redirects a pick of All to the unified board", async () => {
    const response = await caught(goRoute.loader(routeArgs(get("/go?to="))));

    expect(response.headers.get("location")).toBe("/me");
  });

  it("reads anything that is not a slug as All, so it cannot leave the site", async () => {
    for (const to of ["//evil.test", "../account", "a/b"]) {
      const response = await caught(
        goRoute.loader(routeArgs(get(`/go?to=${encodeURIComponent(to)}`))),
      );
      expect(response.headers.get("location")).toBe("/me");
    }
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

  it("names the org and lists every org", async () => {
    const ada = await member("ada@example.test", "Ada");
    const acme = await team(ada.cookie, "acme");

    const answer = await orgLayout.loader(
      routeArgs(get(`/o/${acme}/board`, ada.cookie), { slug: acme }),
    );

    expect(answer.org.slug).toBe(acme);
    expect(answer.orgs.map((one) => one.slug)).toEqual([ada.org.slug, acme]);
  });
});

describe("the person layout", () => {
  it("sends a signed-out request to sign-in", async () => {
    const response = await caught(personLayout.loader(routeArgs(get("/me"))));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?next=%2Fme");
  });

  it("names no org for a person in several, whatever cookie they carry", async () => {
    const ada = await member("ada@example.test", "Ada");
    const acme = await team(ada.cookie, "acme");

    // The old current-org cookie, left in a browser, names nothing now.
    const answer = await personLayout.loader(
      routeArgs(get("/me/week", `${ada.cookie}; org=${acme}`)),
    );

    expect(answer.org).toBe(null);
    expect(answer.orgs.map((one) => one.slug)).toEqual([ada.org.slug, acme]);
  });

  it("names the one org of a person in one", async () => {
    const ada = await member("ada@example.test", "Ada");

    const answer = await personLayout.loader(routeArgs(get("/me/week", ada.cookie)));

    expect(answer.org?.slug).toBe(ada.org.slug);
  });

  it("goes by the day the person joined an org, not the day it was made", async () => {
    // Bo's org is older than Ada's, but Ada joins it only after she makes hers.
    const bo = await member("bo@example.test", "Bo");
    const ada = await member("ada@example.test", "Ada");
    await addMember(db, bo.org.id, "ada@example.test");

    const answer = await personLayout.loader(routeArgs(get("/me/week", ada.cookie)));

    expect(answer.orgs.map((one) => one.slug)).toEqual([ada.org.slug, bo.org.slug]);
  });
});

describe("a person in one org", () => {
  it("lands on their org board from the unified board", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = await caught(meRoute.loader(routeArgs(get("/me", ada.cookie))));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`/o/${ada.org.slug}/board`);
  });

  it("lands on their org board from the landing page", async () => {
    const ada = await member("ada@example.test", "Ada");

    const response = await caught(homeRoute.loader(routeArgs(get("/", ada.cookie))));

    expect(response.headers.get("location")).toBe(`/o/${ada.org.slug}/board`);
  });

  it("keeps the unified board once they join a second org", async () => {
    const ada = await member("ada@example.test", "Ada");
    await team(ada.cookie, "acme");

    const board = await meRoute.loader(routeArgs(get("/me", ada.cookie)));
    const landing = await caught(homeRoute.loader(routeArgs(get("/", ada.cookie))));

    expect(board).not.toBeInstanceOf(Response);
    expect(landing.headers.get("location")).toBe("/me");
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
function headerAt(pathname: string, orgs: Org[], named: Org | null): string {
  return renderToStaticMarkup(
    createElement(
      StaticRouter,
      { location: pathname },
      createElement(Header, { orgs, org: named }),
    ),
  );
}

/** The option the select reads, out of the header's markup. */
function picked(markup: string): string | null {
  return markup.match(/<option value="([^"]*)" selected=""/)?.[1] ?? null;
}

describe("the header", () => {
  const ada = org("ada");
  const acme = org("acme");

  it("draws one row and no wordmark", () => {
    const markup = headerAt("/me/week", [ada, acme], null);

    expect(markup.match(/<header/g)).toHaveLength(1);
    expect(markup).not.toContain(">Tusker<");
  });

  it("reads All on every person page", () => {
    for (const path of ["/me", "/me/week", "/me/plan/2026-10-09", "/me/focus", "/account"]) {
      expect(picked(headerAt(path, [ada, acme], null))).toBe("");
    }
  });

  it("reads the org of every org page", () => {
    for (const path of ["/o/acme/board", "/o/acme/decisions", "/o/acme/t/one", "/o/acme/settings"]) {
      expect(picked(headerAt(path, [ada, acme], acme))).toBe("acme");
    }
  });

  it("lists All, then every org, in a form that works with no script", () => {
    const markup = headerAt("/me", [ada, acme], null);

    const form = markup.match(/<form[^>]*>/)?.[0] ?? "";
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/go"');
    expect(markup).toMatch(/<select name="to"/);
    expect(markup.replace(/ selected=""/g, "")).toMatch(/<option value="">All<\/option><option value="ada">ada<\/option><option value="acme">acme<\/option>/);
  });

  it("holds no org page while the select reads All", () => {
    const markup = headerAt("/me/week", [ada, acme], null);

    expect(markup).toMatch(/<a[^>]*href="\/me"[^>]*>Board</);
    expect(markup).toMatch(/<a[^>]*href="\/me\/plan"/);
    expect(markup).not.toContain("/o/");
  });

  it("holds the pages of the org the select names, and scopes Board to it", () => {
    const markup = headerAt("/me/week", [ada, acme], null);
    const inOrg = headerAt("/o/acme/decisions", [ada, acme], acme);

    expect(markup).not.toContain("Decisions");
    for (const page of ["archive", "fields", "members", "settings"]) {
      expect(inOrg).toMatch(new RegExp(`<a[^>]*href="/o/acme/${page}"`));
    }
    expect(inOrg).toMatch(/<a[^>]*href="\/o\/acme\/board"[^>]*>Board</);
    expect(inOrg).not.toMatch(/href="\/me"/);
  });

  it("names the page a person stands on, and offers it no link", () => {
    const markup = headerAt("/o/acme/decisions", [ada, acme], acme);

    expect(markup).toMatch(/aria-current="page"[^>]*>Decisions</);
    expect(markup).not.toMatch(/<a[^>]*href="\/o\/acme\/decisions"/);
    // ⋯ carries the name of the page, so the bar says where you are.
    expect(markup).toMatch(/<summary[^>]*>[\s\S]*?Decisions[\s\S]*?<\/summary>/);
  });

  it("puts Account and New org in the person menu", () => {
    const markup = headerAt("/me", [ada, acme], null);

    expect(markup).toMatch(/<a[^>]*href="\/account"/);
    expect(markup).toMatch(/<a[^>]*href="\/orgs\/new"/);
  });

  it("draws no select for a person in one org, and always holds their org's pages", () => {
    const markup = headerAt("/me/week", [ada], ada);

    expect(markup).not.toContain("<select");
    expect(markup).toMatch(/<a[^>]*href="\/o\/ada\/decisions"/);
    expect(markup).toMatch(/<a[^>]*href="\/o\/ada\/board"[^>]*>Board</);
  });

  it("makes the select the board's heading, and no other page's", () => {
    const board = headerAt("/o/acme/board", [ada, acme], acme);
    const unified = headerAt("/me", [ada, acme], null);
    const week = headerAt("/me/week", [ada, acme], null);

    expect(board).toMatch(/<h1[^>]*>[\s\S]*<select[^>]*aria-label="Board"[\s\S]*<\/h1>/);
    expect(unified).toMatch(/<h1[^>]*>[\s\S]*<select[\s\S]*<\/h1>/);
    expect(week).not.toContain("<h1");
  });

  it("heads the board of a person in one org with the org's name", () => {
    const markup = headerAt("/o/ada/board", [ada], ada);

    expect(markup).toMatch(/<h1[^>]*>[\s\S]*ada[\s\S]*<\/h1>/);
  });
});
