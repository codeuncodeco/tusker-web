/**
 * The task aside: the pane beside a task that holds its properties and its
 * acts. The acts row sits on top, then the status, the due date, the
 * assignees, the decision mark and the org's fields. See CONTEXT.md.
 *
 * On a phone it is not drawn beside the task. A bar at the foot of the page
 * holds the status, the primary act and a Details control, and Details opens
 * the aside as a drawer.
 *
 * It is a block of its own, because the task page and the task popup (#58)
 * draw the same aside, and two copies would drift.
 *
 * With script, every control saves on its own: it posts its own value under
 * its own intent and draws it at once, through the posts in flight. See
 * `taskSent`. With no script every control is tied to the page's one form by
 * `form`, and the form's Save posts the whole task.
 */

import { useEffect, useRef } from "react";
import { Form } from "react-router";

import type { Assignee } from "./assignees";
import { STATUSES, STATUS_LABEL, type Status } from "./board";
import { Dot } from "./dot";
import type { OrgField } from "./fields";
import { fieldClass } from "./forms";
import { taskSent, usePost, useSent, type TaskHeld } from "./pending";
import { PostButton } from "./posting";
import type { RefPicker } from "./refs.server";
import { SavedInput } from "./saved-input";

/** The id of the page's one form. Every control of the page names it. */
export const TASK_FORM = "task-form";

/** The task, as the aside reads it. */
export type AsideTask = Omit<TaskHeld, "assignees"> & {
  archived: boolean;
  finished: boolean;
};

/** What the aside draws for one task. */
export type AsideProps = {
  task: AsideTask;
  fields: OrgField[];
  refs: Record<string, RefPicker>;
  colors: Record<string, string | null>;
  /** The org's members. Empty for an org of one, which draws no picker. */
  members: Assignee[];
  assignees: Assignee[];
};

/**
 * The task as the page draws it: the loader's values with every post of a
 * control still in flight laid over them.
 */
export function useDrawnTask(task: AsideTask, assignees: Assignee[]) {
  return taskSent({ ...task, assignees: assignees.map((one) => one.id) }, useSent());
}

/** Marks the aside, so a tap inside the drawer is not a tap outside it. */
const ASIDE_MARK = "data-task-aside";

/** Marks the drawer, so the aside opens beside it on a phone with no script. */
const DRAWER_MARK = "data-task-drawer";

/**
 * Beside the task on `sm` and up: a pane split off by a divider on its left,
 * with no box round it. See #184.
 *
 * Below `sm` it is hidden, and the drawer draws it: fixed to the foot of the
 * page above the bar, sliding up as it opens. The drawer is a `<details>`, and
 * the aside reads whether it is open, so it opens with no script.
 */
const asideClass = [
  "flex w-64 shrink-0 flex-col gap-4 border-l border-border pl-6",
  "max-sm:hidden max-sm:[:root:has([data-task-drawer][open])_&]:flex",
  "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-16 max-sm:z-20 max-sm:max-h-[70dvh] max-sm:w-auto",
  "max-sm:overflow-y-auto max-sm:border-t max-sm:border-l-0 max-sm:bg-bg max-sm:p-4 max-sm:shadow-lg",
  "max-sm:motion-safe:transition-transform max-sm:motion-safe:starting:translate-y-full",
].join(" ");

export function TaskAside(props: AsideProps) {
  return (
    <aside className={asideClass} {...{ [ASIDE_MARK]: "" }}>
      <ActsRow task={props.task} />
      {props.task.finished ? <ReadAside {...props} /> : <LiveAside {...props} />}
    </aside>
  );
}

/**
 * The acts, at the top of the aside: the primary act, then Archive where it
 * applies. Archive keeps finished work, so live work is offered none, as on
 * the board.
 */
function ActsRow({ task }: { task: AsideTask }) {
  return (
    <div className="flex flex-wrap gap-2">
      <PrimaryAct task={task} />
      {task.finished && !task.archived ? (
        <Form method="post">
          <PostButton intent="archive" label="Archive" busyLabel="Archiving…" />
        </Form>
      ) : null}
    </div>
  );
}

/**
 * The one act a task is offered first: Finish an open task, Reopen a finished
 * one, Restore an archived one. An archived task is restored before it is
 * reopened. Each is its own form, because finishing is one act and saving is
 * another.
 */
function PrimaryAct({ task }: { task: AsideTask }) {
  return (
    <Form method="post">
      {task.archived ? (
        <PostButton intent="restore" label="Restore" busyLabel="Restoring…" />
      ) : task.finished ? (
        <PostButton intent="reopen" label="Reopen" busyLabel="Reopening…" />
      ) : (
        <PostButton intent="finish" label="Finish" busyLabel="Finishing…" />
      )}
    </Form>
  );
}

/** The controls of an open task. Each one saves on its own. */
function LiveAside({ task, fields, refs, colors, members, assignees }: AsideProps) {
  const post = usePost({ flushSync: true });
  const drawn = useDrawnTask(task, assignees);
  const held = new Set(drawn.assignees);

  return (
    <>
      <label className="flex flex-col gap-1">
        Status
        {/* Moving to Done here is the same act as Finish, so a marked task
            raises the same prompt. See ADR-0010. */}
        <select
          name="status"
          form={TASK_FORM}
          value={drawn.status}
          onChange={(event) => post({ intent: "status", status: event.target.value })}
          className={fieldClass}
        >
          {STATUSES.map((one) => (
            <option key={one} value={one}>
              {STATUS_LABEL[one]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        Due date
        {/* Saved on leaving, so a date half typed is not posted. */}
        <SavedInput
          type="date"
          name="due_date"
          form={TASK_FORM}
          value={drawn.due_date ?? ""}
          onSave={(value) => post({ intent: "due", due_date: value })}
          className={fieldClass}
        />
      </label>

      {members.length > 0 ? (
        <fieldset className="flex flex-col gap-1">
          <legend>Assignees</legend>
          {/* Unticking every box posts no name, so this says the picker was
              on the form and an empty set is a task nobody holds. */}
          <input type="hidden" name="assignees" value="picked" form={TASK_FORM} />
          {members.map((member) => (
            <label key={member.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="assignee"
                value={member.id}
                form={TASK_FORM}
                checked={held.has(member.id)}
                onChange={(event) =>
                  post({
                    intent: "assign",
                    assignee: member.id,
                    held: event.target.checked ? "1" : "0",
                  })
                }
              />
              {member.name}
            </label>
          ))}
        </fieldset>
      ) : null}

      {/* Off by default, and only a marked task raises the prompt when it is
          finished. See ADR-0010. */}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="decides"
          value="1"
          form={TASK_FORM}
          checked={drawn.decides}
          onChange={(event) => post({ intent: "mark", decides: event.target.checked ? "1" : "0" })}
        />
        Holds a decision
      </label>

      {fields.map((field) => (
        <FieldBox
          key={field.key}
          field={field}
          value={drawn.data[field.key]}
          picker={refs[field.key]}
          color={colors[field.key] ?? null}
          onSave={(value) => post({ intent: "field", key: field.key, [`field.${field.key}`]: value })}
        />
      ))}
    </>
  );
}

/** What one field box takes from the aside. */
type FieldBoxProps = {
  field: OrgField;
  value: string | undefined;
  picker: RefPicker | undefined;
  color: string | null;
  onSave: (value: string) => void;
};

/**
 * One declared field, drawn by its type. Every type reads one box. A pick
 * saves at once, and a typed value saves when the box is left.
 */
function FieldBox({ field, value, picker, color, onSave }: FieldBoxProps) {
  const name = `field.${field.key}`;

  if (field.type === "reference") {
    return <RefBox field={field} value={value} picker={picker} color={color} onSave={onSave} />;
  }

  if (field.type === "select") {
    return (
      <label className="flex flex-col gap-1">
        {field.label}
        <select
          name={name}
          form={TASK_FORM}
          value={value ?? ""}
          onChange={(event) => onSave(event.target.value)}
          className={fieldClass}
        >
          <option value="">—</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1">
      {field.label}
      <SavedInput
        name={name}
        form={TASK_FORM}
        type={field.type === "date" ? "date" : "text"}
        value={value ?? ""}
        onSave={onSave}
        className={fieldClass}
      />
    </label>
  );
}

/**
 * A reference field: a picker over the cached options.
 *
 * A field that was never pulled draws a plain id box. An empty dropdown reads
 * as "the org app has no trails", and the box at least takes an id.
 *
 * An id the options do not name keeps its place in the list, drawn raw, so a
 * save of the rest of the task does not silently drop it.
 */
function RefBox({ field, value, picker, color, onSave }: FieldBoxProps) {
  const name = `field.${field.key}`;
  const options = picker?.options ?? [];
  const unnamed = value && !options.some((one) => one.id === value);

  if (!picker?.pulled) {
    return (
      <label className="flex flex-col gap-1">
        {field.label}
        <span className="text-muted">
          No options pulled yet. Refresh this field on the fields screen, or type the id.
        </span>
        <span className="flex items-center gap-2">
          <SavedInput
            name={name}
            form={TASK_FORM}
            value={value ?? ""}
            onSave={onSave}
            className={`${fieldClass} min-w-0 flex-1`}
          />
          <Dot color={color} />
        </span>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1">
      {field.label}
      <span className="flex items-center gap-2">
        <select
          name={name}
          form={TASK_FORM}
          value={value ?? ""}
          onChange={(event) => onSave(event.target.value)}
          className={`${fieldClass} min-w-0 flex-1`}
        >
          <option value="">—</option>
          {unnamed ? <option value={value}>{picker.label ?? value}</option> : null}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <Dot color={color} />
      </span>
    </label>
  );
}

/**
 * A finished task, read: the same aside drawn as text. Nothing here posts, so
 * the one way to change the task is Reopen, in the acts row. See #164.
 */
function ReadAside({ task, fields, refs, colors, members, assignees }: AsideProps) {
  return (
    <dl className="flex flex-col gap-3">
      <ReadLine label="Status">{STATUS_LABEL[task.status]}</ReadLine>
      <ReadLine label="Due date">{task.due_date ?? "—"}</ReadLine>
      {/* An org of one draws no assignees, here as on the live aside. */}
      {members.length > 0 ? (
        <ReadLine label="Assignees">
          {assignees.length > 0 ? assignees.map((one) => one.name).join(", ") : "—"}
        </ReadLine>
      ) : null}
      {task.decides ? <p>Holds a decision</p> : null}
      {fields.map((field) => (
        <ReadLine key={field.key} label={field.label}>
          {heldText(field, task.data[field.key], refs[field.key])}
          <Dot color={colors[field.key] ?? null} />
        </ReadLine>
      ))}
    </dl>
  );
}

/** One label and the value it holds, as the finished aside reads it. */
function ReadLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted">{label}</dt>
      <dd className="flex items-center gap-2">{children}</dd>
    </div>
  );
}

/**
 * The text a field holds. A reference reads by the label its picker names, and
 * by the raw id when nothing names it, as the picker draws an unnamed id.
 */
function heldText(field: OrgField, value: string | undefined, picker: RefPicker | undefined) {
  if (!value) return "—";
  if (field.type !== "reference") return value;
  return picker?.options.find((one) => one.id === value)?.label ?? picker?.label ?? value;
}

/**
 * True for an `Esc` the drawer may take. A box that is typed in keeps its own
 * `Esc`, which puts the saved value back, so the drawer shuts on the next one.
 * A pick list or a tick has no `Esc` of its own, so the drawer takes it. A
 * raised prompt takes every press. See `isPagePress`.
 */
function drawerPress(event: KeyboardEvent): boolean {
  const target = event.target as Element | null;
  if (target?.closest('textarea, input:not([type="checkbox"])')) return false;
  if (document.querySelector('[role="dialog"]')) return false;
  return !event.metaKey && !event.ctrlKey && !event.altKey;
}

/**
 * The bar at the foot of a phone's page: the status, the primary act, and
 * Details, which opens the aside as a drawer.
 *
 * The drawer is a `<details>`, so it opens and shuts with no script. With
 * script `Esc` shuts it, and so does a tap outside it. The press is caught
 * before the page's own `Esc` reads it, so shutting the drawer does not also
 * go back to the list.
 */
export function TaskBar({ task, assignees }: { task: AsideTask; assignees: Assignee[] }) {
  const drawer = useRef<HTMLDetailsElement>(null);
  const status: Status = useDrawnTask(task, assignees).status;

  useEffect(() => {
    function shut(): boolean {
      const open = drawer.current?.open ?? false;
      if (open) drawer.current!.open = false;
      return open;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || !drawerPress(event)) return;
      if (!shut()) return;
      event.preventDefault();
      event.stopPropagation();
    }
    function onTap(event: PointerEvent) {
      const target = event.target as Element | null;
      if (target?.closest(`[${ASIDE_MARK}], [${DRAWER_MARK}]`)) return;
      shut();
    }
    // Caught on the way down, so the page's `Esc` on the window never hears
    // the press that shut the drawer.
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onTap);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onTap);
    };
  }, []);

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-center gap-3 border-t border-border bg-bg px-4 sm:hidden">
      <span className="flex-1 truncate text-muted">{STATUS_LABEL[status]}</span>
      <PrimaryAct task={task} />
      <details ref={drawer} {...{ [DRAWER_MARK]: "" }}>
        <summary className="cursor-pointer list-none rounded border border-border px-3 py-2 [&::-webkit-details-marker]:hidden">
          Details
        </summary>
      </details>
    </div>
  );
}
