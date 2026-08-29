import { beforeEach, expect, it } from "vitest";

import { listOrgs } from "../app/orgs.server";
import { testEnv } from "./env";

const db = testEnv.DB;

beforeEach(async () => {
  await db.prepare("DELETE FROM orgs").run();
});

it("reads back an org that the migration's table holds", async () => {
  await db
    .prepare("INSERT INTO orgs (id, slug, name, kind) VALUES (?, ?, ?, ?)")
    .bind("org_1", "codeuncode", "codeuncode", "team")
    .run();

  const orgs = await listOrgs(db);

  expect(orgs).toEqual([
    expect.objectContaining({ id: "org_1", slug: "codeuncode", kind: "team" }),
  ]);
});

it("returns an empty list when no org exists", async () => {
  await expect(listOrgs(db)).resolves.toEqual([]);
});
