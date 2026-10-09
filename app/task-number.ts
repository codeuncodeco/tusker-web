/**
 * A task is named by a number, written `#1234`, and the number is its id. The
 * database counts it out across the whole instance, and never hands one out
 * twice. See ADR-0030.
 */
export type TaskId = number;

/**
 * The task a path or a form value names, or null for anything that is not a
 * task number.
 *
 * A form posts text, so every id that comes in from a page passes through
 * here. A number never handed out still reads as one: the query that looks for
 * it finds nothing, as it would for a task another org holds.
 */
export function readTaskId(value: unknown): TaskId | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^[1-9][0-9]{0,14}$/.test(text)) return null;
  return Number(text);
}

/** The task numbers a list of form values names, with every other value dropped. */
export function taskIdsIn(values: unknown[]): TaskId[] {
  return values.map(readTaskId).filter((id) => id !== null);
}

/** A task number as a person reads it. */
export function taskLabel(id: TaskId): string {
  return `#${id}`;
}
