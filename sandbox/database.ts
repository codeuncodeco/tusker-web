/**
 * The browser database: opened from what the browser saved, or built from the
 * migrations and the seed on the first visit.
 *
 * The schema comes from `migrations/`, the same files D1 runs, in the same
 * order. A database saved before `main` gained a migration takes the new one
 * on its next load, so a rebase does not force a reset.
 */

import type { Database, SqlJsStatic } from "sql.js";

import { d1Over } from "./d1";
import { seed } from "./seed";

/** Where the database is saved between visits. */
export type Store = {
  load(): string | null;
  save(text: string): void;
  clear(): void;
};

export type Migration = { name: string; sql: string };

/** Every migration file, in the order D1 applies them: by file name. */
export function migrationFiles(): Migration[] {
  const files = import.meta.glob<string>("../migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  return Object.entries(files)
    .map(([path, sql]) => ({ name: path.split("/").pop()!, sql }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type Opened = {
  db: D1Database;
  /** Writes the database to the store now, rather than after the next write. */
  flush(): void;
};

export async function openDatabase(
  SQL: SqlJsStatic,
  store: Store,
  migrations: Migration[] = migrationFiles(),
): Promise<Opened> {
  const saved = store.load();
  const raw = saved ? restore(SQL, saved) : null;
  const sqlite = raw ?? new SQL.Database();

  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    dirty = false;
    store.save(toBase64(sqlite.export()));
    // `export` closes and reopens the database, which resets every pragma.
    sqlite.exec("PRAGMA foreign_keys = ON");
  }

  // Many writes in one act save once, just after the act.
  const db = d1Over(sqlite, () => {
    dirty = true;
    timer ??= setTimeout(flush, 0);
  });

  migrate(sqlite, migrations);
  if (!raw) {
    await seed(db);
    dirty = true;
  }
  flush();

  return { db, flush };
}

/** A saved database, or null when what the store holds no longer opens. */
function restore(SQL: SqlJsStatic, saved: string): Database | null {
  try {
    const sqlite = new SQL.Database(fromBase64(saved));
    sqlite.exec("SELECT count(*) FROM sqlite_master");
    return sqlite;
  } catch {
    return null;
  }
}

/**
 * Applies the migrations the database has not run, and records each one as
 * wrangler does, in `d1_migrations`.
 *
 * Foreign keys are off while they run, because a migration that rebuilds a
 * table drops it while other tables still point at it. D1 defers the check for
 * the same reason.
 */
function migrate(sqlite: Database, migrations: Migration[]) {
  sqlite.exec("PRAGMA foreign_keys = OFF");
  sqlite.exec(`CREATE TABLE IF NOT EXISTS d1_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);

  const applied = new Set(
    (sqlite.exec("SELECT name FROM d1_migrations")[0]?.values ?? []).map(([name]) => String(name)),
  );

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(migration.sql);
      sqlite.run("INSERT INTO d1_migrations (name) VALUES (?)", [migration.name]);
      sqlite.exec("COMMIT");
    } catch (failure) {
      sqlite.exec("ROLLBACK");
      throw new Error(`Migration ${migration.name} failed in the sandbox: ${String(failure)}`, {
        cause: failure,
      });
    }
  }

  sqlite.exec("PRAGMA foreign_keys = ON");
}

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let at = 0; at < bytes.length; at += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(text);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return bytes;
}
