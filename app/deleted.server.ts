/**
 * The clause that leaves a deleted task out of a query.
 *
 * A delete keeps the row and marks it, so every read of `tasks`, and every
 * write an act aims at one task, carries this clause: a deleted task is on no
 * page, and no act can reach it. A write over a whole org's rows, as a field
 * that drops an option, does not need it.
 * It sits in a file of its own because every module that reads `tasks` needs
 * it. See ADR-0031.
 *
 * Name the table when the query joins one, and the clause names its column.
 */
export function notDeleted(table?: string): string {
  return `${table ? `${table}.` : ""}deleted_at IS NULL`;
}
