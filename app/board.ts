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
const ALWAYS_SHOWN: Status[] = ["todo", "in_progress", "done"];

export type Toggles = { backlog: boolean; cancelled: boolean };

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
