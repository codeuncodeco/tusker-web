import type { Status } from "./board";
import { between } from "./order";

export type Task = {
  id: string;
  org_id: string;
  title: string;
  status: Status;
  position: number;
  due_date: string | null;
  archived: number;
  created_at: string;
};

/** The fields a card needs. `description`, `assignees` and `data` wait for the task page. */
const CARD_FIELDS = "id, org_id, title, status, position, due_date, archived, created_at";

/** The order of a column, everywhere it is read. */
const IN_ORDER = "ORDER BY position, created_at, id";

/** A card in a column, cut down to what the order maths reads. */
type Positioned = { id: string; position: number };

/** One org's live tasks, in column order. */
export async function listTasks(db: D1Database, orgId: string): Promise<Task[]> {
  const { results } = await db
    .prepare(`SELECT ${CARD_FIELDS} FROM tasks WHERE org_id = ? AND archived = 0 ${IN_ORDER}`)
    .bind(orgId)
    .all<Task>();
  return results;
}

/**
 * Adds a task at the top of its column, where a person looks for the one they
 * just typed. The caller has already checked that the person is a member of
 * the org, because `org_id` is the only fence.
 */
export async function createTask(
  db: D1Database,
  task: { orgId: string; title: string; status: Status },
): Promise<Task> {
  const id = crypto.randomUUID();
  const column = await columnPlaces(db, task.orgId, task.status);
  const position = await placeAbove(db, task.orgId, task.status, column, column[0]?.id ?? null);

  await db
    .prepare("INSERT INTO tasks (id, org_id, title, status, position) VALUES (?, ?, ?, ?, ?)")
    .bind(id, task.orgId, task.title, task.status, position)
    .run();

  const made = await db.prepare(`SELECT ${CARD_FIELDS} FROM tasks WHERE id = ?`).bind(id).first<Task>();
  if (!made) throw new Error("The task disappeared right after the insert.");
  return made;
}

/**
 * Moves a task, inside its column or into another one. `before` names the card
 * the task lands above; without it the task lands at the bottom.
 *
 * The move writes one row: the new position is the midpoint of its neighbours,
 * so no other card is renumbered. The `org_id` in the WHERE clause is what
 * stops one org from writing to another org's row.
 *
 * Returns false when no row matched, so the route can answer 404.
 */
export async function moveTask(
  db: D1Database,
  move: { orgId: string; taskId: string; status: Status; before?: string | null },
): Promise<boolean> {
  // The card leaves its old place, so it is no neighbour of its new one.
  const column = (await columnPlaces(db, move.orgId, move.status)).filter((one) => one.id !== move.taskId);
  const position = await placeAbove(db, move.orgId, move.status, column, move.before ?? null);

  const done = await db
    .prepare(
      `UPDATE tasks
       SET status = ?, position = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND org_id = ?`,
    )
    .bind(move.status, position, move.taskId, move.orgId)
    .run();

  return done.meta.changes > 0;
}

/** The live cards of one column, in the order the board draws them. */
async function columnPlaces(db: D1Database, orgId: string, status: Status): Promise<Positioned[]> {
  const { results } = await db
    .prepare(`SELECT id, position FROM tasks WHERE org_id = ? AND status = ? AND archived = 0 ${IN_ORDER}`)
    .bind(orgId, status)
    .all<Positioned>();
  return results;
}

/**
 * The position a card takes when it lands above `beforeId`, or at the bottom
 * when that is null.
 *
 * A column can run out of fractions after many drops into the same gap. The
 * column is then renumbered whole and the maths asked again, which is the one
 * time a drop touches another row.
 */
async function placeAbove(
  db: D1Database,
  orgId: string,
  status: Status,
  column: Positioned[],
  beforeId: string | null,
): Promise<number> {
  const found = beforeId === null ? -1 : column.findIndex((one) => one.id === beforeId);
  // A card the column no longer holds names the bottom, as no neighbour does.
  const at = found === -1 ? column.length : found;

  const position = gap(column, at);
  if (position !== null) return position;

  const spread = await renumber(db, orgId, column);
  // Whole numbers always leave room, so this second try answers.
  return gap(spread, at)!;
}

/** The position between the cards on each side of one place in a column. */
function gap(column: Positioned[], at: number): number | null {
  return between(column[at - 1]?.position ?? null, column[at]?.position ?? null);
}

/** Writes 1, 2, 3 … over a column that has no room left between two cards. */
async function renumber(db: D1Database, orgId: string, column: Positioned[]): Promise<Positioned[]> {
  const spread = column.map((one, index) => ({ id: one.id, position: index + 1 }));

  await db.batch(
    spread.map((one) =>
      db.prepare("UPDATE tasks SET position = ? WHERE id = ? AND org_id = ?").bind(one.position, one.id, orgId),
    ),
  );

  return spread;
}
