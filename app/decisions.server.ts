/**
 * A decision is a record of what was decided, kept by the org.
 *
 * Finishing a task is when the reasoning is still in a person's head, so that
 * is when Tusker asks. It does not ask on every finish: a person marks the
 * task, and only a marked task raises the prompt. The `decisions` table is the
 * once-only guard, so a skip is a not-now and a task that already holds a
 * decision is never asked again. See ADR-0010.
 *
 * A decision outlives the task that produced it: `task_id` is nullable, and a
 * deleted task leaves the record in place with the link cleared.
 */

import { redirect } from "react-router";

import { ASK, ORG, withPrompt, withoutPrompt } from "./decisions";
import { scopeForSlug, type OrgSet, type Scope } from "./scope.server";
import { moveTask } from "./tasks.server";

/** A task named where it lives: the id, and the org that holds it. */
export type TaskInOrg = { id: string; slug: string };

/** The task a page has the prompt raised on. */
export type Ask = TaskInOrg & { title: string };

/** One line of the log. `task` is null once the task is gone. */
export type Logged = {
  id: string;
  title: string;
  rationale: string;
  created_at: string;
  task: { id: string; title: string } | null;
};

/** The row the log reads, with the task flattened by the join. */
type LogRow = {
  id: string;
  title: string;
  rationale: string;
  created_at: string;
  task_id: string | null;
  task_title: string | null;
};

/**
 * The same page again, with the prompt raised on one task. Every route that
 * finishes a task answers with this.
 */
export function askOn(request: Request, task: TaskInOrg): Response {
  const url = new URL(request.url);
  return redirect(withPrompt(url.pathname, url.search, task));
}

/**
 * The prompt a finished task raises, or null for one that raises none. Every
 * way of finishing a task calls this, so the mark is read in one place.
 */
export async function promptFor(
  db: D1Database,
  scope: Scope,
  request: Request,
  taskId: string,
): Promise<Response | null> {
  const task = await askable(db, scope, taskId);
  return task ? askOn(request, { id: task.id, slug: scope.org.slug }) : null;
}

/**
 * Finishes a task, and answers with the prompt when the task is marked as one
 * that holds a decision. Finishing is the move the board makes, so one act has
 * one meaning wherever a page offers it.
 *
 * Null is a task finished with nothing to ask: an unmarked task, or one that
 * already holds a decision. `moved` is false when the org holds no such row,
 * so the route can answer 404.
 */
export async function finishTask(
  db: D1Database,
  scope: Scope,
  request: Request,
  taskId: string,
): Promise<{ moved: boolean; prompt: Response | null }> {
  const moved = await moveTask(db, scope, { taskId, status: "done", before: null });
  return {
    moved: moved.moved,
    prompt: moved.finished ? await promptFor(db, scope, request, taskId) : null,
  };
}

/**
 * The task Tusker may raise the prompt for: one this org holds, one a person
 * marked, one that is finished, and one no decision answers for yet.
 *
 * Those last three rule the query string out as a way back in. A person cannot
 * type an id into the address bar to raise a prompt that was never due, and a
 * form posted twice writes one decision, not two.
 */
async function askable(
  db: D1Database,
  scope: Scope,
  taskId: string,
): Promise<{ id: string; title: string } | null> {
  const row = await db
    .prepare(
      `SELECT t.id, t.title FROM tasks t
       WHERE t.id = ? AND t.org_id = ? AND t.decides = 1 AND t.status = 'done'
         AND NOT EXISTS (SELECT 1 FROM decisions d WHERE d.task_id = t.id)`,
    )
    .bind(taskId, scope.org.id)
    .first<{ id: string; title: string }>();
  return row ?? null;
}

/** The task this page has the prompt raised on, or null. */
export async function askedOn(
  db: D1Database,
  scope: Scope,
  request: Request,
): Promise<Ask | null> {
  const id = new URL(request.url).searchParams.get(ASK);
  if (!id) return null;

  const task = await askable(db, scope, id);
  return task ? { id: task.id, slug: scope.org.slug, title: task.title } : null;
}

/**
 * The same, for a cross-org page. The query string names the org, and the set
 * turns that name into the one-org scope the read takes.
 */
export async function askedAcross(
  db: D1Database,
  set: OrgSet,
  request: Request,
): Promise<Ask | null> {
  const slug = new URL(request.url).searchParams.get(ORG) ?? "";
  const scope = scopeForSlug(set, slug);
  return scope ? askedOn(db, scope, request) : null;
}

/**
 * Writes the decision one prompt answered, and gives the page back with the
 * prompt gone. An empty title is an error the prompt shows, so the words the
 * person typed are not thrown away.
 */
export async function decide(
  db: D1Database,
  scope: Scope,
  request: Request,
  form: FormData,
): Promise<Response | { error: string }> {
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "A decision needs a title." };

  // The task is read through the scope, and only a task with a prompt still
  // open answers, so no post can hang a second decision on one task.
  const task = await askable(db, scope, String(form.get("id") ?? ""));
  if (!task) throw new Response("Not found", { status: 404 });

  await db
    .prepare(
      `INSERT INTO decisions (id, org_id, task_id, decided_by, title, rationale)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      scope.org.id,
      task.id,
      scope.personId,
      title,
      String(form.get("rationale") ?? "").trim(),
    )
    .run();

  const url = new URL(request.url);
  return redirect(withoutPrompt(url.pathname, url.search));
}

/**
 * One org's decisions, newest first.
 *
 * `rowid` breaks a tie, so two decisions written in the same millisecond still
 * read in the order they were written. The join is left, because the record
 * outlives the task and the log must still show it.
 */
export async function listDecisions(db: D1Database, scope: Scope): Promise<Logged[]> {
  const { results } = await db
    .prepare(
      `SELECT d.id, d.title, d.rationale, d.created_at,
              t.id AS task_id, t.title AS task_title
       FROM decisions d
       LEFT JOIN tasks t ON t.id = d.task_id AND t.org_id = d.org_id
       WHERE d.org_id = ?
       ORDER BY d.created_at DESC, d.rowid DESC`,
    )
    .bind(scope.org.id)
    .all<LogRow>();

  return results.map((row) => ({
    id: row.id,
    title: row.title,
    rationale: row.rationale,
    created_at: row.created_at,
    task: row.task_id ? { id: row.task_id, title: row.task_title! } : null,
  }));
}
