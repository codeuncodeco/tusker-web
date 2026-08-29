import { env } from "cloudflare:workers";
import { beforeEach, expect, it } from "vitest";

import { createPersonalOrg, listOrgsForPerson } from "../app/orgs.server";
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
