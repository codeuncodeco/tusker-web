import { useFetcher } from "react-router";
import { Link } from "react-router";

import type { Live } from "./unified";

/** The fields a plan or a finish posts, so a key and a button send the same thing. */
export function planFields(task: Live, planned: boolean) {
  return { intent: planned ? "unplan" : "plan", id: task.id, slug: task.org.slug };
}

export function finishFields(task: Live) {
  return { intent: "finish", id: task.id, slug: task.org.slug };
}

/**
 * One row of the unified view. Plan mode (#36) draws the same component with
 * selection turned on, so the two lists cannot drift apart.
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
}: {
  task: Live;
  /** True when today's plan holds the task, which turns Plan into Unplan. */
  planned: boolean;
  selected: boolean;
  domId: string;
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

      <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">
        {task.fields.map((field) => field.value).join(" · ")}
      </span>

      {task.due_date ? (
        <span className="shrink-0 tabular-nums text-xs text-neutral-500">{task.due_date}</span>
      ) : null}

      <post.Form method="post" className="flex shrink-0 gap-2">
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="slug" value={task.org.slug} />
        <button
          name="intent"
          value={plan.intent}
          className="rounded border border-neutral-300 px-1.5 text-xs dark:border-neutral-700"
        >
          {planned ? "Unplan" : "Plan"}
        </button>
        <button
          name="intent"
          value="finish"
          disabled={task.finished}
          className="rounded border border-neutral-300 px-1.5 text-xs disabled:opacity-30 dark:border-neutral-700"
        >
          Finish
        </button>
      </post.Form>
    </li>
  );
}
