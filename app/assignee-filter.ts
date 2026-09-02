/**
 * The org board's assignee filter: one more narrowing beside the search, not a
 * screen of its own. It rides in the query string, so a narrowed board is
 * linkable and Back works, and the loader narrows in memory over the assignee
 * map it already reads for the initials on every card. See ADR-0017.
 *
 * This module reads the address and answers one question about one task. The
 * board draws the select in `board-chrome.tsx`, and what a board remembers
 * lives in `remembered.ts`.
 */

import type { Assignee } from "./assignees";
import { readTrimmed, without } from "./query";

/** The name the filter rides under in the address. */
export const ASSIGNEE_NAME = "assignee";

/** The start: every task, held or not. It is the absent value as well. */
export const ANYONE = "";

/** The tasks nobody holds. No member id can collide: an id is never empty. */
export const UNASSIGNED = "unassigned";

/**
 * The value the address carries, with the space around it dropped. An absent
 * or empty value is `Anyone`, and so is anything else the board cannot use: a
 * name no member answers to narrows to nothing, which is the honest answer for
 * a member who left, and `Anyone` is what an unreadable address falls back to.
 */
export function readAssignee(params: URLSearchParams): string {
  return readTrimmed(params, ASSIGNEE_NAME);
}

/**
 * True while the task belongs on a board narrowed to this value.
 *
 * A task nobody holds carries an empty list, which is what absence from the
 * loader's map means. A task with three assignees answers to each of the
 * three.
 */
export function keeps(assignee: string, held: Assignee[]): boolean {
  if (assignee === ANYONE) return true;
  if (assignee === UNASSIGNED) return held.length === 0;
  return held.some((one) => one.id === assignee);
}

/**
 * The rest of the address, as name and value pairs. The select posts these
 * back as hidden fields, so picking a member keeps the search, the chip and
 * the columns a person turned on.
 */
export function withoutAssignee(params: URLSearchParams): [string, string][] {
  return without(params, ASSIGNEE_NAME);
}
