import { Form, redirect } from "react-router";

import { archiveTasks, restoreTasks } from "../archive.server";
import { drawsAssignees } from "../assignees";
import {
  assignOne,
  assigneesOf,
  membersOf,
  readAssignees,
  setAssignees,
} from "../assignees.server";
import { BackLink } from "../back-link";
import { isFinished, readStatus, type Status } from "../board";
import { colorOf } from "../colors";
import { listColors } from "../colors.server";
import { cloudflareEnv } from "../context.server";
import { DecisionPrompt } from "../decision-prompt";
import { askedOn, decide, finishTask, moveAndAsk } from "../decisions.server";
import { DescriptionBox } from "../description-box";
import { DescriptionView } from "../description-view";
import { readData, readValue, type OrgField } from "../fields";
import { listFields } from "../fields.server";
import { backPath } from "../paths";
import { postAndReport } from "../pending";
import { refPickers } from "../refs.server";
import { requireScope, type Scope } from "../scope.server";
import { TASK_FORM, TaskAside, TaskBar, useDrawnTask } from "../task-aside";
import { TaskTitle } from "../task-title";
import {
  editTask,
  readDueDate,
  readTask,
  saveDescription,
  saveTask,
  tickDescriptionBox,
  type TaskEdit,
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

  // An org of one member draws no picker and no initials.
  // See ADR-0013.
  const assignable = drawsAssignees(scope.org);

  return {
    org: { slug: scope.org.slug, name: scope.org.name },
    /**
     * The list this task was opened from, as the `from` query names it, and
     * the org's board for a task opened from nowhere. The back link and `Esc`
     * both follow it. See `app/paths.ts`.
     */
    back: backPath(new URL(request.url).search, scope.org.slug),
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
     * them. Empty for an org of one.
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

  // One checkbox of the description, flipped where the raw text holds it. It
  // posts on its own, so it reads no other box of the page.
  if (intent === "tick") {
    const box = Number(form.get("box"));
    const ticked = await tickDescriptionBox(env.DB, scope, params.taskId, box);
    if (!ticked) throw new Response("Not found", { status: 404 });
    return { ok: true };
  }

  // Every act below this line edits the task, and a finished task is not
  // edited: it is reopened first.
  const task = await readTask(env.DB, scope, params.taskId);
  if (!task) throw new Response("Not found", { status: 404 });

  // A finished task, back to To do. It is the same move a status change makes,
  // so the finish time goes the way it goes on any move out of Done. An open
  // task has nothing to reopen, and stays where it stands. An archived one is
  // restored first: open work no board draws would be lost work.
  if (intent === "reopen") {
    if (!isFinished(task.status)) return { ok: true };
    if (task.archived === 1) {
      throw new Response("An archived task is restored before it is reopened.", { status: 409 });
    }
    const moved = await moveAndAsk(env.DB, scope, request, params.taskId, "todo");
    if (!moved.moved) throw new Response("Not found", { status: 404 });
    // The page again, and not a "Saved." under the form Reopen opens.
    const url = new URL(request.url);
    return redirect(`${url.pathname}${url.search}`);
  }

  refuseFinished(task.status);

  if (intent === "finish") {
    const finished = await finishTask(env.DB, scope, request, params.taskId);
    if (!finished.moved) throw new Response("Not found", { status: 404 });
    return finished.prompt ?? { ok: true };
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

  // One control of the page, saved on its own. With script every control
  // posts this way, carrying its own value and no other, so a post for one
  // control writes nothing else. See #204.
  if (CONTROL_INTENTS.has(intent)) return saveControl(env.DB, scope, request, task, intent, form);

  // The whole task, as the page posts it with no script: one form across both
  // columns, and the description with it.
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

  // The no-script description is a textarea in the same form. A post that
  // carries none keeps the text the row holds.
  if (form.has("description")) {
    await saveDescription(env.DB, scope, params.taskId, String(form.get("description")));
  }

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

/** The intents that each save one control of the page. */
const CONTROL_INTENTS = new Set(["title", "status", "due", "mark", "field", "assign"]);

/**
 * Saves one control: the title, the status, the due date, the decision mark,
 * one field, or one assignee. The post carries that control's value and the
 * write touches nothing else.
 *
 * A value the control does not take is refused with its reason, so the page
 * raises it as a toast and the control goes back to what the server holds.
 */
async function saveControl(
  db: D1Database,
  scope: Scope,
  request: Request,
  task: { id: string; status: Status },
  intent: string,
  form: FormData,
) {
  const refuse = (reason: string) => new Response(reason, { status: 400 });

  // The status is a move, as the whole-task save makes it, so Done raises the
  // prompt on a marked task. See ADR-0010.
  if (intent === "status") {
    const status = readStatus(form);
    if (status === task.status) return { ok: true };
    const moved = await moveAndAsk(db, scope, request, task.id, status);
    if (!moved.moved) throw new Response("Not found", { status: 404 });
    return moved.prompt ?? { ok: true };
  }

  if (intent === "assign") {
    if (!drawsAssignees(scope.org)) throw refuse("This org draws no assignees.");
    const asked = await readAssignees(db, scope, form);
    if ("error" in asked) throw refuse(asked.error);
    const [userId] = asked.ids;
    if (!userId) throw refuse("Name the member to assign.");
    await assignOne(db, scope, task.id, userId, form.get("held") === "1");
    return { ok: true };
  }

  let edit: TaskEdit;
  if (intent === "title") {
    const title = String(form.get("title") ?? "").trim();
    if (!title) throw refuse("A task needs a title.");
    edit = { title };
  } else if (intent === "due") {
    const due = readDueDate(form);
    if ("error" in due) throw refuse(due.error);
    edit = { dueDate: due.dueDate };
  } else if (intent === "mark") {
    edit = { decides: form.get("decides") === "1" };
  } else {
    // Only a declared field is read, so a key another org declared, or none
    // declared, writes nothing.
    const key = String(form.get("key") ?? "");
    const field = (await listFields(db, scope)).find((one) => one.key === key);
    if (!field) throw refuse("This org declares no such field.");
    const read = readValue(field, form.get(`field.${key}`));
    if ("error" in read) throw refuse(read.error);
    edit = { field: key, value: read.value };
  }

  const edited = await editTask(db, scope, task.id, edit);
  if (!edited) throw new Response("Not found", { status: 404 });
  return { ok: true };
}

/**
 * A finished task is read, not edited: the page draws no form for it, and a
 * post that edits it anyway is refused here, so a hand-made form writes
 * nothing. Reopen is the way back to an edit. See #164.
 */
function refuseFinished(status: Status) {
  if (isFinished(status)) {
    throw new Response("A finished task is reopened before it is changed.", { status: 409 });
  }
}


/** A post the server refuses raises a toast, not the error page. See `app/pending.ts`. */
export const clientAction = (args: Route.ClientActionArgs) => postAndReport(args);

export default function Task({ loaderData, actionData }: Route.ComponentProps) {
  const { task, back, fields, refs, colors, members, assignees, ask } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : null;
  const drawn = useDrawnTask(task, assignees);

  return (
    // Wider than the other pages under the org layout: the aside sits beside
    // the task, so the two columns need the room. On a phone the bar sits at
    // the foot of the page, and the page leaves it room so it covers nothing.
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8 pb-24 sm:pb-8">
      {/* The way back to the list `Enter` opened the task from. */}
      <BackLink to={back} />

      {/* With no script, every control of the page posts with this form, by
          its `form` attribute: the description's ticks are forms of their
          own, and a form cannot hold another. With script nothing submits it,
          because every control saves on its own. */}
      <Form
        id={TASK_FORM}
        method="post"
        onSubmit={(event) => event.preventDefault()}
      />

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <TaskTitle title={drawn.title} finished={task.finished} />

          {/* A finished task still ticks its boxes, but its text is not
              edited. */}
          {task.finished ? (
            <>
              <h2>Description</h2>
              <DescriptionView text={task.description} />
            </>
          ) : (
            <DescriptionBox text={task.description} form={TASK_FORM} />
          )}

          {error ? (
            <p role="alert" className="text-danger">
              {error}
            </p>
          ) : null}

          {/* The whole-task save, for a page with no script. With script every
              control saves on its own, and the button is never drawn. */}
          {task.finished ? null : (
            <noscript>
              <button
                form={TASK_FORM}
                className="self-start rounded border border-border px-3 py-2"
              >
                Save
              </button>
            </noscript>
          )}
        </div>

        <TaskAside
          task={task}
          fields={fields}
          refs={refs}
          colors={colors}
          members={members}
          assignees={assignees}
        />
      </div>

      <TaskBar task={task} assignees={assignees} />

      <DecisionPrompt ask={ask} />
    </main>
  );
}
