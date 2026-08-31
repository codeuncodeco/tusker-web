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

/** The three columns the board always shows. */
const ALWAYS: Status[] = ["todo", "in_progress", "done"];

export type Toggles = { backlog: boolean; cancelled: boolean };

/** True when the value names a status. Every write of a status reads this. */
export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

/**
 * The columns to draw, in board order.
 *
 * Backlog is a holding pen, so it shows only while there is nothing to work
 * on — To do and In progress both empty — or while the person asks for it.
 * Cancelled is noise until the person asks for it.
 */
export function columnsToShow(counts: Record<Status, number>, toggles: Toggles): Status[] {
  const empty = counts.todo === 0 && counts.in_progress === 0;
  return [
    ...(toggles.backlog || empty ? (["backlog"] as Status[]) : []),
    ...ALWAYS,
    ...(toggles.cancelled ? (["cancelled"] as Status[]) : []),
  ];
}
