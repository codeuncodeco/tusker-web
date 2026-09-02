/**
 * The sweep: archiving a whole finished column in one act.
 *
 * Both boards draw it, so the set it names is a list of cards and not a column
 * of one org: each card carries the org that holds it. The org board names one
 * org over and over, and the unified board names as many orgs as the column
 * drew. See ADR-0019.
 */

import type { Toast } from "./toast";

/** One card a sweep names: the task, and the org that holds it. */
export type Swept = { id: string; slug: string };

/** What one sweep left behind: the cards it changed, and whether it ran out. */
export type SweepResult = {
  /** The cards the write changed, in the order the orgs were written. */
  archived: Swept[];
  /** True when one org did not answer, so the run stopped part way. */
  partial: boolean;
};

/**
 * The cards a sweep or its undo names.
 *
 * The form posts an `id` and a `slug` for each card, in card order, so the two
 * lists read as pairs. A form that names a different number of each names no
 * card at all: it is malformed, and a sweep that guessed at the pairs would
 * archive a task of the wrong org.
 */
export function readSwept(form: FormData): Swept[] {
  const ids = form.getAll("id").map(String);
  const slugs = form.getAll("slug").map(String);
  if (ids.length !== slugs.length) {
    throw new Response("That form names a card without an org.", { status: 400 });
  }
  return ids
    .map((id, at) => ({ id, slug: slugs[at] }))
    .filter((card) => card.id !== "" && card.slug !== "");
}

/**
 * The cards grouped by org, in the order the orgs were first named.
 *
 * The order is the column's, so a person reading the toast reads the orgs in
 * the order the sweep wrote them. See ADR-0019.
 */
export function byOrg(cards: Swept[]): { slug: string; ids: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const card of cards) {
    const held = groups.get(card.slug);
    if (held) held.push(card.id);
    else groups.set(card.slug, [card.id]);
  }
  return [...groups].map(([slug, ids]) => ({ slug, ids }));
}

/**
 * What one sweep says once it is done: the count, the one undo, and a link to
 * the archive of every org it touched.
 *
 * The undo names the cards the sweep changed, and not the cards it was given,
 * so a task somebody archived earlier is not restored by an undo of this
 * sweep. A run that stopped part way is undoable on the same terms: it reports
 * what it wrote.
 *
 * A toast goes by itself and a reload loses it, so the links are how a person
 * finds the work again. There is no cross-org archive screen, so a sweep over
 * three orgs links to three.
 */
export function sweptToast({
  label,
  action,
  archived,
  names = {},
  partial = false,
}: {
  /** The column that was swept. */
  label: string;
  /** Where the undo posts. The toast is drawn above every route, so it says. */
  action: string;
  /** The cards the sweep changed. */
  archived: Swept[];
  /**
   * The name of each org, for the archive links. Empty draws none: the org
   * board sweeps the org the person is standing in.
   */
  names?: Record<string, string>;
  /** True when one org did not answer. */
  partial?: boolean;
}): Toast {
  const text = `Archived ${archived.length} from ${label}.`;
  return {
    text: partial ? `${text} One org did not answer.` : text,
    // Nothing changed, so there is nothing to take back.
    act:
      archived.length === 0
        ? undefined
        : {
            label: "Undo",
            action,
            post: {
              intent: "restore",
              id: archived.map((card) => card.id),
              slug: archived.map((card) => card.slug),
            },
          },
    links: byOrg(archived)
      .filter((group) => names[group.slug] !== undefined)
      .map((group) => ({ label: names[group.slug], to: `/o/${group.slug}/archive` })),
  };
}
