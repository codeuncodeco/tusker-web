/**
 * The acts every cross-org list makes: make a task, put it in the list the
 * page picks into, take it out again, finish it, and take an add back.
 *
 * The unified board, plan mode and the week page draw the same tasks, so they
 * are one set of acts as well. A key and a button post the same fields to any
 * of the three routes. Which list a pick lands in is the route's own business,
 * and it says so with `Picks`.
 */

import { readAssignees } from "./assignees.server";
import { readStatus, type Status } from "./board";
import { decide, finishTask, moveAndAsk, promptFor } from "./decisions.server";
import type { Picks } from "./picks";
import { scopeForSlug, type OrgSet, type Scope } from "./scope.server";
import { createTasks, deleteTasks, newTasksFrom, readTask, type Task } from "./tasks.server";
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
 * The column an add names, or To do.
 *
 * Each box of the unified board names its own column. The box of a page that
 * picks names none: an add there is a pick as well, and a pick is live work.
 */
function statusFor(form: FormData, picked: boolean): Status {
  if (picked || form.get("status") === null) return "todo";
  return readStatus(form);
}

/**
 * Makes a task of every line typed, in the org the picker named, the column
 * the box sits on, and held by the members the box named.
 *
 * The tasks land at the top of the column and in list order, where a person
 * looks for the ones they just typed. A page that picks also puts every one of
 * them in its list, because there an add is a pick: a person who pastes ten
 * lines into their own plan asked for ten picks.
 */
async function addTasks(
  env: Env,
  request: Request,
  set: OrgSet,
  picks: Picks,
  form: FormData,
): Promise<Acted> {
  const scope = scopeFrom(set, form);
  const typed = newTasksFrom(form);
  if ("error" in typed) return typed;

  // The ids are checked before anything is written, so an add naming a member
  // who left the org while the box sat open makes no task at all. The box
  // keeps the words, so nothing typed is lost. See ADR-0013.
  const assigned = await readAssignees(env.DB, scope, form);
  if ("error" in assigned) return assigned;

  const status = statusFor(form, picks.onAdd);
  const ids = await createTasks(env.DB, scope, { ...typed, status, assignees: assigned.ids });
  if (picks.onAdd) await picks.add(ids);

  // A marked task typed straight into Done is finished the moment it is made,
  // so it is asked now: no later move would ask it. One box is one prompt, so
  // a pasted list is asked about the task on top of it.
  const prompt = await promptFor(env.DB, scope, request, ids[0]);
  if (prompt) return prompt;

  // The box keeps the words as they were typed, so an add into the wrong org
  // is filed again rather than typed again. See ADR-0012.
  return { added: { ids, slug: scope.org.slug, text: typed.text, decides: typed.decides } };
}

/**
 * Takes one add back: it deletes every row that add wrote and drops them all
 * from the list the page picks into.
 *
 * One add is one act, so its undo is one act. Every id is read back through
 * the one-org scope first, so a list that names a task of another org writes
 * nothing at all and answers 404, rather than deleting the rows before it.
 */
async function undoAdd(env: Env, set: OrgSet, picks: Picks, form: FormData): Promise<Acted> {
  const scope = scopeFrom(set, form);
  const ids = form.getAll("id").map(String).filter((id) => id !== "");
  if (ids.length === 0) throw new Response("Not found", { status: 404 });

  for (const id of ids) {
    if (!(await readTask(env.DB, scope, id))) throw new Response("Not found", { status: 404 });
  }

  await picks.remove(ids);
  await deleteTasks(env.DB, scope, ids);

  return { ok: true };
}

/**
 * The acts this module answers for on a task a form names. `create` and `undo`
 * stand apart: they name an org and a list, not one task. Any other form is
 * the route's own.
 */
const ACTS = ["plan", "unplan", "move", "finish", "decide"] as const;

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
  /** The list this page's picks land in: a day's plan, or a week's set. */
  picks: Picks,
  form: FormData,
): Promise<Acted | null> {
  const intent = String(form.get("intent") ?? "");
  // An add names an org and no task, so it proves its scope and stops here.
  if (intent === "create") return addTasks(env, request, set, picks, form);
  // Taking an add back is the one delete Tusker has. It names every row that
  // add made, so it stands apart as well. See ADR-0012.
  if (intent === "undo") return undoAdd(env, set, picks, form);
  if (!ACTS.some((act) => act === intent)) return null;

  // Every act names the org the task belongs to, and the row is read back
  // through the one-org scope.
  const { scope, task } = await taskFrom(env, set, form);
  const taskId = task.id;

  // The select of a unified card. The task lands at the bottom of that column
  // in its own org: a task nobody placed sits at the bottom. Moving is the
  // board's act, so a marked task raises the prompt here as it does there.
  if (intent === "move") {
    const moved = await moveAndAsk(env.DB, scope, request, taskId, readStatus(form));
    if (!moved.moved) throw new Response("Not found", { status: 404 });
    return moved.prompt ?? { ok: true };
  }

  if (intent === "plan") {
    // Picking a task is the act of taking it out of the backlog, so a person
    // moves it to To do first. The write says so, not only the page.
    if (task.status !== "todo" && task.status !== "in_progress") {
      throw new Response("Only a To do or In progress task can be picked.", { status: 400 });
    }
    await picks.add([taskId]);
  }

  if (intent === "unplan") await picks.remove([taskId]);

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
