/**
 * One card of the unified board.
 *
 * It shows its rank, the way the org board's card does: the place the board
 * draws it in, counting from one. No row stores it, and it drifts between
 * loads, because the percentile is an index over a column length that changes.
 *
 * Three things move the card to another column: the select, the `>` and `<`
 * keys, and a drag onto the column. All three name a column and no place
 * inside it, because the order in a unified column is derived. There are no
 * arrows for the same reason: to say "this first" is to plan it. See ADR-0006,
 * "One order per column", and ADR-0015, "A drop names a column, not a place".
 */

import { Link, useFetcher } from "react-router";

import { STATUSES, STATUS_LABEL } from "./board";
import { Dot } from "./dot";
import { Initials } from "./initials";
import { isPlannable, type LiveTask } from "./unified";
import { planFields } from "./unified-row";

export function UnifiedCard({
  task,
  rank,
  planned,
  selected,
  domId,
  place,
}: {
  task: LiveTask;
  /** The place the board draws the card in, counting from one. */
  rank: number;
  /** True when the day's plan holds the task, which turns Plan into Unplan. */
  planned: boolean;
  selected: boolean;
  domId: string;
  /**
   * Puts the keyboard cursor on this card. `>` and `<` act on the cursor, and
   * `j` was the only way to move it: on a long column that put the keys near
   * the top and nowhere else. See ADR-0015.
   */
  place: () => void;
}) {
  const move = useFetcher();
  const plan = useFetcher();
  const fields = planFields(task, planned);

  return (
    <li
      id={domId}
      aria-current={selected ? "true" : undefined}
      onClick={place}
      // The column takes the drop, so a card carries no drop handler of its
      // own: a drop on a card bubbles to the column under it.
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}
      className={`flex cursor-grab flex-col gap-2 rounded border p-3 text-sm ${
        selected
          ? "border-neutral-900 bg-neutral-50 dark:border-neutral-200 dark:bg-neutral-900"
          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      }`}
    >
      <span className="flex items-baseline gap-2">
        <span className="tabular-nums text-neutral-400">{rank}</span>
        <Link
          to={`/o/${task.org.slug}/t/${task.id}`}
          // A link drags itself, and its own drag carries a URL and no task
          // id. The card is what drags, so the title gives the gesture up.
          draggable={false}
          className={`flex-1 underline-offset-2 hover:underline ${
            task.finished ? "text-neutral-500 line-through" : ""
          }`}
        >
          {task.title}
        </Link>
        <Initials assignees={task.assignees} />
      </span>

      <span className="text-xs uppercase tracking-wide text-neutral-500">{task.org.name}</span>

      <span className="flex items-baseline gap-2 text-xs text-neutral-500">
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

      <span className="flex items-baseline gap-2">
        {/* The select posts on its own, so a move needs no script. */}
        <move.Form method="post" className="flex">
          <input type="hidden" name="intent" value="move" />
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="slug" value={task.org.slug} />
          <select
            name="status"
            aria-label={`Column for ${task.title}`}
            defaultValue={task.status}
            onChange={(event) => move.submit(event.currentTarget.form)}
            className="rounded border border-neutral-300 bg-transparent px-1 py-0.5 text-xs dark:border-neutral-700"
          >
            {STATUSES.map((one) => (
              <option key={one} value={one}>
                {STATUS_LABEL[one]}
              </option>
            ))}
          </select>
          {/* The submit the select needs when no script runs. */}
          <button className="sr-only">Move</button>
        </move.Form>

        {/* Backlog is unplannable and a finished task is nothing to plan, so
            those columns carry no button and `p` does nothing on them. */}
        {isPlannable(task) ? (
          <plan.Form method="post">
            <input type="hidden" name="id" value={task.id} />
            <input type="hidden" name="slug" value={task.org.slug} />
            <button
              name="intent"
              value={fields.intent}
              className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs dark:border-neutral-700"
            >
              {planned ? "Unplan" : "Plan"}
            </button>
          </plan.Form>
        ) : null}
      </span>
    </li>
  );
}
