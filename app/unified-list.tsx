/**
 * The list both cross-org pages draw: the unified view, and plan mode with
 * selection turned on.
 *
 * One sort, one row component, one set of keys. Two cross-org lists that drew
 * or sorted differently is a bug the day one of them changes, so the page
 * shell lives here and a route brings only its own words.
 */

import { useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";

import { useLocalDay } from "./local-day";
import type { Group, GroupKey, LiveTask } from "./unified";
import { UnifiedRow, finishFields, planFields } from "./unified-row";

/**
 * The keys the list binds: `j` and `k` move, `Enter` opens, `p` plans and `x`
 * finishes. `J` and `K` step a planned task through the plan, where the page
 * gives a person that order to keep. Tusker is keyboard first, so the arrow
 * buttons are the second way, not the only one.
 *
 * The cursor names a task, not a place in the list. A plan moves a row into
 * the plan group, and the cursor goes with it.
 */
function useKeys(
  rows: LiveTask[],
  planned: Set<string>,
  ordered: boolean,
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
      else if (event.key === "p") act(planFields(task, planned.has(task.id)));
      // A step is a step of the plan, so a task the plan does not hold, and a
      // page with no order of the person's own, have nothing to step.
      else if (event.key === "J" || event.key === "K") {
        if (!ordered || !planned.has(task.id)) return;
        act({ intent: event.key === "K" ? "up" : "down", id: task.id });
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

export function UnifiedList({
  groups,
  planned,
  day,
  namedDay = false,
  ordered = null,
  label = (group) => group.label,
}: {
  groups: Group[];
  /** The task ids the day's plan holds, which turn Plan into Unplan. */
  planned: Set<string>;
  day: string;
  /** True for a day the path named, which the browser must not talk out of. */
  namedDay?: boolean;
  /** The group whose order belongs to the person, and so carries the steps. */
  ordered?: GroupKey | null;
  /** The heading one group carries, where a route names it its own way. */
  label?: (group: Group) => string;
}) {
  const post = useFetcher();
  const [on, setOn] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // One flat order, so `j` and `k` walk the page the way a person reads it.
  const rows = groups.flatMap((group) => group.tasks);
  // The cursor starts at the top, and stays on its task while the list moves.
  const cursor = rows.some((one) => one.id === on) ? on : (rows[0]?.id ?? null);

  useLocalDay(day, !namedDay);
  useKeys(rows, planned, ordered !== null, cursor, setOn, (fields) =>
    post.submit(fields, { method: "post" }),
  );

  // The cursor follows the keys down a list longer than the window.
  useEffect(() => {
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div ref={list} className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            {label(group)} <span className="text-neutral-400">{group.tasks.length}</span>
          </h2>

          <ul className="flex flex-col gap-2">
            {group.tasks.map((task, at) => (
              <UnifiedRow
                key={task.id}
                task={task}
                planned={planned.has(task.id)}
                selected={cursor === task.id}
                domId={`row-${task.id}`}
                moves={
                  group.key === ordered
                    ? { up: at > 0, down: at < group.tasks.length - 1 }
                    : undefined
                }
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
