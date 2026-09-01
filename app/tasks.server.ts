import { isStatus, STATUSES, type Status } from "./board";
import { isDay } from "./day";
import { tickBox } from "./description";
import { listFields } from "./fields.server";
import { between } from "./order";
import type { ReadScope, Scope } from "./scope.server";

export type Task = {
  id: string;
  org_id: string;
  title: string;
  status: Status;
  position: number;
  due_date: string | null;
  archived: number;
  /** 1 when a person marked the task as one that holds a decision. */
  decides: number;
  /** The raw markdown a person typed. The page renders it; the column holds text. */
  description: string;
  /** The custom field values, keyed by the key the org declared. */
  data: Record<string, string>;
  created_at: string;
};

/** The row as the table holds it: `data` as the JSON text of the column. */
type Row = Omit<Task, "data"> & { data: string };

/**
 * The columns a card and the task editor read.
 *
 * The description is here for the task page. A card does not draw it: the board
 * cuts each row down to a card before the payload leaves the server. The
 * assignees are not here at all: they hold a table of their own.
 */
const CARD_FIELDS =
  "id, org_id, title, status, position, due_date, archived, decides, description, data, created_at";

/** The order of a column, everywhere it is read. */
const IN_ORDER = "ORDER BY position, created_at, id";

/** A card in a column, cut down to what the order maths reads. */
type Positioned = { id: string; position: number };

/** One org's live tasks, in column order. */
export async function listTasks(db: D1Database, scope: Scope): Promise<Task[]> {
  const { results } = await db
    .prepare(`SELECT ${CARD_FIELDS} FROM tasks WHERE org_id = ? AND archived = 0 ${IN_ORDER}`)
    .bind(scope.org.id)
    .all<Row>();
  return results.map(asTask);
}

/** One task of the org, or null when the org holds no such row. */
export async function readTask(db: D1Database, scope: Scope, taskId: string): Promise<Task | null> {
  const row = await db
    .prepare(`SELECT ${CARD_FIELDS} FROM tasks WHERE id = ? AND org_id = ?`)
    .bind(taskId, scope.org.id)
    .first<Row>();
  return row ? asTask(row) : null;
}

/**
 * Writes a task the editor changed: the title, the due date, the mark that
 * says the task holds a decision, and the whole custom field data. The caller
 * built `data` from the org's declarations, so a key another org declared
 * never reaches the column.
 *
 * The status is not here. Moving a task is one act with its own rules — a
 * place in a column, and the decision prompt a finish raises — so the editor
 * calls `moveTask` for it. See ADR-0010.
 *
 * Returns false when no row matched, so the route can answer 404.
 */
export async function saveTask(
  db: D1Database,
  scope: Scope,
  taskId: string,
  save: {
    title: string;
    data: Record<string, string>;
    decides: boolean;
    /** The day the work is due, or null for a task with no date. */
    dueDate: string | null;
  },
): Promise<boolean> {
  const done = await db
    .prepare(
      `UPDATE tasks
       SET title = ?, data = ?, decides = ?, due_date = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND org_id = ?`,
    )
    .bind(
      save.title,
      JSON.stringify(save.data),
      save.decides ? 1 : 0,
      save.dueDate,
      taskId,
      scope.org.id,
    )
    .run();

  return done.meta.changes > 0;
}

/**
 * Flips the Nth checkbox of one task's description and writes the whole text
 * back.
 *
 * The box carries a number, not the new text, so a tick can never overwrite a
 * description a person edited in another tab with a stale copy of it: the read
 * and the write sit in this one function, and the read goes through the scope
 * as every other read does.
 *
 * Returns false when the number is no box at all, when the org holds no such
 * task, or when the description holds no such box, so the route can answer 404.
 * All three mean the same thing to the page: the box that was ticked is not
 * there.
 */
export async function tickDescriptionBox(
  db: D1Database,
  scope: Scope,
  taskId: string,
  box: number,
): Promise<boolean> {
  if (!Number.isInteger(box) || box < 0) return false;

  const task = await readTask(db, scope, taskId);
  if (!task) return false;

  const ticked = tickBox(task.description, box);
  if (ticked === null) return false;

  const done = await db
    .prepare(
      `UPDATE tasks
       SET description = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND org_id = ?`,
    )
    .bind(ticked, taskId, scope.org.id)
    .run();

  return done.meta.changes > 0;
}

/**
 * The due date a form names, or the reason it names none: an empty box is a
 * task with no date, and a date no calendar holds is an error rather than a
 * silent null.
 */
export function readDueDate(form: FormData): { dueDate: string | null } | { error: string } {
  const text = String(form.get("due_date") ?? "").trim();
  if (!text) return { dueDate: null };
  if (!isDay(text)) return { error: "A due date is a date, as 2026-08-31." };
  return { dueDate: text };
}

/** The row as every screen reads it, with the JSON column parsed. */
function asTask<T extends { data: string }>(row: T): Omit<T, "data"> & { data: Record<string, string> } {
  return { ...row, data: JSON.parse(row.data) as Record<string, string> };
}

/**
 * The title and the mark a quick-add box posts, or the reason it makes no
 * task. Both boxes read a form the same way, so the two say the same thing to
 * a person who presses Enter on an empty one.
 */
export function newTaskFrom(form: FormData): { title: string; decides: boolean } | { error: string } {
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "A task needs a title." };
  // The mark goes on when the task is made, while the thought is there. It is
  // off by default, so an unticked box is a task that decides nothing.
  return { title, decides: form.get("decides") === "1" };
}

/**
 * Adds a task at the top of its column, where a person looks for the one they
 * just typed. The scope carries the org id, so the membership check is already
 * done: `org_id` is the only fence.
 */
export async function createTask(
  db: D1Database,
  scope: Scope,
  task: { title: string; status: Status; decides: boolean },
): Promise<Task> {
  const id = crypto.randomUUID();
  const orgId = scope.org.id;
  const column = await columnPlaces(db, orgId, task.status);
  const position = await placeAbove(db, orgId, task.status, column, column[0]?.id ?? null);

  await db
    .prepare(
      "INSERT INTO tasks (id, org_id, title, status, position, decides) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, orgId, task.title, task.status, position, task.decides ? 1 : 0)
    .run();

  const made = await db.prepare(`SELECT ${CARD_FIELDS} FROM tasks WHERE id = ?`).bind(id).first<Row>();
  if (!made) throw new Error("The task disappeared right after the insert.");
  return asTask(made);
}

/**
 * Deletes one task of the org, row and all.
 *
 * It is the only delete Tusker has: the undo of a quick add, on a row made
 * seconds ago. Archiving instead would leave a real row in a team org that
 * never wanted it, which is the failure ADR-0012 sets out to prevent.
 *
 * A decision the task produced stays, with its link cleared, because a
 * decision outlives the task.
 *
 * Returns false when no row matched, so the route can answer 404.
 */
export async function deleteTask(
  db: D1Database,
  scope: Scope,
  taskId: string,
): Promise<boolean> {
  const done = await db
    .prepare("DELETE FROM tasks WHERE id = ? AND org_id = ?")
    .bind(taskId, scope.org.id)
    .run();
  return done.meta.changes > 0;
}

/** What a move did: whether a row moved, and whether the move finished it. */
export type Moved = {
  moved: boolean;
  /** True when the move landed in Done and the task was not there before. */
  finished: boolean;
};

/**
 * Moves a task, inside its column or into another one. `before` names the card
 * the task lands above; without it the task lands at the bottom.
 *
 * The move writes one row: the new position is the midpoint of its neighbours,
 * so no other card is renumbered. The `org_id` in the WHERE clause is what
 * stops one org from writing to another org's row.
 *
 * A move into Done is a task finished, which is when Tusker may ask for the
 * decision. This function only reports that the move finished the task. Who is
 * asked is the mark's business, not the move's. See ADR-0010.
 *
 * `moved` is false when no row matched, so the route can answer 404.
 */
export async function moveTask(
  db: D1Database,
  scope: Scope,
  move: { taskId: string; status: Status; before?: string | null },
): Promise<Moved> {
  const orgId = scope.org.id;
  const was = await db
    .prepare("SELECT status FROM tasks WHERE id = ? AND org_id = ?")
    .bind(move.taskId, orgId)
    .first<{ status: Status }>();
  if (!was) return { moved: false, finished: false };

  const finished = move.status === "done" && was.status !== "done";

  // The card leaves its old place, so it is no neighbour of its new one.
  const column = (await columnPlaces(db, orgId, move.status)).filter((one) => one.id !== move.taskId);
  const position = await placeAbove(db, orgId, move.status, column, move.before ?? null);

  const done = await db
    .prepare(
      `UPDATE tasks
       SET status = ?, position = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND org_id = ?`,
    )
    .bind(move.status, position, move.taskId, orgId)
    .run();

  return { moved: done.meta.changes > 0, finished };
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

/**
 * A task as the read API answers it. An org app draws a screen from this, so
 * it carries the description and the times the board does not read.
 *
 * A reference value stays the external id the task holds. The org app minted
 * that id, so it names the record better than Tusker's cached label does.
 */
export type ApiTask = Omit<Task, "org_id" | "archived"> & { updated_at: string };

/** The columns the read API answers with. */
const API_COLUMNS =
  "id, title, description, status, position, due_date, data, created_at, updated_at";

/**
 * The board's columns, in board order, as SQL. A task's status decides its
 * group, and the position orders it inside that group: a position is a place
 * in one column, so a list of two columns is meaningless without this.
 */
const IN_COLUMN_ORDER = `ORDER BY CASE status
  ${STATUSES.map((status, at) => `WHEN '${status}' THEN ${at}`).join("\n  ")}
  END, position, created_at, id`;

/** What a read of the API narrows to: nothing, or both of these. */
export type TaskFilter = {
  /** The statuses to answer. Empty means every status. */
  statuses: Status[];
  /** The custom field values a task must hold, all of them. */
  fields: { key: string; value: string }[];
};

/** The name a custom field filter carries, ahead of the key it narrows by. */
const FIELD_QUERY = "field.";

/**
 * What a query of the read API narrows to, or the reason it narrows to nothing
 * a task could match.
 *
 * A status Tusker does not draw, a field the org does not declare and a filter
 * with no value are all reasons rather than empty answers, because each one is
 * a caller typing a name wrong, and an empty list reads as "no work" instead.
 */
export async function readTaskFilter(
  db: D1Database,
  scope: ReadScope,
  query: URLSearchParams,
): Promise<TaskFilter | { error: string }> {
  const statuses: Status[] = [];
  for (const value of query.getAll("status")) {
    if (!isStatus(value)) {
      return { error: `No status is called ${value}. They are ${STATUSES.join(", ")}.` };
    }
    statuses.push(value);
  }

  const asked = [...query.keys()].filter((name) => name.startsWith(FIELD_QUERY));
  if (asked.length === 0) return { statuses, fields: [] };

  const declared = new Set((await listFields(db, scope)).map((field) => field.key));
  const fields = [];
  for (const name of asked) {
    const key = name.slice(FIELD_QUERY.length);
    if (!declared.has(key)) return { error: `${scope.org.name} declares no field called ${key}.` };

    const value = query.get(name) ?? "";
    if (!value) return { error: `${name} needs the value to narrow by.` };
    fields.push({ key, value });
  }

  return { statuses, fields };
}

/**
 * One org's live tasks for the read API, in board order.
 *
 * The scope carries the org id and nothing else can reach this query, so a key
 * for one org cannot name another org's rows.
 *
 * Archived tasks stay out, as they do on the board. An org app draws work in
 * hand, and Done is a status, not the archive.
 *
 * The whole list answers at once. One org's live tasks are hundreds of rows,
 * as they are for the unified view, so there is no page and no limit.
 */
export async function filterTasks(
  db: D1Database,
  scope: ReadScope,
  filter: TaskFilter,
): Promise<ApiTask[]> {
  const where = ["org_id = ?", "archived = 0"];
  const values: unknown[] = [scope.org.id];

  if (filter.statuses.length > 0) {
    where.push(`status IN (${filter.statuses.map(() => "?").join(", ")})`);
    values.push(...filter.statuses);
  }

  // The key is bound, not written into the SQL, so a field key is a value here
  // as it is everywhere else.
  for (const field of filter.fields) {
    where.push("json_extract(data, '$.' || ?) = ?");
    values.push(field.key, field.value);
  }

  const { results } = await db
    .prepare(`SELECT ${API_COLUMNS} FROM tasks WHERE ${where.join(" AND ")} ${IN_COLUMN_ORDER}`)
    .bind(...values)
    .all<Omit<ApiTask, "data"> & { data: string }>();

  return results.map(asTask);
}
