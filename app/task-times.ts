/**
 * The times a task's page lists at the foot of its aside: when the task was
 * made, finished, archived and last written. See #218.
 *
 * They are listed in the order the task lives them, so the list reads as its
 * history. The Update time comes last, because it is the newest.
 */

/** The stored times a task holds, as the table writes them. */
export type StoredTimes = {
  created_at: string;
  updated_at: string;
  /** The Finish time, or null while the task is not finished. */
  finished_at: string | null;
  /** When the task was archived, or null while it is on the board. */
  archived_at: string | null;
};

/** One line of the list: what the time is, and the stored time itself. */
export type TaskTime = { label: string; at: string };

/**
 * The lines a task lists. Created is always there, and Finished and Archived
 * are there when the task holds them.
 *
 * Updated is there only when it is later than every other line, so it never
 * says again what a line above it says. An archive writes the Update time, so
 * an archived task lists no Updated at all: its Archived line already says
 * when it was last written, and a tick after it is not worth a line.
 */
export function taskTimes(times: StoredTimes): TaskTime[] {
  const lines: TaskTime[] = [{ label: "Created", at: times.created_at }];
  if (times.finished_at) lines.push({ label: "Finished", at: times.finished_at });
  if (times.archived_at) return [...lines, { label: "Archived", at: times.archived_at }];

  const updated = Date.parse(times.updated_at);
  if (lines.every((line) => Date.parse(line.at) < updated)) {
    lines.push({ label: "Updated", at: times.updated_at });
  }
  return lines;
}
