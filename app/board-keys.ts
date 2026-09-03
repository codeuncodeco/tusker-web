/**
 * The keys the org board binds: `j` and `k` move, `Enter` opens, `x` finishes,
 * `>` and `<` walk the card between columns, and `J` and `K` step it inside
 * one. `n` belongs to the quick-add box, which takes the press itself.
 *
 * The org board is the one board where the order inside a column is the org's
 * and stored, so `J` and `K` step that order here and on no person-axis page.
 * The cross-org lists keep their own map in `app/unified-keys.ts`: the two
 * pages draw different rows and write different intents, and the keys they
 * share are the same letters by decision, not by one shared list.
 * See ADR-0016.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router";

import { isFinished, stepped, type Status } from "./board";
import { isPagePress } from "./keys";
import { taskPath, useOrigin } from "./paths";

/** One column as the keys read it: its status, and the ids it draws in order. */
export type KeyedColumn = { status: Status; ids: string[] };

/**
 * What one press asks the board for: to put the cursor on a card, to open one,
 * to move one to another column, or to step one inside its own.
 *
 * A move names a column and the bottom of it. A step names no place at all:
 * the page's copy of the order is one load old, so the server reads the card
 * the step lands above. See ADR-0016.
 */
export type Act =
  /** A card by id, or null where the press takes the cursor off the board. */
  | { act: "on"; id: string | null }
  | { act: "open"; id: string }
  | { act: "move"; id: string; status: Status }
  | { act: "step"; id: string; way: "up" | "down" };

/**
 * What a press does to the board, or nothing where the press is not the
 * board's. It reads the columns and answers, so the whole key map is one pure
 * function and the hook only posts what it says.
 */
export function boardPress(key: string, columns: KeyedColumn[], on: string | null): Act | null {
  // One flat order, so `j` and `k` walk the board column by column, the way a
  // person reads it.
  const rows = columns.flatMap((column) => column.ids);
  const at = rows.indexOf(on ?? "");

  // An empty cursor sits outside the board, so a move key brings it back in
  // from the end the key comes from: `j` to the first card, `k` to the last.
  if (key === "j") return pick(at === -1 ? rows[0] : rows[Math.min(at + 1, rows.length - 1)]);
  if (key === "k") return pick(at === -1 ? rows[rows.length - 1] : rows[Math.max(at - 1, 0)]);

  // Escape empties the cursor, so a person reading the board has no card named
  // at them. A cursor already empty has nothing to clear, and the press falls
  // through to whatever else reads Escape. See ADR-0015.
  if (key === "Escape") return on === null ? null : { act: "on", id: null };

  // Every key left acts on the card the cursor names.
  if (at === -1) return null;
  const id = rows[at];
  const column = columns.find((one) => one.ids.includes(id))!;

  if (key === "Enter") return { act: "open", id };

  // `>` and `<` walk the run and stop at both ends. They post the move the
  // drop posts and the select posts: a column, and the bottom of it. Cancelled
  // is off the run. See ADR-0015.
  if (key === ">" || key === "<") {
    const status = stepped(column.status, key === ">" ? 1 : -1);
    return status ? { act: "move", id, status } : null;
  }

  // A step is a step of the org's order, so it stays in the column. A card at
  // the end of the column has nowhere to step. See ADR-0016.
  if (key === "J" || key === "K") {
    const at = column.ids.indexOf(id);
    if (key === "K") return at === 0 ? null : { act: "step", id, way: "up" };
    return at === column.ids.length - 1 ? null : { act: "step", id, way: "down" };
  }

  // Finishing is a move to Done, so a card already in Done or in Cancelled has
  // nothing left to finish.
  if (key === "x") {
    if (isFinished(column.status)) return null;
    return { act: "move", id, status: "done" };
  }

  return null;
}

/** The cursor on one card, or nothing where the board draws none. */
function pick(id: string | undefined): Act | null {
  return id ? { act: "on", id } : null;
}

/**
 * Binds the keys to the columns the board draws.
 *
 * The cursor names a card, not a place, so a card the person moves keeps the
 * cursor while the board redraws around it.
 */
export function useBoardKeys(
  columns: KeyedColumn[],
  slug: string,
  on: string | null,
  setOn: (id: string | null) => void,
  /** Posts a move to another column, which lands at the bottom of it. */
  move: (id: string, status: Status) => void,
  /** Posts a step up or down the card's own column. */
  step: (id: string, way: "up" | "down") => void,
) {
  const navigate = useNavigate();
  const origin = useOrigin();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!isPagePress(event)) return;

      const act = boardPress(event.key, columns, on);
      if (!act) return;
      // Both posts put the cursor on the card they move, so the person can see
      // where it landed and keep working it by key.
      if (act.act === "on") setOn(act.id);
      else if (act.act === "open") navigate(taskPath(slug, act.id, origin));
      else if (act.act === "move") move(act.id, act.status);
      else step(act.id, act.way);

      event.preventDefault();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [columns, slug, on, setOn, move, step, navigate, origin]);
}
