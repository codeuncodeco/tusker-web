/**
 * The order maths. A position is a fraction, so a drop between two cards takes
 * the midpoint and no other row is renumbered.
 *
 * Both neighbours are the positions of the cards the drop lands between, or
 * null at an end of the column.
 */

/** The distance a drop keeps from the card at an end of the column. */
const STEP = 1;

/**
 * The position for a drop, or null when the gap between the neighbours is too
 * tight for a fraction to fall inside it. The caller then renumbers the column
 * and asks again.
 */
export function between(before: number | null, after: number | null): number | null {
  if (before === null && after === null) return 0;
  if (before === null) return after! - STEP;
  if (after === null) return before + STEP;

  const middle = before + (after - before) / 2;
  return middle > before && middle < after ? middle : null;
}
