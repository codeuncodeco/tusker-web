import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { ASSIGNABLE } from "../app/colors";
import { createOrgKey, orgForKey } from "../app/org-keys.server";
import {
  createPersonalOrg,
  createTeamOrg,
  listOrgsForPerson,
  setOrgColor,
} from "../app/orgs.server";
import migration from "../migrations/0015_org_color.sql?raw";
import { wipe } from "./routes";

const db = env.DB;

beforeEach(wipe);

/** A bare user row. `memberships.user_id` points at the better-auth table. */
async function person(id: string, email: string) {
  await db
    .prepare(
      'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) ' +
        "VALUES (?, '', ?, 0, datetime('now'), datetime('now'))",
    )
    .bind(id, email)
    .run();
}

/**
 * The backfill half of migration 0015, run again over rows this test wrote.
 * The migration ran over an empty test table, so the walk is read from the
 * file rather than copied, and the two cannot drift apart.
 */
async function backfill() {
  await db.prepare(migration.slice(migration.indexOf("UPDATE orgs"))).run();
}

describe("the colour a new org is given", () => {
  it("colours a fresh org with no visit to the settings page", async () => {
    await person("u1", "ada@example.test");

    const org = await createPersonalOrg(db, { id: "u1", name: "Ada", email: "ada@example.test" });

    expect(org.color).toBe(ASSIGNABLE[0]);
  });

  it("never gives one person two orgs the same colour, until the palette runs out", async () => {
    await person("u1", "ada@example.test");
    await createPersonalOrg(db, { id: "u1", name: "Ada", email: "ada@example.test" });
    for (let n = 1; n < ASSIGNABLE.length; n++) {
      await createTeamOrg(db, { name: `Team ${n}`, slug: `team-${n}`, personId: "u1" });
    }

    const colors = (await listOrgsForPerson(db, "u1")).map((org) => org.color);

    expect(colors).toHaveLength(ASSIGNABLE.length);
    expect(new Set(colors).size).toBe(ASSIGNABLE.length);
  });

  it("wraps round once the person holds every name", async () => {
    await person("u1", "ada@example.test");
    await createPersonalOrg(db, { id: "u1", name: "Ada", email: "ada@example.test" });
    for (let n = 1; n <= ASSIGNABLE.length; n++) {
      await createTeamOrg(db, { name: `Team ${n}`, slug: `team-${n}`, personId: "u1" });
    }

    const last = await db
      .prepare("SELECT color FROM orgs WHERE slug = ?")
      .bind(`team-${ASSIGNABLE.length}`)
      .first<{ color: string }>();

    expect(last?.color).toBe(ASSIGNABLE[0]);
  });

  it("counts only the orgs that person holds, not every org on the instance", async () => {
    await person("u1", "ada@example.test");
    await person("u2", "bo@example.test");
    await createPersonalOrg(db, { id: "u1", name: "Ada", email: "ada@example.test" });

    const bo = await createPersonalOrg(db, { id: "u2", name: "Bo", email: "bo@example.test" });

    expect(bo.color).toBe(ASSIGNABLE[0]);
  });
});

describe("the colour a row already here was given", () => {
  it("walks created_at and cycles the palette, so no live org draws grey", async () => {
    // The migration ran over an empty table, so this repeats what it does on a
    // table that holds rows: the same walk, over rows this test writes.
    for (let n = 1; n <= ASSIGNABLE.length + 1; n++) {
      await db
        .prepare("INSERT INTO orgs (id, slug, name, kind, created_at) VALUES (?, ?, ?, 'team', ?)")
        .bind(`o${n}`, `o-${n}`, `Org ${n}`, `2026-09-01T0${n}:00:00.000Z`)
        .run();
    }
    await backfill();

    const { results } = await db
      .prepare("SELECT color FROM orgs ORDER BY created_at, id")
      .all<{ color: string }>();

    expect(results.map((row) => row.color)).toEqual([...ASSIGNABLE, ASSIGNABLE[0]]);
  });
});

describe("setting the colour", () => {
  it("writes what a member chose, and clears it back to null", async () => {
    await person("u1", "ada@example.test");
    const org = await createPersonalOrg(db, { id: "u1", name: "Ada", email: "ada@example.test" });
    const scope = { org, personId: "u1" };

    await setOrgColor(db, scope, "#2563eb");
    expect((await listOrgsForPerson(db, "u1"))[0]?.color).toBe("#2563eb");

    await setOrgColor(db, scope, null);
    expect((await listOrgsForPerson(db, "u1"))[0]?.color).toBeNull();
  });
});

describe("the org behind a key", () => {
  it("carries the colour, as every other read of an org does", async () => {
    await person("u1", "ada@example.test");
    const org = await createPersonalOrg(db, { id: "u1", name: "Ada", email: "ada@example.test" });
    const key = await createOrgKey(db, { org, personId: "u1" }, "ada-app");

    const read = await orgForKey(db, key);

    expect(read?.color).toBe(org.color);
  });
});
