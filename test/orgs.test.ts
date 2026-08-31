import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import {
  addMember,
  createPersonalOrg,
  createTeamOrg,
  freeSlug,
  listMembers,
  listOrgsForPerson,
  slugify,
} from "../app/orgs.server";
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

it("names the personal org after the person, and keeps the email when there is no name", async () => {
  await person("u1", "ada@example.test");

  const org = await createPersonalOrg(db, { id: "u1", name: null, email: "ada@example.test" });

  expect(org).toMatchObject({ slug: "ada", name: "ada@example.test", kind: "personal" });
});

it("lists only the orgs the person is a member of", async () => {
  await person("u1", "ada@example.test");
  await person("u2", "bo@example.test");
  await createPersonalOrg(db, { id: "u1", name: "Ada", email: "ada@example.test" });
  await createPersonalOrg(db, { id: "u2", name: "Bo", email: "bo@example.test" });

  const mine = await listOrgsForPerson(db, "u1");

  expect(mine).toEqual([expect.objectContaining({ slug: "ada" })]);
});

it("puts the personal org first", async () => {
  await person("u1", "ada@example.test");
  await db
    .prepare("INSERT INTO orgs (id, slug, name, kind) VALUES ('t1', 'codeuncode', 'codeuncode', 'team')")
    .run();
  await db.prepare("INSERT INTO memberships (org_id, user_id, role) VALUES ('t1', 'u1', 'member')").run();
  await createPersonalOrg(db, { id: "u1", name: "Ada", email: "ada@example.test" });

  const mine = await listOrgsForPerson(db, "u1");

  expect(mine.map((org) => org.slug)).toEqual(["ada", "codeuncode"]);
});

it("makes a team org with the person as its owner", async () => {
  await person("u1", "ada@example.test");

  const org = await createTeamOrg(db, { name: "codeuncode", slug: "codeuncode", personId: "u1" });

  expect(org).toMatchObject({ slug: "codeuncode", name: "codeuncode", kind: "team" });
  const role = await db
    .prepare("SELECT role FROM memberships WHERE org_id = ? AND user_id = 'u1'")
    .bind(org!.id)
    .first<{ role: string }>();
  expect(role?.role).toBe("owner");
});

it("answers null for a slug another org already holds, and writes nothing", async () => {
  await person("u1", "ada@example.test");
  await person("u2", "bo@example.test");
  await createTeamOrg(db, { name: "codeuncode", slug: "codeuncode", personId: "u1" });

  const second = await createTeamOrg(db, { name: "Another", slug: "codeuncode", personId: "u2" });

  expect(second).toBeNull();
  const { results } = await db.prepare("SELECT id FROM orgs").all();
  expect(results).toHaveLength(1);
});

it("cuts a name down to a slug, and finds the next free one", async () => {
  expect(slugify("Code & Uncode!")).toBe("code-uncode");
  await person("u1", "ada@example.test");
  await createTeamOrg(db, { name: "Code Uncode", slug: "code-uncode", personId: "u1" });

  expect(await freeSlug(db, "code-uncode")).toBe("code-uncode-2");
});

describe("adding a person to an org", () => {
  /** An org with Ada as its owner, and Bo as an account outside it. */
  async function team() {
    await person("u1", "ada@example.test");
    await person("u2", "Bo@Example.test");
    const org = await createTeamOrg(db, { name: "codeuncode", slug: "codeuncode", personId: "u1" });
    return org!;
  }

  it("adds an account, whatever case the email is typed in", async () => {
    const org = await team();

    expect(await addMember(db, org.id, " bo@example.test ")).toBe("added");

    expect((await listOrgsForPerson(db, "u2")).map((one) => one.slug)).toEqual(["codeuncode"]);
  });

  it("says so when the person is a member already", async () => {
    const org = await team();
    await addMember(db, org.id, "bo@example.test");

    expect(await addMember(db, org.id, "bo@example.test")).toBe("already");
  });

  it("refuses an email no account holds, because there is no public signup", async () => {
    const org = await team();

    expect(await addMember(db, org.id, "nobody@example.test")).toBe("no-account");

    const { results } = await db.prepare("SELECT user_id FROM memberships WHERE org_id = ?").bind(org.id).all();
    expect(results).toHaveLength(1);
  });

  it("lists the owner first", async () => {
    const org = await team();
    await addMember(db, org.id, "bo@example.test");

    const members = await listMembers(db, org.id);

    expect(members.map((one) => one.role)).toEqual(["owner", "member"]);
    expect(members.map((one) => one.id)).toEqual(["u1", "u2"]);
  });
});
