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
import type { Group, GroupKey, LiveTask } from "./unified";
import { ALL_ACTS, NO_STEP_ACTS, READ_ACTS, useTaskKeys } from "./unified-keys";
import { PLAN_VERBS, UnifiedRow, type Verbs } from "./unified-row";

export function UnifiedList({
  groups,
  planned,
  day,
  namedDay = false,
  ordered = null,
  picks = true,
  label = (group) => group.label,
  verbs = PLAN_VERBS,
}: {
  groups: Group[];
  /** The task ids the page's list holds, which turn the pick verb over. */
  planned: Set<string>;
  day: string;
  /** True for a day the path named, which the browser must not talk out of. */
  namedDay?: boolean;
  /**
   * The group whose order belongs to the person, and so carries the steps and
   * the promote: the plan on plan mode, and the set on a week page.
   */
  ordered?: GroupKey | null;
  /** False where the list is read back: a day past its own takes no pick. */
  picks?: boolean;
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
  // The rows the page's own order ranks. It draws the move buttons and it
  // binds `J`, `K` and `T`, so a key reaches no act a control withholds.
  const ranked = rankedIn(groups.find((group) => group.key === ordered));
  // The cursor starts empty, and stays on its task while the list moves. A
  // task the list stops drawing takes the cursor off with it. See ADR-0015.
  const cursor = rows.some((one) => one.id === on) ? on : null;

  useLocalDay(day, !namedDay);
  // One of three constants, and never a fresh object: the hook re-binds the
  // window on every change of what it is given.
  const acts = !picks ? READ_ACTS : ordered !== null ? ALL_ACTS : NO_STEP_ACTS;
  useTaskKeys(
    rows,
    planned,
    acts,
    cursor,
    setOn,
    (fields) => post.submit(fields, { method: "post" }),
    new Set(ranked.map((one) => one.id)),
  );

  // The cursor follows the keys down a list longer than the window.
  useEffect(() => {
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div ref={list} className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2">
          <h2 className="font-mono uppercase tracking-wide text-muted">
            {label(group)} <span className="text-dim">{group.tasks.length}</span>
          </h2>

          <ul className="flex flex-col gap-2">
            {group.tasks.map((task) => (
              <UnifiedRow
                key={task.id}
                task={task}
                planned={planned.has(task.id)}
                plannable={picks}
                verbs={verbs}
                selected={cursor === task.id}
                domId={`row-${task.id}`}
                place={() => setOn(task.id)}
                moves={movesFor(ranked, task)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * The rows one group ranks, in the order it ranks them, or none where the page
 * owns no order at all.
 *
 * A group that sinks draws its finished rows under the live ones and never
 * re-ranks them, so they are out of the order and the last live row is the
 * last row that moves. A plan keeps a task finished today where the day put
 * it, so there every row is ranked. See ADR-0021.
 */
function rankedIn(group: Group | undefined): LiveTask[] {
  if (!group) return [];
  return group.sinks ? group.tasks.filter((one) => !one.finished) : group.tasks;
}

/** Which way one row can move, or nothing for a row no order ranks. */
function movesFor(ranked: LiveTask[], task: LiveTask): { up: boolean; down: boolean } | undefined {
  const at = ranked.indexOf(task);
  if (at === -1) return undefined;
  return { up: at > 0, down: at < ranked.length - 1 };
}
