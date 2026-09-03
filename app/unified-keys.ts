/**
 * The keys every cross-org list binds, and the one place that binds them.
 *
 * `j` and `k` move, `Enter` opens, `p` plans, `x` finishes, `>` and `<` walk
 * the card between columns, and `J`, `K` and `T` move a picked row through the
 * order the page owns. The keys themselves live in `app/key-map.ts`; the
 * guards live here, because a guard reads the task, the picked set and the
 * page's acts.
 *
 * The unified board, plan mode, the week and focus mode draw the same tasks in
 * different layouts, so one hook serves all four. Tusker is keyboard first, so
 * the buttons are the second way, not the only one.
 *
 * The org board binds the same letters from `app/board-keys.ts`. It draws
 * different rows and writes different intents, so it keeps a map of its own,
 * and the letters are shared by decision. See ADR-0016.
 */

import { useNavigate } from "react-router";

import { stepped } from "./board";
import { fires } from "./key-map";
import { BOARD_ARROWS, LIST_ARROWS, useKeyedList, type Keyed } from "./keyed-list";
import { across } from "./keys";
import { isPlannable, type LiveTask } from "./unified";
import { finishFields, moveFields, planFields } from "./unified-row";

/**
 * Which acts a page gives, past the two every list has: moving the cursor, and
 * opening or finishing the task under it.
 */
export type ListActs = {
  /** True where `p` puts a task in the page's list, or takes it back out. */
  plan: boolean;
  /**
   * True where the page gives the person an order of their own to move: `J`
   * and `K` step a row, and `T` promotes one. One flag carries all three,
   * because they are one family and a page owns an order or it does not.
   */
  step: boolean;
  /** True where `>` and `<` walk a task between columns. */
  move: boolean;
};

/** Every act, which is what plan mode gives: the plan is the order it owns. */
export const ALL_ACTS: ListActs = { plan: true, step: true, move: true };

/**
 * Every act but the step, for a list whose order is derived: the unified
 * board, and plan mode's own To do and In progress groups. See ADR-0006.
 */
export const NO_STEP_ACTS: ListActs = { plan: true, step: false, move: true };

/**
 * Neither a pick nor a step, for a list that is read back and not built: a day
 * past its own. The task itself is live, so a finish and a move stand.
 */
export const READ_ACTS: ListActs = { plan: false, step: false, move: true };

/**
 * The three acts that move a row. The intent a press posts is the act's own
 * name, so the list is the whole binding.
 */
const MOVE_ACTS = ["up", "down", "top"] as const;

/** What one press does to the list, or null where the list ignores it. */
export type Press =
  /** A card by id, or null where the press takes the cursor off the list. */
  | { kind: "cursor"; id: string | null }
  | { kind: "open"; task: LiveTask }
  | { kind: "act"; fields: Record<string, string> };

/**
 * Reads one press against the list. It touches nothing, so a test can ask what
 * a key does without a page to press it on.
 */
export function pressed(
  key: string,
  rows: LiveTask[],
  planned: Set<string>,
  acts: ListActs,
  on: string | null,
  /**
   * The rows the page's order ranks, where that is narrower than the picked
   * set. A week page ranks its live members and not the finished ones.
   */
  ranked: Set<string> = planned,
): Press | null {
  const at = rows.findIndex((one) => one.id === on);
  const task = rows[at];

  // The cursor names a task, not a place in the list. A plan moves a row into
  // the plan group, and the cursor goes with it.
  //
  // An empty cursor sits outside the list, so a move key brings it back in
  // from the end the key comes from: `j` to the first row, `k` to the last.
  if (fires("next", key))
    return pick(at === -1 ? rows[0] : rows[Math.min(at + 1, rows.length - 1)]);
  if (fires("prev", key))
    return pick(at === -1 ? rows[rows.length - 1] : rows[Math.max(at - 1, 0)]);

  // Escape empties the cursor, so a person reading the page has no card named
  // at them. A cursor already empty has nothing to clear, and the press falls
  // through to whatever else reads Escape. See ADR-0015.
  if (fires("clear", key)) return on === null ? null : { kind: "cursor", id: null };

  if (!task) return null;
  if (fires("open", key)) return { kind: "open", task };

  // Backlog is unplannable, and a finished task is nothing to plan. The board
  // draws all five columns, so the key says so as well as the write. Taking a
  // task back out is never refused: plan mode holds the tasks finished today,
  // and `p` unplans one of those as the button does.
  if (fires("plan", key) || fires("unplan", key)) {
    if (!acts.plan) return null;
    const held = planned.has(task.id);
    if (!held && !isPlannable(task)) return null;
    return { kind: "act", fields: planFields(task, held) };
  }

  // A move is a move of the page's own order, so a task that order does not
  // rank, and a page with no order of the person's own, have nothing to move.
  // The plan is one such order and a week set is the other. See ADR-0021.
  //
  // `ranked` is what the page draws the move buttons from, so a key reaches no
  // act a control withholds: a member finished this week is drawn out of the
  // order, and it answers none of the three.
  const moves = MOVE_ACTS.find((act) => fires(act, key));
  if (moves) {
    if (!acts.step || !ranked.has(task.id)) return null;
    return { kind: "act", fields: { intent: moves, id: task.id } };
  }

  // `>` and `<` walk the card along the run and stop at both ends. They post
  // the move a drop posts and the select posts: a column, and no place inside
  // it. Cancelled is off the run. See ADR-0015.
  if (fires("forward", key) || fires("back", key)) {
    if (!acts.move) return null;
    const to = stepped(task.status, fires("forward", key) ? 1 : -1);
    if (!to) return null;
    return { kind: "act", fields: moveFields(task, to) };
  }

  // A task already finished has nothing left to finish.
  if (fires("finish", key)) {
    if (task.finished) return null;
    return { kind: "act", fields: finishFields(task) };
  }

  return null;
}

/** The cursor on one row, or nothing where the list draws none. */
function pick(task: LiveTask | undefined): Press | null {
  return task ? { kind: "cursor", id: task.id } : null;
}

/**
 * Binds the keys to one flat list of tasks, and answers with the props the
 * elements that hold the rows take.
 *
 * The keys are live while focus is inside those elements and nowhere else, so
 * a page draws them around its rows and around nothing else. See ADR-0022.
 */
export function useTaskKeys({
  rows,
  planned,
  acts,
  on,
  setOn,
  act,
  ranked = planned,
  columns = null,
}: {
  rows: LiveTask[];
  planned: Set<string>;
  acts: ListActs;
  on: string | null;
  setOn: (id: string | null) => void;
  act: (fields: Record<string, string>) => void;
  /** The rows the page's order ranks. See `pressed`. */
  ranked?: Set<string>;
  /**
   * The ids each column draws, where the list is a board. The arrows cross
   * them, and a list with one run of rows has none to cross.
   */
  columns?: string[][] | null;
}): (label: string) => Keyed {
  const navigate = useNavigate();

  return useKeyedList((key) => {
    if (columns) {
      const sideways = across(key, columns, on);
      if (sideways) {
        setOn(sideways);
        return true;
      }
    }

    const press = pressed(key, rows, planned, acts, on, ranked);
    if (!press) return false;

    if (press.kind === "cursor") setOn(press.id);
    else if (press.kind === "open") navigate(`/o/${press.task.org.slug}/t/${press.task.id}`);
    else act(press.fields);

    return true;
  }, columns ? BOARD_ARROWS : LIST_ARROWS);
}
