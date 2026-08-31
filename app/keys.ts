/**
 * What every keyed list agrees on: which key presses are the page's, and which
 * belong to the person typing.
 *
 * Tusker is keyboard first, so several lists bind keys. They read a press the
 * same way, because a page where `x` finishes a task while a person writes a
 * title is a page that loses work.
 */

/**
 * True for a press the page can act on. A press in a box is the person's, and
 * so is one inside an open dialog: the decision prompt covers the list, so `x`
 * on its Skip button must not finish the task behind it.
 */
export function isPagePress(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [role="dialog"]')) return false;
  return !event.metaKey && !event.ctrlKey && !event.altKey;
}
