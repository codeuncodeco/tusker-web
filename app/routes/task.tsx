import { Form, Link } from "react-router";

import { archiveTasks, restoreTasks } from "../archive.server";
import { drawsAssignees, type Assignee } from "../assignees";
import { assigneesOf, membersOf, readAssignees, setAssignees } from "../assignees.server";
import { STATUSES, STATUS_LABEL, isFinished, readStatus, type Status } from "../board";
import { colorOf } from "../colors";
import { listColors } from "../colors.server";
import { cloudflareEnv } from "../context.server";
import { DecisionPrompt } from "../decision-prompt";
import { askedOn, decide, finishTask, moveAndAsk } from "../decisions.server";
import { DescriptionBox } from "../description-box";
import { Dot } from "../dot";
import { readData, type OrgField } from "../fields";
import { listFields } from "../fields.server";
import { fieldClass } from "../forms";
import { refPickers, type RefPicker } from "../refs.server";
import { requireScope, type Scope } from "../scope.server";
import {
  readDueDate,
  readTask,
  saveDescription,
  saveTask,
  tickDescriptionBox,
} from "../tasks.server";
import type { Route } from "./+types/task";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData.task.title} — Tusker` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

  const task = await readTask(env.DB, scope, params.taskId);
  if (!task) throw new Response("Not found", { status: 404 });

  const fields = await listFields(env.DB, scope);

  // A personal org holds one member, so it draws no picker and no initials.
  // See ADR-0013.
  const assignable = drawsAssignees(scope.org);

  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      due_date: task.due_date,
      data: task.data,
      // A task made before the thought landed is marked here instead.
      decides: task.decides === 1,
      // The raw markdown. The page renders it, so what the browser holds is
      // what a person typed.
      description: task.description,
      // Archive is a flag, not a status, so the page draws it beside the
      // status rather than in it.
      archived: task.archived === 1,
      // Archive keeps finished work, so only finished work is offered it.
      // The board says the same: the sweep sits on Done and Cancelled.
      finished: isFinished(task.status),
    },
    fields,
    /**
     * The org's members, as the picker offers them, in the order a card draws
     * them. Empty for a personal org.
     */
    members: assignable ? await membersOf(env.DB, scope) : [],
    /**
     * Who holds the task now. A member the org has lost is gone from this
     * list already: the membership took the assignment with it.
     */
    assignees: assignable ? await assigneesOf(env.DB, scope, task.id) : [],
    // The cached options each reference field draws. The refs key that filled
    // that cache stays on the server: this payload goes to the browser.
    refs: await refPickers(env.DB, scope, fields, task.data),
    // The colour of the value this task holds, per field, and no other. The
    // dropdown list stays plain: a browser will not style an option, so the
    // dot draws beside the box. See ADR-0006.
    colors: await heldColors(env.DB, scope, fields, task.data),
    // The prompt the Finish button raised, if the query string still holds it.
    ask: await askedOn(env.DB, scope, request),
  };
}

/** The colour each field gives the value this task holds, or null for none. */
async function heldColors(
  db: D1Database,
  scope: Scope,
  fields: OrgField[],
  data: Record<string, string>,
): Promise<Record<string, string | null>> {
  const colors = await listColors(db, scope);
  return Object.fromEntries(
    fields.map((field) => [field.key, colorOf(colors, field.key, data[field.key])]),
  );
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.get(cloudflareEnv);
  const scope = await requireScope(request, env, params.slug, context);

  const form = await request.formData();

  const intent = String(form.get("intent") ?? "");

  // One task, off the board and kept, or put back. Archive is a flag, so
  // neither act touches the status the task holds.
  if (intent === "archive" || intent === "restore") {
    const flip = intent === "archive" ? archiveTasks : restoreTasks;
    const changed = await flip(env.DB, scope, [params.taskId]);
    // Nothing changed means the org holds no such task, or it is already the
    // way the button asks for. The page reads back either way.
    return { ok: changed.length > 0 };
  }

  // The prompt the Finish button raised, answered.
  if (intent === "decide") return decide(env.DB, scope, request, form);

  if (intent === "finish") {
    const finished = await finishTask(env.DB, scope, request, params.taskId);
    if (!finished.moved) throw new Response("Not found", { status: 404 });
    return finished.prompt ?? { ok: true };
  }

  // One checkbox of the description, flipped where the raw text holds it. It
  // posts on its own, so it reads no other box of the page.
  if (intent === "tick") {
    const box = Number(form.get("box"));
    const ticked = await tickDescriptionBox(env.DB, scope, params.taskId, box);
    if (!ticked) throw new Response("Not found", { status: 404 });
    return { ok: true };
  }

  // The description, as the editor posts it when the box is left. It carries
  // the whole text and no other box of the page, so leaving the editor saves
  // the description and nothing else.
  if (intent === "describe") {
    const described = await saveDescription(
      env.DB,
      scope,
      params.taskId,
      String(form.get("description") ?? ""),
    );
    if (!described) throw new Response("Not found", { status: 404 });
    return { ok: true };
  }

  const task = await readTask(env.DB, scope, params.taskId);
  if (!task) throw new Response("Not found", { status: 404 });

  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "A task needs a title." };

  // The org's own declarations decide what is read, so a form that names
  // another org's field writes nothing.
  const read = readData(await listFields(env.DB, scope), form);
  if ("error" in read) return read;

  // A control the form does not carry changes nothing. The aside posts the
  // box, so an absent one is a post from another form and not a cleared date.
  const due = form.has("due_date") ? readDueDate(form) : { dueDate: task.due_date };
  if ("error" in due) return due;

  // Unticking every box posts no name at all, so the picker says it was there.
  // Without that mark a form with no picker on it would empty the set.
  const picked = drawsAssignees(scope.org) && form.has("assignees");
  // Every id is checked against this org's memberships before anything is
  // written, so a half-saved task cannot come out of a form that named a
  // member of another org.
  const assigned = picked ? await readAssignees(env.DB, scope, form) : { ids: [] };
  if ("error" in assigned) return assigned;

  const status = form.has("status") ? readStatus(form) : task.status;

  const saved = await saveTask(env.DB, scope, params.taskId, {
    title,
    data: read.data,
    // The box is absent from the post when it is unticked, which unmarks the
    // task. Saving the task is how the mark goes on and off.
    decides: form.get("decides") === "1",
    dueDate: due.dueDate,
  });
  if (!saved) throw new Response("Not found", { status: 404 });

  if (picked) await setAssignees(env.DB, scope, params.taskId, assigned.ids);

  // The status is a move, not a column of the row: it takes a place in the new
  // column, and moving to Done here is the same act as the Finish button. An
  // unchanged status moves nothing, so a save does not send the card to the
  // bottom of its own column. See ADR-0010.
  if (status !== task.status) {
    const moved = await moveAndAsk(env.DB, scope, request, params.taskId, status);
    if (!moved.moved) throw new Response("Not found", { status: 404 });
    if (moved.prompt) return moved.prompt;
  }

  return { ok: true };
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
function RefBox({
  field,
  value,
  picker,
  color,
}: {
  field: OrgField;
  value: string | undefined;
  picker: RefPicker | undefined;
  color: string | null;
}) {
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
          <input name={name} type="text" defaultValue={value ?? ""} className={`${fieldClass} flex-1`} />
          <Dot color={color} />
        </span>
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1">
      {field.label}
      <span className="flex items-center gap-2">
        <select name={name} defaultValue={value ?? ""} className={`${fieldClass} flex-1`}>
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

/** One declared field, drawn by its type. Every type reads one box. */
function FieldBox({
  field,
  value,
  picker,
  color,
}: {
  field: OrgField;
  value: string | undefined;
  picker: RefPicker | undefined;
  color: string | null;
}) {
  const name = `field.${field.key}`;

  if (field.type === "reference") {
    return <RefBox field={field} value={value} picker={picker} color={color} />;
  }

  if (field.type === "select") {
    return (
      <label className="flex flex-col gap-1">
        {field.label}
        <select name={name} defaultValue={value ?? ""} className={fieldClass}>
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
      <input
        name={name}
        type={field.type === "date" ? "date" : "text"}
        defaultValue={value ?? ""}
        className={fieldClass}
      />
    </label>
  );
}

/**
 * The metadata aside: status, due date and the members who hold the task.
 *
 * It sits beside the task rather than in the run of fields, because these
 * three belong to every task of every org and a custom field belongs to one
 * org. The popup and the full page then share one shape.
 */
function MetadataAside({
  status,
  dueDate,
  members,
  assignees,
}: {
  status: Status;
  dueDate: string | null;
  /** The org's members. Empty for a personal org, which draws no picker. */
  members: Assignee[];
  assignees: Assignee[];
}) {
  const held = new Set(assignees.map((one) => one.id));

  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 rounded-lg border border-border p-4 sm:w-64">
      <label className="flex flex-col gap-1">
        Status
        {/* Moving to Done here is the same act as the Finish button, so a
            marked task raises the same prompt. See ADR-0010. */}
        <select name="status" defaultValue={status} className={fieldClass}>
          {STATUSES.map((one) => (
            <option key={one} value={one}>
              {STATUS_LABEL[one]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        Due date
        <input name="due_date" type="date" defaultValue={dueDate ?? ""} className={fieldClass} />
      </label>

      {members.length > 0 ? (
        <fieldset className="flex flex-col gap-1">
          <legend>Assignees</legend>
          {/* Unticking every box posts no name, so this says the picker was
              on the form and an empty set is a task nobody holds. */}
          <input type="hidden" name="assignees" value="picked" />
          {members.map((member) => (
            <label key={member.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                name="assignee"
                value={member.id}
                defaultChecked={held.has(member.id)}
              />
              {member.name}
            </label>
          ))}
        </fieldset>
      ) : null}
    </aside>
  );
}

export default function Task({ loaderData, actionData }: Route.ComponentProps) {
  const { org, task, fields, refs, colors, members, assignees, ask } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : null;

  return (
    // Wider than the other pages under the org layout: the aside sits beside
    // the task, so the two columns need the room.
    <main className="mx-auto flex max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl tracking-tight">{task.title}</h1>

      <Form method="post" key={task.id} className="flex flex-col gap-6 sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <label className="flex flex-col gap-1">
            Title
            <input name="title" required defaultValue={task.title} className={fieldClass} />
          </label>

          {/* Off by default, and only a marked task raises the prompt when it is
              finished. See ADR-0010. */}
          <label className="flex items-center gap-2">
            <input type="checkbox" name="decides" value="1" defaultChecked={task.decides} />
            Holds a decision
          </label>

          {fields.map((field) => (
            <FieldBox
              key={field.key}
              field={field}
              value={task.data[field.key]}
              picker={refs[field.key]}
              color={colors[field.key] ?? null}
            />
          ))}

          {fields.length === 0 ? (
            <p className="text-muted">
              This org declares no field yet.{" "}
              <Link to={`/o/${org.slug}/fields`} className="underline">
                Declare one
              </Link>
              .
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-danger">
              {error}
            </p>
          ) : null}
          {actionData && "ok" in actionData ? (
            <p className="text-muted">Saved.</p>
          ) : null}

          <button className="self-start rounded border border-border px-3 py-2">
            Save
          </button>
        </div>

        <MetadataAside
          status={task.status}
          dueDate={task.due_date}
          members={members}
          assignees={assignees}
        />
      </Form>

      {/* Its own section, because a form cannot hold another one, and every
          box of the description posts on its own. */}
      <section className="flex flex-col gap-2">
        <h2>Description</h2>
        <DescriptionBox text={task.description} />
      </section>

      {/* Its own form, because archiving is one act and saving is another.
          An archived task keeps its status, so this button says nothing about
          the column it holds. Live work is offered no Archive, as it is on the
          board: archive keeps finished work. */}
      {task.archived || task.finished ? (
        <Form method="post">
          <button
            name="intent"
            value={task.archived ? "restore" : "archive"}
            className="self-start rounded border border-border px-3 py-2"
          >
            {task.archived ? "Restore" : "Archive"}
          </button>
        </Form>
      ) : null}

      {/* Its own form, because finishing is one act and saving is another. */}
      {task.status === "done" || task.status === "cancelled" ? null : (
        <Form method="post">
          <button
            name="intent"
            value="finish"
            className="self-start rounded border border-border px-3 py-2"
          >
            Finish
          </button>
        </Form>
      )}

      <DecisionPrompt ask={ask} />
    </main>
  );
}
