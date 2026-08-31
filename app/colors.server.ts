import { type OptionColors } from "./colors";
import type { Scope } from "./scope.server";

/**
 * The option colours of an org, as the manage screen writes them and every
 * card reads them.
 *
 * A colour is keyed by the value a task stores, not by a cached option, so a
 * pull that drops the option leaves the colour where it is. See ADR-0006.
 */

/**
 * Every option colour of the org, as `field key → stored value → colour`. One
 * query covers the whole board, so a column of cards costs no more reads than
 * a single card.
 */
export async function listColors(db: D1Database, scope: Scope): Promise<OptionColors> {
  const { results } = await db
    .prepare("SELECT field_key, value, color FROM org_field_colors WHERE org_id = ?")
    .bind(scope.org.id)
    .all<{ field_key: string; value: string; color: string }>();

  const colors: OptionColors = {};
  for (const row of results) {
    (colors[row.field_key] ??= {})[row.value] = row.color;
  }
  return colors;
}

/**
 * Gives the values of one field the colours a person chose. A value the map
 * holds as null loses its colour and draws plain.
 *
 * The caller has read the field through the scope, so a key another org
 * declares cannot be coloured from here.
 */
export async function setColors(
  db: D1Database,
  scope: Scope,
  fieldKey: string,
  colors: Record<string, string | null>,
): Promise<void> {
  const entries = Object.entries(colors);
  const cleared = entries.filter(([, color]) => color === null).map(([value]) => value);
  const set = entries.filter((entry): entry is [string, string] => entry[1] !== null);

  const writes: D1PreparedStatement[] = [];

  // Every empty box clears in one statement, so a form of many boxes and few
  // colours costs one write, not one per box.
  if (cleared.length > 0) {
    const holes = cleared.map(() => "?").join(", ");
    writes.push(
      db
        .prepare(
          `DELETE FROM org_field_colors
           WHERE org_id = ? AND field_key = ? AND value IN (${holes})`,
        )
        .bind(scope.org.id, fieldKey, ...cleared),
    );
  }

  for (const [value, color] of set) {
    writes.push(
      db
        .prepare(
          `INSERT INTO org_field_colors (org_id, field_key, value, color) VALUES (?, ?, ?, ?)
           ON CONFLICT (org_id, field_key, value) DO UPDATE SET color = excluded.color`,
        )
        .bind(scope.org.id, fieldKey, value, color),
    );
  }

  if (writes.length > 0) await db.batch(writes);
}
