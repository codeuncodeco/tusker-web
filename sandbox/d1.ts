/**
 * A `D1Database` over SQLite in the browser (sql.js).
 *
 * It implements the part of the D1 surface the data functions use: `prepare`,
 * `bind`, `first`, `all`, `run`, `raw` and `batch`. The data functions take it
 * as they take the binding, with no type change, so their SQL stays as it is
 * on `main`.
 *
 * sql.js is synchronous. Each call runs when it is made and answers a settled
 * promise, so two awaits can never interleave inside one statement or batch.
 */

import type { Database, SqlValue } from "sql.js";

/** Called after every statement that may have written, so the caller can save. */
export type OnWrite = () => void;

export function d1Over(db: Database, onWrite: OnWrite = () => {}): D1Database {
  const adapter = {
    prepare(query: string) {
      return statement(db, query, [], onWrite);
    },

    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      // D1 runs a batch as one transaction: a statement that fails rolls back
      // every statement before it.
      db.exec("BEGIN");
      try {
        const results = statements.map((one) => (one as Statement).execute<T>());
        db.exec("COMMIT");
        onWrite();
        return results;
      } catch (failure) {
        db.exec("ROLLBACK");
        throw d1Error(failure);
      }
    },

    async exec(query: string): Promise<D1ExecResult> {
      const started = performance.now();
      try {
        db.exec(query);
      } catch (failure) {
        throw d1Error(failure);
      }
      onWrite();
      return { count: query.split(";").filter((part) => part.trim()).length, duration: performance.now() - started };
    },

    withSession() {
      return { prepare: adapter.prepare, batch: adapter.batch, getBookmark: () => null };
    },

    async dump(): Promise<ArrayBuffer> {
      return db.export().slice().buffer;
    },
  };

  return adapter as unknown as D1Database;
}

type Statement = D1PreparedStatement & {
  execute<T>(): D1Result<T>;
};

function statement(db: Database, query: string, values: SqlValue[], onWrite: OnWrite): Statement {
  /** Runs the statement and reads every row, as objects. */
  function execute<T>(): D1Result<T> {
    const started = performance.now();
    const results: T[] = [];
    const prepared = db.prepare(query);
    try {
      prepared.bind(values);
      while (prepared.step()) results.push(prepared.getAsObject() as T);
    } finally {
      prepared.free();
    }

    const changes = db.getRowsModified();
    const lastRowId = Number(db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] ?? 0);
    return {
      success: true,
      results,
      meta: {
        duration: performance.now() - started,
        size_after: 0,
        rows_read: results.length,
        rows_written: writes(query) ? changes : 0,
        last_row_id: lastRowId,
        changed_db: writes(query) && changes > 0,
        changes: writes(query) ? changes : 0,
      },
    };
  }

  /** Runs the statement outside a batch, and saves when it may have written. */
  function single<T>(): D1Result<T> {
    let result: D1Result<T>;
    try {
      result = execute<T>();
    } catch (failure) {
      throw d1Error(failure);
    }
    if (writes(query)) onWrite();
    return result;
  }

  function rows(): { columns: string[]; values: unknown[][] } {
    const prepared = db.prepare(query);
    try {
      prepared.bind(values);
      const found: unknown[][] = [];
      while (prepared.step()) found.push(prepared.get());
      return { columns: prepared.getColumnNames(), values: found };
    } catch (failure) {
      throw d1Error(failure);
    } finally {
      prepared.free();
      if (writes(query)) onWrite();
    }
  }

  return {
    execute,

    bind(...bound: unknown[]) {
      return statement(db, query, bound.map(sqlValue), onWrite);
    },

    async first<T>(column?: string): Promise<T | null> {
      const [row] = single<Record<string, unknown>>().results;
      if (!row) return null;
      if (column === undefined) return row as T;
      if (!(column in row)) throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${column})`);
      return row[column] as T;
    },

    async all<T>() {
      return single<T>();
    },

    async run<T>() {
      return single<T>();
    },

    async raw(options?: { columnNames?: boolean }) {
      const { columns, values: found } = rows();
      return options?.columnNames ? [columns, ...found] : found;
    },
  } as unknown as Statement;
}

/**
 * True unless the statement only reads. It decides when the database is saved,
 * so a doubtful statement counts as a write: saving too often costs a little,
 * and saving too seldom loses a person's work.
 */
function writes(query: string): boolean {
  return !/^\s*(select|pragma\s+\w+\s*$)/i.test(query) || /\breturning\b/i.test(query);
}

/** One bound value, converted as D1 converts it, or refused as D1 refuses it. */
function sqlValue(value: unknown): SqlValue {
  if (value === null || typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  throw new Error(`D1_TYPE_ERROR: Type '${typeof value}' not supported for value '${String(value)}'`);
}

/** sql.js errors carry SQLite's own message, which D1 wraps in this prefix. */
function d1Error(failure: unknown): Error {
  if (failure instanceof Error && !failure.message.startsWith("D1_")) {
    return new Error(`D1_ERROR: ${failure.message}`, { cause: failure });
  }
  return failure as Error;
}
