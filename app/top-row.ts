/**
 * The Top row of a board, and the cursor kept clear of it.
 *
 * The page scrolls and no column does. From `sm` up the header and the Top row
 * stick, so a card the keys walk to can land under them: a scroll to the
 * nearest edge stops at the window's top, and the Top row is drawn over that.
 * So the board scrolls the card into view, then back down by what the row
 * covers. Below `sm` the row scrolls away with the page and covers nothing.
 * See #191.
 */

/** The room left between the Top row's border and a card scrolled clear of it. */
const ROOM = 8;

/** How far a card sits under the Top row, room included, or 0 when it is clear. */
export function covered(row: { bottom: number }, card: { top: number }): number {
  return Math.max(0, row.bottom + ROOM - card.top);
}

/** Scroll the card under the cursor into view, and out from under the Top row. */
export function revealCursor(board: HTMLElement | null) {
  const card = board?.querySelector('[aria-current="true"]');
  if (!card) return;
  card.scrollIntoView({ block: "nearest" });
  // The Top row carries `data-top-row`, and a page draws one at most.
  const row = document.querySelector("[data-top-row]");
  if (!row) return;
  const by = covered(row.getBoundingClientRect(), card.getBoundingClientRect());
  if (by > 0) window.scrollBy(0, -by);
}
