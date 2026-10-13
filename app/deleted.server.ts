/**
 * The clause that leaves a deleted task out of a query.
 *
 * A delete keeps the row and marks it, so every read and write of `tasks`
 * carries this clause: a deleted task is on no page, and no act can reach it.
 * It sits in a file of its own because every module that reads `tasks` needs
 * it. See ADR-0031.
 *
 * Name the table when the query joins one, and the clause names its column.
 */
export function notDeleted(table?: string): string {
  return `${table ? `${table}.` : ""}deleted_at IS NULL`;
}
