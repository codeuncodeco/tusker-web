import { Link, useFetcher } from "react-router";

import { Dot } from "./dot";
import type { LiveTask } from "./unified";

/** The fields a plan or a finish posts, so a key and a button send the same thing. */
export function planFields(task: LiveTask, planned: boolean) {
  return { intent: planned ? "unplan" : "plan", id: task.id, slug: task.org.slug };
}

export function finishFields(task: LiveTask) {
  return { intent: "finish", id: task.id, slug: task.org.slug };
}

/** What a drop posts: focus mode moves the task down today's plan. See ADR-0009. */
export function dropFields(task: LiveTask) {
  return { intent: "drop", id: task.id, slug: task.org.slug };
}

/**
 * One row of the unified view, and of plan mode, so the two lists cannot drift
 * apart.
 *
 * A card shows the title, the org, the org's `show_on_card` fields joined by
 * `·`, and the due date rightmost. The field strip truncates before the due
 * date does: the due date is the one signal that reads the same in every org.
 *
 * The two acts sit in a form of their own, so they work with no script. The
 * `p` and `x` keys post the same fields.
 */
export function UnifiedRow({
  task,
  planned,
  selected,
  domId,
  moves,
  plannable = true,
  droppable = false,
}: {
  task: LiveTask;
  /** True when the day's plan holds the task, which turns Plan into Unplan. */
  planned: boolean;
  selected: boolean;
  domId: string;
  /**
   * Which way the row can step, in a list whose order a person owns. Nothing
   * here leaves the arrows off, which is the unified view: that order is
   * derived, and to say "this first" is to plan it. See ADR-0006, "One order per
   * column".
   */
  moves?: { up: boolean; down: boolean };
  /** False where planning a task means nothing, which is focus mode. */
  plannable?: boolean;
  /** True where a task can leave the screen unfinished: focus mode, with a plan. */
  droppable?: boolean;
}) {
  const post = useFetcher();
  const plan = planFields(task, planned);

  return (
    <li
      id={domId}
      aria-current={selected ? "true" : undefined}
      className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded border p-3 text-sm ${
        selected
          ? "border-neutral-900 bg-neutral-50 dark:border-neutral-200 dark:bg-neutral-900"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <Link
        to={`/o/${task.org.slug}/t/${task.id}`}
        className={`underline-offset-2 hover:underline ${
          task.finished ? "text-neutral-500 line-through" : ""
        }`}
      >
        {task.title}
      </Link>

      <span className="shrink-0 text-xs uppercase tracking-wide text-neutral-500">
        {task.org.name}
      </span>

      <span className="flex min-w-0 flex-1 gap-1 truncate text-xs text-neutral-500">
        {task.fields.map((field, at) => (
          <span key={field.key} className="flex items-center gap-1 truncate">
            {at > 0 ? <span aria-hidden="true">·</span> : null}
            <Dot color={field.color} />
            {field.value}
          </span>
        ))}
      </span>

      <post.Form method="post" className="flex shrink-0 gap-2">
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="slug" value={task.org.slug} />
        {moves ? (
          <>
            <button
              name="intent"
              value="up"
              disabled={!moves.up}
              aria-label={`Move ${task.title} up`}
              className="rounded border border-neutral-300 px-1 text-xs disabled:opacity-30 dark:border-neutral-700"
            >
              ↑
            </button>
            <button
              name="intent"
              value="down"
              disabled={!moves.down}
              aria-label={`Move ${task.title} down`}
              className="rounded border border-neutral-300 px-1 text-xs disabled:opacity-30 dark:border-neutral-700"
            >
              ↓
            </button>
          </>
        ) : null}
        {plannable ? (
          <button
            name="intent"
            value={plan.intent}
            className="rounded border border-neutral-300 px-1.5 text-xs dark:border-neutral-700"
          >
            {planned ? "Unplan" : "Plan"}
          </button>
        ) : null}
        {droppable ? (
          <button
            name="intent"
            value="drop"
            disabled={task.finished}
            aria-label={`Drop ${task.title} to the end of the plan`}
            className="rounded border border-neutral-300 px-1.5 text-xs disabled:opacity-30 dark:border-neutral-700"
          >
            Drop
          </button>
        ) : null}
        <button
          name="intent"
          value="finish"
          disabled={task.finished}
          className="rounded border border-neutral-300 px-1.5 text-xs disabled:opacity-30 dark:border-neutral-700"
        >
          Finish
        </button>
      </post.Form>

      {/* Rightmost, and it never truncates: the due date is the one signal
          that reads the same in every org. */}
      {task.due_date ? (
        <span className="shrink-0 tabular-nums text-xs text-neutral-500">{task.due_date}</span>
      ) : null}
    </li>
  );
}
