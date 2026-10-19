import { env } from "cloudflare:workers";
import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";

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
import { caught, get, headerAt, post, routeArgs, wipe } from "./routes";

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

    // The unified board stays, and `/` opens the first org's board. See
    // ADR-0037.
    expect(board).not.toBeInstanceOf(Response);
    expect(landing.headers.get("location")).toBe(`/o/${ada.org.slug}/board`);
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

/** The option the select reads, out of the header's markup. */
/** The dock's settings panel, as markup. */
function settings(markup: string): string {
  const at = markup.indexOf('aria-label="Settings"');
  return markup.slice(at, markup.indexOf("</details>", at));
}

/** The dock's View button, as its opening tag. */
function viewButton(markup: string): string {
  return markup.match(/<a[^>]*aria-label="(?:View|Back to)[^"]*"[^>]*>/)?.[0] ?? "";
}

describe("the header", () => {
  const ada = org("ada");
  const acme = org("acme");

  it("draws one row and no wordmark", () => {
    const markup = headerAt("/me/week", [ada, acme], null);

    expect(markup.match(/<header/g)).toHaveLength(1);
    expect(markup).not.toContain(">Tusker<");
  });

  it("names All orgs on every person page, and the org on every org page", () => {
    for (const path of ["/me", "/me/week", "/me/plan/2026-10-09", "/me/focus"]) {
      expect(headerAt(path, [ada, acme], null)).toContain(">All orgs<");
    }
    for (const path of ["/o/acme/board", "/o/acme/decisions", "/t/12", "/o/acme/settings"]) {
      const markup = headerAt(path, [ada, acme], acme);
      expect(markup.slice(0, markup.indexOf("</header>"))).toContain(">acme<");
    }
  });

  it("names the page beside the org", () => {
    expect(headerAt("/o/acme/board", [ada, acme], acme)).toMatch(/>acme<[\s\S]*>Board</);
    expect(headerAt("/o/acme/clients", [ada, acme], acme)).toMatch(/>Clients</);
    expect(headerAt("/me/plan", [ada, acme], null)).toMatch(/>Plan</);
    expect(headerAt("/t/12", [ada, acme], acme)).toMatch(/>Task</);
  });

  it("steps the colour scheme with one button, in a form that works with no script", () => {
    const markup = headerAt("/me/week?day=2026-10-13", [ada, acme], null);

    const form = markup.match(/<form[^>]*action="\/colour-scheme"[^>]*>[\s\S]*?<\/form>/)?.[0] ?? "";
    expect(form).toContain('method="post"');
    expect(form).toContain('<input type="hidden" name="next" value="/me/week?day=2026-10-13"/>');
    // With no loader data and nothing in flight, the pick reads System, and
    // one click sends Light: the button is the form's own submit.
    const button = form.match(/<button[^>]*>/)?.[0] ?? "";
    expect(button).toContain('name="scheme"');
    expect(button).toContain('value="light"');
    expect(button).toContain('aria-label="Colour scheme: System. Switch to Light."');
    expect(form).not.toContain("<select");
    // It sits in the header, at the right.
    expect(markup.indexOf('aria-label="Colour scheme')).toBeLessThan(markup.indexOf("</header>"));
  });

  it("makes the org and page the board's heading, and no other page's", () => {
    expect(headerAt("/o/acme/board", [ada, acme], acme)).toMatch(/<h1[^>]*>[\s\S]*acme[\s\S]*Board[\s\S]*<\/h1>/);
    expect(headerAt("/me", [ada, acme], null)).toMatch(/<h1[^>]*>[\s\S]*All orgs[\s\S]*<\/h1>/);
    expect(headerAt("/me/week", [ada, acme], null)).not.toContain("<h1");
    expect(headerAt("/o/ada/board", [ada], ada)).toMatch(/<h1[^>]*>[\s\S]*ada[\s\S]*<\/h1>/);
  });
});

describe("the dock", () => {
  const ada = org("ada");
  const acme = org("acme");

  it("steps the view with one click: Board, Week, Plan, Focus, and round", () => {
    expect(viewButton(headerAt("/o/acme/board", [ada, acme], acme))).toContain('href="/me/week"');
    expect(viewButton(headerAt("/me/week", [ada, acme], null))).toContain('href="/me/plan"');
    expect(viewButton(headerAt("/me/plan", [ada, acme], null))).toContain('href="/me/focus"');
    // From Focus the board is the first org's, where Tusker starts, until the
    // browser remembers another.
    expect(viewButton(headerAt("/me/focus", [ada, acme], null))).toContain('href="/o/ada/board"');
    expect(viewButton(headerAt("/o/acme/board", [ada, acme], acme))).toContain('aria-label="View: Board. Switch to Week."');
  });

  it("goes back to the board from a page that is no view", () => {
    const button = viewButton(headerAt("/o/acme/decisions", [ada, acme], acme));

    expect(button).toContain('href="/o/acme/board"');
    expect(button).toContain('aria-label="Back to Board"');
  });

  it("picks the board's org in the settings panel: every org, then All", () => {
    const panel = settings(headerAt("/o/acme/board", [ada, acme], acme));

    expect([...panel.matchAll(/href="(\/o\/[^/"]+\/board|\/me)"/g)].map((one) => one[1])).toEqual([
      "/o/ada/board",
      "/o/acme/board",
      "/me",
    ]);
    expect(panel).toMatch(/aria-current="page"[^>]*href="\/o\/acme\/board"|href="\/o\/acme\/board"[^>]*aria-current="page"/);
  });

  it("holds the pages of the org in view, or of the first org on a page that spans them", () => {
    const inOrg = settings(headerAt("/o/acme/decisions", [ada, acme], acme));
    const onWeek = settings(headerAt("/me/week", [ada, acme], null));

    for (const page of ["clients", "decisions", "archive", "fields", "members", "settings"]) {
      expect(inOrg).toContain(`href="/o/acme/${page}"`);
      expect(onWeek).toContain(`href="/o/ada/${page}"`);
    }
    expect(inOrg).toContain('href="/orgs/new"');
  });

  it("opens the account from a profile button that wears the person's avatar", () => {
    const markup = headerAt("/me", [ada, acme], null, { name: "Ada Byron", initials: "AB", color: "teal" });
    const profile = markup.match(/<a[^>]*aria-haspopup="dialog"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";

    expect(profile).toContain('href="/account"');
    expect(profile).toContain('aria-label="Account: Ada Byron"');
    expect(profile).toContain(">AB<");
    // The modal is drawn only while open: a dialog on the page stops the list keys.
    expect(markup).not.toContain('role="dialog"');
  });
});
