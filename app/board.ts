/** The five statuses a task can hold. The board draws one column per status. */
export const STATUSES = ["backlog", "todo", "in_progress", "done", "cancelled"] as const;

export type Status = (typeof STATUSES)[number];

/** The heading each column carries. */
export const STATUS_LABEL: Record<Status, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

/**
 * The two statuses that hold finished work. A task in one of them carries a
 * finish time, and a task out of them carries none.
 */
export const FINISHED_STATUSES: Status[] = ["done", "cancelled"];

/** True when the status is one a finished task holds. */
export function isFinished(status: Status): boolean {
  return FINISHED_STATUSES.includes(status);
}

/**
 * The columns a card steps along, in workflow order. `>` and `<` walk this run
 * and stop at both ends.
 *
 * Cancelled is off it: an outcome is not the next step, so a card reaches
 * Cancelled by a drag or by the select. See ADR-0015.
 */
export const STATUS_RUN: Status[] = ["backlog", "todo", "in_progress", "done"];

/**
 * The column one step along the run, or null where there is none: at either
 * end of it, and from a column that is off it.
 */
export function stepped(from: Status, way: 1 | -1): Status | null {
  const at = STATUS_RUN.indexOf(from);
  if (at === -1) return null;
  return STATUS_RUN[at + way] ?? null;
}

/**
 * Where a card lands when it steps one place inside its own column, or null at
 * the end it cannot step past. The `before` it carries is the card it lands
 * above, and no card named means the bottom of the column.
 *
 * Up lands above the card overhead. Down lands above the card after the next
 * one, because the card leaves its own place as it moves.
 *
 * The org board's action reads this, over the column as it stands, and no page
 * reads it: a page holds an order one load old, and a held key would then name
 * a place the card has left. Only the org board steps at all, because it is the
 * one board whose order is stored. See ADR-0006 and ADR-0016.
 */
export function stepInColumn(
  ids: string[],
  at: number,
  way: 1 | -1,
): { before: string | null } | null {
  if (at === -1) return null;
  if (way === -1) return at === 0 ? null : { before: ids[at - 1] };
  return at === ids.length - 1 ? null : { before: ids[at + 2] ?? null };
}

/** The three columns the board always shows. */
const ALWAYS_SHOWN: Status[] = ["todo", "in_progress", "done"];

/**
 * Which of the hidden columns a query string asks for. Each board offers its
 * own set of them, and the query string names a column by its status.
 */
export type Toggles = Partial<Record<Status, boolean>>;

/** The columns the org board hides until a person asks for them. */
export const BOARD_TOGGLES: Status[] = ["backlog", "cancelled"];

/** The toggles one board offers, read out of the query string. */
export function readToggles(params: URLSearchParams, which: readonly Status[]): Toggles {
  return Object.fromEntries(which.map((status) => [status, params.get(status) === "1"]));
}

/** True when the value names a status. Every write of a status reads this. */
export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

/**
 * The status a form names, or a 400. A column select and the aside's status
 * box both post one, and neither is a value a person types, so a name that is
 * not a status is a broken form rather than a message to show.
 */
export function readStatus(form: FormData): Status {
  const status = form.get("status");
  if (!isStatus(status)) throw new Response("That is not a column.", { status: 400 });
  return status;
}

/**
 * The columns to draw, in board order.
 *
 * Backlog shows only when there is no work in hand — To do and In progress are
 * both empty — or when the person asks for it. Cancelled shows only when the
 * person asks for it.
 */
export function columnsToShow(counts: Record<Status, number>, toggles: Toggles): Status[] {
  return [
    ...(toggles.backlog || backlogByRule(counts) ? (["backlog"] as Status[]) : []),
    ...ALWAYS_SHOWN,
    ...(toggles.cancelled ? (["cancelled"] as Status[]) : []),
  ];
}

/** True when the board shows Backlog whatever the toggle says. */
export function backlogByRule(counts: Record<Status, number>): boolean {
  return counts.todo === 0 && counts.in_progress === 0;
}

/**
 * The two narrowings a board offers: today's plan, and this week's set. One
 * chip draws each.
 */
export type Narrowing = "today" | "week";

/**
 * The narrowing the address asks for, or null for a whole board.
 *
 * A board is narrowed by one or by neither, so this reads one answer out of
 * the address rather than two. Both names at once is an address nobody's chip
 * writes, and Today wins it: the day is the narrower of the two.
 */
export function readNarrowing(params: URLSearchParams): Narrowing | null {
  if (params.get("today") === "1") return "today";
  if (params.get("week") === "1") return "week";
  return null;
}

/**
 * The query string with one narrowing pressed, or given back, and the other
 * one dropped. It is `flipped` and the exclusivity in one call, so a chip
 * cannot write an address that holds both.
 */
export function narrowedTo(params: URLSearchParams, which: Narrowing, on: boolean): string {
  const next = new URLSearchParams(params);
  next.delete(which === "today" ? "week" : "today");
  return flipped(next, which, on);
}

/**
 * The query string with one switch turned the other way, and the rest of it
 * kept. Every switch a board header draws is one of these.
 */
export function flipped(params: URLSearchParams, which: string, on: boolean): string {
  const next = new URLSearchParams(params);
  if (on) next.delete(which);
  else next.set(which, "1");
  const query = next.toString();
  return query ? `?${query}` : "?";
}
