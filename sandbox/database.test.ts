import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";

import { listOrgsForPerson } from "../app/orgs.server";
import { openDatabase, type Store } from "./database";
import { PERSON } from "./seed";

const SQL = await initSqlJs();

function memory(): Store & { text: string | null } {
  return {
    text: null,
    load() {
      return this.text;
    },
    save(text) {
      this.text = text;
    },
    clear() {
      this.text = null;
    },
  };
}

describe("the browser database", () => {
  it("builds the schema from every migration and records each one", async () => {
    const { db } = await openDatabase(SQL, memory());
    const { results } = await db.prepare("SELECT name FROM d1_migrations ORDER BY id").all<{ name: string }>();
    expect(results.at(0)?.name).toBe("0001_create_orgs.sql");
    expect(results.length).toBe(Object.keys(import.meta.glob("../migrations/*.sql")).length);
  });

  it("seeds two orgs in different colours, with the person as owner of both", async () => {
    const { db } = await openDatabase(SQL, memory());
    const orgs = await listOrgsForPerson(db, PERSON.id);
    expect(orgs.map((org) => org.slug).sort()).toEqual(["garden", "studio"]);
    expect(new Set(orgs.map((org) => org.color)).size).toBe(2);
    const roles = await db.prepare("SELECT DISTINCT role FROM memberships WHERE user_id = ?").bind(PERSON.id).all();
    expect(roles.results).toEqual([{ role: "owner" }]);
  });

  it("seeds every status in each org, and an archived task", async () => {
    const { db } = await openDatabase(SQL, memory());
    const { results } = await db
      .prepare(
        `SELECT o.slug, count(DISTINCT t.status) AS statuses, sum(t.archived) AS archived
         FROM tasks t JOIN orgs o ON o.id = t.org_id GROUP BY o.slug ORDER BY o.slug`,
      )
      .all();
    expect(results).toEqual([
      { slug: "garden", statuses: 5, archived: 1 },
      { slug: "studio", statuses: 5, archived: 1 },
    ]);
  });

  it("seeds fields, colours, a reference cache, a plan, a week and decisions", async () => {
    const { db } = await openDatabase(SQL, memory());
    const count = (sql: string) => db.prepare(sql).first<number>("n");
    expect(await count("SELECT count(*) AS n FROM org_fields WHERE type = 'reference'")).toBe(1);
    expect(await count("SELECT count(*) AS n FROM org_field_colors")).toBeGreaterThan(0);
    expect(await count("SELECT count(*) AS n FROM org_ref_options")).toBeGreaterThan(0);
    expect(await count("SELECT count(*) AS n FROM task_assignees")).toBeGreaterThan(0);
    expect(await count("SELECT count(*) AS n FROM plans")).toBe(1);
    expect(await count("SELECT count(*) AS n FROM week_plan_tasks")).toBeGreaterThan(0);
    expect(await count("SELECT count(*) AS n FROM decisions")).toBe(2);
  });

  it("keeps a write across a reopen, and seeds only once", async () => {
    const store = memory();
    const first = await openDatabase(SQL, store);
    await first.db.prepare("UPDATE orgs SET name = 'Renamed' WHERE slug = 'studio'").run();
    first.flush();

    const again = await openDatabase(SQL, store);
    expect(await again.db.prepare("SELECT name FROM orgs WHERE slug = 'studio'").first("name")).toBe("Renamed");
    expect(await again.db.prepare("SELECT count(*) AS n FROM orgs").first("n")).toBe(2);
  });

  it("runs a migration the saved database has not seen", async () => {
    const store = memory();
    await openDatabase(SQL, store);
    const added = { name: "9999_sandbox_test.sql", sql: "ALTER TABLE orgs ADD COLUMN motto TEXT;" };
    const { db } = await openDatabase(SQL, store, [
      ...(await import("./database")).migrationFiles(),
      added,
    ]);
    expect(await db.prepare("SELECT motto FROM orgs LIMIT 1").first()).toEqual({ motto: null });
  });

  it("starts again from the seed once the store is cleared", async () => {
    const store = memory();
    const first = await openDatabase(SQL, store);
    await first.db.prepare("DELETE FROM tasks").run();
    first.flush();
    store.clear();

    const { db } = await openDatabase(SQL, store);
    expect(await db.prepare("SELECT count(*) AS n FROM tasks").first("n")).toBeGreaterThan(0);
  });

  it("holds foreign keys on, as D1 does", async () => {
    const { db } = await openDatabase(SQL, memory());
    await expect(
      db.prepare("INSERT INTO memberships (org_id, user_id) VALUES ('no-org', ?)").bind(PERSON.id).run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });
});
