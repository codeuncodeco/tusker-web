import { Link, useFetcher } from "react-router";

import type { Status } from "./board";
import { Dot } from "./dot";
import { Grip, useDragItem } from "./drag-lists";
import { keyHint } from "./key-hint";
import { KEY_MAP } from "./key-map";
import { OrgChip } from "./org-chip";
import { taskPath, useOrigin } from "./paths";
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
 * What a move posts: the column the card lands in, and the card of its own org
 * it lands above. The `>` and `<` keys name no card, and the task lands at the
 * bottom of its org. A drop on the unified board names the card. See ADR-0025.
 */
export function moveFields(task: LiveTask, status: Status, before: string | null = null) {
  const move = { intent: "move", id: task.id, slug: task.org.slug, status };
  return before === null ? move : { ...move, before };
}

export function finishFields(task: LiveTask) {
  return { intent: "finish", id: task.id, slug: task.org.slug };
}

/**
 * One row of plan mode and of focus mode, so the two lists cannot drift apart.
 * The unified board draws a card of its own.
 *
 * A row is its title line and one line under it. The title line holds the
 * grip where the row drags, the title and the buttons, so a control never adds
 * a line. The line under it holds the org, the org's `show_on_card` fields
 * joined by `·`, and the due date rightmost. The field strip truncates before
 * the due date does: the due date is the one signal that reads the same in
 * every org.
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
  drags = false,
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
   * Which way the row can move, in a list whose order a person owns and that
   * takes no drag: the week set. Nothing here leaves the buttons off. The plan
   * gives none, because a drag and the keys move its rows (ADR-0026). Every
   * other list gives none, because that order is derived, and to say "this
   * first" is to plan it. See ADR-0006, "One order per column", and ADR-0021.
   *
   * A promote is offered wherever a step up is, and a move to the foot
   * wherever a step down is: the row on top is the one row already at the top,
   * and the last row the one row already at the foot.
   */
  moves?: { up: boolean; down: boolean };
  /** False where planning a task means nothing, which is focus mode. */
  plannable?: boolean;
  /** What the pick button reads, where a page picks into a list of its own. */
  verbs?: Verbs;
  /**
   * True where a drag places the row: the plan, inside a `DragLists`. Every
   * other list draws its rows still. See ADR-0025.
   */
  drags?: boolean;
}) {
  const post = useFetcher();
  const origin = useOrigin();
  const drag = useDragItem(task.id, !drags);
  const plan = planFields(task, planned);
  const up = keyHint("up");
  const down = keyHint("down");
  const top = keyHint("top");
  const bottom = keyHint("bottom");
  const pick = keyHint(planned ? "unplan" : "plan");
  const finish = keyHint("finish");

  return (
    <li
      id={domId}
      aria-current={selected ? "true" : undefined}
      onClick={place}
      ref={drag.ref}
      style={drag.style}
      // The row being dragged stays faded where it will land, and the copy
      // under the pointer is the one that moves.
      className={`flex flex-col gap-1 rounded border p-3 ${
        selected
          ? "border-fg bg-surface-2"
          : "border-border"
      } ${drags ? "bg-surface" : ""} ${drag.dragging ? "opacity-40" : ""}`}
    >
      <span className="flex items-baseline gap-3">
        {drags ? <Grip grip={drag.grip} /> : null}
        <Link
          to={taskPath(task.org.slug, task.id, origin)}
          className={`min-w-0 flex-1 underline-offset-2 hover:underline ${
            task.finished ? "text-muted line-through" : ""
          }`}
        >
          {task.title}
        </Link>

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
              {/* The two moves that cross the list sit with the steps, because
                  a key is part of the control and not a sentence under it. */}
              <button
                name="intent"
                value="top"
                disabled={!moves.up}
                aria-label={`Move ${task.title} to the top`}
                {...top.keys}
                className="rounded border border-border px-1 text-xs disabled:opacity-30"
              >
                {KEY_MAP.top.label}
                {top.hint}
              </button>
              <button
                name="intent"
                value="bottom"
                disabled={!moves.down}
                aria-label={`Move ${task.title} to the bottom`}
                {...bottom.keys}
                className="rounded border border-border px-1 text-xs disabled:opacity-30"
              >
                {KEY_MAP.bottom.label}
                {bottom.hint}
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
      </span>

      <span className="flex items-center gap-3 text-xs text-muted empty:hidden">
        <OrgChip org={task.org} />
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
        {/* Rightmost, and it never truncates: the due date is the one signal
            that reads the same in every org. */}
        {task.due_date ? <span className="ml-auto shrink-0 tabular-nums">{task.due_date}</span> : null}
      </span>
    </li>
  );
}
