import { Link, useFetcher } from "react-router";

import type { Status } from "./board";
import { Dot } from "./dot";
import { keyHint } from "./key-hint";
import { KEY_MAP } from "./key-map";
import { OrgChip } from "./org-chip";
import type { LiveTask } from "./unified";

/** The fields a pick or a finish posts, so a key and a button send the same thing. */
export function planFields(task: LiveTask, planned: boolean) {
  return { intent: planned ? "unplan" : "plan", id: task.id, slug: task.org.slug };
}

/**
 * What the two sides of the pick button read. The act is one act, and each
 * page names its own list: a day is planned, and a week is picked.
 */
export type Verbs = { pick: string; drop: string };

export const PLAN_VERBS: Verbs = { pick: KEY_MAP.plan.label, drop: KEY_MAP.unplan.label };

/**
 * What a move posts: the column the card lands in, and no place inside it. The
 * `>` and `<` keys send this, and so does a drop on a unified column. The
 * card's select posts the same four fields as a form, so it needs no script.
 * See ADR-0015.
 */
export function moveFields(task: LiveTask, status: Status) {
  return { intent: "move", id: task.id, slug: task.org.slug, status };
}

export function finishFields(task: LiveTask) {
  return { intent: "finish", id: task.id, slug: task.org.slug };
}

/**
 * One row of plan mode and of focus mode, so the two lists cannot drift apart.
 * The unified board draws a card of its own.
 *
 * A card shows the title, the org, the org's `show_on_card` fields joined by
 * `·`, and the due date rightmost. The field strip truncates before the due
 * date does: the due date is the one signal that reads the same in every org.
 *
 * The two acts sit in a form of their own, so they work with no script. The
 * `p` and `x` keys post the same fields, and each button carries its key.
 */
export function UnifiedRow({
  task,
  planned,
  selected,
  domId,
  place,
  moves,
  plannable = true,
  verbs = PLAN_VERBS,
}: {
  task: LiveTask;
  /** True when the page's list holds the task, which turns the verb over. */
  planned: boolean;
  selected: boolean;
  domId: string;
  /**
   * Puts the keyboard cursor on this row. A page with keys that act on the
   * cursor gives one, so a long list is reachable by pointer as well as by
   * `j`. Focus mode gives none: a batch is three rows.
   */
  place?: () => void;
  /**
   * Which way the row can step, in a list whose order a person owns. Nothing
   * here leaves the arrows off, which is every list but the plan: that order is
   * derived, and to say "this first" is to plan it. See ADR-0006, "One order per
   * column".
   */
  moves?: { up: boolean; down: boolean };
  /** False where planning a task means nothing, which is focus mode. */
  plannable?: boolean;
  /** What the pick button reads, where a page picks into a list of its own. */
  verbs?: Verbs;
}) {
  const post = useFetcher();
  const plan = planFields(task, planned);
  const up = keyHint("up");
  const down = keyHint("down");
  const pick = keyHint(planned ? "unplan" : "plan");
  const finish = keyHint("finish");

  return (
    <li
      id={domId}
      aria-current={selected ? "true" : undefined}
      onClick={place}
      className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded border p-3 ${
        selected
          ? "border-fg bg-surface-2"
          : "border-border"
      }`}
    >
      <Link
        to={`/o/${task.org.slug}/t/${task.id}`}
        className={`underline-offset-2 hover:underline ${
          task.finished ? "text-muted line-through" : ""
        }`}
      >
        {task.title}
      </Link>

      <OrgChip org={task.org} />

      <span className="flex min-w-0 flex-1 gap-1 truncate text-xs text-muted">
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
              {...up.keys}
              className="rounded border border-border px-1 text-xs disabled:opacity-30"
            >
              ↑{up.hint}
            </button>
            <button
              name="intent"
              value="down"
              disabled={!moves.down}
              aria-label={`Move ${task.title} down`}
              {...down.keys}
              className="rounded border border-border px-1 text-xs disabled:opacity-30"
            >
              ↓{down.hint}
            </button>
          </>
        ) : null}
        {plannable ? (
          <button
            name="intent"
            value={plan.intent}
            {...pick.keys}
            className="rounded border border-border px-1.5 text-xs"
          >
            {planned ? verbs.drop : verbs.pick}
            {pick.hint}
          </button>
        ) : null}
        <button
          name="intent"
          value="finish"
          disabled={task.finished}
          {...finish.keys}
          className="rounded border border-border px-1.5 text-xs disabled:opacity-30"
        >
          {KEY_MAP.finish.label}
          {finish.hint}
        </button>
      </post.Form>

      {/* Rightmost, and it never truncates: the due date is the one signal
          that reads the same in every org. */}
      {task.due_date ? (
        <span className="shrink-0 tabular-nums text-xs text-muted">{task.due_date}</span>
      ) : null}
    </li>
  );
}
