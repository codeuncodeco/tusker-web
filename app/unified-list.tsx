/**
 * The list plan mode and focus mode draw: the live set, in one flat sequence.
 *
 * The unified board draws the same tasks as columns. The three pages share the
 * live set and the sort, and lay them out differently: a plan drawn from a
 * Done column is nonsense. The sort stays one, which is what ADR-0006 asks
 * for; the layout does not.
 */

import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { useLocalDay } from "./local-day";
import type { Group, GroupKey } from "./unified";
import { useTaskKeys } from "./unified-keys";
import { PLAN_VERBS, UnifiedRow, type Verbs } from "./unified-row";

export function UnifiedList({
  groups,
  planned,
  day,
  namedDay = false,
  ordered = null,
  label = (group) => group.label,
  verbs = PLAN_VERBS,
}: {
  groups: Group[];
  /** The task ids the page's list holds, which turn the pick verb over. */
  planned: Set<string>;
  day: string;
  /** True for a day the path named, which the browser must not talk out of. */
  namedDay?: boolean;
  /** The group whose order belongs to the person, and so carries the steps. */
  ordered?: GroupKey | null;
  /** The heading one group carries, where a route names it its own way. */
  label?: (group: Group) => string;
  /** What the pick button reads, where a page picks into a list of its own. */
  verbs?: Verbs;
}) {
  const post = useFetcher();
  const [on, setOn] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // One flat order, so `j` and `k` walk the page the way a person reads it.
  const rows = groups.flatMap((group) => group.tasks);
  // The cursor starts at the top, and stays on its task while the list moves.
  const cursor = rows.some((one) => one.id === on) ? on : (rows[0]?.id ?? null);

  useLocalDay(day, !namedDay);
  useTaskKeys(rows, planned, ordered !== null, cursor, setOn, (fields) =>
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
                verbs={verbs}
                selected={cursor === task.id}
                domId={`row-${task.id}`}
                place={() => setOn(task.id)}
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
