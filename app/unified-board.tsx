/**
 * The unified board: one person's tasks across every org they belong to, in
 * the five columns the org board draws.
 *
 * A person who learns the org board meets the same page across all of them.
 * The layout is the org board's; the order is the unified sort, and it is
 * derived: no card is dragged into a place and no card steps. See ADR-0006,
 * "One order per column".
 *
 * A card still moves between columns, because a column is a status. The drop
 * target is the whole column and no insertion line is drawn, so the gesture
 * names a column and never a place. See ADR-0015.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { isFinished, type Status } from "./board";
import { ColumnSweep } from "./column-sweep";
import type { OrgHeld } from "./current-org";
import type { Assignee } from "./assignees";
import { useLocalDay } from "./local-day";
import type { Column } from "./unified";
import { UnifiedAdd } from "./unified-add";
import { UnifiedCard } from "./unified-card";
import { NO_STEP_ACTS, useTaskKeys } from "./unified-keys";
import { moveFields } from "./unified-row";

export function UnifiedBoard({
  columns,
  orgs,
  members,
  planned,
  day,
}: {
  columns: Column[];
  /** Every org the person belongs to, for the org picker on every box. */
  orgs: OrgHeld[];
  /** The members of every team org, for the assignee picker on every box. */
  members: Record<string, Assignee[]>;
  /** The task ids the day's plan holds, which turn Plan into Unplan. */
  planned: Set<string>;
  day: string;
}) {
  const post = useFetcher();
  const [on, setOn] = useState<string | null>(null);
  // The name of every org, for the archive links the swept toast carries. It
  // is made once, because the sweep re-binds its effect on a new object.
  const names = useMemo(
    () => Object.fromEntries(orgs.map((org) => [org.slug, org.name])),
    [orgs],
  );
  // The column a dragged card is over, which draws the outline that says where
  // it will land. One card is dragged at a time, so one column is named.
  const [over, setOver] = useState<Status | null>(null);
  const board = useRef<HTMLDivElement>(null);

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
  useTaskKeys(rows, planned, NO_STEP_ACTS, cursor, setOn, (fields) =>
    post.submit(fields, { method: "post" }),
  );

  /**
   * A drop on a column, wherever in it the pointer let go. It posts the move
   * the select and the keys post: `moveTask` runs with `before: null`, so the
   * card lands at the bottom of that column in its own org, as the org board's
   * column drop writes it. See ADR-0015.
   *
   * The card then draws where percentile order puts it, which is usually not
   * where the pointer let go. The cursor goes to the card, so the person can
   * see it and keep working it by key.
   */
  function onDrop(status: Status, event: React.DragEvent) {
    event.preventDefault();
    setOver(null);
    const dragged = rows.find((one) => one.id === event.dataTransfer.getData("text/plain"));
    if (!dragged || dragged.status === status) return;
    setOn(dragged.id);
    post.submit(moveFields(dragged, status), { method: "post" });
  }

  // The cursor follows the keys down a column longer than the window.
  useEffect(() => {
    board.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div
      ref={board}
      // A cancelled drag raises no drop, so the outline is cleared here: the
      // end of a drag bubbles from the card to the board whatever ended it.
      onDragEnd={() => setOver(null)}
      // The row holds still, and each column scrolls inside itself.
      className="flex flex-1 gap-4 overflow-x-auto sm:min-h-0"
    >
      {columns.map((column) => (
        <section
          key={column.status}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(column.status);
          }}
          // A drag over a card raises leave on the column it is still inside,
          // so the outline stays until the pointer is out of the column.
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
          }}
          onDrop={(event) => onDrop(column.status, event)}
          // Every column takes an equal share of the width, down to the width
          // it always had. Past that the row scrolls sideways.
          //
          // The outline says where the card will land. It borrows the colour a
          // selected card carries, because both mean "this one".
          className={`flex min-w-72 flex-1 flex-col gap-3 rounded-lg border p-3 ${
            over === column.status ? "border-fg" : "border-border"
          }`}
        >
          <div className="flex items-baseline gap-3">
            <h2 className="font-mono uppercase tracking-wide text-muted">
              {column.label} <span className="text-dim">{column.tasks.length}</span>
            </h2>
            {/* The sweep acts on the whole column, so it is column chrome, and
                it sits with the name and the count as it does on the org
                board. A column of this board holds cards of several orgs, so
                each card names the org that holds it, and the toast links to
                the archive of every org the sweep touched. See ADR-0019. */}
            {isFinished(column.status) ? (
              <ColumnSweep
                label={column.label}
                cards={column.tasks.map((task) => ({ id: task.id, slug: task.org.slug }))}
                undoAt="/me"
                names={names}
              />
            ) : null}
          </div>

          {/* One box per column, and the column names the status. The picker
              starts at the personal org every time. See ADR-0012. */}
          <UnifiedAdd
            orgs={orgs}
            members={members}
            status={column.status}
            label={`Add to ${column.label}`}
            // One key names one box, and To do is where an add goes by hand.
            addKey={column.status === "todo"}
          />

          {/* The heading and the box stay pinned, and only this scrolls. The
              gutter is reserved, so a full column is as wide as an empty one,
              which is the point of the equal split. */}
          <ul className="flex flex-col gap-2 [scrollbar-gutter:stable] sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
            {column.tasks.map((task, at) => (
              <UnifiedCard
                key={task.id}
                task={task}
                rank={at + 1}
                selected={cursor === task.id}
                domId={`card-${task.id}`}
                place={() => setOn(task.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

