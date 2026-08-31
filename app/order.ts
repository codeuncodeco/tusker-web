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

/**
 * A card as both orders read it: the org's shared `position`, and the `rank`
 * one person set for it, or null for a card that person never dragged.
 */
export type Ranked = { id: string; position: number; rank: number | null };

/** The number a card takes in one person's order. */
export function seen(card: Ranked): number {
  return card.rank ?? card.position;
}

/**
 * The order one person sees, from a column in the board's own order: their
 * rank where they set one, the shared position everywhere else. Ranked and
 * unranked cards therefore interleave.
 *
 * The sort is stable, so two cards of the same number keep the order the board
 * gave them.
 */
export function seenBy<T extends Ranked>(column: T[]): T[] {
  return [...column].sort((one, other) => seen(one) - seen(other));
}

/**
 * The cards that carry a marker, from a column in the board's own order: the
 * ranked ones that sit in another place than the board puts them.
 *
 * A rank that asks for the place the board already gives marks nothing. A card
 * without a rank never marks either, because it has nothing to differ with:
 * it sits where the board and the ranks around it leave it.
 */
export function marked(column: Ranked[]): Set<string> {
  const board = new Map(column.map((card, at) => [card.id, at]));
  const markers = new Set<string>();

  for (const [at, card] of seenBy(column).entries()) {
    if (card.rank !== null && board.get(card.id) !== at) markers.add(card.id);
  }

  return markers;
}

/**
 * The card each of a card's two arrows names. `up` is the card above. `down`
 * is the card after the next one, because the card slides past one place. An
 * empty string names the bottom of the column, and null means the arrow has
 * nowhere to go.
 */
export type Arrows = { up: string | null; down: string | null };

/**
 * What the arrows of every card in a column send, read from the column in the
 * board's own order.
 *
 * The arrows write the board's order, so they must read it too. A ranked card
 * sits somewhere else in the order its person sees. An arrow that took its
 * neighbours from that view would move the card past cards that are not its
 * neighbours on the board, which moves every other member's board.
 */
export function arrowsOn(column: { id: string }[]): Map<string, Arrows> {
  return new Map(
    column.map((card, at) => [
      card.id,
      {
        up: at === 0 ? null : column[at - 1].id,
        down: at === column.length - 1 ? null : (column[at + 2]?.id ?? ""),
      },
    ]),
  );
}
