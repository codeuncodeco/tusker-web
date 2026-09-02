/**
 * The keys the cross-org lists bind: `j` and `k` move, `Enter` opens, `p`
 * plans and `x` finishes. `>` and `<` walk the card between columns. `J` and
 * `K` step a planned task through the plan, where the page gives a person that
 * order to keep.
 *
 * The unified board and plan mode draw the same tasks in different layouts, so
 * the key map lives here rather than in either of them. Tusker is keyboard
 * first, so the buttons are the second way, not the only one.
 *
 * The org board binds the same letters from `app/board-keys.ts`. It draws
 * different rows and writes different intents, so it keeps a map of its own,
 * and the letters are shared by decision. See ADR-0016.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router";

import { stepped } from "./board";
import { isPagePress } from "./keys";
import { isPlannable, type LiveTask } from "./unified";
import { finishFields, moveFields, planFields } from "./unified-row";

/**
 * Binds the keys to one flat list of tasks.
 *
 * The cursor names a task, not a place in the list. A plan moves a row into
 * the plan group, and the cursor goes with it.
 */
export function useTaskKeys(
  rows: LiveTask[],
  planned: Set<string>,
  /** True where the page gives the person an order of their own to step. */
  ordered: boolean,
  on: string | null,
  setOn: (id: string) => void,
  act: (fields: Record<string, string>) => void,
) {
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!isPagePress(event)) return;

      const at = rows.findIndex((one) => one.id === on);
      const task = rows[at];
      if (event.key === "j") setOn(rows[Math.min(at + 1, rows.length - 1)]?.id ?? "");
      else if (event.key === "k") setOn(rows[Math.max(at - 1, 0)]?.id ?? "");
      else if (!task) return;
      else if (event.key === "Enter") navigate(`/o/${task.org.slug}/t/${task.id}`);
      // Backlog is unplannable, and a finished task is nothing to plan. The
      // board draws all five columns, so the key says so as well as the write.
      // Taking a task back out is never refused: plan mode holds the tasks
      // finished today, and `p` unplans one of those as the button does.
      else if (event.key === "p") {
        const held = planned.has(task.id);
        if (!held && !isPlannable(task)) return;
        act(planFields(task, held));
      }
      // A step is a step of the plan, so a task the plan does not hold, and a
      // page with no order of the person's own, have nothing to step.
      else if (event.key === "J" || event.key === "K") {
        if (!ordered || !planned.has(task.id)) return;
        act({ intent: event.key === "K" ? "up" : "down", id: task.id });
      }
      // `>` and `<` walk the card along the run and stop at both ends. They
      // post the move a drop posts and the select posts: a column, and no
      // place inside it. Cancelled is off the run. See ADR-0015.
      else if (event.key === ">" || event.key === "<") {
        const to = stepped(task.status, event.key === ">" ? 1 : -1);
        if (!to) return;
        act(moveFields(task, to));
      }
      // A task already finished has nothing left to finish.
      else if (event.key === "x") {
        if (task.finished) return;
        act(finishFields(task));
      } else return;

      event.preventDefault();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, planned, ordered, on, setOn, act, navigate]);
}
