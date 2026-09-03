/**
 * What every keyed list agrees on: which key presses are the page's, and which
 * belong to the person typing.
 *
 * Tusker is keyboard first, so several lists bind keys. They read a press the
 * same way, because a page where `x` finishes a task while a person writes a
 * title is a page that loses work.
 */

/**
 * True for a press the page can act on. A keyed list holds no box, so the box
 * guard reads for the three listeners still on the window — the decision
 * prompt, the offer that ends a batch, and the task page's way back — and for a
 * box a page draws inside a list by mistake. See ADR-0022.
 *
 * All three are `Escape`, which 2.1.4 does not reach: it names a single
 * character key, and Escape is not one. A page that draws no list has nowhere
 * else to bind it.
 *
 * A press in a box is the person's, and so is every press while a prompt is
 * raised: the decision prompt covers the
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

/**
 * The card the cursor lands on when a board arrow crosses a column, or nothing
 * where there is none to land on.
 *
 * Arrows navigate and letters act: `ArrowLeft` and `ArrowRight` move the
 * cursor, while `<` and `>` move the card. The cursor keeps its place down the
 * column, and takes the last card of a shorter one. The cursor passes a column
 * that draws nothing, because an empty column holds no card to stop on. Tab is
 * how a person reaches that column.
 *
 * The cursor comes back into a list from the end an arrow comes from, and up
 * and down are the two ends a board has. So an empty cursor answers nothing
 * here: `j`, `k` and their arrows are the way back in. See ADR-0022.
 */
export function across(key: string, columns: string[][], on: string | null): string | null {
  const way = key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0;
  if (!way || on === null) return null;

  const at = columns.findIndex((ids) => ids.includes(on));
  if (at === -1) return null;
  const down = columns[at].indexOf(on);

  for (let next = at + way; next >= 0 && next < columns.length; next += way) {
    const ids = columns[next];
    if (ids.length > 0) return ids[Math.min(down, ids.length - 1)];
  }
  return null;
}
