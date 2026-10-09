/**
 * The org directory and the join request. A person who belongs to no org
 * lands on the directory and asks to join; an owner of the org answers. See
 * ADR-0027 and ADR-0028.
 */

import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { outbox } from "../app/mail.server";
import * as personLayout from "../app/layouts/person";
import * as accountRoute from "../app/routes/account";
import * as authRoute from "../app/routes/api.auth";
import * as meRoute from "../app/routes/me";
import * as planRoute from "../app/routes/me.plan";
import * as membersRoute from "../app/routes/members";
import * as directoryRoute from "../app/routes/orgs";
import { member, signedIn } from "./accounts";
import { SITE, caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

const db = env.DB;

beforeEach(async () => {
  await wipe();
  outbox.length = 0;
});

/**
 * Ada, the instance owner, who owns /ada. Bo is a plain member of /ada. Cy
 * owns /cy. Dee belongs to no org. The outbox starts empty.
 */
async function instance() {
  const ada = await member("ada@example.test", "Ada");
  const bo = await signedIn("bo@example.test", "Bo");
  await db
    .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
    .bind(ada.org.id, bo.person.id)
    .run();
  const cy = await member("cy@example.test", "Cy");
  await db.prepare("UPDATE orgs SET color = 'teal' WHERE id = ?").bind(cy.org.id).run();
  const dee = await signedIn("dee@example.test", "Dee");
  outbox.length = 0;
  return { ada, bo, cy, dee };
}

function directory(cookie: string) {
  return directoryRoute.loader(routeArgs(get("/orgs", cookie)));
}

function onDirectory(cookie: string, fields: Record<string, string>) {
  const request = post("/orgs", fields);
  request.headers.set("cookie", cookie);
  return directoryRoute.action(routeArgs(request));
}

function onMembers(cookie: string, slug: string, fields: Record<string, string>) {
  const request = post(`/o/${slug}/members`, fields);
  request.headers.set("cookie", cookie);
  return membersRoute.action(routeArgs(request, { slug })) as Promise<{
    ok?: string;
    error?: string;
  }>;
}

function membersPage(cookie: string, slug: string) {
  return membersRoute.loader(routeArgs(get(`/o/${slug}/members`, cookie), { slug }));
}

/** The request one person holds to one org: its state, or null for none. */
async function requestTo(orgId: string, personId: string) {
  const row = await db
    .prepare("SELECT status FROM join_requests WHERE org_id = ? AND user_id = ?")
    .bind(orgId, personId)
    .first<{ status: string }>();
  return row?.status ?? null;
}

async function isMember(orgId: string, personId: string) {
  const row = await db
    .prepare("SELECT 1 AS one FROM memberships WHERE org_id = ? AND user_id = ?")
    .bind(orgId, personId)
    .first();
  return row !== null;
}

describe("who lands on the directory", () => {
  it("sends a person in no org from the person pages to the directory", async () => {
    const { dee } = await instance();

    for (const path of ["/me", "/me/plan"]) {
      const response = await caught(personLayout.loader(routeArgs(get(path, dee.cookie))));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/orgs");
    }

    const board = await caught(meRoute.loader(routeArgs(get("/me", dee.cookie))));
    expect(board.headers.get("location")).toBe("/orgs");
    const plan = await caught(planRoute.loader(routeArgs(get("/me/plan", dee.cookie))));
    expect(plan.headers.get("location")).toBe("/orgs");
  });

  it("leaves the directory, the account page and the new-org form open to them", async () => {
    const { dee } = await instance();

    for (const path of ["/orgs", "/account", "/orgs/new"]) {
      const data = await personLayout.loader(routeArgs(get(path, dee.cookie)));
      expect(data.orgs).toEqual([]);
    }
  });

  it("sends a person who belongs to an org away from the directory", async () => {
    const { bo } = await instance();

    const response = await caught(directory(bo.cookie));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/me");

    const asked = await caught(onDirectory(bo.cookie, { intent: "ask", org: "anything" }));
    expect(asked.headers.get("location")).toBe("/me");
  });
});

describe("the directory", () => {
  it("lists every org by name and colour, and names the instance owner", async () => {
    const { ada, cy, dee } = await instance();

    const data = await directory(dee.cookie);

    expect(data.orgs).toEqual([
      { id: ada.org.id, name: "Ada", color: expect.any(String), request: null },
      { id: cy.org.id, name: "Cy", color: "teal", request: null },
    ]);
    expect(data.owner).toEqual({ name: "Ada", email: "ada@example.test" });
  });
});

describe("asking to join", () => {
  it("makes one request and mails the org's owners", async () => {
    const { ada, dee } = await instance();
    await db
      .prepare("UPDATE memberships SET role = 'owner' WHERE user_id = (SELECT id FROM \"user\" WHERE email = 'bo@example.test')")
      .run();

    await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });

    expect(await requestTo(ada.org.id, dee.person.id)).toBe("waiting");
    expect(outbox.map((mail) => mail.to).sort()).toEqual(["ada@example.test", "bo@example.test"]);
    expect(outbox[0].subject).toBe("Dee asks to join Ada on Tusker");
    expect(outbox[0].text).toContain(`${SITE}/o/ada/members`);

    const data = await directory(dee.cookie);
    expect(data.orgs.find((org) => org.id === ada.org.id)?.request).toBe("waiting");
  });

  it("does not make a second request, nor mail again, when asked twice", async () => {
    const { ada, dee } = await instance();

    await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });
    outbox.length = 0;
    await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });

    const { results } = await db.prepare("SELECT * FROM join_requests").all();
    expect(results).toHaveLength(1);
    expect(outbox).toEqual([]);
  });

  it("refuses an org that does not exist", async () => {
    const { dee } = await instance();

    const answer = await onDirectory(dee.cookie, { intent: "ask", org: "no-such-org" });

    expect(answer).toEqual({ error: "Tusker holds no such org." });
    const { results } = await db.prepare("SELECT * FROM join_requests").all();
    expect(results).toEqual([]);
  });
});

describe("the members page", () => {
  it("lists the waiting requests to every member, and the answer only to an owner", async () => {
    const { ada, bo, dee } = await instance();
    await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });

    const asOwner = await membersPage(ada.cookie, "ada");
    const asMember = await membersPage(bo.cookie, "ada");

    const waiting = [{ id: dee.person.id, name: "Dee", email: "dee@example.test" }];
    expect(asOwner.requests).toEqual(waiting);
    expect(asMember.requests).toEqual(waiting);
    expect(asOwner.answers).toBe(true);
    expect(asMember.answers).toBe(false);
  });

  it("refuses an approval or a decline from a plain member", async () => {
    const { ada, bo, dee } = await instance();
    await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });

    for (const intent of ["approve", "decline"]) {
      const answer = await onMembers(bo.cookie, "ada", { intent, person: dee.person.id });
      expect(answer.error).toBe("Only an owner of Ada answers a join request.");
    }

    expect(await requestTo(ada.org.id, dee.person.id)).toBe("waiting");
    expect(await isMember(ada.org.id, dee.person.id)).toBe(false);
  });

  it("leaves invitations open to a plain member", async () => {
    const { bo } = await instance();

    const answer = await onMembers(bo.cookie, "ada", { email: "eve@example.test" });

    expect(answer.ok).toContain("is a member now");
  });
});

describe("approving", () => {
  it("adds the membership, clears the request and mails a link that signs the person in", async () => {
    const { ada, dee } = await instance();
    await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });
    outbox.length = 0;

    const answer = await onMembers(ada.cookie, "ada", { intent: "approve", person: dee.person.id });

    expect(answer.ok).toBe("Dee is a member of Ada now. Tusker mailed them a link to sign in.");
    expect(await isMember(ada.org.id, dee.person.id)).toBe(true);
    expect(await requestTo(ada.org.id, dee.person.id)).toBeNull();

    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe("dee@example.test");
    expect(outbox[0].subject).toBe("Ada added you to Ada on Tusker");
    const url = outbox[0].text.match(/(https:\/\/\S+magic-link\S+)/)![1];
    const response = await caught(authRoute.loader(routeArgs(get(url.slice(SITE.length)))));
    expect(response.status).toBe(302);
    expect(cookieFrom(response)).toContain("better-auth");
  });

  it("leaves the person's requests to other orgs waiting", async () => {
    const { ada, cy, dee } = await instance();
    await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });
    await onDirectory(dee.cookie, { intent: "ask", org: cy.org.id });

    await onMembers(ada.cookie, "ada", { intent: "approve", person: dee.person.id });

    expect(await requestTo(cy.org.id, dee.person.id)).toBe("waiting");
  });

  it("refuses a person who holds no waiting request", async () => {
    const { ada, dee } = await instance();

    const answer = await onMembers(ada.cookie, "ada", { intent: "approve", person: dee.person.id });

    expect(answer.error).toBe("Ada holds no waiting request from that person.");
    expect(await isMember(ada.org.id, dee.person.id)).toBe(false);
  });
});

describe("declining", () => {
  it("is silent, shows Declined, and cannot be asked again", async () => {
    const { ada, dee } = await instance();
    await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });
    outbox.length = 0;

    const answer = await onMembers(ada.cookie, "ada", { intent: "decline", person: dee.person.id });

    expect(answer.ok).toBe("Dee's request to join Ada is declined.");
    expect(outbox).toEqual([]);
    expect(await isMember(ada.org.id, dee.person.id)).toBe(false);
    expect((await membersPage(ada.cookie, "ada")).requests).toEqual([]);

    const data = await directory(dee.cookie);
    expect(data.orgs.find((org) => org.id === ada.org.id)?.request).toBe("declined");

    const again = await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });
    expect(again).toEqual({ error: "Ada declined your request." });
    expect(await requestTo(ada.org.id, dee.person.id)).toBe("declined");
    expect(outbox).toEqual([]);
  });

  it("leaves the org free to invite the person", async () => {
    const { ada, dee } = await instance();
    await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });
    await onMembers(ada.cookie, "ada", { intent: "decline", person: dee.person.id });

    await onMembers(ada.cookie, "ada", { email: "dee@example.test" });

    expect(await isMember(ada.org.id, dee.person.id)).toBe(true);
    // Joining clears the decline, so being taken out later is not one.
    expect(await requestTo(ada.org.id, dee.person.id)).toBeNull();
  });
});

describe("withdrawing", () => {
  it("takes back a waiting request from the directory", async () => {
    const { ada, dee } = await instance();
    await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });

    await onDirectory(dee.cookie, { intent: "withdraw", org: ada.org.id });

    expect(await requestTo(ada.org.id, dee.person.id)).toBeNull();
    const data = await directory(dee.cookie);
    expect(data.orgs.find((org) => org.id === ada.org.id)?.request).toBeNull();
  });

  it("cannot take back a decline", async () => {
    const { ada, dee } = await instance();
    await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });
    await onMembers(ada.cookie, "ada", { intent: "decline", person: dee.person.id });

    await onDirectory(dee.cookie, { intent: "withdraw", org: ada.org.id });

    expect(await requestTo(ada.org.id, dee.person.id)).toBe("declined");
  });

  it("takes back a waiting request from the account page, once the person is in an org", async () => {
    const { ada, cy, dee } = await instance();
    await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });
    await onDirectory(dee.cookie, { intent: "ask", org: cy.org.id });
    await onMembers(ada.cookie, "ada", { intent: "approve", person: dee.person.id });

    const page = await accountRoute.loader(routeArgs(get("/account", dee.cookie)));
    expect(page.requests).toEqual([{ id: cy.org.id, name: "Cy", color: "teal" }]);

    const request = post("/account", { intent: "withdraw", org: cy.org.id });
    request.headers.set("cookie", dee.cookie);
    await accountRoute.action(routeArgs(request));

    expect(await requestTo(cy.org.id, dee.person.id)).toBeNull();
  });

  it("still signs out from the account page", async () => {
    const { dee } = await instance();

    const request = post("/account", {});
    request.headers.set("cookie", dee.cookie);
    const response = await caught(accountRoute.action(routeArgs(request)));

    expect(response.headers.get("location")).toBe("/login");
  });
});

describe("joining by invitation", () => {
  it("clears the waiting request to that org", async () => {
    const { ada, bo, dee } = await instance();
    await onDirectory(dee.cookie, { intent: "ask", org: ada.org.id });

    await onMembers(bo.cookie, "ada", { email: "dee@example.test" });

    expect(await isMember(ada.org.id, dee.person.id)).toBe(true);
    expect(await requestTo(ada.org.id, dee.person.id)).toBeNull();
  });
});
