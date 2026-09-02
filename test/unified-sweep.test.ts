/**
 * The sweep of the unified board's finished columns: one archive write per
 * org, in sequence, and one undo for the whole batch. See #126 and ADR-0019.
 */

import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createAccount } from "../app/accounts.server";
import { createAuth } from "../app/auth.server";
import { isFinished, type Status } from "../app/board";
import * as meRoute from "../app/routes/me";
import * as loginRoute from "../app/routes/login";
import type { OrgSet } from "../app/scope.server";
import { restoreAcross, sweepAcross } from "../app/sweep.server";
import type { Swept } from "../app/sweep";
import { caught, cookieFrom, get, post, routeArgs, wipe } from "./routes";

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

/** A second org the person is a member of. */
async function team(personId: string, slug: string) {
  const id = `org-${slug}`;
  await db.batch([
    db
      .prepare("INSERT INTO orgs (id, slug, name, kind) VALUES (?, ?, ?, 'team')")
      .bind(id, slug, slug),
    db
      .prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?, ?, 'member')")
      .bind(id, personId),
  ]);
  return { id, slug };
}

/** One task of one org, placed by hand. */
async function task(orgId: string, id: string, status: Status = "done") {
  await db
    .prepare(
      `INSERT INTO tasks (id, org_id, title, status, position, created_at, updated_at, finished_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    )
    .bind(
      id,
      orgId,
      id,
      status,
      "2026-01-01T00:00:00.000Z",
      `${DAY}T09:00:00.000Z`,
      isFinished(status) ? `${DAY}T09:00:00.000Z` : null,
    )
    .run();
  return id;
}

/** A post to the unified board, signed by the cookie. */
function act(cookie: string, fields: Record<string, string | string[]>) {
  const request = post("/me", fields);
  request.headers.set("cookie", `${cookie}; day=${DAY}`);
  return meRoute.action(routeArgs(request, {}));
}

/** The cards the sweep form posts for a set of tasks, in card order. */
function cards(...held: { slug: string; ids: string[] }[]) {
  const drawn = held.flatMap((one) => one.ids.map((id) => ({ id, slug: one.slug })));
  return {
    intent: "archive",
    id: drawn.map((card) => card.id),
    slug: drawn.map((card) => card.slug),
  };
}

/** The archive flag of one row. */
async function flagOf(id: string) {
  const row = await db
    .prepare("SELECT archived FROM tasks WHERE id = ?")
    .bind(id)
    .first<{ archived: number }>();
  return row!.archived;
}

/** The ids one column of the unified board draws. */
async function column(cookie: string, status: string) {
  const board = (await meRoute.loader(
    routeArgs(get("/me?cancelled=1", `${cookie}; day=${DAY}`)),
  )) as { columns: { status: string; tasks: { id: string }[] }[] };
  return board.columns.find((one) => one.status === status)?.tasks.map((one) => one.id) ?? [];
}

describe("a sweep over several orgs", () => {
  it("archives the cards of every org the column drew", async () => {
    const ada = await member("ada@example.test", "Ada");
    const acme = await team(ada.person.id, "acme");
    const mine = await task(ada.org.id, "mine");
    const ours = await task(acme.id, "ours");

    const swept = (await act(
      ada.cookie,
      cards({ slug: ada.org.slug, ids: [mine] }, { slug: "acme", ids: [ours] }),
    )) as { changed: Swept[]; partial: boolean };

    expect(swept).toEqual({
      changed: [
        { id: mine, slug: ada.org.slug },
        { id: ours, slug: "acme" },
      ],
      partial: false,
    });
    expect(await column(ada.cookie, "done")).toEqual([]);
  });

  it("sweeps Cancelled as it sweeps Done", async () => {
    const ada = await member("ada@example.test", "Ada");
    const dropped = await task(ada.org.id, "dropped", "cancelled");

    await act(ada.cookie, cards({ slug: ada.org.slug, ids: [dropped] }));

    expect(await flagOf(dropped)).toBe(1);
    expect(await column(ada.cookie, "cancelled")).toEqual([]);
  });

  it("archives nothing the person could not see", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    const hers = await task(bob.org.id, "hers");

    const answer = await caught(act(ada.cookie, cards({ slug: bob.org.slug, ids: [hers] })));

    expect(answer.status).toBe(404);
    expect(await flagOf(hers)).toBe(0);
  });

  it("writes no org at all when one slug is out of reach", async () => {
    const ada = await member("ada@example.test", "Ada");
    const bob = await member("bob@example.test", "Bob");
    const mine = await task(ada.org.id, "mine");
    const hers = await task(bob.org.id, "hers");

    await caught(
      act(ada.cookie, cards({ slug: ada.org.slug, ids: [mine] }, { slug: bob.org.slug, ids: [hers] })),
    );

    expect(await flagOf(mine)).toBe(0);
  });

  it("refuses a form that names a card without an org", async () => {
    const ada = await member("ada@example.test", "Ada");
    const mine = await task(ada.org.id, "mine");

    const answer = await caught(act(ada.cookie, { intent: "archive", id: [mine] }));

    expect(answer.status).toBe(400);
    expect(await flagOf(mine)).toBe(0);
  });
});

describe("the one undo for the batch", () => {
  it("answers with what it put back, so a half undo is not silent", async () => {
    const ada = await member("ada@example.test", "Ada");
    const mine = await task(ada.org.id, "mine");
    await act(ada.cookie, cards({ slug: ada.org.slug, ids: [mine] }));

    const undone = (await act(ada.cookie, {
      intent: "restore",
      id: [mine],
      slug: [ada.org.slug],
    })) as { changed: Swept[]; partial: boolean };

    expect(undone).toEqual({ changed: [{ id: mine, slug: ada.org.slug }], partial: false });
  });

  it("says so when one org did not answer", async () => {
    const orgs = [
      { id: "org-one", slug: "one", name: "One", kind: "team" },
      { id: "org-two", slug: "two", name: "Two", kind: "team" },
    ];
    const db = {
      prepare: () => ({ bind: (_id: string, orgId: string) => ({ orgId }) }),
      batch: async (statements: { orgId: string }[]) => {
        if (statements.some((one) => one.orgId === "org-two")) throw new Error("no answer");
        return statements.map(() => ({ meta: { changes: 1 } }));
      },
    } as unknown as D1Database;

    const undone = await restoreAcross(db, { personId: "ada", orgs } as OrgSet, [
      { id: "a", slug: "one" },
      { id: "b", slug: "two" },
    ]);

    expect(undone).toEqual({ changed: [{ id: "a", slug: "one" }], partial: true });
  });

  it("puts the whole batch back, org by org", async () => {
    const ada = await member("ada@example.test", "Ada");
    const acme = await team(ada.person.id, "acme");
    const mine = await task(ada.org.id, "mine");
    const ours = await task(acme.id, "ours");
    const swept = (await act(
      ada.cookie,
      cards({ slug: ada.org.slug, ids: [mine] }, { slug: "acme", ids: [ours] }),
    )) as { changed: Swept[] };

    await act(ada.cookie, {
      intent: "restore",
      id: swept.changed.map((card) => card.id),
      slug: swept.changed.map((card) => card.slug),
    });

    expect(await flagOf(mine)).toBe(0);
    expect(await flagOf(ours)).toBe(0);
  });

  it("names the cards the sweep changed, and not the cards it was given", async () => {
    const ada = await member("ada@example.test", "Ada");
    const early = await task(ada.org.id, "early");
    const late = await task(ada.org.id, "late");
    await act(ada.cookie, cards({ slug: ada.org.slug, ids: [early] }));

    // The form names both, as a stale screen would. The sweep changed one.
    const swept = (await act(
      ada.cookie,
      cards({ slug: ada.org.slug, ids: [early, late] }),
    )) as { changed: Swept[] };
    await act(ada.cookie, {
      intent: "restore",
      id: swept.changed.map((card) => card.id),
      slug: swept.changed.map((card) => card.slug),
    });

    expect(swept.changed).toEqual([{ id: late, slug: ada.org.slug }]);
    expect(await flagOf(early)).toBe(1);
    expect(await flagOf(late)).toBe(0);
  });
});

describe("a sweep that half succeeds", () => {
  /** A set of two orgs, as a scope is minted from. */
  const set: OrgSet = {
    personId: "ada",
    orgs: [
      { id: "org-one", slug: "one", name: "One", kind: "team" },
      { id: "org-two", slug: "two", name: "Two", kind: "team" },
    ] as OrgSet["orgs"],
  };

  /** A database that answers for one org and fails for the other. */
  function flaky(failing: string): D1Database {
    return {
      prepare: () => ({ bind: (_id: string, orgId: string) => ({ orgId }) }),
      batch: async (statements: { orgId: string }[]) => {
        if (statements.some((one) => one.orgId === failing)) throw new Error("no answer");
        return statements.map(() => ({ meta: { changes: 1 } }));
      },
    } as unknown as D1Database;
  }

  it("reports exactly the ids it changed, and says it stopped", async () => {
    const swept = await sweepAcross(flaky("org-two"), set, [
      { id: "a", slug: "one" },
      { id: "b", slug: "two" },
    ]);

    expect(swept).toEqual({ changed: [{ id: "a", slug: "one" }], partial: true });
  });

  it("does not roll back the org that succeeded", async () => {
    const written: string[] = [];
    const db = {
      prepare: () => ({ bind: (id: string, orgId: string) => ({ id, orgId }) }),
      batch: async (statements: { id: string; orgId: string }[]) => {
        if (statements.some((one) => one.orgId === "org-two")) throw new Error("no answer");
        written.push(...statements.map((one) => one.id));
        return statements.map(() => ({ meta: { changes: 1 } }));
      },
    } as unknown as D1Database;

    await sweepAcross(db, set, [
      { id: "a", slug: "one" },
      { id: "b", slug: "two" },
    ]);

    expect(written).toEqual(["a"]);
  });

  it("writes the orgs in the order the column named them", async () => {
    const orgs: string[] = [];
    const db = {
      prepare: () => ({ bind: (_id: string, orgId: string) => ({ orgId }) }),
      batch: async (statements: { orgId: string }[]) => {
        orgs.push(statements[0].orgId);
        return statements.map(() => ({ meta: { changes: 1 } }));
      },
    } as unknown as D1Database;

    await sweepAcross(db, set, [
      { id: "a", slug: "two" },
      { id: "b", slug: "one" },
      { id: "c", slug: "two" },
    ]);

    expect(orgs).toEqual(["org-two", "org-one"]);
  });
});
