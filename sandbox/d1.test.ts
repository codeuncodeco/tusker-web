import initSqlJs from "sql.js";
import { beforeEach, describe, expect, it } from "vitest";

import { d1Over } from "./d1";

const SQL = await initSqlJs();

let db: D1Database;
let writes: number;

beforeEach(() => {
  const sqlite = new SQL.Database();
  sqlite.exec("CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, flag INTEGER)");
  writes = 0;
  db = d1Over(sqlite, () => (writes += 1));
});

describe("the D1 adapter", () => {
  it("runs a write and reports what it changed", async () => {
    const result = await db.prepare("INSERT INTO t (name, flag) VALUES (?, ?)").bind("a", true).run();
    expect(result.success).toBe(true);
    expect(result.meta.changes).toBe(1);
    expect(result.meta.last_row_id).toBe(1);
    expect(writes).toBe(1);
  });

  it("binds a boolean as D1 does, as 1 or 0", async () => {
    await db.prepare("INSERT INTO t (name, flag) VALUES (?, ?)").bind("a", false).run();
    expect(await db.prepare("SELECT flag FROM t").first("flag")).toBe(0);
  });

  it("refuses undefined, as D1 does", () => {
    expect(() => db.prepare("SELECT ?").bind(undefined)).toThrow(/D1_TYPE_ERROR/);
  });

  it("answers the first row, one column of it, or null", async () => {
    await db.prepare("INSERT INTO t (name) VALUES ('a'), ('b')").run();
    expect(await db.prepare("SELECT name FROM t ORDER BY id").first()).toEqual({ name: "a" });
    expect(await db.prepare("SELECT name FROM t ORDER BY id").first("name")).toBe("a");
    expect(await db.prepare("SELECT name FROM t WHERE id = ?").bind(9).first()).toBeNull();
    await expect(db.prepare("SELECT name FROM t").first("nope")).rejects.toThrow(/D1_COLUMN_NOTFOUND/);
  });

  it("reads every row, and a write's RETURNING rows", async () => {
    const made = await db.prepare("INSERT INTO t (name) VALUES (?) RETURNING id").bind("a").first<{ id: number }>();
    expect(made).toEqual({ id: 1 });
    expect(writes).toBe(1);
    const { results } = await db.prepare("SELECT id, name FROM t").all();
    expect(results).toEqual([{ id: 1, name: "a" }]);
    expect(writes).toBe(1);
  });

  it("reads rows as arrays, with the column names when asked", async () => {
    await db.prepare("INSERT INTO t (name) VALUES ('a')").run();
    expect(await db.prepare("SELECT id, name FROM t").raw()).toEqual([[1, "a"]]);
    expect(await db.prepare("SELECT id, name FROM t").raw({ columnNames: true })).toEqual([["id", "name"], [1, "a"]]);
  });

  it("numbers ?1 parameters as SQLite does", async () => {
    expect(await db.prepare("SELECT ?1 || ?1 AS twice").bind("x").first("twice")).toBe("xx");
  });

  it("runs a batch as one transaction, and answers each result", async () => {
    const results = await db.batch([
      db.prepare("INSERT INTO t (name) VALUES (?) RETURNING id").bind("a"),
      db.prepare("INSERT INTO t (name) VALUES (?) RETURNING id").bind("b"),
    ]);
    expect(results.map((one) => one.results)).toEqual([[{ id: 1 }], [{ id: 2 }]]);
  });

  it("rolls the whole batch back when one statement fails", async () => {
    await expect(
      db.batch([
        db.prepare("INSERT INTO t (name) VALUES ('a')"),
        db.prepare("INSERT INTO t (name) VALUES ('a')"),
      ]),
    ).rejects.toThrow(/UNIQUE constraint failed/);
    expect(await db.prepare("SELECT count(*) AS n FROM t").first("n")).toBe(0);
  });

  it("carries SQLite's message, which the data functions read", async () => {
    await db.prepare("INSERT INTO t (name) VALUES ('a')").run();
    await expect(db.prepare("INSERT INTO t (name) VALUES ('a')").run()).rejects.toThrow(
      "UNIQUE constraint failed: t.name",
    );
  });
});
