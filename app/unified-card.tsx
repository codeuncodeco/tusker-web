/**
 * One card of the unified board.
 *
 * It shows its rank, the way the org board's card does: the place the board
 * draws it in, counting from one. No row stores it, and it drifts between
 * loads, because the percentile is an index over a column length that changes.
 *
 * Two things move the card: the `>` and `<` keys, which name a column, and a
 * drag, which draws where the card will land and writes that place inside its
 * own org. The order in a unified column is derived, so the card can then sit
 * a little away from the drop. There are no arrows: to say "this first" is to
 * plan it. See ADR-0006, "One order per column", and ADR-0025.
 *
 * The card is its title line and at most one line under it, which holds the
 * org chip, the fields and the due date. That line is drawn only when it holds
 * something. A drag starts from the grip, so the rest of the card scrolls.
 */

import { Link } from "react-router";

import { Dot } from "./dot";
import { Grip, useDragItem } from "./drag-lists";
import { Initials } from "./initials";
import { OrgChip } from "./org-chip";
import { taskPath, useOrigin } from "./paths";
import { type LiveTask } from "./unified";

export function UnifiedCard({
  task,
  rank,
  selected,
  domId,
  place,
}: {
  task: LiveTask;
  /** The place the board draws the card in, counting from one. */
  rank: number;
  selected: boolean;
  domId: string;
  /**
   * Puts the keyboard cursor on this card. `>` and `<` act on the cursor, and
   * `j` was the only way to move it: on a long column that put the keys near
   * the top and nowhere else. See ADR-0015.
   */
  place: () => void;
}) {
  const origin = useOrigin();
  const drag = useDragItem(task.id);

  return (
    <li
      id={domId}
      aria-current={selected ? "true" : undefined}
      onClick={place}
      ref={drag.ref}
      style={drag.style}
      // The card being dragged stays faded where it will land, and the copy
      // under the pointer is the one that moves.
      className={`flex flex-col gap-2 rounded border p-3 ${
        selected
          ? "border-fg bg-surface-2"
          : "border-border bg-surface"
      } ${drag.dragging ? "opacity-40" : ""}`}
    >
      <span className="flex items-baseline gap-2">
        <Grip grip={drag.grip} />
        <span className="tabular-nums text-dim">{rank}</span>
        <Link
          to={taskPath(task.org.slug, task.id, origin)}
          className={`flex-1 underline-offset-2 hover:underline ${
            task.finished ? "text-muted line-through" : ""
          }`}
        >
          {task.title}
        </Link>
        <Initials assignees={task.assignees} />
      </span>

      <span className="flex items-center gap-2 text-xs text-muted empty:hidden">
        <OrgChip org={task.org} />
        {/* The field strip truncates before the due date does: the due date is
            the one signal that reads the same in every org. */}
        {task.fields.length > 0 ? (
          <span className="flex min-w-0 flex-1 gap-1 truncate">
            {task.fields.map((field, at) => (
              <span key={field.key} className="flex items-center gap-1 truncate">
                {at > 0 ? <span aria-hidden="true">·</span> : null}
                <Dot color={field.color} />
                {field.value}
              </span>
            ))}
          </span>
        ) : null}
        {task.due_date ? <span className="ml-auto shrink-0 tabular-nums">{task.due_date}</span> : null}
      </span>
    </li>
  );
}
