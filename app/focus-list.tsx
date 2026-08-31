/**
 * The batch on the screen, and the keys that work it.
 *
 * Focus is keyboard first, like the board: `j` and `k` move, `Enter` opens,
 * `x` finishes, `d` drops the task to the end of the plan and `n` takes three
 * more once the batch is done (ADR-0009). The buttons are the second way, not
 * the only one.
 */

import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "react-router";

import type { LiveTask } from "./unified";
import { UnifiedRow, dropFields, finishFields } from "./unified-row";

function useKeys(
  rows: LiveTask[],
  droppable: boolean,
  on: string | null,
  setOn: (id: string) => void,
  act: (fields: Record<string, string>) => void,
) {
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // A person who types in a box wants the letter, not the key.
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const at = rows.findIndex((one) => one.id === on);
      const task = rows[at];
      if (event.key === "j") setOn(rows[Math.min(at + 1, rows.length - 1)]?.id ?? "");
      else if (event.key === "k") setOn(rows[Math.max(at - 1, 0)]?.id ?? "");
      else if (!task) return;
      else if (event.key === "Enter") navigate(`/o/${task.org.slug}/t/${task.id}`);
      // A task already finished has nothing left to finish, and nothing to drop.
      else if (event.key === "x") {
        if (task.finished) return;
        act(finishFields(task));
      } else if (event.key === "d") {
        if (!droppable || task.finished) return;
        act(dropFields(task));
      } else return;

      event.preventDefault();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, droppable, on, setOn, act, navigate]);
}

export function FocusList({ tasks, droppable }: { tasks: LiveTask[]; droppable: boolean }) {
  const post = useFetcher();
  const [on, setOn] = useState<string | null>(null);

  // The cursor names a task, and starts on the first of the batch.
  const cursor = tasks.some((one) => one.id === on) ? on : (tasks[0]?.id ?? null);
  useKeys(tasks, droppable, cursor, setOn, (fields) => post.submit(fields, { method: "post" }));

  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((task) => (
        <UnifiedRow
          key={task.id}
          task={task}
          planned={false}
          selected={cursor === task.id}
          domId={`row-${task.id}`}
          plannable={false}
          droppable={droppable}
        />
      ))}
    </ul>
  );
}

/**
 * The offer that ends a batch: three more tasks, from the unified view.
 *
 * It shows only where the batch holds no unfinished task, because that is the
 * whole rule of focus mode. Taking them is an act, never automatic: the end of
 * a batch is where a person stops.
 */
export function TakeMore() {
  const post = useFetcher();
  const take = post.submit;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "n") return;
      take({ intent: "more" }, { method: "post" });
      event.preventDefault();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [take]);

  return (
    <post.Form method="post">
      <button
        name="intent"
        value="more"
        className="rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700"
      >
        Take three more <kbd>n</kbd>
      </button>
    </post.Form>
  );
}
