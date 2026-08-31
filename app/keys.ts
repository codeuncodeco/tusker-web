/**
 * What every keyed list agrees on: which key presses are the page's, and which
 * belong to the person typing.
 *
 * Tusker is keyboard first, so several lists bind keys. They read a press the
 * same way, because a page where `x` finishes a task while a person writes a
 * title is a page that loses work.
 */

/** True for a press the page can act on. A press in a box is the person's. */
export function isPagePress(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, select")) return false;
  return !event.metaKey && !event.ctrlKey && !event.altKey;
}
