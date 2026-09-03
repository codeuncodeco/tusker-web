/**
 * One card of the unified board.
 *
 * It shows its rank, the way the org board's card does: the place the board
 * draws it in, counting from one. No row stores it, and it drifts between
 * loads, because the percentile is an index over a column length that changes.
 *
 * Two things move the card to another column: the `>` and `<` keys, and a drag
 * onto the column. Both name a column and no place inside it, because the
 * order in a unified column is derived. There are no arrows for the same
 * reason: to say "this first" is to plan it. See ADR-0006, "One order per
 * column", and ADR-0015, "A drop names a column, not a place".
 */

import { Link } from "react-router";

import { Dot } from "./dot";
import { Initials } from "./initials";
import { OrgChip } from "./org-chip";
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
  return (
    <li
      id={domId}
      aria-current={selected ? "true" : undefined}
      onClick={place}
      // The column takes the drop, so a card carries no drop handler of its
      // own: a drop on a card bubbles to the column under it.
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}
      className={`flex cursor-grab flex-col gap-2 rounded border p-3 ${
        selected
          ? "border-fg bg-surface-2"
          : "border-border bg-surface"
      }`}
    >
      <span className="flex items-baseline gap-2">
        <span className="tabular-nums text-dim">{rank}</span>
        <Link
          to={`/o/${task.org.slug}/t/${task.id}`}
          // A link drags itself, and its own drag carries a URL and no task
          // id. The card is what drags, so the title gives the gesture up.
          draggable={false}
          className={`flex-1 underline-offset-2 hover:underline ${
            task.finished ? "text-muted line-through" : ""
          }`}
        >
          {task.title}
        </Link>
        <Initials assignees={task.assignees} />
      </span>

      <span className="flex">
        <OrgChip org={task.org} />
      </span>

      <span className="flex items-baseline gap-2 text-xs text-muted">
        {/* The field strip truncates before the due date does: the due date is
            the one signal that reads the same in every org. */}
        <span className="flex min-w-0 flex-1 gap-1 truncate">
          {task.fields.map((field, at) => (
            <span key={field.key} className="flex items-center gap-1 truncate">
              {at > 0 ? <span aria-hidden="true">·</span> : null}
              <Dot color={field.color} />
              {field.value}
            </span>
          ))}
        </span>
        {task.due_date ? <span className="shrink-0 tabular-nums">{task.due_date}</span> : null}
      </span>
    </li>
  );
}
