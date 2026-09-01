/**
 * The assignee: a member who holds a task. A task can carry several, and a
 * task with none is unassigned. It says who does the work and nothing about
 * who may read it. See ADR-0013.
 *
 * This module holds what a screen draws. The reads and the writes are in
 * `assignees.server.ts`.
 */

/** One assignee, as a card and a picker draw them. */
export type Assignee = { id: string; name: string; initials: string };

/** The name a picker shows, which is the email when the account has no name. */
export function nameOf(member: { name: string; email: string }): string {
  return member.name.trim() || member.email;
}

/**
 * The letters a card draws for one member: the first letter of the first two
 * words of the name, or the first letter of the email for an account that
 * carries no name.
 *
 * A card has room for a mark, not for a name. The extension drew initials, and
 * a person reads their own two letters at a glance.
 */
export function initialsOf(member: { name: string; email: string }): string {
  const words = member.name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 0 ? words.slice(0, 2) : [member.email];
  return letters.map((word) => word[0]!.toUpperCase()).join("");
}

/** One member, as both a card and a picker read them. */
export function assigneeOf(member: { id: string; name: string; email: string }): Assignee {
  return { id: member.id, name: nameOf(member), initials: initialsOf(member) };
}

/**
 * The order a name reads in. The picker and the card both take it, so the
 * boxes a person ticks and the initials the card draws sit in one sequence.
 */
export function inNameOrder(a: Assignee, b: Assignee): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : compare(a.id, b.id);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * True when the org draws an assignee. A personal org holds one member, so a
 * picker whose only value is "me" is noise on every card of the org a person
 * reads most. See ADR-0013.
 */
export function drawsAssignees(org: { kind: "personal" | "team" }): boolean {
  return org.kind !== "personal";
}
