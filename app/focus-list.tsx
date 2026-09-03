/**
 * The batch on the screen, and the keys that work it.
 *
 * Focus is keyboard first, like the board, and it binds the same keys through
 * the same hook: `j` and `k` move, `Enter` opens and `x` finishes. Nothing
 * here plans, steps or moves a column, because focus mode is three tasks and
 * no editing of the plan (ADR-0009). `n` takes three more once the batch is
 * done. The buttons are the second way, not the only one.
 */

import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import { keyHint } from "./key-hint";
import { KEY_MAP } from "./key-map";
import { isPagePress } from "./keys";
import type { LiveTask } from "./unified";
import { type ListActs, useTaskKeys } from "./unified-keys";
import { UnifiedRow } from "./unified-row";

/**
 * Focus mode edits no plan. It opens a task and finishes it, and that is the
 * whole of what the batch takes. See ADR-0009.
 */
const FOCUS_ACTS: ListActs = { plan: false, step: false, move: false };

/** The plan set a focus row reads. Focus plans nothing, so it holds nothing. */
const NO_PLAN: Set<string> = new Set();

export function FocusList({ tasks }: { tasks: LiveTask[] }) {
  const post = useFetcher();
  const [on, setOn] = useState<string | null>(null);

  // The cursor names a task, and starts empty, as it does on every other
  // keyed list. `j` reaches the first of the batch. See ADR-0015.
  const cursor = tasks.some((one) => one.id === on) ? on : null;
  const keyed = useTaskKeys({
    rows: tasks,
    planned: NO_PLAN,
    acts: FOCUS_ACTS,
    on: cursor,
    setOn,
    act: (fields) => post.submit(fields, { method: "post" }),
  });

  return (
    // The batch is the keyed list, and focus mode draws no box at all, so `n`
    // stays what the offer that ends a batch made it. See ADR-0022.
    <ul {...keyed("Batch")} className="flex flex-col gap-2">
      {tasks.map((task) => (
        <UnifiedRow
          key={task.id}
          task={task}
          planned={false}
          selected={cursor === task.id}
          domId={`row-${task.id}`}
          plannable={false}
        />
      ))}
    </ul>
  );
}

/**
 * The offer that ends a batch: three more tasks, from the live set.
 *
 * It shows only where the batch holds no unfinished task, because that is the
 * whole rule of focus mode. Taking them is an act, never automatic: the end of
 * a batch is where a person stops.
 */
export function TakeMore() {
  const post = useFetcher();
  const take = post.submit;
  const more = keyHint("more");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!isPagePress(event)) return;
      if (event.key !== KEY_MAP.more.key) return;
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
        {...more.keys}
        className="rounded border border-border px-2 py-1"
      >
        {KEY_MAP.more.label}
        {more.hint}
      </button>
    </post.Form>
  );
}
