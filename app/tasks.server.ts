import { isFinished, isStatus, STATUSES, type Status } from "./board";
import { isDay } from "./day";
import { tickBox } from "./description";
import { listFields } from "./fields.server";
import { between, placesAbove } from "./order";
import type { ReadScope, Scope } from "./scope.server";
import { MAX_TITLES, titlesIn } from "./titles";

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
  /** When the work was over, or null while the task is not finished. */
  finished_at: string | null;
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
  "id, org_id, title, status, position, due_date, archived, decides, description, data, created_at, finished_at";

/** The order of a column, everywhere it is read. */
const IN_ORDER = "ORDER BY position, created_at, id";

/**
 * The time a write stamps into `updated_at` and, when the task is finished,
 * into `finished_at`.
 */
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

/**
 * What a move writes into `finished_at`.
 *
 * Entering Done or Cancelled stamps the time, and leaving them clears it. A
 * task that moves from one of the two to the other keeps the first stamp,
 * because the work was over then: the pair is one finished set, and a reorder
 * inside a column is no new finish either.
 */
const finishedAtSql = (status: Status) =>
  isFinished(status) ? `COALESCE(finished_at, ${NOW})` : "NULL";

/** A card in a column, cut down to what the order maths reads. */
type Positioned = { id: string; position: number };

/** The character the search clause names as its escape. */
const LIKE_ESCAPE = "\\";

/**
 * The SQL that keeps a task holding the text, and the values to bind to it.
 *
 * The clause and its pattern are made together, because the escaping is one
 * rule: a `%`, a `_` or a `\` is a character a person typed and means to find,
 * so each one is escaped here and the clause names the escape.
 *
 * The two columns are read apart, not joined, so a match is a match in the
 * title or in the description and never across the seam between them.
 */
export function holdsText(text: string): { sql: string; values: string[] } {
  const pattern = `%${text.replace(/[\\%_]/g, (one) => LIKE_ESCAPE + one)}%`;
  const like = `LIKE ? ESCAPE '${LIKE_ESCAPE}'`;
  return { sql: `(title ${like} OR description ${like})`, values: [pattern, pattern] };
}

/**
 * One org's live tasks, in column order, narrowed to the ones holding the
 * search text. An empty search narrows nothing.
 *
 * The match runs here rather than over the answer, because the rows are D1's
 * and the query is the place to cut them. A `LIKE` over the two columns is
 * enough for one org's tasks. FTS5 is the answer when a board is big enough to
 * feel it, and no board is yet.
 *
 * The match is case-insensitive for ASCII, which is what `LIKE` gives without
 * ICU.
 */
export async function listTasks(db: D1Database, scope: Scope, search = ""): Promise<Task[]> {
  const where = ["org_id = ?", "archived = 0"];
  const values: unknown[] = [scope.org.id];

  const text = search.trim();
  if (text) {
    const held = holdsText(text);
    where.push(held.sql);
    values.push(...held.values);
  }

  const { results } = await db
    .prepare(`SELECT ${CARD_FIELDS} FROM tasks WHERE ${where.join(" AND ")} ${IN_ORDER}`)
    .bind(...values)
    .all<Row>();
  return results.map(asTask);
}

/**
 * How many live tasks each status holds, across the whole board.
 *
 * The Backlog rule reads this and not the narrowed list: a search that leaves
 * To do empty is not a board with no work in hand, and clearing the box must
 * give the board back as it was.
 */
export async function countByStatus(db: D1Database, scope: Scope): Promise<Record<Status, number>> {
  const { results } = await db
    .prepare(
      "SELECT status, COUNT(*) AS held FROM tasks WHERE org_id = ? AND archived = 0 GROUP BY status",
    )
    .bind(scope.org.id)
    .all<{ status: Status; held: number }>();

  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<Status, number>;
  for (const row of results) counts[row.status] = row.held;
  return counts;
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
           updated_at = ${NOW}
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
 * Writes the whole description the box saved.
 *
 * The text is raw markdown and is written as it was typed: the page renders it,
 * so nothing is escaped or normalised on the way in. The write is scoped like
 * every other, so a task another org holds is not reachable by its id.
 *
 * Returns false when no row matched, so the route can answer 404.
 */
export async function saveDescription(
  db: D1Database,
  scope: Scope,
  taskId: string,
  description: string,
): Promise<boolean> {
  const done = await db
    .prepare(
      `UPDATE tasks
       SET description = ?, updated_at = ${NOW}
       WHERE id = ? AND org_id = ?`,
    )
    .bind(description, taskId, scope.org.id)
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
       SET description = ?, updated_at = ${NOW}
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
 * The titles, the mark and the raw text a quick-add box posts, or the reason
 * it makes no task. Both boxes read a form the same way, so the two say the same thing to
 * a person who presses Enter on an empty one.
 *
 * The box takes a line break, so one post makes a list: one task per line, in
 * the order the lines appear. The mark goes on all of them or on none, because
 * one box holds one tick.
 */
export function newTasksFrom(
  form: FormData,
): { titles: string[]; decides: boolean; text: string } | { error: string } {
  const text = String(form.get("title") ?? "");
  const titles = titlesIn(text);
  if (titles.length === 0) return { error: "A task needs a title." };
  if (titles.length > MAX_TITLES) {
    return { error: `A list makes ${MAX_TITLES} tasks at the most.` };
  }
  // The mark goes on when the task is made, while the thought is there. It is
  // off by default, so an unticked box is a task that decides nothing.
  // The text goes back as it was typed, line breaks and all, because the undo
  // of a pasted list refills the box with it.
  return { titles, decides: form.get("decides") === "1", text };
}

/**
 * Adds a block of tasks at the top of its column, where a person looks for the
 * ones they just typed, and gives back the ids it wrote, in list order.
 *
 * The block goes in as one move, in list order, above the card that was on
 * top: adding the lines one at a time would reverse them. One typed title is a
 * block of one, and lands where it always did.
 *
 * The scope carries the org id, so the membership check is already done:
 * `org_id` is the only fence. The rows are not read back, because a hundred
 * ids in one `IN` clause is more bound values than D1 takes, and the caller
 * wants the ids it just made.
 */
export async function createTasks(
  db: D1Database,
  scope: Scope,
  tasks: { titles: string[]; status: Status; decides: boolean },
): Promise<string[]> {
  const orgId = scope.org.id;
  const column = await columnPlaces(db, orgId, tasks.status);
  const positions = placesAbove(column[0]?.position ?? null, tasks.titles.length);

  const rows = tasks.titles.map((title, at) => ({
    id: crypto.randomUUID(),
    title,
    position: positions[at],
  }));

  // A task typed straight into Done or Cancelled is finished the moment it is
  // made, so it carries the finish time from the start: no later move writes
  // one for it.
  const finished = isFinished(tasks.status) ? NOW : "NULL";

  await db.batch(
    rows.map((row) =>
      db
        .prepare(
          `INSERT INTO tasks (id, org_id, title, status, position, decides, finished_at)
           VALUES (?, ?, ?, ?, ?, ?, ${finished})`,
        )
        .bind(row.id, orgId, row.title, tasks.status, row.position, tasks.decides ? 1 : 0),
    ),
  );

  return rows.map((row) => row.id);
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

/**
 * Deletes every task of the org the list names, in one write.
 *
 * The undo of one add is one act, so a paste of ten rows leaves ten rows or
 * none: a delete that stopped halfway would leave a person guessing which rows
 * survived.
 */
export async function deleteTasks(
  db: D1Database,
  scope: Scope,
  taskIds: string[],
): Promise<void> {
  if (taskIds.length === 0) return;
  await db.batch(
    taskIds.map((taskId) =>
      db.prepare("DELETE FROM tasks WHERE id = ? AND org_id = ?").bind(taskId, scope.org.id),
    ),
  );
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
 * This is the one write that changes a status, so it is the one write that can
 * finish a task, and it carries `finished_at`. Every other write leaves the
 * finish time where it is: an edit to a finished task did not finish it again.
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
           finished_at = ${finishedAtSql(move.status)},
           updated_at = ${NOW}
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
 * The finish time is not among them. `docs/task-api.md` states the answer, and
 * a column the board wanted is no reason to widen what an org app is promised.
 *
 * A reference value stays the external id the task holds. The org app minted
 * that id, so it names the record better than Tusker's cached label does.
 */
export type ApiTask = Omit<Task, "org_id" | "archived" | "finished_at"> & {
  updated_at: string;
};

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
 * as they are for the unified board, so there is no page and no limit.
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
