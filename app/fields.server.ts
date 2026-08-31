import type { FieldType, OrgField } from "./fields";
import type { ReadScope, Scope } from "./scope.server";

/** The row as the table holds it: options as JSON, the flags as 0 or 1. */
type Row = {
  key: string;
  label: string;
  type: FieldType;
  options: string;
  source_url: string;
  refs_pulled_at: string | null;
  has_refs_key: number;
  show_on_card: number;
  filterable: number;
  position: number;
};

/**
 * The columns a screen reads. `refs_key` is not one of them: it is read as the
 * flag `has_refs_key` instead, so a loader that hands a field to the browser
 * cannot carry the key with it. `refs.server.ts` reads the key itself, and
 * sends it to the org app rather than to a screen.
 */
const COLUMNS = `key, label, type, options, source_url, refs_pulled_at,
  refs_key <> '' AS has_refs_key, show_on_card, filterable, position`;

/** The order every screen draws the fields in. */
const IN_ORDER = "ORDER BY position, key";

/** What a declaration a person asks for holds, before it takes a place. */
export type Declaration = {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  /** Where a reference field reads its options from. Empty for the others. */
  source_url: string;
  /** The key the org app minted for that URL. Empty for the other types. */
  refs_key: string;
  show_on_card: boolean;
  filterable: boolean;
};

/** What became of an attempt to declare a field. */
export type Declared = "declared" | "taken";

/**
 * One org's declared fields. The scope carries the org id, so a field one org
 * declares is unreachable from another one.
 */
export async function listFields(db: D1Database, scope: ReadScope): Promise<OrgField[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM org_fields WHERE org_id = ? ${IN_ORDER}`)
    .bind(scope.org.id)
    .all<Row>();
  return results.map(asField);
}

/**
 * Declares a field, at the end of the org's list. The key is the name the JSON
 * value hides behind, so it is written once and never changed: an edit that
 * moved it would leave every value behind.
 *
 * Answers "taken" when the org already declares that key.
 */
export async function declareField(
  db: D1Database,
  scope: Scope,
  field: Declaration,
): Promise<Declared> {
  const last = await db
    .prepare("SELECT max(position) AS last FROM org_fields WHERE org_id = ?")
    .bind(scope.org.id)
    .first<{ last: number | null }>();

  try {
    await db
      .prepare(
        `INSERT INTO org_fields
           (org_id, key, label, type, options, source_url, refs_key, show_on_card, filterable, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        scope.org.id,
        field.key,
        field.label,
        field.type,
        JSON.stringify(field.options),
        field.source_url,
        field.refs_key,
        Number(field.show_on_card),
        Number(field.filterable),
        (last?.last ?? 0) + 1,
      )
      .run();
  } catch (failure) {
    if (failure instanceof Error && failure.message.includes("UNIQUE constraint failed")) return "taken";
    throw failure;
  }

  return "declared";
}

/**
 * What an edit can change. The key and the type stay as declared.
 *
 * `refs_key` is write-only: an empty one keeps the key the field already
 * holds, because no screen can show a person the value to type back.
 */
export type Change = Omit<Declaration, "key" | "type">;

/** One declared field of the org, or null when the org declares no such key. */
export async function readField(
  db: D1Database,
  scope: Scope,
  key: string,
): Promise<OrgField | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM org_fields WHERE org_id = ? AND key = ?`)
    .bind(scope.org.id, key)
    .first<Row>();
  return row ? asField(row) : null;
}

/**
 * Gives a declared field another label, options or flags.
 *
 * A select that loses an option loses it on the tasks as well, because a value
 * the field no longer declares is a value the editor cannot show or save.
 */
export async function editField(
  db: D1Database,
  scope: Scope,
  field: OrgField,
  change: Change,
): Promise<void> {
  await db
    .prepare(
      `UPDATE org_fields
       SET label = ?, options = ?, source_url = ?, show_on_card = ?, filterable = ?,
           refs_key = CASE WHEN ? = '' THEN refs_key ELSE ? END
       WHERE org_id = ? AND key = ?`,
    )
    .bind(
      change.label,
      JSON.stringify(change.options),
      change.source_url,
      Number(change.show_on_card),
      Number(change.filterable),
      change.refs_key,
      change.refs_key,
      scope.org.id,
      field.key,
    )
    .run();

  if (field.type === "select") await dropUndeclared(db, scope, field.key, change.options);
}

/**
 * Drops a declaration, and the value every task of the org held for it. A
 * value no field declares is a value no screen can show or clear, so it goes
 * with the declaration rather than staying in the JSON as litter.
 */
export async function removeField(db: D1Database, scope: Scope, key: string): Promise<boolean> {
  const [dropped] = await db.batch([
    db.prepare("DELETE FROM org_fields WHERE org_id = ? AND key = ?").bind(scope.org.id, key),
    db
      .prepare("UPDATE tasks SET data = json_remove(data, '$.' || ?) WHERE org_id = ?")
      .bind(key, scope.org.id),
  ]);

  return dropped.meta.changes > 0;
}

/**
 * The values the org's tasks hold for each of these fields. The colour screen
 * reads it, so a value the option cache does not name still takes a colour.
 */
export async function heldValues(
  db: D1Database,
  scope: Scope,
  keys: string[],
): Promise<Record<string, string[]>> {
  const held = await Promise.all(
    keys.map(async (key) => {
      const { results } = await db
        .prepare(
          `SELECT DISTINCT json_extract(data, '$.' || ?) AS value FROM tasks
           WHERE org_id = ? AND json_extract(data, '$.' || ?) IS NOT NULL`,
        )
        .bind(key, scope.org.id, key)
        .all<{ value: string }>();
      return [key, results.map((row) => row.value)] as const;
    }),
  );

  return Object.fromEntries(held);
}

/** Clears the value of every task that holds an option the select dropped. */
async function dropUndeclared(
  db: D1Database,
  scope: Scope,
  key: string,
  options: string[],
): Promise<void> {
  const holes = options.map(() => "?").join(", ");
  await db
    .prepare(
      `UPDATE tasks SET data = json_remove(data, '$.' || ?)
       WHERE org_id = ?
         AND json_extract(data, '$.' || ?) IS NOT NULL
         AND json_extract(data, '$.' || ?) NOT IN (${holes})`,
    )
    .bind(key, scope.org.id, key, key, ...options)
    .run();
}

/** The row as every screen reads it. */
function asField(row: Row): OrgField {
  return {
    key: row.key,
    label: row.label,
    type: row.type,
    options: JSON.parse(row.options) as string[],
    source_url: row.source_url,
    has_refs_key: row.has_refs_key === 1,
    refs_pulled_at: row.refs_pulled_at,
    show_on_card: row.show_on_card === 1,
    filterable: row.filterable === 1,
    position: row.position,
  };
}
