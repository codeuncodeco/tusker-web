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

/**
 * The Top row: the quick-add box on the left and the filters on the right, on
 * one line where the width allows. The header's org select is the page's
 * heading. See ADR-0029.
 *
 * From `sm` up it sticks under the header, which is `h-16`, and the border
 * under it sticks with it. It takes the page's pad as its own and spans the
 * page's width, so a card scrolls under a solid row and not into a gap above
 * it.
 */
export function TopRow({ children }: { children: React.ReactNode }) {
  return (
    <header
      data-top-row
      className="-mx-8 -mt-8 flex flex-wrap items-start gap-x-6 gap-y-3 border-b border-border bg-bg px-8 pb-6 pt-8 sm:sticky sm:top-16 sm:z-10"
    >
      {children}
    </header>
  );
}

/**
 * The quick-add box's share of the Top row: all of it on a phone, half from
 * `sm`, a third from `lg`. The filters take the rest.
 */
export function TopRowBox({ children }: { children: React.ReactNode }) {
  return <div className="w-full sm:w-1/2 lg:w-1/3">{children}</div>;
}

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
