/**
 * The acts both cross-org lists make on one task: put it in a day's plan, take
 * it out again, and finish it.
 *
 * The unified view and plan mode are one list, so they are one set of acts as
 * well. A key and a button post the same fields to either route.
 */

import { decide, finishTask } from "./decisions.server";
import { appendToPlan, unplanTask } from "./plans.server";
import { scopeForSlug, type OrgSet, type Scope } from "./scope.server";
import { readTask, type Task } from "./tasks.server";

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

/** The acts this module answers for. Any other form is the route's own. */
const ACTS = ["plan", "unplan", "finish", "decide"] as const;

/**
 * What one act answers with: the page again when it raised or answered the
 * prompt, and otherwise a word for the fetcher that posted it.
 */
export type Acted = Response | { ok: true } | { error: string };

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
  if (!ACTS.some((act) => act === intent)) return null;

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
  if (intent === "decide") return decide(env.DB, scope, request, form);

  if (intent === "finish" && task.status !== "done") {
    const finished = await finishTask(env.DB, scope, request, taskId);
    if (finished.prompt) return finished.prompt;
  }

  return { ok: true };
}
