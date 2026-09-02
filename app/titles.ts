/**
 * The lines a quick-add box turns into tasks.
 *
 * A person pastes a list, and each line of it is one task. The split is here,
 * away from the form and the database, because both boxes read it and a test
 * can read it on its own. See ADR-0012 for what an add means.
 */

/**
 * The most tasks one paste can make. A cap keeps a bad paste — a whole
 * document dropped in the box — from filling a board with rows a person then
 * has no way to remove.
 */
export const MAX_TITLES = 100;

/**
 * One title per line, trimmed, in the order the lines appear.
 *
 * A blank line makes no task, so a list with a gap in it reads as the person
 * wrote it. A text of blanks makes no title at all, which the caller answers
 * with the empty-title error.
 */
export function titlesIn(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
