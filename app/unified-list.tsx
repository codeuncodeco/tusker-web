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

import { landing } from "./drag";
import { DragCopy, DragLists, DropList, type Drop } from "./drag-lists";
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
  drags = false,
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
  /**
   * True where a drag places a row of the `ordered` group: plan mode. A drop
   * posts the row it lands above, through the same route as the steps.
   * See ADR-0025.
   */
  drags?: boolean;
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
  const acts = !picks ? READ_ACTS : ordered !== null ? ALL_ACTS : NO_STEP_ACTS;
  // The keys are live while focus is in one of the lists below, and the props
  // are what makes one of those a keyed list. See ADR-0022.
  const keyed = useTaskKeys({
    rows,
    planned,
    acts,
    on: cursor,
    setOn,
    act: (fields) => post.submit(fields, { method: "post" }),
    ranked: new Set(ranked.map((one) => one.id)),
  });

  // The cursor follows the keys down a list longer than the window.
  useEffect(() => {
    list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // Only the ranked rows drag: they are the order the person owns. A list
  // with no such group holds nothing to drag.
  const dragged = drags && ordered !== null ? ordered : null;
  const tasks = new Map(rows.map((one) => [one.id, one]));

  /** A drop names the row it lands above, or none for the foot. */
  function onDrop({ id, order }: Drop) {
    setOn(id);
    post.submit({ intent: "place", id, before: landing(order, id) ?? "" }, { method: "post" });
  }

  return (
    <DragLists
      lists={dragged === null ? {} : { [dragged]: ranked.map((one) => one.id) }}
      onDrop={onDrop}
      busy={post.state !== "idle"}
      overlay={(id) => <DragCopy title={tasks.get(id)?.title ?? ""} />}
    >
      {(shown) => (
        <div ref={list} className="flex flex-col gap-6">
          {groups.map((group) => {
            const drags = group.key === dragged;
            // A ranked group draws its rows in the order the drag holds, and
            // the rows no order ranks after them, where they always sit.
            const drawn = drags
              ? [
                  ...shown[group.key].flatMap((id) => tasks.get(id) ?? []),
                  ...group.tasks.filter((one) => !ranked.includes(one)),
                ]
              : group.tasks;
            const order = drags ? drawn.filter((one) => ranked.includes(one)) : ranked;
            return (
              <section key={group.key} className="flex flex-col gap-2">
                <h2 className="font-mono uppercase tracking-wide text-muted">
                  {label(group)} <span className="text-dim">{group.tasks.length}</span>
                </h2>

                {/* The rows and nothing else: the box a page draws sits above
                    this, outside every keyed list. */}
                <DropList
                  id={group.key}
                  ids={drags ? shown[group.key] : []}
                  props={keyed(`${label(group)} tasks`)}
                  className="flex flex-col gap-2"
                >
                  {drawn.map((task) => (
                    <UnifiedRow
                      key={task.id}
                      task={task}
                      planned={planned.has(task.id)}
                      plannable={picks}
                      verbs={verbs}
                      selected={cursor === task.id}
                      domId={`row-${task.id}`}
                      place={() => setOn(task.id)}
                      moves={movesFor(order, task)}
                      drags={drags && ranked.includes(task)}
                    />
                  ))}
                </DropList>
              </section>
            );
          })}
        </div>
      )}
    </DragLists>
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
