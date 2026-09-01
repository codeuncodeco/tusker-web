/**
 * The acts both cross-org lists make: make a task, put it in a day's plan, take
 * it out again, finish it, and take an add back.
 *
 * The unified view and plan mode are one list, so they are one set of acts as
 * well. A key and a button post the same fields to either route.
 */

import { decide, finishTask } from "./decisions.server";
import { appendToPlan, unplanTask } from "./plans.server";
import { scopeForSlug, type OrgSet, type Scope } from "./scope.server";
import { createTask, deleteTask, newTaskFrom, readTask, type Task } from "./tasks.server";
import type { Added } from "./unified";

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
 * The org a form named, or a 404. `create` is the one act with no task to read
 * back, so it proves the org on its own.
 */
function scopeFrom(set: OrgSet, form: FormData): Scope {
  const scope = scopeForSlug(set, String(form.get("slug") ?? ""));
  if (!scope) throw new Response("Not found", { status: 404 });
  return scope;
}

/**
 * Makes a task from a typed title, in the org the picker named.
 *
 * The task lands in To do, at the top of the column, where a person looks for
 * the one they just typed. Plan mode also puts it at the end of the day's
 * plan, because there an add is a pick.
 */
async function addTask(
  env: Env,
  set: OrgSet,
  day: string,
  form: FormData,
  intoPlan: boolean,
): Promise<Acted> {
  const scope = scopeFrom(set, form);
  const typed = newTaskFrom(form);
  if ("error" in typed) return typed;

  const made = await createTask(env.DB, scope, { ...typed, status: "todo" });
  if (intoPlan) await appendToPlan(env.DB, set.personId, day, [made.id]);

  // The box keeps the words, so an add into the wrong org is filed again
  // rather than typed again. See ADR-0012.
  return { added: { id: made.id, slug: scope.org.slug, ...typed } };
}

/**
 * The acts this module answers for on a task a form names. `create` is the
 * sixth, and it stands apart: it names an org and no task. Any other form is
 * the route's own.
 */
const ACTS = ["plan", "unplan", "finish", "decide", "undo"] as const;

/**
 * What one act answers with: the page again when it raised or answered the
 * prompt, and otherwise a word for the fetcher that posted it.
 */
export type Acted = Response | { ok: true } | { added: Added } | { error: string };

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
  /** True where an add is also a pick: plan mode puts the task in the day. */
  intoPlan = false,
): Promise<Acted | null> {
  const intent = String(form.get("intent") ?? "");
  // An add names an org and no task, so it proves its scope and stops here.
  if (intent === "create") return addTask(env, set, day, form, intoPlan);
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

  // Taking an add back is the one delete Tusker has. The task leaves the day
  // as well, so an undo in plan mode leaves no hole in the plan. See ADR-0012.
  if (intent === "undo") {
    await unplanTask(env.DB, set.personId, day, taskId);
    await deleteTask(env.DB, scope, taskId);
  }

  // The prompt one of these pages raised, answered. It writes the decision and
  // gives the page back with the prompt gone.
  if (intent === "decide") return decide(env.DB, scope, request, form);

  // Finishing here is the move the board makes, so one act has one meaning,
  // and a marked task raises the prompt from any of these screens.
  if (intent === "finish" && task.status !== "done") {
    const finished = await finishTask(env.DB, scope, request, taskId);
    if (finished.prompt) return finished.prompt;
  }

  return { ok: true };
}
