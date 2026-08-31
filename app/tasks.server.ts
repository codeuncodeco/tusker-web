import type { Status } from "./board";
import { between, seenBy, type Ranked } from "./order";
import type { Scope } from "./scope.server";

export type Task = {
  id: string;
  org_id: string;
  title: string;
  status: Status;
  position: number;
  due_date: string | null;
  archived: number;
  /** The custom field values, keyed by the key the org declared. */
  data: Record<string, string>;
  created_at: string;
  /** The number the reading person set for this task, or null for none. */
  rank: number | null;
};

/** The row as the table holds it: `data` as the JSON text of the column. */
type Row = Omit<Task, "data"> & { data: string };

/** The columns a card and the task editor read. `description` and `assignees` wait. */
const CARD_FIELDS =
  "tasks.id, tasks.org_id, tasks.title, tasks.status, tasks.position, tasks.due_date, tasks.archived, tasks.data, tasks.created_at";

/**
 * The reading person's ranks, hung on the tasks they belong to. Every read of
 * a task carries the rank, because the order a person sees is
 * `COALESCE(rank, position)` and the board draws a marker from the pair.
 */
const WITH_RANK = "LEFT JOIN task_ranks AS ranks ON ranks.task_id = tasks.id AND ranks.user_id = ?";

/**
 * The board's own order, everywhere a column is read. The order one person
 * sees comes from `seenBy`, over the column this order gives.
 */
const IN_ORDER = "ORDER BY tasks.position, tasks.created_at, tasks.id";

/** A card in a column, cut down to what the order maths reads. */
type Positioned = { id: string; position: number };

/** The write that gives one person one number for one task. */
const RANK_UPSERT =
  "INSERT INTO task_ranks (task_id, user_id, rank) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET rank = ?";

/** One org's live tasks, in column order. */
export async function listTasks(db: D1Database, scope: Scope): Promise<Task[]> {
  const { results } = await db
    .prepare(
      `SELECT ${CARD_FIELDS}, ranks.rank FROM tasks ${WITH_RANK}
       WHERE tasks.org_id = ? AND tasks.archived = 0 ${IN_ORDER}`,
    )
    .bind(scope.personId, scope.org.id)
    .all<Row>();
  return results.map(asTask);
}

/** One task of the org, or null when the org holds no such row. */
export async function readTask(db: D1Database, scope: Scope, taskId: string): Promise<Task | null> {
  const row = await db
    .prepare(`SELECT ${CARD_FIELDS}, ranks.rank FROM tasks ${WITH_RANK} WHERE tasks.id = ? AND tasks.org_id = ?`)
    .bind(scope.personId, taskId, scope.org.id)
    .first<Row>();
  return row ? asTask(row) : null;
}

/**
 * Writes a task the editor changed: the title, and the whole custom field
 * data. The caller built `data` from the org's declarations, so a key another
 * org declared never reaches the column.
 *
 * Returns false when no row matched, so the route can answer 404.
 */
export async function saveTask(
  db: D1Database,
  scope: Scope,
  taskId: string,
  save: { title: string; data: Record<string, string> },
): Promise<boolean> {
  const done = await db
    .prepare(
      `UPDATE tasks
       SET title = ?, data = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND org_id = ?`,
    )
    .bind(save.title, JSON.stringify(save.data), taskId, scope.org.id)
    .run();

  return done.meta.changes > 0;
}

/** The row as every screen reads it, with the JSON column parsed. */
function asTask(row: Row): Task {
  return { ...row, data: JSON.parse(row.data) as Record<string, string> };
}

/**
 * Adds a task at the top of its column, where a person looks for the one they
 * just typed. The scope carries the org id, so the membership check is already
 * done: `org_id` is the only fence.
 */
export async function createTask(
  db: D1Database,
  scope: Scope,
  task: { title: string; status: Status },
): Promise<Task> {
  const id = crypto.randomUUID();
  const orgId = scope.org.id;
  const column = await columnPlaces(db, orgId, task.status);
  const position = await placeAbove(column, column[0]?.id ?? null, (tight) => renumber(db, orgId, tight));

  await db
    .prepare("INSERT INTO tasks (id, org_id, title, status, position) VALUES (?, ?, ?, ?, ?)")
    .bind(id, orgId, task.title, task.status, position)
    .run();

  // A task nobody dragged yet carries no rank, for this person or any other.
  const made = await db
    .prepare(`SELECT ${CARD_FIELDS}, NULL AS rank FROM tasks WHERE id = ?`)
    .bind(id)
    .first<Row>();
  if (!made) throw new Error("The task disappeared right after the insert.");
  return asTask(made);
}

/** What a drag asks for: the card, its column, and the card it lands above. */
export type Move = { taskId: string; status: Status; before?: string | null };

/**
 * Moves a task on the board, inside its column or into another one, for every
 * member at once. `before` names the card the task lands above; without it the
 * task lands at the bottom.
 *
 * The move writes one row: the new position is the midpoint of its neighbours,
 * so no other card is renumbered. The `org_id` in the WHERE clause is what
 * stops one org from writing to another org's row.
 *
 * Every rank stays as it was. A rank is one person's, so a move by one member
 * never drops it: the cards that now differ from the board show a marker, and
 * that person's own reset is what clears them.
 *
 * Returns false when no row matched, so the route can answer 404.
 */
export async function moveTask(db: D1Database, scope: Scope, move: Move): Promise<boolean> {
  const orgId = scope.org.id;
  // The card leaves its old place, so it is no neighbour of its new one.
  const column = (await columnPlaces(db, orgId, move.status)).filter((one) => one.id !== move.taskId);
  const position = await placeAbove(column, move.before ?? null, (tight) => renumber(db, orgId, tight));

  const done = await db
    .prepare(
      `UPDATE tasks
       SET status = ?, position = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND org_id = ?`,
    )
    .bind(move.status, position, move.taskId, orgId)
    .run();

  return done.meta.changes > 0;
}

/**
 * Puts a card where one person wants it, and leaves the board alone. The drag
 * writes one `task_ranks` row for that person, in the same fraction space as
 * the shared position, so nobody else's board moves.
 *
 * The neighbours come from the order that person sees, not from the board, so
 * a rank lands between the cards they are looking at.
 *
 * Returns false when the org holds no such task, so the route can answer 404.
 */
export async function rankTask(db: D1Database, scope: Scope, move: Move): Promise<boolean> {
  const here = await db
    .prepare("SELECT id FROM tasks WHERE id = ? AND org_id = ? AND status = ? AND archived = 0")
    .bind(move.taskId, scope.org.id, move.status)
    .first<{ id: string }>();
  if (!here) return false;

  const column = (await placesAsSeen(db, scope, move.status)).filter((one) => one.id !== move.taskId);
  const rank = await placeAbove(column, move.before ?? null, (tight) => renumberRanks(db, scope, tight));

  await db.prepare(RANK_UPSERT).bind(move.taskId, scope.personId, rank, rank).run();

  return true;
}

/**
 * Drops every rank one person set in one column, so that column reads as the
 * board holds it again. The ranks of the other members stay where they are.
 */
export async function clearRanks(db: D1Database, scope: Scope, status: Status): Promise<void> {
  await db
    .prepare(
      `DELETE FROM task_ranks
       WHERE user_id = ?
         AND task_id IN (SELECT id FROM tasks WHERE org_id = ? AND status = ?)`,
    )
    .bind(scope.personId, scope.org.id, status)
    .run();
}

/** The live cards of one column, in the order the board draws them. */
async function columnPlaces(db: D1Database, orgId: string, status: Status): Promise<Positioned[]> {
  const { results } = await db
    .prepare(
      `SELECT tasks.id, tasks.position FROM tasks
       WHERE tasks.org_id = ? AND tasks.status = ? AND tasks.archived = 0 ${IN_ORDER}`,
    )
    .bind(orgId, status)
    .all<Positioned>();
  return results;
}

/**
 * The live cards of one column, in the order one person sees, each carrying
 * the number their next drop is measured against: their rank where they set
 * one, the shared position everywhere else.
 *
 * The table gives the board's order and `seenBy` turns it into theirs, so the
 * order they read and the order a drop lands in come from one rule.
 */
async function placesAsSeen(db: D1Database, scope: Scope, status: Status): Promise<Positioned[]> {
  const { results } = await db
    .prepare(
      `SELECT tasks.id, tasks.position, ranks.rank FROM tasks ${WITH_RANK}
       WHERE tasks.org_id = ? AND tasks.status = ? AND tasks.archived = 0 ${IN_ORDER}`,
    )
    .bind(scope.personId, scope.org.id, status)
    .all<Ranked>();
  return seenBy(results).map((one) => ({ id: one.id, position: one.rank ?? one.position }));
}

/**
 * The number a card takes when it lands above `beforeId`, or at the bottom
 * when that is null. The same maths serves the board's position and one
 * person's rank, because both are fractions over the same column.
 *
 * A column can run out of fractions after many drops into the same gap.
 * `spread` then renumbers the column whole and the maths is asked again, which
 * is the one time a drop touches another row.
 */
async function placeAbove(
  column: Positioned[],
  beforeId: string | null,
  spread: (column: Positioned[]) => Promise<Positioned[]>,
): Promise<number> {
  const found = beforeId === null ? -1 : column.findIndex((one) => one.id === beforeId);
  // A card the column no longer holds names the bottom, as no neighbour does.
  const at = found === -1 ? column.length : found;

  const position = gap(column, at);
  if (position !== null) return position;

  // Whole numbers always leave room, so this second try answers.
  return gap(await spread(column), at)!;
}

/** The position between the cards on each side of one place in a column. */
function gap(column: Positioned[], at: number): number | null {
  return between(column[at - 1]?.position ?? null, column[at]?.position ?? null);
}

/**
 * Writes 1, 2, 3 … over a column that has no room left between two cards, and
 * gives back the column it wrote. `write` says where the numbers land: the
 * shared position, or one person's ranks.
 */
async function spreadOut(
  db: D1Database,
  column: Positioned[],
  write: (card: Positioned) => D1PreparedStatement,
): Promise<Positioned[]> {
  const spread = column.map((one, index) => ({ id: one.id, position: index + 1 }));
  await db.batch(spread.map(write));
  return spread;
}

/** Spreads the board's own order, which every member reads. */
function renumber(db: D1Database, orgId: string, column: Positioned[]): Promise<Positioned[]> {
  return spreadOut(db, column, (card) =>
    db.prepare("UPDATE tasks SET position = ? WHERE id = ? AND org_id = ?").bind(card.position, card.id, orgId),
  );
}

/**
 * Spreads one person's reading of a column that has no room left between two
 * cards. Every card of the column then carries a rank of that person's, so the
 * column keeps the shape they see whatever the board does next. This is the
 * one time a rank lands on a card they never dragged, and their per-column
 * reset drops the lot.
 */
function renumberRanks(db: D1Database, scope: Scope, column: Positioned[]): Promise<Positioned[]> {
  return spreadOut(db, column, (card) =>
    db.prepare(RANK_UPSERT).bind(card.id, scope.personId, card.position, card.position),
  );
}
