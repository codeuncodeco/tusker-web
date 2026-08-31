/**
 * The acts both cross-org lists make on one task: put it in a day's plan, take
 * it out again, and finish it.
 *
 * The unified view and plan mode are one list, so they are one set of acts as
 * well. A key and a button post the same fields to either route.
 */

import { addToPlan, dropFromPlan } from "./plans.server";
import { scopeForSlug, type OrgSet } from "./scope.server";
import { moveTask, readTask } from "./tasks.server";

/** True when the form named one of these acts and the act is done. */
export async function actOnTask(
  env: Env,
  set: OrgSet,
  day: string,
  form: FormData,
): Promise<boolean> {
  const intent = String(form.get("intent") ?? "");
  if (intent !== "plan" && intent !== "unplan" && intent !== "finish") return false;

  const taskId = String(form.get("id") ?? "");
  // Every act names the org the task belongs to, and the row is read back
  // through the one-org scope. A task the person cannot reach is a 404 here,
  // not a row a plan quietly picks up.
  const scope = scopeForSlug(set, String(form.get("slug") ?? ""));
  const task = scope ? await readTask(env.DB, scope, taskId) : null;
  if (!scope || !task) throw new Response("Not found", { status: 404 });

  if (intent === "plan") {
    // Picking a task for today is the act of taking it out of the backlog, so
    // a person moves it to To do first. The write says so, not only the page.
    if (task.status !== "todo" && task.status !== "in_progress") {
      throw new Response("Only a To do or In progress task can be planned.", { status: 400 });
    }
    await addToPlan(env.DB, set.personId, day, taskId);
  }

  if (intent === "unplan") await dropFromPlan(env.DB, set.personId, day, taskId);

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
