/**
 * The unified board: one person's tasks across every org they belong to, in
 * the five columns the org board draws.
 *
 * A person who learns the org board meets the same page across all of them.
 * The layout is the org board's; the order is the unified sort, and it is
 * derived: no card steps. See ADR-0006,
 * "One order per column".
 *
 * A card still moves by drag, and the drag draws where it will land. The drop
 * writes the column and a place inside the card's own org, and percentile
 * order then draws the card, which can sit a little away from the drop.
 * See ADR-0025, which amends ADR-0015.
 *
 * The board has one quick-add box, above the columns and outside every one,
 * and what it adds lands in To do. A task meant for another column is added
 * and then moved. The page draws it, in its top row beside the filters.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { isFinished, type Status } from "./board";
import { ColumnSweep } from "./column-sweep";
import { landingInOrg } from "./drag";
import { DragCopy, DragLists, DropList, type Drop } from "./drag-lists";
import type { OrgHeld } from "./current-org";
import { useLocalDay } from "./local-day";
import { addsSent, tasksSent, usePost, useSent } from "./pending";
import { tellsOrgsApart } from "./org-chip";
import { PendingAdds } from "./pending-adds";
import { revealCursor } from "./top-row";
import { columnsFor, type Column } from "./unified";
import { UnifiedCard } from "./unified-card";
import { NO_STEP_ACTS, useTaskKeys } from "./unified-keys";
import { moveFields } from "./unified-row";

export function UnifiedBoard({
  columns: answered,
  orgs,
  planned: picked,
  day,
}: {
  columns: Column[];
  /** Every org the person belongs to, for the org on a card and the swept toast's links. */
  orgs: OrgHeld[];
  /** The task ids the day's plan holds, which turn Plan into Unplan. */
  planned: Set<string>;
  day: string;
}) {
  // The board as the server holds it, with every post still in flight laid
  // over it: a moved card in its new column and a pick already picked, so a
  // second `p` on the same card reads the first. See #168.
  const sent = useSent();
  const drawn = tasksSent(
    answered.flatMap((column) => column.tasks),
    [...picked],
    sent,
  );
  const columns = columnsFor(
    drawn.tasks,
    answered.map((column) => column.status),
  );
  const planned = new Set(drawn.picked);
  // A post per press, so every press of a burst is drawn.
  const post = usePost();
  const [on, setOn] = useState<string | null>(null);
  // The name of every org, for the archive links the swept toast carries. It
  // is made once, because the sweep re-binds its effect on a new object.
  const names = useMemo(
    () => Object.fromEntries(orgs.map((org) => [org.slug, org.name])),
    [orgs],
  );
  const board = useRef<HTMLDivElement>(null);
  const showsOrg = tellsOrgsApart(orgs);

  // One flat order, so `j` and `k` walk the board column by column, the way a
  // person reads it.
  const rows = columns.flatMap((column) => column.tasks);
  // The cursor starts empty, and stays on its task while the board moves. A
  // task the board stops drawing takes the cursor off with it. See ADR-0015.
  const cursor = rows.some((one) => one.id === on) ? on : null;

  // The chip speaks for today, so the board must know which day that is where
  // the person is, not where the Worker runs.
  useLocalDay(day);
  // Nothing here steps: the order in a column is derived, and to say "this
  // first" is to plan it. See ADR-0006, "One order per column".
  //
  // The columns come with the rows, because this is a board: the arrows cross
  // the columns the letters walk. See ADR-0022.
  const keyed = useTaskKeys({
    rows,
    planned,
    acts: NO_STEP_ACTS,
    on: cursor,
    setOn,
    act: post,
    columns: columns.map((column) => column.tasks.map((task) => task.id)),
  });

  // Every card the board draws, by id, so a column the drag reorders can draw
  // its cards in the order it holds.
  const tasks = new Map(rows.map((one) => [one.id, one]));

  /**
   * A drop posts the column, and a place in the card's own org: above the
   * nearest card of that org below the drop, or at the bottom of the org's
   * column when there is none. A place is stored inside one org, so a card of
   * another org names nothing. See ADR-0025.
   *
   * The card then draws where percentile order puts it, which can be a little
   * away from the drop. The cursor goes to the card, so the person can see it
   * and keep working it by key.
   */
  function onDrop({ id, list, order }: Drop) {
    const dragged = tasks.get(id);
    if (!dragged) return;
    const before = landingInOrg(order, id, (one) => tasks.get(one)?.org.slug);
    setOn(id);
    post(moveFields(dragged, list as Status, before));
  }

  // The cursor follows the keys down a column longer than the window, and
  // stays clear of the Top row stuck over it.
  useEffect(() => revealCursor(board.current), [cursor]);

  return (
    <>
      <DragLists
        lists={Object.fromEntries(
          columns.map((column) => [column.status, column.tasks.map((one) => one.id)]),
        )}
        onDrop={onDrop}
        overlay={(id) => <DragCopy title={tasks.get(id)?.title ?? ""} />}
      >
        {(shown) => (
          // Each column is as long as its cards, and the page scrolls. The
          // columns are panes: a divider splits them, and a card is the one
          // thing on the board with an edge. See #184 and #191.
          <div ref={board} className="flex flex-1 divide-x divide-border overflow-x-auto">
            {columns.map((column) => {
              const cards = shown[column.status].flatMap((id) => tasks.get(id) ?? []);
              return (
                <section
                  key={column.status}
                  // Every column takes an equal share of the width, down to the
                  // width it always had. Past that the row scrolls sideways.
                  className="flex min-w-72 flex-1 flex-col gap-3 px-4 first:pl-0 last:pr-0"
                >
                  <div className="flex items-baseline gap-3">
                    <h2 className="font-mono uppercase tracking-wide text-muted">
                      {column.label} <span className="text-dim">{column.tasks.length}</span>
                    </h2>
                    {/* The sweep acts on the whole column, so it is column chrome,
                        and it sits with the name and the count as it does on the
                        org board. A column of this board holds cards of several
                        orgs, so each card names the org that holds it where the
                        person is in more than one, and the toast links to the
                        archive of every org the sweep touched. See ADR-0019. */}
                    {isFinished(column.status) ? (
                      <ColumnSweep
                        label={column.label}
                        cards={column.tasks.map((task) => ({ id: task.id, slug: task.org.slug }))}
                        undoAt="/me"
                        names={names}
                      />
                    ) : null}
                  </div>

                  {/* As long as its cards, and the page scrolls, not the list.
                      It fills the rest of a short column, so a drop below the
                      last card still lands in it. The focus outline is drawn
                      inside, as the row clips what is past its edge, and
                      the floor gives an empty column a box to draw it on. See
                      #193. */}
                  <DropList
                    id={column.status}
                    ids={cards.map((one) => one.id)}
                    props={keyed(`${column.label} tasks`)}
                    className="flex min-h-12 flex-1 flex-col gap-2 focus-visible:-outline-offset-2"
                  >
                    {/* The box files into To do, so an add in flight draws there. */}
                    {column.status === "todo" ? <PendingAdds titles={addsSent(sent)} /> : null}
                    {cards.map((task) => (
                      <UnifiedCard
                        key={task.id}
                        task={task}
                        selected={cursor === task.id}
                        domId={`card-${task.id}`}
                        place={() => setOn(task.id)}
                        showsOrg={showsOrg}
                      />
                    ))}
                  </DropList>
                </section>
              );
            })}
          </div>
        )}
      </DragLists>
    </>
  );
}
