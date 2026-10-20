/**
 * One card of the unified board.
 *
 * Two things move the card: the `>` and `<` keys, which name a column, and a
 * drag, which draws where the card will land and writes that place inside its
 * own org. The order in a unified column is derived, so the card can then sit
 * a little away from the drop. There are no arrows: to say "this first" is to
 * plan it. See ADR-0006, "One order per column", and ADR-0025.
 *
 * The card is its title line and at most one line under it, the content line.
 * A drag starts from the grip, so the rest of the card scrolls.
 */

import { Link } from "react-router";

import { colorCss } from "./colors";
import { ContentLine } from "./content-line";
import { Grip, useDragItem } from "./drag-lists";
import { FinishCircle } from "./finish-circle";
import { Initials } from "./initials";
import { keyHint } from "./key-hint";
import { taskPath, useOrigin } from "./paths";
import { type LiveTask } from "./unified";
import { moveFields, planFields } from "./unified-row";

export function UnifiedCard({
  task,
  selected,
  domId,
  place,
  showsOrg,
  planned = false,
  act,
}: {
  task: LiveTask;
  selected: boolean;
  domId: string;
  /**
   * Puts the keyboard cursor on this card. `>` and `<` act on the cursor, and
   * `j` was the only way to move it: on a long column that put the keys near
   * the top and nowhere else. See ADR-0015.
   */
  place: () => void;
  /** True when the card names its org with a chip. See `tellsOrgsApart`. */
  showsOrg: boolean;
  /** True while today's plan holds the task. */
  planned?: boolean;
  /** Posts one act on this page, as a key does: the ring and the plan toggle use it. */
  act?: (fields: Record<string, string>) => void;
}) {
  const origin = useOrigin();
  const drag = useDragItem(task.id);
  // Only work in hand can be planned. See `planFields`.
  const plannable = task.status === "todo" || task.status === "in_progress";
  const plan = keyHint(planned ? "unplan" : "plan");

  return (
    <li
      id={domId}
      aria-current={selected ? "true" : undefined}
      onClick={place}
      ref={drag.ref}
      style={drag.style}
      // The card being dragged stays faded where it will land, and the copy
      // under the pointer is the one that moves.
      className={`group/card press-soft flex flex-col gap-2 rounded border p-3 hover:shadow-md ${
        selected
          ? "border-fg bg-surface-2"
          : "border-border bg-surface"
      } ${drag.dragging ? "opacity-40" : ""}`}
    >
      <span className="flex items-baseline gap-2">
        <Grip grip={drag.grip} />
        {act ? (
          <FinishCircle
            finished={task.finished}
            title={task.title}
            color={task.org.color ? colorCss(task.org.color) : undefined}
            onFinish={() => act(moveFields(task, "done"))}
            onReopen={() => act(moveFields(task, "todo"))}
          />
        ) : null}
        <Link
          to={taskPath(task.id, origin)}
          className={`flex-1 underline-offset-2 hover:underline ${
            task.finished ? "text-muted line-through" : ""
          }`}
        >
          {task.title}
        </Link>
        {act && plannable ? (
          // One click plans it for today, where the pointer is fine; `p` does
          // the same from the keys. A planned task says so at all times.
          <button
            type="button"
            {...plan.keys}
            onClick={(event) => {
              event.stopPropagation();
              act(planFields(task, Boolean(planned)));
            }}
            className={`press shrink-0 self-center rounded-full border px-2 py-0.5 text-[0.625rem] uppercase tracking-wide ${
              planned
                ? "border-fg text-fg motion-safe:animate-pop"
                : "hidden border-border text-muted hover:border-fg hover:text-fg pointer-fine:group-hover/card:inline-flex"
            }`}
          >
            {planned ? "Today" : "Plan"}
          </button>
        ) : null}
        <Initials assignees={task.assignees} />
      </span>

      <ContentLine task={task} showsOrg={showsOrg} />
    </li>
  );
}
