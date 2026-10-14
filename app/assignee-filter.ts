/**
 * The assignee filter: one more narrowing beside the search, not a screen of
 * its own. It rides in the query string, so a narrowed board is linkable and
 * Back works, and the loader narrows in memory over the assignee map it
 * already reads for the initials on every card. See ADR-0017.
 *
 * The org board offers `Anyone`, `Unassigned` and each member. The unified
 * board offers `Anyone`, `Mine` and `Unassigned`, and names nobody, because a
 * member list across orgs names strangers. See ADR-0033.
 *
 * This module reads the address and answers one question about one task. The
 * board draws the select in `board-chrome.tsx`, and what a board remembers
 * lives in `remembered.ts`.
 */

import { drawsAssignees, type Assignee } from "./assignees";
import { readTrimmed, without } from "./query";

/** The name the filter rides under in the address. */
export const ASSIGNEE_NAME = "assignee";

/** The start: every task, held or not. It is the absent value as well. */
export const ANYONE = "";

/** The tasks nobody holds. No member id can collide: an id is never empty. */
export const UNASSIGNED = "unassigned";

/**
 * The tasks the person reading holds, on the unified board alone. It is a word and not
 * an id, so a shared link shows whoever opens it their own work. No member id
 * can collide: a member id is never this word. The org board does not read it.
 */
export const MINE = "me";

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
 * The value the unified board narrows by: `Anyone`, `Mine` or `Unassigned`.
 * Anything else, a member id from an org board included, is `Anyone`, because
 * this board names no member.
 */
export function readUnifiedAssignee(params: URLSearchParams): string {
  const value = readAssignee(params);
  return value === MINE || value === UNASSIGNED ? value : ANYONE;
}

/**
 * The value `keeps` answers for, as one person reads the board: `Mine` becomes
 * the person's id, and every other value stands for itself.
 */
export function resolvedFor(assignee: string, personId: string): string {
  return assignee === MINE ? personId : assignee;
}

/**
 * The value the org select carries to the board it opens: the board of one
 * org, or All for null.
 *
 * `assignee` is the value the address held, or null for an address with no
 * filter in it at all.
 *
 * The person is the one member both boards can name: `Mine` on All, and their
 * own name in an org. `Unassigned` means the same on both. Another member is
 * nobody on All, and may be nobody in another org, so it becomes `Anyone`.
 * `Anyone` stays `Anyone`. Each is said out loud, so the next board's memory
 * does not stand in for a filter the person set. An org of one draws no
 * filter, so the value is dropped.
 *
 * Null carries nothing: the address held no filter, or the next board draws
 * none, and the board opens bare, with its memory.
 */
export function carried(
  assignee: string | null,
  personId: string,
  to: { members: number } | null,
): string | null {
  if (assignee === null) return null;
  if (to !== null && !drawsAssignees(to)) return null;
  if (assignee === ANYONE) return ANYONE;
  if (assignee === UNASSIGNED) return UNASSIGNED;
  if (assignee === MINE || assignee === personId) return to === null ? MINE : personId;
  return ANYONE;
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
 * The members the quick-add box starts with on a board narrowed to this value:
 * the member it names, so a task added there is theirs. `Anyone` and
 * `Unassigned` name nobody, and nor does a member who left the org. The person
 * can still change the set before Enter.
 */
export function seededBy(assignee: string, members: Assignee[]): string[] {
  return members.some((one) => one.id === assignee) ? [assignee] : [];
}

/**
 * The rest of the address, as name and value pairs. The select posts these
 * back as hidden fields, so picking a member keeps the search, the chip and
 * the columns a person turned on.
 */
export function withoutAssignee(params: URLSearchParams): [string, string][] {
  return without(params, ASSIGNEE_NAME);
}
