/**
 * The acts both cross-org lists make on one task: put it in a day's plan, take
 * it out again, and finish it.
 *
 * The unified view and plan mode are one list, so they are one set of acts as
 * well. A key and a button post the same fields to either route.
 */

import { decide, isDecide } from "./decisions.server";
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
 * What one act left behind: the task that now asks for a decision, or nothing.
 * A save of the prompt answers with the page instead, so a route hands that
 * response straight back.
 */
export type Acted =
  | Response
  | { ask: { id: string; slug: string } | null; error?: string };

/**
 * What one of these acts left behind, or null for a form that named something
 * else. The route answers for that null: a page can add an act of its own
 * without this module knowing it.
 */
export async function actOnTask(
  env: Env,
  request: Request,
  set: OrgSet,
  day: string,
  form: FormData,
): Promise<Acted | null> {
  const intent = String(form.get("intent") ?? "");
  if (intent !== "plan" && intent !== "unplan" && intent !== "finish" && !isDecide(form)) {
    return null;
  }

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

  // The prompt one of these pages raised, answered. It writes the decision and
  // gives the page back with the prompt gone.
  if (isDecide(form)) {
    const answered = await decide(env.DB, scope, request, form);
    return answered instanceof Response ? answered : { ...answered, ask: null };
  }

  if (intent === "finish") {
    // Finishing here is the move the board makes, so one act has one meaning,
    // and the prompt is raised wherever a task is finished.
    if (task.status !== "done") {
      const moved = await moveTask(env.DB, scope, { taskId, status: "done", before: null });
      if (moved.asks) return { ask: { id: taskId, slug: scope.org.slug } };
    }
  }

  return { ask: null };
}
