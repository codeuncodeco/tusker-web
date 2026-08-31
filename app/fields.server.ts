import type { FieldType, OrgField } from "./fields";
import type { Scope } from "./scope.server";

/** The row as the table holds it: options as JSON, the flags as 0 or 1. */
type Row = {
  key: string;
  label: string;
  type: FieldType;
  options: string;
  show_on_card: number;
  filterable: number;
  position: number;
};

const COLUMNS = "key, label, type, options, show_on_card, filterable, position";

/** The order every screen draws the fields in. */
const IN_ORDER = "ORDER BY position, key";

/** What a declaration a person asks for holds, before it takes a place. */
export type Declaration = {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  show_on_card: boolean;
  filterable: boolean;
};

/** What became of an attempt to declare a field. */
export type Declared = "declared" | "taken";

/**
 * One org's declared fields. The scope carries the org id, so a field one org
 * declares is unreachable from another one.
 */
export async function listFields(db: D1Database, scope: Scope): Promise<OrgField[]> {
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
        `INSERT INTO org_fields (org_id, key, label, type, options, show_on_card, filterable, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        scope.org.id,
        field.key,
        field.label,
        field.type,
        JSON.stringify(field.options),
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

/** What an edit can change. The key and the type stay as declared. */
export type Change = {
  label: string;
  options: string[];
  show_on_card: boolean;
  filterable: boolean;
};

/** Gives a declared field another label, options or flags. False when the org holds no such field. */
export async function editField(
  db: D1Database,
  scope: Scope,
  key: string,
  change: Change,
): Promise<boolean> {
  const done = await db
    .prepare(
      `UPDATE org_fields SET label = ?, options = ?, show_on_card = ?, filterable = ?
       WHERE org_id = ? AND key = ?`,
    )
    .bind(
      change.label,
      JSON.stringify(change.options),
      Number(change.show_on_card),
      Number(change.filterable),
      scope.org.id,
      key,
    )
    .run();

  return done.meta.changes > 0;
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

/** The row as every screen reads it. */
function asField(row: Row): OrgField {
  return {
    key: row.key,
    label: row.label,
    type: row.type,
    options: JSON.parse(row.options) as string[],
    show_on_card: row.show_on_card === 1,
    filterable: row.filterable === 1,
    position: row.position,
  };
}
