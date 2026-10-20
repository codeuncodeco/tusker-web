/**
 * The cursor kept clear of whatever is stuck over a board. A board draws no
 * bar now (ADR-0038), so nothing covers a card, and the cursor only scrolls
 * into view; a page that sticks a row over its list marks it `data-top-row`
 * and the card is kept clear of it.
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
  // A page draws one Top row at most.
  const row = document.querySelector("[data-top-row]");
  if (!row) return;
  const by = covered(row.getBoundingClientRect(), card.getBoundingClientRect());
  if (by > 0) window.scrollBy(0, -by);
}
