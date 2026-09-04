/**
 * The order a week set holds, and the one rule it needs: a member moves one
 * place at a time, or it goes to one end.
 *
 * A plan keeps its order in an array, so a step there rewrites the array
 * (`app/plan.ts`). A membership is a row, so a step here is a position: a swap
 * exchanges two, and a move to either end takes one step past that end. No
 * other row is touched, which is the same fraction space a column uses
 * (`app/order.ts`).
 *
 * A finished member sinks under the live ones when the page draws the set, and
 * nothing is written on a finish. So a step reads past a finished neighbour to
 * the live one behind it, and a finished member does not move at all: the row
 * a person sees move is the row that moves. See ADR-0021.
 */

import { placesAbove, placesBelow } from "./order";
import type { Step } from "./plan";

/** One membership as the order reads it, in stored order. */
export type Member = {
  taskId: string;
  position: number;
  /** True where the set still holds the task but the list no longer ranks it. */
  finished: boolean;
};

/** One position to write. */
export type Placed = { taskId: string; position: number };

/**
 * The rows one step writes, which is none where nothing moves.
 *
 * A step off either end, a promote of the member already on top, a move to the
 * foot of the member already there, a member the set does not hold, and a
 * finished member all answer with no rows. A caller reads that as "nothing moved" and
 * writes nothing.
 */
export function movedInSet(set: Member[], taskId: string, step: Step): Placed[] {
  const at = set.findIndex((one) => one.taskId === taskId);
  if (at === -1 || set[at].finished) return [];

  if (step === "top") {
    // The member on top of the live ones is already at the top a person reads,
    // whatever finished row sits above it in the stored order.
    if (at === liveEnd(set, -1)) return [];
    // One step past the lowest position there is, so the promote clears every
    // member and no other row is renumbered.
    return [{ taskId, position: placesAbove(set[0].position, 1)[0] }];
  }

  if (step === "bottom") {
    // The last of the live ones is the last row a person reads, whatever
    // finished row sits under it in the stored order.
    if (at === liveEnd(set, 1)) return [];
    // One step past the highest position there is, so the move clears every
    // member and no other row is renumbered.
    return [{ taskId, position: placesBelow(set[set.length - 1].position, 1)[0] }];
  }

  const way = step === "up" ? -1 : 1;
  let to = at + way;
  while (set[to]?.finished) to += way;

  const swap = set[to];
  if (!swap) return [];
  return [
    { taskId, position: swap.position },
    { taskId: swap.taskId, position: set[at].position },
  ];
}

/**
 * Where the first or the last live member sits, which is the first or the last
 * row a person reads: `-1` for the top of the set, `1` for the foot.
 */
function liveEnd(set: Member[], way: -1 | 1): number {
  const from = way === 1 ? set.length - 1 : 0;
  for (let at = from; at >= 0 && at < set.length; at -= way)
    if (!set[at].finished) return at;
  return -1;
}
