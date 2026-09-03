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
 * so is every press while a prompt is raised: the decision prompt covers the
 * list, so `x` must not finish the task behind it, and `Escape` must skip the
 * prompt and nothing else. The caret can sit outside the prompt, so the guard
 * asks whether one is drawn and not where the press landed.
 */
export function isPagePress(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, select")) return false;
  if (document.querySelector('[role="dialog"]')) return false;
  return !event.metaKey && !event.ctrlKey && !event.altKey;
}
