/**
 * What a drag draws while it is under way, and what its drop writes.
 *
 * A list here is ids in the order the page draws them, keyed by the list's own
 * id: a column's status, or a plan's group. The hook in `app/drag-lists.tsx`
 * holds these while a card is dragged, so the cards make room where it will
 * land, and this module is the arithmetic, so it can be tested without a
 * pointer. See ADR-0025.
 */

/** Ids in the order the page draws them, keyed by the list they are in. */
export type Lists = Record<string, string[]>;

/** The list an id names, or the list that holds the card it names. */
export function listOf(lists: Lists, id: string): string | null {
  if (id in lists) return id;
  return Object.keys(lists).find((key) => lists[key].includes(id)) ?? null;
}

/**
 * The lists with the dragged card moved into the list it is over.
 *
 * Over a card, it lands above that card, or below it when the pointer is past
 * the card's middle. Over the list and no card, which is the empty part of a
 * column, it lands at the foot. Inside its own list nothing moves here: the
 * cards there make room by themselves, and `settle` reads where it was let go.
 */
export function crossOver(lists: Lists, active: string, over: string, below: boolean): Lists {
  const from = listOf(lists, active);
  const to = listOf(lists, over);
  if (from === null || to === null || from === to) return lists;

  const target = lists[to];
  const at = over === to ? target.length : target.indexOf(over) + (below ? 1 : 0);
  return {
    ...lists,
    [from]: lists[from].filter((one) => one !== active),
    [to]: [...target.slice(0, at), active, ...target.slice(at)],
  };
}

/**
 * The lists with the dragged card in the place of the card it was let go on,
 * inside its own list. The cards between shift a place, which is what they
 * drew while they made room.
 */
export function settle(lists: Lists, active: string, over: string): Lists {
  const key = listOf(lists, active);
  if (key === null || over === active || listOf(lists, over) !== key || over === key) return lists;

  const list = lists[key];
  const to = list.indexOf(over);
  const moved = list.filter((one) => one !== active);
  moved.splice(to, 0, active);
  return { ...lists, [key]: moved };
}

/** The card a drop lands above: the one just below it, or none at the foot. */
export function landing(order: string[], id: string): string | null {
  return order[order.indexOf(id) + 1] ?? null;
}

/**
 * The card a drop lands above on a list of several orgs: the nearest card of
 * the dragged card's own org below it, or none.
 *
 * A place is stored inside one org's column, so a card of another org names no
 * place the card can take. See ADR-0025.
 */
export function landingInOrg(
  order: string[],
  id: string,
  orgOf: (id: string) => string | undefined,
): string | null {
  const org = orgOf(id);
  return order.slice(order.indexOf(id) + 1).find((one) => orgOf(one) === org) ?? null;
}
