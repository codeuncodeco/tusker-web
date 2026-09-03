/**
 * The keys every cross-org list binds, and the one place that binds them.
 *
 * `j` and `k` move, `Enter` opens, `p` plans, `x` finishes, `>` and `<` walk
 * the card between columns, and `J` and `K` step a planned task through the
 * plan. The keys themselves live in `app/key-map.ts`; the guards live here,
 * because a guard reads the task, the plan set and the page's acts.
 *
 * The unified board, plan mode, the week and focus mode draw the same tasks in
 * different layouts, so one hook serves all four. Tusker is keyboard first, so
 * the buttons are the second way, not the only one.
 *
 * The org board binds the same letters from `app/board-keys.ts`. It draws
 * different rows and writes different intents, so it keeps a map of its own,
 * and the letters are shared by decision. See ADR-0016.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router";

import { stepped } from "./board";
import { KEY_MAP } from "./key-map";
import { isPagePress } from "./keys";
import { isPlannable, type LiveTask } from "./unified";
import { finishFields, moveFields, planFields } from "./unified-row";

/**
 * Which acts a page gives, past the two every list has: moving the cursor, and
 * opening or finishing the task under it.
 */
export type ListActs = {
  /** True where `p` puts a task in the page's list, or takes it back out. */
  plan: boolean;
  /** True where the page gives the person an order of their own to step. */
  step: boolean;
  /** True where `>` and `<` walk a task between columns. */
  move: boolean;
};

/** Every act, which is what plan mode gives: the plan is the order it owns. */
export const ALL_ACTS: ListActs = { plan: true, step: true, move: true };

/**
 * Every act but the step, for a list whose order is derived: the board, the
 * week, and plan mode's own To do and In progress groups. See ADR-0006.
 */
export const NO_STEP_ACTS: ListActs = { plan: true, step: false, move: true };

/**
 * Neither a pick nor a step, for a list that is read back and not built: a day
 * past its own. The task itself is live, so a finish and a move stand.
 */
export const READ_ACTS: ListActs = { plan: false, step: false, move: true };

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
): Press | null {
  const at = rows.findIndex((one) => one.id === on);
  const task = rows[at];

  // The cursor names a task, not a place in the list. A plan moves a row into
  // the plan group, and the cursor goes with it.
  //
  // An empty cursor sits outside the list, so a move key brings it back in
  // from the end the key comes from: `j` to the first row, `k` to the last.
  if (key === KEY_MAP.next.key)
    return pick(at === -1 ? rows[0] : rows[Math.min(at + 1, rows.length - 1)]);
  if (key === KEY_MAP.prev.key)
    return pick(at === -1 ? rows[rows.length - 1] : rows[Math.max(at - 1, 0)]);

  // Escape empties the cursor, so a person reading the page has no card named
  // at them. A cursor already empty has nothing to clear, and the press falls
  // through to whatever else reads Escape. See ADR-0015.
  if (key === KEY_MAP.clear.key) return on === null ? null : { kind: "cursor", id: null };

  if (!task) return null;
  if (key === KEY_MAP.open.key) return { kind: "open", task };

  // Backlog is unplannable, and a finished task is nothing to plan. The board
  // draws all five columns, so the key says so as well as the write. Taking a
  // task back out is never refused: plan mode holds the tasks finished today,
  // and `p` unplans one of those as the button does.
  if (key === KEY_MAP.plan.key || key === KEY_MAP.unplan.key) {
    if (!acts.plan) return null;
    const held = planned.has(task.id);
    if (!held && !isPlannable(task)) return null;
    return { kind: "act", fields: planFields(task, held) };
  }

  // A step is a step of the plan, so a task the plan does not hold, and a page
  // with no order of the person's own, have nothing to step.
  if (key === KEY_MAP.up.key || key === KEY_MAP.down.key) {
    if (!acts.step || !planned.has(task.id)) return null;
    return { kind: "act", fields: { intent: key === KEY_MAP.up.key ? "up" : "down", id: task.id } };
  }

  // `>` and `<` walk the card along the run and stop at both ends. They post
  // the move a drop posts and the select posts: a column, and no place inside
  // it. Cancelled is off the run. See ADR-0015.
  if (key === KEY_MAP.forward.key || key === KEY_MAP.back.key) {
    if (!acts.move) return null;
    const to = stepped(task.status, key === KEY_MAP.forward.key ? 1 : -1);
    if (!to) return null;
    return { kind: "act", fields: moveFields(task, to) };
  }

  // A task already finished has nothing left to finish.
  if (key === KEY_MAP.finish.key) {
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
 * Binds the keys to one flat list of tasks.
 */
export function useTaskKeys(
  rows: LiveTask[],
  planned: Set<string>,
  acts: ListActs,
  on: string | null,
  setOn: (id: string | null) => void,
  act: (fields: Record<string, string>) => void,
) {
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!isPagePress(event)) return;

      const press = pressed(event.key, rows, planned, acts, on);
      if (!press) return;

      if (press.kind === "cursor") setOn(press.id);
      else if (press.kind === "open")
        navigate(`/o/${press.task.org.slug}/t/${press.task.id}`);
      else act(press.fields);

      event.preventDefault();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, planned, acts, on, setOn, act, navigate]);
}
