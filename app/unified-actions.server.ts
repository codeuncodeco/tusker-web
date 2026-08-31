/**
 * The acts both cross-org lists make on one task: put it in a day's plan, take
 * it out again, and finish it.
 *
 * The unified view and plan mode are one list, so they are one set of acts as
 * well. A key and a button post the same fields to either route.
 */

import { appendToPlan, unplanTask } from "./plans.server";
import { scopeForSlug, type OrgSet, type Scope } from "./scope.server";
import { moveTask, readTask, type Task } from "./tasks.server";

/**
 * The task a form names, read back through the one-org scope, and the scope
 * that proved it. A task the person cannot reach is a 404 here, not a row a
 * plan quietly picks up.
 *
 * Every act on one task goes through this, so there is one place to get the
 * check right. See `CONTEXT.md`, "Scope".
 */
export async function taskFrom(
  env: Env,
  set: OrgSet,
  form: FormData,
): Promise<{ scope: Scope; task: Task }> {
  const scope = scopeForSlug(set, String(form.get("slug") ?? ""));
  const task = scope ? await readTask(env.DB, scope, String(form.get("id") ?? "")) : null;
  if (!scope || !task) throw new Response("Not found", { status: 404 });
  return { scope, task };
}

/**
 * True when the form named one of these acts, and the act is done. False for a
 * form that named something else, which the route answers for: a page can add
 * an act of its own without this module knowing it.
 */
export async function actOnTask(
  env: Env,
  set: OrgSet,
  day: string,
  form: FormData,
): Promise<boolean> {
  const intent = String(form.get("intent") ?? "");
  if (intent !== "plan" && intent !== "unplan" && intent !== "finish") return false;

  // Every act names the org the task belongs to, and the row is read back
  // through the one-org scope.
  const { scope, task } = await taskFrom(env, set, form);
  const taskId = task.id;

  if (intent === "plan") {
    // Picking a task for today is the act of taking it out of the backlog, so
    // a person moves it to To do first. The write says so, not only the page.
    if (task.status !== "todo" && task.status !== "in_progress") {
      throw new Response("Only a To do or In progress task can be planned.", { status: 400 });
    }
    await appendToPlan(env.DB, set.personId, day, [taskId]);
  }

  if (intent === "unplan") await unplanTask(env.DB, set.personId, day, taskId);

  if (intent === "finish") {
    // Finishing here is the move the board makes, so one act has one meaning.
    // The decision prompt lands with #39, which raises it wherever a task is
    // finished.
    if (task.status !== "done") {
      await moveTask(env.DB, scope, { taskId, status: "done", before: null });
    }
  }

  return true;
}
