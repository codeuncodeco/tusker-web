/**
 * A task is named by a number, and the number is its id. Migration 0019 gave
 * every task that already existed its number, and rewrote every table that
 * points at a task. See ADR-0030.
 */

import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const { TEST_MIGRATIONS: migrations, MIGRATION_DB: db } = env as Env & {
  TEST_MIGRATIONS: D1Migration[];
  MIGRATION_DB: D1Database;
};

const NUMBERS = "0019_task_numbers.sql";
const at = migrations.findIndex((one) => one.name === NUMBERS);

/** Runs a list of statements in one batch. */
async function run(...sql: string[]) {
  await db.batch(sql.map((one) => db.prepare(one)));
}

describe("migration 0019", () => {
  it("numbers the tasks in the order they were made and rewrites every reference", async () => {
    // The schema as it stood before the numbers.
    await applyD1Migrations(db, migrations.slice(0, at));

    await run(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
       VALUES ('u1', 'Ada', 'ada@example.test', 1, 0, 0)`,
      "INSERT INTO orgs (id, slug, name) VALUES ('o1', 'acme', 'Acme')",
      "INSERT INTO memberships (org_id, user_id, role) VALUES ('o1', 'u1', 'owner')",
      // Made out of order, and two at the same time, so the UUID breaks the tie.
      `INSERT INTO tasks (id, org_id, title, status, created_at) VALUES
         ('cccc', 'o1', 'Third', 'todo', '2026-03-01T00:00:00.000Z'),
         ('aaaa', 'o1', 'First', 'todo', '2026-01-01T00:00:00.000Z'),
         ('bbbb', 'o1', 'Tied, second', 'done', '2026-02-01T00:00:00.000Z'),
         ('abbb', 'o1', 'Tied, first', 'todo', '2026-02-01T00:00:00.000Z')`,
      "INSERT INTO task_assignees (task_id, org_id, user_id) VALUES ('cccc', 'o1', 'u1')",
      `INSERT INTO plans (user_id, day, task_ids)
       VALUES ('u1', '2026-03-02', '["cccc","gone","aaaa"]')`,
      "INSERT INTO week_plans (user_id, week) VALUES ('u1', '2026-W10')",
      `INSERT INTO week_plan_tasks (user_id, week, task_id, position)
       VALUES ('u1', '2026-W10', 'bbbb', 1)`,
      `INSERT INTO decisions (id, org_id, task_id, title) VALUES
         ('d1', 'o1', 'bbbb', 'Kept'),
         ('d2', 'o1', NULL, 'Orphan')`,
    );

    await applyD1Migrations(db, migrations);

    const tasks = await db
      .prepare("SELECT id, title FROM tasks ORDER BY id")
      .all<{ id: number; title: string }>();
    expect(tasks.results).toEqual([
      { id: 1, title: "First" },
      { id: 2, title: "Tied, first" },
      { id: 3, title: "Tied, second" },
      { id: 4, title: "Third" },
    ]);

    const assignee = await db.prepare("SELECT task_id FROM task_assignees").first();
    expect(assignee).toEqual({ task_id: 4 });

    const plan = await db.prepare("SELECT task_ids FROM plans").first<{ task_ids: string }>();
    expect(JSON.parse(plan!.task_ids)).toEqual([4, 1]);

    const week = await db.prepare("SELECT task_id FROM week_plan_tasks").first();
    expect(week).toEqual({ task_id: 3 });

    const decisions = await db
      .prepare("SELECT id, task_id FROM decisions ORDER BY id")
      .all<{ id: string; task_id: number | null }>();
    expect(decisions.results).toEqual([
      { id: "d1", task_id: 3 },
      { id: "d2", task_id: null },
    ]);

    // The next task takes the number after the last one.
    await run("INSERT INTO tasks (org_id, title, status) VALUES ('o1', 'Fifth', 'todo')");
    const next = await db.prepare("SELECT MAX(id) AS id FROM tasks").first();
    expect(next).toEqual({ id: 5 });

    // The foreign keys still hold: an assignee of a task that is not there is
    // refused.
    await expect(
      run("INSERT INTO task_assignees (task_id, org_id, user_id) VALUES (99, 'o1', 'u1')"),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});
