/**
 * The assignee: a member who holds a task. A task can carry several, and a
 * task with none is unassigned. It says who does the work and nothing about
 * who may read it. See ADR-0013.
 *
 * This module holds what a screen draws. The reads and the writes are in
 * `assignees.server.ts`.
 */

/**
 * One assignee, as a card and a picker draw them.
 *
 * `color` is the person's colour, one across every org, and `image` is their
 * picture as a data URL. Either is absent for a person who has none, and the
 * avatar then draws their initials, or a grey ring. See ADR-0036.
 */
export type Assignee = { id: string; name: string; initials: string; color?: string; image?: string };

/** The person reading the page, as the profile button draws them. */
export type Me = Pick<Assignee, "name" | "initials" | "color" | "image">;

/** The name a picker shows, which is the email when the account has no name. */
export function nameOf(member: { name: string; email: string }): string {
  return member.name.trim() || member.email;
}

/**
 * The letters a card draws for one member: the first letter of the first two
 * words of the name. A one-word name draws one letter.
 *
 * An account that carries no name draws the first two letters of the part of
 * the email before the `@`, and skips digits, dots and other marks. A part
 * with one letter draws one, and a part with no letter draws its first
 * character, so the mark is never empty.
 *
 * A card has room for a mark, not for a name. The extension drew initials, and
 * a person reads their own two letters at a glance.
 */
export function initialsOf(member: { name: string; email: string }): string {
  const words = member.name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join("");

  const beforeAt = member.email.split("@")[0]!;
  const letters = beforeAt.match(/\p{L}/gu)?.slice(0, 2) ?? [Array.from(beforeAt)[0]!];
  return letters.join("").toUpperCase();
}

/** One member, as both a card and a picker read them. */
export function assigneeOf(member: {
  id: string;
  name: string;
  email: string;
  color?: string | null;
  image?: string | null;
}): Assignee {
  return {
    id: member.id,
    name: nameOf(member),
    initials: initialsOf(member),
    ...(member.color ? { color: member.color } : {}),
    ...(member.image ? { image: member.image } : {}),
  };
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
 * True when the org draws an assignee. An org of one member has nobody else to
 * name, so a picker whose only value is "me" is noise on every card. The count
 * decides and not who made the org: an org of one draws a picker the day a
 * second member joins. See ADR-0013 and ADR-0027.
 *
 * An org of one still stores its member as the holder of every unarchived
 * task. It draws nothing, and the old tasks show who held them once the
 * picker comes.
 * See ADR-0032.
 */
export function drawsAssignees(org: { members: number }): boolean {
  return org.members > 1;
}
